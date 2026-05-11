import ResponsivePage from "@/components/layout/ResponsivePage";
import { AlertDialog, AlertDialogAction, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, Plus, User } from "lucide-react";
import { useMemo, useState } from "react";

type SectorSubRole = "brigade" | "triage" | "poste-control" | "sous-secteur";

type SectorSubAgentRow = {
  id: number;
  username: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  matricule?: string | null;
  role: SectorSubRole;
  region?: string | null;
  departement?: string | null;
  commune?: string | null;
  arrondissement?: string | null;
  sousService?: string | null;
  createdAt?: string | null;
};

export default function SectorSubAgentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const isSectorAgent =
    user?.role === "sub-agent" || (user?.role === "agent" && (user as any)?.type === "secteur");

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [matriculeLookupStatus, setMatriculeLookupStatus] = useState<"idle" | "found" | "not_found" | "error">("idle");
  const [matriculeLookupMessage, setMatriculeLookupMessage] = useState<string>("");
  const [isMatriculeLookupLoading, setIsMatriculeLookupLoading] = useState(false);
  const [agentNotFoundOpen, setAgentNotFoundOpen] = useState(false);

  const [role, setRole] = useState<SectorSubRole>("brigade");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [matricule, setMatricule] = useState("");
  const [grade, setGrade] = useState("");
  const [genre, setGenre] = useState<"" | "H" | "F">("");
  const [arrondissement, setArrondissement] = useState("");
  const [commune, setCommune] = useState("");
  const [locationMode, setLocationMode] = useState<"arrondissement" | "commune">("arrondissement");

  const normalize = (s?: string) =>
    (s || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}+/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const normalizeNom = (raw: string) => String(raw || '').trim().toUpperCase();

  const capitalizeWords = (raw: string, delimiterRegex: RegExp, joinWith: string) => {
    const cleaned = String(raw || '').trim();
    if (!cleaned) return '';
    return cleaned
      .split(delimiterRegex)
      .filter((p) => p !== '')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(joinWith);
  };

  const normalizePrenom = (raw: string) => capitalizeWords(raw, /\s+/, ' ');

  const formatPhoneNumber = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    const truncated = numbers.slice(0, 9);
    if (truncated.length <= 2) return truncated;
    if (truncated.length <= 5) return `${truncated.slice(0, 2)} ${truncated.slice(2)}`;
    if (truncated.length <= 7) return `${truncated.slice(0, 2)} ${truncated.slice(2, 5)} ${truncated.slice(5)}`;
    return `${truncated.slice(0, 2)} ${truncated.slice(2, 5)} ${truncated.slice(5, 7)} ${truncated.slice(7)}`;
  };

  const regionName = String((user as any)?.region || '').trim();
  const departementName = String(((user as any)?.departement || (user as any)?.zone || '')).trim();

  const { data: departements } = useQuery<any[]>({
    queryKey: ["/api/statuses/departements", regionName],
    queryFn: async () => {
      const resp = await apiRequest({
        url: `/api/statuses/departements?regionName=${encodeURIComponent(regionName)}`,
        method: "GET",
      });
      const raw = (resp as any)?.data ?? resp;
      return Array.isArray(raw) ? raw : [];
    },
    enabled: !!user && !!regionName,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const departementId = useMemo(() => {
    const list = Array.isArray(departements) ? departements : [];
    const match = list.find((d: any) => normalize(String(d?.name ?? d?.nom ?? '')) === normalize(departementName));
    return match?.id ? Number(match.id) : undefined;
  }, [departements, departementName]);

  const { data: communesList } = useQuery<any[]>({
    queryKey: ["/api/statuses/communes", departementId],
    queryFn: async () => {
      const resp = await apiRequest({
        url: `/api/statuses/communes?departementId=${departementId}`,
        method: "GET",
      });
      const raw = (resp as any)?.data ?? resp;
      return Array.isArray(raw) ? raw : [];
    },
    enabled: !!user && !!departementId,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const { data: arrondissementsList } = useQuery<any[]>({
    queryKey: ["/api/statuses/arrondissements", departementId],
    queryFn: async () => {
      const resp = await apiRequest({
        url: `/api/statuses/arrondissements?departementId=${departementId}`,
        method: "GET",
      });
      const raw = (resp as any)?.data ?? resp;
      return Array.isArray(raw) ? raw : [];
    },
    enabled: !!user && !!departementId,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const { data: rows, isLoading, refetch } = useQuery<SectorSubAgentRow[]>({
    queryKey: ["/api/users/sector-subagents"],
    queryFn: async () => {
      const resp = await apiRequest({ url: "/api/users/sector-subagents", method: "GET" });
      return (Array.isArray(resp) ? resp : []) as SectorSubAgentRow[];
    },
    enabled: !!user && isSectorAgent,
    placeholderData: keepPreviousData,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 5_000,
  });

  const list = Array.isArray(rows) ? rows : [];

  const selectedLocation = locationMode === 'commune' ? commune.trim() : arrondissement.trim();
  const canCreate =
    !saving &&
    !!username.trim() &&
    !!email.trim() &&
    !!password.trim() &&
    !!selectedLocation;

  const titleLabel = useMemo(() => {
    if (!user) return "Agents";
    const dept = (user as any)?.departement || (user as any)?.zone || "";
    return dept ? `Agents (${dept})` : "Agents";
  }, [user]);

  const clearAutoFilledFields = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setGrade("");
    setGenre("");
  };

  const lookupByMatricule = async () => {
    const m = String(matricule || '').trim();
    if (m.length < 3) return;

    setIsMatriculeLookupLoading(true);
    setMatriculeLookupStatus('idle');
    setMatriculeLookupMessage('');

    try {
      const result = await apiRequest({
        url: `/api/users/agent-profile-by-matricule/${encodeURIComponent(m)}`,
        method: 'GET',
      });

      const r: any = result as any;

      if (!firstName && r?.firstName) setFirstName(normalizePrenom(String(r.firstName)));
      if (!lastName && r?.lastName) setLastName(normalizeNom(String(r.lastName)));
      if (!email && r?.email) setEmail(String(r.email).trim().toLowerCase());
      if (!phone && r?.phone) setPhone(formatPhoneNumber(String(r.phone)));
      if (!grade && r?.grade) setGrade(String(r.grade));
      if (!genre && (r?.genre === 'H' || r?.genre === 'F')) setGenre(r.genre);

      setMatriculeLookupStatus('found');
      setMatriculeLookupMessage('Agent trouvé');
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 404) {
        setMatriculeLookupStatus('not_found');
        setMatriculeLookupMessage('');
        setAgentNotFoundOpen(true);
      } else {
        setMatriculeLookupStatus('error');
        setMatriculeLookupMessage('Erreur lors de la recherche');
      }
    } finally {
      setIsMatriculeLookupLoading(false);
    }
  };

  const resetForm = () => {
    setRole("brigade");
    setUsername("");
    setEmail("");
    setPassword("");
    setFirstName("");
    setLastName("");
    setPhone("");
    setMatricule("");
    setMatriculeLookupStatus("idle");
    setMatriculeLookupMessage("");
    setAgentNotFoundOpen(false);
    setGrade("");
    setGenre("");
    setArrondissement("");
    setCommune("");
    setLocationMode("arrondissement");
  };

  const handleCreate = async () => {
    const loc = locationMode === 'commune' ? commune.trim() : arrondissement.trim();
    if (!loc) {
      toast({
        variant: "destructive",
        title: "Champs requis",
        description: `Veuillez sélectionner ${locationMode === 'commune' ? 'une commune' : 'un arrondissement'}.`,
      });
      return;
    }

    if (!username.trim() || !email.trim() || !password.trim()) {
      toast({
        variant: "destructive",
        title: "Champs requis",
        description: "Username, email et mot de passe sont obligatoires.",
      });
      return;
    }

    setSaving(true);
    try {
      const sousService = role === "poste-control" ? "Poste de contrôle" : role === "triage" ? "Triage" : role === "sous-secteur" ? "Sous-Secteur" : "Brigade";
      await apiRequest({
        url: "/api/users/create-agent",
        method: "POST",
        data: {
          role,
          username: username.trim(),
          email: email.trim(),
          password,
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          phone: phone.trim() || undefined,
          matricule: matricule.trim() || undefined,
          grade: grade.trim() || undefined,
          genre: genre || undefined,
          arrondissement: locationMode === 'arrondissement' ? (arrondissement.trim() || undefined) : undefined,
          commune: locationMode === 'commune' ? (commune.trim() || undefined) : undefined,
          sousService,
          serviceLocation: sousService,
          domain: "CHASSE",
        },
      });

      toast({
        title: "Agent créé",
        description: "Le compte a été créé avec succès.",
      });
      setOpen(false);
      resetForm();
      refetch();
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: e?.message || "Impossible de créer l'agent.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!user || !isSectorAgent) {
    return (
      <ResponsivePage>
        <Card>
          <CardHeader>
            <CardTitle>Accès refusé</CardTitle>
          </CardHeader>
          <CardContent>Cette page est réservée aux agents secteur.</CardContent>
        </Card>
      </ResponsivePage>
    );
  }

  return (
    <ResponsivePage>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{titleLabel}</h1>
            <p className="text-sm text-muted-foreground">
              Gestion des agents Brigade / Triage / Poste de contrôle rattachés à votre département.
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Ajouter
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Liste des agents</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Chargement…</div>
            ) : list.length === 0 ? (
              <div className="text-sm text-muted-foreground">Aucun agent rattaché pour le moment.</div>
            ) : (
              <div className="w-full overflow-x-auto rounded-md border">
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Username</TableHead>
                      <TableHead>Nom</TableHead>
                      <TableHead>Rôle</TableHead>
                      <TableHead>Arrondissement</TableHead>
                      <TableHead>Commune</TableHead>
                      <TableHead>Téléphone</TableHead>
                      <TableHead>Email</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.username}</TableCell>
                        <TableCell>{`${r.firstName || ""} ${r.lastName || ""}`.trim() || "-"}</TableCell>
                        <TableCell>{r.role}</TableCell>
                        <TableCell>{r.arrondissement || "-"}</TableCell>
                        <TableCell>{r.commune || "-"}</TableCell>
                        <TableCell>{r.phone || "-"}</TableCell>
                        <TableCell>{r.email}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={open} onOpenChange={(v) => {
          setOpen(v);
          if (!v) resetForm();
        }}>
          <AlertDialog open={agentNotFoundOpen} onOpenChange={(v) => {
            setAgentNotFoundOpen(v);
            if (!v) {
              setMatricule('');
              setMatriculeLookupStatus('idle');
              setMatriculeLookupMessage('');
            }
          }}>
            <AlertDialogPrimitive.Portal>
              <AlertDialogPrimitive.Overlay className="fixed inset-0 z-[10020] bg-transparent" />
              <AlertDialogPrimitive.Content className="fixed left-[50%] top-[50%] z-[10030] grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 rounded-2xl border border-border bg-background p-5 shadow-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-xl font-bold text-center">Agent introuvable</AlertDialogTitle>
                  <div className="flex items-center justify-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-600">
                      <User className="h-4 w-4 text-white" />
                    </div>
                    <AlertDialogDescription className="text-foreground/80">L'utilisateur demandé est introuvable.</AlertDialogDescription>
                  </div>
                </AlertDialogHeader>
                <div className="flex justify-center">
                  <AlertDialogAction>Fermer</AlertDialogAction>
                </div>
              </AlertDialogPrimitive.Content>
            </AlertDialogPrimitive.Portal>
          </AlertDialog>

          <DialogContent className="sm:max-w-[560px]"
            onInteractOutside={(e) => {
              if (agentNotFoundOpen) e.preventDefault();
            }}
            onEscapeKeyDown={(e) => {
              if (agentNotFoundOpen) e.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogTitle>Ajouter un agent</DialogTitle>
              <DialogDescription>
                Créer un agent Brigade / Triage / Poste de contrôle / Sous-Secteur rattaché à votre département.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="matricule">Matricule</Label>
                <div className="flex gap-2">
                  <Input
                    id="matricule"
                    placeholder="Matricule (min. 3 caractères)"
                    value={matricule}
                    onChange={(e) => {
                      setMatricule(e.target.value);
                      setMatriculeLookupStatus('idle');
                      setMatriculeLookupMessage('');
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (matriculeLookupStatus === 'found') {
                        clearAutoFilledFields();
                        setMatricule('');
                        setMatriculeLookupStatus('idle');
                        setMatriculeLookupMessage('');
                        return;
                      }
                      lookupByMatricule();
                    }}
                    disabled={isMatriculeLookupLoading || String(matricule || '').trim().length < 3}
                  >
                    {isMatriculeLookupLoading
                      ? 'Recherche…'
                      : matriculeLookupStatus === 'found'
                        ? 'Nouvelle recherche'
                        : 'Rechercher'}
                  </Button>
                </div>
                {!!matriculeLookupMessage && (
                  <p
                    className={
                      matriculeLookupStatus === 'found'
                        ? 'text-xs text-green-600'
                        : matriculeLookupStatus === 'not_found'
                          ? 'text-xs text-muted-foreground'
                          : 'text-xs text-red-600'
                    }
                  >
                    {matriculeLookupMessage}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Type *</Label>
                <Select value={role} onValueChange={(v) => setRole(v as SectorSubRole)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="brigade">Brigade</SelectItem>
                    <SelectItem value="triage">Triage</SelectItem>
                    <SelectItem value="poste-control">Poste de contrôle</SelectItem>
                    <SelectItem value="sous-secteur">Sous-Secteur</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Choisir par *</Label>
                <Select
                  value={locationMode}
                  onValueChange={(v) => {
                    const mode = v as "arrondissement" | "commune";
                    setLocationMode(mode);
                    setArrondissement('');
                    setCommune('');
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="arrondissement">Arrondissement</SelectItem>
                    <SelectItem value="commune">Commune</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="firstName">Prénom</Label>
                <Input
                  id="firstName"
                  placeholder="Prénom"
                  value={firstName}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[\p{N}\p{P}\p{S}_]+/gu, "");
                    setFirstName(cleaned);
                  }}
                  onBlur={(e) => setFirstName(normalizePrenom(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName">Nom</Label>
                <Input
                  id="lastName"
                  placeholder="NOM"
                  value={lastName}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[\p{N}\p{P}\p{S}_]+/gu, "");
                    setLastName(cleaned);
                  }}
                  onBlur={(e) => setLastName(normalizeNom(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  name="sector-subagent-username"
                  placeholder="Nom d'utilisateur"
                  autoComplete="off"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ""))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe *</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="sector-subagent-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Téléphone</Label>
                <Input
                  id="phone"
                  placeholder="XX XXX XX XX"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  name="sector-subagent-email"
                  type="email"
                  placeholder="nom@domaine.com"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={(e) => setEmail(String(e.target.value || '').trim().toLowerCase())}
                />
              </div>

              <div className="space-y-2">
                <Label>Genre</Label>
                <Select value={genre || "none"} onValueChange={(v) => setGenre(v === "none" ? "" : (v as any))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    <SelectItem value="H">H</SelectItem>
                    <SelectItem value="F">F</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="grade">Grade</Label>
                <Input
                  id="grade"
                  placeholder="Grade"
                  value={grade}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[\p{N}\p{P}\p{S}_]+/gu, "");
                    setGrade(cleaned);
                  }}
                />
              </div>

              {locationMode === 'arrondissement' ? (
                <div className="space-y-2">
                  <Label>Arrondissement *</Label>
                  <Select
                    value={arrondissement}
                    onValueChange={(v) => setArrondissement(v)}
                    disabled={!departementId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={!departementId ? 'Département non trouvé' : 'Sélectionner un arrondissement'} />
                    </SelectTrigger>
                    <SelectContent>
                      {(Array.isArray(arrondissementsList) ? arrondissementsList : []).map((a: any) => {
                        const name = String(a?.name ?? a?.nom ?? '').trim();
                        const key = String(a?.id ?? name);
                        return (
                          <SelectItem
                            key={key}
                            value={name}
                            className="cursor-pointer data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                          >
                            {name}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Commune *</Label>
                  <Select
                    value={commune}
                    onValueChange={(v) => setCommune(v)}
                    disabled={!departementId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={!departementId ? 'Département non trouvé' : 'Sélectionner une commune'} />
                    </SelectTrigger>
                    <SelectContent>
                      {(Array.isArray(communesList) ? communesList : []).map((c: any) => {
                        const name = String(c?.name ?? c?.nom ?? '').trim();
                        const key = String(c?.id ?? name);
                        return (
                          <SelectItem
                            key={key}
                            value={name}
                            className="cursor-pointer data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                          >
                            {name}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Annuler
              </Button>
              <Button onClick={handleCreate} disabled={!canCreate}>
                {saving ? "Création…" : "Créer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ResponsivePage>
  );
}
