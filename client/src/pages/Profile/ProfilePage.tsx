import { Button } from "@/components/ui/button";
import AgentTopHeader from "@/components/layout/AgentTopHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { departmentsByRegion, regionEnum } from "@/lib/constants";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eye, EyeOff, LogOut, User as UserIcon, Mail, Phone, Shield, MapPin, Briefcase } from "lucide-react";
import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

// Import dynamique des composants de profil
const HunterProfilePage = lazy(() => import("./HunterProfilePage"));
const GuideProfilePage = lazy(() => import("./GuideProfilePage"));

export default function ProfilePage() {
  const { user, refreshUser, logout } = useAuth();
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
  } else {
    // Page de profil pour les administrateurs et les agents
    return (
      <main className="min-h-screen bg-slate-50 pb-20">
        <AgentTopHeader />
        
        {/* En-tête avec bouton retour (optionnel) */}
        <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10 flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => window.history.back()}
            className="rounded-full hover:bg-slate-100"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Button>
          <h1 className="text-xl font-bold text-slate-800">Détails du Profil</h1>
        </div>

        <div className="container mx-auto px-4 py-6 max-w-5xl">
          {/* Carte Profil principale */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden mb-6">
            {!editMode ? (
              /* MODE VUE */
              <div className="px-6 pt-6 pb-8 space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <InfoItem icon={<Mail />} label="Email" value={user.email || "Non défini"} />
                  <InfoItem icon={<Phone />} label="Téléphone" value={user.phone || "Non défini"} />
                  <InfoItem icon={<Shield />} label="Matricule" value={profile.matricule || "Non défini"} />
                  <InfoItem icon={<Briefcase />} label="Grade" value={profile.grade || "Non défini"} />
                  <InfoItem icon={<MapPin />} label="Lieu de service" value={profile.serviceLocation || profile.region || "Non défini"} />
                </div>

                <div className="pt-4">
                  <Button
                    className="w-full rounded-2xl py-6 text-base font-bold shadow-md shadow-emerald-100"
                    onClick={() => setEditMode(true)}
                  >
                    Modifier mon profil
                  </Button>
                </div>
              </div>
            ) : (
              /* MODE EDITION (Formulaire) */
              <div className="px-6 pt-6 pb-8 space-y-6">
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-slate-500 ml-1">Email</Label>
                    <Input 
                      value={email} 
                      onChange={(e) => setEmail(e.target.value)} 
                      className="rounded-xl border-slate-200 focus:ring-green-500 h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-500 ml-1">Téléphone</Label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                      className="rounded-xl border-slate-200 focus:ring-green-500 h-12"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-500 ml-1">Nouveau mot de passe</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="rounded-xl border-slate-200 focus:ring-green-500 h-12 pr-12"
                        placeholder="Laisser vide pour ne pas changer"
                      />
                      <button
                        type="button"
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                  </div>

                  {password && (
                    <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                      <Label className="text-slate-500 ml-1">Confirmer le mot de passe</Label>
                      <div className="relative">
                        <Input
                          type={showConfirmPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="rounded-xl border-slate-200 focus:ring-green-500 h-12 pr-12"
                        />
                        <button
                          type="button"
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        >
                          {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    variant="outline"
                    className="flex-1 rounded-2xl py-6 border-slate-200 text-slate-600"
                    onClick={() => {
                      setEditMode(false);
                      setPassword("");
                      setConfirmPassword("");
                    }}
                  >
                    Annuler
                  </Button>
                  <Button
                    className="flex-[2] rounded-2xl py-6 font-bold shadow-md shadow-emerald-100"
                    disabled={updateMyProfileMutation.isPending}
                    onClick={() => {
                      if (password && password !== confirmPassword) {
                        toast({ title: "Erreur", description: "Les mots de passe ne correspondent pas", variant: "destructive" });
                        return;
                      }
                      updateMyProfileMutation.mutate({
                        email: email.trim(),
                        phone: phone.trim(),
                        ...(password ? { password } : {}),
                      });
                    }}
                  >
                    {updateMyProfileMutation.isPending ? "Enregistrement..." : "Enregistrer"}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Bouton de déconnexion séparé et rouge */}
          <div className="mt-8 flex flex-col items-center gap-6">
            <Button
              variant="destructive"
              className="w-full rounded-2xl py-7 text-lg font-bold shadow-lg shadow-red-100 bg-red-500 hover:bg-red-600 border-none"
              onClick={logout}
            >
              <LogOut className="mr-2 h-6 w-6" />
              Déconnexion
            </Button>
            
            <div className="flex flex-col items-center">
              <img src="/assets/logoprojets/Sans fond_Scodi/android-chrome-192x192.png" alt="Logo" className="h-12 w-12 opacity-50 grayscale mb-2" />
              <p className="text-[10px] text-slate-400 font-medium tracking-widest uppercase">Version 1.0.0</p>
            </div>
          </div>
        </div>
      </main>
    );
  }
}

/**
 * Petit composant interne pour afficher une ligne d'info
 */
function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50/50 border border-slate-100">
      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-emerald-600 shadow-sm">
        {icon && React.cloneElement(icon as React.ReactElement, { size: 18 })}
      </div>
      <div className="text-left">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{label}</p>
        <p className="text-sm font-semibold text-slate-700">{value}</p>
      </div>
    </div>
  );
}
