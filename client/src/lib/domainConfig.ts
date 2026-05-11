/**
 * Configuration centralisée des icônes et couleurs par domaine.
 * Toutes les pages (accueil, connexion, modale) utilisent cette source unique.
 * Modifier une icône ici la met à jour partout.
 */
import {
  AlertTriangle,
  Sprout,
  Target,
  Trees,
  type LucideIcon,
} from "lucide-react";

export type DomainConfig = {
  key: string;          // identifiant interne
  icon: LucideIcon;     // icône partagée (carte + login + modale)
  color: string;        // classes Tailwind gradient from
  colorTo: string;      // classes Tailwind gradient to
  loginPath: string;    // chemin vers la page de connexion
};

export const DOMAIN_CONFIGS: DomainConfig[] = [
  {
    key: "chasse",
    icon: Target,
    color: "from-green-600",
    colorTo: "to-green-700",
    loginPath: "/login",
  },
  {
    key: "produits-forestiers",
    icon: Trees,
    color: "from-teal-500",
    colorTo: "to-teal-600",
    loginPath: "/produits-forestiers",
  },
  {
    key: "reboisement",
    icon: Sprout,
    color: "from-green-500",
    colorTo: "to-green-600",
    loginPath: "/reboisement-login",
  },
  {
    key: "alerte",
    icon: AlertTriangle,
    color: "from-amber-500",
    colorTo: "to-orange-500",
    loginPath: "/alerte-login",
  },
];

/** Retrouver la config d'un domaine par son key (ex: "chasse") */
export const getDomainConfig = (key: string): DomainConfig | undefined =>
  DOMAIN_CONFIGS.find((d) => d.key === key);

/**
 * Résoudre la config d'un domaine à partir du nom ou du slug (insensible à la casse).
 * Utilisé pour faire correspondre les domaines dynamiques de l'API.
 */
export const resolveDomainConfig = (name: string, slug?: string): DomainConfig | undefined => {
  const n = (name || "").toLowerCase();
  const s = (slug || "").toLowerCase();

  if (n.includes("chasse") || s.includes("chasse")) return getDomainConfig("chasse");
  if (n.includes("produit") || n.includes("forestier") || s.includes("produit") || s.includes("forestier")) return getDomainConfig("produits-forestiers");
  if (n.includes("reboisement") || n.includes("pepini") || s.includes("reboisement")) return getDomainConfig("reboisement");
  if (n.includes("alerte") || s.includes("alerte")) return getDomainConfig("alerte");

  return undefined;
};
