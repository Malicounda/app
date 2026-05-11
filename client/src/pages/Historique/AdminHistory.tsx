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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { Hunter } from "@/types/hunters";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertCircle, AlertTriangle, Banknote, Calendar, Clock, Download, Edit, Eye, Filter, PenTool, Scale, Search, Send, ShieldAlert, Trash, Upload, UserIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface HistoryEvent {
  id: number;
  operation: string;
  entityType: string;
  entityId: number;
  details: string;
  userId: number | null;
  createdAt: string;
}

interface UserShort {
  id: number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

/* ── Infractions Journal ─────────────────────────────────────────────── */
function InfractionsJournal({ page, setPage, perPage }: { page: number; setPage: (p: number) => void; perPage: number }) {
  const { data: infractions, isLoading } = useQuery<any[]>({
    queryKey: ["/api/infractions/infractions"],
    queryFn: () => apiRequest({ url: "/api/infractions/infractions", method: "GET" }),
  });

  const [searchInfraction, setSearchInfraction] = useState("");

  const filtered = useMemo(() => {
    if (!infractions) return [];
    if (!searchInfraction) return infractions;
    const q = searchInfraction.toLowerCase();
    return infractions.filter((inf: any) => {
      const contrevenants = (inf.contrevenants || []) as any[];
      const contStr = contrevenants.map((c: any) => `${c.nom || ""} ${c.prenom || ""} ${c.numero_piece || ""}`).join(" ").toLowerCase();
      const nature = (inf.item_nature || inf.code || "").toLowerCase();
      const agent = `${inf.agent_nom || ""} ${inf.agent_prenom || ""}`.toLowerCase();
      const lieu = `${inf.region || ""} ${inf.departement || ""} ${inf.commune || ""}`.toLowerCase();
      const quittance = (inf.numero_quittance || "").toLowerCase();
      return contStr.includes(q) || nature.includes(q) || agent.includes(q) || lieu.includes(q) || quittance.includes(q);
    });
  }, [infractions, searchInfraction]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * perPage;
  const paginated = filtered.slice(startIdx, startIdx + perPage);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Input
          placeholder="Rechercher (contrevenant, nature, agent, lieu…)"
          value={searchInfraction}
          onChange={(e) => { setSearchInfraction(e.target.value); setPage(1); }}
          className="max-w-sm"
        />
        <div className="text-sm text-gray-600">{filtered.length} infraction(s)</div>
      </div>

      <div className="border rounded-md overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="py-3 px-4 text-left font-medium">Date</th>
              <th className="py-3 px-4 text-left font-medium">Contrevenant</th>
              <th className="py-3 px-4 text-left font-medium">Pièce d'identité</th>
              <th className="py-3 px-4 text-left font-medium">Montant</th>
              <th className="py-3 px-4 text-left font-medium">N° Quittance</th>
              <th className="py-3 px-4 text-left font-medium">Nature infraction</th>
              <th className="py-3 px-4 text-left font-medium">Agent verbalisateur</th>
              <th className="py-3 px-4 text-left font-medium">Lieu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              <tr><td colSpan={8} className="py-8 text-center text-gray-500">Chargement des infractions…</td></tr>
            ) : paginated.length === 0 ? (
              <tr><td colSpan={8} className="py-8 text-center text-gray-500">Aucune infraction trouvée</td></tr>
            ) : (
              paginated.map((inf: any) => {
                const contrevenants = (inf.contrevenants || []) as any[];
                const contNames = contrevenants.map((c: any) => `${c.nom || "-"} ${c.prenom || ""}`.trim()).join(", ") || "-";
                const contPiece = contrevenants.map((c: any) => `${c.type_piece || ""} ${c.numero_piece || ""}`.trim()).join(", ") || "-";
                const lieu = [inf.region, inf.departement, inf.commune].filter(Boolean).join(" / ") || "-";
                const dateInf = inf.date_infraction ? format(new Date(inf.date_infraction), "dd/MM/yyyy", { locale: fr }) : "-";
                const montant = inf.montant_chiffre ? Number(inf.montant_chiffre).toLocaleString("fr-FR") + " FCFA" : "-";
                const agentVerb = [inf.agent_prenom, inf.agent_nom].filter(Boolean).join(" ") || inf.created_by_prenom && inf.created_by_nom ? `${inf.created_by_prenom} ${inf.created_by_nom}` : "-";
                const nature = inf.item_nature || inf.code || "-";
                return (
                  <tr key={inf.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-gray-500" />
                        <span>{dateInf}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <UserIcon className="h-4 w-4 text-gray-500" />
                        <span>{contNames}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-700">{contPiece}</td>
                    <td className="py-3 px-4 font-semibold text-gray-800">{montant}</td>
                    <td className="py-3 px-4 text-gray-700">{inf.numero_quittance || "-"}</td>
                    <td className="py-3 px-4">
                      <Badge className="bg-red-100 text-red-800">{nature}</Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <Scale className="h-4 w-4 text-indigo-600" />
                        <span>{agentVerb}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-700">{lieu}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <Button variant="outline" size="sm" onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage <= 1}>
            Précédent
          </Button>
          <span className="text-sm text-gray-600">Page {safePage} / {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(Math.min(totalPages, safePage + 1))} disabled={safePage >= totalPages}>
            Suivant
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AdminHistory() {
  const ALL_OPERATIONS_VALUE = "__ALL_OPERATIONS__";
  const ALL_ENTITY_TYPES_VALUE = "__ALL_ENTITY_TYPES__";

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOperation, setSelectedOperation] = useState<string>("");
  const [selectedEntityType, setSelectedEntityType] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [currentTab, setCurrentTab] = useState("user");
  const [currentPage, setCurrentPage] = useState(1);
  const [infractionPage, setInfractionPage] = useState(1);
  const itemsPerPage = 10;
  const infractionItemsPerPage = 12;
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"single" | "bulk">("bulk");
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);



  const { data, isLoading: isHistoryLoading, refetch: refetchHistory } = useQuery<HistoryEvent[] | { data: HistoryEvent[] }>({
    queryKey: ["/api/history"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Charger les chasseurs (pour résoudre les ID -> Nom/Prénom dans les détails)
  const { data: huntersData = [] } = useQuery<Hunter[]>({
    queryKey: ["/api/hunters/all"],
    enabled: currentTab === 'hunter',
    queryFn: async () => {
      const resp: any = await apiRequest({ url: '/api/hunters/all', method: 'GET' });
      return Array.isArray(resp) ? resp : (resp?.data || []);
    },
    refetchOnWindowFocus: false,
  });
  const systemHistory: HistoryEvent[] = Array.isArray(data)
    ? data
    : (data && Array.isArray((data as any).data) ? (data as any).data : []);
  console.log('[AdminHistory] Raw systemHistory:', systemHistory);

  // Obtenir les opérations uniques pour le filtre
  // Utility to filter only valid, non-empty strings
function isNonEmptyString(val: unknown): val is string {
  return typeof val === "string" && val.trim().length > 0;
}

// Obtenir les opérations uniques pour le filtre, en excluant tout ce qui n'est pas une string non vide
const uniqueOperations = Array.from(
  new Set((systemHistory as HistoryEvent[])
    .map((event) => event.operation)
    .filter(isNonEmptyString))
);
console.log('[AdminHistory] Unique Operations:', uniqueOperations);

// Obtenir les types d'entités uniques pour le filtre, en excluant tout ce qui n'est pas une string non vide
const uniqueEntityTypes = Array.from(
  new Set((systemHistory as HistoryEvent[])
    .map((event) => event.entityType)
    .filter(isNonEmptyString))
);
console.log('[AdminHistory] Unique Entity Types:', uniqueEntityTypes);

// (DEBUG VISUEL supprimé, car la nouvelle logique garantit l'absence de valeurs invalides)


  // Filtrer les événements selon les critères
  const filteredHistory = (systemHistory as HistoryEvent[]).filter((event) => {
    // Filtrer par opération si une opération est sélectionnée
    if (selectedOperation && selectedOperation !== ALL_OPERATIONS_VALUE && event.operation !== selectedOperation) {
      return false;
    }

    // Filtrer par type d'entité si un type est sélectionné
    if (selectedEntityType && selectedEntityType !== ALL_ENTITY_TYPES_VALUE && event.entityType !== selectedEntityType) {
      return false;
    }

    // Filtrer par date si une date est sélectionnée
    if (selectedDate) {
      const eventDate = new Date(event.createdAt).toISOString().split('T')[0];
      if (eventDate !== selectedDate) {
        return false;
      }
    }

    // Filtrer par texte de recherche
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        event.details.toLowerCase().includes(query) ||
        (event.userId ? String(event.userId).includes(query) : false) ||
        event.operation.toLowerCase().includes(query) ||
        event.entityType.toLowerCase().includes(query)
      );
    }

    // Filtrer par onglet
    // Onglets simples : correspondance exacte sur entityType
    if (["user", "agent", "hunter"].includes(currentTab)) {
      if (currentTab === "agent") {
        // Agent : entityType=user avec operation create/update/activate/suspend liées aux agents
        return event.entityType === "user" && ["create", "update", "activate", "suspend", "delete"].includes(event.operation);
      }
      return event.entityType === currentTab;
    }
    // Onglet Recettes : taxes d'abattage, permis (create/renew), paiements
    if (currentTab === "recettes") {
      const isRevenueType = ["tax", "revenue", "payment"].includes(event.entityType);
      const isPermitRevenue = event.entityType === "permit" && ["create", "renew"].includes(event.operation);
      const isRevenueOp = ["payment", "renew"].includes(event.operation);
      const isRevenueDetail = /revenue|tax|payment|receipt|transaction|taxe|montant|quittance|prix|price/i.test(event.details || "");
      return isRevenueType || isPermitRevenue || isRevenueOp || isRevenueDetail;
    }
    // Onglet Reboisement
    if (currentTab === "reboisement") {
      return event.entityType === "reboisement" || /reboisement|pépinière|plantation|reforestation|cnr/i.test(event.entityType + " " + event.details);
    }
    // Onglet Erreurs & Audit : connexions, erreurs, actions système
    if (currentTab === "errors") {
      const isErrorOp = ["login", "login_failed", "error", "activate", "suspend", "suspend_profile", "activate_profile"].includes(event.operation);
      const isSystemType = event.entityType === "system" || event.entityType === "auth";
      const isErrorDetail = /erreur|error|échec|fail|refusé|invalid|impossible/i.test(event.details || "");
      return isErrorOp || isSystemType || isErrorDetail;
    }

    return true;
  });
  console.log('[AdminHistory] Filtered History:', filteredHistory);

  const sortedHistory = filteredHistory.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const totalPages = Math.max(1, Math.ceil(sortedHistory.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, sortedHistory.length);
  const paginatedHistory = sortedHistory.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedOperation, selectedEntityType, selectedDate, currentTab]);

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  // Sélectionner/désélectionner un événement
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelectedOnPage = paginatedHistory.length > 0 && paginatedHistory.every((e) => selectedIds.has(e.id));

  const selectAllVisible = () => {
    const allSelectedOnPage = paginatedHistory.length > 0 && paginatedHistory.every((e) => selectedIds.has(e.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelectedOnPage) {
        paginatedHistory.forEach((e) => next.delete(e.id));
      } else {
        paginatedHistory.forEach((e) => next.add(e.id));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const requestDeleteById = (id: number) => {
    setConfirmMode("single");
    setPendingDeleteId(id);
    setIsConfirmOpen(true);
  };

  const requestDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    setConfirmMode("bulk");
    setPendingDeleteId(null);
    setIsConfirmOpen(true);
  };

  const confirmDeletion = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      if (confirmMode === "single") {
        if (!pendingDeleteId) return;
        await apiRequest({ url: `/api/history/${pendingDeleteId}`, method: 'DELETE' });
      } else {
        const ids = Array.from(selectedIds);
        await Promise.all(ids.map((id) => apiRequest({ url: `/api/history/${id}`, method: 'DELETE' })));
      }
      await refetchHistory();
      clearSelection();
    } catch (err) {
      console.error('Delete failed', err);
      alert('Suppression impossible. Voir console pour détails.');
    } finally {
      setIsDeleting(false);
      setIsConfirmOpen(false);
      setPendingDeleteId(null);
    }
  };

  // Charger la liste des utilisateurs pour afficher les noms
  const { data: usersData = [] } = useQuery<UserShort[]>({
    queryKey: ['/api/users', { limit: 1000 }],
    queryFn: async () => {
      try {
        const resp: any = await apiRequest({ url: '/api/users?limit=1000', method: 'GET' });
        if (Array.isArray(resp)) return resp;
        if (resp && Array.isArray(resp.data)) return resp.data;
      } catch (err) {
        console.warn('[AdminHistory] failed to load users list', err);
      }
      return [];
    },
    refetchOnWindowFocus: false,
  });

  // Map rapide id -> display name
  const usersMap = new Map<number, string>();
  (usersData || []).forEach((u) => {
    const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
    usersMap.set(u.id, name || (u.username ? String(u.username) : `ID: ${u.id}`));
  });

  const huntersMap = new Map<number, string>();
  (huntersData || []).forEach((h) => {
    const name = [h.firstName, h.lastName].filter(Boolean).join(' ').trim();
    if (name) huntersMap.set(h.id, name);
  });

  const formatDetails = (ev: HistoryEvent) => {
    const raw = String(ev.details || '');
    if (!raw) return raw;

    // Remplacer "utilisateur ID 123" ou "utilisateur ID: 123" par "utilisateur Nom Prénom" si possible
    const withUsers = raw.replace(/(utilisateur\s+)(?:ID\s*:?\s*)(\d+)/gi, (_m, p1: string, idStr: string) => {
      const id = Number(idStr);
      const name = usersMap.get(id);
      return name ? `${p1}${name} (ID: ${idStr})` : `${p1}ID ${idStr}`;
    });

    // Remplacer "chasseur ... ID 123" par "chasseur ... Nom Prénom" si possible
    const withHunters = withUsers.replace(/(chasseur[^\d]{0,30})(?:ID\s*:?\s*)(\d+)/gi, (_m, p1: string, idStr: string) => {
      const id = Number(idStr);
      const name = huntersMap.get(id);
      return name ? `${p1}${name} (ID: ${idStr})` : `${p1}ID ${idStr}`;
    });

    // Cas "Chasseur supprimé: ID 97" / "Utilisateur supprimé: ID 172"
    const withDeletedLabel = withHunters
      .replace(/(Utilisateur\s+supprim[ée]\s*:\s*)(?:ID\s*:?\s*)(\d+)/gi, (_m, p1: string, idStr: string) => {
        const id = Number(idStr);
        const name = usersMap.get(id);
        return name ? `${p1}${name} (ID: ${idStr})` : `${p1}ID ${idStr}`;
      })
      .replace(/(Chasseur\s+supprim[ée]\s*:\s*)(?:ID\s*:?\s*)(\d+)/gi, (_m, p1: string, idStr: string) => {
        const id = Number(idStr);
        const name = huntersMap.get(id);
        return name ? `${p1}${name} (ID: ${idStr})` : `${p1}ID ${idStr}`;
      });

    return withDeletedLabel;
  };

  const extractActor = (ev: HistoryEvent) => {
    if (ev.userId && usersMap.has(ev.userId)) return usersMap.get(ev.userId);
    // tenter d'extraire depuis details
    try {
      const parsed = JSON.parse(ev.details);
      if (parsed && parsed.actorName) return parsed.actorName;
    } catch (e) {
      // ignore
    }
    return ev.userId ? `ID: ${ev.userId}` : 'Système';
  };

  // Safe JSON parse for details
  const parseDetailsJSON = (ev: HistoryEvent): any | null => {
    if (!ev.details) return null;
    try {
      return JSON.parse(ev.details);
    } catch (e) {
      return null;
    }
  };

  // Extraire les informations pertinentes pour les revenus / taxes
  const parseRevenueInfo = (ev: HistoryEvent) => {
    const parsed = parseDetailsJSON(ev) || {};
    const amount = parsed.amount ?? parsed.montant ?? parsed.total ?? parsed.value ?? parsed.taxAmount ?? parsed.paidAmount;
    const receiptNumber = parsed.receiptNumber ?? parsed.quittance ?? parsed.numeroQuittance ?? parsed.receipt_no ?? parsed.receiptId ?? parsed.voucher;
    const agentId = parsed.agentId ?? parsed.issuerId ?? parsed.issuedBy ?? null;
    const agentName = parsed.agentName ?? parsed.issuerName ?? parsed.issuedByName ?? parsed.agent ?? (agentId && usersMap.has(agentId) ? usersMap.get(agentId) : undefined);
    const currency = parsed.currency ?? parsed.devise ?? 'XOF';
    const transactionId = parsed.transactionId ?? parsed.txnId ?? parsed.paymentId ?? parsed.id;
    return { amount, receiptNumber, agentId, agentName, currency, transactionId, parsed };
  };

  const formatCurrency = (value: any, currency?: string) => {
    if (value == null || value === '') return null;
    const num = Number(value);
    if (Number.isNaN(num)) return String(value);
    try {
      return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency || 'XOF' }).format(num);
    } catch (e) {
      return `${num.toLocaleString('fr-FR')} ${currency || 'XOF'}`;
    }
  };

  // Fonction pour obtenir une couleur de badge en fonction du type d'entité
  const getEntityTypeColor = (entityType: string) => {
    switch (entityType) {
      case "permit":
        return "bg-blue-100 text-blue-800";
      case "user":
        return "bg-purple-100 text-purple-800";
      case "agent":
        return "bg-violet-100 text-violet-800";
      case "hunter":
        return "bg-amber-100 text-amber-800";
      case "system":
        return "bg-gray-100 text-gray-800";
      case "revenue":
        return "bg-green-100 text-green-800";
      case "tax":
        return "bg-emerald-100 text-emerald-800";
      case "payment":
        return "bg-lime-100 text-lime-800";
      case "reboisement":
        return "bg-teal-100 text-teal-800";
      case "auth":
        return "bg-rose-100 text-rose-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Fonction pour obtenir une icône en fonction de l'opération
  const getOperationIcon = (operation: string) => {
    switch (operation) {
      case "create":
        return <PenTool className="h-4 w-4 text-green-600" />;
      case "update":
        return <Edit className="h-4 w-4 text-blue-600" />;
      case "delete":
        return <Trash className="h-4 w-4 text-red-600" />;
      case "view":
        return <Eye className="h-4 w-4 text-purple-600" />;
      case "download":
        return <Download className="h-4 w-4 text-indigo-600" />;
      case "upload":
        return <Upload className="h-4 w-4 text-teal-600" />;
      case "send":
        return <Send className="h-4 w-4 text-cyan-600" />;
      case "payment":
        return <Banknote className="h-4 w-4 text-emerald-600" />;
      case "suspend":
        return <ShieldAlert className="h-4 w-4 text-amber-600" />;
      case "login":
        return <UserIcon className="h-4 w-4 text-indigo-600" />;
      case "login_failed":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case "activate":
        return <ShieldAlert className="h-4 w-4 text-green-600" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-600" />;
    }
  };

  // Fonction pour formater le nom de l'opération
  const getOperationName = (operation: string) => {
    switch (operation) {
      case "create":
        return "Création";
      case "update":
        return "Modification";
      case "delete":
        return "Suppression";
      case "view":
        return "Consultation";
      case "download":
        return "Téléchargement";
      case "upload":
        return "Importation";
      case "send":
        return "Envoi";
      case "payment":
        return "Paiement";
      case "suspend":
        return "Suspension";
      case "login":
        return "Connexion";
      case "login_failed":
        return "Échec de connexion";
      case "error":
        return "Erreur";
      case "activate":
        return "Activation";
      case "activate_profile":
        return "Activation profil";
      case "suspend_profile":
        return "Suspension profil";
      case "reactivate":
        return "Réactivation";
      case "renew":
        return "Renouvellement";
      case "create_hunter":
        return "Création chasseur";
      case "complete_hunter_profile":
        return "Complétion profil";
      case "delete_all":
        return "Suppression groupée";
      case "batch_delete":
        return "Suppression par lot";
      default:
        return operation;
    }
  };

  // Fonction pour formater le nom du type d'entité
  const getEntityTypeName = (entityType: string) => {
    switch (entityType) {
      case "permit":
        return "Permis";
      case "user":
        return "Utilisateur";
      case "agent":
        return "Agent";
      case "hunter":
        return "Chasseur";
      case "system":
        return "Système";
      case "revenue":
        return "Revenu";
      case "tax":
        return "Taxe";
      case "payment":
        return "Paiement";
      case "reboisement":
        return "Reboisement";
      case "auth":
        return "Authentification";
      default:
        return entityType;
    }
  };

  return (
    <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Historique du système</h1>
        </div>

      <Card className="overflow-hidden border-0 shadow-md">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 border-b">
          <CardTitle>Activités du système</CardTitle>
          <CardDescription>
            Consultez l'historique des actions effectuées sur la plateforme
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
                <AlertDialogDescription>
                  {confirmMode === 'single'
                    ? "Voulez-vous vraiment supprimer cet élément d'historique ?"
                    : `Voulez-vous vraiment supprimer ${selectedIds.size} élément(s) d'historique ?`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDeletion} disabled={isDeleting}>
                  {isDeleting ? 'Suppression...' : 'Confirmer'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex flex-1 items-center relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher dans l'historique..."
                className="pl-10"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="w-full sm:w-44">
                <Select
                  value={selectedOperation}
                  onValueChange={setSelectedOperation}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Opération" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_OPERATIONS_VALUE}>Toutes les opérations</SelectItem>
                    {/* {uniqueOperations.map((op) => (
                      <SelectItem key={op} value={op}>
                        {getOperationName(op)}
                      </SelectItem>
                    ))} */}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-44">
                <Select
                  value={selectedEntityType}
                  onValueChange={setSelectedEntityType}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Type d'entité" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_ENTITY_TYPES_VALUE}>Tous les types</SelectItem>
                    {uniqueEntityTypes.map((type) => (
  <SelectItem key={type} value={type}>
    {getEntityTypeName(type)}
  </SelectItem>
))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-48">
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              {(selectedOperation || selectedEntityType || selectedDate || searchQuery) && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSelectedOperation("");
                    setSelectedEntityType("");
                    setSelectedDate("");
                    setSearchQuery("");
                  }}
                  className="flex items-center gap-1"
                >
                  <Filter className="h-4 w-4" />
                  Réinitialiser
                </Button>
              )}
            </div>
          </div>

          <Tabs
            defaultValue="user"
            value={currentTab}
            onValueChange={setCurrentTab}
            className="mb-4"
          >
            <div className="flex items-center justify-between gap-3">
              <TabsList className="flex-wrap">
                <TabsTrigger value="user">Utilisateurs</TabsTrigger>
                <TabsTrigger value="agent">Agents</TabsTrigger>
                <TabsTrigger value="hunter">Chasseurs</TabsTrigger>
                <TabsTrigger value="recettes">Recettes</TabsTrigger>
                <TabsTrigger value="reboisement">Reboisement</TabsTrigger>
                <TabsTrigger value="infractions">Infractions</TabsTrigger>
                <TabsTrigger value="errors">Erreurs & Audit</TabsTrigger>
              </TabsList>

              {currentTab !== 'infractions' && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safeCurrentPage <= 1}
                >
                  Précédent
                </Button>
                <div className="text-sm text-gray-600 whitespace-nowrap">
                  Page {safeCurrentPage} / {totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safeCurrentPage >= totalPages}
                >
                  Suivant
                </Button>
              </div>
              )}
            </div>
          </Tabs>

          {currentTab === 'infractions' ? (
            <InfractionsJournal page={infractionPage} setPage={setInfractionPage} perPage={infractionItemsPerPage} />
          ) : (<>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={selectAllVisible}>
                  {allSelectedOnPage ? "Désélectionner tout" : "Sélectionner tout"}
                </Button>
                <Button size="sm" variant="destructive" onClick={requestDeleteSelected} disabled={selectedIds.size === 0 || isDeleting}>
                  {isDeleting ? 'Suppression...' : `Supprimer (${selectedIds.size})`}
                </Button>
              </div>
              <div className="text-sm text-gray-600">{filteredHistory.length} événement(s)</div>
            </div>

            <div className="border rounded-md overflow-x-auto">
              <table className="w-full min-w-[800px] text-sm">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="py-3 px-4 text-left font-medium w-12">
                      {/* intentionally empty: no select-all checkbox in header */}
                    </th>
                    <th className="py-3 px-6 text-left font-medium">Date</th>
                    <th className="py-3 px-6 text-left font-medium">Opération</th>
                    <th className="py-3 px-6 text-left font-medium">Type</th>
                    <th className="py-3 px-6 text-left font-medium">Acteur</th>
                    <th className="py-3 px-6 text-left font-medium">Détails</th>
                    <th className="py-3 px-6 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paginatedHistory.length > 0 ? (
                    paginatedHistory.map((event) => (
                        <tr key={event.id} className="hover:bg-gray-50">
                          <td className="py-4 px-4 whitespace-nowrap">
                            <input type="checkbox" checked={selectedIds.has(event.id)} onChange={() => toggleSelect(event.id)} />
                          </td>
                          <td className="py-4 px-6 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-4 w-4 text-gray-500" />
                              <span className="text-gray-800">
                                {format(new Date(event.createdAt), "dd/MM/yyyy à HH:mm", {locale: fr})}
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-1.5">
                              {getOperationIcon(event.operation)}
                              <span>{getOperationName(event.operation)}</span>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <Badge className={getEntityTypeColor(event.entityType)}>
                              {getEntityTypeName(event.entityType)}
                            </Badge>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-1.5">
                              <UserIcon className="h-4 w-4 text-gray-500" />
                              <span className="text-sm text-gray-800">{extractActor(event)}</span>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            {/* Si c'est un événement de revenu/taxe/paiement, afficher les champs structurés */}
                            {(() => {
                              const isRevenueLike = /revenue|tax|payment|receipt|transaction|taxe/i.test(event.entityType + ' ' + event.operation + ' ' + event.details);
                              if (isRevenueLike) {
                                const info = parseRevenueInfo(event);
                                return (
                                  <div className="space-y-1">
                                    {info.amount != null && (
                                      <div className="text-sm text-gray-800">Montant : <strong>{formatCurrency(info.amount, info.currency)}</strong></div>
                                    )}
                                    {info.receiptNumber && (
                                      <div className="text-sm text-gray-700">Quittance / Réf : <strong>{info.receiptNumber}</strong></div>
                                    )}
                                    {info.transactionId && (
                                      <div className="text-sm text-gray-700">Transaction : <strong>{info.transactionId}</strong></div>
                                    )}
                                    {info.agentName && (
                                      <div className="text-sm text-gray-700">Agent : <strong>{info.agentName}</strong></div>
                                    )}
                                    {/* Si pas assez d'info structurée, afficher details brut */}
                                    {(!info.amount && !info.receiptNumber && !info.agentName && event.details) && (
                                      <div className="text-sm text-gray-600">{event.details}</div>
                                    )}
                                  </div>
                                );
                              }
                              return <div className="text-sm text-gray-600">{formatDetails(event)}</div>;
                            })()}
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="ghost" onClick={() => requestDeleteById(event.id)}>
                                <Trash className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-500">
                        {isHistoryLoading ? "Chargement de l'historique..." : "Aucun événement trouvé"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>)}
        </CardContent>
      </Card>
      </div>
  );
}
