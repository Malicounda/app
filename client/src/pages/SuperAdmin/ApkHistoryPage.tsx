import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import { apiRequest } from '@/lib/queryClient';
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
import { Shield, Activity, MapPin, Search, Bell, MessageSquare, Trash2, Paperclip } from 'lucide-react';

// ═══════════════ Types ═══════════════
type AlertItem = {
  id: number; title: string; message: string; nature: string;
  region: string | null; departement: string | null; arrondissement: string | null; commune: string | null;
  lat: number | null; lon: number | null; createdAt: string;
  sender: {
    username: string; firstName: string | null; lastName: string | null;
    role: string; region: string | null; departement: string | null;
    matricule: string | null; serviceLocation: string | null;
    grade: string | null; roleMetier: string | null;
  };
};

type MessageItem = {
  id: number; subject: string | null; content: string; type: string;
  isRead: boolean; createdAt: string;
  attachment: { path: string; name: string; mime: string; size: number } | null;
  sender: { id: number; username: string; firstName: string | null; lastName: string | null; role: string; region: string | null; departement: string | null; matricule: string | null; serviceLocation: string | null; grade: string | null; roleMetier: string | null };
  recipient: { id: number; username: string; firstName: string | null; lastName: string | null; role: string; region: string | null; departement: string | null; matricule: string | null; serviceLocation: string | null; grade: string | null; roleMetier: string | null };
};

// ═══════════════ Helpers ═══════════════
const natureLabels: Record<string, string> = { braconnage: "Braconnage", feux_de_brousse: "Feux de brousse", "trafic-bois": "Trafic de bois", trafic_bois: "Trafic de bois", autre: "Autre" };
const natureColors: Record<string, string> = { braconnage: "bg-red-100 text-red-700", feux_de_brousse: "bg-orange-100 text-orange-700", "trafic-bois": "bg-amber-100 text-amber-800", trafic_bois: "bg-amber-100 text-amber-800", autre: "bg-gray-100 text-gray-700" };

function agentName(s: any) {
  if (!s) return "—";
  return [s.grade, s.firstName, s.lastName].filter(Boolean).join(" ") || s.username || s.matricule || "—";
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

// ═══════════════ Tab: Sessions (original) ═══════════════
function SessionsTab() {
  const { data: sessions, isLoading, error } = useQuery({
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

  const [searchTerm, setSearchTerm] = useState('');

  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    if (!searchTerm) return sessions;
    const s = searchTerm.toLowerCase();
    return sessions.filter((session: any) =>
      (session.agentMatricule || '').toLowerCase().includes(s) ||
      (session.agentPrenom || '').toLowerCase().includes(s) ||
      (session.agentNom || '').toLowerCase().includes(s)
    );
  }, [sessions, searchTerm]);

  if (isLoading) return <div className="flex justify-center py-12"><Activity className="h-8 w-8 animate-spin text-orange-500" /></div>;
  if (error) return <div className="p-8 text-center text-red-500">Erreur lors du chargement.</div>;

  return (
    <Card className="border-0 shadow-lg flex flex-col flex-1 min-h-0">
      <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-slate-500" />
            Sessions Actives et Historique GPS
          </CardTitle>
          <CardDescription className="mt-1">Liste des dernières connexions et remontées GPS via l'application mobile.</CardDescription>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Rechercher (Matricule, Nom...)" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 bg-white" />
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-hidden">
        <div className="overflow-y-auto h-full">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                <TableHead className="font-semibold text-slate-700">Utilisateur</TableHead>
                <TableHead className="font-semibold text-slate-700">Appareil (Device ID)</TableHead>
                <TableHead className="font-semibold text-slate-700">Position GPS</TableHead>
                <TableHead className="font-semibold text-slate-700">Statut</TableHead>
                <TableHead className="font-semibold text-slate-700">Dernière Activité</TableHead>
                <TableHead className="font-semibold text-slate-700">Création</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSessions.length > 0 ? filteredSessions.map((session: any) => (
                <TableRow key={session.id} className="hover:bg-slate-50 transition-colors">
                  <TableCell className="font-medium text-slate-900">
                    <div>{session.agentPrenom || session.agentNom ? <span className="font-bold">{session.agentPrenom} {session.agentNom}</span> : <span>Utilisateur inconnu</span>}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{session.agentMatricule ? <span className="font-mono text-teal-600">{session.agentMatricule}</span> : <span>ID: {session.userId}</span>}</div>
                  </TableCell>
                  <TableCell className="text-slate-600 font-mono text-xs">{session.deviceId || 'N/A'}</TableCell>
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
                  <TableCell className="text-slate-600 text-sm">{session.lastActivity ? format(new Date(session.lastActivity), 'dd MMM yyyy, HH:mm', { locale: fr }) : '-'}</TableCell>
                  <TableCell className="text-slate-600 text-sm">{session.createdAt ? format(new Date(session.createdAt), 'dd MMM yyyy, HH:mm', { locale: fr }) : '-'}</TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={6} className="h-32 text-center text-slate-500">Aucune session APK enregistrée.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════ Tab: Alertes ═══════════════
function AlertesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/superadmin/comms/alerts"],
    queryFn: () => apiRequest<AlertItem[]>({ url: "/api/superadmin/comms/alerts", method: "GET" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest({ url: `/api/superadmin/comms/alerts/${id}`, method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/superadmin/comms/alerts"] }); toast({ title: "Alerte supprimée" }); },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message, variant: "destructive" }),
  });

  const rows = useMemo(() => {
    const list = Array.isArray(data) ? data : [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(a =>
      (a.title || "").toLowerCase().includes(q) || (a.nature || "").toLowerCase().includes(q) ||
      (a.sender?.lastName || "").toLowerCase().includes(q) || (a.sender?.firstName || "").toLowerCase().includes(q) ||
      (a.sender?.matricule || "").toLowerCase().includes(q) || (a.region || "").toLowerCase().includes(q) ||
      (a.departement || "").toLowerCase().includes(q)
    );
  }, [data, search]);

  if (isLoading) return <div className="flex justify-center py-12"><Activity className="h-8 w-8 animate-spin text-orange-500" /></div>;

  return (
    <Card className="border-0 shadow-lg flex flex-col flex-1 min-h-0">
      <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5 text-red-500" />
            Historique des Alertes
          </CardTitle>
          <CardDescription className="mt-1">{rows.length} alerte(s) envoyée(s) dans le système.</CardDescription>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Rechercher (nature, agent, région...)" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-white" />
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-hidden">
        <div className="overflow-y-auto h-full">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                <TableHead className="font-semibold text-slate-700 min-w-[130px]">Date</TableHead>
                <TableHead className="font-semibold text-slate-700">Nature</TableHead>
                <TableHead className="font-semibold text-slate-700">Titre / Message</TableHead>
                <TableHead className="font-semibold text-slate-700">Agent</TableHead>
                <TableHead className="font-semibold text-slate-700">Rôle Métier</TableHead>
                <TableHead className="font-semibold text-slate-700">Service</TableHead>
                <TableHead className="font-semibold text-slate-700">Lieu d'envoi</TableHead>
                <TableHead className="font-semibold text-slate-700 w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length > 0 ? rows.map(a => (
                <TableRow key={a.id} className="hover:bg-slate-50 transition-colors">
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
                  <TableCell className="text-xs text-teal-700 font-medium">{a.sender?.roleMetier || "—"}</TableCell>
                  <TableCell className="text-xs text-slate-500 max-w-[140px] truncate">{a.sender?.serviceLocation || "—"}</TableCell>
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
                          <AlertDialogDescription>Suppression irréversible de l'alerte et de toutes ses notifications associées.</AlertDialogDescription>
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
                <TableRow><TableCell colSpan={8} className="h-32 text-center text-slate-500">Aucune alerte trouvée.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════ Tab: Messages ═══════════════
function MessagesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/superadmin/comms/messages"],
    queryFn: () => apiRequest<MessageItem[]>({ url: "/api/superadmin/comms/messages", method: "GET" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest({ url: `/api/superadmin/comms/messages/${id}`, method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/superadmin/comms/messages"] }); toast({ title: "Message supprimé" }); },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message, variant: "destructive" }),
  });

  const rows = useMemo(() => {
    const list = Array.isArray(data) ? data : [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(m =>
      (m.content || "").toLowerCase().includes(q) || (m.subject || "").toLowerCase().includes(q) ||
      (m.sender?.lastName || "").toLowerCase().includes(q) || (m.sender?.firstName || "").toLowerCase().includes(q) ||
      (m.sender?.matricule || "").toLowerCase().includes(q) ||
      (m.recipient?.lastName || "").toLowerCase().includes(q) || (m.recipient?.firstName || "").toLowerCase().includes(q)
    );
  }, [data, search]);

  if (isLoading) return <div className="flex justify-center py-12"><Activity className="h-8 w-8 animate-spin text-orange-500" /></div>;

  return (
    <Card className="border-0 shadow-lg flex flex-col flex-1 min-h-0">
      <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-blue-500" />
            Historique des Messages
          </CardTitle>
          <CardDescription className="mt-1">{rows.length} message(s) échangé(s) dans le système.</CardDescription>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Rechercher (contenu, expéditeur, destinataire...)" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-white" />
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-hidden">
        <div className="overflow-y-auto h-full">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                <TableHead className="font-semibold text-slate-700 min-w-[130px]">Date</TableHead>
                <TableHead className="font-semibold text-slate-700">Expéditeur</TableHead>
                <TableHead className="font-semibold text-slate-700">Rôle Métier</TableHead>
                <TableHead className="font-semibold text-slate-700">Service</TableHead>
                <TableHead className="font-semibold text-slate-700">Destinataire</TableHead>
                <TableHead className="font-semibold text-slate-700">Contenu</TableHead>
                <TableHead className="font-semibold text-slate-700 w-[40px]"><Paperclip className="h-3.5 w-3.5" /></TableHead>
                <TableHead className="font-semibold text-slate-700 w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length > 0 ? rows.map(m => (
                <TableRow key={m.id} className="hover:bg-slate-50 transition-colors">
                  <TableCell className="text-sm text-slate-600 whitespace-nowrap">{fmtDate(m.createdAt)}</TableCell>
                  <TableCell className="text-sm text-slate-900 whitespace-nowrap">{agentName(m.sender)}</TableCell>
                  <TableCell className="text-xs text-teal-700 font-medium">{m.sender?.roleMetier || "—"}</TableCell>
                  <TableCell className="text-xs text-slate-500 max-w-[120px] truncate">{m.sender?.serviceLocation || "—"}</TableCell>
                  <TableCell className="text-sm text-slate-900 whitespace-nowrap">{agentName(m.recipient)}</TableCell>
                  <TableCell className="max-w-[260px]">
                    {m.subject && <div className="font-medium text-xs text-slate-700 truncate">{m.subject}</div>}
                    <div className="text-xs text-slate-500 truncate">{m.content}</div>
                  </TableCell>
                  <TableCell>
                    {m.attachment ? (
                      <a href={`/uploads/${m.attachment.path}`} target="_blank" rel="noreferrer" title={`${m.attachment.name} (${fmtSize(m.attachment.size)})`} className="text-blue-500 hover:text-blue-700">
                        <Paperclip className="h-4 w-4" />
                      </a>
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
                <TableRow><TableCell colSpan={8} className="h-32 text-center text-slate-500">Aucun message trouvé.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════ Main Page ═══════════════
type TabKey = "sessions" | "alertes" | "messages";

export default function ApkHistoryPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("sessions");

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "sessions", label: "Sessions APK", icon: <Activity className="h-4 w-4" /> },
    { key: "alertes", label: "Alertes", icon: <Bell className="h-4 w-4" /> },
    { key: "messages", label: "Messages", icon: <MessageSquare className="h-4 w-4" /> },
  ];

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-7xl flex flex-col h-[calc(100vh-80px)]">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
          <Shield className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Audit APK & Alertes</h1>
          <p className="text-sm text-slate-500">Suivi des sessions actives, alertes et messages du système</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-xl w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              activeTab === t.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {activeTab === "sessions" && <SessionsTab />}
        {activeTab === "alertes" && <AlertesTab />}
        {activeTab === "messages" && <MessagesTab />}
      </div>
    </div>
  );
}
