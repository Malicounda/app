import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import { apiRequest } from '@/lib/queryClient';
import { exportMultiSheetExcel } from '@/lib/excelWorkbook';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Shield, Activity, MapPin, Search, Bell, MessageSquare, Trash2, Paperclip, Download } from 'lucide-react';
import MessageAttachmentViewer from '@/components/messaging/MessageAttachmentViewer';

// ═══════════════ Types ═══════════════
type AlertItem = {
  id: number; title: string; message: string; nature: string;
  region: string | null; departement: string | null; arrondissement: string | null; commune: string | null;
  lat: number | null; lon: number | null; createdAt: string;
  sender: {
    username: string; firstName: string | null; lastName: string | null;
    role: string; region: string | null; departement: string | null;
    matricule: string | null; serviceLocation: string | null;
    grade: string | null; roleMetier: string | null; genre: string | null;
  };
};

type MessageItem = {
  id: number; subject: string | null; content: string; type: string;
  isRead: boolean; createdAt: string;
  attachment: { path: string; name: string; mime: string; size: number } | null;
  sender: { id: number; username: string; firstName: string | null; lastName: string | null; role: string; region: string | null; departement: string | null; matricule: string | null; serviceLocation: string | null; grade: string | null; roleMetier: string | null; genre: string | null };
  recipient: { id: number; username: string; firstName: string | null; lastName: string | null; role: string; region: string | null; departement: string | null; matricule: string | null; serviceLocation: string | null; grade: string | null; roleMetier: string | null; genre: string | null };
};

// ═══════════════ Helpers ═══════════════
const natureLabels: Record<string, string> = {
  braconnage: "Braconnage",
  feux_de_brousse: "Feux de brousse",
  "trafic-bois": "Coupe de bois",
  trafic_bois: "Coupe de bois",
  defrichement: "Défrichement",
  empietement: "Empiètement",
  spotrep: "SPOTREP",
  autre: "Autre / Information",
};

const natureColors: Record<string, string> = {
  braconnage: "bg-red-100 text-red-700",
  feux_de_brousse: "bg-orange-100 text-orange-700",
  "trafic-bois": "bg-amber-100 text-amber-800",
  trafic_bois: "bg-amber-100 text-amber-800",
  defrichement: "bg-emerald-100 text-emerald-700",
  empietement: "bg-purple-100 text-purple-700",
  spotrep: "bg-cyan-100 text-cyan-700",
  autre: "bg-gray-100 text-gray-700",
};

const roleLabels: Record<string, string> = {
  superadmin: "SuperAdmin",
  super_admin: "SuperAdmin",
  admin: "Admin",
  agent: "Agent",
  "sub-agent": "Sous-agent",
  hunter: "Chasseur",
  "hunting-guide": "Guide",
};

function agentName(s: any) {
  if (!s) return "—";
  return [s.grade, s.firstName, s.lastName].filter(Boolean).join(" ") || s.username || s.matricule || "—";
}

function sessionDisplayName(session: any): string {
  const full = `${session.agentPrenom || ''} ${session.agentNom || ''}`.trim();
  if (full) return full;
  if (session.username) return session.username;
  if (session.agentMatricule) return session.agentMatricule;
  return "Compte supprimé";
}

function sessionRoleLabel(role?: string | null): string {
  if (!role) return "";
  return roleLabels[String(role).toLowerCase()] || role;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  try { return format(new Date(d), 'dd MMM yyyy, HH:mm', { locale: fr }); } catch { return "—"; }
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return bytes + " o";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " Ko";
  return (bytes / 1048576).toFixed(1) + " Mo";
}

// ═══════════════ Tab: Sessions APK ═══════════════
function SessionsTab({ sessions, isLoading, error }: { sessions: any[]; isLoading: boolean; error: any }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const deleteSingleMut = useMutation({
    mutationFn: (id: number) => apiRequest({ url: `/api/auth/active-sessions/${id}`, method: 'DELETE' }),
    onSuccess: (_data, id) => {
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      qc.invalidateQueries({ queryKey: ['active-sessions-history'] });
      toast({ title: 'Session supprimée' });
    },
    onError: (e: any) => toast({ title: 'Erreur', description: e?.message || 'Suppression impossible', variant: 'destructive' }),
  });

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      setBulkDeleting(true);
      await apiRequest({ url: '/api/auth/active-sessions/bulk-delete', method: 'POST', data: { ids } });
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ['active-sessions-history'] });
      toast({ title: `${ids.length} session(s) supprimée(s)` });
    } catch (e: any) {
      toast({ title: 'Erreur', description: e?.message || 'Suppression groupée impossible', variant: 'destructive' });
    } finally {
      setBulkDeleting(false);
    }
  };

  const filteredSessions = useMemo(() => {
    let list = sessions || [];
    if (statusFilter === 'active') list = list.filter((s: any) => s.isActive);
    else if (statusFilter === 'inactive') list = list.filter((s: any) => !s.isActive);

    if (!searchTerm.trim()) return list;
    const q = searchTerm.toLowerCase();
    return list.filter((session: any) =>
      sessionDisplayName(session).toLowerCase().includes(q) ||
      (session.username || '').toLowerCase().includes(q) ||
      (session.agentMatricule || '').toLowerCase().includes(q) ||
      (session.role || '').toLowerCase().includes(q) ||
      (session.deviceId || '').toLowerCase().includes(q)
    );
  }, [sessions, searchTerm, statusFilter]);

  const allVisibleSelected = filteredSessions.length > 0 && filteredSessions.every((s: any) => selectedIds.has(s.id));

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredSessions.forEach((s: any) => next.delete(s.id));
      } else {
        filteredSessions.forEach((s: any) => next.add(s.id));
      }
      return next;
    });
  };

  if (isLoading) return <div className="flex justify-center py-12"><Activity className="h-8 w-8 animate-spin text-orange-500" /></div>;
  if (error) return <div className="p-8 text-center text-red-500">Erreur lors du chargement.</div>;

  return (
    <Card className="border-0 shadow-lg flex flex-col flex-1 min-h-0">
      <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5 text-slate-500" />
              Sessions Actives et Historique GPS
            </CardTitle>
            <CardDescription className="mt-1">
              {filteredSessions.length} session(s) enregistrée(s) — connexions et remontées GPS.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={toggleSelectAll} disabled={filteredSessions.length === 0}>
              {allVisibleSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
            </Button>
            {selectedIds.size > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="destructive" size="sm" disabled={bulkDeleting} className="gap-1.5">
                    <Trash2 className="h-3.5 w-3.5" />
                    Supprimer ({selectedIds.size})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer {selectedIds.size} session(s) ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Les sessions sélectionnées seront définitivement supprimées de l&apos;historique.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleBulkDelete}>
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Rechercher (Nom, identifiant, matricule, rôle...)" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 bg-background" />
          </div>
          <div className="w-full sm:w-48">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">Tous les statuts</option>
              <option value="active">Active uniquement</option>
              <option value="inactive">Inactive uniquement</option>
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-hidden flex flex-col">
        <Table wrapperClassName="flex-1 overflow-auto">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm w-[42px]">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-slate-300 cursor-pointer"
                  aria-label="Tout sélectionner"
                />
              </TableHead>
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm font-semibold text-slate-700">Utilisateur</TableHead>
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm font-semibold text-slate-700">Appareil</TableHead>
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm font-semibold text-slate-700">Position GPS</TableHead>
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm font-semibold text-slate-700">Statut</TableHead>
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm font-semibold text-slate-700">Dernière Activité</TableHead>
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm font-semibold text-slate-700">Création</TableHead>
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSessions.length > 0 ? filteredSessions.map((session: any) => {
              const name = sessionDisplayName(session);
              const roleLbl = sessionRoleLabel(session.role);
              return (
                <TableRow key={session.id} className="hover:bg-slate-50 transition-colors">
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(session.id)}
                      onChange={() => toggleSelect(session.id)}
                      className="h-4 w-4 rounded border-slate-300 cursor-pointer"
                    />
                  </TableCell>
                  <TableCell className="font-medium text-slate-900">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold">{name}</span>
                      {roleLbl && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium">
                          {roleLbl}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      {session.agentMatricule && (
                        <span className="font-mono text-teal-700">{session.agentMatricule}</span>
                      )}
                      {session.username && session.username !== name && (
                        <span>@{session.username}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600 font-mono text-xs max-w-[280px] truncate" title={session.deviceId || ''}>
                    {session.deviceId || 'N/A'}
                  </TableCell>
                  <TableCell>
                    {session.lat && session.lon ? (
                      <div className="flex items-center gap-1 text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded-md w-fit">
                        <MapPin className="h-3 w-3 text-blue-500" />{parseFloat(session.lat).toFixed(5)}, {parseFloat(session.lon).toFixed(5)}
                      </div>
                    ) : <span className="text-slate-400 italic text-xs">Non disponible</span>}
                  </TableCell>
                  <TableCell>
                    {session.isActive
                      ? <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-0 shadow-none">Active</Badge>
                      : <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-200 border-0 shadow-none">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-slate-600 text-sm whitespace-nowrap">{fmtDate(session.lastActivity)}</TableCell>
                  <TableCell className="text-slate-600 text-sm whitespace-nowrap">{fmtDate(session.createdAt)}</TableCell>
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer cette session ?</AlertDialogTitle>
                          <AlertDialogDescription>Cette entrée de session sera supprimée définitivement.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteSingleMut.mutate(session.id)}>
                            Supprimer
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              );
            }) : (
              <TableRow><TableCell colSpan={8} className="h-32 text-center text-slate-500">Aucune session enregistrée.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ═══════════════ Tab: Alertes ═══════════════
function AlertesTab({ alerts, isLoading }: { alerts: AlertItem[]; isLoading: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [natureFilter, setNatureFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest({ url: `/api/superadmin/comms/alerts/${id}`, method: "DELETE" }),
    onSuccess: (_data, id) => {
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      qc.invalidateQueries({ queryKey: ["/api/superadmin/comms/alerts"] });
      toast({ title: "Alerte supprimée" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message, variant: "destructive" }),
  });

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      setBulkDeleting(true);
      await Promise.all(ids.map((id) => apiRequest({ url: `/api/superadmin/comms/alerts/${id}`, method: "DELETE" })));
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["/api/superadmin/comms/alerts"] });
      toast({ title: `${ids.length} alerte(s) supprimée(s)` });
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message, variant: "destructive" });
    } finally {
      setBulkDeleting(false);
    }
  };

  const distinctRegions = useMemo(() => {
    const regions = (alerts || []).map(a => a.region).filter((r): r is string => Boolean(r));
    return Array.from(new Set(regions)).sort();
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    return (alerts || []).filter(a => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesSearch =
          (a.title || "").toLowerCase().includes(q) ||
          (a.nature || "").toLowerCase().includes(q) ||
          (a.sender?.lastName || "").toLowerCase().includes(q) ||
          (a.sender?.firstName || "").toLowerCase().includes(q) ||
          (a.sender?.matricule || "").toLowerCase().includes(q) ||
          (a.region || "").toLowerCase().includes(q) ||
          (a.departement || "").toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      if (natureFilter !== "all") {
        if (natureFilter === "trafic_bois") {
          if (a.nature !== "trafic_bois" && a.nature !== "trafic-bois") return false;
        } else if (a.nature !== natureFilter) {
          return false;
        }
      }
      if (regionFilter !== "all" && a.region !== regionFilter) return false;
      return true;
    });
  }, [alerts, search, natureFilter, regionFilter]);

  const allVisibleSelected = filteredAlerts.length > 0 && filteredAlerts.every((a) => selectedIds.has(a.id));
  const toggleSelect = (id: number) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = () => setSelectedIds((prev) => {
    const n = new Set(prev);
    if (allVisibleSelected) filteredAlerts.forEach((a) => n.delete(a.id));
    else filteredAlerts.forEach((a) => n.add(a.id));
    return n;
  });

  if (isLoading) return <div className="flex justify-center py-12"><Activity className="h-8 w-8 animate-spin text-orange-500" /></div>;

  return (
    <Card className="border-0 shadow-lg flex flex-col flex-1 min-h-0">
      <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Bell className="h-5 w-5 text-red-500" />
              Historique des Alertes
            </CardTitle>
            <CardDescription className="mt-1">{filteredAlerts.length} alerte(s) envoyée(s) dans le système.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={toggleSelectAll} disabled={filteredAlerts.length === 0}>
              {allVisibleSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
            </Button>
            {selectedIds.size > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="destructive" size="sm" disabled={bulkDeleting} className="gap-1.5">
                    <Trash2 className="h-3.5 w-3.5" />
                    Supprimer ({selectedIds.size})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer {selectedIds.size} alerte(s) ?</AlertDialogTitle>
                    <AlertDialogDescription>Suppression irréversible des alertes sélectionnées.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleBulkDelete}>Supprimer</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Rechercher (nature, agent, région...)" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-background" />
          </div>
          <div className="w-full sm:w-48">
            <select value={natureFilter} onChange={e => setNatureFilter(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm">
              <option value="all">Toutes natures</option>
              <option value="braconnage">Braconnage</option>
              <option value="feux_de_brousse">Feux de brousse</option>
              <option value="trafic_bois">Coupe de bois</option>
              <option value="defrichement">Défrichement</option>
              <option value="empietement">Empiètement</option>
              <option value="spotrep">SPOTREP</option>
              <option value="autre">Autre / Information</option>
            </select>
          </div>
          <div className="w-full sm:w-48">
            <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm">
              <option value="all">Toutes régions</option>
              {distinctRegions.map(reg => (<option key={reg} value={reg}>{reg}</option>))}
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-hidden flex flex-col">
        <Table wrapperClassName="flex-1 overflow-auto">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm w-[42px]">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} className="h-4 w-4 rounded border-slate-300 cursor-pointer" />
              </TableHead>
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm font-semibold text-slate-700 min-w-[130px]">Date</TableHead>
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm font-semibold text-slate-700">Nature</TableHead>
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm font-semibold text-slate-700">Titre / Message</TableHead>
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm font-semibold text-slate-700">Agent</TableHead>
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm font-semibold text-slate-700">Matricule</TableHead>
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm font-semibold text-slate-700">Rôle Métier</TableHead>
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm font-semibold text-slate-700">Service</TableHead>
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm font-semibold text-slate-700">Lieu d&apos;envoi</TableHead>
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAlerts.length > 0 ? filteredAlerts.map(a => (
              <TableRow key={a.id} className="hover:bg-slate-50 transition-colors">
                <TableCell>
                  <input type="checkbox" checked={selectedIds.has(a.id)} onChange={() => toggleSelect(a.id)} className="h-4 w-4 rounded border-slate-300 cursor-pointer" />
                </TableCell>
                <TableCell className="text-sm text-slate-600 whitespace-nowrap">{fmtDate(a.createdAt)}</TableCell>
                <TableCell>
                  <Badge className={`border-0 shadow-none text-[10px] font-semibold ${natureColors[a.nature] || "bg-gray-100 text-gray-700"}`}>
                    {natureLabels[a.nature] || a.nature}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[220px]">
                  <div className="font-medium text-slate-900 truncate text-sm">{a.title || "—"}</div>
                  <div className="text-xs text-slate-500 truncate">{a.message || ""}</div>
                </TableCell>
                <TableCell className="text-sm text-slate-900 whitespace-nowrap">{agentName(a.sender)}</TableCell>
                <TableCell className="font-medium text-slate-900 whitespace-nowrap">
                  <div className="font-mono text-teal-600 text-xs">{a.sender?.matricule || "—"}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{[a.sender?.grade, a.sender?.genre].filter(Boolean).join(" / ") || "—"}</div>
                </TableCell>
                <TableCell className="text-xs text-teal-700 font-medium whitespace-nowrap">{a.sender?.roleMetier || "—"}</TableCell>
                <TableCell className="text-xs text-slate-500 max-w-[140px] truncate">{a.sender?.region || "—"}</TableCell>
                <TableCell className="text-xs text-slate-600 max-w-[160px]">
                  <div className="truncate">{[a.commune, a.arrondissement, a.departement, a.region].filter(Boolean).join(", ") || "—"}</div>
                  {a.lat && a.lon && <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" />{Number(a.lat).toFixed(4)}, {Number(a.lon).toFixed(4)}</div>}
                </TableCell>
                <TableCell>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer cette alerte ?</AlertDialogTitle>
                        <AlertDialogDescription>Suppression irréversible de l&apos;alerte et de ses notifications associées.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteMut.mutate(a.id)}>Supprimer</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={10} className="h-32 text-center text-slate-500">Aucune alerte trouvée.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ═══════════════ Tab: Messages ═══════════════
function MessagesTab({ messages, isLoading }: { messages: MessageItem[]; isLoading: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [previewPayload, setPreviewPayload] = useState<any | null>(null);
  const [attachmentFilter, setAttachmentFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest({ url: `/api/superadmin/comms/messages/${id}`, method: "DELETE" }),
    onSuccess: (_data, id) => {
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      qc.invalidateQueries({ queryKey: ["/api/superadmin/comms/messages"] });
      toast({ title: "Message supprimé" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message, variant: "destructive" }),
  });

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      setBulkDeleting(true);
      await Promise.all(ids.map((id) => apiRequest({ url: `/api/superadmin/comms/messages/${id}`, method: "DELETE" })));
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["/api/superadmin/comms/messages"] });
      toast({ title: `${ids.length} message(s) supprimé(s)` });
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message, variant: "destructive" });
    } finally {
      setBulkDeleting(false);
    }
  };

  const filteredMessages = useMemo(() => {
    return (messages || []).filter(m => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesSearch =
          (m.content || "").toLowerCase().includes(q) ||
          (m.subject || "").toLowerCase().includes(q) ||
          (m.sender?.lastName || "").toLowerCase().includes(q) ||
          (m.sender?.firstName || "").toLowerCase().includes(q) ||
          (m.sender?.matricule || "").toLowerCase().includes(q) ||
          (m.recipient?.lastName || "").toLowerCase().includes(q) ||
          (m.recipient?.firstName || "").toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      if (attachmentFilter === "with" && !m.attachment) return false;
      if (attachmentFilter === "without" && m.attachment) return false;
      if (typeFilter !== "all" && m.type !== typeFilter) return false;
      return true;
    });
  }, [messages, search, attachmentFilter, typeFilter]);

  const allVisibleSelected = filteredMessages.length > 0 && filteredMessages.every((m) => selectedIds.has(m.id));
  const toggleSelect = (id: number) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = () => setSelectedIds((prev) => {
    const n = new Set(prev);
    if (allVisibleSelected) filteredMessages.forEach((m) => n.delete(m.id));
    else filteredMessages.forEach((m) => n.add(m.id));
    return n;
  });

  if (isLoading) return <div className="flex justify-center py-12"><Activity className="h-8 w-8 animate-spin text-orange-500" /></div>;

  return (
    <Card className="border-0 shadow-lg flex flex-col flex-1 min-h-0">
      <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-500" />
              Historique des Messages
            </CardTitle>
            <CardDescription className="mt-1">{filteredMessages.length} message(s) échangé(s) dans le système.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={toggleSelectAll} disabled={filteredMessages.length === 0}>
              {allVisibleSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
            </Button>
            {selectedIds.size > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="destructive" size="sm" disabled={bulkDeleting} className="gap-1.5">
                    <Trash2 className="h-3.5 w-3.5" />
                    Supprimer ({selectedIds.size})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer {selectedIds.size} message(s) ?</AlertDialogTitle>
                    <AlertDialogDescription>Les messages sélectionnés seront supprimés définitivement.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleBulkDelete}>Supprimer</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Rechercher (contenu, expéditeur, destinataire...)" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-background" />
          </div>
          <div className="w-full sm:w-48">
            <select value={attachmentFilter} onChange={e => setAttachmentFilter(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm">
              <option value="all">Toutes pièces jointes</option>
              <option value="with">Avec pièce jointe</option>
              <option value="without">Sans pièce jointe</option>
            </select>
          </div>
          <div className="w-full sm:w-48">
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm">
              <option value="all">Tous types</option>
              <option value="direct">Individuel</option>
              <option value="group">Groupe</option>
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-hidden flex flex-col">
        <Table wrapperClassName="flex-1 overflow-auto">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm w-[42px]">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} className="h-4 w-4 rounded border-slate-300 cursor-pointer" />
              </TableHead>
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm font-semibold text-slate-700 min-w-[130px]">Date</TableHead>
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm font-semibold text-slate-700">Expéditeur</TableHead>
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm font-semibold text-slate-700">Rôle Métier</TableHead>
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm font-semibold text-slate-700">Service</TableHead>
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm font-semibold text-slate-700">Destinataire</TableHead>
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm font-semibold text-slate-700">Contenu</TableHead>
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm w-[40px]"><Paperclip className="h-3.5 w-3.5" /></TableHead>
              <TableHead className="sticky top-0 bg-slate-100 z-10 shadow-sm w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMessages.length > 0 ? filteredMessages.map(m => (
              <TableRow key={m.id} className="hover:bg-slate-50 transition-colors">
                <TableCell>
                  <input type="checkbox" checked={selectedIds.has(m.id)} onChange={() => toggleSelect(m.id)} className="h-4 w-4 rounded border-slate-300 cursor-pointer" />
                </TableCell>
                <TableCell className="text-sm text-slate-600 whitespace-nowrap">{fmtDate(m.createdAt)}</TableCell>
                <TableCell className="text-sm text-slate-900 whitespace-nowrap">{agentName(m.sender)}</TableCell>
                <TableCell className="text-xs text-teal-700 font-medium whitespace-nowrap">{m.sender?.roleMetier || "—"}</TableCell>
                <TableCell className="text-xs text-slate-500 max-w-[120px] truncate">{m.sender?.serviceLocation || "—"}</TableCell>
                <TableCell className="text-sm text-slate-900 whitespace-nowrap">{agentName(m.recipient)}</TableCell>
                <TableCell className="max-w-[260px]">
                  {m.subject && <div className="font-medium text-xs text-slate-700 truncate">{m.subject}</div>}
                  <div className="text-xs text-slate-500 truncate">{m.content}</div>
                </TableCell>
                <TableCell>
                  {m.attachment ? (
                    <button
                      onClick={() => setPreviewPayload({
                        messageId: m.id,
                        isGroup: m.type === 'group',
                        name: m.attachment?.name,
                        mime: m.attachment?.mime,
                        size: m.attachment?.size,
                      })}
                      title={`${m.attachment.name} (${fmtSize(m.attachment.size)})`}
                      className="text-blue-500 hover:text-blue-700 focus:outline-none"
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>
                  ) : null}
                </TableCell>
                <TableCell>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer ce message ?</AlertDialogTitle>
                        <AlertDialogDescription>Ce message sera supprimé définitivement de la base de données.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteMut.mutate(m.id)}>Supprimer</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={9} className="h-32 text-center text-slate-500">Aucun message trouvé.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
      <MessageAttachmentViewer payload={previewPayload} onClose={() => setPreviewPayload(null)} />
    </Card>
  );
}

// ═══════════════ Main Page ═══════════════
type TabKey = "sessions" | "alertes" | "messages";

export default function ApkHistoryPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("sessions");

  const { data: sessionsData = [], isLoading: sessionsLoading, error: sessionsError } = useQuery({
    queryKey: ['active-sessions-history'],
    queryFn: async () => {
      const res = await authenticatedFetch('/api/auth/active-sessions');
      if (!res.ok) throw new Error('Erreur de récupération des sessions');
      const data = await res.json();
      if (data?.tableMissing) return [];
      return Array.isArray(data) ? data : data?.sessions ?? [];
    },
    refetchInterval: 30000,
  });

  const { data: alertsData = [], isLoading: alertsLoading } = useQuery({
    queryKey: ["/api/superadmin/comms/alerts"],
    queryFn: () => apiRequest<AlertItem[]>({ url: "/api/superadmin/comms/alerts", method: "GET" }),
  });

  const { data: messagesData = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["/api/superadmin/comms/messages"],
    queryFn: () => apiRequest<MessageItem[]>({ url: "/api/superadmin/comms/messages", method: "GET" }),
  });

  const sessionsList: any[] = Array.isArray(sessionsData) ? sessionsData : [];
  const alertsList: AlertItem[] = Array.isArray(alertsData) ? alertsData : [];
  const messagesList: MessageItem[] = Array.isArray(messagesData) ? messagesData : [];

  const handleExportWorkbook = () => {
    exportMultiSheetExcel(
      [
        {
          name: 'Sessions APK',
          headers: ['Utilisateur', 'Identifiant', 'Rôle', 'Matricule', 'Appareil', 'Position GPS', 'Statut', 'Dernière Activité', 'Création'],
          rows: sessionsList.map((s: any) => [
            sessionDisplayName(s),
            s.username || '—',
            sessionRoleLabel(s.role) || '—',
            s.agentMatricule || '—',
            s.deviceId || 'N/A',
            s.lat && s.lon ? `${s.lat}, ${s.lon}` : 'Non disponible',
            s.isActive ? 'Active' : 'Inactive',
            fmtDate(s.lastActivity),
            fmtDate(s.createdAt),
          ]),
        },
        {
          name: 'Alertes',
          headers: ['Date', 'Nature', 'Titre', 'Message', 'Agent', 'Matricule', 'Grade', 'Rôle Métier', 'Service', "Lieu d'envoi"],
          rows: alertsList.map((a) => [
            fmtDate(a.createdAt),
            natureLabels[a.nature] || a.nature,
            a.title || '—',
            a.message || '—',
            agentName(a.sender),
            a.sender?.matricule || '—',
            a.sender?.grade || '—',
            a.sender?.roleMetier || '—',
            a.sender?.region || '—',
            [a.commune, a.arrondissement, a.departement, a.region].filter(Boolean).join(', ') || '—',
          ]),
        },
        {
          name: 'Messages',
          headers: ['Date', 'Expéditeur', 'Matricule', 'Rôle Métier', 'Service', 'Destinataire', 'Type', 'Objet', 'Contenu', 'Pièce jointe'],
          rows: messagesList.map((m) => [
            fmtDate(m.createdAt),
            agentName(m.sender),
            m.sender?.matricule || '—',
            m.sender?.roleMetier || '—',
            m.sender?.serviceLocation || '—',
            agentName(m.recipient),
            m.type === 'group' ? 'Groupe' : 'Individuel',
            m.subject || '—',
            m.content || '',
            m.attachment ? `${m.attachment.name} (${fmtSize(m.attachment.size)})` : 'Aucune',
          ]),
        },
      ],
      `audit_apk_complet_${format(new Date(), 'yyyy-MM-dd')}.xls`
    );
    toast({
      title: 'Classeur exporté',
      description: 'Export complet généré avec 3 onglets : Sessions APK, Alertes et Messages.',
    });
  };

  const tabs: { key: TabKey; label: string; count: number; icon: React.ReactNode }[] = [
    { key: "sessions", label: "Sessions APK", count: sessionsList.length, icon: <Activity className="h-4 w-4" /> },
    { key: "alertes", label: "Alertes", count: alertsList.length, icon: <Bell className="h-4 w-4" /> },
    { key: "messages", label: "Messages", count: messagesList.length, icon: <MessageSquare className="h-4 w-4" /> },
  ];

  return (
    <div className="w-full min-w-0 mx-auto p-2 sm:p-4 md:p-8 max-w-7xl flex flex-col min-h-[calc(100dvh-110px)] md:h-[calc(100dvh-80px)]">
      {/* Header avec bouton unique d'export classeur multi-onglets */}
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
            <Shield className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Audit APK &amp; Alertes</h1>
            <p className="text-xs sm:text-sm opacity-75">Suivi des sessions actives, alertes et messages du système</p>
          </div>
        </div>

        <Button
          type="button"
          onClick={handleExportWorkbook}
          className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white shrink-0 self-start sm:self-auto"
          size="sm"
        >
          <Download className="h-4 w-4" />
          Exporter tout (Classeur 3 onglets)
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-muted p-1 rounded-xl w-full sm:w-fit overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-200 ${
              activeTab === t.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/60"
            }`}
          >
            {t.icon}
            {t.label}
            <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-slate-200/80 text-slate-700">
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 min-w-0 flex flex-col">
        {activeTab === "sessions" && <SessionsTab sessions={sessionsList} isLoading={sessionsLoading} error={sessionsError} />}
        {activeTab === "alertes" && <AlertesTab alerts={alertsList} isLoading={alertsLoading} />}
        {activeTab === "messages" && <MessagesTab messages={messagesList} isLoading={messagesLoading} />}
      </div>
    </div>
  );
}
