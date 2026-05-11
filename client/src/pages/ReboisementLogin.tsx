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
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import "../styles/login.css";

const schema = z.object({
  identifier: z.string().min(1, "Identifiant requis"),
  password: z.string().min(1, "Mot de passe requis"),
});

export default function ReboisementLogin() {
  const { login, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const { icon: DomainIcon, logoUrl } = useDomainVisual('REBOISEMENT');

  useEffect(() => {
    document.title = "Connexion Reboisement | SCoDiPP";
    localStorage.setItem("domain", "REBOISEMENT");
  }, []);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: "", password: "" },
  });

  const onSubmit = async (values: z.infer<typeof schema>) => {
    try {
      localStorage.setItem("domain", "REBOISEMENT");
      await login(values.identifier, values.password);
      toast({ title: "Connexion réussie", description: "Bienvenue dans le module Reboisement." });
    } catch (e) {
      toast({ variant: "destructive", title: "Erreur de connexion", description: "Identifiants invalides." });
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-lime-50 via-green-50 to-emerald-100 flex items-center justify-center overflow-auto p-4">
      <div className="w-full max-w-md bg-white/70 backdrop-blur rounded-2xl shadow-xl p-6">
        <button
          type="button"
          onClick={() => setLocation('/?showModules=1')}
          className="mb-3 inline-flex items-center gap-2 text-green-700 hover:text-green-800"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour</span>
        </button>
        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
          {logoUrl ? (
            <img src={logoUrl} alt="Reboisement" className="w-10 h-10 object-contain" />
          ) : (
            <DomainIcon className="w-10 h-10 text-green-600" />
          )}
        </div>
        <h1 className="text-2xl font-bold text-center text-gray-800">Connexion Reboisement</h1>
        <p className="text-center text-sm text-gray-600 mt-1">Comptes et activités dédiés au reboisement</p>

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
                          <User className="h-5 w-5 text-green-600" />
                        </div>
                        <Input
                          placeholder="nom_utilisateur ou e-mail"
                          {...field}
                          disabled={isLoading}
                          className="h-12 pl-10 bg-white border-2 focus:border-green-300 rounded-lg shadow-sm"
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
                          <Lock className="h-5 w-5 text-green-600" />
                        </div>
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="********"
                          {...field}
                          disabled={isLoading}
                          className="h-12 pl-10 pr-10 bg-white border-2 focus:border-green-300 rounded-lg shadow-sm"
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

              <Button type="submit" className="w-full h-12 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg" disabled={isLoading}>
                {isLoading ? <Spinner className="mr-2 h-4 w-4" /> : <User className="mr-2 h-4 w-4" />}
                Se connecter
              </Button>

              <div className="text-xs text-center text-gray-500">
                Vous devez utiliser un compte dédié au reboisement.
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
