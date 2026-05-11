import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { departmentsByRegion } from "@/lib/constants";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import { regionDisplayNames } from "@shared/schema";
import React, { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

// Schéma local aligné sur le champ frontend `zone` (au lieu de `departement`)
const guideFormSchema = z.object({
  lastName: z.string().min(2, "Nom obligatoire"),
  firstName: z.string().min(2, "Prénom obligatoire"),
  phone: z.string().min(6, "Téléphone obligatoire"),
  zone: z.string().min(1, "Zone/Département obligatoire"),
  region: z.string().min(1, "Région obligatoire"),
  zoneId: z.string().optional(), // Zone affectée (ZIC, Amodiée, Parc, Régulation)
  idNumber: z.string().min(3, "Numéro de pièce obligatoire"),
  photo: z.string().optional(),
  username: z.string().min(3, "Le nom d'utilisateur doit contenir au moins 3 caractères"),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
});

// Variante pour l'édition: mot de passe facultatif (champ vide autorisé)
const guideFormEditSchema = guideFormSchema.extend({
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères").optional().or(z.literal("")),
});

type HuntingGuideFormValues = z.infer<typeof guideFormSchema>;

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff, Loader2, Paperclip, Pencil, X } from "lucide-react";

type EditInitialValues = {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  region: string;
  zone?: string; // département côté front
  departement?: string; // peut arriver sous ce nom depuis l'API
  zoneId?: number | null; // zone affectée
  idNumber?: string;
  photo?: string;
  username?: string;
  isActive?: boolean;
};

type HuntingGuideFormProps = {
  mode?: "create" | "edit";
  initialValues?: EditInitialValues;
  onSuccess?: () => void;
  onCancel?: () => void;
};

export function HuntingGuideForm({ mode = "create", initialValues, onSuccess, onCancel }: HuntingGuideFormProps) {
  console.log('Rendu du composant HuntingGuideForm, mode=', mode);
  const { toast } = useToast();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [departments, setDepartments] = useState<Array<{ value: string, label: string }>>([]);
  const [huntingZones, setHuntingZones] = useState<Array<{ id: number; name: string; type: string }>>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [photoRemoved, setPhotoRemoved] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isCreateMode = mode === "create";
  // Verrouillage individuel des champs en mode édition
  const [unlockedFields, setUnlockedFields] = useState<Set<string>>(new Set());
  const toggleFieldLock = (fieldName: string) => {
    setUnlockedFields(prev => {
      const next = new Set(prev);
      if (next.has(fieldName)) next.delete(fieldName);
      else next.add(fieldName);
      return next;
    });
    // Marquer le formulaire comme dirty quand un champ est déverrouillé
    if (!unlockedFields.has(fieldName)) {
      form.setValue(fieldName as any, form.getValues()[fieldName as keyof HuntingGuideFormValues] as any, { shouldDirty: true });
    }
  };
  const isFieldLocked = (fieldName: string) => mode === "edit" && !unlockedFields.has(fieldName);
  const PencilButton = ({ fieldName }: { fieldName: string }) => (
    <Button type="button" variant="ghost" size="sm" className="ml-1 h-5 w-5 p-0" onClick={() => toggleFieldLock(fieldName)}>
      <Pencil className={`h-3 w-3 ${unlockedFields.has(fieldName) ? 'text-green-600' : 'text-gray-400'}`} />
    </Button>
  );

  // Normalise une valeur de région (venant de la base, ex: "Dakar" ou "DAKAR") vers la clé attendue (ex: "dakar")
  const normalizeRegion = (value?: string) => {
    if (!value) return "";
    const v = value.toLowerCase();
    // 1) si c'est déjà une clé valide
    if (regionDisplayNames[v as keyof typeof regionDisplayNames]) return v;
    // 2) trouver par affichage (valeur) insensible à la casse
    const entry = Object.entries(regionDisplayNames).find(([, label]) => label.toLowerCase() === v);
    return entry ? entry[0] : v; // fallback: renvoyer v (pour ne pas planter), même si non reconnu
  };

  // Déterminer les valeurs par défaut en fonction du mode
  const defaults: HuntingGuideFormValues = mode === "edit" && initialValues ? {
    firstName: initialValues.firstName || "",
    lastName: initialValues.lastName || "",
    phone: initialValues.phone || "",
    zone: (initialValues.zone || initialValues.departement || "") as string,
    region: normalizeRegion(initialValues.region),
    zoneId: initialValues.zoneId != null ? String(initialValues.zoneId) : "",
    idNumber: initialValues.idNumber || "",
    photo: initialValues.photo || "",
    username: initialValues.username || "",
    password: "", // en édition, vide par défaut (non obligatoire)
  } : {
    firstName: "",
    lastName: "",
    phone: "",
    zone: "",
    region: normalizeRegion(user?.region),
    zoneId: "",
    idNumber: "",
    photo: "",
    username: "",
    password: "",
  };

  // Initialiser le formulaire avec le schéma local (adapté à `zone`)
  const form = useForm<HuntingGuideFormValues>({
    resolver: zodResolver(mode === "edit" ? guideFormEditSchema : guideFormSchema),
    defaultValues: defaults,
  });

  // Mettre à jour les départements quand la région change
  const watchRegion = form.watch("region");
  const watchZone = form.watch("zone");
  useEffect(() => {
    if (watchRegion) {
      const regionDepartments = departmentsByRegion[watchRegion as keyof typeof departmentsByRegion] || [];
      setDepartments(regionDepartments.map(dept => ({
        value: dept.value,
        // Retirer "Secteur " du label pour un affichage plus propre
        label: dept.label.replace("Secteur ", "")
      })));
      // Réinitialiser la zone quand la région change
      form.setValue("zone", "");
    } else {
      setDepartments([]);
    }
  }, [watchRegion, form]);

  // Charger les zones de chasse quand la région et le département sont sélectionnés
  useEffect(() => {
    if (!watchRegion || !watchZone) {
      setHuntingZones([]);
      return;
    }
    const fetchZones = async () => {
      try {
        const res = await fetch(`/api/zones?lite=1&region=${encodeURIComponent(watchRegion)}&departement=${encodeURIComponent(watchZone)}`);
        const data = await res.json();
        if (data.features && Array.isArray(data.features)) {
          setHuntingZones(data.features.map((f: any) => ({
            id: f.properties.id,
            name: f.properties.name,
            type: f.properties.type,
          })));
        } else {
          setHuntingZones([]);
        }
      } catch (err) {
        console.error("Erreur chargement zones:", err);
        setHuntingZones([]);
      }
    };
    fetchZones();
  }, [watchRegion, watchZone]);

  // Réinitialiser zoneId quand la région ou le département change (sauf au montage initial)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    form.setValue("zoneId", "", { shouldDirty: false });
  }, [watchRegion, watchZone, form]);

  // En mode édition: si nous avons une zone venant de la base, essayer de la faire correspondre à une option valide
  useEffect(() => {
    if (mode !== "edit" || !initialValues) return;
    const regionKey = normalizeRegion(initialValues.region);
    if (!regionKey) return;
    const regionDepartments = departmentsByRegion[regionKey as keyof typeof departmentsByRegion] || [];
    if (regionDepartments.length === 0) return;

    const incoming = (initialValues.zone || initialValues.departement || "").toString();
    if (!incoming) return;

    const normalizeDept = (s: string) => s.replace(/^Secteur\s+/i, "").trim().toLowerCase();
    const inc = normalizeDept(incoming);

    // Chercher par value exacte (insensible à la casse) ou par label normalisé
    const match = regionDepartments.find(d => {
      return d.value.toLowerCase() === inc || normalizeDept(d.label) === inc;
    });

    // Appliquer la région et la zone correspondantes au formulaire
    form.setValue("region", regionKey as any, { shouldDirty: false });
    if (match) {
      form.setValue("zone", match.value as any, { shouldDirty: false });
    } else {
      // à défaut, garder la chaîne brute (au cas où elle correspondrait à une value custom)
      form.setValue("zone", incoming as any, { shouldDirty: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, initialValues, departments]);

  // En mode édition: réinitialiser l'état dirty du formulaire après le chargement des valeurs initiales
  useEffect(() => {
    if (mode !== "edit") return;
    const timer = setTimeout(() => {
      form.reset(form.getValues());
    }, 100);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, initialValues]);

  // Pré-remplir l'aperçu photo en mode édition
  useEffect(() => {
    if (mode === "edit" && initialValues && initialValues.photo != null) {
      const apiUrl = (import.meta as any)?.env?.VITE_API_URL || '/api';
      let serverOrigin = window.location.origin;
      try {
        const u = new URL(apiUrl, window.location.origin);
        serverOrigin = `${u.protocol}//${u.host}`;
      } catch {}
      const raw: any = (initialValues as any).photo;
      let vStr = "";
      if (typeof raw === "string") {
        vStr = raw;
      } else if (raw && typeof raw === "object") {
        // supporte { url: string } ou { path: string }
        if (typeof raw.url === "string") vStr = raw.url;
        else if (typeof raw.path === "string") vStr = raw.path;
      } else if (Array.isArray(raw) && typeof raw[0] === "string") {
        vStr = raw[0];
      }

      const resolveUrl = (val: string) => {
        // Pour les guides, utiliser toujours l'endpoint API qui sert les données BYTEA
        if (mode === "edit" && initialValues?.id) {
          const url = `${serverOrigin}/api/guides/${initialValues.id}/photo`;
          return url;
        }
        // Fallback pour les autres cas (même si normalement pas utilisé pour les guides)
        return val;
      };

      const finalUrl = vStr ? resolveUrl(vStr) : "";

      setPhotoPreview(finalUrl);
    }
  }, [mode, initialValues]);

  // Gérer le téléchargement de photo
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedPhoto(file);
      // Créer une URL pour l'aperçu
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          setPhotoPreview(reader.result.toString());
          form.setValue("photo", reader.result.toString());
          setPhotoRemoved(false);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Supprimer la photo sélectionnée
  const handleRemovePhoto = () => {
    setSelectedPhoto(null);
    setPhotoPreview("");
    form.setValue("photo", "");
    setPhotoRemoved(true);
    // Réinitialiser l'input file
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Déclencheur pour l'input de fichier caché
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const onSubmit = async (data: HuntingGuideFormValues) => {
    console.log("Données du formulaire soumises:", data);
    console.log("JSON.stringify(data):", JSON.stringify(data)); // Format exact envoyé au serveur
    console.log("zone et region:", { zone: data.zone, region: data.region }); // Valeurs spécifiques
    setSubmitting(true);
    try {
      if (mode === "edit" && initialValues) {
        // Construire le payload de mise à jour
        const payload: any = {
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          region: normalizeRegion(user?.role === 'agent' ? user?.region : data.region),
          // le backend accepte departement ou zone
          departement: data.zone,
          idNumber: data.idNumber,
          zoneId: data.zoneId ? parseInt(data.zoneId) : null,
        };

        // Inclure username si présent
        if (data.username && data.username.trim().length > 0) {
          payload.username = data.username.trim();
        }

        // Inclure password seulement si saisi
        if (data.password && data.password.trim().length > 0) {
          payload.password = data.password;
        }

        // Gérer la photo: envoyer si une nouvelle ou si suppression demandée
        if (photoRemoved) {
          payload.photo = ""; // effacer
        } else if (selectedPhoto) {
          // Pour un nouveau fichier uploadé, envoyer les données base64
          const response = await apiRequest({
            url: `/api/guides/${initialValues.id}/photo`,
            method: "POST",
            data: { photoData: data.photo },
          });
          // Plus besoin de payload.photo car les données sont déjà stockées
        }
        // Si pas de changement, garder la valeur existante

        await apiRequest({
          url: `/api/guides/${initialValues.id}`,
          method: "PUT",
          data: payload,
        });

        toast({ title: "Guide mis à jour", description: "Les informations ont été enregistrées." });
        queryClient.invalidateQueries({ queryKey: ["/api/guides"] });
        onSuccess?.();
      } else {
        // Création: envoyer aussi `departement` pour lever toute ambiguïté côté backend
        const payload = {
          ...data,
          region: normalizeRegion(user?.role === 'agent' ? user?.region : data.region),
          departement: data.zone,
          zoneId: data.zoneId ? parseInt(data.zoneId) : null,
        } as any;

        const response = await apiRequest({
          url: "/api/guides",
          method: "POST",
          data: payload,
        }) as { id: number };

        console.log("Réponse API:", response);

        // Si une photo a été sélectionnée, l'uploader maintenant que le guide existe
        if (selectedPhoto && data.photo && response.id) {
          try {
            await apiRequest({
              url: `/api/guides/${response.id}/photo`,
              method: "POST",
              data: { photoData: data.photo },
            });
          } catch (photoError) {
            console.error("Erreur lors de l'upload de la photo:", photoError);
            toast({
              title: "Guide créé",
              description: "Le guide a été créé mais l'upload de la photo a échoué.",
              variant: "destructive"
            });
          }
        }

        toast({
          title: "Guide de chasse créé",
          description: "Le guide de chasse a été ajouté avec succès.",
        });

        queryClient.invalidateQueries({ queryKey: ["/api/guides"] });
        form.reset();
        setSelectedPhoto(null);
        setPhotoPreview("");
        onSuccess?.();
      }
    } catch (error: any) {
      console.error("Erreur lors de la création du guide de chasse:", error);

      // Message d'erreur plus détaillé (compatible avec apiRequest)
      let errorMessage = "Une erreur est survenue lors de la création du guide de chasse. Veuillez réessayer.";

      if (error?.body?.message) {
        errorMessage = error.body.message;
      } else if (error?.body?.error) {
        errorMessage = error.body.error;
      } else if (error?.message) {
        errorMessage = error.message;
      }

      toast({
        title: "Erreur",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Convertir l'objet regionDisplayNames en tableau pour le Select
  const regionOptions = Object.entries(regionDisplayNames).map(([key, value]) => ({
    value: key,
    label: value,
  }));

  return (
    <>
      {isCreateMode ? (
        <Card className="w-full max-w-2xl mx-auto">
          <CardHeader className="sticky top-0 z-20 bg-background border-b">
            <CardTitle>
              Ajouter un nouveau Guide de Chasse
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Informations personnelles */}
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prénom *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Prénom"
                        {...field}
                        className="font-bold"
                        disabled={isFieldLocked('firstName')}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^a-zA-ZÀ-ÿ\s'-]/g, '');
                          const capitalized = raw.charAt(0).toUpperCase() + raw.slice(1);
                          field.onChange(capitalized);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="NOM"
                        {...field}
                        className="uppercase font-bold"
                        disabled={isFieldLocked('lastName')}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^a-zA-ZÀ-ÿ\s'-]/g, '');
                          field.onChange(raw.toUpperCase());
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Téléphone</FormLabel>
                    <FormControl>
                      <Input
                        type="tel"
                        placeholder="XX XXX XX XX"
                        {...field}
                        className="font-bold"
                        disabled={isFieldLocked('phone')}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          let formatted = '';
                          for (let i = 0; i < raw.length && i < 10; i++) {
                            if (i === 2 || i === 5 || i === 7) formatted += ' ';
                            formatted += raw[i];
                          }
                          field.onChange(formatted);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="idNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>N° de pièce d'identité</FormLabel>
                    <FormControl>
                      <Input placeholder="Numéro de pièce d'identité" {...field} disabled={isFieldLocked('idNumber')} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="region"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Région</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isFieldLocked('region') || user?.role === 'agent'}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionnez une région" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {regionOptions.map((region) => (
                          <SelectItem key={region.value} value={region.value}>
                            {region.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {user?.role === 'agent' && (
                      <FormDescription>
                        Vous êtes agent régional: la région est verrouillée sur <strong>{regionOptions.find(r => r.value === field.value)?.label || field.value}</strong>.
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="zone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Département</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isFieldLocked('zone') || departments.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={departments.length === 0 ?
                            "Sélectionnez d'abord une région" :
                            "Sélectionnez un département"}
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {departments.map((dept) => (
                          <SelectItem key={dept.value} value={dept.value}>
                            {dept.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Zone affectée (ZIC, Amodiée, Parc, Régulation) */}
              <FormField
                control={form.control}
                name="zoneId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Zone</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || ""}
                      disabled={huntingZones.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={huntingZones.length === 0 ? "Aucune zone pour cette région/département" : "Sélectionnez une zone"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {huntingZones.map((z) => (
                          <SelectItem key={z.id} value={String(z.id)}>
                            {z.name} ({z.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Informations de compte */}
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom d'utilisateur</FormLabel>
                    <FormControl>
                      <Input placeholder="Nom d'utilisateur pour la connexion" {...field} autoComplete="off" />
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
                    <FormLabel>
                      Mot de passe
                    </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Mot de passe"
                            {...field}
                            autoComplete="new-password"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

              <FormField
                control={form.control}
                name="photo"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Photo du guide (optionnelle)</FormLabel>
                    <div className="flex items-center gap-4">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handlePhotoUpload}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={triggerFileInput}
                        className="cursor-pointer h-10 w-10 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        <Paperclip className="h-5 w-5" />
                      </Button>
                      <div className="flex-1 relative">
                        <Input
                          placeholder="Aucun fichier sélectionné"
                          value={selectedPhoto ? selectedPhoto.name : ""}
                          readOnly
                          className="pr-10"
                        />
                        {selectedPhoto && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full"
                            onClick={handleRemovePhoto}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {photoPreview && (
                      <div className="mt-2">
                        <img
                          src={photoPreview}
                          alt="Aperçu de la photo"
                          className="max-h-48 max-w-full rounded-md border border-gray-200 dark:border-gray-800 object-contain"
                          onLoad={() => {}}
                          onError={(e) => {
                            const imgElement = e.currentTarget as HTMLImageElement;
                            setPhotoPreview("");
                          }}
                        />
                      </div>
                    )}
                    <FormDescription>
                      Téléchargez une photo du guide de chasse (cliquez sur le trombone)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

                <CardFooter className="sticky bottom-0 z-20 bg-background flex justify-end border-t pt-4 px-0">
                  <Button type="button" variant="outline" onClick={onCancel || (() => {})} className="mr-2">Annuler</Button>
                  <Button
                    type="submit"
                    disabled={submitting || !form.formState.isValid || !form.formState.isDirty}
                    className="bg-green-600 hover:bg-green-700"
                  >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Création en cours...
                  </>
                ) : (
                  "Créer le guide de chasse"
                )}
                  </Button>
                </CardFooter>
              </form>
            </Form>
          </CardContent>
        </Card>
      ) : (
        <div className="w-full">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Informations personnelles */}
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prénom * {mode === "edit" && <PencilButton fieldName="firstName" />}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Prénom"
                          {...field}
                          className="font-bold"
                          disabled={isFieldLocked('firstName')}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^a-zA-ZÀ-ÿ\s'-]/g, '');
                            const capitalized = raw.charAt(0).toUpperCase() + raw.slice(1);
                            field.onChange(capitalized);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nom * {mode === "edit" && <PencilButton fieldName="lastName" />}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="NOM"
                          {...field}
                          className="uppercase font-bold"
                          disabled={isFieldLocked('lastName')}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^a-zA-ZÀ-ÿ\s'-]/g, '');
                            field.onChange(raw.toUpperCase());
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Téléphone {mode === "edit" && <PencilButton fieldName="phone" />}</FormLabel>
                      <FormControl>
                        <Input
                          type="tel"
                          placeholder="XX XXX XX XX"
                          {...field}
                          className="font-bold"
                          disabled={isFieldLocked('phone')}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9]/g, '');
                            let formatted = '';
                            for (let i = 0; i < raw.length && i < 10; i++) {
                              if (i === 2 || i === 5 || i === 7) formatted += ' ';
                              formatted += raw[i];
                            }
                            field.onChange(formatted);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="idNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>N° de pièce d'identité {mode === "edit" && <PencilButton fieldName="idNumber" />}</FormLabel>
                      <FormControl>
                        <Input placeholder="Numéro de pièce d'identité" {...field} disabled={isFieldLocked('idNumber')} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="region"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Région {mode === "edit" && <PencilButton fieldName="region" />}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isFieldLocked('region') || user?.role === 'agent'}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionnez une région" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {regionOptions.map((region) => (
                            <SelectItem key={region.value} value={region.value}>
                              {region.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {user?.role === 'agent' && (
                        <FormDescription>
                          Vous êtes agent régional: la région est verrouillée sur <strong>{regionOptions.find(r => r.value === field.value)?.label || field.value}</strong>.
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="zone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Département {mode === "edit" && <PencilButton fieldName="zone" />}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isFieldLocked('zone') || departments.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={departments.length === 0 ?
                              "Sélectionnez d'abord une région" :
                              "Sélectionnez un département"}
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {departments.map((dept) => (
                            <SelectItem key={dept.value} value={dept.value}>
                              {dept.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Zone affectée (ZIC, Amodiée, Parc, Régulation) */}
                <FormField
                  control={form.control}
                  name="zoneId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Zone {mode === "edit" && <PencilButton fieldName="zoneId" />}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || ""}
                        disabled={isFieldLocked('zoneId') || huntingZones.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={huntingZones.length === 0 ? "Aucune zone pour cette région/département" : "Sélectionnez une zone"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {huntingZones.map((z) => (
                            <SelectItem key={z.id} value={String(z.id)}>
                              {z.name} ({z.type})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nom d'utilisateur {mode === "edit" && <PencilButton fieldName="username" />}</FormLabel>
                      <FormControl>
                        <Input placeholder="Nom d'utilisateur pour la connexion" {...field} disabled={isFieldLocked('username')} />
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
                      <FormLabel>
                        Mot de passe {mode === "edit" && <PencilButton fieldName="password" />}
                        {mode === "edit" && unlockedFields.has('password') && <span className="text-muted-foreground ml-1">(laisser vide pour ne pas changer)</span>}
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Mot de passe"
                            {...field}
                            disabled={isFieldLocked('password')}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="photo"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Photo du guide (optionnelle) {mode === "edit" && <PencilButton fieldName="photo" />}</FormLabel>
                      <div className="flex items-center gap-4">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          ref={fileInputRef}
                          onChange={handlePhotoUpload}
                          disabled={isFieldLocked('photo')}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={triggerFileInput}
                          className="cursor-pointer h-10 w-10 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                          disabled={isFieldLocked('photo')}
                        >
                          <Paperclip className="h-5 w-5" />
                        </Button>
                        <div className="flex-1 relative">
                          <Input
                            placeholder="Aucun fichier sélectionné"
                            value={selectedPhoto ? selectedPhoto.name : ""}
                            readOnly
                            className="pr-10"
                          />
                          {selectedPhoto && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full"
                              onClick={handleRemovePhoto}
                              disabled={isFieldLocked('photo')}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {photoPreview && (
                        <div className="mt-2">
                          <img
                            src={photoPreview}
                            alt="Aperçu de la photo"
                            className="max-h-48 max-w-full rounded-md border border-gray-200 dark:border-gray-800 object-contain"
                            onLoad={() => console.log(`✅ [FRONTEND] Image chargée avec succès: ${photoPreview}`)}
                            onError={(e) => {
                              console.error(`❌ [FRONTEND] Erreur de chargement d'image: ${photoPreview}`, e);
                              const imgElement = e.currentTarget as HTMLImageElement;
                              console.error(`❌ [FRONTEND] Code d'erreur:`, imgElement ? 'Image element error' : 'Unknown error');
                              setPhotoPreview("");
                            }}
                          />
                        </div>
                      )}
                      <FormDescription>
                        Téléchargez une photo du guide de chasse (cliquez sur le trombone)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end border-t pt-4">
                <Button type="button" variant="outline" onClick={onCancel || (() => {})} className="mr-2">Annuler</Button>
                <Button
                  type="submit"
                  disabled={submitting || !form.formState.isValid || !form.formState.isDirty}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {mode === "edit" ? "Enregistrement..." : "Création en cours..."}
                    </>
                  ) : (
                    mode === "edit" ? "Enregistrer" : "Créer le guide de chasse"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      )}
    </>
  );
}
