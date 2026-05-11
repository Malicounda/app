import React, { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle } from "lucide-react";


// Schéma de validation unifié
const formSchema = z.object({
  permitType: z.string().min(1, "Le type de permis est requis."),
  weaponType: z.string().min(1, "Le type d'arme est requis."),
  weaponBrand: z.string().optional(),
  weaponReference: z.string().optional(),
  weaponCaliber: z.string().optional(),
  weaponOtherName: z.string().optional(),
  weaponOtherCaliber: z.string().optional(),
  weaponBrandOther: z.string().optional(),
  weaponCaliberOther: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.weaponType === 'autre') {
    if (!data.weaponOtherName || data.weaponOtherName.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Veuillez préciser le nom de l'arme.", path: ["weaponOtherName"] });
    }
  }

  if (data.weaponType === 'fusil' || data.weaponType === 'carabine') {
    if (!data.weaponBrand) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La marque est requise.", path: ["weaponBrand"] });
    if (!data.weaponReference) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La référence est requise.", path: ["weaponReference"] });
    if (!data.weaponCaliber) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Le calibre est requis.", path: ["weaponCaliber"] });

    if (data.weaponBrand === 'autre' && !data.weaponBrandOther) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Veuillez préciser la marque.", path: ["weaponBrandOther"] });
    }
    if (data.weaponCaliber === 'autre' && !data.weaponCaliberOther) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Veuillez préciser le calibre.", path: ["weaponCaliberOther"] });
    }
  }
});

type FormValues = z.infer<typeof formSchema>;

// Constantes pour les options de sélection
const PERMIT_TYPES = [
  { value: 'sportif-petite-chasse', label: 'Permis sportif de petite chasse' },
  { value: 'grande-chasse', label: 'Permis de grande chasse' },
  { value: 'special-gibier-eau', label: 'Permis spécial gibier d’eau' },
];


type WeaponTypeItem = { id: string; code: string; label: string; isActive?: boolean };
type WeaponBrandItem = { id: string; code: string; label: string; weaponTypeId?: string; isActive?: boolean };
type WeaponCaliberItem = { id: string; code: string; label: string; weaponTypeId?: string; isActive?: boolean };

const HuntingPermitRequest: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);

  // Dynamic weapon data
  const [weaponTypes, setWeaponTypes] = useState<WeaponTypeItem[]>([]);
  const [weaponBrands, setWeaponBrands] = useState<WeaponBrandItem[]>([]);
  const [weaponCalibers, setWeaponCalibers] = useState<WeaponCaliberItem[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      permitType: "",
      weaponType: "",
      weaponBrand: "",
      weaponReference: "",
      weaponCaliber: "",
      weaponOtherName: "",
      weaponOtherCaliber: "",
      weaponBrandOther: "",
      weaponCaliberOther: "",
    },
  });

  const permitType = form.watch("permitType");
  const weaponType = form.watch("weaponType");
  const weaponBrand = form.watch("weaponBrand");
  const weaponCaliber = form.watch("weaponCaliber");

  // Réinitialise le type d'arme quand le permis change
  useEffect(() => {
    // Ne s'exécute que si permitType a une valeur (pour éviter de tourner au montage initial)
    if (permitType) {
      form.setValue("weaponType", "");
    }
  }, [permitType, form.setValue]);

  // Réinitialise les détails de l'arme quand le type d'arme change
  useEffect(() => {
    // Ne s'exécute que si weaponType a une valeur
    if (weaponType) {
      form.setValue("weaponBrand", "");
      form.setValue("weaponReference", "");
      form.setValue("weaponCaliber", "");
      form.setValue("weaponOtherName", "");
      form.setValue("weaponOtherCaliber", "");
      form.setValue("weaponBrandOther", "");
      form.setValue("weaponCaliberOther", "");
    }
  }, [weaponType, form.setValue]);

  useEffect(() => {
    if (weaponBrand !== 'autre') {
      form.setValue("weaponBrandOther", "");
    }
  }, [weaponBrand, form.setValue]);

  useEffect(() => {
    if (weaponCaliber !== 'autre') {
      form.setValue("weaponCaliberOther", "");
    }
  }, [weaponCaliber, form.setValue]);

  // Load weapon types on mount
  useEffect(() => {
    const loadTypes = async () => {
      try {
        const data = await apiRequest<WeaponTypeItem[]>({ url: '/api/weapons/types', method: 'GET' });
        setWeaponTypes(data);
      } catch (e: any) {
        console.error(e);
        toast({ variant: 'destructive', title: 'Erreur', description: "Impossible de charger les types d'armes" });
      }
    };
    loadTypes();
  }, [toast]);

  // Fetch brands & calibers when weaponType changes
  useEffect(() => {
    const selectedType = weaponTypes.find(t => t.code === weaponType);
    if (!selectedType) {
      setWeaponBrands([]);
      setWeaponCalibers([]);
      return;
    }
    const loadBrandsAndCalibers = async () => {
      try {
        const [brands, calibers] = await Promise.all([
          apiRequest<WeaponBrandItem[]>({ url: `/api/weapons/brands?typeId=${encodeURIComponent(selectedType.id)}`, method: 'GET' }),
          apiRequest<WeaponCaliberItem[]>({ url: `/api/weapons/calibers?typeId=${encodeURIComponent(selectedType.id)}`, method: 'GET' })
        ]);
        setWeaponBrands(brands || []);
        setWeaponCalibers(calibers || []);
      } catch (e: any) {
        console.error(e);
        toast({ variant: 'destructive', title: 'Erreur', description: "Impossible de charger les marques/calibres" });
      }
    };
    loadBrandsAndCalibers();
  }, [weaponType, weaponTypes, toast]);

  const availableWeapons = useMemo(() => {
    if (!permitType) return [] as { value: string; label: string }[];
    const all = weaponTypes.map(w => ({ value: w.code, label: w.label }));
    const filterByCodes = (codes: string[]) => all.filter(w => codes.includes(w.value)).concat([{ value: 'autre', label: 'Autre' }]);
    switch (permitType) {
      case 'grande-chasse':
        return filterByCodes(['carabine', 'arbalete', 'arc']);
      case 'sportif-petite-chasse':
        return filterByCodes(['fusil', 'arbalete', 'arc', 'lance-pierre']);
      case 'special-gibier-eau':
        return filterByCodes(['fusil']);
      default:
        return [];
    }
  }, [permitType, weaponTypes]);

  const availableBrands = useMemo(() => {
    if (!(weaponType === 'fusil' || weaponType === 'carabine')) return [] as { value: string; label: string }[];
    const items = weaponBrands.map((b: WeaponBrandItem) => ({ value: b.code, label: b.label }));
    return items.concat([{ value: 'autre', label: 'Autre' }]);
  }, [weaponType, weaponBrands]);

  const availableCalibers = useMemo(() => {
    if (!(weaponType === 'fusil' || weaponType === 'carabine')) return [] as { value: string; label: string }[];
    const items = weaponCalibers.map((c: WeaponCaliberItem) => ({ value: c.code, label: c.label }));
    return items.concat([{ value: 'autre', label: 'Autre' }]);
  }, [weaponType, weaponCalibers]);

  const showWeaponDetails = weaponType === 'fusil' || weaponType === 'carabine';
  const showOtherWeaponField = weaponType === 'autre';

  const nextStep = async () => {
    let fieldsToValidate: (keyof FormValues)[] = [];
    if (currentStep === 1) {
      fieldsToValidate = ['permitType'];
    } else if (currentStep === 2) {
      fieldsToValidate = ['weaponType'];
      if (form.getValues('weaponType') === 'autre') {
        fieldsToValidate.push('weaponOtherName');
      }
    }
    const isValid = await form.trigger(fieldsToValidate);
    if (isValid) {
      setCurrentStep(s => s + 1);
    }
  };

  const prevStep = () => setCurrentStep(s => s - 1);

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    try {
      await apiRequest<void>({ url: '/api/hunting-permits/request', method: 'POST', data: { ...data, hunterId: user?.id } });

      setSubmissionSuccess(true);
      toast({ title: "Succès", description: "Votre demande de permis a été soumise avec succès." });

    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: error.message || "La soumission a échoué." });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submissionSuccess) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center">
        <Alert variant="default" className="bg-green-50 border-green-200">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <AlertTitle className="text-green-800">Demande Soumise !</AlertTitle>
          <AlertDescription className="text-green-700">Votre demande a bien été enregistrée.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Demande de Permis de Chasse</h1>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Étape {currentStep} sur 3</CardTitle>
            </CardHeader>
            <CardContent>
              {currentStep === 1 && (
                <FormField
                  control={form.control}
                  name="permitType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type de Permis</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionnez un type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PERMIT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {currentStep === 2 && (
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="weaponType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type d'arme</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Sélectionnez une arme" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {availableWeapons.map(w => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {showWeaponDetails && (
                    <div className="space-y-4 border-t pt-4 mt-4">
                      <FormField
                        control={form.control}
                        name="weaponBrand"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Marque</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Sélectionnez une marque" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {availableBrands.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {weaponBrand === 'autre' && (
                        <FormField
                          control={form.control}
                          name="weaponBrandOther"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Précisez la marque</FormLabel>
                              <FormControl>
                                <Input placeholder="Marque de l'arme" {...field} value={field.value || ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                      <FormField
                        control={form.control}
                        name="weaponReference"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Référence</FormLabel>
                            <FormControl>
                              <Input placeholder="Référence de l'arme" {...field} value={field.value || ''} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="weaponCaliber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Calibre</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Sélectionnez un calibre" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {availableCalibers.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {weaponCaliber === 'autre' && (
                        <FormField
                          control={form.control}
                          name="weaponCaliberOther"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Précisez le calibre</FormLabel>
                              <FormControl>
                                <Input placeholder="Calibre de l'arme" {...field} value={field.value || ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                  )}
                  {showOtherWeaponField && (
                    <div className="space-y-4 border-t pt-4 mt-4">
                       <FormField
                        control={form.control}
                        name="weaponOtherName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nom de l'arme</FormLabel>
                            <FormControl>
                              <Input placeholder="Ex: Couteau de chasse" {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="weaponOtherCaliber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Calibre (Optionnel)</FormLabel>
                            <FormControl>
                              <Input placeholder="Calibre (si applicable)" {...field} value={field.value || ''} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>
              )}
              {currentStep === 3 && (
                <div>
                  <h3 className="text-lg font-medium mb-4">Récapitulatif</h3>
                  <div className="space-y-2 text-sm">
                    <p><strong>Type de permis:</strong> {PERMIT_TYPES.find(p => p.value === form.getValues("permitType"))?.label}</p>
                    <p><strong>Arme:</strong> {weaponType === 'autre' ? form.getValues('weaponOtherName') : weaponTypes.find(w => w.code === weaponType)?.label}</p>
                    {showWeaponDetails && (
                      <>
                        <p><strong>Marque:</strong> {form.getValues("weaponBrand") === 'autre' ? form.getValues("weaponBrandOther") : availableBrands.find((b) => b.value === form.getValues("weaponBrand"))?.label || 'N/A'}</p>
                        <p><strong>Référence:</strong> {form.getValues("weaponReference") || 'N/A'}</p>
                        <p><strong>Calibre:</strong> {form.getValues("weaponCaliber") === 'autre' ? form.getValues("weaponCaliberOther") : availableCalibers.find((c) => c.value === form.getValues("weaponCaliber"))?.label || 'N/A'}</p>
                      </>
                    )}
                    {showOtherWeaponField && form.getValues('weaponOtherCaliber') && (
                      <p><strong>Calibre (autre):</strong> {form.getValues('weaponOtherCaliber')}</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="flex justify-between mt-8">
            <Button type="button" variant="outline" onClick={prevStep} disabled={currentStep === 1}>Précédent</Button>
            {currentStep < 3 ? (
              <Button type="button" onClick={nextStep}>Suivant</Button>
            ) : (
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Soumettre
              </Button>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
};

export default HuntingPermitRequest;
