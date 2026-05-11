import CNRReportForm from "@/components/reboisement/CNRReportForm";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle, Clock, Eye, FileText, Folder, Pencil, Plus, Trash2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

const MONTH_ORDER: Record<string, number> = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};

function normalize(s: string) {
  return s.toLowerCase()
    .replace(/é/g, 'e').replace(/è/g, 'e').replace(/ê/g, 'e')
    .replace(/û/g, 'u').replace(/ô/g, 'o').replace(/à/g, 'a')
    .replace(/î/g, 'i').replace(/ï/g, 'i');
}

function extractMonthKey(period: string) {
  const s = String(period || '').trim();
  const idx = s.toLowerCase().indexOf(' - quinzaine');
  return idx === -1 ? s : s.slice(0, idx).trim();
}

function extractYear(monthKey: string) {
  const m = String(monthKey || '').match(/(\d{4})\s*$/);
  return m?.[1] || '';
}

function monthSortIndex(monthKey: string) {
  const norm = normalize(monthKey);
  for (const [name, idx] of Object.entries(MONTH_ORDER)) {
    if (norm.includes(name)) return idx;
  }
  return 99;
}

export default function ReforestationDepartementReports() {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [reportToDelete, setReportToDelete] = useState<any>(null);
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({});
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const { data: reports = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/reboisement/reports", ""],
    queryFn: () => apiRequest({ url: `/api/reboisement/reports`, method: "GET" }) as any,
    enabled: !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest({ url: `/api/reboisement/reports/${id}`, method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reboisement/reports"] });
      toast({ title: "Succès", description: "Le rapport a été supprimé avec succès." });
      setReportToDelete(null);
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message || "Une erreur est survenue.", variant: "destructive" });
    }
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "valide": return <Badge className="bg-green-100 text-green-800 hover:bg-green-200 border-green-200"><CheckCircle className="w-3 h-3 mr-1" /> Validé</Badge>;
      case "soumis": return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-200"><Clock className="w-3 h-3 mr-1" /> Soumis</Badge>;
      case "rejete": return <Badge className="bg-red-100 text-red-800 hover:bg-red-200 border-red-200"><XCircle className="w-3 h-3 mr-1" /> Rejeté</Badge>;
      case "brouillon": return <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">Brouillon</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleEdit = (report: any) => { setSelectedReport(report); setShowForm(true); };

  // Index des rapports par period
  const reportByPeriod = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of (reports || [])) {
      const p = String(r?.period || '');
      if (p) map.set(p, r);
    }
    return map;
  }, [reports]);

  // Structure: Année -> Mois -> Q1/Q2
  const tree = useMemo(() => {
    const yearMap = new Map<string, Set<string>>();
    for (const r of (reports || [])) {
      const mk = extractMonthKey(String(r?.period || ''));
      const y = extractYear(mk);
      if (!y || !mk) continue;
      if (!yearMap.has(y)) yearMap.set(y, new Set());
      yearMap.get(y)!.add(mk);
    }
    const years = Array.from(yearMap.keys()).sort((a, b) => b.localeCompare(a));
    return years.map(y => {
      const monthKeys = Array.from(yearMap.get(y)!);
      monthKeys.sort((a, b) => monthSortIndex(b) - monthSortIndex(a));
      return { year: y, months: monthKeys };
    });
  }, [reports]);

  const toggleYear = (y: string) => setExpandedYears(p => ({ ...p, [y]: !(p[y] ?? false) }));
  const toggleMonth = (mk: string) => setExpandedMonths(p => ({ ...p, [mk]: !(p[mk] ?? false) }));

  if (showForm) {
    return (
      <div className="px-2 sm:px-4 py-2">
        <CNRReportForm
          onClose={() => { setShowForm(false); setSelectedReport(null); }}
          existingReport={selectedReport}
          existingReports={reports || []}
        />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-green-900">Mes Rapports de Quinzaine</h1>
          <p className="text-green-700">Gestion et suivi de vos déclarations CNR.</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="bg-green-600 hover:bg-green-700 shadow-md">
          <Plus className="mr-2 h-4 w-4" /> Nouveau Rapport
        </Button>
      </div>

      <Card className="border-green-100 shadow-sm">
        <CardHeader>
          <CardTitle>Mes Rapports Récents</CardTitle>
          <CardDescription>Liste des rapports soumis pour votre zone.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8 text-slate-400">Chargement...</div>
          ) : tree.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
              Aucun rapport trouvé.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-green-50/50">
                  <TableHead>Période</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Lieu</TableHead>
                  <TableHead>Niveau</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tree.map(({ year, months }) => {
                  const yearOpen = expandedYears[year] ?? false;
                  return [
                    // Ligne dossier Année
                    <TableRow
                      key={`year-${year}`}
                      className="bg-amber-200/60 hover:bg-amber-200 cursor-pointer"
                      onClick={() => toggleYear(year)}
                    >
                      <TableCell className="font-semibold whitespace-nowrap" colSpan={7}>
                        <div className="flex items-center gap-2">
                          <Folder className="w-4 h-4 text-amber-700" />
                          <span>{year}</span>
                          <span className="text-[10px] text-slate-500 font-medium ml-2">
                            {yearOpen ? "(réduire)" : "(déplier)"}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>,
                    // Mois + Quinzaines (seulement si année ouverte)
                    yearOpen && months.map(mk => {
                      const monthOpen = expandedMonths[mk] ?? false;
                      const monthLabel = mk.replace(/\s*\d{4}\s*$/, '').trim();
                      const q1Period = `${mk} - Quinzaine 1`;
                      const q2Period = `${mk} - Quinzaine 2`;
                      const q1Report = reportByPeriod.get(q1Period);
                      const q2Report = reportByPeriod.get(q2Period);

                      const renderQuinzaineRow = (label: string, period: string, report: any) => {
                        if (!report) {
                          return (
                            <TableRow key={`q-${period}`} className="bg-slate-50/30">
                              <TableCell className="pl-8 text-slate-500">{label}</TableCell>
                              <TableCell className="text-slate-400 text-xs">—</TableCell>
                              <TableCell className="text-slate-400 text-xs italic">Aucun rapport</TableCell>
                              <TableCell className="text-slate-400 text-xs">—</TableCell>
                              <TableCell className="text-slate-400 text-xs">—</TableCell>
                              <TableCell /><TableCell />
                            </TableRow>
                          );
                        }
                        return (
                          <TableRow key={`q-${period}`} className="hover:bg-green-50/30 transition-colors">
                            <TableCell className="pl-8 font-semibold whitespace-nowrap">{label}</TableCell>
                            <TableCell className="text-xs">{format(new Date(report.reportDate), "dd/MM/yyyy")}</TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-semibold text-slate-900">
                                  {report.creatorGrade ? `${report.creatorGrade} ` : ""}{report.creatorFirstName} {report.creatorLastName}
                                  <span className="text-slate-400 font-normal ml-1">(Matricule: {report.creatorMatricule || "N/A"})</span>
                                </span>
                                <span className="text-[9px] text-slate-500 mt-0.5 block leading-none">
                                  Genre: <span className="font-medium text-slate-700">{report.creatorGenre || "—"}</span>
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-slate-600 uppercase font-medium">
                                {report.commune || report.arrondissement || report.departement || report.region}
                              </span>
                            </TableCell>
                            <TableCell className="capitalize text-[10px] font-medium text-slate-500">{report.level}</TableCell>
                            <TableCell>{getStatusBadge(report.status)}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              {report.status === "brouillon" || report.status === "rejete" ? (
                                <Button variant="ghost" size="sm" onClick={() => handleEdit(report)} className="text-amber-600 hover:text-amber-700 hover:bg-amber-50">
                                  <Pencil className="w-3 h-3" />
                                </Button>
                              ) : (
                                <Button variant="ghost" size="sm" onClick={() => handleEdit(report)} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50" title="Voir">
                                  <Eye className="w-3 h-3" />
                                </Button>
                              )}
                              {(report.status === "brouillon" || report.status === "rejete") && report.createdBy === user?.id && (
                                <Button variant="ghost" size="sm" onClick={() => setReportToDelete(report)} className="text-red-600 hover:text-red-700 hover:bg-red-50 ml-1">
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      };

                      return [
                        // Ligne dossier Mois
                        <TableRow
                          key={`month-${mk}`}
                          className="bg-amber-100/60 hover:bg-amber-100 cursor-pointer"
                          onClick={() => toggleMonth(mk)}
                        >
                          <TableCell className="font-semibold whitespace-nowrap" colSpan={7}>
                            <div className="flex items-center gap-2 pl-4">
                              <Folder className="w-4 h-4 text-amber-600" />
                              <span>{monthLabel}</span>
                              <span className="text-[10px] text-slate-500 font-medium ml-2">
                                {monthOpen ? "(réduire)" : "(déplier)"}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>,
                        // Quinzaine 1 et 2 (seulement si mois ouvert)
                        monthOpen && renderQuinzaineRow("Quinzaine 1", q1Period, q1Report),
                        monthOpen && renderQuinzaineRow("Quinzaine 2", q2Period, q2Report),
                      ];
                    })
                  ];
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!reportToDelete} onOpenChange={(open) => !open && setReportToDelete(null)}>
        <AlertDialogContent overlayClassName="!bg-transparent">
          <AlertDialogHeader>
            <AlertDialogTitle>Êtes-vous absolument sûr ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Cela supprimera définitivement le rapport
              pour la période {reportToDelete?.period}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(reportToDelete.id)}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
