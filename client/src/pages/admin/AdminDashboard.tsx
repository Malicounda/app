import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Bell, ChevronDown, ChevronRight, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

// Types pour les données du tableau de bord
type DashboardStats = {
  totalUsers: number;
  activeUsers: number;
  totalPermits: number;
  pendingApprovals: number;
};

// Type partagé pour les données de répartition par catégorie
type BreakdownRow = {
  groupe: string;
  genre: string | null;
  sousCategorie: string | null;
  categoryKey: string;
  labelFr: string;
  displayOrder?: number;
  huntersCount: number;
  permitsCount: number;
  totalAmount: number;
};

// Composant tiroir (accordion) pour chaque rubrique de catégorie
type CategoryDrawerProps = {
  section: {
    header: string;
    items: BreakdownRow[];
    totals: { hunters: number; permits: number; amount: number };
  };
};

function CategoryDrawer({ section }: CategoryDrawerProps) {
  const [open, setOpen] = useState(false);
  const itemCount = section.items.length;

  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      {/* En-tête cliquable */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {open ? (
            <ChevronDown className="w-5 h-5 text-slate-500" />
          ) : (
            <ChevronRight className="w-5 h-5 text-slate-500" />
          )}
          <span className="text-lg font-semibold uppercase tracking-wide text-gray-800">
            {section.header}
          </span>
          {!open && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              {section.totals.hunters.toLocaleString('fr-FR')} chasseurs • {section.totals.permits.toLocaleString('fr-FR')} permis
            </span>
          )}
        </div>
        <div className="flex gap-5 text-base font-semibold text-gray-700">
          <span>{section.totals.hunters.toLocaleString('fr-FR')}</span>
          <span>{section.totals.permits.toLocaleString('fr-FR')}</span>
          <span>{section.totals.amount.toLocaleString('fr-FR')} XOF</span>
        </div>
      </button>

      {/* Contenu déplié */}
      {open && (
        <div className="border-t">
          {/* Sous-en-tête colonnes */}
          <div className="grid grid-cols-[1fr_100px_100px_140px] gap-2 px-5 py-2 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>Catégorie</span>
            <span className="text-right">Chasseurs</span>
            <span className="text-right">Permis</span>
            <span className="text-right">Montant cumulé</span>
          </div>
          {section.items.map((it) => (
            <div
              key={it.categoryKey}
              className="grid grid-cols-[1fr_100px_100px_140px] gap-2 px-5 py-2.5 border-t hover:bg-slate-25 transition-colors"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-800">{it.labelFr}</span>
                {it.sousCategorie && (
                  <span className="text-xs text-muted-foreground">Sous-catégorie: {it.sousCategorie}</span>
                )}
              </div>
              <span className="text-right text-sm">{Number(it.huntersCount || 0).toLocaleString('fr-FR')}</span>
              <span className="text-right text-sm">{Number(it.permitsCount || 0).toLocaleString('fr-FR')}</span>
              <span className="text-right text-sm">{Number(it.totalAmount || 0).toLocaleString('fr-FR')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const AdminDashboard = () => {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<string>("");

  // Récupération dynamique des régions depuis l'API (/api/regions)
  type RegionsFC = { type: 'FeatureCollection'; features: Array<{ properties?: { nom?: string; code?: string; NOM_REGION?: string } }> };
  const { data: regionsFC } = useQuery({
    queryKey: ['regions-list'],
    queryFn: async () => {
      return await apiRequest({ url: '/regions', method: 'GET' }) as RegionsFC;
    },
    enabled: isAuthenticated && !authLoading,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  // Récupérer les vraies statistiques nationales - seulement si authentifié
  const { data: stats, isLoading: loadingStats, error } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const apiStats = await apiRequest({
        url: '/stats',
        method: 'GET'
      }) as any; // Typage temporaire pour éviter les erreurs TypeScript
      return {
        // Total = chasseurs + guides + agents (calcul simple et cohérent)
        totalUsers: Number(apiStats.hunters || 0) + Number(apiStats.guides || 0) + Number(apiStats.agents || 0),
        // Utilisateurs actifs = nombre total de taxes au niveau national
        activeUsers: Number(apiStats.taxCount ?? apiStats.activePermits ?? 0),
        totalPermits: apiStats.permits || 0,
        pendingApprovals: apiStats.pendingRequests || 0,
      };
    },
    enabled: isAuthenticated && !authLoading, // Ne déclencher la requête que si authentifié
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  // Admin overview (agents, guides, hunters, alerts, categories, recent activities)
  const { data: adminOverview, isLoading: loadingOverview } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: async () => {
      return await apiRequest({ url: '/stats/admin/overview', method: 'GET' }) as any;
    },
    enabled: isAuthenticated && !authLoading,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  // Récupérer les contrevenants
  const { data: contrevenants = [], isLoading: loadingContrevenants, error: contrevenantsError } = useQuery({
    queryKey: ['admin-contrevenants'],
    queryFn: async () => {
      try {
        console.log('Tentative de récupération des contrevenants...');
        const response = await apiRequest({ url: '/api/infractions/contrevenants', method: 'GET' }) as any;
        console.log('Réponse contrevenants:', response);

        // Vérifier différentes structures de réponse possibles
        if (response?.data) {
          console.log('Contrevenants trouvés (response.data):', response.data.length);
          return response.data;
        } else if (Array.isArray(response)) {
          console.log('Contrevenants trouvés (response direct):', response.length);
          return response;
        } else {
          console.log('Structure de réponse inattendue:', response);
          return [];
        }
      } catch (error) {
        console.error('Erreur lors de la récupération des contrevenants:', error);
        return [];
      }
    },
    enabled: isAuthenticated && !authLoading,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  // Alternative: Récupérer les statistiques d'infractions comme fallback
  const { data: infractionsStats } = useQuery({
    queryKey: ['admin-infractions-stats'],
    queryFn: async () => {
      try {
        console.log('Tentative de récupération des stats infractions...');
        const response = await apiRequest({ url: '/api/infractions/stats', method: 'GET' }) as any;
        console.log('Réponse stats infractions:', response);
        return response.data || response;
      } catch (error) {
        console.error('Erreur stats infractions:', error);
        return null;
      }
    },
    enabled: isAuthenticated && !authLoading,
    staleTime: 5_000,
  });

  // Options de régions: construit depuis la table regions (GeoJSON FeatureCollection)
  const regionOptions = useMemo(() => {
    const feats = regionsFC?.features || [];
    // util: upper sans accents
    const normalize = (s: string) => (s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
    const names = feats
      .map(f => f?.properties?.nom || f?.properties?.NOM_REGION || f?.properties?.code)
      .filter((v): v is string => !!v && v.trim().length > 0)
      .map(v => normalize(v))
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .sort((a, b) => a.localeCompare(b));
    return names;
  }, [regionsFC]);

  // Données régionales: permis par catégorie (émetteur) et chasseurs par catégorie (chasseur)
  const { data: regionalPermitsByCategory } = useQuery({
    queryKey: ['regional-permits-by-category', selectedRegion],
    queryFn: async () => await apiRequest({ url: `/stats/regional/permits-by-category?region=${encodeURIComponent(selectedRegion)}`, method: 'GET' }) as any,
    enabled: isAuthenticated && !authLoading && !!selectedRegion,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  const { data: regionalHuntersByCategory } = useQuery({
    queryKey: ['regional-hunters-by-category', selectedRegion],
    queryFn: async () => await apiRequest({ url: `/stats/regional/hunters-by-category?region=${encodeURIComponent(selectedRegion)}`, method: 'GET' }) as any,
    enabled: isAuthenticated && !authLoading && !!selectedRegion,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  // Agrégats régionaux (pour récupérer le nombre total de taxes)
  const { data: regionalAggregates } = useQuery({
    queryKey: ['regional-aggregates', selectedRegion],
    queryFn: async () => await apiRequest({ url: `/stats/regional?region=${encodeURIComponent(selectedRegion)}&period=all`, method: 'GET' }) as any,
    enabled: isAuthenticated && !authLoading && !!selectedRegion,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  // Répartition des revenus régionaux par type (pour récupérer le cumul des taxes uniquement)
  const { data: regionalRevenueByType } = useQuery({
    queryKey: ['regional-revenue-by-type', selectedRegion],
    queryFn: async () => await apiRequest({ url: `/stats/regional/revenue-by-type?region=${encodeURIComponent(selectedRegion)}`, method: 'GET' }) as any,
    enabled: isAuthenticated && !authLoading && !!selectedRegion,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  // Montant cumulé des taxes pour la région sélectionnée
  const regionalTaxesAmount = useMemo(() => {
    if (!selectedRegion || !regionalRevenueByType) return 0;
    const taxesItem = (regionalRevenueByType as any[]).find((d: any) => (d.name || '').toLowerCase().includes('taxes'));
    return Number(taxesItem?.value || 0);
  }, [regionalRevenueByType, selectedRegion]);

  // Statistiques régionales basées sur la région du chasseur (consommateur)
  const { data: regionStatsByHunter } = useQuery({
    queryKey: ['region-stats-by-hunter', selectedRegion],
    queryFn: async () => await apiRequest({ url: `/stats/region/${encodeURIComponent(selectedRegion)}`, method: 'GET' }) as any,
    enabled: isAuthenticated && !authLoading && !!selectedRegion,
  });

  // Valeurs KPI: priorité aux données "chasseur" si disponibles, sinon fallback sur "émetteur"
  const kpiTaxesAmount = useMemo(() => {
    if (!selectedRegion) return 0;
    const byHunter = Number(regionStatsByHunter?.taxesAmount ?? 0);
    if (byHunter > 0) return byHunter;
    return Number(regionalTaxesAmount || 0);
  }, [selectedRegion, regionStatsByHunter, regionalTaxesAmount]);

  const kpiTaxesCount = useMemo(() => {
    if (!selectedRegion) return 0;
    const byHunter = Number(regionStatsByHunter?.taxesCount ?? 0);
    if (byHunter > 0) return byHunter;
    return Number(regionalAggregates?.taxCount || 0);
  }, [selectedRegion, regionStatsByHunter, regionalAggregates]);

  const kpiBasis = useMemo(() => {
    if (!selectedRegion) return '';
    const byHunter = Number(regionStatsByHunter?.taxesCount ?? 0) + Number(regionStatsByHunter?.taxesAmount ?? 0);
    return byHunter > 0 ? 'Basé sur: Chasseur' : 'Basé sur: Émetteur';
  }, [selectedRegion, regionStatsByHunter]);

  // Fusion nationale/régionale: Catégorie, Chasseurs, Permis, Montant cumulé
  // Nouvelle source hiérarchique basée sur permit_categories (rubrique/genre -> catégories)

  const { data: categoriesBreakdown, isLoading: loadingBreakdown } = useQuery({
    queryKey: ['permit-categories-breakdown', selectedRegion],
    queryFn: async () => {
      const qs = selectedRegion ? `?region=${encodeURIComponent(selectedRegion)}` : '';
      return await apiRequest({ url: `/stats/national/permit-categories-breakdown${qs}`, method: 'GET' }) as BreakdownRow[];
    },
    enabled: isAuthenticated && !authLoading,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  // Regrouper par rubrique (genre) puis lignes enfants par libellé catégorie
  const grouped = useMemo(() => {
    const rows = (categoriesBreakdown as BreakdownRow[] | undefined) || [];
    const byGenre = new Map<string, { header: string; items: BreakdownRow[]; totals: { hunters: number; permits: number; amount: number } }>();
    for (const r of rows) {
      const genre = (r.genre || 'autre').toLowerCase();
      const entry = byGenre.get(genre) || { header: genre, items: [], totals: { hunters: 0, permits: 0, amount: 0 } };
      entry.items.push(r);
      entry.totals.hunters += Number(r.huntersCount || 0);
      entry.totals.permits += Number(r.permitsCount || 0);
      entry.totals.amount += Number(r.totalAmount || 0);
      byGenre.set(genre, entry);
    }
    // Ordonner rubriques dans un ordre logique si souhaité
    const order = ['touriste', 'resident', 'coutumier', 'oisellerie', 'capture_commercial', 'capture-commercial', 'scientifique'];
    const sortKey = (g: string) => {
      const i = order.indexOf(g);
      return i === -1 ? 999 : i;
    };
    const sections = Array.from(byGenre.values()).sort((a, b) => sortKey(a.header) - sortKey(b.header) || a.header.localeCompare(b.header));
    sections.forEach(s => s.items.sort((a,b) => (a.displayOrder ?? 9999) - (b.displayOrder ?? 9999) || a.labelFr.localeCompare(b.labelFr)) as any);
    return sections;
  }, [categoriesBreakdown]);

  const grandTotals = useMemo(() => {
    return grouped.reduce((acc, s) => {
      acc.hunters += s.totals.hunters;
      acc.permits += s.totals.permits;
      acc.amount += s.totals.amount;
      return acc;
    }, { hunters: 0, permits: 0, amount: 0 });
  }, [grouped]);

  // Export helpers for "Répartition par catégories"
  const handleExportExcel = () => {
    // Build CSV with headers, sections and children
    const lines: string[] = [];
    const sep = ';';
    const esc = (v: any) => {
      const s = String(v ?? '').replace(/"/g, '""');
      return `"${s}"`;
    };
    lines.push([esc('Rubrique'), esc('Catégorie'), esc('Sous-catégorie'), esc('Chasseurs'), esc('Permis'), esc('Montant cumulé (XOF)')].join(sep));
    grouped.forEach(section => {
      // Section header row
      lines.push([esc(section.header.toUpperCase()), '', '', esc(section.totals.hunters), esc(section.totals.permits), esc(section.totals.amount)].join(sep));
      // Children
      section.items.forEach(it => {
        lines.push([
          esc(section.header),
          esc(it.labelFr),
          esc(it.sousCategorie ?? ''),
          esc(Number(it.huntersCount || 0).toLocaleString('fr-FR')),
          esc(Number(it.permitsCount || 0).toLocaleString('fr-FR')),
          esc(Number(it.totalAmount || 0).toLocaleString('fr-FR')),
        ].join(sep));
      });
    });
    // Grand total
    lines.push(['"TOTAL"', '', '', esc(grandTotals.hunters.toLocaleString('fr-FR')), esc(grandTotals.permits.toLocaleString('fr-FR')), esc(grandTotals.amount.toLocaleString('fr-FR'))].join(sep));

    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const regionSuffix = selectedRegion ? `_${selectedRegion}` : '_NATIONAL';
    a.download = `repartition_categories${regionSuffix}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    // Render a simple HTML table and trigger print, user can save as PDF
    const win = window.open('', '_blank');
    if (!win) return;
    const regionSuffix = selectedRegion ? `Région: ${selectedRegion}` : 'National (toutes)';
    const style = `
      <style>
        body { font-family: Arial, sans-serif; padding: 16px; }
        h2 { margin: 0 0 8px; }
        .meta { color: #444; margin-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; }
        th { background: #f3f4f6; text-align: left; }
        .section { font-weight: 600; background: #fafafa; }
        .right { text-align: right; }
        .total { font-weight: 700; }
      </style>
    `;
    const rowsHtml: string[] = [];
    // Header row
    rowsHtml.push('<tr><th>Catégorie</th><th class="right">Chasseurs</th><th class="right">Permis</th><th class="right">Montant cumulé</th></tr>');
    grouped.forEach(section => {
      rowsHtml.push(`<tr class="section"><td>${section.header.toUpperCase()}</td><td class="right">${section.totals.hunters.toLocaleString('fr-FR')}</td><td class="right">${section.totals.permits.toLocaleString('fr-FR')}</td><td class="right">${section.totals.amount.toLocaleString('fr-FR')}</td></tr>`);
      section.items.forEach(it => {
        const sub = it.sousCategorie ? `<div style="color:#666;font-size:10px;">Sous-catégorie: ${it.sousCategorie}</div>` : '';
        rowsHtml.push(`<tr><td><div><div style="font-weight:500;">${it.labelFr}</div>${sub}</div></td><td class="right">${Number(it.huntersCount||0).toLocaleString('fr-FR')}</td><td class="right">${Number(it.permitsCount||0).toLocaleString('fr-FR')}</td><td class="right">${Number(it.totalAmount||0).toLocaleString('fr-FR')}</td></tr>`);
      });
    });
    rowsHtml.push(`<tr class="total"><td>TOTAL</td><td class="right">${grandTotals.hunters.toLocaleString('fr-FR')}</td><td class="right">${grandTotals.permits.toLocaleString('fr-FR')}</td><td class="right">${grandTotals.amount.toLocaleString('fr-FR')}</td></tr>`);

    win.document.write(`
      <html>
        <head>
          <title>Répartition par catégories</title>
          ${style}
        </head>
        <body>
          <h2>Répartition par catégories</h2>
          <div class="meta">${regionSuffix}</div>
          <table>
            ${rowsHtml.join('')}
          </table>
          <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 300); };</script>
        </body>
      </html>
    `);
    win.document.close();
  };



  // (Statut supprimé pour éviter les données simulées)

  // Élargir le conteneur parent (page-frame-inner) pour ce tableau de bord
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current?.closest('.page-frame-inner');
    if (el) el.classList.add('page-frame-wide');
    return () => { if (el) el.classList.remove('page-frame-wide'); };
  }, []);

  return (
    <div ref={rootRef} className="flex flex-col min-h-screen p-6 space-y-6 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2 text-gray-900">Tableau de bord administrateur</h1>
          <p className="text-gray-600">
            Bienvenue, {user?.firstName} {user?.lastName}
          </p>
        </div>
        {/* search field removed per request */}
      </div>

      {/* Affichage d'erreur si l'API stats échoue */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative z-20">
          <strong className="font-bold">Erreur API: </strong>
          <span className="block sm:inline">{error.message}</span>
        </div>
      )}

      {/* Cartes principales (haut) */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-3">
        <Card className="text-center">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Agents forestiers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-4xl font-bold">
              {loadingOverview
                ? '...'
                : (() => {
                    const counts = adminOverview?.counts || {};
                    const regional = Number((counts as any).regionalAgents ?? 0);
                    const sector = Number((counts as any).sectorAgents ?? 0);
                    const totalFromSplit = regional + sector;
                    if (totalFromSplit > 0) return totalFromSplit;
                    return Number((counts as any).agents ?? 0);
                  })()
              }
            </div>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Guides</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-4xl font-bold">{loadingOverview ? '...' : adminOverview?.counts?.guides ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Chasseurs</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-4xl font-bold">{loadingOverview ? '...' : adminOverview?.counts?.hunters ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Cartes Admin secondaires (bas) */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="text-center">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Utilisateurs totaux</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-4xl font-bold">{loadingStats ? '...' : stats?.totalUsers ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contrevenants</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-4xl font-bold">
              {loadingContrevenants ? '...' : (() => {
                // Utiliser le nombre de contrevenants direct ou depuis les stats d'infractions
                const directCount = contrevenants.length;
                const statsCount = infractionsStats?.total_contrevenants || 0;
                const finalCount = directCount > 0 ? directCount : statsCount;
                console.log('Comptage contrevenants:', { directCount, statsCount, finalCount });
                return finalCount;
              })()}
              {contrevenantsError && <div className="text-xs text-red-500 mt-1">Erreur de chargement</div>}
            </div>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alertes</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-4xl font-bold">{loadingOverview ? '...' : adminOverview?.counts?.alerts ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Répartition par catégories (hiérarchie permit_categories) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Répartition par catégories</CardTitle>
          <div className="flex items-center gap-2">
            <label htmlFor="region" className="text-sm text-muted-foreground">Région</label>
            <select
              id="region"
              className="border rounded-md px-2 py-1 text-sm"
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
            >
              <option value="">National (toutes)</option>
              {regionOptions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleExportPDF}
              className="ml-2 inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium bg-white hover:bg-gray-50"
              title="Télécharger en PDF"
            >
              Export PDF
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium bg-white hover:bg-gray-50"
              title="Télécharger en Excel (CSV)"
            >
              Export Excel
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {selectedRegion && (
            <div className="text-sm text-muted-foreground mb-4">
              Cumul des taxes ({selectedRegion}) : <span className="font-medium text-foreground">{kpiTaxesAmount.toLocaleString('fr-FR')}</span> • Nombre de taxes : <span className="font-medium text-foreground">{Number(kpiTaxesCount)}</span> <span className="ml-2">({kpiBasis})</span>
            </div>
          )}
          <div>
            <h3 className="text-base font-semibold mb-3">Catégories (récapitulatif)</h3>
            {loadingBreakdown ? (
              <div className="text-sm text-muted-foreground">Chargement...</div>
            ) : (
              <div className="space-y-2">
                {grouped.map((section) => (
                  <CategoryDrawer key={section.header} section={section} />
                ))}
                {/* Total général */}
                <div className="flex items-center justify-between rounded-lg bg-slate-100 px-5 py-3 mt-2">
                  <span className="text-lg font-bold">Total général</span>
                  <div className="flex gap-6 text-base font-bold">
                    <span>{grandTotals.hunters.toLocaleString('fr-FR')} chasseurs</span>
                    <span>{grandTotals.permits.toLocaleString('fr-FR')} permis</span>
                    <span>{grandTotals.amount.toLocaleString('fr-FR')} XOF</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDashboard;
