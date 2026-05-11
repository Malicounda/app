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
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import React from "react";

export interface F2NurseryData {
  nurseryType: string;
  nbPep: number;
  nbPlants: number;
}

export interface F2LocaliteRow {
  localite: string;
  localiteLevel: "commune" | "arrondissement" | "departement" | "region";
  parentLocalite?: string;
  isTotal?: boolean;

  nurseries: F2NurseryData[];

  // Legacy fields for backward compatibility
  regieNbPep?: number;
  regieNbPlants?: number;
  priveIndivNbPep?: number;
  priveIndivNbPlants?: number;
  villagCommNbPep?: number;
  villagCommNbPlants?: number;
  scolaireNbPep?: number;
  scolaireNbPlants?: number;
}

export const emptyF2Row = (localite: string, level: F2LocaliteRow["localiteLevel"], parent?: string): F2LocaliteRow => ({
  localite, localiteLevel: level, parentLocalite: parent,
  nurseries: []
});

export function sumF2Rows(rows: F2LocaliteRow[]): F2LocaliteRow {
  const sum = emptyF2Row("TOTAL", "commune");
  sum.nurseries = [];
  for (const r of rows) {
    if (r.nurseries) {
      for (const n of r.nurseries) {
        let existing = sum.nurseries.find(x => x.nurseryType === n.nurseryType);
        if (!existing) {
          existing = { nurseryType: n.nurseryType, nbPep: 0, nbPlants: 0 };
          sum.nurseries.push(existing);
        }
        existing.nbPep += (n.nbPep || 0);
        existing.nbPlants += (n.nbPlants || 0);
      }
    }
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
  rows: F2LocaliteRow[];
  onChange: (rows: F2LocaliteRow[]) => void;
  nurseryTypes: string[];
  readOnly?: boolean;
  globalTotalLabel?: string;
  localiteColumnHeader?: string;
  onDeleteRow?: (row: F2LocaliteRow) => Promise<void> | void;
  isRowDeletable?: (row: F2LocaliteRow) => boolean;
}

export function F2PlantsTable({ rows, onChange, nurseryTypes, readOnly = false, globalTotalLabel = "TOTAL GÉNÉRAL", localiteColumnHeader = "Localités", onDeleteRow, isRowDeletable }: Props) {
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<F2LocaliteRow | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const updateNursery = (rIdx: number, type: string, field: "nbPep" | "nbPlants", val: number) => {
    const updated = [...rows];
    const row = updated[rIdx];
    if (!row.nurseries) row.nurseries = [];
    let n = row.nurseries.find(x => x.nurseryType === type);
    if (!n) {
      n = { nurseryType: type, nbPep: 0, nbPlants: 0 };
      row.nurseries.push(n);
    }
    n[field] = val;
    onChange(updated);
  };

  const openDeleteDialog = (row: F2LocaliteRow) => {
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

  const parents = Array.from(new Set(rows.map(r => r.parentLocalite || "").filter(Boolean)));
  const grouped = parents.length > 0
    ? parents.map(p => ({ parent: p, children: rows.filter(r => r.parentLocalite === p) }))
    : [{ parent: "", children: rows }];
  const total = sumF2Rows(rows);

  const thCls = "bg-[#dcedc8] text-gray-900 text-xs font-semibold text-center px-1 py-1 border border-gray-400";
  const thSubCls = "bg-[#dcedc8] text-gray-900 text-[10px] font-semibold text-center px-1 py-1 border border-gray-400";
  const tdCls = "text-[11px] px-1 py-1 border border-gray-300 text-center";
  const cumulCls = "bg-[#fff9c4] text-center font-bold text-[11px] border border-[#ffeb3b] px-1";

  const toNum = (v: any): number => {
    const n = parseInt(v);
    return isNaN(n) ? 0 : n;
  };

  const renderCells = (r: F2LocaliteRow, isEditable: boolean, rIdx: number) => {
    let totalPep = 0;
    let totalPlants = 0;

    return (
      <>
        {nurseryTypes.map((type) => {
          const n = r.nurseries?.find(x => x.nurseryType === type) || { nbPep: 0, nbPlants: 0 };
          totalPep += toNum(n.nbPep);
          totalPlants += toNum(n.nbPlants);

          return isEditable ? (
            <React.Fragment key={type}>
              <td className={tdCls}><NumInput value={n.nbPep} onChange={v => updateNursery(rIdx, type, "nbPep", v)} /></td>
              <td className={tdCls}><NumInput value={n.nbPlants} onChange={v => updateNursery(rIdx, type, "nbPlants", v)} /></td>
            </React.Fragment>
          ) : (
            <React.Fragment key={type}>
              <td className={tdCls}>{toNum(n.nbPep)}</td>
              <td className={tdCls}>{toNum(n.nbPlants)}</td>
            </React.Fragment>
          );
        })}
        <td className={`${cumulCls} ${!isEditable && rIdx === -1 ? "text-red-600" : ""}`}>{totalPep}</td>
        <td className={`${cumulCls} ${!isEditable && rIdx === -1 ? "text-red-600" : ""}`}>{totalPlants}</td>
      </>
    );
  };

  return (
    <div className="rounded-lg border border-gray-300">
      <table className="w-full text-xs border-collapse">
        <colgroup>
          <col style={{ width: '160px' }} />
        </colgroup>
        <thead>
          <tr>
            <th className={thCls} rowSpan={2}>{localiteColumnHeader}</th>
            {nurseryTypes.map(type => (
              <th key={type} className={thCls} colSpan={2}>{type}</th>
            ))}
            <th className={thCls} colSpan={2}>Total</th>
          </tr>
          <tr>
            {nurseryTypes.map(type => (
              <React.Fragment key={`sub-${type}`}>
                <th className={thSubCls}>Nb pep</th>
                <th className={thSubCls}>Nb plants</th>
              </React.Fragment>
            ))}
            <th className={thSubCls}>Nb pep</th>
            <th className={thSubCls}>Nb plants</th>
          </tr>
        </thead>
        <tbody>
          {grouped.map(({ parent, children }) => {
            const groupTotal = sumF2Rows(children);
            return (
              <React.Fragment key={parent || "all"}>
                {parent && (
                  <tr className="bg-gray-100 font-bold border-t border-gray-300">
                    <td className={`${tdCls} uppercase text-left text-gray-900`} colSpan={nurseryTypes.length * 2 + 3}>
                      {parent}
                    </td>
                  </tr>
                )}
                {children.map((row, globalIdx) => {
                  const isEditable = !readOnly && !row.isTotal;
                  const canDelete = !readOnly
                    && row.localiteLevel === 'commune'
                    && !row.isTotal
                    && (isRowDeletable ? isRowDeletable(row) : true);
                  return (
                    <React.Fragment key={`${row.localite}-${globalIdx}`}>
                      <tr className="hover:bg-gray-50">
                        <td className={`${tdCls} font-medium bg-white uppercase text-left min-w-[150px]`}>
                          {row.localiteLevel !== "commune" && <span className="mr-1 text-green-700">▶</span>}
                          <div className="flex items-center justify-between gap-2 group">
                            <span className={row.localiteLevel === "commune" && row.parentLocalite ? "pl-4 inline-block" : ""}>
                              {row.localite || "À définir"}
                            </span>
                            {canDelete && (
                              <button
                                type="button"
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-red-600 hover:text-red-800"
                                onClick={() => openDeleteDialog(row)}
                                aria-label={`Supprimer ${row.localite}`}
                                title="Supprimer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                        {renderCells(row, isEditable, rows.indexOf(row))}
                      </tr>
                    </React.Fragment>
                  );
                })}
                {/* Total Group */}
                {parent && (
                  <tr key={`total-${parent}`} className="bg-yellow-100 font-bold border-t-2 border-yellow-400">
                    <td className={`${tdCls} bg-yellow-400 uppercase text-yellow-900 text-left`}>
                      {(parent || '').trim().toLowerCase() === 'pépinière départementale'
                        ? 'Total départemental'
                        : `Sous-total ${parent}`}
                    </td>
                    {renderCells(groupTotal, false, -1)}
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          {/* Nouveau: Ligne Somme Totale (TOTAL GÉNÉRAL) */}
          <tr className="bg-green-800 text-white font-bold border-t-4 border-green-900">
            <td className={`${tdCls} bg-green-900 uppercase text-left`}>{globalTotalLabel}</td>
            {renderCells(total, false, -1)}
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
                void confirmDelete();
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
