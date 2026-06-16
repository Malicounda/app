import { useDomainVisual } from "@/lib/domainIcons";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Eye, EyeOff, Lock, User } from "lucide-react";
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
    FormMessage
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { getHomePage } from "@/utils/navigation";

import "../styles/login.css";

const loginSchema = z.object({
  identifier: z.string().min(1, "Le nom d'utilisateur ou matricule est requis"),
  password: z.string().optional(),
});

export default function Login() {
  const { login, isLoading, isAuthenticated, user } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [, setLocation] = useLocation();
  const [loginTheme, setLoginTheme] = useState<{ bgImage?: string; bgColor?: string; primary?: string }>({});

  useEffect(() => {
    try {
      const cfgStr = localStorage.getItem('theme:superadmin');
      if (cfgStr) {
        const cfg = JSON.parse(cfgStr);
        const dTheme = cfg?.domains?.CHASSE || {};
        setLoginTheme({
          bgImage: dTheme.loginBgImage,
          bgColor: dTheme.loginBgColor,
          primary: dTheme.loginPrimaryColor
        });
      }
    } catch (e) {}
  }, []);
  const { icon: DomainIcon, logoUrl } = useDomainVisual('CHASSE');

  useEffect(() => {
    document.title = "Connexion | Système de Contrôle et de Digitalisation";
    try { localStorage.setItem('domain', 'CHASSE'); } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  }
  }, []);

  // Ouvre automatiquement la modale si l'URL contient ?selectProfile=1 (redirigé depuis /select-profile)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("selectProfile") === "1") {
        setLocation("/register");
      }
    } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  }
  }, [setLocation]);

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

  useEffect(() => {
    if (isAuthenticated && user) {
      const homePage = getHomePage(user.role, user.type, (user as any)?.isSuperAdmin, (user as any)?.isDefaultRole, (user as any)?.isSupervisorRole);
      setLocation(homePage);
    }
  }, [isAuthenticated, user, setLocation]);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: "",
      password: "",
    },
  });

  // Pré-remplir automatiquement le formulaire avec les identifiants tout juste créés
  useEffect(() => {
    try {
      const tempCredsStr = sessionStorage.getItem('scodi_temp_creds');
      if (tempCredsStr) {
        const tempCreds = JSON.parse(tempCredsStr);
        if (tempCreds.identifier) {
          form.setValue('identifier', tempCreds.identifier);
        }
        if (tempCreds.password) {
          form.setValue('password', tempCreds.password);
        }
        // Nettoyer pour des raisons de sécurité
        sessionStorage.removeItem('scodi_temp_creds');
      }
    } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  }
  }, [form]);

  const isChasseApk = typeof navigator !== 'undefined' && navigator.userAgent.includes('ChasseAPK');

  const onSubmit = async (values: z.infer<typeof loginSchema>) => {
    try {
      // La vérification de navigator.onLine a été retirée car elle bloque
      // l'accès à localhost si l'ordinateur n'a aucune connexion réseau.
      // Si le serveur backend n'est pas joignable, le fetch échouera et
      // l'erreur sera interceptée par le catch en bas.

      await login(values.identifier, values.password || '');

      // La redirection est gérée par l'effet ci-dessus qui surveille isAuthenticated et user
      toast({
        title: "Connexion réussie",
        description: "Vous êtes maintenant connecté.",
      });
    } catch (e: any) {
      const msg = String(e?.message || '').toLowerCase();
      if (msg.includes('connexion internet') || msg.includes('offline') || msg.includes('failed to fetch')) {
        toast({
          title: "Pas de connexion",
          description: "Impossible de se connecter sans Internet. Veuillez vérifier votre connexion.",
          variant: "destructive",
        });
      } else {
        console.error("Erreur d'authentification:", e);
        // Échec affiché par AppErrorDialog (style Accès refusé)
      }
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-auto p-4 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: loginTheme.bgImage ? `url("${loginTheme.bgImage}")` : 'url("/login_bg_chasse.png")', backgroundColor: loginTheme.bgColor || undefined }}
    >
      <div className="w-full max-w-md bg-white/30 backdrop-blur-lg border-2 border-white/80 rounded-3xl shadow-2xl p-8 relative">
        {typeof navigator !== 'undefined' && !navigator.userAgent.includes('ChasseAPK') && (
          <button
            type="button"
            onClick={() => setLocation('/?showModules=1')}
            className="mb-3 inline-flex items-center gap-2 text-green-700 hover:text-green-800" style={loginTheme.primary ? { color: loginTheme.primary } : {}}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Retour</span>
          </button>
        )}
        <div className="w-24 h-24 mx-auto mb-4 rounded-full flex items-center justify-center overflow-hidden border-2 border-green-100 shadow-sm bg-white">
          <img src="/login_icon_chasse.png" alt="Chasse" className="w-full h-full object-cover" />
        </div>
        <h1 className="text-2xl font-bold text-center text-gray-800">Connexion Chasse</h1>
        <p className="text-center text-sm text-gray-600 mt-1">Permis et activités dédiés à la chasse</p>

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
                          <User className="h-5 w-5 text-green-600" style={loginTheme.primary ? { color: loginTheme.primary } : {}} />
                        </div>
                        <Input
                          placeholder="Nom d'utilisateur"
                          {...field}
                          disabled={isLoading}
                          className="h-12 pl-10 bg-white/95 border-2 border-green-600/30 focus:border-green-600 focus:ring-4 focus:ring-green-600/20 rounded-xl shadow-sm transition-all"
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
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Lock className="h-5 w-5 text-green-600" style={loginTheme.primary ? { color: loginTheme.primary } : {}} />
                        </div>
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="mot de passe"
                          {...field}
                          value={field.value ?? ''}
                          disabled={isLoading}
                          className="h-12 pl-10 pr-10 bg-white/95 border-2 border-green-600/30 focus:border-green-600 focus:ring-4 focus:ring-green-600/20 rounded-xl shadow-sm transition-all"
                        />
                        <button
                          type="button"
                          className="absolute inset-y-0 right-0 pr-3 flex items-center"
                          onClick={() => setShowPassword(!showPassword)}
                          disabled={isLoading}
                        >
                          {showPassword ? (
                            <EyeOff className="h-5 w-5 text-gray-500" />
                          ) : (
                            <Eye className="h-5 w-5 text-gray-500" />
                          )}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full h-12 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Spinner className="mr-2 h-4 w-4" />
                ) : (
                  <User className="mr-2 h-4 w-4" />
                )}
                Se connecter
              </Button>

              <div className="text-center text-sm text-gray-600 mt-4">
                Vous n'avez pas de compte?{" "}
                <button
                  type="button"
                  onClick={() => setLocation('/register')}
                  className={`font-medium hover:underline ${isLoading ? "opacity-50 cursor-not-allowed text-gray-400" : "text-green-700"}`}
                  style={loginTheme.primary && !isLoading ? { color: loginTheme.primary } : {}}
                  disabled={isLoading}
                  aria-disabled={isLoading}
                >
                  Créer un compte
                </button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
