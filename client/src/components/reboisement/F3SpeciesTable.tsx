import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface F3SpeciesRow {
  localite?: string;
  speciesName: string;
  category: string;
  count: number;
  nurseries?: { nurseryType: string, count: number }[];
}

interface Props {
  rows: F3SpeciesRow[];
  isConsolidated?: boolean;
  readOnly?: boolean;
  nurseryTypes?: string[]; // Types à afficher en colonnes
  localiteColumnHeader?: string; // "Département" ou "Région" selon le contexte
  globalTotalLabel?: string;
}

export function F3SpeciesTable({ rows, isConsolidated, readOnly, nurseryTypes: propNurseryTypes, localiteColumnHeader = "Département", globalTotalLabel = "TOTAL GÉNÉRAL RÉGIONAL" }: Props) {
  const thCls = "h-8 px-2 text-center font-bold bg-gray-200 text-gray-800 border border-gray-300 text-[10px] uppercase tracking-wider";
  const tdCls = "p-2 border border-gray-200 text-xs";

  // Identifier tous les types de pépinières présents dans les données ou utiliser ceux fournis en prop
  const nurseryTypes = React.useMemo(() => {
    if (propNurseryTypes && propNurseryTypes.length > 0) return propNurseryTypes;

    const types = new Set<string>();
    rows.forEach(r => {
      if (r.nurseries) {
        r.nurseries.forEach(n => types.add(n.nurseryType));
      }
    });
    // Si aucun type n'est trouvé, utiliser les types par défaut pour l'en-tête
    if (types.size === 0) return ["Régie", "Villageoise/Communautaire", "Individuelle/Privée", "Scolaire"];
    return Array.from(types).sort((a, b) => {
      const defaults = ["Régie", "Villageoise/Communautaire", "Individuelle/Privée", "Scolaire"];
      const idxA = defaults.indexOf(a);
      const idxB = defaults.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [rows, propNurseryTypes]);

  // Grouper par localité si c'est une consolidation
  const groupedRows = React.useMemo(() => {
    if (!isConsolidated) return { "Général": rows };
    const map: Record<string, F3SpeciesRow[]> = {};
    rows.forEach(r => {
      const loc = r.localite || "Non défini";
      if (!map[loc]) map[loc] = [];
      map[loc].push(r);
    });
    return map;
  }, [rows, isConsolidated]);

  const totalGeneral = rows.reduce((acc, r) => acc + (r.count || 0), 0);

  return (
    <div className="border rounded-lg shadow-sm bg-white overflow-x-auto">
      <table className="w-full text-xs border-collapse min-w-[600px]">
        <thead>
          <tr>
            {isConsolidated && <th className={`${thCls} w-40`} rowSpan={2}>{localiteColumnHeader}</th>}
            <th className={`${thCls} w-32`} rowSpan={2}>Espèce</th>
            <th className={`${thCls} w-24`} rowSpan={2}>Catégorie</th>
            <th className={thCls} colSpan={nurseryTypes.length}>Nombre de plants par type de pépinière</th>
            <th className={thCls} rowSpan={2}>Total</th>
          </tr>
          <tr>
            {nurseryTypes.map(type => {
              const isLong = type.length > 15;
              return (
                <th 
                  key={type} 
                  className={`${thCls} font-normal bg-gray-100/90 capitalize ${isLong ? 'whitespace-normal leading-tight w-24' : 'whitespace-nowrap min-w-[60px]'} py-1`}
                >
                  {type}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {Object.entries(groupedRows).map(([loc, items], gIdx) => (
            <React.Fragment key={loc}>
              {items.map((item, idx) => (
                <tr key={`${loc}-${idx}`} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                  {isConsolidated && idx === 0 && (
                    <td className={`${tdCls} font-bold bg-green-50 text-green-800 w-40 break-words`} rowSpan={items.length}>
                      {loc}
                    </td>
                  )}
                  <td className={`${tdCls} w-32 break-words italic`}>{item.speciesName}</td>
                  <td className={`${tdCls} w-24 text-center`}>{item.category}</td>
                  {nurseryTypes.map(type => {
                    const count = item.nurseries?.find(n => n.nurseryType === type)?.count || 0;
                    return (
                      <td key={type} className={`${tdCls} text-center ${count > 0 ? 'font-medium' : 'text-gray-300'}`}>
                        {count > 0 ? count.toLocaleString() : "—"}
                      </td>
                    );
                  })}
                  <td className={`${tdCls} text-center font-bold bg-green-50/30`}>{item.count.toLocaleString()}</td>
                </tr>
              ))}
              {isConsolidated && (
                <tr className="bg-yellow-50 font-bold">
                  <td className={`${tdCls} font-bold text-amber-900 bg-yellow-100/50 uppercase text-[10px] w-40`} colSpan={1}>
                    Total {loc}
                  </td>
                  <td className={`${tdCls} w-32`} colSpan={1}></td>
                  <td className={`${tdCls} w-24`} colSpan={1}></td>
                  {nurseryTypes.map(type => {
                    const typeTotal = items.reduce((acc, i) => {
                      const count = i.nurseries?.find(n => n.nurseryType === type)?.count || 0;
                      return acc + count;
                    }, 0);
                    return (
                      <td key={type} className={`${tdCls} text-center text-amber-900`}>
                        {typeTotal.toLocaleString()}
                      </td>
                    );
                  })}
                  <td className={`${tdCls} text-center text-amber-900`}>
                    {items.reduce((acc, i) => acc + i.count, 0).toLocaleString()}
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-green-800 text-white font-bold border-t-2 border-green-900">
            <td className={`${tdCls} text-center uppercase`} colSpan={isConsolidated ? 3 : 2}>
              {globalTotalLabel}
            </td>
            {nurseryTypes.map(type => {
              const typeTotal = rows.reduce((acc, i) => {
                const count = i.nurseries?.find(n => n.nurseryType === type)?.count || 0;
                return acc + count;
              }, 0);
              return (
                <td key={type} className={`${tdCls} text-center`}>
                  {typeTotal.toLocaleString()}
                </td>
              );
            })}
            <td className={`${tdCls} text-center text-sm`}>
              {totalGeneral.toLocaleString()}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
