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
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Route, Switch, useLocation, Router as WouterRouter } from "wouter";
import { PwaUpdatePrompt } from "@/components/ui/PwaUpdatePrompt";
import { SplashScreen } from "@/components/ui/SplashScreen";

import HomePageWrapper from "@/components/auth/HomePageWrapper";
import RegisterForm from "@/components/auth/RegisterForm";
import HuntingActivities from "@/pages/Activites chasse/HuntingActivities";
import HuntingDeclarations from "@/pages/Activites chasse/HuntingDeclarations";
import HuntingReports from "@/pages/Activites chasse/HuntingReports";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import CreateAgentForm from "@/pages/admin/CreateAgentForm";
import GestiondesAgents from "@/pages/admin/GestiondesAgents";
import RegionsZones from "@/pages/admin/RegionsZones";
import SectorAgentDashboard from "@/pages/agents-secteur/Dashboard";
import SectorSubAgentsPage from "@/pages/agents-secteur/SectorSubAgents";
import AlerteLogin from "@/pages/AlerteLogin";
import AndroidSettings from "@/pages/AndroidSettings";
import ChangeprofilPage from "@/pages/Changeprofil";
import Accounts from "@/pages/ConfigSysteme/Accounts";
import EspecesFauniques from "@/pages/ConfigSysteme/EspecesFauniques";
import Infractions from "@/pages/ConfigSysteme/Infractions";
import Settings from "@/pages/ConfigSysteme/Settings";
import GeoJSONTestPage from "@/pages/GeoJSONTestPage";
import AssociateHunters from "@/pages/Guides/AssociateHunters";
import GuideDashboard from "@/pages/Guides/GuideDashboard";
import Guides from "@/pages/Guides/Guides";
import AdminHistory from "@/pages/Historique/AdminHistory";
import History from "@/pages/Historique/History";
import HunterDashboard from "@/pages/Hunter/Dashboard";
import Login from "@/pages/Login";
import MapPage from "@/pages/MapPage";
import AlertsPage from "@/pages/Messagerie/AlertsPage";
import RegionalSMSPage from "@/pages/Messagerie/RegionalSMSPage";
import SectorSMSPage from "@/pages/Messagerie/SectorSMSPage";
import SMSPage from "@/pages/Messagerie/SMSPage";
import NationalStatistics from "@/pages/National/NationalStatistics";
import DemandePermisSpecial from "@/pages/Permis/DemandePermisSpecial";
import DetailDemandePermis from "@/pages/Permis/DetailDemandePermis";
import GestionPermisPage from "@/pages/Permis/GestionPermisPage";
import HunterPermits from "@/pages/Permis/HunterPermits";
import HuntingPermitRequest from "@/pages/Permis/HuntingPermitRequest";
import PermitRequestManagementSimple from "@/pages/Permis/PermitRequestManagementSimple";
import PermitRequestPage from "@/pages/Permis/PermitRequestPage";
import PermitRequestReception from "@/pages/Permis/PermitRequestReception";
import Permits from "@/pages/Permis/Permits";
import ProduitsForestiers from "@/pages/ProduitsForestiers";
import Agents from "@/pages/Profile/Agents";
import Hunters from "@/pages/Profile/Hunters";
import Profile from "@/pages/Profile/ProfilePage";

import AgentDefaultPage from "@/pages/AgentDefault/AgentDefaultPage";
import BrigadeDashboard from "@/pages/brigade/BrigadeDashboard";
import PosteControlDashboard from "@/pages/poste-control/PosteControlDashboard";
import CatalogueEspecesPage from "@/pages/Reboisement/CatalogueEspecesPage";
import ReboisementCommunautes from "@/pages/Reboisement/Communautes";
import ReboisementDemandes from "@/pages/Reboisement/Demandes";
import ReboisementLocalisation from "@/pages/Reboisement/Localisation";
import ReforestationAdminDashboard from "@/pages/Reboisement/ReforestationAdminDashboard";
import ReforestationDepartementDashboard from "@/pages/Reboisement/ReforestationDepartementDashboard";
import ReforestationRegionalDashboard from "@/pages/Reboisement/ReforestationRegionalDashboard";
import ReforestationSMSPage from "@/pages/Reboisement/ReforestationSMSPage";
import ReforestationReports from "@/pages/Reboisement/reports/ReforestationReports";
import ReboisementSuivi from "@/pages/Reboisement/Suivi";
import ReboisementLogin from "@/pages/ReboisementLogin";
import ReboisementPepinieres from "@/pages/ReboisementPepinieres";
import RegionalAgentDashboard from "@/pages/Regional/regional-dashboard";
import RegionalGuidesPage from "@/pages/Regional/RegionalGuides";
import RegionalStatsPage from "@/pages/Regional/RegionalStats";
import SubAccounts from "@/pages/Regional/SubAccounts";
import SectorGuidesPage from "@/pages/Secteur/SectorGuides";
import SectorHunters from "@/pages/Secteur/SectorHunters";
import SectorPermits from "@/pages/Secteur/SectorPermits";
import SectorRequests from "@/pages/Secteur/SectorRequests";
import SousSecteurDashboard from "@/pages/sous-secteur/SousSecteurDashboard";
import AffectationsPage from "@/pages/SuperAdmin/AffectationsPage";
import SuperAdminAgentsPage from "@/pages/SuperAdmin/AgentsPage";
import DomainesPage from "@/pages/SuperAdmin/DomainesPage";
import RolesMetierPage from "@/pages/SuperAdmin/RolesMetierPage";
import ThemePage from "@/pages/SuperAdmin/ThemePage";
import ApkHistoryPage from "@/pages/SuperAdmin/ApkHistoryPage";
import SupervisorPage from "@/pages/Supervisor/SupervisorPage";
import Taxes from "@/pages/Taxes";
import TriageDashboard from "@/pages/triage/TriageDashboard";

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
              <HuntingPermitRequest />
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
        <Route path="/demande-permis-special">
          <ChasseRoute>
            <ProtectedRoute allowedRoles={["hunter"]}>
              <DemandePermisSpecial />
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
        <Route path="/demande-permis-special/:id">
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
              <PermitRequestManagementSimple />
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
          {() => {
            const [, setLocation] = useLocation();
            useEffect(() => { setLocation("/permit-request?tab=create"); }, [setLocation]);
            return null;
          }}
        </Route>
        <Route path="/hunter-permits">
          <ProtectedRoute hunterOnly>
            <HunterPermits />
          </ProtectedRoute>
        </Route>
        <Route path="/myrequests">
          {() => {
            const [, setLocation] = useLocation();
            useEffect(() => { setLocation("/permit-request?tab=list"); }, [setLocation]);
            return null;
          }}
        </Route>
        <Route path="/permit-request">
          <ProtectedRoute hunterOnly>
            <PermitRequestPage />
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

function GlobalThemeLoader() {
  const { user } = useAuth();
  const [location] = useLocation();
  const [themeVersion, setThemeVersion] = useState(0);

  useEffect(() => {
    const onThemeUpdated = () => setThemeVersion((v) => v + 1);
    window.addEventListener('theme:superadmin:updated', onThemeUpdated);
    return () => window.removeEventListener('theme:superadmin:updated', onThemeUpdated);
  }, []);

  useEffect(() => {
    const html = document.documentElement;

    let cfg: any = null;
    try {
      const raw = localStorage.getItem('theme:superadmin');
      cfg = raw ? JSON.parse(raw) : null;
    } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
      cfg = null;
     }

    const isSuperAdminUser = (user as any)?.isSuperAdmin === true;
    const isSuperAdminSection = location.startsWith('/superadmin');
    const shouldApplySuperAdminTheme = isSuperAdminUser && isSuperAdminSection;
    
    const domainKey = (localStorage.getItem('domain') || '').toUpperCase();
    const domainTheme = cfg?.domains?.[domainKey] || {};

    html.classList.remove('superadmin-theme', 'domain-theme', 'dark-superadmin');

    let activeTheme: any = {};
    
    if (shouldApplySuperAdminTheme) {
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
    };

    for (const [k, v] of Object.entries(vars)) {
      if (v) html.style.setProperty(k, v);
      else html.style.removeProperty(k);
    }
  }, [themeVersion, user, location]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/themes/active', { cache: 'no-store' });
        if (res.ok) {
          const theme = await res.json();
          if (theme?.config) {
            localStorage.setItem('theme:superadmin', JSON.stringify(theme.config));
            setThemeVersion((v) => v + 1);
            window.dispatchEvent(new Event('theme:superadmin:updated'));
          }
        }
      } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  }
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
      <Router />
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
