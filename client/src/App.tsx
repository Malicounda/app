import { resolveApiUrl } from "@/utils/environment";
import AlerteApkNotifications from "@/components/AlerteApkNotifications";
import { AuthWrapper } from "@/components/auth/AuthWrapper";
import ChasseRoute from "@/components/auth/ChasseRoute";
import DashboardRedirector from "@/components/auth/DashboardRedirector";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import ReforestRoute from "@/components/auth/ReforestRoute";
import DebugInfo from "@/components/debug/DebugInfo";
import ErrorBoundary from "@/components/debug/ErrorBoundary";
import MainLayout from "@/components/layout/MainLayout";
import ReforestLayout from "@/components/layout/ReforestLayout";
import SessionLockOverlay from "@/components/layout/SessionLockOverlay";
import { Toaster } from "@/components/ui/sonner"; // Changé de toaster à sonner
import { useAuth } from "@/contexts/AuthContext";
import { useDisableContextMenu } from "@/hooks/useDisableContextMenu";
import { useSessionHeartbeat } from "@/hooks/useSessionHeartbeat";
import NotFound from "@/pages/not-found";
import { isUserSuperAdmin } from "@/utils/navigation";
import { isChasseAPK } from "@/utils/environment";
import { QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Route, Switch, useLocation, Router as WouterRouter } from "wouter";
import { PwaUpdatePrompt } from "@/components/ui/PwaUpdatePrompt";
import { SplashScreen } from "@/components/ui/SplashScreen";
import PageLoader from "@/components/ui/PageLoader";
import NetworkStatusBanner from "@/components/ui/NetworkStatusBanner";

// Pages d'entrée et dashboards principaux gardés en import direct pour un démarrage instantané
import HomePageWrapper from "@/components/auth/HomePageWrapper";
import Login from "@/pages/Login";
import AlerteLogin from "@/pages/AlerteLogin";
import ReboisementLogin from "@/pages/ReboisementLogin";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import RegionalAgentDashboard from "@/pages/Regional/regional-dashboard";
import SectorAgentDashboard from "@/pages/agents-secteur/Dashboard";
import HunterDashboard from "@/pages/Hunter/Dashboard";

// Code-splitting (lazy-loading) des pages métier : charge uniquement ce que l'utilisateur ouvre
const RegisterForm = lazy(() => import("@/components/auth/RegisterForm"));
const HuntingActivities = lazy(() => import("@/pages/Activites chasse/HuntingActivities"));
const HuntingDeclarations = lazy(() => import("@/pages/Activites chasse/HuntingDeclarations"));
const HuntingReports = lazy(() => import("@/pages/Activites chasse/HuntingReports"));
const CreateAgentForm = lazy(() => import("@/pages/admin/CreateAgentForm"));
const GestiondesAgents = lazy(() => import("@/pages/admin/GestiondesAgents"));
const RegionsZones = lazy(() => import("@/pages/admin/RegionsZones"));
const SectorSubAgentsPage = lazy(() => import("@/pages/agents-secteur/SectorSubAgents"));
const AndroidSettings = lazy(() => import("@/pages/AndroidSettings"));
const ChangeprofilPage = lazy(() => import("@/pages/Changeprofil"));
const Accounts = lazy(() => import("@/pages/ConfigSysteme/Accounts"));
const EspecesFauniques = lazy(() => import("@/pages/ConfigSysteme/EspecesFauniques"));
const Infractions = lazy(() => import("@/pages/ConfigSysteme/Infractions"));
const Settings = lazy(() => import("@/pages/ConfigSysteme/Settings"));
const GeoJSONTestPage = lazy(() => import("@/pages/GeoJSONTestPage"));
const AssociateHunters = lazy(() => import("@/pages/Guides/AssociateHunters"));
const GuideDashboard = lazy(() => import("@/pages/Guides/GuideDashboard"));
const Guides = lazy(() => import("@/pages/Guides/Guides"));
const AdminHistory = lazy(() => import("@/pages/Historique/AdminHistory"));
const History = lazy(() => import("@/pages/Historique/History"));
const MapPage = lazy(() => import("@/pages/MapPage"));
const AlertsPage = lazy(() => import("@/pages/Messagerie/AlertsPage"));
const RegionalSMSPage = lazy(() => import("@/pages/Messagerie/RegionalSMSPage"));
const SectorSMSPage = lazy(() => import("@/pages/Messagerie/SectorSMSPage"));
const SMSPage = lazy(() => import("@/pages/Messagerie/SMSPage"));
const NationalStatistics = lazy(() => import("@/pages/National/NationalStatistics"));
const DemandePermisChasse = lazy(() => import("@/pages/Permis/DemandePermisChasse"));
const DetailDemandePermis = lazy(() => import("@/pages/Permis/DetailDemandePermis"));
const GestionPermisPage = lazy(() => import("@/pages/Permis/GestionPermisPage"));
const HunterPermits = lazy(() => import("@/pages/Permis/HunterPermits"));
const PermitRequestReception = lazy(() => import("@/pages/Permis/PermitRequestReception"));
const Permits = lazy(() => import("@/pages/Permis/Permits"));
const ProduitsForestiers = lazy(() => import("@/pages/ProduitsForestiers"));
const Agents = lazy(() => import("@/pages/Profile/Agents"));
const Hunters = lazy(() => import("@/pages/Profile/Hunters"));
const Profile = lazy(() => import("@/pages/Profile/ProfilePage"));

const AgentDefaultPage = lazy(() => import("@/pages/AgentDefault/AgentDefaultPage"));
const BrigadeDashboard = lazy(() => import("@/pages/brigade/BrigadeDashboard"));
const PosteControlDashboard = lazy(() => import("@/pages/poste-control/PosteControlDashboard"));
const CatalogueEspecesPage = lazy(() => import("@/pages/Reboisement/CatalogueEspecesPage"));
const ReboisementCommunautes = lazy(() => import("@/pages/Reboisement/Communautes"));
const ReboisementDemandes = lazy(() => import("@/pages/Reboisement/Demandes"));
const ReboisementLocalisation = lazy(() => import("@/pages/Reboisement/Localisation"));
const ReforestationAdminDashboard = lazy(() => import("@/pages/Reboisement/ReforestationAdminDashboard"));
const ReforestationDepartementDashboard = lazy(() => import("@/pages/Reboisement/ReforestationDepartementDashboard"));
const ReforestationRegionalDashboard = lazy(() => import("@/pages/Reboisement/ReforestationRegionalDashboard"));
const ReforestationSMSPage = lazy(() => import("@/pages/Reboisement/ReforestationSMSPage"));
const ReforestationReports = lazy(() => import("@/pages/Reboisement/reports/ReforestationReports"));
const ReboisementSuivi = lazy(() => import("@/pages/Reboisement/Suivi"));
const ReboisementPepinieres = lazy(() => import("@/pages/ReboisementPepinieres"));
const RegionalGuidesPage = lazy(() => import("@/pages/Regional/RegionalGuides"));
const RegionalStatsPage = lazy(() => import("@/pages/Regional/RegionalStats"));
const SubAccounts = lazy(() => import("@/pages/Regional/SubAccounts"));
const SectorGuidesPage = lazy(() => import("@/pages/Secteur/SectorGuides"));
const SectorHunters = lazy(() => import("@/pages/Secteur/SectorHunters"));
const SectorPermits = lazy(() => import("@/pages/Secteur/SectorPermits"));
const SectorRequests = lazy(() => import("@/pages/Secteur/SectorRequests"));
const SousSecteurDashboard = lazy(() => import("@/pages/sous-secteur/SousSecteurDashboard"));
const AffectationsPage = lazy(() => import("@/pages/SuperAdmin/AffectationsPage"));
const SuperAdminAgentsPage = lazy(() => import("@/pages/SuperAdmin/AgentsPage"));
const DomainesPage = lazy(() => import("@/pages/SuperAdmin/DomainesPage"));
const RolesMetierPage = lazy(() => import("@/pages/SuperAdmin/RolesMetierPage"));
const ThemePage = lazy(() => import("@/pages/SuperAdmin/ThemePage"));
const ApkHistoryPage = lazy(() => import("@/pages/SuperAdmin/ApkHistoryPage"));
const SupervisorPage = lazy(() => import("@/pages/Supervisor/SupervisorPage"));
const Taxes = lazy(() => import("@/pages/Taxes"));
const TriageDashboard = lazy(() => import("@/pages/triage/TriageDashboard"));

import AppErrorDialog from "@/components/ui/AppErrorDialog";
import { queryClient } from "./lib/queryClient";

function ProfileRouteGuard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if ((user as any)?.isSuperAdmin) {
      setLocation('/superadmin/agents');
    }
  }, [user, setLocation]);

  if ((user as any)?.isSuperAdmin) return null;
  return <Profile />;
}

function MyPermitsRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/permit-request?tab=create");
  }, [setLocation]);
  return null;
}

function MyRequestsRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/permit-request?tab=list");
  }, [setLocation]);
  return null;
}

function Router() {
  const [location, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const isAuthenticated = !!user;

  // Mémoriser si l'utilisateur était connecté AVANT que isLoading devienne true.
  // Cela évite le flash "Déconnexion en cours..." qui apparaissait lors d'une connexion
  // car l'AuthContext définit user avant de passer isLoading à false.
  const wasAuthenticatedRef = useRef(!!user);
  useEffect(() => {
    if (!isLoading) {
      wasAuthenticatedRef.current = !!user;
    }
  }, [isLoading, user]);

  // Déterminer si l'utilisateur doit avoir le verrouillage désactivé (Alerte, Chasseurs, Guides)
  const _appDomain = (typeof window !== 'undefined' ? localStorage.getItem('domain') || '' : '').toUpperCase();
  const isAlerteDomain = _appDomain === 'ALERTE' ||
    ((_appDomain !== 'CHASSE' && _appDomain !== 'REBOISEMENT') &&
      ((user as any)?.isDefaultRole || (user as any)?.isSupervisorRole));
  const isHunterOrGuide = user?.role === 'hunter' || user?.role === 'hunting-guide';
  // L'utilisateur a demandé à désactiver l'écran de verrouillage / session expirée
  const disableLockScreen = true; // isAlerteDomain || isHunterOrGuide;

  // Heartbeat de session + verrouillage d'écran après inactivité
  const sessionHeartbeat = useSessionHeartbeat(isAuthenticated, disableLockScreen);

  const publicRoutes = ["/", "/login", "/register", "/permit-simple", "/select-profile", "/produits-forestiers", "/reboisement-pepinieres", "/reboisement-login", "/alerte", "/alerte-login"];
  
  // Normalisation de l'URL pour gérer le préfixe public_id (UUID v4 de 36 caractères)
  const pathParts = location.split('/');
  const urlPublicId = (pathParts.length > 1 && pathParts[1].length === 36) ? pathParts[1] : '';
  const routerBase = urlPublicId ? `/${urlPublicId}` : '';
  const normalizedLocation = urlPublicId ? location.replace(`/${urlPublicId}`, '') || '/' : location;

  const isPublicRoute = publicRoutes.some(
    (route) => normalizedLocation === route || (route !== "/" && normalizedLocation.startsWith(route))
  );

  // Bloquer les gestes de retour (swipe-back) sur mobile quand authentifié,
  // et aussi sur la Home publique ('/') pour éviter les retours indésirables depuis l'accueil
  useEffect(() => {
    if (!isAuthenticated && normalizedLocation !== '/') return;
    const root = document.documentElement;
    const prevOverscroll = root.style.overscrollBehavior;
    // Empêcher les comportements de rebond qui peuvent déclencher des gestuelles de navigation
    root.style.overscrollBehavior = 'none';

    let startX = 0; let startY = 0; let active = false;
    const onTouchStart = (e: TouchEvent) => {
      if (normalizedLocation.startsWith('/login')) return; // autoriser sur login
      if (!e.touches || e.touches.length !== 1) return;
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY; active = startX <= 20; // bord gauche
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!active) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      // Si geste horizontal depuis le bord gauche vers la droite, bloquer
      if (dx > 25 && dy < 80) {
        e.preventDefault();
      }
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      root.style.overscrollBehavior = prevOverscroll;
      window.removeEventListener('touchstart', onTouchStart as any, { passive: true } as any);
      window.removeEventListener('touchmove', onTouchMove as any, { passive: false } as any);
    };
  }, [isAuthenticated, normalizedLocation]);

  // La redirection par domaine est désormais centralisée dans DashboardRedirector.tsx
  // Plus aucune logique de redirection globale ici pour éviter les conflits.

  if (isLoading) {
    return <SplashScreen message={wasAuthenticatedRef.current ? "Déconnexion en cours..." : "Connexion en cours..."} />;
  }

  // Verrouillage de session (overlay au-dessus de tout)
  const lockOverlay = (isAuthenticated && !disableLockScreen) ? (
    <SessionLockOverlay
      lockState={sessionHeartbeat.lockState}
      countdownSeconds={sessionHeartbeat.countdownSeconds}
      reauthenticate={sessionHeartbeat.reauthenticate}
      forceLogout={sessionHeartbeat.forceLogout}
    />
  ) : null;

  if (isPublicRoute) {
    return (
      <>
      {lockOverlay}
      <PwaUpdatePrompt />
      <Switch>
        <Route path="/" component={HomePageWrapper} />
        <Route path="/login" component={Login} />
        <Route
          path="/select-profile"
          component={() => {
            const [, setLocation] = useLocation();
            useEffect(() => {
              setLocation("/login?selectProfile=1");
            }, [setLocation]);
            return null;
          }}
        />
        {/* Redirection de fallback pour l'ancien tableau de bord régional */}
        <Route
          path="/agent-dashboard"
          component={() => {
            const [, setLocation] = useLocation();
            useEffect(() => { setLocation("/regional"); }, [setLocation]);
            return null;
          }}
        />
        <Route
          path="/register"
          component={() => {
            const { user } = useAuth();
            const isAuthenticated = !!user;
            const [, setLocation] = useLocation();
            useEffect(() => {
              if (isAuthenticated) {
                setLocation("/hunter");
              }
            }, [isAuthenticated, setLocation]);
            if (isAuthenticated) return null;
            return (
              <div className="fixed inset-0 z-[100] bg-white overflow-auto">
                <RegisterForm userType={location.includes("guide") ? "guide" : "hunter"} />
              </div>
            );
          }}
        />
        <Route
          path="/permit-simple"
          component={() => (
            <div className="min-h-screen bg-white">
              <DemandePermisChasse />
            </div>
          )}
        />
        <Route path="/produits-forestiers" component={ProduitsForestiers} />
        <Route path="/reboisement-pepinieres" component={ReboisementPepinieres} />
        <Route path="/reboisement-login" component={ReboisementLogin} />
        <Route
          path="/alerte"
          component={() => {
            const [, setLocation] = useLocation();
            useEffect(() => {
              setLocation("/alerte-login");
            }, [setLocation]);
            return null;
          }}
        />
        <Route path="/alerte-login" component={AlerteLogin} />
      </Switch>
      </>
    );
  }

  // Routes Reboisement rendues dans un layout dédié (sans MainLayout CHASSE)
  if (normalizedLocation.startsWith('/reboisement')) {
    return (
      <WouterRouter base={routerBase}>
      {lockOverlay}
      <PwaUpdatePrompt />
      <ReforestLayout>
        <Switch>
          <Route path="/reboisement/admin">
            <ReforestRoute allowedRoles={["admin"]}>
              <ReforestationAdminDashboard />
            </ReforestRoute>
          </Route>
          <Route path="/reboisement/regional">
            <ReforestRoute allowedRoles={["agent"]}>
              <ReforestationRegionalDashboard />
            </ReforestRoute>
          </Route>
          <Route path="/reboisement/reports">
            <ReforestRoute allowedRoles={["admin", "agent", "sub-agent"]}>
              <ReforestationReports />
            </ReforestRoute>
          </Route>
          <Route path="/reboisement/catalogue-especes">
            <ReforestRoute allowedRoles={["admin"]}>
              <CatalogueEspecesPage />
            </ReforestRoute>
          </Route>
          <Route path="/reboisement/departement">
            <ReforestRoute allowedRoles={["sub-agent"]}>
              <ReforestationDepartementDashboard />
            </ReforestRoute>
          </Route>
          <Route
            path="/reboisement"
            component={() => {
              const { user } = useAuth();
              const [, setLocation] = useLocation();
              useEffect(() => {
                if ((user as any)?.isSuperAdmin) return;
                if (user?.role === 'admin') {
                  setLocation('/reboisement/admin');
                } else if (user?.role === 'agent') {
                  setLocation('/reboisement/regional');
                } else if (user?.role === 'sub-agent') {
                  setLocation('/reboisement/departement');
                }
              }, [user, setLocation]);
              return null;
            }}
          />
          <Route path="/reboisement/demandes">
            <ReforestRoute>
              <ReboisementDemandes />
            </ReforestRoute>
          </Route>
          <Route path="/reboisement/localisation">
            <ReforestRoute>
              <ReboisementLocalisation />
            </ReforestRoute>
          </Route>
          <Route path="/reboisement/suivi">
            <ReforestRoute>
              <ReboisementSuivi />
            </ReforestRoute>
          </Route>
          <Route path="/reboisement/messagerie">
            <ReforestRoute allowedRoles={["admin", "agent", "sub-agent"]}>
              <ReforestationSMSPage />
            </ReforestRoute>
          </Route>
          <Route path="/reboisement/communautes">
            <ReforestRoute>
              <ReboisementCommunautes />
            </ReforestRoute>
          </Route>
          <Route path="/reboisement/profile">
            <ReforestRoute>
              <ProfileRouteGuard />
            </ReforestRoute>
          </Route>
        </Switch>
      </ReforestLayout>
      </WouterRouter>
    );
  }

  return (
    <WouterRouter base={routerBase}>
    {lockOverlay}
    <PwaUpdatePrompt />
    <MainLayout>
      <Switch>
        <Route path="/dashboard">
          <ChasseRoute>
            <DashboardRedirector />
          </ChasseRoute>
        </Route>
        <Route path="/admin">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminDashboard />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/regional">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["agent"]} allowedTypes={["regional"]}>
              <RegionalAgentDashboard />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/regional-stats">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["agent"]} allowedTypes={["regional"]}>
              <RegionalStatsPage />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/subaccounts">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["agent"]} allowedTypes={["regional"]}>
              <SubAccounts />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/regional-guides">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["agent"]} allowedTypes={["regional"]}>
              <RegionalGuidesPage />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/sector">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["agent", "sub-agent"]} allowedTypes={["secteur"]}>
              <SectorAgentDashboard />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>

        <Route path="/sector-agents">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["agent", "sub-agent"]} allowedTypes={["secteur"]}>
              <SectorSubAgentsPage />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/sector-guides">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["agent", "sub-agent"]} allowedTypes={["secteur"]}>
              <SectorGuidesPage />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/sector-hunters">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["agent", "sub-agent"]} allowedTypes={["secteur"]}>
              <SectorHunters />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        {/* ═══ Sous-Secteur ═══ */}
        <Route path="/sous-secteur">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["sub-agent"]}>
              <SousSecteurDashboard />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/sous-secteur/profile">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["sub-agent"]}>
              <Profile />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/sous-secteur/sms">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["sub-agent"]}>
              <SectorSMSPage />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/sous-secteur/infractions">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["sub-agent"]}>
              <Infractions />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/sous-secteur/carte">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["sous-secteur"]}>
              <MapPage />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/sous-secteur/alertes">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["sous-secteur"]}>
              <AlertsPage />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/sous-secteur/statistiques">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["sous-secteur"]}>
              <NationalStatistics />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>

        {/* ═══ Brigade ═══ */}
        <Route path="/brigade">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["sub-agent"]}>
              <BrigadeDashboard />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/brigade/profile">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["sub-agent"]}>
              <Profile />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/brigade/sms">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["sub-agent"]}>
              <SectorSMSPage />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/brigade/infractions">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["sub-agent"]}>
              <Infractions />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>

        {/* ═══ Triage ═══ */}
        <Route path="/triage">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["sub-agent"]}>
              <TriageDashboard />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/triage/profile">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["sub-agent"]}>
              <Profile />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/triage/sms">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["sub-agent"]}>
              <SectorSMSPage />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/triage/infractions">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["sub-agent"]}>
              <Infractions />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>

        {/* ═══ Poste de Contrôle ═══ */}
        <Route path="/poste-control">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["sub-agent"]}>
              <PosteControlDashboard />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/poste-control/profile">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["sub-agent"]}>
              <Profile />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/poste-control/sms">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["sub-agent"]}>
              <SectorSMSPage />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/poste-control/infractions">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["sub-agent"]}>
              <Infractions />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>

        <Route path="/hunter">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["hunter"]}>
              <HunterDashboard />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/hunter/:tab">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["hunter"]}>
              <HunterDashboard />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/permit-request">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["hunter"]}>
              <DemandePermisChasse />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/gestion-permis">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["hunter"]}>
              <GestionPermisPage />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/permit-request/:id">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["hunter"]}>
              <DetailDemandePermis />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/guide">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["hunting-guide"]}>
              <GuideDashboard />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/guide/:tab">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["hunting-guide"]}>
              <GuideDashboard />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        {/* Redirection de fallback pour l'ancien tableau de bord admin */}
        <Route
          path="/dashboard-admin"
          component={() => {
            const [, setLocation] = useLocation();
            useEffect(() => { setLocation("/admin"); }, [setLocation]);
            return null;
          }}
        />

        {/* Redirections de fallback vers l'URL canonique du tableau de bord secteur */}
        <Route
          path="/sector-dashboard"
          component={() => {
            const [, setLocation] = useLocation();
            useEffect(() => { setLocation("/sector"); }, [setLocation]);
            return null;
          }}
        />
        <Route
          path="/sector-agent/dashboard"
          component={() => {
            const [, setLocation] = useLocation();
            useEffect(() => { setLocation("/sector"); }, [setLocation]);
            return null;
          }}
        />
        {/* Redirections de fallback pour chasseurs et guides */}
        <Route
          path="/hunter-dashboard"
          component={() => {
            const [, setLocation] = useLocation();
            useEffect(() => { setLocation("/hunter"); }, [setLocation]);
            return null;
          }}
        />
        <Route
          path="/guide-dashboard"
          component={() => {
            const [, setLocation] = useLocation();
            useEffect(() => { setLocation("/guide"); }, [setLocation]);
            return null;
          }}
        />

        <Route path="/especes-fauniques">
          <ChasseRoute>
            <ProtectedRoute adminOnly>
              <EspecesFauniques />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/settings">
          <ChasseRoute>
            <ProtectedRoute adminOnly superAdminOnly>
              <Settings />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/accounts">
          <ChasseRoute>
            <ProtectedRoute adminOnly superAdminOnly>
              <Accounts />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>

        <Route path="/superadmin/affectations">
          <ChasseRoute>
            <ProtectedRoute adminOnly superAdminOnly>
              <AffectationsPage />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>

        <Route path="/superadmin/agents">
          <ChasseRoute>
            <ProtectedRoute adminOnly superAdminOnly>
              <SuperAdminAgentsPage />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>

        <Route path="/superadmin/domaines">
          <ChasseRoute>
            <ProtectedRoute adminOnly superAdminOnly>
              <DomainesPage />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>

        <Route path="/superadmin/roles-metier">
          <ChasseRoute>
            <ProtectedRoute adminOnly superAdminOnly>
              <RolesMetierPage />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>

        <Route path="/superadmin/theme">
          <ChasseRoute>
            <ProtectedRoute adminOnly superAdminOnly>
              <ThemePage />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/admin/history">
          <ChasseRoute>
            <ProtectedRoute adminOnly superAdminOnly>
              <AdminHistory />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/superadmin/apk-history">
          <ChasseRoute>
            <ProtectedRoute adminOnly superAdminOnly>
              <ApkHistoryPage />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route
          path="/agents"
          component={() => {
            const { user } = useAuth();
            const [, setLocation] = useLocation();

            useEffect(() => {
              if (isUserSuperAdmin(user)) {
                setLocation('/superadmin/agents');
              }
            }, [user, setLocation]);

            if (isUserSuperAdmin(user)) return null;

            return (
              <ChasseRoute>
                <ProtectedRoute adminOrAgentOrSubAgentOnly>
                  <Agents />
                </ProtectedRoute>
              </ChasseRoute>
            );
          }}
        />
        <Route path="/hunters">
          <ChasseRoute>
            <ProtectedRoute adminOrAgentOnly>
              <Hunters />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/regions-zones">
          <ChasseRoute>
            <ProtectedRoute adminOrAgentOrSubAgentOnly>
              <RegionsZones />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/permits">
          <ChasseRoute>
            <ProtectedRoute adminOrAgentOnly>
              <Permits />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/permit-requests">
          <ChasseRoute>
            <ProtectedRoute adminOrAgentOnly>
              <PermitRequestReception />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/taxes">
          <ChasseRoute>
            <ProtectedRoute adminOrAgentOrSubAgentOnly>
              <Taxes />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/history">
          <ChasseRoute>
            <ProtectedRoute adminOrAgentOnly>
              <History />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/sms">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["admin","agent","sub-agent","brigade","triage","poste-control","sous-secteur","hunter","hunting-guide"]}>
              <SMSPage />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/regional-sms">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["agent"]} allowedTypes={["regional"]}>
              <RegionalSMSPage />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/sector-sms">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["agent", "sub-agent"]} allowedTypes={["secteur"]}>
              <SectorSMSPage />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/permit-requests-reception">
          <ChasseRoute>
            <ProtectedRoute adminOrAgentOnly>
              <PermitRequestReception />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/hunting-declarations">
          <ChasseRoute>
            <ProtectedRoute hunterOnly>
              <HuntingDeclarations />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/hunting-activities">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["hunter", "hunting-guide"]}>
              <HuntingActivities />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/historiquehunterscomptes">
          <ChasseRoute>
            <ProtectedRoute hunterOnly>
              <History />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/guides/associate-hunters">
          <ChasseRoute>
            <ProtectedRoute huntingGuideOnly>
              <AssociateHunters />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/guides">
          <ChasseRoute>
            <ProtectedRoute adminOnly>
              <Guides />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/admin/gestion-des-agents">
          <ChasseRoute>
            <ProtectedRoute adminOnly>
              <GestiondesAgents />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/admin/create-agent">
          <ChasseRoute>
            <ProtectedRoute adminOnly>
              <CreateAgentForm />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/infractions">
          <ChasseRoute>
            <ProtectedRoute adminOrAgentOrSubAgentOnly>
              <Infractions />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/changeprofil">
          <ChasseRoute>
            <ProtectedRoute adminOrAgentOnly>
              <ChangeprofilPage />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/android-settings">
          <ChasseRoute>
            <ProtectedRoute>
              <AndroidSettings />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/sector-permits">
          <ProtectedRoute allowedRoles={["agent", "sub-agent"]} allowedTypes={["secteur"]}>
            <SectorPermits />
          </ProtectedRoute>
        </Route>
        <Route path="/sector-requests">
          <ProtectedRoute allowedRoles={["agent", "sub-agent"]} allowedTypes={["secteur"]}>
            <SectorRequests />
          </ProtectedRoute>
        </Route>
        <Route path="/map">
          <ProtectedRoute>
            <MapPage />
          </ProtectedRoute>
        </Route>
        <Route path="/geojson-test">
          <ProtectedRoute>
            <GeoJSONTestPage />
          </ProtectedRoute>
        </Route>
        <Route path="/supervisor">
          <ProtectedRoute>
            <SupervisorPage />
          </ProtectedRoute>
        </Route>
        <Route path="/default-home">
          <ProtectedRoute>
            <AgentDefaultPage />
          </ProtectedRoute>
        </Route>
        <Route path="/alerts">
          <ChasseRoute>
            <ProtectedRoute>
              <AlertsPage />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/sms">
          <ChasseRoute>
            <ProtectedRoute>
              <SMSPage />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/profile">
          <ChasseRoute>
            <ProtectedRoute>
              <ProfileRouteGuard />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route path="/mypermits">
          <MyPermitsRedirect />
        </Route>
        <Route path="/hunter-permits">
          <ProtectedRoute hunterOnly>
            <HunterPermits />
          </ProtectedRoute>
        </Route>
        <Route path="/hunting-reports">
          <ProtectedRoute allowedRoles={["hunter", "hunting-guide"]}>
            <HuntingReports />
          </ProtectedRoute>
        </Route>
        <Route path="/hunting-activities">
          <ProtectedRoute allowedRoles={["hunter", "hunting-guide"]}>
            <HuntingActivities />
          </ProtectedRoute>
        </Route>
        <Route path="/historiquehunterscomptes">
          <ProtectedRoute hunterOnly>
            <History />
          </ProtectedRoute>
        </Route>
        <Route path="/guides/associate-hunters">
          <ProtectedRoute huntingGuideOnly>
            <AssociateHunters />
          </ProtectedRoute>
        </Route>
        <Route path="/guides">
          <ProtectedRoute adminOnly>
            <Guides />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/gestion-des-agents">
          <ProtectedRoute adminOnly>
            <GestiondesAgents />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/create-agent">
          <ProtectedRoute adminOnly>
            <CreateAgentForm />
          </ProtectedRoute>
        </Route>
        <Route path="/infractions">
          <ProtectedRoute adminOrAgentOrSubAgentOnly>
            <Infractions />
          </ProtectedRoute>
        </Route>
        <Route path="/changeprofil">
          <ProtectedRoute adminOrAgentOnly>
            <ChangeprofilPage />
          </ProtectedRoute>
        </Route>
        <Route path="/android-settings">
          <ProtectedRoute>
            <AndroidSettings />
          </ProtectedRoute>
        </Route>
        <Route path="/statistics">
          <ChasseRoute>
            <ProtectedRoute adminOnly>
              <NationalStatistics />
            </ProtectedRoute>
          </ChasseRoute>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </MainLayout>
    </WouterRouter>
  );
}

function applyTheme(cfg: any, user: any, location: string) {
  if (typeof window === 'undefined') return;
  const html = document.documentElement;

  // Récupérer le user depuis la session localStorage de secours s'il n'est pas encore chargé dans React
  let effectiveUser = user;
  if (!effectiveUser) {
    try {
      const savedSessionStr = localStorage.getItem('scodi_session');
      if (savedSessionStr) {
        effectiveUser = JSON.parse(savedSessionStr);
      }
    } catch (e) {
      effectiveUser = null;
    }
  }

  const isSuperAdminUser = effectiveUser?.isSuperAdmin === true;
  const isSuperAdminSection = location.startsWith('/superadmin') || 
                              location.startsWith('/admin') || 
                              location === '/settings' || 
                              location === '/accounts';
  const shouldApplySuperAdminTheme = isSuperAdminUser || (isSuperAdminSection && isSuperAdminUser);

  // Détection automatique du domaine par l'URL si non défini ou pour corriger le localStorage au démarrage
  let domainKey = '';
  try {
    domainKey = (localStorage.getItem('domain') || '').toUpperCase();
  } catch (e) {}

  const lowerLoc = location.toLowerCase();
  let pathDomain = '';
  // --- Du00e9tection APK synchrone (prioritu00e9 absolue) ---
  try {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    if (ua.includes('ChasseAPK')) pathDomain = 'CHASSE';
    else if (ua.includes('AlerteAPK')) pathDomain = 'ALERTE';
  } catch (e) {}
  if (!pathDomain) {
    if (lowerLoc.startsWith('/reboisement') || lowerLoc.startsWith('/pepinieres') || lowerLoc.startsWith('/zones-reboisees') || lowerLoc.startsWith('/declarations') || lowerLoc.startsWith('/reboisement-login')) {
      pathDomain = 'REBOISEMENT';
    } else if (lowerLoc.startsWith('/alerte') || lowerLoc.startsWith('/alertes') || lowerLoc.startsWith('/supervisor') || lowerLoc.startsWith('/default-home')) {
      pathDomain = 'ALERTE';
    } else if (
      lowerLoc === '/login' || lowerLoc.startsWith('/hunter') || lowerLoc.startsWith('/guide') ||
      lowerLoc.startsWith('/admin') || lowerLoc.startsWith('/regional') || lowerLoc.startsWith('/sector') ||
      lowerLoc.startsWith('/sous-secteur') || lowerLoc.startsWith('/brigade') || lowerLoc.startsWith('/triage') ||
      lowerLoc.startsWith('/poste-control') || lowerLoc.startsWith('/dashboard') || lowerLoc.startsWith('/permits') ||
      lowerLoc.startsWith('/permit-request') || lowerLoc.startsWith('/gestion-permis') || lowerLoc.startsWith('/taxes') ||
      lowerLoc.startsWith('/guides') || lowerLoc.startsWith('/agents') || lowerLoc.startsWith('/hunters') ||
      lowerLoc.startsWith('/chasse') || lowerLoc.startsWith('/especes') || lowerLoc.startsWith('/infractions') ||
      lowerLoc.startsWith('/history') || lowerLoc.startsWith('/sms') || lowerLoc.startsWith('/alerts') ||
      lowerLoc.startsWith('/map') || lowerLoc.startsWith('/statistics') || lowerLoc.startsWith('/hunting') ||
      lowerLoc.startsWith('/profile') || lowerLoc.startsWith('/changeprofil') || lowerLoc.startsWith('/regions-zones') ||
      lowerLoc.startsWith('/accounts') || lowerLoc.startsWith('/settings') || lowerLoc.startsWith('/subaccounts')
    ) {
      pathDomain = 'CHASSE';
    }
  }

  if (pathDomain && pathDomain !== domainKey) {
    domainKey = pathDomain;
    try {
      localStorage.setItem('domain', pathDomain);
    } catch (e) {}
  }

  const domainTheme = cfg?.domains?.[domainKey] || {};

  html.classList.remove('superadmin-theme', 'domain-theme', 'dark-superadmin');

  let activeTheme: any = {};
  const isLoginPage = lowerLoc === '/login' || lowerLoc === '/alerte-login' || lowerLoc === '/reboisement-login';
  
  if (isLoginPage) {
    // Ne pas injecter les variables CSS globales du domaine sur les pages de login
    // car elles ont leur propre système de personnalisation via inline styles.
    activeTheme = {};
  } else if (shouldApplySuperAdminTheme) {
    activeTheme = cfg?.superAdmin || {};
    html.classList.add('superadmin-theme');
    if (cfg?.superAdmin?.useLegacyDark === true) {
      html.classList.add('dark-superadmin');
    }
  } else if (domainTheme.bg || domainTheme.sidebarBg || domainTheme.headerBg) {
    activeTheme = domainTheme;
    html.classList.add('domain-theme');
  }

  const vars: Record<string, string | undefined> = {
    '--sa-bg': activeTheme.bg,
    '--sa-text': activeTheme.text,
    '--sa-sidebar-bg': activeTheme.sidebarBg,
    '--sa-header-bg': activeTheme.headerBg,
    '--sa-surface': activeTheme.surface,
    '--sa-border': activeTheme.border,
    '--sa-accent': activeTheme.accent,
    '--sa-input-bg': activeTheme.inputBg,
    '--superadmin-bg': activeTheme.bg,
    '--superadmin-text': activeTheme.text,
    '--superadmin-sidebar-bg': activeTheme.sidebarBg,
    '--superadmin-header-bg': activeTheme.headerBg,
    '--superadmin-surface': activeTheme.surface,
    '--superadmin-border': activeTheme.border,
    '--superadmin-accent': activeTheme.accent,
  };

  for (const [k, v] of Object.entries(vars)) {
    if (v) html.style.setProperty(k, v);
    else html.style.removeProperty(k);
  }
}

function GlobalThemeLoader() {
  const { user } = useAuth();
  const [location] = useLocation();
  const [themeVersion, setThemeVersion] = useState(0);

  useEffect(() => {
    const onThemeUpdated = () => setThemeVersion((v) => v + 1);
    window.addEventListener('theme:superadmin:updated', onThemeUpdated);
    return () => window.removeEventListener('theme:superadmin:updated', onThemeUpdated);
  }, []);

  // Lire les configurations de localStorage de manière synchrone pendant le rendu
  let cfg: any = null;
  try {
    const raw = localStorage.getItem('theme:superadmin');
    cfg = raw ? JSON.parse(raw) : null;
  } catch (e) {
    cfg = null;
  }

  // Appliquer le thème directement lors du rendu pour éviter les flashs/FOUC au démarrage du système
  applyTheme(cfg, user, location);

  // Mettre à jour depuis la base de données de manière asynchrone
  useEffect(() => {
    // Ne pas tenter si hors-ligne : le thème localStorage suffit
    if (!navigator.onLine) return;
    (async () => {
      try {
        const res = await fetch(resolveApiUrl('/api/themes/active'), {
          cache: 'no-store',
          credentials: 'include',
        });
        if (res.ok) {
          const theme = await res.json();
          if (theme?.config) {
            localStorage.setItem('theme:superadmin', JSON.stringify(theme.config));
            setThemeVersion((v) => v + 1);
            window.dispatchEvent(new Event('theme:superadmin:updated'));
          }
        }
        // 401/403 ignorés silencieusement : le thème local est suffisant
      } catch (e) { /* Silencieux : le thème est un bonus, pas critique */ }
    })();
  }, []);

  return null;
}

function AppContent() {
  const { user } = useAuth();

  // Bloquer le menu contextuel et les raccourcis développeur
  // Sauf pour les administrateurs qui ont un accès complet
  // On attend que l'utilisateur soit chargé avant d'appliquer les restrictions
  const isAdmin = user?.role === 'admin';

  // Debug: afficher le rôle de l'utilisateur dans la console
  useEffect(() => {
    if (user) {
      console.log('🔐 Utilisateur connecté:', { role: user.role, isAdmin });
    }
  }, [user, isAdmin]);

  useDisableContextMenu(isAdmin);

  // Masquer le splashscreen HTML une fois que React est chargé
  useEffect(() => {
    // Si on est sur l'APK Alerte, on force le domaine ALERTE dans le localStorage
    const isAlerteApk =
      typeof window !== 'undefined' &&
      (window.location.search.includes('isApk=true') ||
        navigator.userAgent.includes('AlerteAPK') ||
        (typeof (window as any).Capacitor !== 'undefined' && (window as any).Capacitor.isNativePlatform?.() && !isChasseAPK()));
        
    if (isChasseAPK()) {
      try {
        localStorage.setItem('domain', 'CHASSE');
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[AppContent] Failed to set domain to CHASSE in localStorage', e);
      }
    } else if (isAlerteApk) {
      try {
        localStorage.setItem('domain', 'ALERTE');
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[AppContent] Failed to set domain to ALERTE in localStorage', e);
      }
    }

    // Attendre que l'application soit complètement montée
    const timer = setTimeout(() => {
      if (typeof window.hideSplashScreen === 'function') {
        window.hideSplashScreen();
      }
    }, 500); // Petit délai pour s'assurer que tout est rendu

    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <GlobalThemeLoader />
      <NetworkStatusBanner />
      <Suspense fallback={<PageLoader />}>
        <Router />
      </Suspense>
      <Toaster />
      <AppErrorDialog />
      <DebugInfo />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthWrapper>
          <AlerteApkNotifications />
          <AppContent />
        </AuthWrapper>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
