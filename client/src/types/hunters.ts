export interface Hunter {
  id: number;
  lastName: string;
  firstName: string;
  dateOfBirth: string; // ou Date, selon la transformation côté client
  idNumber: string;
  phone?: string | null; // Rendre optionnel si nullable dans la DB
  address: string;
  experience: number;
  profession: string;
  category: string; // 'resident', 'coutumier', 'touriste'
  pays?: string | null;
  nationality?: string | null;
  region?: string | null;
  zone?: string | null;
  weaponType?: 'fusil' | 'carabine' | 'arbalete' | 'arc' | 'lance-pierre' | 'autre' | null;
  weaponBrand?: string | null;
  weaponReference?: string | null;
  weaponCaliber?: string | null;
  weaponOtherDetails?: string | null;
  isMinor: boolean;
  isActive: boolean;
  profilCompte: 'Actif' | 'User' | 'Inactif'; // Utilisation de l'enum
  createdAt: string; // ou Date
  registeredBy?: string | null;
  // updatedAt n'est pas dans le schéma de la table hunters, mais dans d'autres (ex: permitRequests)
  // Si vous l'avez ajouté manuellement ailleurs, gardez-le, sinon, il peut être retiré si non pertinent pour Hunter.
  // Pour l'instant, je le commente car il n'est pas dans la définition de `hunters` dans `shared/schema.ts`
  // updatedAt?: string;
}
