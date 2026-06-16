import { useDomainVisual } from "@/lib/domainIcons";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, User, Bell, Info, Lock, Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import LicenseDialog from "@/components/layout/LicenseDialog";
import "../styles/login.css";

const schema = z.object({
  identifier: z.string().min(1, "Matricule requis"),
  password: z.string().min(1, "Code secret requis"),
});

// Détection APK
const isApkMode = (): boolean => {
  try {
    if (typeof window !== "undefined") {
      if (window.navigator.userAgent.includes("AlerteAPK")) return true;
      if (window.location.search.includes("isApk=true")) return true;
    }
    if (typeof (window as any).Capacitor !== "undefined" &&
      (window as any).Capacitor.isNativePlatform?.()) return true;
  } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);   }
  return false;
};

export default function AlerteLogin() {
  const { login, isLoading, isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();
  const { icon: DomainIcon, logoUrl } = useDomainVisual("ALERTE");
  const [showLicense, setShowLicense] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const isApk = isApkMode();

  // redirection si déjà connecté
  useEffect(() => {
    if (isAuthenticated && user) {
      const isSupervisor = (user as any)?.isSupervisorRole;
      setLocation(isSupervisor ? "/supervisor" : "/default-home");
    }
  }, [isAuthenticated, user, setLocation]);

  useEffect(() => {
    document.title = "Connexion Alerte | SCoDi";
    try {
      localStorage.setItem("domain", "ALERTE");
    } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);   }
  }, []);

  // Afficher le message de session expirée si présent
  useEffect(() => {
    try {
      const expiredMsg = localStorage.getItem("sessionExpiredMessage");
      if (expiredMsg) {
        localStorage.removeItem("sessionExpiredMessage");
        toast({
          title: "Session expirée",
          description: expiredMsg,
          variant: "destructive",
        });
      }
    } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  }
  }, []);

  // Back button APK
  useEffect(() => {
    if (!isApk) return;

    const setupBack = async () => {
      try {
        const { App } = await import("@capacitor/app");
        App.addListener("backButton", ({ canGoBack }) => {
          if (!canGoBack) App.exitApp();
        });
      } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);   }
    };

    setupBack();
  }, [isApk]);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: "", password: "" },
  });

  const onSubmit = async (values: z.infer<typeof schema>) => {
    try {
      // La vérification de navigator.onLine a été retirée car elle bloque l'accès à localhost si hors-ligne.

      localStorage.setItem("domain", "ALERTE");

      // ❌ GPS SUPPRIMÉ POUR STABILITÉ APK + BUILD WEB
      await login(values.identifier, values.password);

      toast({
        title: "Connexion réussie",
        description: "Bienvenue dans le module Alerte.",
      });
    } catch (e: any) {
      // Gérer spécifiquement l'erreur hors-ligne (503 du createOfflineFetch)
      const msg = String(e?.message || '').toLowerCase();
      if (msg.includes('connexion internet') || msg.includes('offline') || msg.includes('503') || msg.includes('failed to fetch')) {
        toast({
          title: "Pas de connexion",
          description: "Impossible de se connecter sans Internet. Veuillez vérifier votre connexion.",
          variant: "destructive",
        });
      } else if (msg.includes('invalide') || msg.includes('incorrect')) {
        toast({
          title: "Échec de connexion",
          description: "Matricule ou code secret incorrect.",
          variant: "destructive",
        });
      } else {
        if (import.meta.env.DEV) console.warn('[AlerteLogin] Erreur login:', e);
      }
    }
  };

  if (isAuthenticated) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-[#2d6a4f] flex items-center justify-center overflow-auto p-4">

      <div className="w-full max-w-md bg-white/70 backdrop-blur rounded-2xl shadow-xl p-6">

        {!isApk && (
          <button
            onClick={() => setLocation("/")}
            className="mb-3 inline-flex items-center gap-2 text-amber-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour
          </button>
        )}

        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
          {logoUrl && !isApk ? (
            <img src={logoUrl} className="w-10 h-10" />
          ) : (
            <Bell className="w-10 h-10 text-amber-600" />
          )}
        </div>

        <h1 className="text-2xl font-bold text-center">Connexion Alerte</h1>
        <p className="text-center text-sm text-gray-600">
          Accès par matricule et code secret
        </p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-6">

            <FormField
              control={form.control}
              name="identifier"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <div className="relative">
                      <User className="absolute left-3 top-3 text-amber-600" />
                      <Input
                        {...field}
                        placeholder="matricule"
                        disabled={isLoading}
                        className="h-12 pl-10"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 text-amber-600" />
                      <Input
                        {...field}
                        type={showPassword ? "text" : "password"}
                        placeholder="Code secret"
                        disabled={isLoading}
                        className="h-12 pl-10 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-3 text-gray-500 hover:text-amber-600 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full bg-amber-600"
              disabled={isLoading}
            >
              {isLoading ? "Connexion..." : "Se connecter"}
            </Button>

          </form>
        </Form>
      </div>

      {/* Info button */}
      <button
        onClick={() => setShowLicense(true)}
        className="absolute bottom-6 right-6 w-11 h-11 bg-white rounded-full shadow flex items-center justify-center"
      >
        <Info className="w-5 h-5" />
      </button>

      <LicenseDialog
        isOpen={showLicense}
        onClose={() => setShowLicense(false)}
      />
    </div>
  );
}