import { NatureIcon } from "@/components/icons/AlertNatureIcons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  Clock,
  Image as ImageIcon,
  Loader2,
  MapPin,
  MessageSquare,
  Mic,
  Phone,
  RefreshCw,
  Search,
  User,
} from "lucide-react";
import { useMemo, useState } from "react";

export interface PilotageAlertsScope {
  level: "national" | "regional" | "departemental" | "arrondissement";
  region?: string | null;
  departement?: string | null;
  arrondissement?: string | null;
  commune?: string | null;
  territoryDisplay: string;
}

interface PilotageAlertItem {
  id: number;
  title: string;
  message: string;
  nature: string;
  region: string | null;
  departement: string | null;
  arrondissement: string | null;
  commune: string | null;
  localite: string | null;
  lat: number | null;
  lon: number | null;
  createdAt: string | null;
  isRead: boolean;
  audioPath: string | null;
  imagePath: string | null;
  sender: {
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    grade: string | null;
    roleMetier: string | null;
    role: string | null;
    phone: string | null;
    region: string | null;
    departement: string | null;
  };
}

interface PilotageAlertsPanelProps {
  scope: PilotageAlertsScope;
  onReplyBySms?: (recipientIdentifier: string, recipientLabel: string) => void;
}

const normStr = (v?: string | null) =>
  String(v || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const matchesScope = (item: PilotageAlertItem, scope: PilotageAlertsScope): boolean => {
  if (scope.level === "national") return true;
  if (scope.region) {
    const r = normStr(item.region);
    const sr = normStr(scope.region);
    if (r && r !== sr && !r.includes(sr) && !sr.includes(r)) return false;
    if (!r) return false;
  }
  if ((scope.level === "departemental" || scope.level === "arrondissement") && scope.departement) {
    const d = normStr(item.departement);
    const sd = normStr(scope.departement);
    if (!d || (d !== sd && !d.includes(sd) && !sd.includes(d))) return false;
  }
  if (scope.level === "arrondissement" && scope.arrondissement) {
    const a = normStr(item.arrondissement);
    const sa = normStr(scope.arrondissement);
    if (a && a !== sa && !a.includes(sa) && !sa.includes(a)) return false;
  }
  return true;
};

const formatNatureLabel = (nature?: string | null) => {
  const n = String(nature || "autre").trim().toLowerCase();
  const map: Record<string, string> = {
    braconnage: "Braconnage",
    feux_de_brousse: "Feux de brousse",
    "trafic-bois": "Trafic de bois",
    trafic_bois: "Trafic de bois",
    empietement: "Empiètement",
    spotrep: "SPOTREP",
    autre: "Autre / Information",
  };
  return map[n] || n.toUpperCase();
};

export default function PilotageAlertsPanel({ scope, onReplyBySms }: PilotageAlertsPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "unread" | "read">("all");
  const [natureFilter, setNatureFilter] = useState<string>("toutes");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  const authToken = typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";

  const {
    data: mapAlerts = [],
    isLoading: loadingMap,
    refetch: refetchMap,
  } = useQuery<any[]>({
    queryKey: ["/api/alerts/map", "pilotage-inbox"],
    enabled: Boolean(user),
    queryFn: async () => {
      const resp: any = await apiRequest<any[]>({ url: "/api/alerts/map", method: "GET" });
      if (Array.isArray(resp)) return resp;
      if (resp?.ok && Array.isArray(resp.data)) return resp.data;
      return [];
    },
    staleTime: 10_000,
  });

  const {
    data: receivedNotifs = [],
    isLoading: loadingNotifs,
    refetch: refetchNotifs,
  } = useQuery<any[]>({
    queryKey: ["/api/alerts/received", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      try {
        const resp: any = await apiRequest({ url: `/api/alerts/received/${user?.id}`, method: "GET" });
        if (Array.isArray(resp)) return resp;
        if (resp?.ok && Array.isArray(resp.data)) return resp.data;
        if (Array.isArray(resp?.notifications)) return resp.notifications;
        return [];
      } catch {
        return [];
      }
    },
    staleTime: 10_000,
  });

  const mergedAlerts = useMemo<PilotageAlertItem[]>(() => {
    const byId = new Map<number, PilotageAlertItem>();

    // 1. Alertes du périmètre territorial (via /api/alerts/map)
    for (const a of mapAlerts || []) {
      const id = Number(a?.id);
      if (!Number.isFinite(id)) continue;
      const item: PilotageAlertItem = {
        id,
        title: a.title || `Alerte ${formatNatureLabel(a.nature)}`,
        message: a.message || "",
        nature: a.nature || "autre",
        region: a.region ?? null,
        departement: a.departement ?? null,
        arrondissement: a.arrondissement ?? null,
        commune: a.commune ?? null,
        localite: a.localite ?? null,
        lat: typeof a.lat === "number" ? a.lat : null,
        lon: typeof a.lon === "number" ? a.lon : null,
        createdAt: a.created_at ? String(a.created_at) : null,
        isRead: Boolean(a.isRead ?? a.is_read ?? false),
        audioPath: a.audioPath ?? a.audio_path ?? null,
        imagePath: a.imagePath ?? a.image_path ?? null,
        sender: {
          username: a.sender?.username ?? null,
          firstName: a.sender?.first_name ?? a.sender?.firstName ?? null,
          lastName: a.sender?.last_name ?? a.sender?.lastName ?? null,
          grade: a.sender?.grade ?? null,
          roleMetier: a.sender?.roleMetier ?? null,
          role: a.sender?.role ?? null,
          phone: a.sender?.phone ?? null,
          region: a.sender?.region ?? null,
          departement: a.sender?.departement ?? null,
        },
      };
      if (matchesScope(item, scope)) {
        byId.set(id, item);
      }
    }

    // 2. Fusionner les notifications personnelles (priorité au statut de lecture individuel)
    for (const n of receivedNotifs || []) {
      const a = n?.alert || n;
      const id = Number(a?.id ?? n?.alert_id);
      if (!Number.isFinite(id)) continue;
      const senderRaw = a?.users || a?.sender || {};
      const existing = byId.get(id);
      const isReadNotif = Boolean(n?.is_read ?? n?.isRead ?? false);
      byId.set(id, {
        id,
        title: a?.title || existing?.title || `Alerte ${formatNatureLabel(a?.nature)}`,
        message: a?.message || existing?.message || "",
        nature: a?.nature || existing?.nature || "autre",
        region: a?.region ?? existing?.region ?? null,
        departement: a?.departement ?? existing?.departement ?? null,
        arrondissement: a?.arrondissement ?? existing?.arrondissement ?? null,
        commune: a?.commune ?? existing?.commune ?? null,
        localite: a?.localite ?? existing?.localite ?? null,
        lat: typeof a?.lat === "number" ? a.lat : (existing?.lat ?? null),
        lon: typeof a?.lon === "number" ? a.lon : (existing?.lon ?? null),
        createdAt: a?.created_at || a?.createdAt || n?.created_at || existing?.createdAt || null,
        isRead: existing ? (existing.isRead || isReadNotif) : isReadNotif,
        audioPath: a?.audioPath ?? a?.audio_path ?? existing?.audioPath ?? null,
        imagePath: a?.imagePath ?? a?.image_path ?? existing?.imagePath ?? null,
        sender: {
          username: senderRaw?.username ?? existing?.sender.username ?? null,
          firstName: senderRaw?.first_name ?? senderRaw?.firstName ?? existing?.sender.firstName ?? null,
          lastName: senderRaw?.last_name ?? senderRaw?.lastName ?? existing?.sender.lastName ?? null,
          grade: senderRaw?.grade ?? existing?.sender.grade ?? null,
          roleMetier: senderRaw?.roleMetier ?? existing?.sender.roleMetier ?? null,
          role: senderRaw?.role ?? existing?.sender.role ?? null,
          phone: senderRaw?.phone ?? existing?.sender.phone ?? null,
          region: senderRaw?.region ?? existing?.sender.region ?? null,
          departement: senderRaw?.departement ?? existing?.sender.departement ?? null,
        },
      });
    }

    return Array.from(byId.values()).sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  }, [mapAlerts, receivedNotifs, scope]);

  const natureOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of mergedAlerts) {
      if (a.nature) set.add(a.nature.toLowerCase());
    }
    return Array.from(set).sort();
  }, [mergedAlerts]);

  const filteredAlerts = useMemo(() => {
    const q = normStr(search);
    return mergedAlerts.filter((a) => {
      if (statusFilter === "unread" && a.isRead) return false;
      if (statusFilter === "read" && !a.isRead) return false;
      if (natureFilter !== "toutes" && a.nature.toLowerCase() !== natureFilter) return false;
      if (!q) return true;
      const hay = normStr(
        [
          a.title,
          a.message,
          a.nature,
          a.region,
          a.departement,
          a.arrondissement,
          a.commune,
          a.localite,
          a.sender.grade,
          a.sender.firstName,
          a.sender.lastName,
        ].join(" ")
      );
      return hay.includes(q);
    });
  }, [mergedAlerts, search, statusFilter, natureFilter]);

  const selectedAlert = useMemo(() => {
    if (filteredAlerts.length === 0) return null;
    if (selectedId != null) {
      const found = filteredAlerts.find((a) => a.id === selectedId);
      if (found) return found;
    }
    return filteredAlerts[0];
  }, [filteredAlerts, selectedId]);

  const unreadCount = useMemo(() => mergedAlerts.filter((a) => !a.isRead).length, [mergedAlerts]);

  const markReadMutation = useMutation({
    mutationFn: async (alertId: number) => {
      await apiRequest({ url: `/api/alerts/${alertId}/read`, method: "PATCH", data: { isRead: true } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts/map"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts/received", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/territorial-kpi/overview"] });
      toast({ title: "Alerte marquée comme lue" });
    },
    onError: (err: any) => {
      toast({
        title: "Action impossible",
        description: err?.message || "Impossible de marquer cette alerte comme lue.",
        variant: "destructive",
      });
    },
  });

  const handleRefresh = () => {
    void refetchMap();
    void refetchNotifs();
  };

  const isLoading = loadingMap || loadingNotifs;

  return (
    <Card className="border-emerald-200/80 shadow-sm bg-white overflow-hidden">
      <CardHeader className="border-b border-emerald-100 bg-emerald-50/40 px-4 sm:px-6 py-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600 border border-red-200 shrink-0">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                <span>Boîte des Alertes — {scope.territoryDisplay}</span>
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="text-xs font-bold">
                    {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
                  </Badge>
                )}
              </CardTitle>
              <p className="text-xs text-slate-600">
                Consultez les alertes terrain reçues sur votre périmètre avec leurs pièces jointes et localisation.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-[220px]">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher une alerte..."
                className="pl-9 h-9 bg-white text-sm"
              />
            </div>

            <Select value={natureFilter} onValueChange={setNatureFilter}>
              <SelectTrigger className="h-9 w-[160px] bg-white text-xs sm:text-sm">
                <SelectValue placeholder="Toutes natures" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="toutes">Toutes natures</SelectItem>
                {natureOptions.map((n) => (
                  <SelectItem key={n} value={n}>
                    {formatNatureLabel(n)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
              {(
                [
                  { k: "all", l: `Toutes (${mergedAlerts.length})` },
                  { k: "unread", l: `Non lues (${unreadCount})` },
                  { k: "read", l: "Lues" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.k}
                  type="button"
                  onClick={() => setStatusFilter(opt.k)}
                  className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                    statusFilter === opt.k
                      ? "bg-emerald-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {opt.l}
                </button>
              ))}
            </div>

            <Button type="button" variant="outline" size="sm" onClick={handleRefresh} className="h-9 gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Actualiser</span>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-emerald-800">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">Chargement des alertes…</span>
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="py-16 text-center space-y-2 px-4">
            <AlertTriangle className="h-10 w-10 text-amber-400 mx-auto" />
            <p className="text-sm font-semibold text-slate-800">Aucune alerte correspondant aux critères</p>
            <p className="text-xs text-slate-500">
              Les nouvelles alertes transmises sur votre territoire apparaîtront automatiquement ici.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[480px]">
            {/* Colonne gauche : liste des alertes */}
            <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-slate-200 max-h-[620px] overflow-y-auto divide-y divide-slate-100">
              {filteredAlerts.map((alert) => {
                const isSelected = selectedAlert?.id === alert.id;
                const senderFull = [alert.sender.grade, alert.sender.firstName, alert.sender.lastName]
                  .filter(Boolean)
                  .join(" ")
                  .trim();
                const loc = [alert.departement, alert.arrondissement, alert.commune]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <button
                    key={alert.id}
                    type="button"
                    onClick={() => setSelectedId(alert.id)}
                    className={`w-full text-left p-4 transition-colors flex items-start gap-3 ${
                      isSelected
                        ? "bg-emerald-50/90 border-l-4 border-l-emerald-600"
                        : !alert.isRead
                          ? "bg-amber-50/30 hover:bg-amber-50/60"
                          : "bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      <NatureIcon nature={alert.nature as any} size={22} />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-slate-900 truncate">{alert.title}</span>
                        {!alert.isRead && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0">
                            Nouveau
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-slate-600 truncate">
                        {loc || alert.region || "Zone non renseignée"}
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 pt-0.5">
                        <span className="truncate">{senderFull || "Agent terrain"}</span>
                        <span className="shrink-0">
                          {alert.createdAt ? new Date(alert.createdAt).toLocaleString("fr-FR") : ""}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Colonne droite : détail complet de l'alerte sélectionnée */}
            <div className="lg:col-span-7 p-5 sm:p-6 bg-slate-50/30">
              {selectedAlert && (() => {
                const senderName = [selectedAlert.sender.grade, selectedAlert.sender.firstName, selectedAlert.sender.lastName]
                  .filter(Boolean)
                  .join(" ")
                  .trim();
                const fullLocation = [
                  selectedAlert.region,
                  selectedAlert.departement,
                  selectedAlert.arrondissement,
                  selectedAlert.commune,
                  selectedAlert.localite,
                ]
                  .filter(Boolean)
                  .join(" / ");
                const imgUrl = selectedAlert.imagePath
                  ? `/api/alerts/attachment/${selectedAlert.imagePath}?token=${encodeURIComponent(authToken)}`
                  : null;
                const audioUrl = selectedAlert.audioPath
                  ? `/api/alerts/attachment/${selectedAlert.audioPath}?token=${encodeURIComponent(authToken)}`
                  : null;

                return (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <NatureIcon nature={selectedAlert.nature as any} size={24} />
                          <h3 className="text-lg font-extrabold text-slate-900">{selectedAlert.title}</h3>
                          <Badge className="bg-amber-100 text-amber-900 border border-amber-200 hover:bg-amber-100 text-xs">
                            {formatNatureLabel(selectedAlert.nature)}
                          </Badge>
                          {selectedAlert.isRead ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-0 text-xs">Lue</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">Non lue</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Clock className="h-3.5 w-3.5" />
                          <span>
                            {selectedAlert.createdAt
                              ? new Date(selectedAlert.createdAt).toLocaleString("fr-FR")
                              : "Date inconnue"}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {!selectedAlert.isRead && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={markReadMutation.isPending}
                            onClick={() => markReadMutation.mutate(selectedAlert.id)}
                            className="gap-1.5 border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                          >
                            <CheckCheck className="h-4 w-4" />
                            <span>Marquer comme lue</span>
                          </Button>
                        )}
                        {onReplyBySms && selectedAlert.sender.username && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() =>
                              onReplyBySms(
                                selectedAlert.sender.username!,
                                senderName || selectedAlert.sender.username!
                              )
                            }
                            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <MessageSquare className="h-4 w-4" />
                            <span>Répondre par SMS</span>
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Message */}
                    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-1.5">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Description de l'alerte
                      </div>
                      <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                        {selectedAlert.message || "Aucun message complémentaire."}
                      </p>
                    </div>

                    {/* Localisation & Expéditeur */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                          <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Localisation</span>
                        </div>
                        <div className="text-sm font-semibold text-slate-900">
                          {fullLocation || "Non renseignée"}
                        </div>
                        {selectedAlert.lat != null && selectedAlert.lon != null && (
                          <div className="text-xs text-slate-500 font-mono">
                            GPS : {selectedAlert.lat.toFixed(5)}, {selectedAlert.lon.toFixed(5)}
                          </div>
                        )}
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                          <User className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Agent expéditeur</span>
                        </div>
                        <div className="text-sm font-semibold text-slate-900">
                          {senderName || "Non renseigné"}
                        </div>
                        {selectedAlert.sender.roleMetier && (
                          <div className="text-xs text-slate-600">{selectedAlert.sender.roleMetier}</div>
                        )}
                        {selectedAlert.sender.phone && (
                          <a
                            href={`tel:${selectedAlert.sender.phone}`}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline"
                          >
                            <Phone className="h-3.5 w-3.5" />
                            <span>{selectedAlert.sender.phone}</span>
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Pièces jointes (Photo & Audio) */}
                    {(imgUrl || audioUrl) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {imgUrl && (
                          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                              <ImageIcon className="h-3.5 w-3.5 text-emerald-600" />
                              <span>Photo jointe</span>
                            </div>
                            <img
                              src={imgUrl}
                              alt="Pièce jointe alerte"
                              onClick={() => setZoomImageUrl(imgUrl)}
                              className="w-full h-44 object-cover rounded-lg border cursor-zoom-in hover:opacity-95 transition-opacity"
                            />
                          </div>
                        )}
                        {audioUrl && (
                          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                              <Mic className="h-3.5 w-3.5 text-emerald-600" />
                              <span>Message vocal</span>
                            </div>
                            <audio controls src={audioUrl} className="w-full mt-2" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={!!zoomImageUrl} onOpenChange={(o) => !o && setZoomImageUrl(null)}>
        <DialogContent className="max-w-4xl">
          {zoomImageUrl && (
            <img src={zoomImageUrl} alt="Aperçu alerte" className="w-full h-auto max-h-[80vh] object-contain rounded" />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
