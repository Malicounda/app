import { useDomainVisual } from "@/lib/domainIcons";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, User, Bell } from "lucide-react";
import { useEffect } from "react";
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
import "../styles/login.css";

const schema = z.object({
  identifier: z.string().min(1, "Matricule requis"),
});

// Détection fiable du mode APK (Capacitor)
const isApkMode = (): boolean => {
  try {
    if (typeof window !== "undefined") {
      if (window.navigator.userAgent.includes("AlerteAPK")) return true;
      if (window.location.search.includes("isApk=true")) return true;
    }
    if (typeof (window as any).Capacitor !== "undefined" && (window as any).Capacitor.isNativePlatform?.()) return true;
  } catch {}
  return false;
};

export default function AlerteLogin() {
  const { login, isLoading, isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();
  const { icon: DomainIcon, logoUrl } = useDomainVisual('ALERTE');
  const isApk = isApkMode();

  // Si déjà authentifié (rechargement de page), rediriger vers le bon dashboard
  useEffect(() => {
    if (isAuthenticated && user) {
      const isSupervisor = (user as any)?.isSupervisorRole;
      setLocation(isSupervisor ? '/supervisor' : '/default-home');
    }
  }, [isAuthenticated, user, setLocation]);

  useEffect(() => {
    document.title = "Connexion Alerte | Système de Contrôle et de Digitalisation";
    try {
      localStorage.setItem("domain", "ALERTE");
    } catch {}

    // Demander les permissions de géolocalisation pour l'APK
    if (isApk) {
      const requestLocation = async () => {
        try {
          const { Geolocation } = await import('@capacitor/geolocation');
          const status = await Geolocation.checkPermissions();
          if (status.location !== 'granted') {
            await Geolocation.requestPermissions();
          }
        } catch (e) {
          console.log("Capacitor geolocation not available or failed", e);
        }
      };
      requestLocation();
    }
  }, [isApk]);

  // Interception du bouton Back Android en mode APK
  useEffect(() => {
    if (!isApk) return;

    const handleBackButton = async () => {
      try {
        // Import dynamique pour éviter les erreurs sur le web
        const { App } = await import('@capacitor/app');
        App.addListener('backButton', ({ canGoBack }) => {
          if (!canGoBack) {
            // Si aucune page en arrière, quitter l'application plutôt que de naviguer
            App.exitApp();
          }
          // Sinon : ne rien faire — on reste sur la page de connexion
        });
      } catch {
        // Silently fail on web
      }
    };
    handleBackButton();
  }, [isApk]);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: "" },
  });

  const onSubmit = async (values: z.infer<typeof schema>) => {
    try {
      try {
        localStorage.setItem("domain", "ALERTE");
      } catch {}
      await login(values.identifier, "");
      toast({
        title: "Connexion réussie",
        description: "Bienvenue dans le module Alerte.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Erreur de connexion",
        description: "Matricule invalide ou non autorisé.",
      });
    }
  };

  // Pendant le chargement ou si déjà authentifié, ne pas afficher le formulaire
  if (isAuthenticated) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 flex items-center justify-center overflow-auto p-4">
      <div className="w-full max-w-md bg-white/70 backdrop-blur rounded-2xl shadow-xl p-6">

        {/* Bouton Retour — masqué en mode APK */}
        {!isApk && (
          <button
            type="button"
            onClick={() => {
              try { localStorage.removeItem("domain"); } catch {}
              setLocation("/");
            }}
            className="mb-3 inline-flex items-center gap-2 text-amber-700 hover:text-amber-800"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Retour</span>
          </button>
        )}

        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
          {logoUrl && !isApk ? (
            <img src={logoUrl} alt="Alerte" className="w-10 h-10 object-contain" />
          ) : (
            <Bell className="w-10 h-10 text-amber-600" />
          )}
        </div>
        <h1 className="text-2xl font-bold text-center text-gray-800">Connexion Alerte</h1>
        <p className="text-center text-sm text-gray-600 mt-1">
          Accès par matricule uniquement
        </p>

        <div className="mt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="identifier"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <User className="h-5 w-5 text-amber-600" />
                        </div>
                        <Input
                          placeholder="matricule"
                          {...field}
                          disabled={isLoading}
                          className="h-12 pl-10 bg-white border-2 focus:border-amber-300 rounded-lg shadow-sm"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700" disabled={isLoading}>
                {isLoading ? "Connexion..." : "Se connecter"}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
