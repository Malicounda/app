import { useDomainVisual } from "@/lib/domainIcons";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, User } from "lucide-react";
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

export default function AlerteLogin() {
  const { login, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { icon: DomainIcon, logoUrl } = useDomainVisual('ALERTE');

  useEffect(() => {
    document.title = "Connexion Alerte | Système de Contrôle et de Digitalisation";
    try {
      localStorage.setItem("domain", "ALERTE");
    } catch {}
  }, []);

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

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 flex items-center justify-center overflow-auto p-4">
      <div className="w-full max-w-md bg-white/70 backdrop-blur rounded-2xl shadow-xl p-6">
        <button
          type="button"
          onClick={() => setLocation("/?showModules=1")}
          className="mb-3 inline-flex items-center gap-2 text-amber-700 hover:text-amber-800"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour</span>
        </button>

        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
          {logoUrl ? (
            <img src={logoUrl} alt="Alerte" className="w-10 h-10 object-contain" />
          ) : (
            <DomainIcon className="w-10 h-10 text-amber-600" />
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
