import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import React from "react";

// Types des données F4 par localité
export interface F4LocaliteRow {
  localite: string;
  localiteLevel: "commune" | "arrondissement" | "departement" | "region";
  parentLocalite?: string;
  isTotal?: boolean;
  // Section 1 : Plantations massives
  pmRegieHa: number; pmRegiePlants: number;
  pmPriveIndivHa: number; pmPriveIndivPlants: number;
  pmVillagCommHa: number; pmVillagCommPlants: number;
  pmScolaireHa: number; pmScolairePlants: number;
  // Section 2 : Plantations linéaires
  plAxesKm: number; plAxesPlants: number;
  plDelimKm: number; plDelimPlants: number;
  plHaieViveKm: number; plHaieVivePlants: number;
  plBriseVentKm: number; plBriseVentPlants: number;
  plParFeuKm: number; plParFeuPlants: number;
  // Section 3 : Restauration / Réhabilitation
  rrRnaHa: number; rrRnaPlants: number;
  rrMiseEnDefenseHa: number; rrMiseEnDefensePlants: number;
  rrEnrichissementHa: number; rrEnrichissementPlants: number;
  rrMangroveHa: number; rrMangrovePlants: number;
  // Section 4 : Distribution individuelle
  distribPlants: number; distribHa: number;
}

const emptyRow = (localite: string, level: F4LocaliteRow["localiteLevel"], parent?: string): F4LocaliteRow => ({
  localite, localiteLevel: level, parentLocalite: parent,
  pmRegieHa: 0, pmRegiePlants: 0,
  pmPriveIndivHa: 0, pmPriveIndivPlants: 0,
  pmVillagCommHa: 0, pmVillagCommPlants: 0,
  pmScolaireHa: 0, pmScolairePlants: 0,
  plAxesKm: 0, plAxesPlants: 0,
  plDelimKm: 0, plDelimPlants: 0,
  plHaieViveKm: 0, plHaieVivePlants: 0,
  plBriseVentKm: 0, plBriseVentPlants: 0,
  plParFeuKm: 0, plParFeuPlants: 0,
  rrRnaHa: 0, rrRnaPlants: 0,
  rrMiseEnDefenseHa: 0, rrMiseEnDefensePlants: 0,
  rrEnrichissementHa: 0, rrEnrichissementPlants: 0,
  rrMangroveHa: 0, rrMangrovePlants: 0,
  distribPlants: 0, distribHa: 0,
});

export function createDefaultF4Rows(
  level: "departement" | "region" | "national",
  geoData: { name: string; parent?: string }[]
): F4LocaliteRow[] {
  const childLevel = level === "departement" ? "commune" : level === "region" ? "arrondissement" : "departement";
  return geoData.map(g => emptyRow(g.name, childLevel as F4LocaliteRow["localiteLevel"], g.parent));
}

function NumInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Input
      type="number"
      min={0}
      value={value || ""}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      className="h-7 w-20 text-xs px-1 text-center"
    />
  );
}

const toNum = (v: any): number => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

// Calcul des totaux pour une section
function sumRows(rows: F4LocaliteRow[]) {
  const sum = emptyRow("TOTAL", "commune");
  for (const r of rows) {
    sum.pmRegieHa += toNum(r.pmRegieHa); sum.pmRegiePlants += toNum(r.pmRegiePlants);
    sum.pmPriveIndivHa += toNum(r.pmPriveIndivHa); sum.pmPriveIndivPlants += toNum(r.pmPriveIndivPlants);
    sum.pmVillagCommHa += toNum(r.pmVillagCommHa); sum.pmVillagCommPlants += toNum(r.pmVillagCommPlants);
    sum.pmScolaireHa += toNum(r.pmScolaireHa); sum.pmScolairePlants += toNum(r.pmScolairePlants);
    sum.plAxesKm += toNum(r.plAxesKm); sum.plAxesPlants += toNum(r.plAxesPlants);
    sum.plDelimKm += toNum(r.plDelimKm); sum.plDelimPlants += toNum(r.plDelimPlants);
    sum.plHaieViveKm += toNum(r.plHaieViveKm); sum.plHaieVivePlants += toNum(r.plHaieVivePlants);
    sum.plBriseVentKm += toNum(r.plBriseVentKm); sum.plBriseVentPlants += toNum(r.plBriseVentPlants);
    sum.plParFeuKm += toNum(r.plParFeuKm); sum.plParFeuPlants += toNum(r.plParFeuPlants);
    sum.rrRnaHa += toNum(r.rrRnaHa); sum.rrRnaPlants += toNum(r.rrRnaPlants);
    sum.rrMiseEnDefenseHa += toNum(r.rrMiseEnDefenseHa); sum.rrMiseEnDefensePlants += toNum(r.rrMiseEnDefensePlants);
    sum.rrEnrichissementHa += toNum(r.rrEnrichissementHa); sum.rrEnrichissementPlants += toNum(r.rrEnrichissementPlants);
    sum.rrMangroveHa += toNum(r.rrMangroveHa); sum.rrMangrovePlants += toNum(r.rrMangrovePlants);
    sum.distribPlants += toNum(r.distribPlants); sum.distribHa += toNum(r.distribHa);
  }
  return sum;
}

interface Props {
  rows: F4LocaliteRow[];
  onChange: (rows: F4LocaliteRow[]) => void;
  readOnly?: boolean;
  globalTotalLabel?: string;
  localiteColumnHeader?: string;
  nurseryTypesForPM?: string[]; // Types dynamiques pour la section Plantations Massives
  onDeleteRow?: (row: F4LocaliteRow) => Promise<void> | void;
  isRowDeletable?: (row: F4LocaliteRow) => boolean;
}

export function F4RealisationsTable({ rows, onChange, readOnly = false, globalTotalLabel = "TOTAL GÉNÉRAL", localiteColumnHeader = "Localité", nurseryTypesForPM, onDeleteRow, isRowDeletable }: Props) {
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<F4LocaliteRow | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  // Types de pépinière pour la section Plantations Massives (dynamiques ou par défaut)
  const DEFAULT_PM_TYPES = ["Régie", "Privé/indiv", "Villag/comm", "Scolaire"];
  const pmTypes = nurseryTypesForPM && nurseryTypesForPM.length > 0
    ? nurseryTypesForPM.map(t => {
        // Raccourcir les labels longs
        if (t.length > 12) return t.substring(0, 11) + '.';
        return t;
      })
    : DEFAULT_PM_TYPES;

  // Mapping nursery type → champs F4 (Plantations Massives)
  const normalizeStr = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const getPMHa = (row: F4LocaliteRow, type: string): number => {
    const n = normalizeStr(type);
    if (n.includes('REGIE')) return Number(row.pmRegieHa) || 0;
    if (n.includes('INDIVIDUEL') || n.includes('PRIVE') || n.includes('PRIV')) return Number(row.pmPriveIndivHa) || 0;
    if (n.includes('VILLAG') || n.includes('COMMUN') || n.includes('COMM')) return Number(row.pmVillagCommHa) || 0;
    if (n.includes('SCOLAIRE')) return Number(row.pmScolaireHa) || 0;
    return 0;
  };
  const getPMPlants = (row: F4LocaliteRow, type: string): number => {
    const n = normalizeStr(type);
    if (n.includes('REGIE')) return Number(row.pmRegiePlants) || 0;
    if (n.includes('INDIVIDUEL') || n.includes('PRIVE') || n.includes('PRIV')) return Number(row.pmPriveIndivPlants) || 0;
    if (n.includes('VILLAG') || n.includes('COMMUN') || n.includes('COMM')) return Number(row.pmVillagCommPlants) || 0;
    if (n.includes('SCOLAIRE')) return Number(row.pmScolairePlants) || 0;
    return 0;
  };
  const getFullPMHa = (row: F4LocaliteRow) => {
    if (!nurseryTypesForPM || nurseryTypesForPM.length === 0)
      return toNum(row.pmRegieHa) + toNum(row.pmPriveIndivHa) + toNum(row.pmVillagCommHa) + toNum(row.pmScolaireHa);
    return nurseryTypesForPM.reduce((s, t) => s + getPMHa(row, t), 0);
  };
  const getFullPMPlants = (row: F4LocaliteRow) => {
    if (!nurseryTypesForPM || nurseryTypesForPM.length === 0)
      return toNum(row.pmRegiePlants) + toNum(row.pmPriveIndivPlants) + toNum(row.pmVillagCommPlants) + toNum(row.pmScolairePlants);
    return nurseryTypesForPM.reduce((s, t) => s + getPMPlants(row, t), 0);
  };

  const update = (idx: number, field: keyof F4LocaliteRow, val: number) => {
    const updated = [...rows];
    (updated[idx] as any)[field] = val;
    onChange(updated);
  };

  const openDeleteDialog = (row: F4LocaliteRow) => {
    if (isRowDeletable && !isRowDeletable(row)) return;
    setDeleteError(null);
    setDeleteTarget(row);
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);

    try {
      await onDeleteRow?.(deleteTarget);
      onChange(rows.filter(r => r !== deleteTarget));
      setDeleteOpen(false);
      setDeleteTarget(null);
    } catch (e: any) {
      const msg = e?.body?.message || e?.message;
      setDeleteError(msg || "Suppression impossible");
    }
  };

  const displayParent = (parent: string) => {
    return (parent || '').trim().toLowerCase() === 'pépinière départementale'
      ? 'Départemental'
      : parent;
  };

  // Group rows by parent (for arrondissement grouping)
  const parents = Array.from(new Set(rows.map(r => r.parentLocalite || "").filter(Boolean)));
  const grouped = parents.length > 0
    ? parents.map(p => ({ parent: p, children: rows.filter(r => r.parentLocalite === p) }))
    : [{ parent: "", children: rows }];
  const total = sumRows(rows);

  const thStyle = "bg-slate-200 text-gray-900 text-center text-xs font-bold px-1 py-2 border border-slate-300 uppercase tracking-tight";
  const th2Style = "bg-slate-100 text-gray-800 text-center text-xs px-1 py-1 border border-slate-200 uppercase text-[10px]";
  const th3Style = "bg-slate-50 text-gray-700 text-center text-[9px] px-1 py-1 border border-slate-200 border-b-slate-600 font-bold uppercase";
  const tdStyle = "text-xs px-1 py-0.5 border border-gray-200";
  const totalStyle = "bg-yellow-50 font-bold text-xs px-1 py-1 border border-yellow-300 text-center";

  const TotalCells = ({ t, isRegional = false }: { t: F4LocaliteRow, isRegional?: boolean }) => {
    const whiteGreenStyle = "bg-green-900 text-white font-bold text-xs px-1 py-2 border border-green-800 text-center";
    const yellowRedStyle = "bg-yellow-50 text-red-600 font-bold text-xs px-1 py-2 border border-yellow-300 text-center";
    const yellowNormalStyle = "bg-yellow-50 font-bold text-xs px-1 py-2 border border-yellow-300 text-center";
    const yellowRedDeptStyle = "bg-yellow-50 text-red-600 font-bold text-xs px-1 py-2 border border-yellow-300 text-center";

    const getStyle = (isTotalColumn: boolean) => {
      if (isRegional) {
        return isTotalColumn ? yellowRedStyle : whiteGreenStyle;
      }
      return isTotalColumn ? yellowRedDeptStyle : yellowNormalStyle;
    };

    return (
      <>
        {/* PM - dynamique */}
        {(nurseryTypesForPM && nurseryTypesForPM.length > 0 ? nurseryTypesForPM : ['Régie','Individuelle/Privée','Villageoise/Communautaire','Scolaire']).map(type => (
          <React.Fragment key={type}>
            <td className={getStyle(false)}>{getPMHa(t, type).toFixed(2)}</td>
            <td className={getStyle(false)}>{getPMPlants(t, type)}</td>
          </React.Fragment>
        ))}
        <td className={getStyle(true)}>{getFullPMHa(t).toFixed(2)}</td>
        <td className={getStyle(true)}>{getFullPMPlants(t)}</td>

        {/* PL */}
        <td className={getStyle(false)}>{toNum(t.plAxesKm).toFixed(2)}</td><td className={getStyle(false)}>{toNum(t.plAxesPlants)}</td>
        <td className={getStyle(false)}>{toNum(t.plDelimKm).toFixed(2)}</td><td className={getStyle(false)}>{toNum(t.plDelimPlants)}</td>
        <td className={getStyle(false)}>{toNum(t.plHaieViveKm).toFixed(2)}</td><td className={getStyle(false)}>{toNum(t.plHaieVivePlants)}</td>
        <td className={getStyle(false)}>{toNum(t.plBriseVentKm).toFixed(2)}</td><td className={getStyle(false)}>{toNum(t.plBriseVentPlants)}</td>
        <td className={getStyle(false)}>{toNum(t.plParFeuKm).toFixed(2)}</td><td className={getStyle(false)}>{toNum(t.plParFeuPlants)}</td>
        <td className={getStyle(true)}>{(toNum(t.plAxesKm)+toNum(t.plDelimKm)+toNum(t.plHaieViveKm)+toNum(t.plBriseVentKm)+toNum(t.plParFeuKm)).toFixed(2)}</td>
        <td className={getStyle(true)}>{toNum(t.plAxesPlants)+toNum(t.plDelimPlants)+toNum(t.plHaieVivePlants)+toNum(t.plBriseVentPlants)+toNum(t.plParFeuPlants)}</td>

        {/* RR */}
        <td className={getStyle(false)}>{toNum(t.rrRnaHa).toFixed(2)}</td><td className={getStyle(false)}>{toNum(t.rrRnaPlants)}</td>
        <td className={getStyle(false)}>{toNum(t.rrMiseEnDefenseHa).toFixed(2)}</td><td className={getStyle(false)}>{toNum(t.rrMiseEnDefensePlants)}</td>
        <td className={getStyle(false)}>{toNum(t.rrEnrichissementHa).toFixed(2)}</td><td className={getStyle(false)}>{toNum(t.rrEnrichissementPlants)}</td>
        <td className={getStyle(false)}>{toNum(t.rrMangroveHa).toFixed(2)}</td><td className={getStyle(false)}>{toNum(t.rrMangrovePlants)}</td>
        <td className={getStyle(true)}>{(toNum(t.rrRnaHa)+toNum(t.rrMiseEnDefenseHa)+toNum(t.rrEnrichissementHa)+toNum(t.rrMangroveHa)).toFixed(2)}</td>
        <td className={getStyle(true)}>{toNum(t.rrRnaPlants)+toNum(t.rrMiseEnDefensePlants)+toNum(t.rrEnrichissementPlants)+toNum(t.rrMangrovePlants)}</td>

        {/* Distrib */}
        <td className={getStyle(true)}>{toNum(t.distribPlants)}</td>
        <td className={getStyle(true)}>{toNum(t.distribHa).toFixed(2)}</td>
      </>
    );
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
      <table className="min-w-[1800px] w-full text-xs border-collapse">
        <colgroup>
          <col style={{ width: '160px' }} />
        </colgroup>
        <thead>
          {/* Row 1: Main sections */}
          <tr>
            <th className={thStyle} rowSpan={3}>{localiteColumnHeader}</th>
            <th className={thStyle} colSpan={(pmTypes.length + 1) * 2}>Plantations massives (ha)</th>
            <th className={thStyle} colSpan={12}>Plantations linéaires (km)</th>
            <th className={thStyle} colSpan={10}>Plantations de restauration / Réhabilitation (ha)</th>
            <th className={thStyle} colSpan={2}>Distrib/indiv</th>
          </tr>
          {/* Row 2: Sub-sections */}
          <tr>
            {[...pmTypes, "Total"].map(s => (
              <th key={s} className={th2Style} colSpan={2}>{s}</th>
            ))}
            {["Axes routiers","Délim/Alignmt","Haie-vive","Brise vent","Par-feu vert","Total"].map(s => (
              <th key={s} className={th2Style} colSpan={2}>{s}</th>
            ))}
            {["RNA","Mise en défens","Enrichissement","Rest. mangrove","Total"].map(s => (
              <th key={s} className={th2Style} colSpan={2}>{s}</th>
            ))}
            <th className={th2Style} colSpan={2}>Distribution individuelle</th>
          </tr>
          {/* Row 3: ha / Nb de plants headers */}
          <tr>
            {Array(pmTypes.length).fill(null).map((_, i) => <React.Fragment key={i}><th className={th3Style}>ha</th><th className={th3Style}>Nb plants</th></React.Fragment>)}
            <th className={th3Style}>ha</th><th className={th3Style}>Nb plants</th>
            {Array(5).fill(null).map((_, i) => <React.Fragment key={i}><th className={th3Style}>Km</th><th className={th3Style}>Nb plants</th></React.Fragment>)}
            <th className={th3Style}>Km</th><th className={th3Style}>Nb plants</th>
            {Array(4).fill(null).map((_, i) => <React.Fragment key={i}><th className={th3Style}>ha</th><th className={th3Style}>Nb plants</th></React.Fragment>)}
            <th className={th3Style}>ha</th><th className={th3Style}>Nb plants</th>
            <th className={th3Style}>Nb plants</th><th className={th3Style}>ha</th>
          </tr>
        </thead>
        <tbody>
          {grouped.map(({ parent, children }) => {
            const groupTotal = sumRows(children);
            return (
              <React.Fragment key={parent || "all"}>
                {parent && (
                  <tr className="bg-gray-100 font-bold border-t border-gray-300">
                    <td className={`${tdStyle} uppercase text-left text-gray-900 sticky left-0 bg-gray-100 z-10`} colSpan={1}>
                      {displayParent(parent)}
                    </td>
                    <td colSpan={34} className="bg-gray-100 border border-gray-200" />
                  </tr>
                )}

                {children.map((row, globalIdx) => {
                  const idx = rows.indexOf(row);
                  const isEditable = !readOnly && !row.isTotal;
                  const canDelete =
                    isEditable &&
                    row.localiteLevel === "commune" &&
                    !!row.localite &&
                    (!!isRowDeletable ? isRowDeletable(row) : true);
                  return (
                    <React.Fragment key={`${row.localite}-${globalIdx}`}>
                      <tr className={`hover:bg-gray-50`}>
                        <td className={`${tdStyle} font-medium whitespace-nowrap sticky left-0 bg-white z-10 min-w-[140px]`}>
                          <div className="group flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              {row.localiteLevel !== "commune" && <span className="mr-1 text-green-700">▶</span>}
                              <span className={row.localiteLevel === "commune" && row.parentLocalite ? "pl-4 inline-block" : ""}>
                                {row.localite}
                              </span>
                              {row.localiteLevel === "arrondissement" && <Badge className="ml-1 text-[9px] py-0" variant="outline">Arr.</Badge>}
                            </div>

                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => openDeleteDialog(row)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-red-600 hover:text-red-700"
                                aria-label={`Supprimer ${row.localite}`}
                                title="Supprimer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                        {isEditable ? <>
                          {/* PM - dynamique selon nurseryTypesForPM */}
                          {(nurseryTypesForPM && nurseryTypesForPM.length > 0 ? nurseryTypesForPM : ['Régie','Individuelle/Privée','Villageoise/Communautaire','Scolaire']).map(type => {
                            const n = normalizeStr(type);
                            const haField: keyof F4LocaliteRow = n.includes('REGIE') ? 'pmRegieHa' : n.includes('INDIVIDUEL') || n.includes('PRIVE') || n.includes('PRIV') ? 'pmPriveIndivHa' : n.includes('VILLAG') || n.includes('COMMUN') || n.includes('COMM') ? 'pmVillagCommHa' : n.includes('SCOLAIRE') ? 'pmScolaireHa' : 'pmRegieHa';
                            const plantsField: keyof F4LocaliteRow = n.includes('REGIE') ? 'pmRegiePlants' : n.includes('INDIVIDUEL') || n.includes('PRIVE') || n.includes('PRIV') ? 'pmPriveIndivPlants' : n.includes('VILLAG') || n.includes('COMMUN') || n.includes('COMM') ? 'pmVillagCommPlants' : n.includes('SCOLAIRE') ? 'pmScolairePlants' : 'pmRegiePlants';
                            return (
                              <React.Fragment key={type}>
                                <td className={tdStyle}><NumInput value={Number(row[haField]) || 0} onChange={v => update(idx, haField, v)} /></td>
                                <td className={tdStyle}><NumInput value={Number(row[plantsField]) || 0} onChange={v => update(idx, plantsField, v)} /></td>
                              </React.Fragment>
                            );
                          })}
                          <td className="bg-yellow-50 text-center text-xs border border-yellow-200 px-1">{getFullPMHa(row).toFixed(2)}</td>
                          <td className="bg-yellow-50 text-center text-xs border border-yellow-200 px-1">{getFullPMPlants(row)}</td>
                          <td className={tdStyle}><NumInput value={row.plAxesKm} onChange={v => update(idx,"plAxesKm",v)} /></td>
                          <td className={tdStyle}><NumInput value={row.plAxesPlants} onChange={v => update(idx,"plAxesPlants",v)} /></td>
                          <td className={tdStyle}><NumInput value={row.plDelimKm} onChange={v => update(idx,"plDelimKm",v)} /></td>
                          <td className={tdStyle}><NumInput value={row.plDelimPlants} onChange={v => update(idx,"plDelimPlants",v)} /></td>
                          <td className={tdStyle}><NumInput value={row.plHaieViveKm} onChange={v => update(idx,"plHaieViveKm",v)} /></td>
                          <td className={tdStyle}><NumInput value={row.plHaieVivePlants} onChange={v => update(idx,"plHaieVivePlants",v)} /></td>
                          <td className={tdStyle}><NumInput value={row.plBriseVentKm} onChange={v => update(idx,"plBriseVentKm",v)} /></td>
                          <td className={tdStyle}><NumInput value={row.plBriseVentPlants} onChange={v => update(idx,"plBriseVentPlants",v)} /></td>
                          <td className={tdStyle}><NumInput value={row.plParFeuKm} onChange={v => update(idx,"plParFeuKm",v)} /></td>
                          <td className={tdStyle}><NumInput value={row.plParFeuPlants} onChange={v => update(idx,"plParFeuPlants",v)} /></td>
                          <td className="bg-yellow-50 text-center text-xs border border-yellow-200 px-1">{(toNum(row.plAxesKm)+toNum(row.plDelimKm)+toNum(row.plHaieViveKm)+toNum(row.plBriseVentKm)+toNum(row.plParFeuKm)).toFixed(2)}</td>
                          <td className="bg-yellow-50 text-center text-xs border border-yellow-200 px-1">{toNum(row.plAxesPlants)+toNum(row.plDelimPlants)+toNum(row.plHaieVivePlants)+toNum(row.plBriseVentPlants)+toNum(row.plParFeuPlants)}</td>
                          <td className={tdStyle}><NumInput value={row.rrRnaHa} onChange={v => update(idx,"rrRnaHa",v)} /></td>
                          <td className={tdStyle}><NumInput value={row.rrRnaPlants} onChange={v => update(idx,"rrRnaPlants",v)} /></td>
                          <td className={tdStyle}><NumInput value={row.rrMiseEnDefenseHa} onChange={v => update(idx,"rrMiseEnDefenseHa",v)} /></td>
                          <td className={tdStyle}><NumInput value={row.rrMiseEnDefensePlants} onChange={v => update(idx,"rrMiseEnDefensePlants",v)} /></td>
                          <td className={tdStyle}><NumInput value={row.rrEnrichissementHa} onChange={v => update(idx,"rrEnrichissementHa",v)} /></td>
                          <td className={tdStyle}><NumInput value={row.rrEnrichissementPlants} onChange={v => update(idx,"rrEnrichissementPlants",v)} /></td>
                          <td className={tdStyle}><NumInput value={row.rrMangroveHa} onChange={v => update(idx,"rrMangroveHa",v)} /></td>
                          <td className={tdStyle}><NumInput value={row.rrMangrovePlants} onChange={v => update(idx,"rrMangrovePlants",v)} /></td>
                          <td className="bg-yellow-50 text-center text-xs border border-yellow-200 px-1">{(toNum(row.rrRnaHa)+toNum(row.rrMiseEnDefenseHa)+toNum(row.rrEnrichissementHa)+toNum(row.rrMangroveHa)).toFixed(2)}</td>
                          <td className="bg-yellow-50 text-center text-xs border border-yellow-200 px-1">{toNum(row.rrRnaPlants)+toNum(row.rrMiseEnDefensePlants)+toNum(row.rrEnrichissementPlants)+toNum(row.rrMangrovePlants)}</td>
                          <td className={tdStyle}><NumInput value={row.distribPlants} onChange={v => update(idx,"distribPlants",v)} /></td>
                          <td className={tdStyle}><NumInput value={row.distribHa} onChange={v => update(idx,"distribHa",v)} /></td>
                        </> : <TotalCells t={row} />}
                      </tr>
                    </React.Fragment>
                  );
                })}

                {parent && (
                  <tr key={`total-${parent}`} className="bg-yellow-100 font-bold border-t-2 border-yellow-400">
                    <td className={`${tdStyle} sticky left-0 bg-yellow-400 z-10 uppercase text-yellow-900 text-left`}>
                      {(parent || '').trim().toLowerCase() === 'pépinière départementale'
                        ? 'Total départemental'
                        : `Sous-total ${parent}`}
                    </td>
                    <TotalCells t={groupTotal} isRegional={false} />
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          {/* Total général final */}
          <tr key="total-general" className="bg-green-800 text-white font-bold border-t-4 border-green-900">
            <td className={`${tdStyle} sticky left-0 bg-green-900 z-10 text-white text-xs uppercase text-center py-2 px-1`}>
              {globalTotalLabel}
            </td>
            <TotalCells t={total} isRegional={true} />
          </tr>
        </tbody>
      </table>

      <AlertDialog open={deleteOpen} onOpenChange={(open) => {
        setDeleteOpen(open);
        if (!open) {
          setDeleteTarget(null);
          setDeleteError(null);
        }
      }}>
        <AlertDialogContent overlayClassName="bg-transparent">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmation de suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous supprimer la localité "{deleteTarget?.localite}" ?
              {deleteError ? (
                <div className="mt-2 text-sm text-red-600">{deleteError}</div>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
