import CNRReportForm from "@/components/reboisement/CNRReportForm";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle, Clock, Eye, FileText, Folder, MessageSquare, Trash2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

const MONTH_ORDER: Record<string, number> = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};
function normalize(s: string) {
  return s.toLowerCase().replace(/é/g,'e').replace(/è/g,'e').replace(/ê/g,'e').replace(/û/g,'u').replace(/ô/g,'o').replace(/à/g,'a').replace(/î/g,'i').replace(/ï/g,'i');
}
function extractMonthKey(period: string) {
  const s = String(period||'').trim();
  const idx = s.toLowerCase().indexOf(' - quinzaine');
  return idx === -1 ? s : s.slice(0, idx).trim();
}
function extractYear(monthKey: string) {
  const m = String(monthKey||'').match(/(\d{4})\s*$/);
  return m?.[1] || '';
}
function monthSortIndex(monthKey: string) {
  const norm = normalize(monthKey);
  for (const [name, idx] of Object.entries(MONTH_ORDER)) { if (norm.includes(name)) return idx; }
  return 99;
}

export default function ReforestationRegionalReports() {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [reportToDelete, setReportToDelete] = useState<any>(null);
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({});
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [expandedQuinzaines, setExpandedQuinzaines] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const { data: reports = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/reboisement/reports", ""],
    queryFn: () => apiRequest({
      url: `/api/reboisement/reports`,
      method: "GET"
    }) as any,
    enabled: !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest({ url: `/api/reboisement/reports/${id}`, method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reboisement/reports"] });
      toast({
        title: "Succès",
        description: "Le rapport a été supprimé avec succès.",
      });
      setReportToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "Erreur",
        description: error.message || "Une erreur est survenue lors de la suppression.",
        variant: "destructive",
      });
    }
  });

  const sendReminderMutation = useMutation({
    mutationFn: (payload: { recipientId: number; subject?: string; content: string }) =>
      apiRequest({
        url: "/api/messages",
        method: "POST",
        data: payload,
      }),
    onSuccess: () => {
      toast({
        title: "Message envoyé",
        description: "Le rappel a été envoyé à l'agent.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erreur",
        description: error.message || "Impossible d'envoyer le message.",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "valide":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-200 border-green-200"><CheckCircle className="w-3 h-3 mr-1" /> Validé</Badge>;
      case "soumis":
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-200"><Clock className="w-3 h-3 mr-1" /> Soumis</Badge>;
      case "rejete":
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-200 border-red-200"><XCircle className="w-3 h-3 mr-1" /> Rejeté</Badge>;
      case "brouillon":
        return (
          <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
            Édition
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleEdit = (report: any) => {
    setSelectedReport(report);
    setShowForm(true);
  };

  const handleSendReminder = (report: any) => {
    const recipientId = Number(report?.createdBy);
    if (!Number.isFinite(recipientId) || recipientId <= 0) {
      toast({
        title: "Erreur",
        description: "Destinataire introuvable pour ce rapport.",
        variant: "destructive",
      });
      return;
    }
    sendReminderMutation.mutate({
      recipientId,
      subject: "Soumission du rapport",
      content: "Veuillez soumettre votre rapport",
    });
  };

  // Sector reports only (exclude regional consolidated)
  const sectorReports = useMemo(() =>
    (reports || []).filter((r: any) => String(r?.level || '') !== 'region'),
    [reports]
  );

  // Index sector reports by period
  const sectorByPeriod = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const r of sectorReports) {
      const p = String(r?.period || '');
      if (!p) continue;
      if (!map.has(p)) map.set(p, []);
      map.get(p)!.push(r);
    }
    return map;
  }, [sectorReports]);

  // Find consolidated regional report for a given period
  const getConsolidated = (period: string) => {
    const candidates = (reports || []).filter((r: any) =>
      r?.level === "region"
      && (r?.status === "valide" || r?.status === "soumis" || r?.status === "brouillon")
      && String(r?.region || "") === String(user?.region || "")
      && String(r?.period || "") === period
    );
    return candidates.find((r: any) => r?.status === "valide")
      || candidates.find((r: any) => r?.status === "soumis")
      || candidates.find((r: any) => r?.status === "brouillon")
      || null;
  };

  // Tree: Year -> Month -> Quinzaine periods
  const tree = useMemo(() => {
    const yearMap = new Map<string, Set<string>>();
    for (const r of sectorReports) {
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
  }, [sectorReports]);

  const toggleYear = (y: string) => setExpandedYears(p => ({ ...p, [y]: !(p[y] ?? false) }));
  const toggleMonth = (mk: string) => setExpandedMonths(p => ({ ...p, [mk]: !(p[mk] ?? false) }));
  const toggleQuinzaine = (period: string) => setExpandedQuinzaines(p => ({ ...p, [period]: !(p[period] ?? false) }));

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
          <h1 className="text-3xl font-bold text-green-900">Validation Régionale</h1>
          <p className="text-green-700">Validation des rapports des agents de secteur de la région {user?.region}.</p>
        </div>
        <Button
          onClick={() => {
            setSelectedReport({ level: "region", status: "brouillon", region: user?.region });
            setShowForm(true);
          }}
          className="bg-green-600 hover:bg-green-700 shadow-md"
        >
          Situation de la Région
        </Button>
      </div>

      <Card className="border-green-100 shadow-sm">
        <CardHeader>
          <CardTitle>Rapports à traiter</CardTitle>
          <CardDescription>Liste des rapports soumis par les agents pour validation.</CardDescription>
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
                    // ── Dossier Année ──
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

                    // ── Mois + Quinzaines ──
                    yearOpen && months.map(mk => {
                      const monthOpen = expandedMonths[mk] ?? false;
                      const monthLabel = mk.replace(/\s*\d{4}\s*$/, '').trim();
                      const q1Period = `${mk} - Quinzaine 1`;
                      const q2Period = `${mk} - Quinzaine 2`;

                      return [
                        // ── Dossier Mois ──
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

                        // ── Quinzaine 1 & 2 (dossiers dépliables) ──
                        monthOpen && [q1Period, q2Period].map(period => {
                          const qOpen = expandedQuinzaines[period] ?? false;
                          const consolidated = getConsolidated(period);
                          const sectorRpts = sectorByPeriod.get(period) || [];

                          return [
                            // Ligne dossier Quinzaine
                            <TableRow
                              key={`q-${period}`}
                              className="bg-amber-50/60 hover:bg-amber-50 cursor-pointer"
                              onClick={() => toggleQuinzaine(period)}
                            >
                              <TableCell className="font-semibold whitespace-nowrap" colSpan={6}>
                                <div className="flex items-center gap-2 pl-8">
                                  <Folder className="w-4 h-4 text-amber-500" />
                                  <span>{period.includes('Quinzaine 1') ? 'Quinzaine 1' : 'Quinzaine 2'}</span>
                                  <span className="text-[10px] text-slate-500 font-medium ml-2">
                                    {qOpen ? "(réduire)" : "(déplier)"}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (consolidated?.id) {
                                      handleEdit(consolidated);
                                    } else {
                                      handleEdit({
                                        level: "region",
                                        status: "brouillon",
                                        region: user?.region,
                                        period,
                                        reportDate: new Date().toISOString().split("T")[0],
                                      });
                                    }
                                  }}
                                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                  title="Situation régionale"
                                >
                                  <Eye className="w-3 h-3" />
                                </Button>
                              </TableCell>
                            </TableRow>,

                            // Rapports secteur sous la quinzaine
                            qOpen && (sectorRpts.length > 0 ? sectorRpts.map((r: any) => (
                              <TableRow key={r.id} className="hover:bg-green-50/30 transition-colors">
                                <TableCell className="pl-12 font-semibold whitespace-nowrap">{r.period}</TableCell>
                                <TableCell className="text-xs">{format(new Date(r.reportDate), "dd/MM/yyyy")}</TableCell>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-slate-900">
                                      {r.creatorGrade ? `${r.creatorGrade} ` : ""}{r.creatorFirstName} {r.creatorLastName}
                                      <span className="text-slate-400 font-normal ml-1">(Matricule: {r.creatorMatricule || "N/A"})</span>
                                    </span>
                                    <span className="text-[9px] text-slate-500 mt-0.5 block leading-none">
                                      Genre: <span className="font-medium text-slate-700">{r.creatorGenre || "—"}</span>
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <span className="text-xs text-slate-600 uppercase font-medium">
                                    {r.commune || r.arrondissement || r.departement || r.region}
                                  </span>
                                </TableCell>
                                <TableCell className="capitalize text-[10px] font-medium text-slate-500">{r.level}</TableCell>
                                <TableCell>{getStatusBadge(r.status)}</TableCell>
                                <TableCell className="text-right whitespace-nowrap">
                                  {r.status === "brouillon" || r.status === "rejete" ? (
                                    <Button variant="ghost" size="sm" onClick={() => handleSendReminder(r)} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50" title="Envoyer un rappel" disabled={sendReminderMutation.isPending}>
                                      <MessageSquare className="w-3 h-3" />
                                    </Button>
                                  ) : (
                                    <Button variant="ghost" size="sm" onClick={() => handleEdit(r)} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50" title="Traiter">
                                      <Eye className="w-3 h-3" />
                                    </Button>
                                  )}
                                  {(r.status === "brouillon" || r.status === "rejete") && r.createdBy === user?.id && (
                                    <Button variant="ghost" size="sm" onClick={() => setReportToDelete(r)} className="text-red-600 hover:text-red-700 hover:bg-red-50 ml-1">
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            )) : (
                              <TableRow key={`empty-${period}`} className="bg-slate-50/30">
                                <TableCell colSpan={7} className="pl-12 text-slate-400 italic text-xs">Aucun rapport secteur pour cette quinzaine</TableCell>
                              </TableRow>
                            ))
                          ];
                        })
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
