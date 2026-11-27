import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart3,
  Crosshair,
  FileCheck,
  Gavel,
  PieChart as PieChartIcon,
  Shield,
  Target,
  Users,
  Wallet,
} from "lucide-react";
import { FaDrawPolygon } from "react-icons/fa";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ZoneAmodieeItem {
  id: number;
  name: string;
  status: string;
  region: string;
  departement: string;
  arrondissement: string;
  commune: string;
  responsibleName: string;
  responsiblePhone: string;
  surfaceHa: number;
  guidesCount: number;
  trackersCount: number;
}

export interface ChasseKpiData {
  totalHunters: number;
  totalGuides: number;
  totalPisteurs?: number;
  totalPermits: number;
  activePermits: number;
  expiredPermits: number;
  pendingRequests: number;
  approvedRequests: number;
  rejectedRequests: number;
  permitsRevenue: number;
  taxesCount: number;
  taxesRevenue: number;
  totalRevenue: number;
  infractionsCount: number;
  infractionsAmount: number;
  amodieesCount?: number;
  amodieesSurfaceHa?: number;
  zicsCount?: number;
  zonesAmodiees?: ZoneAmodieeItem[];
  amodieesFinance?: {
    taxeAmodiation: number;
    licencesGuides: number;
    attestationsPisteurs: number;
    taxeReservePrivee: number;
    totalAmodieesRevenue: number;
  };
  revenuesBreakdown?: {
    petiteChasse: number;
    gibierEau: number;
    grandeChasse: number;
    taxeAmodiation: number;
    licencesGuides: number;
    attestationsPisteurs: number;
    taxeReservePrivee: number;
    taxesAbattage: number;
    contentieux: number;
  };
  totalPiecesAbattues?: number;
  speciesBreakdown?: Array<{
    speciesName: string;
    scientificName: string;
    category: string;
    quantity: number;
  }>;
  weapons?: {
    totalWeapons: number;
    byType: Array<{ type: string; count: number }>;
    byCaliber: Array<{ caliber: string; count: number }>;
    byBrand: Array<{ brand: string; count: number }>;
    details: Array<{ weaponType: string; brand: string; caliber: string; count: number }>;
  };
  huntersByCategory?: Array<{ category: string; count: number }>;
  permitsByCategory: Array<{ category: string; count: number; revenue: number }>;
  breakdownBySubZone: Array<{
    zone: string;
    hunters: number;
    guides: number;
    activePermits: number;
    pendingRequests: number;
    permitsRevenue: number;
    taxesRevenue: number;
    infractions: number;
    piecesAbattues?: number;
    weaponsCount?: number;
  }>;
}

interface ChasseExecutiveSectionProps {
  chasse: ChasseKpiData;
}

const PIE_COLORS = [
  "#059669", // emerald-600
  "#0d9488", // teal-600
  "#2563eb", // blue-600
  "#d97706", // amber-600
  "#7c3aed", // violet-600
  "#dc2626", // red-600
  "#0891b2", // cyan-600
  "#65a30d", // lime-600
];

const fmtNum = (n: number | undefined | null) =>
  new Intl.NumberFormat("fr-FR").format(Math.round(Number(n) || 0));

const fmtHa = (n: number | undefined | null) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(Number(n) || 0);

const fmtFcfa = (n: number | undefined | null) => `${fmtNum(n)} FCFA`;

const shortLabel = (s: string, max = 18) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export default function ChasseExecutiveSection({
  chasse,
}: ChasseExecutiveSectionProps) {
  const amodieesCount = chasse.amodieesCount ?? 0;
  const amodieesSurfaceHa = chasse.amodieesSurfaceHa ?? 0;
  const totalPisteurs = chasse.totalPisteurs ?? 0;
  const totalPiecesAbattues = chasse.totalPiecesAbattues ?? 0;
  const speciesBreakdown = chasse.speciesBreakdown ?? [];
  const weapons = chasse.weapons ?? {
    totalWeapons: 0,
    byType: [],
    byCaliber: [],
    byBrand: [],
    details: [],
  };
  const amodieesFinance = chasse.amodieesFinance ?? {
    taxeAmodiation: 0,
    licencesGuides: 0,
    attestationsPisteurs: 0,
    taxeReservePrivee: 0,
    totalAmodieesRevenue: 0,
  };
  const rev = chasse.revenuesBreakdown;

  // Données diagramme circulaire principal (Ventilation des recettes ou catégories de chasseurs)
  const revenuePieData = [
    { name: "Petite chasse", value: rev?.petiteChasse ?? 0 },
    { name: "Gibier d'eau", value: rev?.gibierEau ?? 0 },
    { name: "Grande chasse", value: rev?.grandeChasse ?? 0 },
    { name: "Taxe d'amodiation", value: rev?.taxeAmodiation ?? 0 },
    { name: "Licences & Guides", value: (rev?.licencesGuides ?? 0) + (rev?.attestationsPisteurs ?? 0) },
    { name: "Taxes d'abattage", value: rev?.taxesAbattage ?? 0 },
    { name: "Contentieux", value: rev?.contentieux ?? 0 },
  ].filter((item) => item.value > 0);

  const hunterCatPieData = (chasse.huntersByCategory ?? [])
    .filter((c) => c.count > 0)
    .map((c) => ({ name: c.category, value: c.count }));

  const useRevenuePie = revenuePieData.length > 0;
  const mainPieData = useRevenuePie ? revenuePieData : hunterCatPieData;
  const mainPieTotal = mainPieData.reduce((acc, item) => acc + item.value, 0);

  // Données diagramme en barres des catégories de permis
  const permitBarData = chasse.permitsByCategory.slice(0, 10).map((cat) => ({
    name: shortLabel(cat.category, 20),
    fullName: cat.category,
    permis: cat.count,
    recettes: cat.revenue,
  }));

  return (
    <div className="w-full space-y-6">
      {/* ═══ RANGÉE 1 : 4 CARTES PRINCIPALES CENTRÉES (dont carte 2 divisée Chasseurs & Zones Amodiées) ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        {/* Carte 1 : Permis actifs */}
        <Card className="border-emerald-200/90 shadow-sm bg-white">
          <CardContent className="p-5 sm:p-6 flex flex-col items-center justify-center text-center h-full gap-1.5">
            <div className="h-11 w-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <FileCheck className="h-5 w-5" />
            </div>
            <div className="text-sm font-semibold text-emerald-900/85">Permis actifs</div>
            <div className="text-3xl sm:text-4xl font-extrabold text-emerald-950">
              {fmtNum(chasse.activePermits)}
            </div>
            <div className="text-xs sm:text-sm text-muted-foreground">
              sur {fmtNum(chasse.totalPermits)} total ({fmtNum(chasse.expiredPermits)} expirés)
            </div>
          </CardContent>
        </Card>

        {/* Carte 2 : DIVISÉE EN DEUX — Chasseurs | Zones amodiées */}
        <Card className="border-blue-200/90 shadow-sm bg-white overflow-hidden">
          <CardContent className="p-0 grid grid-cols-2 divide-x divide-slate-200 h-full">
            <div className="p-4 sm:p-5 flex flex-col items-center justify-center text-center bg-blue-50/30 gap-1.5">
              <div className="h-10 w-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                <Users className="h-5 w-5" />
              </div>
              <div className="text-xs sm:text-sm font-semibold text-blue-900">Chasseurs</div>
              <div className="text-3xl sm:text-4xl font-extrabold text-slate-900">
                {fmtNum(chasse.totalHunters)}
              </div>
            </div>

            <div className="p-4 sm:p-5 flex flex-col items-center justify-center text-center bg-purple-50/40 gap-1.5">
              <div className="h-10 w-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
                <FaDrawPolygon className="h-5 w-5" />
              </div>
              <div className="text-xs sm:text-sm font-semibold text-purple-900">Zones amodiées</div>
              <div className="text-3xl sm:text-4xl font-extrabold text-purple-950">
                {fmtNum(amodieesCount)}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Carte 3 : Recettes cumulées */}
        <Card className="border-teal-200/90 shadow-sm bg-white">
          <CardContent className="p-5 sm:p-6 flex flex-col items-center justify-center text-center h-full gap-1.5">
            <div className="h-11 w-11 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
              <Wallet className="h-5 w-5" />
            </div>
            <div className="text-sm font-semibold text-teal-900/85">Recettes cumulées</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-teal-950">
              {fmtFcfa(chasse.totalRevenue)}
            </div>
          </CardContent>
        </Card>

        {/* Carte 4 : Infractions & Transactions */}
        <Card className="border-red-200/90 shadow-sm bg-white">
          <CardContent className="p-5 sm:p-6 flex flex-col items-center justify-center text-center h-full gap-1.5">
            <div className="h-11 w-11 rounded-xl bg-red-100 text-red-700 flex items-center justify-center">
              <Gavel className="h-5 w-5" />
            </div>
            <div className="text-sm font-semibold text-red-900/85">Infractions</div>
            <div className="text-3xl sm:text-4xl font-extrabold text-red-900">
              {fmtNum(chasse.infractionsCount)}
            </div>
            <div className="text-xs sm:text-sm font-medium text-red-900/75">
              Transactions : {fmtFcfa(chasse.infractionsAmount)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══ RANGÉE 2 : INDICATEURS POINTUS AUTORITÉS (centrés) ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 flex flex-col items-center justify-center text-center gap-1.5">
          <div className="h-11 w-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <Target className="h-5 w-5" />
          </div>
          <div className="text-xs sm:text-sm font-semibold text-emerald-900">Espèces abattues</div>
          <div className="text-3xl sm:text-4xl font-extrabold text-emerald-950">
            {fmtNum(totalPiecesAbattues)}
          </div>
        </div>

        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-5 flex flex-col items-center justify-center text-center gap-1.5">
          <div className="h-11 w-11 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
            <Crosshair className="h-5 w-5" />
          </div>
          <div className="text-xs sm:text-sm font-semibold text-indigo-900">Armes à feu enregistrées</div>
          <div className="text-3xl sm:text-4xl font-extrabold text-indigo-950">
            {fmtNum(weapons.totalWeapons)}
          </div>
        </div>

        <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-5 flex flex-col items-center justify-center text-center gap-1.5">
          <div className="h-11 w-11 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
            <FaDrawPolygon className="h-5 w-5" />
          </div>
          <div className="text-xs sm:text-sm font-semibold text-purple-900">Amodiation &amp; Licences</div>
          <div className="text-2xl sm:text-3xl font-extrabold text-purple-950">
            {fmtFcfa(amodieesFinance.totalAmodieesRevenue)}
          </div>
        </div>

        <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-5 flex flex-col items-center justify-center text-center gap-1.5">
          <div className="h-11 w-11 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
            <Shield className="h-5 w-5" />
          </div>
          <div className="text-xs sm:text-sm font-semibold text-teal-900">Encadrement terrain</div>
          <div className="text-3xl sm:text-4xl font-extrabold text-teal-950">
            {fmtNum(chasse.totalGuides + totalPisteurs)}
          </div>
          <div className="text-xs sm:text-sm text-teal-800/85">
            {fmtNum(chasse.totalGuides)} guides · {fmtNum(totalPisteurs)} pisteurs
          </div>
        </div>
      </div>

      {/* ═══ RANGÉE 3 : DIAGRAMME CIRCULAIRE + DIAGRAMME EN BARRES (Catégories de permis) ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        {/* Diagramme circulaire */}
        <Card className="border-emerald-200/80 shadow-sm bg-white flex flex-col">
          <CardHeader className="bg-emerald-50/60 border-b border-emerald-100 !py-4 px-6">
            <CardTitle className="text-base sm:text-lg font-bold text-emerald-950 flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-emerald-700" />
              {useRevenuePie ? "Répartition des recettes par poste" : "Répartition des chasseurs par catégorie"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 flex-1">
            {mainPieData.length === 0 ? (
              <div className="h-72 flex flex-col items-center justify-center text-muted-foreground text-sm sm:text-base gap-2">
                <PieChartIcon className="h-10 w-10 text-emerald-200" />
                <span>Aucune donnée disponible pour générer le diagramme circulaire.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-center">
                <div className="sm:col-span-3 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={mainPieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={56}
                        outerRadius={96}
                        paddingAngle={2}
                      >
                        {mainPieData.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: any) =>
                          useRevenuePie ? fmtFcfa(Number(val)) : `${fmtNum(Number(val))} chasseur(s)`
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="sm:col-span-2 space-y-2.5">
                  {mainPieData.map((item, idx) => {
                    const pct = mainPieTotal > 0 ? Math.round((item.value / mainPieTotal) * 100) : 0;
                    return (
                      <div key={item.name} className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-3 w-3 rounded-sm shrink-0"
                            style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                          />
                          <span className="truncate font-medium text-gray-800">{item.name}</span>
                        </div>
                        <span className="font-bold text-gray-900 shrink-0">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Diagramme en barres — Catégories de permis */}
        <Card className="border-emerald-200/80 shadow-sm bg-white flex flex-col">
          <CardHeader className="bg-emerald-50/60 border-b border-emerald-100 !py-4 px-6">
            <CardTitle className="text-base sm:text-lg font-bold text-emerald-950 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-emerald-700" />
              Permis délivrés par catégorie
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 flex-1">
            {permitBarData.length === 0 ? (
              <div className="h-72 flex flex-col items-center justify-center text-muted-foreground text-sm sm:text-base gap-2">
                <BarChart3 className="h-10 w-10 text-emerald-200" />
                <span>Aucun permis enregistré dans ce périmètre.</span>
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={permitBarData} margin={{ top: 10, right: 16, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12, fill: "#334155" }}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#334155" }} />
                    <Tooltip
                      labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullName || _label}
                      formatter={(val: any, name: string) =>
                        name === "permis" ? [`${fmtNum(Number(val))} permis`, "Nombre"] : [fmtFcfa(Number(val)), "Recettes"]
                      }
                    />
                    <Legend />
                    <Bar dataKey="permis" name="Permis" fill="#059669" radius={[6, 6, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
