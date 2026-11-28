import { resolveDomainConfig } from "@/lib/domainConfig";
import { apiRequest } from "@/lib/queryClient";
import {
  PORTAL_DOMAINS_QUERY_KEY,
  resolveDomainLoginTarget,
  type DomainLoginTarget,
  type PortalDomaine,
} from "@/utils/getLoginRoute";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export { resolveDomainLoginTarget, type DomainLoginTarget, type PortalDomaine };

/**
 * Hook partagé pour les pages publiques (Accueil & Connexion) :
 * - Récupère les domaines actifs du système (/api/domaines/public/active)
 * - Filtre ceux marqués visibles dans la colonne "Affichage" (isVisible !== false)
 * - Détermine si le portail est en mode "domaine unique visible" (redirection directe + masquage du bouton Retour)
 */
export function usePortalDomains() {
  const { data, isLoading, isError } = useQuery<PortalDomaine[]>({
    queryKey: PORTAL_DOMAINS_QUERY_KEY,
    queryFn: () => apiRequest<PortalDomaine[]>({ url: "/api/domaines/public/active", method: "GET" }),
    retry: false,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const activeDomaines = useMemo(
    () => (Array.isArray(data) ? data.filter((d) => d && d.isActive !== false) : []),
    [data]
  );

  const visibleDomaines = useMemo(
    () => activeDomaines.filter((d) => d.isVisible !== false),
    [activeDomaines]
  );

  const singleVisibleDomain = useMemo(
    () => (!isLoading && !isError && visibleDomaines.length === 1 ? visibleDomaines[0] : null),
    [isLoading, isError, visibleDomaines]
  );

  const isSingleDomainPortal = Boolean(singleVisibleDomain);
  const canShowBackToModules = !isLoading && (isError || visibleDomaines.length !== 1);

  const findDomaineByKeyOrName = (domainKeyOrName: string): PortalDomaine | undefined => {
    const q = String(domainKeyOrName || "").trim().toLowerCase();
    if (!q) return undefined;
    return activeDomaines.find((d) => {
      const cfg = resolveDomainConfig(d.nomDomaine, d.codeSlug);
      return (
        cfg?.key === q ||
        d.nomDomaine.trim().toLowerCase() === q ||
        d.codeSlug.trim().toLowerCase() === q
      );
    });
  };

  /**
   * Indique si l'auto-inscription publique est activée pour un domaine donné.
   * Tant que le chargement est en cours, retourne false pour éviter tout clignotement du lien.
   */
  const isDomainRegistrationEnabled = (domainKeyOrName: string): boolean => {
    if (isLoading) return false;
    if (isError) return true;
    const matched = findDomaineByKeyOrName(domainKeyOrName);
    if (!matched) {
      // Si aucun domaine correspondant n'est actif, l'auto-inscription n'est pas ouverte.
      return false;
    }
    return matched.isActive !== false && matched.allowSelfRegistration !== false;
  };

  return {
    activeDomaines,
    visibleDomaines,
    singleVisibleDomain,
    isSingleDomainPortal,
    canShowBackToModules,
    isDomainRegistrationEnabled,
    isLoading,
    isError,
  };
}
