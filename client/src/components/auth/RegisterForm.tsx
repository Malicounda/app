import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { countriesList, getNationality } from "@/lib/countries";
import { afterLoginRefreshAll, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { getHomePage } from "@/utils/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { debounce } from "lodash";
import { Eye, EyeOff } from "lucide-react";
import React, { useEffect, useRef, useState } from 'react';
import { useForm } from "react-hook-form";
import { useLocation } from 'wouter';
import { z } from "zod";

interface RegisterFormProps {
  userType: string;
  embedded?: boolean; // Affichage embarqué (modal), on cache le panneau gauche et on adapte la hauteur
  initialStep?: 1 | 2; // Forcer l'étape initiale (ex: 2 quand on intègre dans l'espace chasseur)
  onCompleted?: () => void; // Callback appelé après complétion réussie du profil
  onSubmittingChange?: (submitting: boolean) => void; // Signale l'état de soumission pour désactiver certaines actions externes
}

// Créer le schéma Zod pour le formulaire
const registerSchema = z.object({
  username: z.string().min(3, "Le nom d'utilisateur doit contenir au moins 3 caractères"),
  email: z.string().email("Adresse email invalide"),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères"),
  confirmPassword: z.string(),
  firstName: z.string().min(2, "Le prénom doit contenir au moins 2 caractères").regex(/^[A-Za-zÀ-ſ\s\-]+$/, { message: "Le prénom ne doit contenir que des lettres" }).transform(val => val.charAt(0).toUpperCase() + val.slice(1).toLowerCase()),
  lastName: z.string().min(2, "Le nom de famille doit contenir au moins 2 caractères").regex(/^[A-Za-zÀ-ſ\s\-]+$/, { message: "Le nom de famille ne doit contenir que des lettres" }).transform(val => val.charAt(0).toUpperCase() + val.slice(1).toLowerCase()),
  role: z.string().default("hunter")
}).refine((data) => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
});

// Schéma pour les informations du tuteur (si le chasseur est mineur)
const tutorInfoSchema = z.object({
  tutorFirstName: z.string().min(1, "Prénom du tuteur requis"),
  tutorLastName: z.string().min(1, "Nom du tuteur requis"),
  tutorIdNumber: z.string().min(1, "Numéro de pièce du tuteur requis"),
  tutorPhone: z.string().min(9, "Numéro de téléphone du tuteur invalide"),
  letterConfirmation: z.boolean().refine(val => val === true, {
    message: "Vous devez confirmer la lettre de responsabilité"
  })
});

// Schéma pour les informations spécifiques aux chasseurs
const hunterInfoSchema = z.object({
  phone: z.string(),
  idNumber: z.string().min(1, "Numéro de pièce requis").refine((val) => /^[a-zA-Z0-9]+$/.test(val), {
    message: "Le numéro de pièce ne doit contenir que des caractères alphanumériques"
  }),
  pays: z.string().min(1, "Pays requis"),
  nationality: z.string().optional(),
  address: z.string().min(1, "Adresse requise"),
  dateOfBirth: z.string()
    .min(1, "Date de naissance requise")
    .refine((value) => {
      // Validation d'âge: entre 10 et 70 ans
      const d = new Date(value);
      if (isNaN(d.getTime())) return false;
      const today = new Date();
      const age = today.getFullYear() - d.getFullYear() - ((today.getMonth() < d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())) ? 1 : 0);
      return age >= 10 && age <= 70;
    }, { message: "L'âge doit être compris entre 10 et 70 ans" }),
  profession: z.string().min(1, "Profession requise")
    .refine(val => /^[A-Za-z\u00C0-\u017F\s\-]+$/.test(val), {
      message: "La profession ne doit contenir que des lettres"
    }),
  experience: z.coerce.number().nonnegative("L'expérience doit être un nombre positif"),
  category: z.string(),
  tutorFirstName: z.string().optional(),
  tutorLastName: z.string().optional(),
  tutorIdNumber: z.string().optional(),
  tutorPhone: z.string().optional(),
  letterConfirmation: z.boolean().optional()
}).superRefine((data, ctx) => {
  // Ensure category consistency based on country
  if (data.pays === "Sénégal" && data.category !== "resident") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "La catégorie doit être 'Résident' pour le Sénégal",
      path: ["category"],
    });
  }
  if (data.category === "resident" && (!data.phone || data.phone.trim() === "")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Le numéro de téléphone est obligatoire pour les résidents",
      path: ["phone"]
    });
  }
});

// Ne pas utiliser de fonction de formatage pour les champs de téléphone
// Nous affichons uniquement le placeholder +221 XX XXX XX XX pour guider l'utilisateur

export default function RegisterForm({ userType, embedded = false, initialStep, onCompleted, onSubmittingChange }: RegisterFormProps) {
  const [location, navigate] = useLocation();
  // step: 1 = hunter form (now), 2 = account creation
  const [step, setStep] = useState(initialStep ?? 1);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();

  const isHunterProfileIncomplete = React.useCallback(() => {
    if (!user || user.role !== 'hunter') return false;
    let profileCompleted = false;
    try {
      profileCompleted = localStorage.getItem('profileCompleted') === 'true';
    } catch {}
    return !user.hunterId || !profileCompleted;
  }, [user]);

  // Nouveau flux: ne plus lire ?step=2 depuis l'URL.
  // On respecte uniquement la prop initialStep quand elle est fournie.
  useEffect(() => {
    // Ne respecter initialStep que pour le mode embarqué (dashboard)
    if (embedded && initialStep) {
      setStep(initialStep);
    } else if (!embedded) {
      // En mode page standalone, toujours démarrer à l'étape 1
      setStep(1);
    }
  }, [initialStep, embedded]);

  // Configurer le formulaire pour les informations de base
  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      firstName: "",
      lastName: "",
      role: userType || "hunter"
    },
  });

  // États d'affichage de disponibilité (public uniquement)
  const [usernameAvailability, setUsernameAvailability] = useState<null | boolean>(null);
  const [emailAvailability, setEmailAvailability] = useState<null | boolean>(null);

  // En mode public, forcer un formulaire vierge à l'ouverture (éviter tout préremplissage)
  useEffect(() => {
    if (embedded) return;
    form.reset({
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      firstName: "",
      lastName: "",
      role: userType || "hunter",
    });
    setUsernameAvailability(null);
    setEmailAvailability(null);
  }, [embedded, form, userType]);

  // Vérifications asynchrones de disponibilité (username/email) avec debounce – seulement en mode public
  const usernameCheckRef = useRef(
    debounce(async (value: string) => {
      try {
        if (!value || value.trim().length < 3) return;
        const res = await apiRequest<{ available: boolean }>({ url: `/api/auth/check-username?u=${encodeURIComponent(value)}`, method: 'GET' });
        setUsernameAvailability(res.available);
        if (!res.available) {
          form.setError('username' as any, { type: 'server', message: `Ce nom d'utilisateur est déjà utilisé. Veuillez en choisir un autre.` });
        } else {
          // Ne pas effacer d'autres erreurs éventuelles sur ce champ (ex: longueur)
          if (form.getFieldState('username').error?.type === 'server') form.clearErrors('username');
        }
      } catch (e) {
        // silencieux: ne pas bloquer la saisie si le check échoue
      }
    }, 500)
  );

  const emailCheckRef = useRef(
    debounce(async (value: string) => {
      try {
        if (!value) return;
        // Vérifier rapidement le format
        const ok = z.string().email().safeParse(value).success;
        if (!ok) return;
        const res = await apiRequest<{ available: boolean }>({ url: `/api/auth/check-email?e=${encodeURIComponent(value)}`, method: 'GET' });
        setEmailAvailability(res.available);
        if (!res.available) {
          form.setError('email' as any, { type: 'server', message: `Cette adresse email est déjà rattachée à un compte.` });
        } else {
          if (form.getFieldState('email').error?.type === 'server') form.clearErrors('email');
        }
      } catch (e) {
        // silencieux
      }
    }, 500)
  );

  useEffect(() => {
    if (embedded) return; // uniquement pour la page publique
    const sub = form.watch((values, info) => {
      if (info.name === 'username') {
        const v = values.username || '';
        if (!v) setUsernameAvailability(null);
        usernameCheckRef.current(v);
      } else if (info.name === 'email') {
        const v = values.email || '';
        if (!v) setEmailAvailability(null);
        emailCheckRef.current(v);
      }
    });
    return () => {
      sub.unsubscribe();
      try { usernameCheckRef.current.cancel(); } catch {}
      try { emailCheckRef.current.cancel(); } catch {}
    };
  }, [form, embedded]);

  // Mise à jour des valeurs par défaut lorsque le userType changes
  useEffect(() => {
    form.setValue('role', userType);
  }, [userType, form]);

  // Configurer le formulaire pour les informations de chasseur
  const hunterForm = useForm<z.infer<typeof hunterInfoSchema>>({
    resolver: zodResolver(hunterInfoSchema),
    defaultValues: {
      idNumber: "",
      pays: "",
      address: "Adresse par défaut",
      phone: "",
      dateOfBirth: "",
      profession: "",
      experience: 0,
      category: "resident", // Valeur par défaut définie sur "resident"
      tutorFirstName: "",
      tutorLastName: "",
      tutorIdNumber: "",
      tutorPhone: "",
      letterConfirmation: false
    },
    mode: "all"
  });

  // État pour suivre si le chasseur est mineur
  const [isMinor, setIsMinor] = useState(false);
  const [currentAge, setCurrentAge] = useState<number | null>(null);

  // Contraintes pour la date de naissance: âge entre 10 et 70 ans
  const dobBounds = React.useMemo(() => {
    const today = new Date();
    const min = new Date(today);
    min.setFullYear(min.getFullYear() - 70);
    const max = new Date(today);
    max.setFullYear(max.getFullYear() - 10);
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    return { minStr: fmt(min), maxStr: fmt(max) };
  }, []);

  // Ajouter des logs pour suivre les changements de catégorie
  useEffect(() => {
    const subscription = hunterForm.watch((value, { name }) => {
      if (name === "category") {
        console.log(' Catégorie changée:', value.category);
      }
      if (name === "pays" && value.pays === "Sénégal") {
        hunterForm.setValue("category", "resident");
        const categorySelect = document.querySelector('#category-select') as HTMLElement | null;
        if (categorySelect) {
          const touristOption = categorySelect.querySelector('option[value="touristique"]') as HTMLElement | null;
          if (touristOption) {
            touristOption.style.display = 'none';
          }
        }
      } else {
        const categorySelect = document.querySelector('#category-select') as HTMLElement | null;
        if (categorySelect) {
          const touristOption = categorySelect.querySelector('option[value="touristique"]') as HTMLElement | null;
          if (touristOption) {
            touristOption.style.display = 'block';
          }
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [hunterForm]);

  // Synchroniser la nationalité automatiquement à partir du pays sélectionné
  useEffect(() => {
    // initial set
    const initialPays = hunterForm.getValues().pays;
    if (initialPays) {
      hunterForm.setValue('nationality', getNationality(initialPays) || initialPays, { shouldValidate: true, shouldDirty: true });
    }

    const sub = hunterForm.watch((v, { name }) => {
      if (name === 'pays') {
        const nat = getNationality(v.pays) || v.pays;
        hunterForm.setValue('nationality', nat, { shouldValidate: true, shouldDirty: true });
      }
    });

    return () => sub.unsubscribe();
  }, [hunterForm]);

  // Vérifier l'âge lorsque la date de naissance change
  const checkAge = (birthDateStr: string) => {
    try {
      const birthDate = new Date(birthDateStr);

      // Vérifier si la date est valide
      if (isNaN(birthDate.getTime())) {
        setCurrentAge(null);
        setIsMinor(false);
        return;
      }

      const today = new Date();

      // Calcul d'âge précis
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();

      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }

      // Mise à jour des états
      setIsMinor(age >= 10 && age < 18);
      setCurrentAge(age);
    } catch (error) {
      console.error("Erreur dans le calcul de l'âge:", error);
      setCurrentAge(null);
      setIsMinor(false);
    }
  };

  // État pour le masquage/affichage des mots de passe
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Gérer la soumission du formulaire d'inscription de base (étape 1)
  const onSubmitBasicInfo = async (data: z.infer<typeof registerSchema>) => {
    try {
      console.log(' DEBUG: Début de la création du compte utilisateur');
      console.log(' DEBUG: Données du formulaire de base:', data);

      // Créer l'utilisateur
      const response = await apiRequest({
        url: "/api/auth/register",
        method: "POST",
        data: {
          username: data.username,
          email: data.email,
          password: data.password,
          firstName: data.firstName,
          lastName: data.lastName,
          role: data.role || "hunter"
        }
      });

      console.log(' DEBUG: Utilisateur créé avec succès:', response);

      // Connexion automatique après inscription
      console.log(' DEBUG: Tentative de connexion automatique');
      const loginResponse = await apiRequest({
        url: "/api/auth/login",
        method: "POST",
        data: {
          identifier: data.email, // Utiliser l'email comme identifiant
          password: data.password
        }
      });

      console.log(' DEBUG: Connexion réussie:', loginResponse);

      // Stocker le token JWT pour authentifier les étapes suivantes sans rediriger
      try {
        const token = (loginResponse as any)?.token;
        if (token) localStorage.setItem("token", token);
      } catch {}

      // Rafraîchir le client de requête pour mettre à jour les informations d'authentification
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      try { await afterLoginRefreshAll(); } catch {}

      // Nouveau flux public: rediriger directement vers /hunter,
      // l'étape 2 se fera dans le modal du tableau de bord chasseur
      navigate('/hunter');
    } catch (error: any) {
      console.error("Erreur lors de l'inscription:", error);
      // Si le backend a renvoyé des erreurs de validation structurées (Zod)
      const body = error?.body;
      const issues = body?.errors;
      const message = body?.message || (error instanceof Error ? error.message : undefined);
      const status = error?.status;
      const enteredUsername = form.getValues().username;
      const enteredEmail = form.getValues().email;

      if (Array.isArray(issues)) {
        // Mapper les erreurs connues vers les champs du formulaire
        issues.forEach((issue: any) => {
          const path = Array.isArray(issue.path) ? issue.path[0] : issue.path;
          const msg = issue.message || 'Champ invalide';
          if (path && typeof path === 'string' && ['username', 'email', 'password', 'firstName', 'lastName', 'confirmPassword', 'role'].includes(path)) {
            form.setError(path as any, { type: 'server', message: msg });
          }
        });
      }

      // Détection spécifique doublons (username/email)
      const lowerMsg = String(message || '').toLowerCase();
      const dupKeywords = ['existe', 'already', 'duplicate', 'pris', 'taken', 'utilisé', 'used'];
      const hasDupKeyword = dupKeywords.some(k => lowerMsg.includes(k));
      const mentionsUsername = lowerMsg.includes('username') || lowerMsg.includes("nom d'utilisateur");
      const mentionsEmail = lowerMsg.includes('email');

      // Priorité: utiliser la réponse normalisée du backend si disponible
      const fieldFromBackend = body?.field as string | undefined;
      const codeFromBackend = body?.code as string | undefined;
      if (status === 409 && (fieldFromBackend === 'username' || codeFromBackend === 'USERNAME_DUPLICATE')) {
        form.setError('username' as any, { type: 'server', message: `Ce nom d'utilisateur est déjà utilisé. Veuillez en choisir un autre.` });
      } else if (status === 409 && (fieldFromBackend === 'email' || codeFromBackend === 'EMAIL_DUPLICATE')) {
        form.setError('email' as any, { type: 'server', message: `Cette adresse email est déjà utilisée. Veuillez en utiliser une autre.` });
      } else if (status === 409 || hasDupKeyword) {
        // Fallback sur mots-clés si pas de field/code
        if (mentionsUsername) {
          form.setError('username' as any, { type: 'server', message: `Ce nom d'utilisateur est déjà utilisé. Veuillez en choisir un autre.` });
        }
        if (mentionsEmail) {
          form.setError('email' as any, { type: 'server', message: `Cette adresse email est déjà utilisée. Veuillez en utiliser une autre.` });
        }
      }

      // Gestion des messages global
      const friendly =
        (status === 409 && (fieldFromBackend === 'username' || codeFromBackend === 'USERNAME_DUPLICATE' || mentionsUsername || hasDupKeyword)) ? `Ce nom d'utilisateur est déjà utilisé. Veuillez en choisir un autre.` :
        (status === 409 && (fieldFromBackend === 'email' || codeFromBackend === 'EMAIL_DUPLICATE' || mentionsEmail || hasDupKeyword)) ? `Cette adresse email est déjà utilisée. Veuillez en utiliser une autre.` :
        message || "Une erreur est survenue lors de l'inscription";
      toast({
        variant: "destructive",
        title: "Erreur d'inscription",
        description: friendly,
      });
    }
  };

  // Gérer la soumission du formulaire d'informations de chasseur
  const onSubmitHunterInfo = async (data: z.infer<typeof hunterInfoSchema>) => {
    try { onSubmittingChange && onSubmittingChange(true); } catch {}
    try {
      console.log(' DEBUG: Début de la création du compte chasseur');
      console.log(' DEBUG: Données de base du formulaire:', JSON.stringify(form.getValues(), null, 2));
      console.log(' DEBUG: Données du formulaire chasseur:', JSON.stringify(data, null, 2));

      // Préparation des données du chasseur alignées avec Hunters
      console.log(' DEBUG catégorie avant envoi:', data.category);
      console.log(' DEBUG État complet du formulaire:', hunterForm.getValues());
      console.log(' DEBUG Erreurs potentielles:', hunterForm.formState.errors);

      // S'assurer que la catégorie est bien définie
      if (!data.category) {
        console.error("ERREUR: La catégorie de chasseur n'est pas spécifiée dans les données soumises");
        // Utiliser une valeur par défaut ou la valeur actuelle de l'état du formulaire
        const formCategory = hunterForm.getValues().category;
        console.log(' Tentative de récupération de la catégorie depuis l\'état du formulaire:', formCategory);

        if (formCategory) {
          data.category = formCategory;
          console.log(' Catégorie récupérée avec succès:', data.category);
        } else {
          throw new Error("La catégorie de chasseur n'est pas spécifiée et ne peut pas être récupérée");
        }
      }

      // Déterminer la nationalité à partir du pays d'émission de la pièce d'identité
      const nationality = getNationality(data.pays) || "Non spécifié";

      // L'utilisateur connecté utilise ses propres données pour compléter son profil chasseur
      console.log(' DEBUG: Utilisateur connecté complet:', JSON.stringify(user, null, 2));

      const hunterData = {
        firstName: user?.firstName || 'Prénom',
        lastName: user?.lastName || 'Nom',
        idNumber: data.idNumber,
        phone: data.category === "resident" ? (data.phone ? String(data.phone).replace(/\s/g, '') : '') : null,
        category: data.category, // Vérifier cette valeur dans la console
        pays: data.pays,
        nationality: nationality, // Utiliser le pays d'émission comme nationalité
        address: data.address || "Adresse par défaut",
        dateOfBirth: data.dateOfBirth,
        profession: data.profession,
        experience: Number(data.experience),
        tutorInfo: isMinor ? {
          firstName: data.tutorFirstName || '',
          lastName: data.tutorLastName || '',
          idNumber: data.tutorIdNumber || '',
          phone: data.tutorPhone ? data.tutorPhone.replace(/\s/g, '') : '',
          letterConfirmation: data.letterConfirmation || false
        } : null
      };

      console.log(' DEBUG: Données du chasseur à créer (JSON):', JSON.stringify(hunterData, null, 2));
      console.log(' DEBUG: Types des données du chasseur:', Object.entries(hunterData).map(([key, value]) => `${key}: ${typeof value}`));

      // Vérifier l'utilisateur courant pour associer le profil chasseur au compte utilisateur
      const me = await apiRequest<{ id: number; username: string; email: string; role: string }>({ url: "/api/auth/me", method: "GET" });
      const userId = me?.id as number | undefined;
      if (!userId) {
        throw new Error("Impossible de récupérer l'identifiant utilisateur pour l'association du profil chasseur");
      }

      // Vérification du numéro d'identification - Modifié pour contourner l'erreur JSON
      try {
        const response = await fetch(`/api/hunters/check-id/${data.idNumber}`, {
          method: "GET",
          headers: {
            'Accept': 'application/json'
          }
        });

        let checkIdResponse;
        try {
          checkIdResponse = await response.json();
        } catch (jsonError) {
          // Si le JSON ne peut pas être parsé, supposons qu'il n'existe pas
          console.log("Erreur JSON lors de la vérification de l'ID, continuons l'inscription");
          checkIdResponse = { exists: false };
        }

        if (checkIdResponse?.exists) {
          toast({
            variant: "destructive",
            title: "Erreur",
            description: "Ce numéro d'identification est déjà utilisé."
          });
          return;
        }
      } catch (idCheckError) {
        // Ignorer les erreurs de vérification et continuer
        console.log("Erreur lors de la vérification de l'ID, continuons l'inscription");
      }

      // Création du chasseur
      console.log(' DEBUG: Complétion du profil chasseur pour l\'utilisateur connecté');
      console.log(' DEBUG: URL:', "/api/users/me/hunter-profile");
      console.log(' DEBUG: Méthode:', "PUT");
      console.log(' DEBUG: Token présent:', !!localStorage.getItem('token'));
      console.log(' DEBUG: Noms finaux utilisés:', hunterData.firstName, hunterData.lastName);
      console.log(' DEBUG: Données chasseur à envoyer:', JSON.stringify(hunterData, null, 2));

      let hunterResponse: { id?: number; message?: string; hunter?: any } | undefined;
      try {
        // Compléter le profil chasseur de l'utilisateur existant (continuation d'inscription)
        console.log(' DEBUG: Appel apiRequest vers /api/users/me/hunter-profile');
        hunterResponse = await apiRequest<{ id: number; message?: string; hunter?: any }>({
          url: '/api/users/me/hunter-profile',
          method: 'PUT',
          data: hunterData,
        });
        console.log(' DEBUG: Réponse du serveur:', JSON.stringify(hunterResponse, null, 2));
      } catch (apiError: any) {
        const body = apiError?.body;
        const message = body?.message || (apiError instanceof Error ? apiError.message : undefined) || 'Erreur lors de la complétion du profil chasseur';
        // Mapper les erreurs Zod si présentes
        const issues = body?.errors;
        if (Array.isArray(issues)) {
          issues.forEach((issue: any) => {
            const path = Array.isArray(issue.path) ? issue.path[0] : issue.path;
            const msg = issue.message || 'Champ invalide';
            if (path && typeof path === 'string') {
              // tenter de rattacher aux champs hunterForm lorsque possible
              if ([
                'idNumber', 'phone', 'pays', 'nationality', 'address', 'dateOfBirth',
                'profession', 'experience', 'category', 'tutorFirstName', 'tutorLastName',
                'tutorIdNumber', 'tutorPhone', 'letterConfirmation'
              ].includes(path)) {
                hunterForm.setError(path as any, { type: 'server', message: msg });
              }
            }
          });
        }
        // 409 duplicat idNumber - Message clair pour l'utilisateur
        const status = apiError?.status;
        if (status === 409) {
          const errorMsg = body?.message || '';
          if (errorMsg.includes('idNumber') || errorMsg.includes('identité') || errorMsg.includes('HUNTER_ID_NUMBER_DUPLICATE')) {
            hunterForm.setError('idNumber' as any, {
              type: 'server',
              message: 'Ce numéro de pièce d\'identité est déjà utilisé par un autre chasseur. Un chasseur ne peut avoir qu\'un seul compte.'
            });
          } else {
            hunterForm.setError('idNumber' as any, {
              type: 'server',
              message: 'Ce numéro de pièce d\'identité est déjà utilisé par un autre chasseur.'
            });
          }
        }
        throw new Error(message);
      }

      if (!hunterResponse?.id) {
        throw new Error("Échec de la création du profil chasseur");
      }

      // À ce stade, l'utilisateur a déjà été créé (étape 1) et connecté.
      // L'association du chasseur à l'utilisateur est faite via userId transmis au backend.
      // Nous invalidons les listes et l'utilisateur courant puis redirigeons.

      // Invalidate all hunters-related queries (keys used in hooks)
      await queryClient.invalidateQueries({ queryKey: ['/api/hunters'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/hunters/all'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/hunters/region'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/hunters/zone'] });
      await queryClient.invalidateQueries({ queryKey: ['currentUser'] });

      // Nettoyer les anciennes valeurs de redirection
      localStorage.removeItem('just_registered');
      localStorage.removeItem('profileType');

      // Marquer le profil comme complété côté client pour lever le guard
      try {
        localStorage.setItem('profileCompleted', 'true');
      } catch {}

      toast({
        title: "Succès",
        description: "Votre compte a été créé avec succès. Vous pouvez maintenant vous connecter."
      });

      // Rafraîchir l'état d'auth puis soit fermer le modal (embedded), soit rediriger
      try { await afterLoginRefreshAll(); } catch {}
      try {
        const me = await apiRequest<{ role: string; type?: string }>({ url: "/api/auth/me", method: "GET" });
        const home = getHomePage(me?.role, me?.type);
        if (embedded && typeof onCompleted === 'function') {
          onCompleted();
        } else {
          navigate(home);
        }
      } catch (e) {
        navigate("/");
      }

    } catch (error: any) {
      console.error("Erreur lors de l'inscription:", error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error.message || "Une erreur s'est produite lors de l'inscription. Veuillez vérifier vos informations et réessayer."
      });
    } finally {
      try { onSubmittingChange && onSubmittingChange(false); } catch {}
    }
  };

  // Création du chasseur côté serveur (utilisée après création du compte)
  const createHunterOnServer = async (userId: number, data: z.infer<typeof hunterInfoSchema>) => {
    const nationality = getNationality(data.pays) || data.pays;
    const hunterData = {
      firstName: form.getValues().firstName,
      lastName: form.getValues().lastName,
      idNumber: data.idNumber,
      phone: data.category === "resident" ? data.phone?.replace(/\s/g, '') : null,
      category: data.category,
      pays: data.pays,
      nationality,
      address: data.address || "Adresse par défaut",
      dateOfBirth: data.dateOfBirth,
      profession: data.profession,
      experience: Number(data.experience),
      tutorInfo: isMinor ? {
        firstName: data.tutorFirstName || '',
        lastName: data.tutorLastName || '',
        idNumber: data.tutorIdNumber || '',
        phone: data.tutorPhone ? data.tutorPhone.replace(/\s/g, '') : '',
        letterConfirmation: data.letterConfirmation || false
      } : null,
      userId
    };

    const res = await fetch('/api/hunters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
      },
      body: JSON.stringify(hunterData)
    });
    if (!res.ok) {
      let backendMsg = '';
      try { const errBody = await res.json(); backendMsg = errBody?.message || errBody?.error || ''; } catch {}
      throw new Error(`Erreur création chasseur: ${res.status}${backendMsg ? ` - ${backendMsg}` : ''}`);
    }
    return res.json();
  };

  const checkIdDebounced = debounce(async (idNumber: string) => {
    try {
      // Utiliser fetch directement plutôt que apiRequest pour éviter les erreurs JSON
      const response = await fetch(`/api/hunters/check-id/${idNumber}`, {
        method: "GET",
        headers: {
          'Accept': 'application/json'
        }
      });

      let responseData;
      try {
        responseData = await response.json();
      } catch (LunchError) {
        // Si le JSON ne peut pas être parsé, considérons que l'ID n'existe pas
        console.log("Erreur JSON lors de la vérification de l'ID");
        return;
      }

      if (responseData?.exists) {
        hunterForm.setError("idNumber", {
          type: "manual",
          message: "Ce numéro d'identification est déjà utilisé"
        });
      } else {
        // Clear any previous error explicitly to avoid rendering 'undefined'
        hunterForm.clearErrors("idNumber");
      }
    } catch (error) {
      console.error("Erreur lors de la vérification de l'ID:", error);
      // Ne pas afficher d'erreur en cas d'échec de la vérification
    }
  }, 500);

  // Écouter les changements sur le champ idNumber
  useEffect(() => {
    const subscription = hunterForm.watch((value, { name }) => {
      if (name === "idNumber" && value.idNumber && value.idNumber.length >= 5) {
        checkIdDebounced(value.idNumber);
      }
      if (name === "dateOfBirth" && value.dateOfBirth) {
        checkAge(value.dateOfBirth);
      }
    });

    return () => {
      subscription.unsubscribe();
      checkIdDebounced.cancel();
    };
  }, [hunterForm, checkIdDebounced]);

  // Écouter les changements de catégorie pour valider le formulaire
  useEffect(() => {
    // Utiliser un nom de champ spécifique pour éviter une récursion infinie
    const subscription = hunterForm.watch((value, { name }) => {
      // Ne déclencher que sur les changements de catégorie ou de téléphone
      if (name !== "category" && name !== "phone") return;

      // Si la catégorie est résident, vérifier le numéro de téléphone
      if (value.phone && value.phone.trim() !== "") {
        // Si la catégorie est 'Résident', vérifier le format du numéro
        if (value.category === 'resident') {
          const digits = value.phone.replace(/\D/g, '');
        }
      } else {
        hunterForm.clearErrors("phone");
      }
    });

    return () => subscription.unsubscribe();
  }, [hunterForm]);

  return (
    <div className={cn("flex flex-col items-center justify-center p-4 bg-white overflow-hidden", embedded ? "h-auto" : "h-screen")}>
      <div className={cn("w-full bg-white rounded-xl overflow-hidden shadow-xl flex flex-col", embedded ? "max-w-3xl" : "max-w-5xl h-[90vh]")}>
        <div className={cn("md:flex", embedded ? "" : "h-full")}>
          {/* Panneau d'information sur la gauche (caché en mode embarqué) */}
          <div className={cn("relative md:w-7/12 bg-green-700 text-white hidden md:block overflow-hidden", embedded ? "hidden" : "hidden md:block")}>
            {/* Sticker/Stripe décoratif à gauche */}
            <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-b from-emerald-400 to-green-600 shadow-[inset_-4px_0_8px_rgba(0,0,0,0.08)]" />
            <div className="p-8 pl-10">
              <h1 className="text-3xl font-bold mb-4 text-center">Permis de Chasse</h1>
              <p className="mb-6">Bienvenue sur la plateforme officielle de demande de permis de chasse au Sénégal.</p>

              <div className="space-y-4">
                <div className="flex items-start">
                  <div className="bg-white p-2 rounded-full text-green-700 mr-3 mt-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold">Processus simplifié</h3>
                    <p className="text-sm">Création rapide de compte et demande de permis en quelques étapes.</p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="bg-white p-2 rounded-full text-green-700 mr-3 mt-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold">Suivi en temps réel</h3>
                    <p className="text-sm">Suivez l'état de vos demandes de permis à tout moment.</p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="bg-white p-2 rounded-full text-green-700 mr-3 mt-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold">Déclarations d'abattage et captures</h3>
                    <p className="text-sm">Déclarez vos abattages ou captures pour une meilleure gestion de la faune sauvage.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Formulaire d'inscription sur la droite */}
          <div className={cn("p-8 overflow-y-auto", embedded ? "w-full" : "md:w-1/2 h-full")}>
            <div className="relative mb-6">
              {/* Bouton de retour vers login (masqué en mode embarqué) */}
              {!embedded && step === 1 && (
                <button
                  type="button"
                  onClick={() => window.location.replace("/")}
                  className="fixed md:absolute right-3 md:right-0 top-3 md:top-0 flex items-center justify-center w-12 h-12 md:w-10 md:h-10 rounded-full bg-gradient-to-r from-teal-400 to-green-500 hover:from-teal-500 hover:to-green-600 text-white shadow-md transition-all duration-300 hover:shadow-lg z-[60] md:z-10"
                  style={{
                    top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
                    right: 'calc(env(safe-area-inset-right, 0px) + 0.75rem)'
                  }}
                  aria-label="Retour à l'accueil"
                  title="Retour à l'accueil"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transform rotate-180" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>

            {/* Section d'introduction simplifiée (mention sécurité supprimée) */}

            {embedded ? (
              // Mode embarqué (modal dans le dashboard chasseur): afficher UNIQUEMENT l'étape 2 (profil chasseur)
              <Form {...hunterForm}>
                <form onSubmit={hunterForm.handleSubmit(onSubmitHunterInfo)} className="space-y-4">
                  {/* Champs Étape 2 */}
                  <FormField control={hunterForm.control} name="idNumber" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Numéro de Pièce d'Identité ou de passeport</FormLabel>
                      <FormControl>
                        <Input placeholder="Numéro de Pièce d'Identité" {...field} className="border-black text-center" onChange={(e) => { const v = e.target.value.replace(/[^a-zA-Z0-9]/g, ''); field.onChange(v); }} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={hunterForm.control} name="pays" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pays d'émission de la pièce d'identité</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="border-black"><SelectValue placeholder="Sélectionner un pays" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Sénégal</SelectLabel>
                            <SelectItem value="Sénégal">Sénégal</SelectItem>
                          </SelectGroup>
                          <SelectGroup>
                            <SelectLabel>Autres</SelectLabel>
                            {countriesList.filter(c => c !== 'Sénégal').map(c => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={hunterForm.control} name="category" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Catégorie de chasseur</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value} disabled={hunterForm.getValues('pays') === 'Sénégal'}>
                        <FormControl>
                          <SelectTrigger className="border-black"><SelectValue placeholder="Sélectionner une catégorie" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="resident">Résident</SelectItem>
                          <SelectItem value="touristique">Touriste</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {hunterForm.watch('category') === 'resident' && (
                    <FormField control={hunterForm.control} name="phone" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Numéro de téléphone</FormLabel>
                        <FormControl>
                          <div className="flex items-center">
                            <div className="flex items-center justify-center bg-gray-200 h-10 px-3 border border-input rounded-l-md"><span>+221</span></div>
                            <Input placeholder="XX XXX XX XX" {...field} className="border-black rounded-l-none" onChange={(e) => { const n = e.target.value.replace(/[^0-9]/g, ''); const l = n.substring(0, 9); let f = ''; if (l.length > 0) f += l.substring(0, Math.min(2, l.length)); if (l.length > 2) f += ' ' + l.substring(2, Math.min(5, l.length)); if (l.length > 5) f += ' ' + l.substring(5, Math.min(7, l.length)); if (l.length > 7) f += ' ' + l.substring(7, 9); field.onChange(f); }} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  )}

                  <FormField control={hunterForm.control} name="dateOfBirth" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date de naissance</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          placeholder="Date de naissance"
                          {...field}
                          min={dobBounds.minStr}
                          max={dobBounds.maxStr}
                          onChange={(e) => {
                            const v = e.target.value;
                            field.onChange(v);
                            // Vérifier et imposer la contrainte d'âge si hors bornes
                            try {
                              const d = new Date(v);
                              if (!isNaN(d.getTime())) {
                                const today = new Date();
                                const age = today.getFullYear() - d.getFullYear() - ((today.getMonth() < d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())) ? 1 : 0);
                                if (age < 10 || age > 70) {
                                  hunterForm.setError('dateOfBirth' as any, { type: 'validate', message: "L'âge doit être compris entre 10 et 70 ans" });
                                } else {
                                  // Effacer l'erreur si elle provenait de la validation d'âge
                                  const err = hunterForm.getFieldState('dateOfBirth').error;
                                  if (err?.type === 'validate') hunterForm.clearErrors('dateOfBirth');
                                }
                              }
                            } catch {}
                            // Calcul d'âge existant
                            checkAge(v);
                          }}
                          className="border-black"
                        />
                      </FormControl>
                      <FormDescription>
                        {currentAge !== null && `Âge calculé: ${currentAge} ans`}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={hunterForm.control} name="profession" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Profession</FormLabel>
                      <FormControl><Input placeholder="Votre profession" {...field} className="border-black capitalize" onChange={(e) => { const v = e.target.value.replace(/[^A-Za-z\u00C0-\u017F\s\-]/g, ''); const cap = v && v.length > 0 ? v.charAt(0).toUpperCase() + v.slice(1) : v; field.onChange(cap); }} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={hunterForm.control} name="experience" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Années d'expérience en chasse</FormLabel>
                      <FormControl><Input type="number" min="0" placeholder="0" {...field} className="border-black" onKeyDown={(e) => { if (!/[0-9]/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Tab') { e.preventDefault(); } }} onChange={(e) => { const n = e.target.value.replace(/[^0-9]/g, ''); const v = n ? parseInt(n) : 0; field.onChange(v); }} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {isMinor && (
                    <div className="space-y-4 border-t pt-4 mt-4 bg-gray-100 p-4 rounded-lg">
                      <h3 className="text-lg font-medium">Informations du tuteur</h3>
                      <p className="text-sm text-gray-500">Pour les chasseurs mineurs (moins de 18 ans), un tuteur légal doit être déclaré.</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField control={hunterForm.control} name="tutorFirstName" render={({ field }) => (<FormItem><FormLabel>Prénom du tuteur</FormLabel><FormControl><Input placeholder="Prénom du tuteur" {...field} className="border-black" /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={hunterForm.control} name="tutorLastName" render={({ field }) => (<FormItem><FormLabel>Nom du tuteur</FormLabel><FormControl><Input placeholder="Nom du tuteur" {...field} className="border-black" /></FormControl><FormMessage /></FormItem>)} />
                      </div>
                      <FormField control={hunterForm.control} name="tutorIdNumber" render={({ field }) => (<FormItem><FormLabel>Numéro de pièce d'identité du tuteur</FormLabel><FormControl><Input placeholder="Numéro de pièce du tuteur" {...field} className="border-black text-center" onChange={(e) => { const v = e.target.value.replace(/[^a-zA-Z0-9]/g, ''); field.onChange(v); }} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={hunterForm.control} name="tutorPhone" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Numéro de téléphone du tuteur</FormLabel>
                          <FormControl>
                            <div className="flex items-center">
                              <div className="flex items-center justify-center bg-gray-200 h-10 px-3 border border-input rounded-l-md"><span>+221</span></div>
                              <Input placeholder="XX XXX XX XX" {...field} className="border-black rounded-l-none" onChange={(e) => { const n = e.target.value.replace(/[^0-9]/g, ''); const l = n.substring(0, 9); let f = ''; if (l.length > 0) f += l.substring(0, Math.min(2, l.length)); if (l.length > 2) f += ' ' + l.substring(2, Math.min(5, l.length)); if (l.length > 5) f += ' ' + l.substring(5, Math.min(7, l.length)); if (l.length > 7) f += ' ' + l.substring(7, 9); field.onChange(f); }} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={hunterForm.control} name="letterConfirmation" render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                          <div className="space-y-1 leading-none"><FormLabel>Je confirme avoir fourni une lettre de responsabilité du tuteur</FormLabel><FormDescription>Cette lettre sera vérifiée lors de la validation de votre demande de permis</FormDescription></div>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  )}

                  <div className="flex space-x-4 mt-6">
                    <Button type="submit" className="w-full bg-green-700 hover:bg-green-800">Finaliser l'inscription</Button>
                  </div>
                </form>
              </Form>
            ) : (
              // Mode public: afficher UNIQUEMENT l'étape 1 (création de compte)
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmitBasicInfo)} className="space-y-4" autoComplete="off">
                  {/* Titre et sous-titre centrés */}
                  <div className="text-center mb-2">
                    <h2 className="text-2xl font-bold">Création de compte</h2>
                    <p className="text-sm text-slate-600">Étape 1: Informations de base</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="firstName" render={({ field }) => (<FormItem><FormLabel>Prénom</FormLabel><FormControl><Input placeholder="Votre prénom" {...field} autoComplete="given-name" className="border-black" /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="lastName" render={({ field }) => (<FormItem><FormLabel>Nom</FormLabel><FormControl><Input placeholder="Votre nom" {...field} autoComplete="family-name" className="border-black" /></FormControl><FormMessage /></FormItem>)} />
                  </div>
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nom d'utilisateur</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <Input placeholder="Choisissez un nom d'utilisateur" {...field} autoComplete="off" className="border-black" />
                            {!embedded && usernameAvailability !== null && (
                              <span
                                className={cn(
                                  "px-2 py-1 rounded text-xs font-medium border",
                                  usernameAvailability
                                    ? "bg-green-100 text-green-700 border-green-300"
                                    : "bg-red-100 text-red-700 border-red-300"
                                )}
                              >
                                {usernameAvailability ? "Disponible" : "Déjà pris"}
                              </span>
                            )}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <Input type="email" placeholder="votre@email.com" {...field} autoComplete="email" className="border-black" />
                            {!embedded && emailAvailability === false && (
                              <span className="px-2 py-1 rounded text-xs font-medium border bg-red-100 text-red-700 border-red-300">
                                Déjà rattaché à un compte
                              </span>
                            )}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField control={form.control} name="password" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mot de passe</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input type={showPassword ? 'text' : 'password'} placeholder="********" {...field} autoComplete="new-password" className="border-black" />
                          <button type="button" className="absolute right-3 top-1/2 transform -translate-y-1/2" onClick={() => setShowPassword(!showPassword)}>
                            {showPassword ? <EyeOff className="h-4 w-4 text-gray-500" /> : <Eye className="h-4 w-4 text-gray-500" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormDescription>Au moins 8 caractères</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="confirmPassword" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirmer le mot de passe</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input type={showConfirmPassword ? 'text' : 'password'} placeholder="********" {...field} autoComplete="new-password" className="border-black" />
                          <button type="button" className="absolute right-3 top-1/2 transform -translate-y-1/2" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                            {showConfirmPassword ? <EyeOff className="h-4 w-4 text-gray-500" /> : <Eye className="h-4 w-4 text-gray-500" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="submit" className="w-full bg-green-700 hover:bg-green-800 mt-4">S'inscrire</Button>
                </form>
              </Form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
