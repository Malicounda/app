import { z } from "zod";
import { 
  HUNTER_CATEGORIES,
  PERMIT_DURATIONS 
} from "@/lib/utils/permit.constants";

// Extraire les valeurs des énumérations pour la validation
export const PERMIT_TYPES = ["sportif-petite-chasse", "grande-chasse", "special-gibier-eau"] as const;

// Schéma de validation de base
export const basePermitSchema = z.object({
  permitType: z.enum(PERMIT_TYPES, {
    required_error: "Veuillez sélectionner un type de permis",
  }),
  pickupRegion: z.string({
    required_error: "Veuillez sélectionner une région",
  }),
  hunterCategory: z.enum(HUNTER_CATEGORIES.map(c => c.value) as [string, ...string[]], {
    required_error: "Catégorie de chasseur non définie",
  }),
  duration: z.enum(PERMIT_DURATIONS.map(d => d.value) as [string, ...string[]]).optional(),
  // Dynamic-friendly: allow any string for weapon fields
  weaponType: z.string({ required_error: "Veuillez sélectionner un type d'arme" }),
  weaponBrand: z.string().optional(),
  customWeaponBrand: z.string().optional(),
  weaponReference: z.string().optional(),
  weaponCaliber: z.string().optional(),
  weaponOtherDetails: z.string().optional(),
});

// Fonction pour obtenir le schéma de validation avec les dépendances
export const getPermitValidationSchema = () => {
  return basePermitSchema
    .refine(
      (data) => {
        if (data.hunterCategory === "touristique" && !data.duration) {
          return false;
        }
        return true;
      },
      { message: "Veuillez sélectionner une durée pour le permis touristique", path: ["duration"] }
    )
    .refine(
      (data) => {
        const requiresBrand = ["fusil", "carabine"].includes(data.weaponType);
        return !(requiresBrand && !data.weaponBrand);
      },
      { message: "Veuillez sélectionner une marque pour l'arme", path: ["weaponBrand"] }
    )
    .refine(
      (data) => {
        const requiresCustomBrand = data.weaponBrand === "autre";
        return !(requiresCustomBrand && !data.customWeaponBrand);
      },
      { message: "Veuillez préciser la marque de l'arme", path: ["customWeaponBrand"] }
    )
    .refine(
      (data) => {
        const requiresReference = ["fusil", "carabine"].includes(data.weaponType);
        return !(requiresReference && !data.weaponReference);
      },
      { message: "Veuillez indiquer la référence de l'arme", path: ["weaponReference"] }
    )
    .refine(
      (data) => {
        const requiresCaliber = ["fusil", "carabine"].includes(data.weaponType);
        return !(requiresCaliber && !data.weaponCaliber);
      },
      { message: "Veuillez sélectionner un calibre", path: ["weaponCaliber"] }
    )
    .refine(
      (data) => {
        const requiresDetails = data.weaponBrand === "autre" || data.weaponCaliber === "autre";
        return !(requiresDetails && !data.weaponOtherDetails);
      },
      { message: "Veuillez fournir des détails supplémentaires sur l'arme", path: ["weaponOtherDetails"] }
    );
};

export type PermitRequestFormValues = z.infer<typeof basePermitSchema>;
