import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, FileText, LayoutDashboard, LogOut, MapPin, MessageSquare, RefreshCw, Sprout, TreePine, User } from 'lucide-react';
import React from 'react';
import { Link, useLocation } from 'wouter';

export default function ReforestLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth();
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const dashboardPath =
    user?.role === 'admin'
      ? '/reboisement/admin'
      : user?.role === 'agent'
        ? '/reboisement/regional'
        : '/reboisement';

  // Polling des messages non lus (Domaine Reboisement = 33)
  const { data: unreadMsgCount } = useQuery({
    queryKey: ['messages-unread-count', 33],
    queryFn: async () => {
      try {
        const res = await fetch('/api/messages/unread-count?domaineId=33', { credentials: 'include' });
        if (!res.ok) return { total: 0 };
        return await res.json();
      } catch {
        return { total: 0 };
      }
    },
    enabled: !!user,
    refetchInterval: 5_000,
  });

  const handleRefreshAll = async () => {
    const btn = document.getElementById('reforest-refresh-btn');
    if (btn) btn.classList.add('animate-spin');

    try {
      await queryClient.refetchQueries();
      toast({
        title: "Actualisation réussie",
        description: "Les données ont été mises à jour",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible d'actualiser les données",
        variant: "destructive"
      });
    } finally {
      if (btn) btn.classList.remove('animate-spin');
    }
  };

  const navItems = [
    { path: dashboardPath, label: 'Tableau de bord', icon: LayoutDashboard, roles: ['admin', 'agent', 'sub-agent'] },
    { path: '/reboisement/reports', label: 'Rapports Quinzaine', icon: FileText, roles: ['admin', 'agent', 'sub-agent'] },
    { path: '/reboisement/localisation', label: 'Localisation', icon: MapPin, roles: ['admin', 'agent', 'sub-agent'] },
    { path: '/reboisement/demandes', label: 'Demandes de plants', icon: TreePine, roles: ['admin', 'agent'] },
    { path: '/reboisement/suivi', label: 'Suivi', icon: FileText, roles: ['admin', 'agent'] },
    { path: '/reboisement/messagerie', label: 'Messagerie', icon: MessageSquare, roles: ['admin', 'agent', 'sub-agent'] },
    { path: '/reboisement/catalogue-especes', label: 'Catalogue Espèces', icon: BookOpen, roles: ['admin'] },
  ];

  const filteredNavItems = navItems.filter(item => {
    if (item.roles && !item.roles.includes(user?.role || '')) return false;
    // if (item.types && user?.role === 'agent' && !item.types.includes((user as any)?.agentType)) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-green-50 to-lime-100">
      <header className="sticky top-0 z-30 bg-green-700 text-white shadow">
        <div className="w-full max-w-[98%] mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3 relative">
            <div className="flex items-center gap-2 sm:gap-3">
              <img
                src="/assets/Flag_of_Senegal.svg"
                alt="Drapeau du Sénégal"
                width="32"
                height="24"
                className="shadow-sm rounded-sm"
              />
              <div className="leading-tight border-l border-white/20 pl-3">
                <h1 className="uppercase text-[9px] sm:text-[11px] font-bold tracking-wider">République du Sénégal</h1>
                <p className="uppercase text-[8px] sm:text-[9px] opacity-95 font-medium">Ministère de l'Environnement et de la Transition Écologique</p>
                <p className="uppercase text-[8px] sm:text-[9px] opacity-85 hidden sm:block">Direction des Eaux et Forêts, Chasse et Conservation des Sols</p>
              </div>
            </div>

            <div id="layout-header-title" className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center justify-center">
              <div className="flex items-center gap-2 bg-black/10 px-4 py-1.5 rounded-full border border-white/10 backdrop-blur-sm">
                <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                  <Sprout className="w-4 h-4" />
                </div>
                <div className="leading-tight">
                  <div className="font-bold text-sm tracking-wide uppercase">Reboisement</div>
                  <div className="text-[9px] text-green-100 opacity-80 font-medium">Division REBOISEMENT</div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <button
                onClick={handleRefreshAll}
                className="inline-flex items-center gap-1 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-md transition-colors"
                title="Actualiser les données"
              >
                <RefreshCw id="reforest-refresh-btn" className="w-4 h-4" />
                <span className="hidden sm:inline">Actualiser</span>
              </button>
              <button
                onClick={() => logout()}
                disabled={isLoading}
                className="inline-flex items-center gap-1 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-md transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Déconnexion
              </button>
            </div>
          </div>
          <nav className="flex items-center gap-1 overflow-x-auto pb-2">
            {filteredNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.path;
              const isMessaging = item.path === '/reboisement/messagerie';

              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm whitespace-nowrap transition-colors relative ${
                    isActive
                      ? 'bg-white/20 text-white font-medium'
                      : 'text-green-100 hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {isMessaging && unreadMsgCount?.total > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm animate-pulse">
                      {unreadMsgCount.total > 99 ? '99+' : unreadMsgCount.total}
                    </span>
                  )}
                </Link>
              );
            })}
            <div className="flex-1" />
            <Link
              href="/reboisement/profile"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-all ${
                location === '/reboisement/profile'
                  ? 'bg-white/30 text-white font-semibold ring-1 ring-white/50'
                  : 'text-green-50 hover:bg-white/10'
              }`}
            >
              <div className="flex flex-col items-end mr-1 leading-tight hidden sm:flex">
                <span className="text-[11px] opacity-70 uppercase font-medium">Mon Profil</span>
                <span className="max-w-[150px] lg:max-w-[220px] truncate font-semibold">
                  {(user as any)?.grade ? `${(user as any).grade} ` : ''}
                  {user?.firstName} {user?.lastName?.toUpperCase()}
                </span>
              </div>
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shadow-inner group-hover:bg-white/30 transition-colors">
                <User className="w-4 h-4" />
              </div>
            </Link>
          </nav>
        </div>
      </header>
      <main className="w-full max-w-[98%] mx-auto px-2 sm:px-4 py-6">
        {children}
      </main>
    </div>
  );
}
