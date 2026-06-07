import { NatureIcon } from "@/components/icons/AlertNatureIcons";
import AgentTopHeader from "@/components/layout/AgentTopHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft, ArrowUpDown, Bell, CheckCheck, ChevronDown, ChevronUp, Clock, Filter, Info, MapPin, MessageSquare, Phone, RefreshCw, Search, Trash2, User, X } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useLocation as useWouterLocation } from "wouter";

import { useNotifications, dismissSystemNotification, clearAllSystemNotifications } from "@/hooks/use-notifications";
import { createOfflineAlert, queueOfflineDeleteAlert, queueOfflineMarkAlertRead, cancelPendingAlert } from "@/lib/offlineCrud";
import { DatabaseManager } from "@/lib/pwaUtils";

// Type pour l'état de la permission
type PermissionState = 'granted' | 'denied' | 'prompt';

function formatAlertLocation(alert: {
  departement?: string | null;
  region?: string | null;
  arrondissement?: string | null;
  commune?: string | null;
  localite?: string | null;
}): string {
  const dep = alert.departement ? String(alert.departement).trim().toUpperCase() : '';
  const reg = alert.region ? String(alert.region).trim() : '';
  const arr = alert.arrondissement ? String(alert.arrondissement).trim() : '';
  const com = alert.commune ? String(alert.commune).trim() : '';
  const loc = alert.localite ? String(alert.localite).trim() : '';
  const base = dep || reg ? [dep || 'NON DÉFINI', reg].filter(Boolean).join('/') : 'NON DÉFINI';
  const extras = [arr, com, loc].filter(Boolean);
  return extras.length ? `${base} · ${extras.join(' · ')}` : base;
}

interface Alert {
  id: number | string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  nature?: "braconnage" | "trafic-bois" | "feux_de_brousse" | "autre";
  isRead: boolean;
  createdAt: string;
  isPending?: boolean;
  // Localisation dérivée des coordonnées (provenant du backend)
  region?: string | null;
  departement?: string | null;
  arrondissement?: string | null;
  commune?: string | null;
  localite?: string | null;
  // Accusés de lecture (rôles) côté expéditeur
  readByRoles?: string[];
  readByDetails?: { name: string; role: string }[];
  isDeletionRequest?: boolean;
  concernedHunters?: { id: number; name: string }[];
  sender: {
    username: string;
    firstName: string;
    lastName: string;
    role: string;
    region?: string;
    departement?: string;
    phone?: string | null;
    grade?: string | null;
    roleMetier?: string | null;
  };
  location?: {
    latitude: number;
    longitude: number;
  };
}

interface MessageBubbleProps {
  alert: Alert;
  isExpanded: boolean;
  onLocate?: (lat: number, lon: number, title?: string) => void;
  toggleExpand: (id: number | string) => void;
  markAsRead: (id: number | string) => Promise<void>;
  deleteAlert: (id: number | string) => Promise<void>;
  getAlertTypeStyles: (type: string) => { bg: string; border: string; badge: string; icon: JSX.Element };
  getUrgencyTag: (type: string, nature?: "braconnage" | "trafic-bois" | "feux_de_brousse" | "autre", isPending?: boolean) => JSX.Element;
  getSenderRoleStyle: (sender: any) => string;
  getProvenanceLabel: (role: string) => string;
  isSent: boolean;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  alert: alertData,
  isExpanded,
  onLocate,
  toggleExpand,
  markAsRead,
  deleteAlert,
  getAlertTypeStyles,
  getUrgencyTag,
  getSenderRoleStyle,
  getProvenanceLabel,
  isSent,
}) => {
  const { user } = useAuth();
  // L'alerte est passée directement, pas imbriquée
  const actualAlertData = alertData;

  // Actualisation toutes les 5 secondes pour rafraîchir les calculs de durée (isExpired, timeAgo)
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  if (!actualAlertData) {
    // Gérer le cas où les données de l'alerte réelle sont manquantes
    // Cela peut arriver si notification.alert est undefined
    console.error("[MessageBubble] actualAlertData est undefined.");
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="border border-red-300 rounded-lg">
          Erreur: Données d'alerte non disponibles.
        </div>
      </div>
    );
  }

  const styles = getAlertTypeStyles(actualAlertData.type);

  // Déterminer l'expéditeur réel à partir de actualAlertData.sender
  let determinedSender: any = null;
  if (actualAlertData.sender && typeof actualAlertData.sender === 'object' && !Array.isArray(actualAlertData.sender)) {
    determinedSender = actualAlertData.sender;
  }
  const senderForDisplayAndStyle = determinedSender || {};
  const senderRoleStyle = getSenderRoleStyle(senderForDisplayAndStyle);

  // --- DEBUT BLOC DE LOGGING (adapté) ---
  if (actualAlertData && actualAlertData.id) {
    console.log(`[MessageBubble LOG] Alert ID: ${actualAlertData.id}`);
    console.log(`[MessageBubble LOG] Raw actualAlertData.sender:`, JSON.stringify(actualAlertData.sender));
    console.log(`[MessageBubble LOG] determinedSender (from actualAlertData):`, JSON.stringify(determinedSender));
    console.log(`[MessageBubble LOG] senderForDisplayAndStyle:`, JSON.stringify(senderForDisplayAndStyle));
  }
  // --- FIN BLOC DE LOGGING ---

  let formattedDateTime = 'Date inconnue';
  let timeAgo = 'Durée inconnue';

  // Utiliser actualAlertData.createdAt pour l'affichage
  const displayTimestampSource = actualAlertData.createdAt;

  if (displayTimestampSource) {
    try {
      const createdAtDate = new Date(displayTimestampSource);
      if (createdAtDate instanceof Date && !isNaN(createdAtDate.getTime())) {
        formattedDateTime = format(createdAtDate, "dd/MM/yyyy à HH:mm", { locale: fr });
        timeAgo = formatDistanceToNow(createdAtDate, { addSuffix: true, locale: fr });
      } else {
        // console.warn('Date invalide pour notification ID:', notification.id, 'source timestamp:', displayTimestampSource);
      }
    } catch (error) {
      // console.error("Erreur de traitement de la date pour notification ID:", notification.id, error);
    }
  }

  const isPending = (actualAlertData as any).isPending;
  return (
    <div
      className={`flex ${isSent ? "justify-end" : "justify-start"} mb-3 sm:mb-4`}
    >
      <div
        className={`max-w-[80%] sm:max-w-[70%] md:max-w-[60%] p-3 sm:p-4 rounded-2xl shadow-md transition-all duration-300 ${isPending
          ? "bg-amber-50 border border-amber-200 text-amber-900 border-l-4 border-l-amber-500"
          : isSent
            ? "bg-blue-100 text-gray-800"
            : "bg-gray-200 text-gray-800"
          } ${!isPending ? senderRoleStyle : ""}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            {actualAlertData.nature ? <NatureIcon nature={actualAlertData.nature} size={20} /> : styles.icon}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm sm:text-lg">{actualAlertData.title}</h3>
                {getUrgencyTag(actualAlertData.type, actualAlertData.nature, isPending)}
              </div>
              <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
                <User className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="font-semibold">
                  {isSent ? "Envoyé par : " : "Reçu de : "}
                  {senderForDisplayAndStyle.firstName ?? (senderForDisplayAndStyle.username ?? 'Utilisateur inconnu')}
                  {senderForDisplayAndStyle.lastName ? ` ${senderForDisplayAndStyle.lastName}` : ''}
                  {(() => {
                    // Normaliser le rôle et construire un label SANS localisation
                    const roleLower = (senderForDisplayAndStyle.role || '').toLowerCase().replace(/[_\s-]+/g, '-');
                    let cleanRoleLabel = '';
                    if (roleLower === 'sub-agent') {
                      cleanRoleLabel = 'Agent secteur';
                    } else if (roleLower === 'agent') {
                      cleanRoleLabel = 'Agent';
                    } else {
                      cleanRoleLabel = getProvenanceLabel(senderForDisplayAndStyle.role ?? 'unknown');
                    }
                    const roleText = ` (${cleanRoleLabel})`;
                    // Pour les messages reçus, ajouter ", Lieux : Département/Région" (issus STRICTEMENT des coordonnées de l'alerte)
                    if (!isSent) {
                      const region = actualAlertData.region ? String(actualAlertData.region) : '';
                      const dep = actualAlertData.departement ? String(actualAlertData.departement).toUpperCase() : '';
                      const locationText = region || dep ? `, Lieux : ${dep || 'NON DÉFINI'}${region ? `/${region}` : ''}` : '';
                      return roleText + locationText;
                    }
                    return roleText;
                  })()}
                </span>
              </div>
              <div className="text-sm sm:text-base text-gray-500 font-medium flex items-center gap-1.5 flex-wrap">
                {isSent ? (
                  actualAlertData.isPending ? (
                    <span title="En attente de synchronisation" className="flex items-center gap-1 text-amber-600 text-xs font-semibold">
                      <Clock className="h-3.5 w-3.5 animate-pulse" />
                      <span>En attente...</span>
                    </span>
                  ) : (
                    <>
                      <span>Envoyé {timeAgo}</span>
                      <span className="ml-2">({formattedDateTime})</span>
                    </>
                  )
                ) : (
                  <>
                    <span>{timeAgo}</span>
                    <span className="ml-2">({formattedDateTime})</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleExpand(actualAlertData.id)}
            className="hover:bg-gray-100 transition-colors"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" /> : <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />}
          </Button>
        </div>

        {isExpanded && (
          <>
            <Separator className="my-2 sm:my-3 bg-gray-300" />
            <div className="text-gray-700 text-xs sm:text-sm">
              <p className="whitespace-pre-line leading-relaxed">{actualAlertData.message}</p>
              {actualAlertData.location && (
                <p className="text-xs sm:text-sm text-gray-600 mt-2 font-medium">
                  Position: Lat {actualAlertData.location.latitude.toFixed(4)}, Lon {actualAlertData.location.longitude.toFixed(4)}
                  {!isSent && (actualAlertData.departement || actualAlertData.region) && (
                    <>
                      {" : "}
                      {actualAlertData.departement ? String(actualAlertData.departement) : ''}
                      {actualAlertData.departement && actualAlertData.region ? ' / ' : ''}
                      {actualAlertData.region ? String(actualAlertData.region) : ''}
                    </>
                  )}
                </p>
              )}
              {actualAlertData.isDeletionRequest && actualAlertData.concernedHunters && actualAlertData.concernedHunters.length > 0 && (
                <div className="mt-3 sm:mt-4">
                  <h4 className="font-semibold text-gray-800 mb-2 text-sm sm:text-base">Chasseurs concernés:</h4>
                  <div className="space-y-2">
                    {actualAlertData.concernedHunters.map((hunter: { id: number; name: string }) => (
                      <div
                        key={hunter.id}
                        className="p-2 rounded-lg bg-red-50 border border-red-200 flex justify-between items-center text-xs sm:text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3 sm:h-4 sm:w-4 text-red-600" />
                          <span className="text-gray-800 font-medium">{hunter.name}</span>
                        </div>
                        <Badge variant="outline" className="border-red-300 text-red-600">
                          ID: {hunter.id}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-2 sm:mt-3">
              {actualAlertData.isDeletionRequest && !isSent && (
                <>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="hover:bg-red-700 transition-colors rounded-lg text-xs sm:text-sm"
                  >
                    Approuver la suppression
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-blue-300 text-blue-600 hover:bg-blue-50 transition-colors rounded-lg text-xs sm:text-sm"
                  >
                    Rejeter
                  </Button>
                </>
              )}
              {!actualAlertData.isRead && !isSent && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => markAsRead(actualAlertData.id)}
                  className="border-blue-300 text-blue-600 hover:bg-blue-50 transition-colors rounded-lg text-xs sm:text-sm"
                >
                  Marquer comme lu
                </Button>
              )}
              {isSent && (
                <div className="ml-auto mr-2 flex items-center gap-1.5 self-center">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="text-orange-500 hover:text-orange-600 focus:outline-none transition-colors" title="Détails de lecture">
                        <Info className="h-4 w-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-3 z-50 text-sm shadow-xl" align="end" side="top">
                      <div className="space-y-3">
                        {actualAlertData.region || actualAlertData.departement || actualAlertData.location || actualAlertData.arrondissement || actualAlertData.commune || actualAlertData.localite ? (
                          <div>
                            <h4 className="font-semibold text-gray-800 mb-1 border-b pb-1">Lieu précis de l'alerte</h4>
                            <div className="text-gray-600 text-xs space-y-0.5 mt-1">
                              {actualAlertData.region && <p><span className="font-medium text-gray-700">Région:</span> {actualAlertData.region}</p>}
                              {actualAlertData.departement && <p><span className="font-medium text-gray-700">Département:</span> {actualAlertData.departement}</p>}
                              <p>
                                <span className="font-medium text-gray-700">Localité:</span>{' '}
                                {[actualAlertData.arrondissement, actualAlertData.commune, actualAlertData.localite].filter(Boolean).join(' / ') || 'Non définie'}
                              </p>
                            </div>
                          </div>
                        ) : null}

                        <div>
                          <h4 className="font-semibold text-gray-800 mb-1 border-b pb-1">Destinataires ayant lu</h4>
                          <div className="max-h-32 overflow-y-auto mt-1 space-y-1.5 pr-1">
                            {Array.isArray(actualAlertData.readByRoles) && actualAlertData.readByRoles.length > 0 ? (
                              actualAlertData.readByDetails && actualAlertData.readByDetails.length > 0 ? (
                                actualAlertData.readByDetails.map((reader, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-xs">
                                    <span className="text-gray-700 truncate mr-2">{reader.name}</span>
                                    <Badge variant="secondary" className="text-[10px] py-0 px-1 border-gray-200">{reader.role}</Badge>
                                  </div>
                                ))
                              ) : (
                                <p className="text-xs text-gray-500">Seuls les rôles sont disponibles : {actualAlertData.readByRoles.join(', ')}</p>
                              )
                            ) : (
                              <p className="text-xs text-gray-500">Aucun destinataire n'a encore lu ce message.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <span className="text-xs text-gray-600">
                    {Array.isArray(actualAlertData.readByRoles) && actualAlertData.readByRoles.length > 0 ? "Message lu" : "Message non lu"}
                  </span>
                </div>
              )}
              {actualAlertData.isRead && !isSent && actualAlertData.location && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const lat = actualAlertData.location?.latitude;
                    const lon = actualAlertData.location?.longitude;
                    if (lat && lon && onLocate) {
                      onLocate(lat, lon, actualAlertData.title);
                    }
                  }}
                  className="border-green-300 text-green-600 hover:bg-green-50 transition-colors rounded-lg text-xs sm:text-sm"
                >
                  <MapPin className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  Localiser
                </Button>
              )}
              {(() => {
                const isAdmin = user?.role === 'admin';
                if (!isSent && !isAdmin) return null;

                const isPending = actualAlertData.isPending;
                const isExpired = Boolean(!isPending && isSent && !isAdmin && actualAlertData.createdAt && (new Date().getTime() - new Date(actualAlertData.createdAt).getTime()) / 60000 > 1.5);
                return (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteAlert(actualAlertData.id)}
                    disabled={isExpired}
                    title={isExpired ? "Délai de suppression dépassé" : "Supprimer"}
                    className="border-red-300 text-red-600 hover:bg-red-50 disabled:hover:bg-transparent disabled:opacity-50 transition-colors rounded-lg text-xs sm:text-sm"
                  >
                    <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Supprimer
                  </Button>
                );
              })()}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

function getSenderRoleStyle(sender: any) {
  if (!sender || !sender.role) {
    return "border-l-4 border-gray-500";
  }

  switch (sender.role) {
    case "hunter":
      return "border-l-4 border-green-500";
    case "hunting-guide":
      return "border-l-4 border-blue-500";
    case "agent":
      return "border-l-4 border-purple-500";
    default:
      return "border-l-4 border-gray-500";
  }
}

async function loadPendingAlertsFromDb(): Promise<Alert[]> {
  try {
    const db = await DatabaseManager.getDB();
    if (!db.objectStoreNames.contains('pendingSync')) return [];

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('pendingSync', 'readonly');
        const store = tx.objectStore('pendingSync');
        const req = store.getAll();
        req.onsuccess = () => {
          const tasks = req.result || [];
          const alertTasks = tasks.filter((t: any) => t.action === 'CREATE_ALERT');
          const records = alertTasks.map((t: any) => {
            const payload = t.payload || {};
            let lat: number | null = null;
            let lon: number | null = null;
            if (payload.latitude != null && payload.longitude != null) {
              lat = Number(payload.latitude);
              lon = Number(payload.longitude);
            } else if (typeof payload.zone === 'string' && payload.zone.includes(',')) {
              const parts = payload.zone.split(',').map((p: string) => p.trim());
              lat = parseFloat(parts[0]);
              lon = parseFloat(parts[1]);
            }
            return {
              id: t.entityId || t.id || String(Date.now()),
              title: payload.title || 'Alerte',
              message: payload.message || '',
              type: payload.type || 'info',
              nature: payload.nature || 'autre',
              isRead: true,
              createdAt: new Date(t.createdAt || Date.now()).toISOString(),
              region: payload.region || undefined,
              isPending: true,
              departement: payload.departement || undefined,
              sender: {
                username: 'moi',
                firstName: '',
                lastName: '',
                role: 'agent',
              },
              location: lat !== null && lon !== null ? { latitude: lat, longitude: lon } : undefined,
            } as any;
          }).filter(Boolean) as Alert[];
          resolve(records);
        };
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  } catch (e) {
    return [];
  }
}

async function loadPendingDeletedAlertIds(): Promise<(string | number)[]> {
  try {
    const db = await DatabaseManager.getDB();
    if (!db.objectStoreNames.contains('pendingSync')) return [];

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('pendingSync', 'readonly');
        const store = tx.objectStore('pendingSync');
        const req = store.getAll();
        req.onsuccess = () => {
          const tasks = req.result || [];
          const deleteAlertTasks = tasks.filter((t: any) => t.action === 'DELETE_ALERT');
          const ids = deleteAlertTasks.map((t: any) => t.payload?.alertId || t.entityId).filter(Boolean);
          resolve(ids);
        };
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  } catch (e) {
    return [];
  }
}


function AlertsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, navigate] = useWouterLocation();

  const { isPushSupported, isPushSubscribed, subscribeToPush } = useNotifications();

  // Vérification de l'authentification
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Accès non autorisé</h2>
          <p className="text-gray-600">Veuvez vous connecter pour accéder à cette page.</p>
        </div>
      </div>
    );
  }

  // Détection des rôles avec normalisation (insensible aux accents) car /api/auth/me ne renvoie pas "type"
  const normalizedRole = (user.role || '').toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // retirer les accents
    .replace(/[_\s]+/g, '-');

  const isRegionalAgent = normalizedRole === 'agent' ||
    normalizedRole.includes('agent-regional') ||
    normalizedRole.includes('regional-agent');

  const isSectorAgent = normalizedRole === 'sub-agent' ||
    normalizedRole.includes('agent-secteur') ||
    normalizedRole.includes('secteur-agent') ||
    normalizedRole.includes('sector-agent');

  const isAdmin = user.role === 'admin';
  const isDefaultRole = !!(user as any)?.isDefaultRole;
  const isSupervisorRole = !!(user as any)?.isSupervisorRole;
  // Lecture seule: admin ou rôle métier superviseur
  const isReadOnlyUser = isAdmin || isSupervisorRole;
  /** Superviseur / default domaine Alerte : nav basse fixe, pied de page collé */
  const isAlertMobileChromeless = isDefaultRole || isSupervisorRole;
  const isHunter = user.role === 'hunter';
  const isGuide = normalizedRole === 'hunting-guide' || normalizedRole.includes('guide');

  const [showAlertForm, setShowAlertForm] = useState(true);
  const [alertNature, setAlertNature] = useState<"braconnage" | "trafic-bois" | "feux_de_brousse" | "autre">("braconnage");
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const isLocatingRef = React.useRef(false);
  const [isSendingAlert, setIsSendingAlert] = useState(false);
  const [selectedAlertType, setSelectedAlertType] = useState<"braconnage" | "trafic-bois" | "feux_de_brousse" | "autre" | null>(null);
  const [messageText, setMessageText] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"inbox" | "outbox">("inbox");
  const [expandedAlerts, setExpandedAlerts] = useState<(number | string)[]>([]);
  // Modal pour doublon d'alerte
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicateModalInfo, setDuplicateModalInfo] = useState<{
    nature?: string | null;
    lat?: number | null;
    lon?: number | null;
    self?: boolean;
    createdAt?: string | null;
    sender?: { username?: string; first_name?: string; last_name?: string; role?: string; region?: string; departement?: string } | null;
    alertRegion?: string | null;
    alertDepartement?: string | null;
    alertArrondissement?: string | null;
    alertCommune?: string | null;
    radiusMeters?: number | null;
  } | null>(null);
  // État pour suivre si l'accès à la géolocalisation a été refusé
  const [locationPermissionDenied, setLocationPermissionDenied] = useState<boolean>(false);
  // Ref pour éviter de relancer la géolocalisation automatique en boucle
  const geoAutoAttemptedRef = React.useRef(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const [alertTypeHintDismissed, setAlertTypeHintDismissed] = useState(() => {
    try {
      return localStorage.getItem("scodi:alerts-select-type-hint-dismissed") === "1";
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
      return false;
    }
  });

  const dismissAlertTypeHint = () => {
    setAlertTypeHintDismissed(true);
    try {
      localStorage.setItem("scodi:alerts-select-type-hint-dismissed", "1");
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
      /* ignore */
    }
  };

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsAlert, setDetailsAlert] = useState<Alert | null>(null);

  // État pour la modal de localisation
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedAlertTitle, setSelectedAlertTitle] = useState<string | null>(null);

  // Handler pour ouvrir la modal de localisation
  const handleLocate = (lat: number, lon: number, title?: string) => {
    setSelectedLocation({ lat, lon });
    setSelectedAlertTitle(title || null);
    setLocationModalOpen(true);
  };

  // Google Maps Embed support
  const googleKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_EMBED_KEY as string | undefined;
  const googleJsKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_JS_KEY as string | undefined;
  const [iframeMode, setIframeMode] = useState<'view' | 'directions'>('view');
  const [origin, setOrigin] = useState<{ lat: number; lon: number } | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [originLoading, setOriginLoading] = useState(false);

  // Haversine distance (km)
  const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Light WGS84 -> UTM conversion (sufficient for display)
  const latLonToUTM = (lat: number, lon: number) => {
    // Source: standard formulas; simplified implementation
    const a = 6378137.0;
    const f = 1 / 298.257223563;
    const k0 = 0.9996;
    const b = a * (1 - f);
    const e = Math.sqrt(1 - (b * b) / (a * a));
    const eSq = e * e;
    const rad = Math.PI / 180;
    let zoneNumber = Math.floor((lon + 180) / 6) + 1;
    const lonOrigin = (zoneNumber - 1) * 6 - 180 + 3; // central meridian
    const latRad = lat * rad;
    const lonRad = lon * rad;
    const lonOrigRad = lonOrigin * rad;
    const N = a / Math.sqrt(1 - eSq * Math.sin(latRad) ** 2);
    const T = Math.tan(latRad) ** 2;
    const C = (eSq / (1 - eSq)) * Math.cos(latRad) ** 2;
    const A = Math.cos(latRad) * (lonRad - lonOrigRad);
    const M =
      a * (
        (1 - eSq / 4 - (3 * eSq * eSq) / 64 - (5 * eSq ** 3) / 256) * latRad -
        ((3 * eSq) / 8 + (3 * eSq * eSq) / 32 + (45 * eSq ** 3) / 1024) * Math.sin(2 * latRad) +
        ((15 * eSq * eSq) / 256 + (45 * eSq ** 3) / 1024) * Math.sin(4 * latRad) -
        ((35 * eSq ** 3) / 3072) * Math.sin(6 * latRad)
      );
    const easting =
      k0 *
      N *
      (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T ** 2 + 72 * C - 58 * (eSq / (1 - eSq))) * A ** 5) / 120) +
      500000;
    let northing =
      k0 * (M + N * Math.tan(latRad) * (A ** 2 / 2 + ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24 + ((61 - 58 * T + T ** 2 + 600 * C - 330 * (eSq / (1 - eSq))) * A ** 6) / 720));
    const hemisphere = lat >= 0 ? 'N' : 'S';
    if (lat < 0) northing += 10000000; // add false northing in southern hemisphere
    return { zoneNumber, hemisphere, easting: Math.round(easting), northing: Math.round(northing) };
  };

  const getGoogleEmbedSrc = () => {
    if (!selectedLocation) return '';
    const { lat, lon } = selectedLocation;
    if (iframeMode === 'directions') {
      if (googleKey && origin) {
        return `https://www.google.com/maps/embed/v1/directions?key=${googleKey}&origin=${origin.lat},${origin.lon}&destination=${lat},${lon}&mode=driving`;
      }
      // Fallback: open new tab (cannot be embedded without key reliably)
      return '';
    }
    // view mode
    if (googleKey) {
      return `https://www.google.com/maps/embed/v1/view?key=${googleKey}&center=${lat},${lon}&zoom=16&maptype=satellite`;
    }
    // Fallback sans clé: pas de contrôle satellite garanti
    return `https://www.google.com/maps?q=${lat},${lon}&output=embed&z=16`;
  };

  const startDirections = () => {
    if (!selectedLocation) return;
    if (!googleKey) {
      // Sans clé, ouvrir dans un nouvel onglet
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
          const { latitude, longitude } = pos.coords;
          const url = `https://www.google.com/maps/dir/?api=1&origin=${latitude},${longitude}&destination=${selectedLocation.lat},${selectedLocation.lon}&travelmode=driving`;
          window.open(url, '_blank', 'noopener,noreferrer');
        });
      } else {
        const url = `https://www.google.com/maps/dir/?api=1&destination=${selectedLocation.lat},${selectedLocation.lon}&travelmode=driving`;
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    // Avec clé: tenter en iframe
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setOrigin({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setIframeMode('directions');
      });
    } else {
      setOrigin(null);
      setIframeMode('directions');
    }
  };

  useEffect(() => {
    let isMounted = true;

    const requestLocation = async () => {
      if (!showAlertForm || location || isLoadingLocation || locationPermissionDenied || isLocatingRef.current) {
        return;
      }

      try {
        // Vérifier les permissions de géolocalisation si l'API est disponible
        if (navigator.permissions && navigator.permissions.query) {
          const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });

          if (permissionStatus.state === 'denied') {
            if (isMounted) {
              setLocationPermissionDenied(true);
              toast({
                variant: "destructive",
                title: "Accès à la localisation refusé",
                description: "Veuvez autoriser l'accès à votre position dans les paramètres de votre navigateur pour utiliser cette fonctionnalité.",
                duration: 5000,
              });
            }
            return;
          } else if (permissionStatus.state === 'granted') {
            setLocationPermissionDenied(false);
          }
        }

        // Tenter d'obtenir la position sauf si la permission a été refusée
        if (!locationPermissionDenied) {
          await handleGetLocation();
        }
      } catch (error) {
        console.error('Erreur lors de la vérification des permissions:', error);
        // En cas d'erreur, on tente quand même la géolocalisation
        if (isMounted) {
          await handleGetLocation();
        }
      }
    };

    requestLocation();

    return () => {
      isMounted = false;
    };
  }, [showAlertForm, location, isLoadingLocation, locationPermissionDenied]);

  useEffect(() => {
    if (isAdmin && activeTab !== "inbox") {
      setActiveTab("inbox");
    }
  }, [isAdmin, activeTab, setActiveTab]);

  useEffect(() => {
    if (!isReadOnlyUser && !isHunter && !isGuide && activeTab !== 'outbox') {
      setActiveTab('outbox');
    }
  }, [isReadOnlyUser, isHunter, isGuide, activeTab]);

  // (moved below queries) Effects that call refetch/refetchSent must be declared after the queries

  const { data: alerts = [], refetch, isLoading: isLoadingAlerts } = useQuery({
    queryKey: ["/api/alerts/received", user?.id],
    queryFn: async () => {
      if (!user) return [];
      try {
        const resp: any = await apiRequest({ url: `/api/alerts/received/${user.id}`, method: 'GET' });
        console.log('[AlertsPage] Raw response from /api/alerts/received:', resp);
        const raw = Array.isArray(resp) ? resp : (resp?.data ?? resp);
        console.log('[AlertsPage] Raw notifications array:', raw);
        console.log('[AlertsPage] Total notifications received:', raw?.length || 0);

        // raw is an array of notifications with nested alert
        const mapped: Alert[] = (raw || [])
          .filter((notif: any) => {
            const hasAlert = notif && notif.alert;
            if (!hasAlert) {
              console.log('[AlertsPage] Notification filtered out (no alert):', notif);
            }
            return hasAlert;
          })
          .map((notif: any) => {
            const a = notif?.alert || {};
            const zone = a?.zone || null;
            let lat: number | null = null;
            let lon: number | null = null;
            if (typeof zone === 'string' && zone.includes(',')) {
              const parts = zone.split(',').map((p: string) => p.trim());
              const latNum = parseFloat(parts[0]);
              const lonNum = parseFloat(parts[1]);
              if (isFinite(latNum) && isFinite(lonNum)) {
                lat = latNum; lon = lonNum;
              }
            }
            const s = a?.sender || {};
            const alert: Alert = {
              id: a.id,
              title: a.title,
              message: a.message,
              type: a.type || 'info',
              nature: a.nature,
              isRead: !!notif.is_read,
              createdAt: a.created_at,
              region: a.region || undefined,
              departement: a.departement || undefined,
              arrondissement: a.arrondissement || undefined,
              commune: a.commune || undefined,
              localite: a.localite || undefined,
              sender: {
                username: s.username || 'inconnu',
                firstName: s.first_name || '',
                lastName: s.last_name || '',
                role: s.role || 'unknown',
                phone: s.phone || null,
                region: a.region || s.region || undefined,
                departement: a.departement || s.departement || undefined,
              },
              location: lat !== null && lon !== null ? { latitude: lat, longitude: lon } : undefined,
            };
            return alert;
          });
        console.log('[AlertsPage] Mapped alerts count:', mapped.length);
        console.log('[AlertsPage] Mapped alerts:', mapped);
        const deletedIds = await loadPendingDeletedAlertIds();
        const deletedIdsStr = deletedIds.map(String);
        return mapped.filter(a => !deletedIdsStr.includes(String(a.id)));
      } catch (error: any) {
        console.error('[AlertsPage] Error fetching alerts:', error);
        if (String(error?.message || '').toLowerCase().includes('non authentifi') || String(error?.message || '').includes('401')) {
          toast({ variant: 'destructive', title: 'Session expirée', description: 'Veuillez vous reconnecter pour accéder aux alertes.' });
        }
        return [] as Alert[];
      }
    },
    enabled: !!user && isReadOnlyUser,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 10000, // 10s polling to auto-refresh inbox
    staleTime: 5000, // Éviter les refetch trop fréquents qui causent du clignotement
    placeholderData: keepPreviousData, // Garder les anciennes données pendant le refetch pour éviter le flash
  });

  const { data: sentAlertsData = [], refetch: refetchSent, isLoading: isLoadingSent } = useQuery({
    queryKey: ["/api/alerts/sent", user?.id],
    queryFn: async () => {
      if (!user) return [];

      let list: Alert[] = [];
      try {
        const resp: any = await apiRequest({ url: `/api/alerts/sent/${user.id}`, method: 'GET' });
        const raw = Array.isArray(resp) ? resp : (resp?.data ?? resp);
        list = (raw || []).map((a: any) => {
          const zone = a?.zone || null;
          let lat: number | null = null;
          let lon: number | null = null;
          if (typeof zone === 'string' && zone.includes(',')) {
            const parts = zone.split(',').map((p: string) => p.trim());
            const latNum = parseFloat(parts[0]);
            const lonNum = parseFloat(parts[1]);
            if (isFinite(latNum) && isFinite(lonNum)) { lat = latNum; lon = lonNum; }
          }
          const s = a?.sender || {};
          const alert: Alert = {
            id: a.id,
            title: a.title,
            message: a.message,
            type: a.type || 'info',
            nature: a.nature,
            isRead: true,
            createdAt: a.created_at,
            region: a.region || undefined,
            departement: a.departement || undefined,
            arrondissement: a.arrondissement || undefined,
            commune: a.commune || undefined,
            localite: a.localite || undefined,
            readByRoles: Array.isArray(a.read_by_roles) ? a.read_by_roles : undefined,
            readByDetails: Array.isArray(a.read_by_details) ? a.read_by_details : undefined,
            sender: {
              username: s.username || user.username || 'moi',
              firstName: s.first_name || user.firstName || '',
              lastName: s.last_name || user.lastName || '',
              role: s.role || user.role || 'agent',
              // Prefer region from alert, then sender/user
              region: a.region || s.region || user.region || undefined,
              // Prefer departement from alert, then sender/user
              departement: a.departement || s.departement || (user as any)?.departement || user.zone || undefined,
            },
            location: lat !== null && lon !== null ? { latitude: lat, longitude: lon } : undefined,
          };
          return alert;
        });
      } catch (error) {
        console.error('Erreur:', error);
        list = [];
      }

      // Charger les alertes en attente depuis IndexedDB et les fusionner
      const pendingList = await loadPendingAlertsFromDb();
      const uniquePending = pendingList.filter(p => {
        const alreadySynced = list.some(m =>
          String(m.message || '').trim() === String(p.message || '').trim() &&
          m.nature === p.nature &&
          m.location?.latitude === p.location?.latitude &&
          m.location?.longitude === p.location?.longitude &&
          Math.abs(new Date(m.createdAt).getTime() - new Date(p.createdAt).getTime()) < 60000
        );
        return !alreadySynced;
      });

      const combined = [...uniquePending, ...list];
      const deletedIds = await loadPendingDeletedAlertIds();
      const deletedIdsStr = deletedIds.map(String);
      return combined.filter(a => !deletedIdsStr.includes(String(a.id)));
    },
    enabled: !!user,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 10000, // 10s polling to auto-refresh outbox
    staleTime: 5000, // Éviter les refetch trop fréquents qui causent du clignotement
    placeholderData: keepPreviousData, // Garder les anciennes données pendant le refetch pour éviter le flash
  });

  // Now safe to reference refetch/refetchSent
  useEffect(() => {
    if (activeTab === 'inbox') {
      refetch();
    } else {
      refetchSent();
    }
  }, [activeTab, refetch, refetchSent]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refetch();
        refetchSent();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refetch, refetchSent]);

  useEffect(() => {
    const handleSyncFinished = () => {
      console.log("[AlertsPage] Sync finished, refetching alerts");
      void refetch();
      void refetchSent();
    };

    window.addEventListener('sync-finished', handleSyncFinished);
    return () => {
      window.removeEventListener('sync-finished', handleSyncFinished);
    };
  }, [refetch, refetchSent]);

  const unreadCount = alerts.filter((alert: Alert) => !alert.isRead).length;

  const { data: unreadMsgCount } = useQuery({
    queryKey: ["/api/messages/unread-count", user?.id],
    queryFn: async () => {
      if (!user) return { total: 0 };
      try {
        const _domain = (typeof window !== 'undefined' ? localStorage.getItem('domain') || '' : '').toUpperCase();
        const domaineParam = _domain ? `domaine=${_domain}` : '';
        const resp: any = await apiRequest({
          url: `/api/messages/unread-count${domaineParam ? `?${domaineParam}` : ''}`,
          method: 'GET'
        });
        return resp;
      } catch (error) {
        console.error('Error fetching unread messages count:', error);
        return { total: 0 };
      }
    },
    enabled: !!user,
    refetchInterval: user ? 15000 : false,
  });

  const msgUnread = unreadMsgCount?.total || 0;

  const filteredInbox = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    // Inbox affiche toutes les alertes (lues et non lues)
    const base = (Array.isArray(alerts) ? alerts : []);

    let filteredByType = base;
    if (typeFilter !== "all") {
      filteredByType = base.filter((a) => {
        if (typeFilter === "autre") {
          return !["braconnage", "trafic-bois", "feux_de_brousse"].includes(a.nature || "");
        }
        return a.nature === typeFilter;
      });
    }

    const filtered = !q
      ? filteredByType
      : filteredByType.filter((a) => {
        const t = String(a?.title || "").toLowerCase();
        const m = String(a?.message || "").toLowerCase();
        const sender = `${a?.sender?.firstName || ""} ${a?.sender?.lastName || ""} ${a?.sender?.username || ""}`.toLowerCase();
        const loc = `${a?.departement || ""} ${a?.region || ""}`.toLowerCase();
        return t.includes(q) || m.includes(q) || sender.includes(q) || loc.includes(q);
      });
    return filtered.sort((a, b) => {
      const at = new Date(a.createdAt || 0).getTime();
      const bt = new Date(b.createdAt || 0).getTime();
      return bt - at; // Toujours le plus récent en haut
    });
  }, [alerts, searchQuery, typeFilter]);

  useEffect(() => {
    document.title = "Alertes | SCoDiPP - Systeme de Control";
  }, []);

  const toggleExpand = (alertId: number | string) => {
    setExpandedAlerts((prev) =>
      prev.includes(alertId) ? prev.filter((id) => id !== alertId) : [...prev, alertId]
    );
  };

  const markAsRead = async (alertId: number | string) => {
    if (typeof alertId === 'string') return;
    try {
      await apiRequest({ url: `/api/alerts/${alertId}/read`, method: 'PATCH', data: { isRead: true } });
    } catch (error: any) {
      const msg = String(error?.message || '').toLowerCase();
      const isNetworkError = !navigator.onLine ||
        [500, 502, 503, 504, 0].includes(error?.status) ||
        msg.includes('network') || msg.includes('fetch') || msg.includes('unreachable') ||
        msg.includes('failed') || msg.includes('503') || msg.includes('502') || msg.includes('504') ||
        msg.includes('connecter') || msg.includes('connexion') || msg.includes('unavailable') ||
        msg.includes('service') || msg.includes('hors ligne') || msg.includes('offline');
      if (isNetworkError) {
        // Queue pour synchronisation ultérieure
        try {
          await queueOfflineMarkAlertRead(alertId);
          toast({
            title: "Mode hors ligne",
            description: "L'alerte sera marquée comme lue lors de la reconnexion.",
          });
        } catch (e) {
          if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
          toast({ variant: "destructive", title: "Erreur", description: "Impossible de mettre en file d'attente." });
          return;
        }
      } else {
        if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', error);
        toast({ variant: "destructive", title: "Erreur", description: "Une erreur s'est produite. Veuillez réessayer." });
        return;
      }
    }

    toast({
      title: "Alerte marquée comme lue",
      description: "L'alerte a été marquée comme lue avec succès.",
    });

    // Retirer immédiatement l'alerte de la boîte de réception
    queryClient.setQueryData(["/api/alerts/received", user?.id], (old: any) => {
      const arr = Array.isArray(old) ? old : [];
      return arr.filter((a: any) => Number(a?.id) !== Number(alertId));
    });

    // Invalider les compteurs de notifications pour mise à jour immédiate des badges
    queryClient.invalidateQueries({ queryKey: ["unread-notifications-count"] });
    queryClient.invalidateQueries({ queryKey: ["supervisor-recent-notifs"] });
    queryClient.invalidateQueries({ queryKey: ["unread-alerts-count"] });
    window.dispatchEvent(new CustomEvent('launcher-badge-refresh'));

    // Supprimer la notification système Android correspondante
    void dismissSystemNotification('ALERT', alertId);

    // Rafraîchir les données depuis le serveur
    if (navigator.onLine) refetch();
  };

  const markAllAsRead = async () => {
    try {
      await apiRequest({ url: `/api/alerts/user/${user?.id}/read-all`, method: 'PATCH' });

      // Vider localement la boîte de réception + invalider tous les caches liés
      queryClient.setQueryData(["/api/alerts/received", user?.id], []);
      queryClient.invalidateQueries({ queryKey: ["unread-notifications-count"] });
      queryClient.invalidateQueries({ queryKey: ["supervisor-recent-notifs"] });
      queryClient.invalidateQueries({ queryKey: ["unread-alerts-count"] });
      window.dispatchEvent(new CustomEvent('launcher-badge-refresh'));

      // Supprimer toutes les notifications système Android
      void clearAllSystemNotifications();
      refetch();

      toast({ title: "Toutes les alertes marquées comme lues" });
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
      toast({ variant: "destructive", title: "Erreur", description: "Impossible de marquer toutes les alertes comme lues." });
    }
  };

  const deleteAlert = async (alertId: number | string) => {
    let deletedOnServer = false;
    let isNetworkErrorMode = false;

    // Tenter d'annuler s'il s'agit d'une alerte créée hors ligne et non encore synchronisée
    try {
      const cancelled = await cancelPendingAlert(alertId);
      if (cancelled) {
        queryClient.setQueryData(["/api/alerts/received", user?.id], (old: any) => {
          const arr = Array.isArray(old) ? old : [];
          return arr.filter((a: any) => String(a?.id) !== String(alertId));
        });
        queryClient.setQueryData(["/api/alerts/sent", user?.id], (old: any) => {
          const arr = Array.isArray(old) ? old : [];
          return arr.filter((a: any) => String(a?.id) !== String(alertId));
        });
        queryClient.invalidateQueries({ queryKey: ["unread-notifications-count"] });
        queryClient.invalidateQueries({ queryKey: ["unread-alerts-count"] });
        window.dispatchEvent(new CustomEvent('launcher-badge-refresh'));
        toast({
          title: "Alerte annulée",
          description: "L'alerte hors ligne non encore envoyée a été supprimée.",
        });
        return;
      }
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[deleteAlert] Erreur lors de l\'annulation offline:', e);
    }

    try {
      await apiRequest({ url: `/api/alerts/${alertId}`, method: 'DELETE' });
      deletedOnServer = true;
    } catch (error: any) {
      const msg = String(error?.message || '').toLowerCase();
      if (error?.status === 403 && (msg.includes('délai') || msg.includes('dépassé') || msg.includes('minutes'))) {
        toast({
          variant: "destructive",
          title: "Délai de suppression dépassé",
          description: "Le délai de 2 minutes pour supprimer cette alerte est dépassé.",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/alerts/received", user?.id] });
        queryClient.invalidateQueries({ queryKey: ["/api/alerts/sent", user?.id] });
        return;
      }
      const isNetworkError = !navigator.onLine ||
        [500, 502, 503, 504, 0].includes(error?.status) ||
        msg.includes('network') || msg.includes('fetch') || msg.includes('unreachable') ||
        msg.includes('failed') || msg.includes('503') || msg.includes('502') || msg.includes('504') ||
        msg.includes('connecter') || msg.includes('connexion') || msg.includes('unavailable') ||
        msg.includes('service') || msg.includes('hors ligne') || msg.includes('offline');
      if (isNetworkError) {
        isNetworkErrorMode = true;
        // Queue pour synchronisation ultérieure
        try {
          await queueOfflineDeleteAlert(alertId);
        } catch (e) {
          if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Queue error (non-bloquant):', e);
        }
      } else {
        if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', error);
        toast({ variant: "destructive", title: "Erreur", description: "Une erreur s'est produite lors de la suppression." });
        return;
      }
    }

    // Mettre à jour les données locales (optimistic) - Toujours exécuté si succès serveur ou offline
    queryClient.setQueryData(["/api/alerts/received", user?.id], (old: any) => {
      const arr = Array.isArray(old) ? old : [];
      return arr.filter((a: any) => String(a?.id) !== String(alertId));
    });
    queryClient.setQueryData(["/api/alerts/sent", user?.id], (old: any) => {
      const arr = Array.isArray(old) ? old : [];
      return arr.filter((a: any) => String(a?.id) !== String(alertId));
    });

    // Invalider les compteurs de notifications pour mise à jour immédiate des badges
    queryClient.invalidateQueries({ queryKey: ["unread-notifications-count"] });
    queryClient.invalidateQueries({ queryKey: ["supervisor-recent-notifs"] });
    queryClient.invalidateQueries({ queryKey: ["unread-alerts-count"] });
    window.dispatchEvent(new CustomEvent('launcher-badge-refresh'));

    if (isNetworkErrorMode) {
      toast({
        title: "Mode hors ligne",
        description: "L'alerte sera supprimée lors de la reconnexion.",
      });
    } else {
      toast({
        title: "Alerte supprimée",
        description: "L'alerte a été supprimée définitivement.",
      });
    }
  };

  const getAlertTypeStyles = (type: string) => {
    switch (type) {
      case "success":
        return {
          bg: "bg-green-50",
          border: "border-green-200",
          badge: "bg-green-500",
          icon: <CheckCheck className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />,
        };
      case "warning":
        return {
          bg: "bg-yellow-50",
          border: "border-yellow-200",
          badge: "bg-yellow-500",
          icon: <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500" />,
        };
      case "error":
        return {
          bg: "bg-red-50",
          border: "border-red-200",
          badge: "bg-red-500",
          icon: <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-red-500" />,
        };
      default:
        return {
          bg: "bg-blue-50",
          border: "border-blue-200",
          badge: "bg-blue-500",
          icon: <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" />,
        };
    }
  };

  const getUrgencyTag = (type: string, nature?: "braconnage" | "trafic-bois" | "feux_de_brousse" | "autre", isPending?: boolean) => {
    console.log(`[getUrgencyTag] Received type: ${type}, nature: ${nature}, isPending: ${isPending}`);
    if (isPending) {
      return (
        <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs px-2 py-0.5 rounded-md flex items-center justify-center">
          <Clock className="h-3.5 w-3.5 animate-pulse" />
        </Badge>
      );
    }
    let styles = getAlertTypeStyles(type);
    const badgeText = type === "error" ? "Urgent" : type === "warning" ? "Important" : type === "success" ? "Succès" : "Info";

    // Si le type est 'info' (ou par défaut) et que la nature est spécifique, changer la couleur du badge en rouge.
    // On garde le texte "Info" mais avec un fond rouge.
    if ((type === "info" || (type !== "error" && type !== "warning" && type !== "success")) &&
      (nature === "braconnage" || nature === "trafic-bois" || nature === "feux_de_brousse")) {
      styles = { ...styles, badge: "bg-red-500" }; // Utilise la même classe que pour le type 'error'
    }

    return (
      <Badge className={`${styles.badge} text-white text-xs px-2 py-0.5 rounded-md`}>
        {badgeText}
      </Badge>
    );
  };

  const getProvenanceLabel = (role: string) => {
    const lowerRole = role?.toLowerCase() || "";
    switch (lowerRole) {
      case "hunter": // Pour correspondre à (Hunter) dans votre capture
      case "chasseur":
        return "Chasseur";
      case "guide": // Si le rôle est "guide"
      case "guide_chasse": // Si le rôle est "guide_chasse"
      case "hunting-guide": // Autre variation possible
      case "guide de chasse":
        return "Guide de Chasse";
      case "agent secteur":
      case "agent_secteur":
        return "Agent de Secteur";
      case "agent regional":
      case "agent_regional":
        return "Agent Régional";
      case "administrateur":
      case "admin":
        return "Administrateur";
      case "chef_de_poste":
      case "chef de poste":
        return "Chef de Poste";
      case "agent_terrain":
      case "agent terrain":
      case "agent": // Si "agent" est utilisé pour "agent de terrain"
        return "Agent de Terrain";
      default:
        // Pour les rôles non explicitement listés, on essaie de les formater proprement.
        // Remplace les underscores par des espaces et met chaque mot en majuscule.
        if (lowerRole) {
          return lowerRole.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        }
        return "Rôle inconnu";
    }
  };

  const checkGeolocationPermission = async (): Promise<PermissionState> => {
    if (!navigator.permissions) {
      return 'prompt'; // API des permissions non supportée, on suppose que c'est à l'état initial
    }

    try {
      // Utilisation d'une assertion de type plus simple
      const permissionStatus = await navigator.permissions.query({ name: 'geolocation' as any });
      return permissionStatus.state as PermissionState;
    } catch (error) {
      console.warn('Erreur lors de la vérification de la permission de géolocalisation:', error);
      return 'prompt';
    }
  };

  // Fonction pour demander explicitement la permission de géolocalisation
  const requestGeolocationPermission = async () => {
    try {
      // Tester d'abord directement avec getCurrentPosition
      return new Promise<boolean>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve(true),
          (error) => {
            if (error.code === error.PERMISSION_DENIED) {
              resolve(false);
            } else {
              // Autre erreur (position indisponible, timeout, etc.)
              resolve(true); // On continue quand même
            }
          },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      });
    } catch (error) {
      console.error('Erreur lors de la demande de permission:', error);
      return false;
    }
  };

  const handleGetLocation = async () => {
    if (!navigator.geolocation) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "La géolocalisation n'est pas prise en charge par votre navigateur.",
      });
      return false;
    }

    // Avertir si le contexte n'est pas sécurisé (HTTPS requis sur mobile, sauf localhost)
    try {
      if (typeof window !== 'undefined') {
        const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (!isSecure) {
          toast({
            variant: "destructive",
            title: "Contexte non sécurisé",
            description: "Sur mobile, la géolocalisation exige HTTPS. Servez le site en HTTPS (ou utilisez localhost) pour activer la capture GPS.",
            duration: 7000,
          });
        }
      }
    } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e); }

    // Demander explicitement la permission avant de continuer
    const hasPermission = await requestGeolocationPermission();
    if (!hasPermission) {
      toast({
        variant: "destructive",
        title: "Permission requise",
        description: "Veuillez autoriser l'accès à votre position pour continuer.",
        duration: 5000,
      });
      setLocationPermissionDenied(true);
      return false;
    }

    // Vérifier l'état de la permission
    const permissionState = await checkGeolocationPermission();

    if (permissionState === 'denied') {
      setLocationPermissionDenied(true);
      // Essayer de réinitialiser la permission en utilisant une iframe
      try {
        // Cette technique peut forcer le navigateur à redemander la permission
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);

        // Utiliser un try-catch car cette méthode peut échouer selon les navigateurs
        try {
          // @ts-ignore - Propriété expérimentale
          iframe.contentWindow.navigator.permissions.query({ name: 'geolocation' });
        } catch (e) {
          console.log('Méthode de réinitialisation non supportée');
        }

        // Nettoyer
        document.body.removeChild(iframe);
      } catch (e) {
        console.error('Erreur lors de la réinitialisation de la permission:', e);
      }
      toast({
        variant: "destructive",
        title: "Accès à la géolocalisation refusé",
        description: (
          <div className="space-y-2">
            <p>Vous avez refusé l'accès à la géolocalisation. Pour envoyer une alerte :</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Ouvrez les paramètres de votre navigateur</li>
              <li>Recherchez les autorisations de localisation</li>
              <li>Activez l'accès à la localisation pour ce site</li>
              <li>Rafraîchissez la page</li>
            </ol>
            <p className="text-xs mt-2">Sur mobile, vérifiez également les paramètres de localisation de votre appareil.</p>
          </div>
        ),
        duration: 15000,
      });
      return false;
    }

    // Vérifier si la géolocalisation est déjà en cours
    if (isLoadingLocation) {
      return false;
    }

    // Afficher un toast de chargement
    const loadingToast = toast({
      title: "Localisation en cours...",
      description: "Nous cherchons votre position. Veuillez patienter.",
      duration: 10000, // Durée plus longue pour le message de chargement
    });
    setIsLoadingLocation(true);

    // Stratégie deux phases : d'abord rapide (basse précision), puis haute précision
    // Cela évite les timeouts sur desktop où il n'y a pas de GPS matériel.
    const tryGeolocation = (highAccuracy: boolean, timeoutMs: number, maxAge: number): Promise<{ latitude: number; longitude: number } | null> => {
      return new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            const locationData = { latitude, longitude };

            setLocation(locationData);
            setIsLoadingLocation(false);

            console.log('Position obtenue:', { latitude, longitude, accuracy, highAccuracy });

            // Afficher un toast de succès
            toast({
              title: "✅ Position capturée",
              description: (
                <div className="space-y-2">
                  <p>Précision : {Math.round(accuracy)} mètres</p>
                  <p className="text-xs font-mono mt-1">
                    {latitude.toFixed(4)}, {longitude.toFixed(4)}
                  </p>
                </div>
              ),
              duration: 5000,
            });

            resolve(locationData);
          },
          (error) => {
            // Ne pas afficher d'erreur pour la première tentative rapide — on réessaiera
            if (!highAccuracy) {
              console.warn('[Géolocation] Tentative basse précision échouée, bascule vers haute précision.', error.code);
            } else {
              console.warn('[Géolocation] Tentative haute précision échouée:', error.code, error.message);
            }
            resolve(null);
          },
          { enableHighAccuracy: highAccuracy, timeout: timeoutMs, maximumAge: maxAge }
        );
      });
    };

    // Phase 1 : rapide (basse précision, cache récent autorisé, timeout court)
    let result = await tryGeolocation(false, 10000, 30000);

    // Phase 2 : si la phase 1 échoue, haute précision avec timeout plus long
    if (!result) {
      result = await tryGeolocation(true, 60000, 10000);
    }

    // Si les deux phases échouent
    if (!result) {
      setIsLoadingLocation(false);

      toast({
        title: "Erreur GPS",
        description: "Impossible d'obtenir votre position. Vérifiez que la localisation est activée dans vos paramètres.",
        variant: "destructive"
      });
    }

    return result;
  };

  // Déterminer si l'utilisateur peut envoyer des alertes
  const canSendAlerts = (isSectorAgent || isRegionalAgent || isHunter || isGuide || isDefaultRole || isSupervisorRole) && !isAdmin;

  // Effet pour gérer la configuration initiale en fonction du type d'utilisateur
  useEffect(() => {
    // Pour les chasseurs et guides, forcer le type d'alerte à 'autre' (Informations) et afficher la zone de texte
    if (isHunter || isGuide) {
      setSelectedAlertType('autre');
      setAlertNature('autre');
      setShowAlertForm(true); // Activer automatiquement le formulaire pour les chasseurs
    } else {
      // Pour les non-chasseurs, initialiser sans type d'alerte sélectionné
      setSelectedAlertType(null);
    }

    // Auto-capture de la localisation au chargement — UNE SEULE FOIS
    if (canSendAlerts && !locationPermissionDenied && !geoAutoAttemptedRef.current) {
      geoAutoAttemptedRef.current = true;

      const checkLocation = async () => {
        try {
          const permissionState = await checkGeolocationPermission();
          if (permissionState === 'denied') {
            setLocationPermissionDenied(true);
            toast({
              variant: "destructive",
              title: "Accès à la géolocalisation requis",
              description: "L'application a besoin d'accéder à votre position pour envoyer des alertes. Veuillez autoriser l'accès à la géolocalisation dans les paramètres de votre navigateur.",
              duration: 10000,
            });
          } else {
            // Si la permission est accordée ou 'prompt', on essaie de récupérer la position
            // (le prompt s'affichera automatiquement)
            handleGetLocation();
          }
        } catch (error) {
          console.error('Erreur lors de la vérification de la géolocalisation :', error);
        }
      };

      checkLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSendAlerts, locationPermissionDenied]);

  // Gestion de l'envoi d'une alerte
  const handleSendAlert = async () => {
    if (!selectedAlertType) return;
    // Pour chasseurs/guides: exiger une description
    if ((isHunter || isGuide) && (!messageText || !messageText.trim())) {
      toast({
        variant: "destructive",
        title: "Description requise",
        description: "Veuillez décrire l'information avant l'envoi.",
      });
      return;
    }

    try {
      setIsSendingAlert(true);

      // Récupérer en temps réel la position la plus fraîche possible avant l'envoi
      const freshLocation = await handleGetLocation();
      const targetLocation = freshLocation || location;

      if (!targetLocation) {
        toast({
          variant: "destructive",
          title: "Position GPS requise",
          description: "Impossible d'envoyer l'alerte sans coordonnées GPS valides.",
        });
        setIsSendingAlert(false);
        return;
      }

      // Créer l'objet alerte selon le format attendu par l'API
      // Préparer et corriger les coordonnées si inversées (heuristique Sénégal)
      const rawLat = Number(targetLocation.latitude);
      const rawLon = Number(targetLocation.longitude);
      let lat = rawLat;
      let lon = rawLon;
      // Sénégal ~ lat [12,17], lon [-18,-12]. Si on voit lat très négatif et lon positif, on inverse.
      if (isFinite(lat) && isFinite(lon) && lat < -10 && lon > 10 && lon < 30) {
        const tmp = lat; lat = lon; lon = tmp;
        console.warn('[AlertsPage] Coordonnées inversées détectées, application du swap lat/lon.', { before: { rawLat, rawLon }, after: { lat, lon } });
      }

      const alertData = {
        title: (isHunter || isGuide) ? 'Informations' : `Alerte ${selectedAlertType}`,
        message: (isHunter || isGuide) ? messageText.trim() : `Nouvelle alerte de type ${selectedAlertType} détectée`,
        type: (isHunter || isGuide) ? 'info' : 'warning',
        nature: (isHunter || isGuide) ? 'autre' : selectedAlertType,
        zone: `${lat},${lon}`,  // Format attendu: "lat,lon"
        latitude: lat,
        longitude: lon,
        region: user?.region || '',  // Ajout de la région de l'utilisateur
        isRead: false
      };

      console.log('Envoi de l\'alerte:', alertData);

      // Gestion de l'envoi avec support Offline-First complet
      let wasQueuedOffline = false;
      if (!navigator.onLine) {
        // Hors-ligne détecté immédiatement : on met en file d'attente locale
        try { await createOfflineAlert(alertData, 3, []); } catch (e) { console.warn('[Offline] createOfflineAlert fallback error (non-blocking):', e); }
        wasQueuedOffline = true;
        toast({
          title: "Mode hors-ligne",
          description: "Alerte mise en attente. Envoi automatique dès le retour du réseau.",
        });
      } else {
        // Tentative en ligne
        try {
          const responseData: any = await apiRequest({ url: '/api/alerts', method: 'POST', data: alertData });
          if ((responseData as any)?.ok === false) {
            console.error('Erreur API:', responseData);
            throw new Error((responseData as any)?.error || (responseData as any)?.message || 'Échec de l\'envoi de l\'alerte');
          }
          toast({ title: 'Alerte envoyée', description: 'Votre alerte a été envoyée avec succès.' });
        } catch (e: any) {
          const msg = String(e?.message || '').toLowerCase();
          const isServerDown = e?.status === 502 || e?.status === 503 || e?.status === 504;
          // Si l'erreur ressemble à une perte de connexion, on bascule en Offline
          if (msg.includes('fetch') || msg.includes('network') || msg.includes('survenue') || msg.includes('serveur') || isServerDown) {
            try { await createOfflineAlert(alertData, 3, []); } catch (e2) { console.warn('[Offline] createOfflineAlert fallback error (non-blocking):', e2); }
            wasQueuedOffline = true;
            toast({
              title: "Réseau instable",
              description: "Alerte sauvegardée localement. Envoi dès le retour du réseau.",
            });
          } else {
            throw e; // Lancer l'erreur pour la gestion des doublons (409) ou expiration de session (401)
          }
        }
      }

      // Réinitialiser le formulaire
      resetForm();
      setMessageText("");

      // Relancer la géolocalisation automatiquement pour la prochaine alerte
      handleGetLocation();

      if (wasQueuedOffline) {
        // Injection optimiste : ajouter l'alerte en attente dans le cache local
        const pendingAlert: Alert = {
          id: String(Date.now()),  // ID temporaire sous forme de chaîne de caractères
          title: alertData.title,
          message: alertData.message,
          type: alertData.type as any,
          nature: alertData.nature as any,
          isRead: true,
          isPending: true,
          createdAt: new Date().toISOString(),
          region: alertData.region || undefined,
          sender: {
            username: user?.username || 'moi',
            firstName: user?.firstName || '',
            lastName: user?.lastName || '',
            role: user?.role || 'agent',
            region: user?.region || undefined,
          },
          location: { latitude: alertData.latitude, longitude: alertData.longitude },
        };
        queryClient.setQueryData(["/api/alerts/sent", user?.id], (old: any) => {
          const arr = Array.isArray(old) ? old : [];
          return [pendingAlert, ...arr];
        });
      } else {
        // En ligne : recharger les alertes (inbox et outbox)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["/api/alerts/received", user?.id] }),
          queryClient.invalidateQueries({ queryKey: ["/api/alerts/sent", user?.id] })
        ]);
      }

    } catch (error: any) {
      console.error('Erreur lors de l\'envoi de l\'alerte:', error);
      const msg = String(error?.message || '');
      const isDuplicate = msg.includes('déjà été enregistrée') || msg.includes('ALERT_DUPLICATE') || (error?.response?.status === 409);
      if (isDuplicate) {
        const body = error?.body || {};
        setDuplicateModalInfo({
          nature: (isHunter || isGuide) ? 'autre' : selectedAlertType,
          lat: location?.latitude ?? null,
          lon: location?.longitude ?? null,
          self: !!body?.self || String(body?.code || '').toUpperCase() === 'ALERT_DUPLICATE_SELF',
          createdAt: body?.createdAt || null,
          sender: body?.sender || null,
          alertRegion: body?.alertRegion || null,
          alertDepartement: body?.alertDepartement || null,
          alertArrondissement: body?.alertArrondissement || null,
          alertCommune: body?.alertCommune || null,
          radiusMeters: typeof body?.radiusMeters === 'number' ? body.radiusMeters : null,
        });
        setDuplicateModalOpen(true);
      } else if (msg.toLowerCase().includes('non authentifi') || msg.includes('401')) {
        toast({ title: 'Session expirée', description: 'Veuillez vous reconnecter pour envoyer une alerte.', variant: 'destructive' });
      } else {
        toast({
          title: 'Erreur',
          description: 'Une erreur est survenue lors de l\'envoi de l\'alerte. Veuillez réessayer.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsSendingAlert(false);
    }
  };

  // Gestion de la réinitialisation du formulaire
  const resetForm = () => {
    setAlertNature('braconnage'); // Valeur par défaut
    // ON NE RESET PAS LA LOCATION ICI POUR POUVOIR ENVOYER PLUSIEURS ALERTES RAPIDEMENT
    setSelectedAlertType(null);
  };

  // Debug des valeurs de contrôle d'affichage (uniquement en développement)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[AlertsPage] user.role:', user?.role, 'user.type:', (user as any)?.type, {
        isSectorAgent,
        isReadOnlyUser,
        canSendAlerts,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, isSectorAgent, isReadOnlyUser, canSendAlerts]);

  const alertsTotalFooterClass =
    "shrink-0 border-t border-gray-200 bg-white py-2.5 px-3 text-center text-sm text-muted-foreground " +
    (isAlertMobileChromeless
      ? "fixed left-0 right-0 z-[240] bottom-[56px] shadow-[0_-1px_4px_rgba(0,0,0,0.06)] md:static md:z-auto md:bottom-auto md:rounded-b-lg md:shadow-none"
      : "rounded-b-lg");

  const showInboxTotalFooter = activeTab === "inbox" && filteredInbox.length > 0;
  const showOutboxTotalFooter = activeTab !== "inbox" && sentAlertsData.length > 0;
  const listScrollPadding =
    isAlertMobileChromeless && (showInboxTotalFooter || showOutboxTotalFooter)
      ? "pb-20 md:pb-0"
      : "";

  const mobileAlertLayout = isAlertMobileChromeless && canSendAlerts;
  const mobileSupervisorLayout = isAlertMobileChromeless && !canSendAlerts;

  const showLeftColumn = canSendAlerts && !((isHunter || isGuide) && activeTab === 'outbox') && !(activeTab === 'inbox' && (isRegionalAgent || isSectorAgent));

  return (
    <div className={isHunter || isGuide || isAlertMobileChromeless ? "fixed inset-0 flex flex-col overflow-hidden bg-slate-50" : `flex flex-col overflow-hidden bg-[#2d6a4f] h-[100dvh]`}>
      {(isHunter || isGuide || isAlertMobileChromeless) && <AgentTopHeader />}
      <div className={isHunter || isGuide ? "flex-1 overflow-y-auto overflow-x-hidden no-scrollbar overscroll-contain pb-24" : isAlertMobileChromeless ? "flex-1 flex flex-col min-h-0 overflow-hidden" : `w-full flex-1 flex flex-col min-h-0 justify-center px-2 sm:px-4 py-2 sm:py-3 lg:py-4`}>
        <div className={isHunter || isGuide ? "w-full max-w-3xl flex flex-col flex-1 min-h-0 mx-auto px-2 sm:px-4 py-4" : `w-full flex flex-col flex-1 min-h-0 mx-auto`}>
          {/* Bouton Retour + Actions - Barre supérieure */}
          <div className="shrink-0 bg-white rounded-t-lg shadow-sm border border-b-0 border-gray-200 px-3 py-2 flex flex-wrap items-center gap-2 justify-between">
            {/* Bouton Retour — visible pour tous, redirige vers l'accueil du domaine */}
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-600 hover:text-gray-900 flex items-center gap-2 transition-all hover:bg-gray-100"
              onClick={() => {
                const _alertDomain = (typeof window !== 'undefined' ? localStorage.getItem('domain') || '' : '').toUpperCase();
                const isAlerte = _alertDomain === 'ALERTE' ||
                  ((_alertDomain !== 'CHASSE' && _alertDomain !== 'REBOISEMENT') &&
                    ((user as any)?.isSupervisorRole || (user as any)?.isDefaultRole));
                if (isAlerte) {
                  navigate((user as any)?.isSupervisorRole ? '/supervisor' : '/default-home');
                } else {
                  window.history.back();
                }
              }}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="font-medium">Retour</span>
            </Button>
            <div className="flex flex-wrap gap-2">
              {(isDefaultRole || isSupervisorRole) && (
                <Button
                  onClick={() => {
                    let smsPath = "/sms";
                    if (user?.type === "secteur" || user?.role === "sub-agent") {
                      smsPath = "/sector-sms";
                    }
                    navigate(smsPath);
                  }}
                  className="relative flex items-center justify-center h-9 w-9 p-0 rounded-lg bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-700 hover:to-green-800 text-white shadow-sm transition-all active:scale-95"
                  title="Messagerie SMS"
                >
                  <MessageSquare className="h-4 w-4" />
                  {msgUnread > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center shadow-md animate-pulse">
                      {msgUnread}
                    </span>
                  )}
                </Button>
              )}
              {unreadCount > 0 && activeTab === "inbox" && !isDefaultRole && (
                <Button
                  variant="outline"
                  className="border-blue-300 text-blue-600 hover:bg-blue-50 transition-colors rounded-lg text-xs sm:text-sm h-9"
                  onClick={markAllAsRead}
                >
                  <CheckCheck className="h-4 w-4 mr-2 hidden sm:inline" />
                  Marquer tout comme lu
                </Button>
              )}
              {/* Bouton "Activer les notifications" masqué : la permission est gérée automatiquement à l'installation de l'APK */}
            </div>
          </div>

          {/* Mobile Alerte : formulaire compact puis liste ; desktop : 2 colonnes */}
          <div
            className={
              mobileAlertLayout
                ? (showLeftColumn
                  ? `flex flex-1 min-h-0 flex-col gap-2 ${!(isHunter || isGuide) ? "lg:grid lg:grid-cols-[minmax(340px,420px)_1fr]" : "max-w-2xl mx-auto w-full"} lg:gap-4`
                  : "flex flex-1 min-h-0 flex-col")
                : mobileSupervisorLayout
                  ? "flex flex-1 min-h-0 flex-col"
                  : (showLeftColumn
                    ? `flex flex-1 min-h-0 flex-col ${!(isHunter || isGuide) ? "lg:grid lg:grid-cols-[minmax(340px,420px)_1fr]" : "max-w-2xl mx-auto w-full"} gap-0 lg:gap-4`
                    : "flex flex-1 min-h-0 flex-col")
            }
          >

            {/* === COLONNE GAUCHE : Formulaire d'envoi === */}
            {showLeftColumn && (
              <div
                className={
                  mobileAlertLayout
                    ? "shrink-0 max-h-[38vh] overflow-y-auto no-scrollbar rounded-lg border border-gray-200 bg-white p-3 shadow-md lg:max-h-none lg:overflow-visible lg:p-4 lg:sticky lg:top-4 lg:self-start"
                    : "bg-white rounded-b-lg lg:rounded-lg shadow-md border border-gray-200 p-4 lg:sticky lg:top-4 lg:self-start"
                }
              >
                <h3 className={`font-semibold text-gray-800 ${mobileAlertLayout ? "mb-2 text-base" : "mb-3 text-lg"}`}>
                  {(isHunter || isGuide) ? 'Envoyer une information' : 'Envoyer une alerte rapide'}
                </h3>

                {/* Géolocalisation status */}
                {!location ? (
                  <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${locationPermissionDenied ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                    <MapPin className={`h-5 w-5 ${locationPermissionDenied ? 'text-red-500' : 'text-emerald-500 animate-pulse'}`} />
                    <div>
                      <p className="font-semibold text-sm">
                        {locationPermissionDenied
                          ? 'Accès refusé'
                          : isLoadingLocation
                            ? 'Récupération de la position...'
                            : 'En attente de position GPS...'}
                      </p>
                      {locationPermissionDenied && (
                        <p className="text-xs mt-0.5">Veuillez autoriser l'accès à votre position dans les paramètres de votre navigateur.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 mb-3">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-emerald-600 mt-0.5" />
                        <div className="flex flex-col">
                          <span className="text-sm text-emerald-800 font-medium">Position enregistrée</span>
                          <span className="text-xs text-emerald-600 mt-0.5">{location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={handleGetLocation}
                        disabled={isLoadingLocation}
                        className={`h-8 w-8 rounded-lg bg-emerald-100/80 hover:bg-emerald-200 border border-emerald-300 text-emerald-700 hover:text-emerald-950 transition-colors ${isLoadingLocation ? 'animate-spin' : ''}`}
                        title="Re-capturer ma position"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Type d'alerte buttons */}
                {!isHunter && !isGuide && location && (
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <Button
                      variant="outline"
                      onClick={() => setSelectedAlertType('braconnage')}
                      className={`relative flex flex-col items-center justify-center gap-1 py-3 h-auto border-2 rounded-xl transition-all ${selectedAlertType === 'braconnage'
                        ? 'bg-red-50 border-red-400 text-red-600 ring-2 ring-red-100'
                        : 'hover:bg-red-50 hover:border-red-300 border-gray-200'
                        }`}
                    >
                      <NatureIcon nature="braconnage" size={24} />
                      <span className="text-[10px] sm:text-xs">Braconnage</span>
                      {selectedAlertType === 'braconnage' && (
                        <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setSelectedAlertType('trafic-bois')}
                      className={`relative flex flex-col items-center justify-center gap-1 py-3 h-auto border-2 rounded-xl transition-all ${selectedAlertType === 'trafic-bois'
                        ? 'bg-amber-50 border-amber-400 text-amber-700 ring-2 ring-amber-100'
                        : 'hover:bg-amber-50 hover:border-amber-300 border-gray-200'
                        }`}
                    >
                      <NatureIcon nature="trafic-bois" size={24} />
                      <span className="text-[10px] sm:text-xs">Trafic de bois</span>
                      {selectedAlertType === 'trafic-bois' && (
                        <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full"></span>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setSelectedAlertType('feux_de_brousse')}
                      className={`relative flex flex-col items-center justify-center gap-1 py-3 h-auto border-2 rounded-xl transition-all ${selectedAlertType === 'feux_de_brousse'
                        ? 'bg-orange-50 border-orange-400 text-orange-600 ring-2 ring-orange-100'
                        : 'hover:bg-orange-50 hover:border-orange-300 border-gray-200'
                        }`}
                    >
                      <NatureIcon nature="feux_de_brousse" size={24} />
                      <span className="text-[10px] sm:text-xs">Feux de brousse</span>
                      {selectedAlertType === 'feux_de_brousse' && (
                        <span className="absolute top-1 right-1 w-2 h-2 bg-orange-500 rounded-full"></span>
                      )}
                    </Button>
                  </div>
                )}

                {/* Action Area (Textarea + Send Button) */}
                {location ? (
                  (selectedAlertType || isHunter || isGuide) ? (
                    <div className="mt-4 p-3 bg-white border border-gray-100 rounded-md shadow-sm">
                      {(isHunter || isGuide) && (
                        <div className="mb-4">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Décrivez l'information</label>
                          <Textarea
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            placeholder="Ex: Observation d'activité suspecte, détails utiles, etc."
                            className="bg-white text-gray-800"
                            rows={4}
                          />
                          <p className="text-[11px] text-gray-500 mt-1">Une description est obligatoire pour envoyer une information.</p>
                        </div>
                      )}

                      <div className="pt-2">
                        <Button
                          className="w-full bg-green-600 hover:bg-green-700 h-11 text-base font-bold transition-all"
                          onClick={handleSendAlert}
                          disabled={isSendingAlert}
                        >
                          {isSendingAlert ? (
                            <>
                              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Envoi en cours...
                            </>
                          ) : (
                            (isHunter || isGuide
                              ? 'Envoyer une information'
                              : `Envoyer l'alerte ${selectedAlertType === 'braconnage' ? 'de braconnage' :
                                selectedAlertType === 'trafic-bois' ? 'de trafic de bois' :
                                  selectedAlertType === 'feux_de_brousse' ? 'de feux de brousse' : 'd\'informations'}`)
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {!alertTypeHintDismissed && (
                        <div
                          className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200/90 bg-amber-50 px-2.5 py-2 text-xs text-amber-950 shadow-sm"
                          role="status"
                        >
                          <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" aria-hidden />
                          <p className="flex-1 leading-snug">
                            <span className="font-semibold">Type d&apos;alerte requis.</span>{' '}
                            Choisissez Braconnage, Trafic ou Feux ci-dessus.
                          </p>
                          <button
                            type="button"
                            onClick={dismissAlertTypeHint}
                            className="shrink-0 rounded-md p-0.5 text-amber-700 hover:bg-amber-100/80"
                            aria-label="Fermer l'info"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                      {alertTypeHintDismissed && (
                        <button
                          type="button"
                          onClick={() => setAlertTypeHintDismissed(false)}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-800 hover:text-amber-950"
                        >
                          <Info className="h-3.5 w-3.5" />
                          Aide : choisir un type d&apos;alerte
                        </button>
                      )}
                    </>
                  )
                ) : null}
              </div>
            )}

            {/* === COLONNE DROITE : Liste des alertes === */}
            {!(isHunter || isGuide) && (
              <div
                className={
                  mobileAlertLayout
                    ? "flex min-h-0 flex-1 flex-col rounded-lg border border-gray-200 bg-white shadow-md"
                    : mobileSupervisorLayout
                      ? "flex min-h-0 flex-1 flex-col rounded-lg border border-gray-200 bg-white shadow-md"
                      : "bg-white rounded-b-lg lg:rounded-lg shadow-md border border-gray-200 flex flex-col min-h-0 flex-1"
                }
              >
                {isSupervisorRole && (
                  <div className="shrink-0 px-4 py-3 border-b flex items-center justify-between bg-slate-50">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setActiveTab('inbox')}
                        className={`text-xs font-semibold rounded-full px-4 py-1.5 border transition-all ${activeTab === 'inbox'
                          ? 'bg-green-600 border-green-600 text-white shadow-sm'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                          }`}
                      >
                        Alertes reçues
                      </button>
                      <button
                        onClick={() => setActiveTab('outbox')}
                        className={`text-xs font-semibold rounded-full px-4 py-1.5 border transition-all ${activeTab === 'outbox'
                          ? 'bg-green-600 border-green-600 text-white shadow-sm'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                          }`}
                      >
                        Alertes envoyées
                      </button>
                    </div>
                    <div className="text-xs text-gray-500 font-medium">
                      {activeTab === 'inbox' ? `${alerts.length} reçue(s)` : `${sentAlertsData.length} envoyée(s)`}
                    </div>
                  </div>
                )}
                {/* === Barre de filtrage compacte mobile (icônes + compteurs) === */}
                {activeTab === 'inbox' && (isAlertMobileChromeless || isDefaultRole || isSupervisorRole) && (() => {
                  const base = Array.isArray(alerts) ? alerts : [];
                  const counts = {
                    feux_de_brousse: base.filter(a => { const n = (a.nature || '').toLowerCase(); return n.includes('feu') || n.includes('brousse'); }).length,
                    'trafic-bois': base.filter(a => { const n = (a.nature || '').toLowerCase(); return n.includes('trafic') || n.includes('bois'); }).length,
                    braconnage: base.filter(a => { const n = (a.nature || '').toLowerCase(); return n.includes('braconn'); }).length,
                    autre: base.filter(a => { const n = (a.nature || '').toLowerCase(); return !n.includes('feu') && !n.includes('brousse') && !n.includes('trafic') && !n.includes('bois') && !n.includes('braconn'); }).length,
                  };
                  const categories = [
                    { key: 'all', icon: '📋', label: 'Tout', color: '#059669', count: base.length },
                    { key: 'feux_de_brousse', icon: '🔥', label: 'Feux', color: '#ea580c', count: counts.feux_de_brousse },
                    { key: 'trafic-bois', icon: '🪵', label: 'Bois', color: '#8B5A2B', count: counts['trafic-bois'] },
                    { key: 'braconnage', icon: '🎯', label: 'Braconn.', color: '#dc2626', count: counts.braconnage },
                    { key: 'autre', icon: 'ℹ️', label: 'Info', color: '#6b7280', count: counts.autre },
                  ];
                  return (
                    <div className="shrink-0 border-b border-gray-200 bg-white md:hidden">
                      <div className="flex items-stretch overflow-x-auto no-scrollbar">
                        {categories.map(({ key, icon, label, color, count }) => {
                          const isActive = typeFilter === key;
                          return (
                            <button
                              key={key}
                              onClick={() => setTypeFilter(key)}
                              className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-2 px-1 text-center transition-all border-b-2 ${isActive ? 'border-current bg-gray-50' : 'border-transparent'}`}
                              style={{ color: isActive ? color : '#9ca3af' }}
                            >
                              <span className="text-base leading-none">{icon}</span>
                              <span className="text-[9px] font-bold leading-tight truncate w-full">{label}</span>
                              <span
                                className="text-[10px] font-extrabold rounded-full min-w-[18px] h-[16px] px-1 flex items-center justify-center leading-none"
                                style={{ background: isActive ? color : '#e5e7eb', color: isActive ? '#fff' : '#6b7280' }}
                              >
                                {count}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                {/* Barre d'actions inbox (recherche/filtre/tri) — fixe */}
                {activeTab === 'inbox' && (
                  <div className="shrink-0 px-4 py-3 border-b hidden md:flex flex-col gap-2 md:flex-row md:items-center md:justify-between bg-white">
                    <div className="w-full md:max-w-md relative">
                      <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                        placeholder="Rechercher une alerte..."
                      />
                    </div>

                    <div className="flex items-center gap-2 justify-end">
                      <div className="hidden md:block">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="gap-2">
                              <Filter className="h-4 w-4" />
                              {typeFilter === "all" ? "Filtrer" :
                                typeFilter === "braconnage" ? "Braconnage" :
                                  typeFilter === "trafic-bois" ? "Trafic de bois" :
                                    typeFilter === "feux_de_brousse" ? "Feux de brousse" : "Autre / Information"}
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => setTypeFilter("all")}>
                              Toutes les alertes
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setTypeFilter("braconnage")}>
                              Braconnage
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setTypeFilter("trafic-bois")}>
                              Trafic de bois
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setTypeFilter("feux_de_brousse")}>
                              Feux de brousse
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setTypeFilter("autre")}>
                              Autre / Information
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setSortNewestFirst((v) => !v)}
                        title={sortNewestFirst ? 'Tri: plus récent' : 'Tri: plus ancien'}
                      >
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                <div className={`flex-1 min-h-0 overflow-y-auto no-scrollbar ${listScrollPadding}`}>
                  {activeTab === "inbox" ? (
                    (isLoadingAlerts && alerts.length === 0) ? (
                      <div className="flex justify-center items-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                    ) : filteredInbox.length === 0 ? (
                      (isHunter || isGuide)
                        ? null
                        : (
                          <Card className="border-dashed border-gray-300 bg-gray-50 m-4">
                            <CardContent className="flex flex-col items-center justify-center py-8">
                              <Bell className="h-10 w-10 text-gray-400 mb-2" />
                              <p className="text-gray-500 text-center">Aucune alerte reçue pour le moment.</p>
                            </CardContent>
                          </Card>
                        )
                    ) : (
                      <>
                        <div className="px-4 py-3 border-b bg-slate-50">
                          <div className="font-semibold text-gray-800">Liste des Alertes</div>
                        </div>
                        {/* Grille responsive pour les cartes d'alerte */}
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-0 xl:gap-3 xl:p-3">
                          {filteredInbox.map((alert: Alert) => {
                            const styles = getAlertTypeStyles(alert.type);
                            const senderStrip = getSenderRoleStyle(alert.sender);
                            const createdAtDate = alert.createdAt ? new Date(alert.createdAt) : null;
                            const timeAgo = createdAtDate && !isNaN(createdAtDate.getTime())
                              ? formatDistanceToNow(createdAtDate, { addSuffix: true, locale: fr })
                              : '';
                            const formatted = createdAtDate && !isNaN(createdAtDate.getTime())
                              ? format(createdAtDate, "dd/MM/yyyy à HH:mm", { locale: fr })
                              : '';

                            return (
                              <div key={alert.id} className={"flex gap-3 px-4 py-3 xl:rounded-xl xl:border xl:border-gray-100 xl:shadow-sm xl:bg-white hover:bg-slate-50 transition-colors cursor-pointer " + senderStrip}
                                onClick={() => {
                                  setDetailsAlert(alert);
                                  setDetailsOpen(true);
                                  if (!alert.isRead) markAsRead(alert.id);
                                }}
                              >
                                <div className="shrink-0 flex items-center justify-center">
                                  <div className={"h-9 w-9 rounded-full flex items-center justify-center border " + styles.border + " " + styles.bg}>
                                    {alert.nature ? <NatureIcon nature={alert.nature} size={18} /> : styles.icon}
                                  </div>
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <div className="font-semibold text-gray-900 truncate">{alert.title}</div>
                                    {getUrgencyTag(alert.type, alert.nature, alert.isPending)}
                                    {!alert.isRead && (
                                      <Badge variant="secondary" className="bg-blue-100 text-blue-800">Non lu</Badge>
                                    )}
                                  </div>

                                  <div className="mt-0.5 text-sm text-gray-700 flex flex-wrap gap-x-4 gap-y-1">
                                    <div className="flex items-center gap-1">
                                      <User className="h-4 w-4 text-gray-500" />
                                      <span>
                                        {alert.sender?.role === 'agent' && alert.sender?.grade
                                          ? alert.sender.grade
                                          : (alert.sender?.firstName ?? alert.sender?.username ?? 'Utilisateur')}
                                        {alert.sender?.lastName ? ` ${alert.sender.lastName}` : ''}
                                        {' '}({alert.sender?.role === 'agent' && alert.sender?.roleMetier 
                                          ? alert.sender.roleMetier 
                                          : getProvenanceLabel(alert.sender?.role ?? 'unknown')})
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <MapPin className="h-4 w-4 text-gray-500" />
                                      <span>{formatAlertLocation(alert)}</span>
                                    </div>
                                  </div>

                                  <div className="mt-0.5 text-sm text-gray-500">
                                    {timeAgo ? (
                                      <>
                                        <span>{timeAgo}</span>
                                        <span className="ml-2">({formatted})</span>
                                      </>
                                    ) : (
                                      <span>-</span>
                                    )}
                                  </div>
                                </div>

                                <div className="shrink-0 flex flex-col sm:flex-row items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => {
                                      const lat = alert.location?.latitude;
                                      const lon = alert.location?.longitude;
                                      if (lat && lon) {
                                        markAsRead(alert.id).finally(() => {
                                          handleLocate(lat, lon, alert.title);
                                        });
                                      }
                                    }}
                                    disabled={!alert.location}
                                    title="Localiser"
                                  >
                                    <MapPin className="h-4 w-4" />
                                  </Button>
                                  {user?.role === 'admin' && (
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => deleteAlert(alert.id)}
                                      title="Supprimer"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )
                  ) : (
                    (isLoadingSent && sentAlertsData.length === 0) ? (
                      <div className="flex justify-center items-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                    ) : sentAlertsData.length === 0 ? (
                      <Card className="border-dashed border-gray-300 bg-gray-50 m-4">
                        <CardContent className="flex flex-col items-center justify-center py-8">
                          <Bell className="h-10 w-10 text-gray-400 mb-2" />
                          <p className="text-gray-500 text-center">Aucune alerte envoyée pour le moment.</p>
                        </CardContent>
                      </Card>
                    ) : (
                      <>
                        {sentAlertsData.map((alert: Alert) => (
                          <MessageBubble
                            key={alert.id}
                            alert={alert}
                            isExpanded={expandedAlerts.includes(alert.id)}
                            onLocate={handleLocate}
                            toggleExpand={toggleExpand}
                            markAsRead={markAsRead}
                            deleteAlert={deleteAlert}
                            getAlertTypeStyles={getAlertTypeStyles}
                            getUrgencyTag={getUrgencyTag}
                            getSenderRoleStyle={getSenderRoleStyle}
                            getProvenanceLabel={getProvenanceLabel}
                            isSent={true}
                          />
                        ))}
                      </>
                    )
                  )}
                </div>

                {showInboxTotalFooter && (
                  <div className={alertsTotalFooterClass}>
                    Total d&apos;alertes reçues : {alerts.length}
                  </div>
                )}
                {showOutboxTotalFooter && (
                  <div className={alertsTotalFooterClass}>
                    Total d&apos;alertes envoyées : {sentAlertsData.length}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal détails alerte — compact, auto-marqué lu à l'ouverture */}
      <Dialog
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) setDetailsAlert(null);
        }}
      >
        <DialogContent className="w-[92vw] max-w-md p-0 gap-0 overflow-hidden rounded-2xl border-slate-200">
          {detailsAlert && (
            <>
              <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-4 text-white">
                <DialogHeader className="space-y-1 text-left">
                  <DialogTitle className="text-lg font-semibold text-white">Détails de l&apos;alerte</DialogTitle>
                </DialogHeader>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{detailsAlert.title}</span>
                  {getUrgencyTag(detailsAlert.type, detailsAlert.nature, detailsAlert.isPending)}
                </div>
              </div>

              <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto no-scrollbar">
                <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed bg-slate-50 rounded-xl p-3 border border-slate-100">
                  {detailsAlert.message}
                </p>

                <div className="rounded-xl border border-slate-100 bg-white p-3 space-y-2">
                  <div className="flex items-start gap-2 text-sm text-gray-700">
                    <User className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Agent</p>
                      <p className="font-medium text-gray-900">
                        {detailsAlert.sender?.role === 'agent' && detailsAlert.sender?.grade
                          ? detailsAlert.sender.grade
                          : (detailsAlert.sender?.firstName ?? detailsAlert.sender?.username ?? 'Utilisateur')}
                        {detailsAlert.sender?.lastName ? ` ${detailsAlert.sender.lastName}` : ''}
                        <span className="text-gray-500 font-normal">
                          {' '}({detailsAlert.sender?.role === 'agent' && detailsAlert.sender?.roleMetier 
                            ? detailsAlert.sender.roleMetier 
                            : getProvenanceLabel(detailsAlert.sender?.role ?? 'unknown')})
                        </span>
                      </p>
                    </div>
                  </div>
                  {detailsAlert.sender?.phone ? (
                    <div className="flex items-start gap-2 text-sm">
                      <Phone className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Téléphone</p>
                        <a
                          href={`tel:${String(detailsAlert.sender.phone).replace(/\s/g, '')}`}
                          className="font-medium text-emerald-700 hover:underline"
                        >
                          {detailsAlert.sender.phone}
                        </a>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-xl border border-slate-100 bg-white p-3">
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <div className="space-y-1.5 min-w-0">
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Lieux</p>
                      <p className="font-medium text-gray-900">{formatAlertLocation(detailsAlert)}</p>
                      {detailsAlert.arrondissement ? (
                        <p className="text-gray-600">
                          <span className="text-slate-500">Arrondissement :</span> {detailsAlert.arrondissement}
                        </p>
                      ) : null}
                      {detailsAlert.commune ? (
                        <p className="text-gray-600">
                          <span className="text-slate-500">Commune :</span> {detailsAlert.commune}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>

                {user?.role === 'admin' && (
                  <div className="flex justify-end pt-1 border-t border-slate-100">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => { deleteAlert(detailsAlert.id); setDetailsOpen(false); }}
                    >
                      <Trash2 className="h-4 w-4 mr-1.5" />
                      Supprimer
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de localisation */}
      <Dialog open={locationModalOpen} onOpenChange={(v) => {
        setLocationModalOpen(v);
        if (!v) {
          setIframeMode('view');
          setOrigin(null);
        }
      }}>
        {/* sm: override width limits of dialog content, remove padding */}
        <DialogContent className="sm:max-w-[95vw] w-[95vw] h-[90vh] p-0">
          <div className="flex flex-col h-full w-full">
            <DialogHeader className="px-4 py-3 border-b shrink-0 flex items-center justify-between">
              <DialogTitle>{selectedAlertTitle || "Localisation de l'alerte"}</DialogTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={startDirections}>
                  Itinéraire (Google)
                </Button>
              </div>
            </DialogHeader>
            {/* Info bar: coordinates and distance */}
            <div className="px-4 py-2 text-sm text-gray-700 border-b flex flex-wrap gap-4 items-center">
              {selectedLocation && (() => {
                const utm = latLonToUTM(selectedLocation.lat, selectedLocation.lon);
                return (
                  <>
                    <span><strong>Lat/Lon:</strong> {selectedLocation.lat.toFixed(6)}, {selectedLocation.lon.toFixed(6)}</span>
                    <span><strong>UTM:</strong> Zone {utm.zoneNumber}{utm.hemisphere} E {utm.easting} N {utm.northing}</span>
                    <span>
                      <strong>Distance:</strong> {originLoading ? '...' : distanceKm != null ? `${distanceKm.toFixed(2)} km` : '—'}
                    </span>
                  </>
                );
              })()}
            </div>
            <div className="relative flex-1 w-full h-full">
              {selectedLocation && (
                googleJsKey ? (
                  <div id="modal-google-map" className="absolute inset-0 w-full h-full" />
                ) : (
                  <iframe
                    key={`${iframeMode}-${origin?.lat ?? 'x'}`}
                    className="absolute inset-0 w-full h-full"
                    style={{ border: 0 }}
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                    src={getGoogleEmbedSrc()}
                  />
                )
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal d'information en cas de doublon d'alerte */}
      <Dialog open={duplicateModalOpen} onOpenChange={setDuplicateModalOpen}>
        <DialogContent className="sm:max-w-[340px] rounded-2xl border-0 border-t-4 border-t-green-500 p-6 shadow-lg gap-0">
          <div className="flex flex-col items-center text-center pt-1">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-blue-100">
              <Info className="h-5 w-5 text-blue-500" strokeWidth={2.5} />
            </div>
            <DialogTitle className="text-lg font-semibold text-gray-900 text-center w-full block">
              Zone d'alerte déjà identifiée
            </DialogTitle>
            <div className="mt-3 text-sm leading-relaxed text-gray-800 space-y-3 w-full">
              <p>
                <span className="font-semibold block mb-0.5">Information</span>
                Une alerte similaire a déjà été enregistrée à proximité.
              </p>
              {duplicateModalInfo?.nature ? (
                <p>
                  <span className="font-semibold block mb-0.5">Nature</span>
                  {duplicateModalInfo.nature}
                  {(() => {
                    const c = duplicateModalInfo?.createdAt ? new Date(duplicateModalInfo.createdAt) : null;
                    if (!c || isNaN(c.getTime())) return null;
                    const two = (n: number) => n.toString().padStart(2, '0');
                    const hhmm = `${two(c.getHours())}:${two(c.getMinutes())}`;
                    const ddmmyyyy = `${two(c.getDate())}/${two(c.getMonth() + 1)}/${c.getFullYear()}`;
                    return <span className="block text-xs text-gray-500 mt-0.5">{hhmm} le {ddmmyyyy}</span>;
                  })()}
                </p>
              ) : null}
              {duplicateModalInfo?.lat != null && duplicateModalInfo?.lon != null && (
                <div className="space-y-1">
                  <p>
                    <span className="font-semibold block mb-0.5">Coordonnées (WGS84)</span>
                    {duplicateModalInfo.lat?.toFixed(4)}, {duplicateModalInfo.lon?.toFixed(4)}
                  </p>
                  <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded-md border border-gray-100 mx-auto w-fit">
                    <span className="font-medium text-gray-700">Lieux :</span><br />
                    {[
                      duplicateModalInfo.alertRegion,
                      duplicateModalInfo.alertDepartement,
                      duplicateModalInfo.alertArrondissement,
                      duplicateModalInfo.alertCommune
                    ].filter(Boolean).join(' / ') || 'Non spécifié'}
                  </p>
                </div>
              )}
              <p>
                <span className="font-semibold block mb-0.5">Signataire</span>
                {(() => {
                  if (duplicateModalInfo?.self) {
                    return <span className="font-medium">par vous</span>;
                  }
                  const s = duplicateModalInfo?.sender || {} as any;
                  const first = (s.first_name || '').toString().trim();
                  const last = (s.last_name || '').toString().trim();
                  const username = (s.username || '').toString().trim();
                  const hasName = !!(first || last || username);
                  const displayName = hasName ? `${first} ${last}`.trim() || username || 'Agent' : 'Agent';
                  const sRole = (s.role || '').toString().toLowerCase().replace(/[_\s-]+/g, '-');
                  const isSect = sRole === 'sub-agent' || sRole.includes('agent-secteur') || sRole.includes('sector');
                  const org = isSect ? 'Secteur' : 'IREF';
                  const dep = (((s?.departement || duplicateModalInfo?.alertDepartement) || '') as string).toUpperCase().trim();
                  const region = (((s?.region || duplicateModalInfo?.alertRegion) || '') as string).toUpperCase().trim();
                  let loc = '';
                  if (isSect && (dep || region)) {
                    loc = dep && region ? `${dep} / ${region}` : (dep || region);
                  } else if (!isSect && region) {
                    loc = region;
                  }
                  return (
                    <span className="font-medium">
                      {displayName}
                      <span className="block text-xs text-gray-500 mt-0.5">Agent/{org}{loc ? ` (${loc})` : ''}</span>
                    </span>
                  );
                })()}
              </p>
              <div className="inline-flex items-center justify-center text-xs text-green-800 bg-green-50 border border-green-200 rounded-full px-3 py-1">
                <span className="font-semibold mr-1">Rayon :</span> <span className="font-bold">{duplicateModalInfo?.radiusMeters ?? 20} mètres</span>
              </div>
            </div>
          </div>
          <div className="mt-8 flex justify-center w-full">
            <Button
              type="button"
              onClick={() => setDuplicateModalOpen(false)}
              className="w-full rounded-xl bg-slate-900 px-6 py-2.5 text-white font-medium hover:bg-slate-800 active:scale-95 transition-all"
            >
              Compris
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export default AlertsPage;
