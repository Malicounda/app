import { Input } from "@/components/ui/input";
import React from "react";

export interface F1NurseryData {
  nurseryType: string;
  nbPepinieresAnterieur: number; nbPepinieresPeriode: number;
  gainesEmpoteesAnterieur: number; gainesEmpoteesPeriode: number;
  gainesArrimeesAnterieur: number; gainesArrimeesPeriode: number;
  gainesEnsemenceesAnterieur: number; gainesEnsemenceesPeriode: number;
  gainesGerminationAnterieur: number; gainesGerminationPeriode: number;
}

export interface F1LocaliteRow {
  localite: string;
  localiteLevel: "commune" | "arrondissement" | "departement" | "region";
  parentLocalite?: string;
  isTotal?: boolean;
  nurseries: F1NurseryData[];
}

export const emptyF1Nursery = (type: string): F1NurseryData => ({
  nurseryType: type,
  nbPepinieresAnterieur: 0, nbPepinieresPeriode: 0,
  gainesEmpoteesAnterieur: 0, gainesEmpoteesPeriode: 0,
  gainesArrimeesAnterieur: 0, gainesArrimeesPeriode: 0,
  gainesEnsemenceesAnterieur: 0, gainesEnsemenceesPeriode: 0,
  gainesGerminationAnterieur: 0, gainesGerminationPeriode: 0,
});

export const emptyF1Row = (localite: string, level: F1LocaliteRow["localiteLevel"], nurseryTypes: string[], parent?: string): F1LocaliteRow => ({
  localite, localiteLevel: level, parentLocalite: parent,
  nurseries: nurseryTypes.map(emptyF1Nursery)
});

function sumF1NurseryData(a: F1NurseryData, b: F1NurseryData): F1NurseryData {
  return {
    nurseryType: a.nurseryType,
    nbPepinieresAnterieur: a.nbPepinieresAnterieur + b.nbPepinieresAnterieur,
    nbPepinieresPeriode: a.nbPepinieresPeriode + b.nbPepinieresPeriode,
    gainesEmpoteesAnterieur: a.gainesEmpoteesAnterieur + b.gainesEmpoteesAnterieur,
    gainesEmpoteesPeriode: a.gainesEmpoteesPeriode + b.gainesEmpoteesPeriode,
    gainesArrimeesAnterieur: a.gainesArrimeesAnterieur + b.gainesArrimeesAnterieur,
    gainesArrimeesPeriode: a.gainesArrimeesPeriode + b.gainesArrimeesPeriode,
    gainesEnsemenceesAnterieur: a.gainesEnsemenceesAnterieur + b.gainesEnsemenceesAnterieur,
    gainesEnsemenceesPeriode: a.gainesEnsemenceesPeriode + b.gainesEnsemenceesPeriode,
    gainesGerminationAnterieur: a.gainesGerminationAnterieur + b.gainesGerminationAnterieur,
    gainesGerminationPeriode: a.gainesGerminationPeriode + b.gainesGerminationPeriode,
  };
}

export function sumF1Rows(rows: F1LocaliteRow[]): F1LocaliteRow {
  if (rows.length === 0) return emptyF1Row("TOTAL", "commune", []);

  const nurseryTypes = rows[0].nurseries.map(n => n.nurseryType);
  const sum = emptyF1Row("TOTAL", "commune", nurseryTypes);

  for (const r of rows) {
    for (let i = 0; i < nurseryTypes.length; i++) {
      if (r.nurseries[i]) {
        sum.nurseries[i] = sumF1NurseryData(sum.nurseries[i], r.nurseries[i]);
      }
    }
  }
  return sum;
}

export function sumAllNurseries(nurseries: F1NurseryData[]): F1NurseryData {
  const sum = emptyF1Nursery("TOTAL GÉNÉRAL");
  for (const n of nurseries) {
    sum.nbPepinieresAnterieur += n.nbPepinieresAnterieur;
    sum.nbPepinieresPeriode += n.nbPepinieresPeriode;
    sum.gainesEmpoteesAnterieur += n.gainesEmpoteesAnterieur;
    sum.gainesEmpoteesPeriode += n.gainesEmpoteesPeriode;
    sum.gainesArrimeesAnterieur += n.gainesArrimeesAnterieur;
    sum.gainesArrimeesPeriode += n.gainesArrimeesPeriode;
    sum.gainesEnsemenceesAnterieur += n.gainesEnsemenceesAnterieur;
    sum.gainesEnsemenceesPeriode += n.gainesEnsemenceesPeriode;
    sum.gainesGerminationAnterieur += n.gainesGerminationAnterieur;
    sum.gainesGerminationPeriode += n.gainesGerminationPeriode;
  }
  return sum;
}

function NumInput({ value, onChange, readOnly }: { value: number; onChange: (v: number) => void, readOnly?: boolean }) {
  return (
    <Input
      type="number"
      min={0}
      value={value || ""}
      onChange={e => onChange(parseInt(e.target.value) || 0)}
      className={`h-7 w-16 text-[10px] px-1 text-center ${readOnly ? "bg-gray-100" : ""}`}
      readOnly={readOnly}
    />
  );
}

interface Props {
  rows: F1LocaliteRow[];
  onChange: (rows: F1LocaliteRow[]) => void;
  readOnly?: boolean;
  globalTotalLabel?: string;
  localiteColumnHeader?: string;
  showGroupSubtotals?: boolean;
}

export function F1ProductionTable({ rows, onChange, readOnly = false, globalTotalLabel = "TOTAL GÉNÉRAL", localiteColumnHeader = "Localités", showGroupSubtotals = true }: Props) {
  const updateNursery = (rowIdx: number, nurseryIdx: number, field: keyof F1NurseryData, val: number) => {
    const updated = [...rows];
    (updated[rowIdx].nurseries[nurseryIdx] as any)[field] = val;
    onChange(updated);
  };

  const DEFAULT_TYPES = ["Régie", "Villageoise/Communautaire", "Individuelle/Privée", "Scolaire"];
  const sortNurseries = (nurseries: F1NurseryData[]) => {
    return [...nurseries].sort((a, b) => {
      const idxA = DEFAULT_TYPES.indexOf(a.nurseryType);
      const idxB = DEFAULT_TYPES.indexOf(b.nurseryType);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.nurseryType.localeCompare(b.nurseryType);
    });
  };

  const parents = Array.from(new Set(rows.map(r => r.parentLocalite || "").filter(Boolean)));
  const grouped = parents.length > 0
    ? parents.map(p => ({ parent: p, children: rows.filter(r => r.parentLocalite === p) }))
    : [{ parent: "", children: rows }];
  const total = sumF1Rows(rows);

  const thCls = "bg-[#dcedc8] text-gray-900 text-xs font-semibold text-center px-1 py-1 border border-gray-400";
  const thSubCls = "bg-[#dcedc8] text-gray-900 text-[10px] font-semibold text-center px-1 py-1 border border-gray-400";
  const tdCls = "text-[11px] px-1 py-0 border border-gray-300";
  const tdTypeCls = "text-[11px] px-2 py-0 border border-gray-300 whitespace-nowrap min-w-[150px]";
  const cumulCls = "bg-[#fff9c4] text-center font-bold text-[11px] border border-[#ffeb3b] px-1";

  const toNum = (v: any): number => {
    const n = parseInt(v);
    return isNaN(n) ? 0 : n;
  };

  const renderCells = (n: F1NurseryData, isEditable: boolean, rIdx: number, nIdx: number) => (
    <>
      {isEditable ? (
        <>
          <td className={tdCls}><NumInput value={n.nbPepinieresAnterieur} onChange={v => updateNursery(rIdx,nIdx,"nbPepinieresAnterieur",v)} readOnly /></td>
          <td className={tdCls}><NumInput value={n.nbPepinieresPeriode} onChange={v => updateNursery(rIdx,nIdx,"nbPepinieresPeriode",v)} /></td>
          <td className={cumulCls}>{toNum(n.nbPepinieresAnterieur) + toNum(n.nbPepinieresPeriode)}</td>

          <td className={tdCls}><NumInput value={n.gainesEmpoteesAnterieur} onChange={v => updateNursery(rIdx,nIdx,"gainesEmpoteesAnterieur",v)} readOnly /></td>
          <td className={tdCls}><NumInput value={n.gainesEmpoteesPeriode} onChange={v => updateNursery(rIdx,nIdx,"gainesEmpoteesPeriode",v)} /></td>
          <td className={cumulCls}>{toNum(n.gainesEmpoteesAnterieur) + toNum(n.gainesEmpoteesPeriode)}</td>

          <td className={tdCls}><NumInput value={n.gainesArrimeesAnterieur} onChange={v => updateNursery(rIdx,nIdx,"gainesArrimeesAnterieur",v)} readOnly /></td>
          <td className={tdCls}><NumInput value={n.gainesArrimeesPeriode} onChange={v => updateNursery(rIdx,nIdx,"gainesArrimeesPeriode",v)} /></td>
          <td className={cumulCls}>{toNum(n.gainesArrimeesAnterieur) + toNum(n.gainesArrimeesPeriode)}</td>

          <td className={tdCls}><NumInput value={n.gainesEnsemenceesAnterieur} onChange={v => updateNursery(rIdx,nIdx,"gainesEnsemenceesAnterieur",v)} readOnly /></td>
          <td className={tdCls}><NumInput value={n.gainesEnsemenceesPeriode} onChange={v => updateNursery(rIdx,nIdx,"gainesEnsemenceesPeriode",v)} /></td>
          <td className={cumulCls}>{toNum(n.gainesEnsemenceesAnterieur) + toNum(n.gainesEnsemenceesPeriode)}</td>

          <td className={tdCls}><NumInput value={n.gainesGerminationAnterieur} onChange={v => updateNursery(rIdx,nIdx,"gainesGerminationAnterieur",v)} readOnly /></td>
          <td className={tdCls}><NumInput value={n.gainesGerminationPeriode} onChange={v => updateNursery(rIdx,nIdx,"gainesGerminationPeriode",v)} /></td>
          <td className={cumulCls}>{toNum(n.gainesGerminationAnterieur) + toNum(n.gainesGerminationPeriode)}</td>
        </>
      ) : (
        <>
          <td className={tdCls + " text-center"}>{toNum(n.nbPepinieresAnterieur)}</td><td className={tdCls + " text-center"}>{toNum(n.nbPepinieresPeriode)}</td>
          <td className={`${cumulCls} ${!isEditable && rIdx === -1 ? "text-red-600" : ""}`}>{toNum(n.nbPepinieresAnterieur) + toNum(n.nbPepinieresPeriode)}</td>

          <td className={tdCls + " text-center"}>{toNum(n.gainesEmpoteesAnterieur)}</td><td className={tdCls + " text-center"}>{toNum(n.gainesEmpoteesPeriode)}</td>
          <td className={`${cumulCls} ${!isEditable && rIdx === -1 ? "text-red-600" : ""}`}>{toNum(n.gainesEmpoteesAnterieur) + toNum(n.gainesEmpoteesPeriode)}</td>

          <td className={tdCls + " text-center"}>{toNum(n.gainesArrimeesAnterieur)}</td><td className={tdCls + " text-center"}>{toNum(n.gainesArrimeesPeriode)}</td>
          <td className={`${cumulCls} ${!isEditable && rIdx === -1 ? "text-red-600" : ""}`}>{toNum(n.gainesArrimeesAnterieur) + toNum(n.gainesArrimeesPeriode)}</td>

          <td className={tdCls + " text-center"}>{toNum(n.gainesEnsemenceesAnterieur)}</td><td className={tdCls + " text-center"}>{toNum(n.gainesEnsemenceesPeriode)}</td>
          <td className={`${cumulCls} ${!isEditable && rIdx === -1 ? "text-red-600" : ""}`}>{toNum(n.gainesEnsemenceesAnterieur) + toNum(n.gainesEnsemenceesPeriode)}</td>

          <td className={tdCls + " text-center"}>{toNum(n.gainesGerminationAnterieur)}</td><td className={tdCls + " text-center"}>{toNum(n.gainesGerminationPeriode)}</td>
          <td className={`${cumulCls} ${!isEditable && rIdx === -1 ? "text-red-600" : ""}`}>{toNum(n.gainesGerminationAnterieur) + toNum(n.gainesGerminationPeriode)}</td>
        </>
      )}
    </>
  );

  return (
    <div className="rounded-lg border border-gray-300">
      <table className="w-full text-xs border-collapse">
        <colgroup>
          <col style={{ width: '140px' }} />
          <col style={{ width: '180px' }} />
        </colgroup>
        <thead>
          <tr>
            <th className={thCls} rowSpan={2}>{localiteColumnHeader}</th>
            <th className={thCls} rowSpan={2}>Type de pépinière</th>
            <th className={thCls} colSpan={3}>Nombre de pépinière</th>
            <th className={thCls} colSpan={3}>Gaines empotées</th>
            <th className={thCls} colSpan={3}>Gaines arrimées</th>
            <th className={thCls} colSpan={3}>Gaines ensemencées</th>
            <th className={thCls} colSpan={3}>En germination</th>
          </tr>
          <tr>
            {Array(5).fill(null).map((_, i) => (
              <React.Fragment key={i}>
                <th className={thSubCls}>Antérieur</th>
                <th className={thSubCls}>Période</th>
                <th className={thSubCls}>Cumul</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {grouped.map(({ parent, children }) => {
            const groupTotal = sumF1Rows(children);
            const shouldShowGroupSubtotal = showGroupSubtotals && !!parent && children.length > 1 && children.some((c) => (c.localite || '').trim() !== parent.trim());
            return (
              <React.Fragment key={parent || "all"}>
                {children.map((row, globalIdx) => {
                  const rIdx = rows.indexOf(row);
                  const isEditable = !readOnly && !row.isTotal;
                  return (
                    <React.Fragment key={`${row.localite}-${globalIdx}`}>
                      {sortNurseries(row.nurseries).map((n, nIdx) => (
                        <tr key={nIdx} className="hover:bg-gray-50">
                          {nIdx === 0 && (
                            <td className={`${tdCls} font-bold bg-white z-10 text-center uppercase min-w-[120px]`} rowSpan={row.nurseries.length}>
                              {row.localiteLevel !== "commune" && <span className="mr-1 text-green-700">▶</span>}
                              {row.localite || "À définir"}
                            </td>
                          )}
                          <td className={tdTypeCls}>{n.nurseryType}</td>
                          {renderCells(n, isEditable, rIdx, nIdx)}
                        </tr>
                      ))}
                      {/* Ligne Totale par Département/Localité */}
                      <tr className="bg-green-50 font-bold border-t border-green-200">
                        <td className={tdTypeCls + " text-green-800"} colSpan={2}>TOTAL {row.localite?.toUpperCase()}</td>
                        {renderCells(sumAllNurseries(row.nurseries), false, -1, -1)}
                      </tr>
                    </React.Fragment>
                  );
                })}
                {/* Total Group */}
                {shouldShowGroupSubtotal && (
                  <React.Fragment key={`total-${parent}`}>
                    {sortNurseries(groupTotal.nurseries).map((n, nIdx) => (
                      <tr key={`gtotal-${nIdx}`} className="bg-yellow-100 font-bold border-t-2 border-yellow-400">
                        {nIdx === 0 && (
                          <td className={`${tdCls} bg-yellow-400 text-center uppercase text-yellow-900`} rowSpan={groupTotal.nurseries.length}>Sous-total {parent}</td>
                        )}
                        <td className={tdTypeCls}>{n.nurseryType}</td>
                        {renderCells(n, false, -1, -1)}
                      </tr>
                    ))}
                  </React.Fragment>
                )}
              </React.Fragment>
            );
          })}
          {/* Total général final (Ligne simple tout en bas) */}
          <tr className="bg-green-800 text-white font-bold border-t-4 border-green-900">
            <td className={`${tdCls} bg-green-900 text-center uppercase`} colSpan={2}>{globalTotalLabel}</td>
            {renderCells(sumAllNurseries(total.nurseries), false, -1, -1)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
