import { resolveDomainConfig } from "@/lib/domainConfig";
import { queryClient } from "@/lib/queryClient";
import { resolveApiUrl } from "@/utils/environment";

export interface PortalDomaine {
  id: number;
  nomDomaine: string;
  codeSlug: string;
  description?: string | null;
  couleurTheme?: string | null;
  isActive: boolean;
  isVisible?: boolean;
  allowSelfRegistration?: boolean;
  createdAt: string;
}

export interface DomainLoginTarget {
  path: string;
  domainValue: string;
}

export const PORTAL_DOMAINS_QUERY_KEY = ["/api/domaines/public/active"] as const;

/** Résout la route de connexion et la valeur de domaine localStorage pour un domaine donné. */
export function resolveDomainLoginTarget(
  domaine: Pick<PortalDomaine, "nomDomaine" | "codeSlug">
): DomainLoginTarget {
  const cfg = resolveDomainConfig(domaine.nomDomaine, domaine.codeSlug);
  const path = cfg?.loginPath || "/login";
  const key = cfg?.key;
  const domainValue =
    key === "chasse"
      ? "CHASSE"
      : key === "reboisement"
        ? "REBOISEMENT"
        : key === "alerte"
          ? "ALERTE"
          : String(domaine.nomDomaine || "CHASSE").trim().toUpperCase();

  return { path, domainValue };
}

function getApkForcedLoginRoute(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const ua = window.navigator.userAgent || "";
    if (ua.includes("ChasseAPK")) return "/login";
    if (
      ua.includes("AlerteAPK") ||
      window.location.search.includes("isApk=true") ||
      (typeof (window as any).Capacitor !== "undefined" &&
        (window as any).Capacitor.isNativePlatform?.())
    ) {
      return "/alerte-login";
    }
  } catch {
    // ignore
  }
  return null;
}

function getStoredDomainLoginFallback(): string {
  if (typeof window !== "undefined") {
    try {
      const domain = (localStorage.getItem("domain") || "").trim().toUpperCase();
      if (domain === "SYSTEM") return "/connexion";
      if (domain === "ALERTE") return "/alerte-login";
      if (domain === "REBOISEMENT") return "/reboisement-login";
      if (domain === "PRODUITS FORESTIERS" || domain === "PRODUITS_FORESTIERS") {
        return "/produits-forestiers";
      }
    } catch {
      // ignore
    }
  }
  return "/login";
}

/**
 * Résout la route de connexion cible à partir de la liste des domaines actifs/visibles :
 * - 1 seul domaine visible -> route directe vers sa page de connexion (+ synchro localStorage.domain si demandé)
 * - Plusieurs domaines visibles -> route du domaine mémorisé s'il est encore visible, sinon sélecteur /?showModules=1
 * - 0 domaine visible -> /connexion (accès neutre réservé à l'administration centrale)
 */
export function getLoginRouteFromList(
  domaines?: PortalDomaine[] | null,
  syncStorage: boolean = false
): string {
  const apkRoute = getApkForcedLoginRoute();
  if (apkRoute) return apkRoute;

  if (!Array.isArray(domaines)) {
    return getStoredDomainLoginFallback();
  }

  const visibleDomaines = domaines.filter(
    (d) => d && d.isActive !== false && d.isVisible !== false
  );

  if (visibleDomaines.length === 1) {
    const target = resolveDomainLoginTarget(visibleDomaines[0]);
    if (syncStorage && typeof window !== "undefined") {
      try {
        localStorage.setItem("domain", target.domainValue);
      } catch {
        // ignore
      }
    }
    return target.path;
  }

  if (visibleDomaines.length === 0) {
    if (syncStorage && typeof window !== "undefined") {
      try {
        localStorage.setItem("domain", "SYSTEM");
      } catch {
        // ignore
      }
    }
    return "/connexion";
  }

  // Plusieurs domaines sont visibles : garder le domaine de l'utilisateur s'il est toujours visible
  if (typeof window !== "undefined") {
    try {
      const currentDomain = (localStorage.getItem("domain") || "").trim().toUpperCase();
      if (currentDomain) {
        const matched = visibleDomaines.find((d) => {
          const t = resolveDomainLoginTarget(d);
          return (
            t.domainValue === currentDomain ||
            d.nomDomaine.trim().toUpperCase() === currentDomain
          );
        });
        if (matched) {
          return resolveDomainLoginTarget(matched).path;
        }
      }
    } catch {
      // ignore
    }
  }

  return "/?showModules=1";
}

/**
 * Version synchrone utilisée par les redirections immédiates (ProtectedRoute, fallback).
 * Exploite le cache React Query de /api/domaines/public/active s'il est déjà chargé.
 */
export function getLoginRoute(): string {
  const apkRoute = getApkForcedLoginRoute();
  if (apkRoute) return apkRoute;

  try {
    const cached = queryClient.getQueryData<PortalDomaine[]>(PORTAL_DOMAINS_QUERY_KEY);
    if (Array.isArray(cached)) {
      return getLoginRouteFromList(cached, true);
    }
  } catch {
    // ignore
  }

  return getStoredDomainLoginFallback();
}

/**
 * Version asynchrone utilisée lors d'une déconnexion (bouton Quitter / Déconnecter ou modal Session verrouillée).
 * Rafraîchit /api/domaines/public/active avec un timeout court afin de tenir compte d'un éventuel changement
 * d'état "Affichage" / "Statut" effectué pendant la session, puis redirige sans aucune page parasite.
 */
export async function resolveLogoutRedirectRoute(timeoutMs: number = 2000): Promise<string> {
  const apkRoute = getApkForcedLoginRoute();
  if (apkRoute) return apkRoute;

  const controller = new AbortController();
  const timerId = typeof window !== "undefined" ? window.setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await fetch(resolveApiUrl("/api/domaines/public/active"), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        try {
          queryClient.setQueryData(PORTAL_DOMAINS_QUERY_KEY, data);
        } catch {
          // ignore
        }
        return getLoginRouteFromList(data as PortalDomaine[], true);
      }
    }
  } catch {
    // Hors ligne ou timeout : fallback sur le cache ou localStorage
  } finally {
    if (timerId !== null && typeof window !== "undefined") {
      window.clearTimeout(timerId);
    }
  }

  return getLoginRoute();
}
