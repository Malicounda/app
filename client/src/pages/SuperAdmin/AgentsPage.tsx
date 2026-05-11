import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { usePagination } from "@/hooks/usePagination";
import { departmentsByRegion, regionEnum } from "@/lib/constants";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Flag, Info, Pencil, Trash2, User } from "lucide-react";
import { useMemo, useState } from "react";

type AgentRow = {
  idAgent: number | null;
  userId: number;
  matriculeSol: string;
  nom: string | null;
  prenom: string | null;
  grade: string | null;
  genre?: string | null;
  roleMetierId: number | null;
  roleMetierLabel: string | null;
  contact: any;
  createdAt: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  region: string | null;
  departement: string | null;
  userRole: string | null;
  adminDomainName?: string | null;
};

type RoleMetier = {
  id: number;
  code: string;
  labelFr: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
};

function feminizeGrade(raw: string) {
  const v = String(raw || "").trim();
  if (!v) return v;

  const map: Record<string, string> = {
    "Lieutenant": "Lieutenante",
    "Sous-Lieutenant": "Sous-Lieutenante",
    "Capitaine": "Capitaine",
    "Commandant": "Commandante",
    "Colonel": "Colonelle",
    "Lieutenant Colonel": "Lieutenante-Colonelle",
    "Lieutenant-colonel": "Lieutenante-Colonelle",
    "General": "Générale",
    "Général": "Générale",
    "Sous-Lieutenantant": "Sous-Lieutenante",
  };

  return map[v] || v;
}

function normalizeNom(raw: string) {
  return String(raw || "").trim().toUpperCase();
}

function capitalizeWords(raw: string, delimiterRegex: RegExp, joinWith: string) {
  const cleaned = String(raw || "").trim();
  if (!cleaned) return "";
  return cleaned
    .split(delimiterRegex)
    .filter((p) => p !== "")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(joinWith);
}

function normalizePrenom(raw: string) {
  // Chaque mot commence par une majuscule, séparé par espaces
  return capitalizeWords(raw, /\s+/, " ");
}

function formatPhoneNumber(value: string) {
  const numbers = value.replace(/\D/g, "");
  const truncated = numbers.slice(0, 9);
  if (truncated.length <= 2) return truncated;
  if (truncated.length <= 5) return `${truncated.slice(0, 2)} ${truncated.slice(2)}`;
  if (truncated.length <= 7) return `${truncated.slice(0, 2)} ${truncated.slice(2, 5)} ${truncated.slice(5)}`;
  return `${truncated.slice(0, 2)} ${truncated.slice(2, 5)} ${truncated.slice(5, 7)} ${truncated.slice(7)}`;
}

function normalizeGrade(raw: string) {
  // Remplacer espaces par '_' et chaque segment commence par une majuscule
  const cleaned = String(raw || "").trim().replace(/\s+/g, "_");
  return capitalizeWords(cleaned, /_+/, "_");
}

export default function SuperAdminAgentsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/agents"],
    queryFn: () => apiRequest<AgentRow[]>({ url: "/api/agents", method: "GET" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (idAgent: number) => {
      return apiRequest<any>({
        url: `/api/agents/${idAgent}`,
        method: "DELETE",
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agent supprimé" });
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e?.message || "Suppression impossible", variant: "destructive" });
    },
  });

  const { data: rolesMetierData } = useQuery({
    queryKey: ["/api/roles-metier"],
    queryFn: () => apiRequest<RoleMetier[]>({ url: "/api/roles-metier", method: "GET" }),
  });

  const rows = useMemo(() => {
    const list = Array.isArray(data) ? data : [];

    // Déduplication par userId: on garde la ligne la plus complète (celle qui a idAgent)
    const byUserId = new Map<number, any>();
    for (const r of list as any[]) {
      const uid = Number(r?.userId);
      if (!Number.isFinite(uid)) continue;
      const existing = byUserId.get(uid);
      if (!existing) {
        byUserId.set(uid, r);
        continue;
      }

      const existingHasAgent = !!existing?.idAgent;
      const currentHasAgent = !!r?.idAgent;
      if (!existingHasAgent && currentHasAgent) {
        byUserId.set(uid, r);
        continue;
      }
    }

    return Array.from(byUserId.values());
  }, [data]);
  const rolesMetier = useMemo(
    () => (Array.isArray(rolesMetierData) ? rolesMetierData : []).filter((r) => r.isActive),
    [rolesMetierData]
  );

  const [searchMatricule, setSearchMatricule] = useState("");

  const filteredRows = useMemo(() => {
    const q = searchMatricule.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => String(r.matriculeSol || "").toLowerCase().includes(q));
  }, [rows, searchMatricule]);

  const adminRows = useMemo(
    () => filteredRows.filter((r: any) => String(r?.userRole || "").toLowerCase() === "admin"),
    [filteredRows]
  );
  const otherRows = useMemo(
    () => filteredRows.filter((r: any) => String(r?.userRole || "").toLowerCase() !== "admin"),
    [filteredRows]
  );

  const adminPagination = usePagination(adminRows, { pageSize: 10 });
  const otherPagination = usePagination(otherRows, { pageSize: 10 });

  const enableListScroll = filteredRows.length > 12;

  const [infoRow, setInfoRow] = useState<AgentRow | null>(null);

  const [editing, setEditing] = useState<AgentRow | null>(null);
  const [matriculeSol, setMatriculeSol] = useState("");
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [grade, setGrade] = useState("");
  const [genre, setGenre] = useState<string>("");
  const [roleMetierId, setRoleMetierId] = useState<string>("");
  const [contactTelephone, setContactTelephone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [enablePasswordChange, setEnablePasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [editUnlocked, setEditUnlocked] = useState(false);
  const [roleMetierUnlocked, setRoleMetierUnlocked] = useState(false);
  const [matriculeUnlocked, setMatriculeUnlocked] = useState(false);
  const [gradeUnlocked, setGradeUnlocked] = useState(false);
  const [genreUnlocked, setGenreUnlocked] = useState(false);
  const [prenomUnlocked, setPrenomUnlocked] = useState(false);
  const [nomUnlocked, setNomUnlocked] = useState(false);
  const [contactTelephoneUnlocked, setContactTelephoneUnlocked] = useState(false);
  const [contactEmailUnlocked, setContactEmailUnlocked] = useState(false);
  const [editRegion, setEditRegion] = useState("");
  const [editDepartement, setEditDepartement] = useState("");
  const [regionUnlocked, setRegionUnlocked] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [userMatricule, setUserMatricule] = useState("");
  const [newNom, setNewNom] = useState("");
  const [newPrenom, setNewPrenom] = useState("");
  const [newGrade, setNewGrade] = useState("");
  const [newGenre, setNewGenre] = useState("");
  const [newRoleMetierId, setNewRoleMetierId] = useState("");
  const [newRoleMetierUnlocked, setNewRoleMetierUnlocked] = useState(false);
  const [newContactTelephone, setNewContactTelephone] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newRegion, setNewRegion] = useState("");
  const [newDepartement, setNewDepartement] = useState("");

  const handleAddOpenChange = (open: boolean) => {
    setAddOpen(open);
    if (!open) {
      setNewRoleMetierUnlocked(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const m = userMatricule.trim();
      if (!m) throw new Error("Matricule utilisateur requis");

      const mDigits = m.replace(/\s+/g, "");
      if (/^\d{9}$/.test(mDigits)) {
        throw new Error("Matricule invalide (ne doit pas être un numéro de téléphone)");
      }

      const email = newContactEmail.trim().toLowerCase();
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!emailOk) {
        throw new Error("Email invalide");
      }

      const nNom = normalizeNom(newNom);
      const nPrenom = normalizePrenom(newPrenom);
      const nGrade = normalizeGrade(newGrade);

      const lettersOnly = /^[\p{L} ]+$/u;
      if (nNom && !lettersOnly.test(nNom)) {
        throw new Error("Nom invalide (lettres uniquement)");
      }
      if (nPrenom && !lettersOnly.test(nPrenom)) {
        throw new Error("Prénom invalide (lettres uniquement)");
      }
      if (nGrade && !lettersOnly.test(nGrade)) {
        throw new Error("Grade invalide (lettres uniquement)");
      }

      return apiRequest<any>({
        url: "/api/agents",
        method: "POST",
        data: {
          userMatricule: m,
          email,
          phone: newContactTelephone.trim() || null,
          firstName: nPrenom || null,
          lastName: nNom || null,
          nom: nNom || null,
          prenom: nPrenom || null,
          grade: nGrade || null,
          genre: newGenre && newGenre !== "none" ? newGenre : null,
          roleMetierId: newRoleMetierId && newRoleMetierId !== "none" ? Number(newRoleMetierId) : null,
          region: newRegion || null,
          departement: newDepartement || null,
          contact: {
            telephone: newContactTelephone.trim() || null,
            email: email || null,
          },
        },
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agent ajouté" });
      setAddOpen(false);
      setUserMatricule("");
      setNewNom("");
      setNewPrenom("");
      setNewGrade("");
      setNewGenre("");
      setNewRoleMetierId("");
      setNewRoleMetierUnlocked(false);
      setNewContactTelephone("");
      setNewContactEmail("");
      setNewRegion("");
      setNewDepartement("");
    },
    onError: (e: any) => {
      const msg = String(e?.message || "Ajout impossible");
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    },
  });

  const openEdit = (row: AgentRow) => {
    setEditing(row);
    setEditUnlocked(false);
    setRoleMetierUnlocked(false);
    setMatriculeUnlocked(false);
    setGradeUnlocked(false);
    setGenreUnlocked(false);
    setPrenomUnlocked(false);
    setNomUnlocked(false);
    setContactTelephoneUnlocked(false);
    setContactEmailUnlocked(false);
    setMatriculeSol(row.matriculeSol || "");
    setNom(row.nom || "");
    setPrenom(row.prenom || "");
    setGrade(row.grade || "");
    setGenre(row.genre ? String(row.genre) : "");
    setRoleMetierId(row.roleMetierId ? String(row.roleMetierId) : "");

    setEnablePasswordChange(false);
    setNewPassword("");
    setShowPassword(false);

    const c = row.contact || {};
    setContactTelephone(String(c?.telephone || c?.phone || ""));
    setContactEmail(String(c?.email || ""));
    setEditRegion(row.region || "");
    setEditDepartement(row.departement || "");
    setRegionUnlocked(false);
  };

  const clearEditFields = () => {
    // Conserver rôle métier (roleMetierId) comme demandé
    setEditUnlocked(true);
    setMatriculeUnlocked(false);
    setGradeUnlocked(false);
    setGenreUnlocked(false);
    setPrenomUnlocked(false);
    setNomUnlocked(false);
    setContactTelephoneUnlocked(false);
    setContactEmailUnlocked(false);
    setMatriculeSol("");
    setGrade("");
    setGenre("");
    setPrenom("");
    setNom("");
    setContactTelephone("");
    setContactEmail("");
    setEditRegion("");
    setEditDepartement("");
    setRegionUnlocked(false);
    // Ne pas impacter la section mot de passe (gérée indépendamment)
  };

  const updateMutation = useMutation({
    mutationFn: async (payload: { idAgent: number; data: any }) => {
      const byUserId = payload?.data?.__byUserId;
      if (byUserId) {
        const data = { ...(payload.data || {}) };
        delete data.__byUserId;
        return apiRequest<AgentRow>({
          url: `/api/agents/by-user/${Number(byUserId)}`,
          method: "PUT",
          data,
        });
      }

      return apiRequest<AgentRow>({
        url: `/api/agents/${payload.idAgent}`,
        method: "PUT",
        data: payload.data,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agent mis à jour" });
      setEditing(null);
    },
    onError: (e: any) => {
      toast({
        title: "Erreur",
        description: e?.message || "Mise à jour impossible",
        variant: "destructive",
      });
    },
  });

  const save = () => {
    if (!editing) return;

    if (enablePasswordChange) {
      const pwd = newPassword.trim();
      if (pwd && pwd.length < 6) {
        toast({
          title: "Erreur",
          description: "Le mot de passe doit contenir au moins 6 caractères.",
          variant: "destructive",
        });
        return;
      }
    }

    const contact = {
      telephone: contactTelephone || null,
      email: contactEmail || null,
    };

    const nomNormalized = normalizeNom(nom);
    const prenomNormalized = normalizePrenom(prenom);
    const gradeNormalized = normalizeGrade(grade);

    const normalizedGrade = genre === "F" ? feminizeGrade(gradeNormalized) : gradeNormalized;
    if (genre === "F" && normalizedGrade !== grade) {
      setGrade(normalizedGrade);
    }

    if (nomNormalized !== nom) setNom(nomNormalized);
    if (prenomNormalized !== prenom) setPrenom(prenomNormalized);
    if (gradeNormalized !== grade) setGrade(gradeNormalized);

    const payload = {
      matriculeSol,
      prenom: prenomNormalized || null,
      nom: nomNormalized || null,
      grade: normalizedGrade || null,
      genre: genre ? genre : null,
      roleMetierId: roleMetierId ? Number(roleMetierId) : null,
      contact,
      password: enablePasswordChange && newPassword.trim() ? newPassword.trim() : undefined,
    };

    // Update region/departement on users table if changed
    if (regionUnlocked && editing.userId) {
      const userPayload: Record<string, any> = {};
      if (editRegion !== (editing.region || "")) userPayload.region = editRegion || null;
      if (editDepartement !== (editing.departement || "")) userPayload.departement = editDepartement || null;
      if (Object.keys(userPayload).length > 0) {
        apiRequest({ url: `/api/users/${editing.userId}`, method: "PUT", data: userPayload }).catch((e: any) => {
          console.warn("Failed to update user region/departement:", e);
        });
      }
    }

    if (editing.idAgent) {
      updateMutation.mutate({ idAgent: editing.idAgent, data: payload });
      return;
    }

    updateMutation.mutate({ idAgent: 0, data: { ...payload, __byUserId: editing.userId } });
  };

  return (
    <main className="page-frame-container">
      <div className="page-frame-inner container mx-auto px-4 py-4 space-y-4 max-w-6xl">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">Contrôle des Agents</h2>
          <div className="text-sm text-muted-foreground">Administration centrale - Gestion des comptes (agents)</div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Liste des agents ({filteredRows.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
              <div className="w-full md:max-w-sm">
                <Input
                  placeholder="Rechercher par matricule"
                  value={searchMatricule}
                  onChange={(e) => setSearchMatricule(e.target.value)}
                />
              </div>
              <Button onClick={() => setAddOpen(true)}>
                Ajouter un Agent
              </Button>
            </div>

            {isLoading ? (
              <div className="py-6">Chargement...</div>
            ) : (
              <>
                {(adminPagination.pageCount > 1 || otherPagination.pageCount > 1) && (
                  <div className="mb-4 flex flex-col gap-3">
                    {adminPagination.pageCount > 1 && (
                      <div className="flex items-center justify-center gap-4">
                        <Button variant="outline" onClick={() => adminPagination.prevPage()} disabled={adminPagination.page <= 1}>
                          Précédent
                        </Button>
                        <div className="text-sm text-muted-foreground">
                          Admins: Page {adminPagination.page} / {adminPagination.pageCount}
                        </div>
                        <Button variant="outline" onClick={() => adminPagination.nextPage()} disabled={adminPagination.page >= adminPagination.pageCount}>
                          Suivant
                        </Button>
                      </div>
                    )}
                    {otherPagination.pageCount > 1 && (
                      <div className="flex items-center justify-center gap-4">
                        <Button variant="outline" onClick={() => otherPagination.prevPage()} disabled={otherPagination.page <= 1}>
                          Précédent
                        </Button>
                        <div className="text-sm text-muted-foreground">
                          Autres: Page {otherPagination.page} / {otherPagination.pageCount}
                        </div>
                        <Button variant="outline" onClick={() => otherPagination.nextPage()} disabled={otherPagination.page >= otherPagination.pageCount}>
                          Suivant
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                <div className="w-full overflow-x-auto border rounded-md">
                  <div className={enableListScroll ? "max-h-[520px] overflow-y-auto" : ""}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead></TableHead>
                          <TableHead>Matricule</TableHead>
                          <TableHead>Prénom</TableHead>
                          <TableHead>Nom</TableHead>
                          <TableHead className="text-center">Grade</TableHead>
                          <TableHead>Rôle métier</TableHead>
                          <TableHead className="text-center">Genre</TableHead>
                          <TableHead>National/Région</TableHead>
                          <TableHead>Département</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {adminPagination.currentItems.map((r: any) => (
                          <TableRow key={r.idAgent ?? `u-${r.userId}`}>
                            <TableCell>
                              <User className="h-4 w-4 text-green-600" />
                            </TableCell>
                            <TableCell>{r.matriculeSol}</TableCell>
                            <TableCell>{r.prenom || "-"}</TableCell>
                            <TableCell>{r.nom || "-"}</TableCell>
                            <TableCell className="text-center">{r.grade || "-"}</TableCell>
                            <TableCell>{r.roleMetierLabel || (r.roleMetierId ? String(r.roleMetierId) : "-")}</TableCell>
                            <TableCell className="text-center">{r.genre || "-"}</TableCell>
                            <TableCell>{r.region || "-"}</TableCell>
                            <TableCell>{r.departement || "-"}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                                  Modifier
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="text-sky-500 hover:text-sky-600"
                                  onClick={() => setInfoRow(r)}
                                >
                                  <Info className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}

                    {adminPagination.currentItems.length > 0 && otherPagination.currentItems.length > 0 && (
                      <TableRow>
                        <TableCell colSpan={10} className="bg-muted/50 p-0">
                          <div className="h-2" />
                        </TableCell>
                      </TableRow>
                    )}

                        {otherPagination.currentItems.map((r: any) => (
                          <TableRow key={r.idAgent ?? `u-${r.userId}`}>
                            <TableCell>
                              <User className="h-4 w-4 text-green-600" />
                            </TableCell>
                            <TableCell>{r.matriculeSol}</TableCell>
                            <TableCell>{r.prenom || "-"}</TableCell>
                            <TableCell>{r.nom || "-"}</TableCell>
                            <TableCell className="text-center">{r.grade || "-"}</TableCell>
                            <TableCell>{r.roleMetierLabel || (r.roleMetierId ? String(r.roleMetierId) : "-")}</TableCell>
                            <TableCell className="text-center">{r.genre || "-"}</TableCell>
                            <TableCell>{r.region || "-"}</TableCell>
                            <TableCell>{r.departement || "-"}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                                  Modifier
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button size="sm" variant="outline" disabled={deleteMutation.isPending || !r.idAgent}>
                                      <Trash2 className="h-4 w-4 text-red-600" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Voulez-vous vraiment supprimer l'agent "{r.matriculeSol}" ?
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => r.idAgent && deleteMutation.mutate(r.idAgent)}>
                                        Supprimer
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </>
            )}

            {!isLoading && (
              <div className="mt-4 flex flex-col gap-4">
                {adminPagination.pageCount > 1 && (
                  <div className="flex items-center justify-center gap-4">
                    <Button variant="outline" onClick={() => adminPagination.prevPage()} disabled={adminPagination.page <= 1}>
                      Précédent
                    </Button>
                    <div className="text-sm text-muted-foreground">
                      Admins: Page {adminPagination.page} / {adminPagination.pageCount}
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => adminPagination.nextPage()}
                      disabled={adminPagination.page >= adminPagination.pageCount}
                    >
                      Suivant
                    </Button>
                  </div>
                )}

                {otherPagination.pageCount > 1 && (
                  <div className="flex items-center justify-center gap-4">
                    <Button variant="outline" onClick={() => otherPagination.prevPage()} disabled={otherPagination.page <= 1}>
                      Précédent
                    </Button>
                    <div className="text-sm text-muted-foreground">
                      Autres: Page {otherPagination.page} / {otherPagination.pageCount}
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => otherPagination.nextPage()}
                      disabled={otherPagination.page >= otherPagination.pageCount}
                    >
                      Suivant
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!infoRow} onOpenChange={(open) => !open && setInfoRow(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Information</DialogTitle>
            </DialogHeader>
            <div className="text-sm">
              Cet utilisateur est l'administrateur du domaine "{infoRow?.adminDomainName || "-"}".
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInfoRow(null)}>
                Fermer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <div className="flex items-center justify-center gap-4">
                <DialogTitle>Modifier un agent</DialogTitle>
                <Button type="button" variant="outline" onClick={clearEditFields}>
                  Effacer
                </Button>
              </div>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Matricule</Label>
                <div className="relative">
                  <Input
                    value={matriculeSol}
                    onChange={(e) => setMatriculeSol(e.target.value)}
                    disabled={!editUnlocked && !matriculeUnlocked}
                    className={!editUnlocked && !matriculeUnlocked ? "bg-muted text-muted-foreground pr-10" : "pr-10"}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={() => setMatriculeUnlocked(true)}
                    disabled={editUnlocked || matriculeUnlocked}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Grade</Label>
                <div className="relative">
                  <Input
                    value={grade}
                    onChange={(e) => setGrade(e.target.value.replace(/[\p{N}\p{P}\p{S}_]+/gu, ""))}
                    onBlur={() => setGrade((v) => normalizeGrade(v))}
                    disabled={!editUnlocked && !gradeUnlocked}
                    className={!editUnlocked && !gradeUnlocked ? "bg-muted text-muted-foreground pr-10" : "pr-10"}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={() => setGradeUnlocked(true)}
                    disabled={editUnlocked || gradeUnlocked}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Genre</Label>
                <Select
                  value={genre ? genre : "none"}
                  onValueChange={(v) => setGenre(v === "none" ? "" : v)}
                  disabled={!editUnlocked && !genreUnlocked}
                >
                  <div className="relative">
                    <SelectTrigger className={!editUnlocked && !genreUnlocked ? "bg-muted text-muted-foreground pr-10" : "pr-10"}>
                      <SelectValue placeholder="Aucun" />
                    </SelectTrigger>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => setGenreUnlocked(true)}
                      disabled={editUnlocked || genreUnlocked}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    <SelectItem value="H">H</SelectItem>
                    <SelectItem value="F">F</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Prénom</Label>
                <div className="relative">
                  <Input
                    value={prenom}
                    onChange={(e) => setPrenom(e.target.value.replace(/[\p{N}\p{P}\p{S}_]+/gu, ""))}
                    onBlur={() => setPrenom((v) => normalizePrenom(v))}
                    disabled={!editUnlocked && !prenomUnlocked}
                    className={!editUnlocked && !prenomUnlocked ? "bg-muted text-muted-foreground pr-10" : "pr-10"}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={() => setPrenomUnlocked(true)}
                    disabled={editUnlocked || prenomUnlocked}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Nom</Label>
                <div className="relative">
                  <Input
                    value={nom}
                    onChange={(e) => setNom(e.target.value.replace(/[\p{N}\p{P}\p{S}_]+/gu, ""))}
                    onBlur={() => setNom((v) => normalizeNom(v))}
                    disabled={!editUnlocked && !nomUnlocked}
                    className={!editUnlocked && !nomUnlocked ? "bg-muted text-muted-foreground pr-10" : "pr-10"}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={() => setNomUnlocked(true)}
                    disabled={editUnlocked || nomUnlocked}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Rôle métier</Label>
                <Select
                  value={roleMetierId ? roleMetierId : "none"}
                  onValueChange={(v) => setRoleMetierId(v === "none" ? "" : v)}
                  disabled={!roleMetierUnlocked}
                >
                  <div className="relative">
                    <SelectTrigger
                      className={!roleMetierUnlocked ? "bg-muted text-muted-foreground pr-10" : "pr-10"}
                    >
                      <SelectValue placeholder="Aucun" />
                    </SelectTrigger>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => setRoleMetierUnlocked(true)}
                      disabled={roleMetierUnlocked}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    {rolesMetier.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.labelFr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Téléphone (contact)</Label>
                <div className="relative">
                  <Input
                    value={contactTelephone}
                    placeholder="XX XXX XX XX"
                    onChange={(e) => setContactTelephone(formatPhoneNumber(e.target.value))}
                    disabled={!editUnlocked && !contactTelephoneUnlocked}
                    className={!editUnlocked && !contactTelephoneUnlocked ? "bg-muted text-muted-foreground pr-10" : "pr-10"}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={() => setContactTelephoneUnlocked(true)}
                    disabled={editUnlocked || contactTelephoneUnlocked}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email (contact)</Label>
                <div className="relative">
                  <Input
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    disabled={!editUnlocked && !contactEmailUnlocked}
                    className={!editUnlocked && !contactEmailUnlocked ? "bg-muted text-muted-foreground pr-10" : "pr-10"}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={() => setContactEmailUnlocked(true)}
                    disabled={editUnlocked || contactEmailUnlocked}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Région / Niveau</Label>
                <div className="relative">
                  <Select
                    value={editRegion || "none"}
                    onValueChange={(v) => { setEditRegion(v === "none" ? "" : v); setEditDepartement(""); setRegionUnlocked(true); }}
                    disabled={!editUnlocked && !regionUnlocked}
                  >
                    <div className="relative">
                      <SelectTrigger className={!editUnlocked && !regionUnlocked ? "bg-muted text-muted-foreground pr-10" : "pr-10"}>
                        <SelectValue placeholder="Sélectionner une région" />
                      </SelectTrigger>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2"
                        onClick={() => setRegionUnlocked(true)}
                        disabled={editUnlocked || regionUnlocked}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                    <SelectContent>
                      <SelectItem value="none">Aucune</SelectItem>
                      <SelectItem value="national">NATIONAL</SelectItem>
                      {regionEnum.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {editRegion && (departmentsByRegion as any)[editRegion] && (
                <div className="space-y-2">
                  <Label>Département / Secteur</Label>
                  <Select
                    value={editDepartement || "none"}
                    onValueChange={(v) => setEditDepartement(v === "none" ? "" : v)}
                    disabled={!editUnlocked && !regionUnlocked}
                  >
                    <SelectTrigger className={!editUnlocked && !regionUnlocked ? "bg-muted text-muted-foreground" : ""}>
                      <SelectValue placeholder="Sélectionner un département" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucun</SelectItem>
                      {(departmentsByRegion as any)[editRegion].map((d: any) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="md:col-span-2 flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Flag className="h-4 w-4" />
                  <Label>Modifier le mot de passe</Label>
                </div>
                <Switch
                  checked={enablePasswordChange}
                  onCheckedChange={(checked) => {
                    setEnablePasswordChange(checked);
                    if (checked) setNewPassword("");
                  }}
                />
              </div>
              {enablePasswordChange && (
                <div className="space-y-2">
                  <Label>Nouveau mot de passe</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      name="agent_new_password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {newPassword.trim().length < 6 && (
                    <div className="text-xs text-destructive">
                      Saisir au moins 6 caractères
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Annuler
              </Button>
              <Button
                onClick={save}
                disabled={
                  updateMutation.isPending ||
                  (!editUnlocked &&
                    !matriculeUnlocked &&
                    !gradeUnlocked &&
                    !genreUnlocked &&
                    !prenomUnlocked &&
                    !nomUnlocked &&
                    !contactTelephoneUnlocked &&
                    !contactEmailUnlocked &&
                    !(enablePasswordChange && newPassword.trim().length >= 6) &&
                    !roleMetierUnlocked &&
                    !regionUnlocked) ||
                  (enablePasswordChange && newPassword.trim().length < 6)
                }
              >
                Enregistrer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={addOpen} onOpenChange={handleAddOpenChange}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Ajouter un agent</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Matricule utilisateur (nouveau) *</Label>
                <Input placeholder="Ex: 740 364/B" value={userMatricule} onChange={(e) => setUserMatricule(e.target.value)} />
                {!userMatricule.trim() && <p className="text-xs text-destructive">Ce champ est requis</p>}
              </div>
              <div className="space-y-2">
                <Label>Prénom</Label>
                <Input
                  value={newPrenom}
                  onChange={(e) => setNewPrenom(e.target.value.replace(/[\p{N}\p{P}\p{S}_]+/gu, ""))}
                  onBlur={() => setNewPrenom((v) => normalizePrenom(v))}
                />
              </div>
              <div className="space-y-2">
                <Label>Nom</Label>
                <Input
                  value={newNom}
                  onChange={(e) => setNewNom(e.target.value.replace(/[\p{N}\p{P}\p{S}_]+/gu, ""))}
                  onBlur={() => setNewNom((v) => normalizeNom(v))}
                />
              </div>
              <div className="space-y-2">
                <Label>Grade</Label>
                <Input
                  value={newGrade}
                  onChange={(e) => setNewGrade(e.target.value.replace(/[\p{N}\p{P}\p{S}_]+/gu, ""))}
                  onBlur={() => setNewGrade((v) => normalizeGrade(v))}
                />
              </div>
              <div className="space-y-2">
                <Label>Genre</Label>
                <Select value={newGenre ? newGenre : "none"} onValueChange={(v) => setNewGenre(v === "none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Aucun" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    <SelectItem value="H">H</SelectItem>
                    <SelectItem value="F">F</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Rôle métier</Label>
                <Select
                  value={newRoleMetierId ? newRoleMetierId : "none"}
                  onValueChange={(v) => setNewRoleMetierId(v === "none" ? "" : v)}
                  disabled={!newRoleMetierUnlocked}
                >
                  <div className="relative">
                    <SelectTrigger className={!newRoleMetierUnlocked ? "bg-muted text-muted-foreground pr-10" : "pr-10"}>
                      <SelectValue placeholder="Aucun" />
                    </SelectTrigger>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => setNewRoleMetierUnlocked(true)}
                      disabled={newRoleMetierUnlocked}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    {rolesMetier.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.labelFr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Téléphone (contact)</Label>
                <Input
                  placeholder="XX XXX XX XX"
                  value={newContactTelephone}
                  onChange={(e) => setNewContactTelephone(formatPhoneNumber(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Email (contact) *</Label>
                <Input type="email" placeholder="exemple@email.com" value={newContactEmail} onChange={(e) => setNewContactEmail(e.target.value)} />
                {!newContactEmail.trim() && <p className="text-xs text-destructive">Ce champ est requis</p>}
              </div>
              <div className="space-y-2">
                <Label>Niveau</Label>
                <Select value={newRegion || "none"} onValueChange={(v) => { setNewRegion(v === "none" ? "" : v); setNewDepartement(""); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un niveau" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune</SelectItem>
                    <SelectItem value="national">NATIONAL</SelectItem>
                    {regionEnum.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {newRegion && (departmentsByRegion as any)[newRegion] && (
                <div className="space-y-2">
                  <Label>Département</Label>
                  <Select value={newDepartement || "none"} onValueChange={(v) => setNewDepartement(v === "none" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un département" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucun</SelectItem>
                      {(departmentsByRegion as any)[newRegion].map((d: any) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleAddOpenChange(false)}>
                Annuler
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={
                  createMutation.isPending ||
                  !userMatricule.trim() ||
                  !newContactEmail.trim()
                }
              >
                Ajouter
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
