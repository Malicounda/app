/**
 * Icônes dynamiques par domaine — lues depuis la config thème admin.
 *
 * L'admin définit l'icône de chaque domaine via la page Theme ;
 * elle est stockée dans localStorage('theme:superadmin').
 * Ce module expose un hook useDomainIcon(domainKey) qui résout
 * l'icône dynamiquement, avec la même logique que HomePage.
 */
import {
    AlertTriangle,
    Bell,
    FileText,
    Leaf,
    MapPin,
    MessageSquare,
    Settings,
    Shield,
    Sprout,
    Target,
    Trees,
    Users,
    type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

/** Mapping nom d'icône (string) → composant Lucide (identique à HomePage) */
export const ICONS: Record<string, LucideIcon> = {
  AlertTriangle,
  Bell,
  FileText,
  Leaf,
  MapPin,
  MessageSquare,
  Settings,
  Shield,
  Target,
  Trees,
  Sprout,
  Users,
};

/** Icônes par défaut quand aucun thème n'est configuré */
const DEFAULT_ICONS: Record<string, LucideIcon> = {
  CHASSE: Target,
  REBOISEMENT: Sprout,
  ALERTE: AlertTriangle,
  "PRODUITS FORESTIERS": Trees,
  "PRODUITS_FORESTIERS": Trees,
  PRODUITSFORESTIERS: Trees,
};

type ThemeDomainEntry = { from?: string; to?: string; icon?: string; logoUrl?: string };
type ThemeConfig = { domains?: Record<string, ThemeDomainEntry> };

function readThemeCfg(): ThemeConfig | null {
  try {
    const raw = localStorage.getItem("theme:superadmin");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export type DomainVisual = {
  icon: LucideIcon;
  logoUrl: string | undefined;
};

/**
 * Résout l'icône et le logo d'un domaine à partir de la config thème.
 */
function resolveVisual(domainKey: string): DomainVisual {
  const cfg = readThemeCfg();
  const entry = cfg?.domains?.[domainKey];
  const iconName = entry?.icon?.trim();
  const logoUrl = entry?.logoUrl?.trim() || undefined;
  const icon = (iconName && ICONS[iconName]) ? ICONS[iconName] : (DEFAULT_ICONS[domainKey] ?? Target);
  return { icon, logoUrl };
}

/**
 * Hook React : retourne { icon, logoUrl } du domaine et se met à jour
 * quand le thème change (événement `theme:superadmin:updated`).
 *
 * Usage dans les pages de connexion :
 *   const { icon: DomainIcon, logoUrl } = useDomainVisual('CHASSE');
 *   {logoUrl ? <img src={logoUrl} ... /> : <DomainIcon ... />}
 */
export function useDomainVisual(domainKey: string): DomainVisual {
  const [visual, setVisual] = useState<DomainVisual>(() => resolveVisual(domainKey));

  useEffect(() => {
    setVisual(resolveVisual(domainKey));

    const onUpdate = () => setVisual(resolveVisual(domainKey));
    window.addEventListener("theme:superadmin:updated", onUpdate);
    return () => window.removeEventListener("theme:superadmin:updated", onUpdate);
  }, [domainKey]);

  return visual;
}

/**
 * Hook de commodité : retourne uniquement le composant icône Lucide.
 */
export function useDomainIcon(domainKey: string): LucideIcon {
  return useDomainVisual(domainKey).icon;
}
