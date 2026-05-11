import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { departmentsByRegion, regionEnum } from "@/lib/constants";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

// Import dynamique des composants de profil
const HunterProfilePage = lazy(() => import("./HunterProfilePage"));
const GuideProfilePage = lazy(() => import("./GuideProfilePage"));

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editMode, setEditMode] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [serviceLocation, setServiceLocation] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const formatPhoneNumber = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    const truncated = numbers.slice(0, 9);
    if (truncated.length <= 2) return truncated;
    if (truncated.length <= 5) return `${truncated.slice(0, 2)} ${truncated.slice(2)}`;
    if (truncated.length <= 7) return `${truncated.slice(0, 2)} ${truncated.slice(2, 5)} ${truncated.slice(5)}`;
    return `${truncated.slice(0, 2)} ${truncated.slice(2, 5)} ${truncated.slice(5, 7)} ${truncated.slice(7)}`;
  };

  // Étend le type utilisateur localement pour accéder à des champs optionnels sans erreurs TS
  type ExtendedUser = typeof user extends infer U
    ? U & {
        matricule?: string;
        serviceLocation?: string;
        sector?: string;
        department?: string;
        assignmentPost?: string;
        region?: string;
        zone?: string;
        grade?: string;
        genre?: string;
      }
    : never;
  const profile = (user || {}) as ExtendedUser;

  const readOnlyInputClass = useMemo(() => "bg-muted text-muted-foreground", []);

  useEffect(() => {
    if (!user) return;
    setUsername(user.username || "");
    setEmail(user.email || "");
    setPhone(user.phone || "");
    setFirstName(user.firstName || "");
    setLastName(user.lastName || "");
    setServiceLocation((profile.serviceLocation as any) || "");
  }, [user]);

  const updateMyProfileMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      if (!user) throw new Error("Utilisateur introuvable");
      return apiRequest({
        url: `/api/users/${user.id}`,
        method: "PUT",
        data,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/users/agents"] });
      await refreshUser();
      toast({ title: "Profil mis à jour" });
      setEditMode(false);
      setPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setShowConfirmPassword(false);
    },
    onError: (e: any) => {
      toast({
        title: "Erreur",
        description: String(e?.message || "Mise à jour impossible"),
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    document.title = "Mon Profil | SCoDiPP - Systeme de Control";
  }, []);

  if (!user) {
    return <div className="flex-1 flex items-center justify-center p-8">
      <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-green-600"></div>
    </div>;
  }

  if (user.role === "hunter") {
    return (
      <Suspense fallback={
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-green-600"></div>
        </div>
      }>
        <HunterProfilePage />
      </Suspense>
    );
  } else if (user.role === "hunting-guide") {
    // Rediriger vers le profil des guides de chasse
    return (
      <Suspense fallback={
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-green-600"></div>
        </div>
      }>
        <GuideProfilePage />
      </Suspense>
    );
  } else if (user.role === "admin" || user.role === "agent" || user.role === "sub-agent" || user.role === "brigade" || user.role === "triage" || user.role === "poste-control" || user.role === "sous-secteur") {
    // Page de profil pour les administrateurs et les agents
    let roleTitle = "";

    if (user.role === "admin") {
      roleTitle = "Administrateur";
    } else if (user.role === "agent") {
      roleTitle = "Agent Régional";
    } else if (user.role === "sub-agent") {
      roleTitle = "Agent Secteur";
    } else if (user.role === "brigade") {
      roleTitle = "Brigade";
    } else if (user.role === "triage") {
      roleTitle = "Triage";
    } else if (user.role === "poste-control") {
      roleTitle = "Poste de Contrôle";
    } else if (user.role === "sous-secteur") {
      roleTitle = "Sous-Secteur";
    }

    return (
      <main className="min-h-screen overflow-y-auto bg-white">
  <div className="container mx-auto px-4 py-6 space-y-6 max-w-full">
          {!((user as any)?.isDefaultRole) && !((user as any)?.isSupervisorRole) && (
            <h2 className="text-3xl font-bold mb-2">Profil {roleTitle}</h2>
          )}
        {/* Profil pour les administrateurs, agents et agents secteur */}
        {user.role !== "admin" && (
          <div className="space-y-4 max-w-full mx-auto">
            <div className="flex items-center justify-end gap-2">
              <Button
                variant={editMode ? "outline" : "default"}
                onClick={() => {
                  setEditMode((v) => !v);
                  setPassword("");
                  setConfirmPassword("");
                  setShowPassword(false);
                  setShowConfirmPassword(false);
                }}
              >
                {editMode ? "Annuler" : "Modifier"}
              </Button>
              {editMode && (
                <Button
                  onClick={() => {
                    if (!user) return;
                    if (password || confirmPassword) {
                      if (password.length < 6) {
                        toast({
                          title: "Mot de passe invalide",
                          description: "Le mot de passe doit contenir au moins 6 caractères.",
                          variant: "destructive",
                        });
                        return;
                      }
                      if (password !== confirmPassword) {
                        toast({
                          title: "Confirmation incorrecte",
                          description: "Les deux mots de passe ne correspondent pas.",
                          variant: "destructive",
                        });
                        return;
                      }
                    }

                    updateMyProfileMutation.mutate({
                      username: username.trim(),
                      email: email.trim(),
                      phone: phone.trim(),
                      ...(password ? { password } : {}),
                    });
                  }}
                  disabled={updateMyProfileMutation.isPending}
                >
                  {updateMyProfileMutation.isPending ? "En cours..." : "Enregistrer"}
                </Button>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Matricule</Label>
                <Input value={profile.matricule || "Non défini"} disabled className={readOnlyInputClass} />
              </div>
              <div className="space-y-2">
                <Label>Prénom</Label>
                <Input value={user.firstName || "Non défini"} disabled className={readOnlyInputClass} />
              </div>
              <div className="space-y-2">
                <Label>Nom</Label>
                <Input value={user.lastName || "Non défini"} disabled className={readOnlyInputClass} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} disabled={!editMode} className={!editMode ? readOnlyInputClass : undefined} />
              </div>
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                  disabled={!editMode}
                  className={!editMode ? readOnlyInputClass : undefined}
                />
              </div>
              <div className="space-y-2">
                <Label>Grade</Label>
                <Input value={profile.grade || "Non défini"} disabled className={readOnlyInputClass} />
              </div>
              <div className="space-y-2">
                <Label>Genre</Label>
                <Input value={profile.genre || "Non défini"} disabled className={readOnlyInputClass} />
              </div>
              <div className="space-y-2">
                <Label>Lieu de service</Label>
                <Input
                  value={
                    (() => {
                      const sectorSubRoles = ["sub-agent", "brigade", "triage", "poste-control", "sous-secteur"];
                      if (sectorSubRoles.includes(user.role)) {
                        const rawRegion = (profile.region || "").trim();
                        const regionKey = rawRegion
                          .toLowerCase()
                          .normalize("NFD")
                          .replace(/\p{Diacritic}/gu, "")
                          .replace(/\s+/g, "-");
                        const dept = ((profile as any).departement || (profile as any).zone || "").trim();
                        const sectorValue = dept.toLowerCase();
                        const list = (departmentsByRegion as any)[regionKey] as Array<{ value: string; label: string }> | undefined;
                        const found = list?.find((d) => d.value === sectorValue);
                        const deptLabel = found?.label?.replace(/^Secteur\s+/i, "") || sectorValue
                          .replace(/-/g, " ")
                          .replace(/\b\w/g, (c: string) => c.toUpperCase()) || "Non défini";

                        const commune = ((profile as any).commune || "").trim();
                        const arrond = ((profile as any).arrondissement || "").trim();
                        const sousService = ((profile as any).sousService || "").trim();

                        // Préfixe selon le type de sous-rôle
                        const roleLabelMap: Record<string, string> = {
                          "sub-agent": "Secteur",
                          "sous-secteur": "Sous-Secteur",
                          "brigade": "Brigade",
                          "triage": "Triage",
                          "poste-control": "Poste de Contrôle",
                        };
                        const prefix = roleLabelMap[user.role] || "Secteur";

                        const parts = [prefix, deptLabel];
                        if (commune) parts.push(commune);
                        if (arrond) parts.push(arrond);
                        if (sousService) parts.push(sousService);
                        return parts.join("/");
                      }
                      // Agent régional ou admin
                      const raw = (profile.region || "").trim();
                      let label = regionEnum.find((r) => r.value === raw)?.label;
                      if (!label && raw) {
                        const norm = (s: string) =>
                          s
                            .normalize("NFD")
                            .replace(/\p{Diacritic}+/gu, "")
                            .toUpperCase()
                            .replace(/\s+/g, "");
                        const rawNorm = norm(raw);
                        const found = regionEnum.find((r) => norm(r.label) === rawNorm);
                        label = found?.label;
                      }
                      return label ? `IREF/${label}` : profile.serviceLocation || "IREF";
                    })()
                  }
                  disabled
                  className={readOnlyInputClass}
                />
              </div>
              <div className="space-y-2">
                <Label>Région</Label>
                <Input value={profile.region || "Non défini"} disabled className={readOnlyInputClass} />
              </div>
            </div>

            {editMode && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nouveau mot de passe</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Confirmer le mot de passe</Label>
                  <div className="relative">
                    <Input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {user.role === "admin" && !((user as any)?.isSuperAdmin) && (
          <div className="space-y-4 max-w-full mx-auto">
            <div className="flex items-center justify-end gap-2">
              <Button
                variant={editMode ? "outline" : "default"}
                onClick={() => {
                  setEditMode((v) => !v);
                  setPassword("");
                  setConfirmPassword("");
                  setShowPassword(false);
                  setShowConfirmPassword(false);
                }}
              >
                {editMode ? "Annuler" : "Modifier"}
              </Button>
              {editMode && (
                <Button
                  onClick={() => {
                    if (!user) return;
                    if (password || confirmPassword) {
                      if (password.length < 6) {
                        toast({
                          title: "Mot de passe invalide",
                          description: "Le mot de passe doit contenir au moins 6 caractères.",
                          variant: "destructive",
                        });
                        return;
                      }
                      if (password !== confirmPassword) {
                        toast({
                          title: "Confirmation incorrecte",
                          description: "Les deux mots de passe ne correspondent pas.",
                          variant: "destructive",
                        });
                        return;
                      }
                    }

                    updateMyProfileMutation.mutate({
                      firstName: firstName.trim(),
                      lastName: lastName.trim(),
                      email: email.trim(),
                      phone: phone.trim(),
                      serviceLocation: serviceLocation.trim() || null,
                      ...(password ? { password } : {}),
                    });
                  }}
                  disabled={updateMyProfileMutation.isPending}
                >
                  {updateMyProfileMutation.isPending ? "En cours..." : "Enregistrer"}
                </Button>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Matricule</Label>
                <Input value={profile.matricule || "Non défini"} disabled className={readOnlyInputClass} />
              </div>

              <div className="space-y-2">
                <Label>Prénom</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={!editMode} className={!editMode ? readOnlyInputClass : undefined} />
              </div>
              <div className="space-y-2">
                <Label>Nom</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={!editMode} className={!editMode ? readOnlyInputClass : undefined} />
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} disabled={!editMode} className={!editMode ? readOnlyInputClass : undefined} />
              </div>
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!editMode} className={!editMode ? readOnlyInputClass : undefined} />
              </div>
              <div className="space-y-2">
                <Label>Grade</Label>
                <Input value={profile.grade || "Non défini"} disabled className={readOnlyInputClass} />
              </div>
              <div className="space-y-2">
                <Label>Genre</Label>
                <Input value={profile.genre || "Non défini"} disabled className={readOnlyInputClass} />
              </div>

              <div className="space-y-2">
                <Label>Lieu de service</Label>
                <Input value={serviceLocation} onChange={(e) => setServiceLocation(e.target.value)} disabled={!editMode} className={!editMode ? readOnlyInputClass : undefined} />
              </div>
              <div className="space-y-2">
                <Label>Rôle métier</Label>
                <Input value={(profile as any).roleMetierLabel || "Non défini"} disabled className={readOnlyInputClass} />
              </div>
            </div>

            {editMode && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nouveau mot de passe</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Confirmer le mot de passe</Label>
                  <div className="relative">
                    <Input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        </div>
      </main>
    );
  } else {
    navigate("/");
    return null;
  }
}
