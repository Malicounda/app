import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/contexts/AuthContext";
import { resolveDomainLoginTarget, usePortalDomains } from "@/hooks/usePortalDomains";
import { toast } from "@/hooks/use-toast";
import { getHomePage } from "@/utils/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Lock, User } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import { z } from "zod";

const systemLoginSchema = z.object({
  identifier: z.string().min(1, "La saisie de \"Nom d'utilisateur\" est obligatoire"),
  password: z.string().min(1, "La saisie de \"Mot de passe\" est obligatoire"),
});

export default function SystemLogin() {
  const { login, isLoading, isAuthenticated, user } = useAuth();
  const {
    visibleDomaines,
    singleVisibleDomain,
    isLoading: isDomainsLoading,
    isError: isDomainsError,
  } = usePortalDomains();
  const [showPassword, setShowPassword] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    document.title = "Connexion | SCoDi";
    try {
      localStorage.setItem("domain", "SYSTEM");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && user) {
      const homePage = getHomePage(
        user.role,
        user.type,
        (user as any)?.isSuperAdmin,
        (user as any)?.isDefaultRole,
        (user as any)?.isSupervisorRole,
        user
      );
      setLocation(homePage, { replace: true });
    }
  }, [isAuthenticated, user, setLocation]);

  // Si au moins un domaine redevient visible, quitter la page de secours neutre vers le flux normal
  useEffect(() => {
    if (isAuthenticated || isDomainsLoading || isDomainsError) return;
    if (singleVisibleDomain) {
      const target = resolveDomainLoginTarget(singleVisibleDomain);
      try {
        localStorage.setItem("domain", target.domainValue);
      } catch {
        // ignore
      }
      setLocation(target.path, { replace: true });
      return;
    }
    if (visibleDomaines.length > 1) {
      try {
        localStorage.removeItem("domain");
      } catch {
        // ignore
      }
      setLocation("/?showModules=1", { replace: true });
    }
  }, [
    isAuthenticated,
    isDomainsLoading,
    isDomainsError,
    singleVisibleDomain,
    visibleDomaines.length,
    setLocation,
  ]);

  const form = useForm<z.infer<typeof systemLoginSchema>>({
    resolver: zodResolver(systemLoginSchema),
    defaultValues: {
      identifier: "",
      password: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof systemLoginSchema>) => {
    try {
      try {
        localStorage.setItem("domain", "SYSTEM");
      } catch {
        // ignore
      }

      await login(values.identifier.trim(), values.password);

      toast({
        title: "Connexion réussie",
        description: "Vous êtes maintenant connecté.",
      });
    } catch (e: any) {
      const msg = String(e?.message || "").toLowerCase();
      if (msg.includes("connexion internet") || msg.includes("offline") || msg.includes("failed to fetch")) {
        toast({
          title: "Pas de connexion",
          description: "Impossible de se connecter sans Internet. Veuillez vérifier votre connexion.",
          variant: "destructive",
        });
      }
    }
  };

  if (isDomainsLoading || (!isDomainsError && visibleDomaines.length > 0)) {
    return (
      <div className="min-h-[100svh] bg-slate-50 flex items-center justify-center">
        <Spinner className="h-8 w-8 text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-[100svh] w-full bg-slate-50/70 flex flex-col justify-between p-4 sm:p-6 overflow-auto">
      <div className="h-6 shrink-0" aria-hidden />

      <main className="flex-1 flex items-center justify-center py-4">
        <div className="w-full max-w-sm bg-white border border-slate-200/80 rounded-2xl shadow-sm p-7 sm:p-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <User className="h-7 w-7 stroke-[1.75]" />
          </div>

          <h1 className="text-xl font-semibold text-center text-slate-800 mb-6">
            Connexion
          </h1>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="identifier"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                          <User className="h-4 w-4 text-slate-400" />
                        </div>
                        <Input
                          placeholder="Nom d'utilisateur"
                          autoComplete="username"
                          {...field}
                          disabled={isLoading}
                          className="h-11 pl-10 bg-slate-50/70 border border-slate-200 focus:border-slate-400 focus:bg-white rounded-lg text-slate-800 placeholder:text-slate-400 transition-colors"
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
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                          <Lock className="h-4 w-4 text-slate-400" />
                        </div>
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Mot de passe"
                          autoComplete="current-password"
                          {...field}
                          value={field.value ?? ""}
                          disabled={isLoading}
                          className="h-11 pl-10 pr-10 bg-slate-50/70 border border-slate-200 focus:border-slate-400 focus:bg-white rounded-lg text-slate-800 placeholder:text-slate-400 transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          disabled={isLoading}
                          aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                          className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
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
                disabled={isLoading}
                className="w-full h-11 bg-slate-600 hover:bg-slate-700 text-white font-medium rounded-lg shadow-none transition-colors"
              >
                {isLoading ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    Connexion...
                  </>
                ) : (
                  "Se connecter"
                )}
              </Button>
            </form>
          </Form>
        </div>
      </main>

      <footer className="flex justify-end items-center pt-4 shrink-0 pointer-events-none select-none">
        <div className="flex items-center gap-2 opacity-80">
          <span className="text-xs text-slate-400 font-medium">Powered by</span>
          <img
            src="/logo-scodi.png"
            alt="SCoDi"
            className="h-8 w-auto object-contain"
          />
        </div>
      </footer>
    </div>
  );
}
