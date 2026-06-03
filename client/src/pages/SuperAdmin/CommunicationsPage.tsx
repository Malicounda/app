import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Download, FileText, MessageSquare, Paperclip, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

type AlertItem = {
  id: number; title: string; message: string; nature: string;
  region: string | null; departement: string | null; arrondissement: string | null; commune: string | null;
  lat: number | null; lon: number | null; createdAt: string;
  sender: {
    username: string; firstName: string | null; lastName: string | null;
    role: string; region: string | null; departement: string | null;
    matricule: string | null; serviceLocation: string | null;
    grade: string | null; roleMetier: string | null; roleMetierCode: string | null;
  };
};

type MessageItem = {
  id: number; subject: string | null; content: string; type: string;
  isRead: boolean; createdAt: string;
  attachment: { path: string; name: string; mime: string; size: number } | null;
  sender: { id: number; username: string; firstName: string | null; lastName: string | null; role: string; region: string | null; departement: string | null; matricule: string | null; serviceLocation: string | null; grade: string | null; roleMetier: string | null };
  recipient: { id: number; username: string; firstName: string | null; lastName: string | null; role: string; region: string | null; departement: string | null; matricule: string | null; serviceLocation: string | null; grade: string | null; roleMetier: string | null };
};

const natureLabels: Record<string, string> = {
  braconnage: "Braconnage", feux_de_brousse: "Feux de brousse", "trafic-bois": "Trafic de bois", trafic_bois: "Trafic de bois", autre: "Autre",
};
const natureColors: Record<string, string> = {
  braconnage: "bg-red-100 text-red-700", feux_de_brousse: "bg-orange-100 text-orange-700", "trafic-bois": "bg-amber-100 text-amber-800", trafic_bois: "bg-amber-100 text-amber-800", autre: "bg-gray-100 text-gray-700",
};

function agentDisplay(s: any) {
  if (!s) return "—";
  const name = [s.grade, s.firstName, s.lastName].filter(Boolean).join(" ") || s.username || s.matricule || "—";
  return name;
}

function formatDate(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " + dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + " o";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " Ko";
  return (bytes / 1048576).toFixed(1) + " Mo";
}

// ════════════════════════════════════════════════════════
// Alerts Tab
// ════════════════════════════════════════════════════════
function AlertsTab() {
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
      (a.title || "").toLowerCase().includes(q) ||
      (a.nature || "").toLowerCase().includes(q) ||
      (a.sender?.lastName || "").toLowerCase().includes(q) ||
      (a.sender?.firstName || "").toLowerCase().includes(q) ||
      (a.sender?.matricule || "").toLowerCase().includes(q) ||
      (a.region || "").toLowerCase().includes(q) ||
      (a.departement || "").toLowerCase().includes(q)
    );
  }, [data, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Rechercher (titre, nature, agent, région...)" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <span className="text-sm text-gray-500">{rows.length} alerte(s)</span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-teal-500" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Aucune alerte trouvée</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#1a2332]">
                <TableHead className="text-slate-300 min-w-[140px]">Date</TableHead>
                <TableHead className="text-slate-300">Nature</TableHead>
                <TableHead className="text-slate-300">Titre / Message</TableHead>
                <TableHead className="text-slate-300">Agent</TableHead>
                <TableHead className="text-slate-300">Rôle Métier</TableHead>
                <TableHead className="text-slate-300">Service</TableHead>
                <TableHead className="text-slate-300">Lieu</TableHead>
                <TableHead className="text-slate-300 w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(a => (
                <TableRow key={a.id} className="border-gray-700 hover:bg-[#1e2a3a]">
                  <TableCell className="text-xs text-slate-300 whitespace-nowrap">{formatDate(a.createdAt)}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${natureColors[a.nature] || "bg-gray-100 text-gray-700"}`}>
                      {natureLabels[a.nature] || a.nature}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-slate-200 max-w-[220px]">
                    <div className="font-medium truncate">{a.title || "—"}</div>
                    <div className="text-xs text-slate-400 truncate">{a.message || ""}</div>
                  </TableCell>
                  <TableCell className="text-sm text-slate-200 whitespace-nowrap">{agentDisplay(a.sender)}</TableCell>
                  <TableCell className="text-xs text-teal-400">{a.sender?.roleMetier || "—"}</TableCell>
                  <TableCell className="text-xs text-slate-400 max-w-[150px] truncate">{a.sender?.serviceLocation || "—"}</TableCell>
                  <TableCell className="text-xs text-slate-400 max-w-[160px]">
                    <div className="truncate">{[a.commune, a.arrondissement, a.departement, a.region].filter(Boolean).join(", ") || "—"}</div>
                    {a.lat && a.lon && <div className="text-[10px] text-slate-500">{Number(a.lat).toFixed(4)}, {Number(a.lon).toFixed(4)}</div>}
                  </TableCell>
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-900/30">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer cette alerte ?</AlertDialogTitle>
                          <AlertDialogDescription>Cette action est irréversible. L'alerte et toutes ses notifications seront supprimées définitivement de la base de données.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteMut.mutate(a.id)}>Supprimer</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// Messages Tab
// ════════════════════════════════════════════════════════
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
      (m.content || "").toLowerCase().includes(q) ||
      (m.subject || "").toLowerCase().includes(q) ||
      (m.sender?.lastName || "").toLowerCase().includes(q) ||
      (m.sender?.firstName || "").toLowerCase().includes(q) ||
      (m.sender?.matricule || "").toLowerCase().includes(q) ||
      (m.recipient?.lastName || "").toLowerCase().includes(q) ||
      (m.recipient?.firstName || "").toLowerCase().includes(q)
    );
  }, [data, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Rechercher (contenu, expéditeur, destinataire...)" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <span className="text-sm text-gray-500">{rows.length} message(s)</span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-teal-500" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Aucun message trouvé</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#1a2332]">
                <TableHead className="text-slate-300 min-w-[130px]">Date</TableHead>
                <TableHead className="text-slate-300">Expéditeur</TableHead>
                <TableHead className="text-slate-300">Rôle Métier</TableHead>
                <TableHead className="text-slate-300">Service</TableHead>
                <TableHead className="text-slate-300">Destinataire</TableHead>
                <TableHead className="text-slate-300">Contenu</TableHead>
                <TableHead className="text-slate-300 w-[40px]"><Paperclip className="h-3.5 w-3.5" /></TableHead>
                <TableHead className="text-slate-300 w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(m => (
                <TableRow key={m.id} className="border-gray-700 hover:bg-[#1e2a3a]">
                  <TableCell className="text-xs text-slate-300 whitespace-nowrap">{formatDate(m.createdAt)}</TableCell>
                  <TableCell className="text-sm text-slate-200 whitespace-nowrap">{agentDisplay(m.sender)}</TableCell>
                  <TableCell className="text-xs text-teal-400">{m.sender?.roleMetier || "—"}</TableCell>
                  <TableCell className="text-xs text-slate-400 max-w-[120px] truncate">{m.sender?.serviceLocation || "—"}</TableCell>
                  <TableCell className="text-sm text-slate-200 whitespace-nowrap">{agentDisplay(m.recipient)}</TableCell>
                  <TableCell className="text-sm text-slate-200 max-w-[260px]">
                    {m.subject && <div className="font-medium text-xs text-slate-300 truncate">{m.subject}</div>}
                    <div className="text-xs text-slate-400 truncate">{m.content}</div>
                  </TableCell>
                  <TableCell>
                    {m.attachment ? (
                      <a href={`/uploads/${m.attachment.path}`} target="_blank" rel="noreferrer" title={`${m.attachment.name} (${formatSize(m.attachment.size)})`} className="text-teal-400 hover:text-teal-300">
                        <Paperclip className="h-4 w-4" />
                      </a>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-900/30">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer ce message ?</AlertDialogTitle>
                          <AlertDialogDescription>Cette action est irréversible. Le message sera supprimé définitivement de la base de données.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteMut.mutate(m.id)}>Supprimer</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// Main Page
// ════════════════════════════════════════════════════════
export default function CommunicationsPage() {
  const [tab, setTab] = useState<"alerts" | "messages">("alerts");

  const tabCls = (t: string) =>
    `flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
      tab === t
        ? "bg-teal-600 text-white shadow-lg shadow-teal-900/30"
        : "text-slate-400 hover:text-slate-200 hover:bg-[#1e2a3a]"
    }`;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-lg">
          <MessageSquare className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-100">Communications</h1>
          <p className="text-xs text-slate-500">Historique global des alertes et messages du système</p>
        </div>
      </div>

      <div className="flex gap-2 bg-[#131c2b] p-1.5 rounded-xl w-fit">
        <button className={tabCls("alerts")} onClick={() => setTab("alerts")}>
          <Bell className="h-4 w-4" /> Alertes
        </button>
        <button className={tabCls("messages")} onClick={() => setTab("messages")}>
          <MessageSquare className="h-4 w-4" /> Messages
        </button>
      </div>

      <Card className="bg-[#111827] border-gray-700">
        <CardContent className="p-4">
          {tab === "alerts" ? <AlertsTab /> : <MessagesTab />}
        </CardContent>
      </Card>
    </div>
  );
}
