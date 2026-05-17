import { NatureIcon } from "@/components/icons/AlertNatureIcons";
import AgentTopHeader from "@/components/layout/AgentTopHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft, ArrowUpDown, Bell, CheckCheck, ChevronDown, ChevronUp, Filter, Info, MapPin, MessageSquare, Search, Trash2, User } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";

import { useNotifications } from "@/hooks/use-notifications";

// Type pour l'état de la permission
type PermissionState = 'granted' | 'denied' | 'prompt';

interface Alert {
  id: number;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  nature?: "braconnage" | "trafic-bois" | "feux_de_brousse" | "autre";
  isRead: boolean;
  createdAt: string;
  // Localisation dérivée des coordonnées (provenant du backend)
  region?: string | null;
  departement?: string | null;
  // Accusés de lecture (rôles) côté expéditeur
  readByRoles?: string[];
  isDeletionRequest?: boolean;
  concernedHunters?: { id: number; name: string }[];
  sender: {
    username: string;
    firstName: string;
    lastName: string;
    role: string;
    region?: string;
    departement?: string;
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
  toggleExpand: (id: number) => void;
  markAsRead: (id: number) => Promise<void>;
  deleteAlert: (id: number) => Promise<void>;
  getAlertTypeStyles: (type: string) => { bg: string; border: string; badge: string; icon: JSX.Element };
  getUrgencyTag: (type: string, nature?: "braconnage" | "trafic-bois" | "feux_de_brousse" | "autre") => JSX.Element;
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
  // L'alerte est passée directement, pas imbriquée
  const actualAlertData = alertData;

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

  return (
    <div
      className={`flex ${isSent ? "justify-end" : "justify-start"} mb-3 sm:mb-4`}
    >
      <div
        className={`max-w-[80%] sm:max-w-[70%] md:max-w-[60%] p-3 sm:p-4 rounded-2xl shadow-md transition-all duration-300 ${
          isSent ? "bg-blue-100 text-gray-800" : "bg-gray-200 text-gray-800"
        } ${senderRoleStyle}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            {actualAlertData.nature ? <NatureIcon nature={actualAlertData.nature} size={20} /> : styles.icon}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm sm:text-lg">{actualAlertData.title}</h3>
                {getUrgencyTag(actualAlertData.type, actualAlertData.nature)}
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
              <div className="text-sm sm:text-base text-gray-500 font-medium">
                {isSent ? (
                  <>
                    <span>Envoyé {timeAgo}</span>
                    <span className="ml-2">({formattedDateTime})</span>
                  </>
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
              {isSent && Array.isArray(actualAlertData.readByRoles) && actualAlertData.readByRoles.length > 0 && (
                <div className="ml-auto mr-2 text-xs text-gray-600 self-center">
                  Message lu ({actualAlertData.readByRoles.join('; ')})
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => deleteAlert(actualAlertData.id)}
                className="border-red-300 text-red-600 hover:bg-red-50 transition-colors rounded-lg text-xs sm:text-sm"
              >
                <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                Supprimer
              </Button>
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

function AlertsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

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
  const [expandedAlerts, setExpandedAlerts] = useState<number[]>([]);
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
    radiusMeters?: number | null;
  } | null>(null);
  // État pour suivre si l'accès à la géolocalisation a été refusé
  const [locationPermissionDenied, setLocationPermissionDenied] = useState<boolean>(false);
  const [currentPageInbox, setCurrentPageInbox] = useState(1);
  const [currentPageOutbox, setCurrentPageOutbox] = useState(1);
  const itemsPerPage = 10;

  const [searchQuery, setSearchQuery] = useState("");
  const [sortNewestFirst, setSortNewestFirst] = useState(true);

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
    if (isReadOnlyUser && activeTab !== "inbox") {
      setActiveTab("inbox");
    }
  }, [isReadOnlyUser, activeTab, setActiveTab]);

  useEffect(() => {
    if (isDefaultRole && activeTab !== 'outbox') {
      setActiveTab('outbox');
    }
  }, [isDefaultRole, activeTab]);

  // (moved below queries) Effects that call refetch/refetchSent must be declared after the queries

  // Pagination pour inbox
  const getPaginatedInbox = (data: Alert[]) => {
    const startIndex = (currentPageInbox - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return data.slice(startIndex, endIndex);
  };

  // Pagination pour outbox
  const getPaginatedOutbox = (data: Alert[]) => {
    const startIndex = (currentPageOutbox - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return data.slice(startIndex, endIndex);
  };

  const { data: alerts = [], refetch, isLoading: isLoadingAlerts } = useQuery({
    queryKey: ["/api/alerts/received", user?.id],
    queryFn: async () => {
      if (!user) return [];
      try {
        const resp: any = await apiRequest({ url: `/api/alerts/received/${user.id}` , method: 'GET' });
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
            sender: {
              username: s.username || 'inconnu',
              firstName: s.first_name || '',
              lastName: s.last_name || '',
              role: s.role || 'unknown',
              // Prefer region from alert (resolved from coords), then sender
              region: a.region || s.region || undefined,
              // Prefer departement from alert (resolved from coords), then sender
              departement: a.departement || s.departement || undefined,
            },
            location: lat !== null && lon !== null ? { latitude: lat, longitude: lon } : undefined,
          };
          return alert;
        });
        console.log('[AlertsPage] Mapped alerts count:', mapped.length);
        console.log('[AlertsPage] Mapped alerts:', mapped);
        return mapped;
      } catch (error: any) {
        console.error('[AlertsPage] Error fetching alerts:', error);
        if (String(error?.message || '').toLowerCase().includes('non authentifi') || String(error?.message || '').includes('401')) {
          toast({ variant: 'destructive', title: 'Session expirée', description: 'Veuillez vous reconnecter pour accéder aux alertes.' });
        }
        return [] as Alert[];
      }
    },
    enabled: !!user,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 10000, // 10s polling to auto-refresh inbox
    staleTime: 0,
  });

  // Récupérer les alertes envoyées
  const { data: sentAlertsData = [], refetch: refetchSent, isLoading: isLoadingSent } = useQuery({
    queryKey: ["/api/alerts/sent", user?.id],
    queryFn: async () => {
      if (!user) return [];
      try {
        const resp: any = await apiRequest({ url: `/api/alerts/sent/${user.id}`, method: 'GET' });
        const raw = Array.isArray(resp) ? resp : (resp?.data ?? resp);
        const mapped: Alert[] = (raw || []).map((a: any) => {
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
            readByRoles: Array.isArray(a.read_by_roles) ? a.read_by_roles : undefined,
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
        return mapped;
      } catch (error) {
        console.error('Erreur:', error);
        return [] as Alert[];
      }
    },
    enabled: !!user,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 10000, // 10s polling to auto-refresh outbox
    staleTime: 0,
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

  const unreadCount = alerts.filter((alert: Alert) => !alert.isRead).length;

  const filteredInbox = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    // Inbox affiche toutes les alertes (lues et non lues)
    const base = (Array.isArray(alerts) ? alerts : []);
    const filtered = !q
      ? base
      : base.filter((a) => {
          const t = String(a?.title || "").toLowerCase();
          const m = String(a?.message || "").toLowerCase();
          const sender = `${a?.sender?.firstName || ""} ${a?.sender?.lastName || ""} ${a?.sender?.username || ""}`.toLowerCase();
          const loc = `${a?.departement || ""} ${a?.region || ""}`.toLowerCase();
          return t.includes(q) || m.includes(q) || sender.includes(q) || loc.includes(q);
        });
    return filtered.sort((a, b) => {
      const at = new Date(a.createdAt || 0).getTime();
      const bt = new Date(b.createdAt || 0).getTime();
      return sortNewestFirst ? bt - at : at - bt;
    });
  }, [alerts, searchQuery, sortNewestFirst]);

  useEffect(() => {
    document.title = "Alertes | SCoDiPP - Systeme de Control";
  }, []);

  const toggleExpand = (alertId: number) => {
    setExpandedAlerts((prev) =>
      prev.includes(alertId) ? prev.filter((id) => id !== alertId) : [...prev, alertId]
    );
  };

  const markAsRead = async (alertId: number) => {
    try {
      // Mettre à jour l'alerte dans l'API
      const response = await fetch(`/api/alerts/${alertId}/read`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ isRead: true }),
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la mise à jour de l\'alerte');
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

      // Rafraîchir les données depuis le serveur
      refetch();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Une erreur s'est produite. Veuillez réessayer.",
      });
    }
  };

  const markAllAsRead = async () => {
    try {
      // Mettre à jour toutes les alertes dans l'API
      const response = await fetch(`/api/alerts/user/${user?.id}/read-all`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la mise à jour des alertes');
      }

      toast({
        title: "Toutes les alertes marquées comme lues",
        description: "Toutes vos alertes ont été marquées comme lues.",
      });

      // Vider immédiatement la boîte de réception
      queryClient.setQueryData(["/api/alerts/received", user?.id], []);

      // Rafraîchir les données depuis le serveur
      refetch();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Une erreur s'est produite. Veuillez réessayer.",
      });
    }
  };

  const deleteAlert = async (alertId: number) => {
    try {
      // Supprimer l'alerte dans l'API
      const response = await fetch(`/api/alerts/${alertId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la suppression de l\'alerte');
      }

      // Mettre à jour les données locales
      const updatedAlerts = alerts.filter((alert: Alert) => alert.id !== alertId);
      queryClient.setQueryData(["/api/alerts/received", user?.id], updatedAlerts);

      // Mettre à jour les alertes envoyées si nécessaire
      const updatedSentAlerts = sentAlertsData.filter((alert: Alert) => alert.id !== alertId);
      queryClient.setQueryData(["/api/alerts/sent", user?.id], updatedSentAlerts);
      toast({
        title: "Alerte supprimée",
        description: "L'alerte a été supprimée définitivement.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Une erreur s'est produite lors de la suppression.",
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

  const getUrgencyTag = (type: string, nature?: "braconnage" | "trafic-bois" | "feux_de_brousse" | "autre") => {
    console.log(`[getUrgencyTag] Received type: ${type}, nature: ${nature}`);
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
    } catch {}

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

    const options = {
      enableHighAccuracy: true,  // Essayer d'obtenir la meilleure précision possible
      timeout: 60000,            // Délai d'attente porté à 60 secondes pour mobile
      maximumAge: 10000          // Autoriser une position récente (<= 10s) pour réduire les échecs
    };

    return new Promise<{latitude: number, longitude: number} | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Fermer le toast de chargement
      const toastElements = document.querySelectorAll('[data-sonner-toast]');
      if (toastElements.length > 0) {
        const lastToast = toastElements[toastElements.length - 1];
        const closeButton = lastToast.querySelector('[data-sonner-toast-close]') as HTMLElement;
        if (closeButton) closeButton.click();
      }

          const { latitude, longitude, accuracy } = position.coords;
          const locationData = { latitude, longitude };

          setLocation(locationData);
          setIsLoadingLocation(false);

          console.log('Position obtenue:', { latitude, longitude, accuracy });

          // Afficher un toast de succès avec un bouton pour voir les détails
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
        setIsLoadingLocation(false);
        
        console.error("Erreur de géolocalisation:", error);
        
        let message = "Impossible d'obtenir votre position.";
        if (error.code === error.PERMISSION_DENIED) {
          message = "L'accès à la géolocalisation a été refusé. Veuillez l'activer dans vos paramètres.";
          setLocationPermissionDenied(true);
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          message = "La position GPS est indisponible.";
        } else if (error.code === error.TIMEOUT) {
          message = "Délai d'attente dépassé pour la géolocalisation.";
        }
        
        toast({
          title: "Erreur GPS",
          description: message,
          variant: "destructive"
        });
        resolve(null);
      },
        options
      );
    });
  };

  // Déterminer si l'utilisateur peut envoyer des alertes
  const canSendAlerts = (isSectorAgent || isRegionalAgent || isHunter || isGuide) && !isReadOnlyUser;

  // Effet pour gérer la configuration initiale en fonction du type d'utilisateur
  useEffect(() => {
    // Pour les chasseurs et guides, forcer le type d'alerte à 'autre' (Informations) et afficher la zone de texte
    if (isHunter || isGuide) {
      setSelectedAlertType('autre');
      setAlertNature('autre');
      setShowAlertForm(true); // Activer automatiquement le formulaire pour les chasseurs

      // Vérifier l'état de la géolocalisation au chargement pour les chasseurs
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
          } else if (permissionState === 'granted') {
            // Si la permission est déjà accordée, on peut essayer de récupérer la position
            handleGetLocation();
          }
        } catch (error) {
          console.error('Erreur lors de la vérification de la géolocalisation :', error);
        }
      };

      if (!locationPermissionDenied) {
        checkLocation();
      }
    } else {
      // Pour les non-chasseurs, initialiser sans type d'alerte sélectionné
      setSelectedAlertType(null);
    }
  }, [isHunter, isGuide, locationPermissionDenied]);

  // Gestion de l'envoi d'une alerte
  const handleSendAlert = async () => {
    if (!selectedAlertType || !location) return;
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

      // Créer l'objet alerte selon le format attendu par l'API
      // Préparer et corriger les coordonnées si inversées (heuristique Sénégal)
      const rawLat = Number(location.latitude);
      const rawLon = Number(location.longitude);
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

      // Envoyer l'alerte via apiRequest (gère auth/cookies)
      const responseData: any = await apiRequest({ url: '/api/alerts', method: 'POST', data: alertData });
      if ((responseData as any)?.ok === false) {
        console.error('Erreur API:', responseData);
        throw new Error((responseData as any)?.error || (responseData as any)?.message || 'Échec de l\'envoi de l\'alerte');
      }

      // Afficher un message de succès
      toast({
        title: 'Alerte envoyée',
        description: 'Votre alerte a été envoyée avec succès.',
      });

      // Réinitialiser le formulaire
      resetForm();
      setMessageText("");

      // Recharger les alertes (inbox et outbox)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/alerts/received", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["/api/alerts/sent", user?.id] })
      ]);

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
    setLocation(null);
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

  return (
    <div className="flex flex-col bg-slate-50 min-h-screen">
      <AgentTopHeader />
      <div className="w-full flex-1 flex items-start justify-center py-2 sm:py-3 lg:py-4 px-2 sm:px-4">
        <div className="w-full max-w-7xl flex flex-col">
          {/* Bouton Retour + Actions - Barre supérieure */}
          <div className="bg-white rounded-t-lg shadow-sm border border-b-0 border-gray-200 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-600 hover:text-gray-900 flex items-center gap-2 transition-all hover:bg-gray-100"
              onClick={() => window.history.back()}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="font-medium">Retour</span>
            </Button>
            <div className="flex flex-wrap gap-2">
              {unreadCount > 0 && activeTab === "inbox" && (
                <Button
                  variant="outline"
                  className="border-blue-300 text-blue-600 hover:bg-blue-50 transition-colors rounded-lg text-xs sm:text-sm h-9"
                  onClick={markAllAsRead}
                >
                  <CheckCheck className="h-4 w-4 mr-2 hidden sm:inline" />
                  Marquer tout comme lu
                </Button>
              )}
              {isPushSupported && !isPushSubscribed && (
                <Button
                  variant="default"
                  className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-md hover:shadow-lg transition-all duration-300 rounded-lg text-xs sm:text-sm flex items-center gap-2 animate-pulse-subtle h-9"
                  onClick={subscribeToPush}
                >
                  <Bell className="h-4 w-4" />
                  <span>Activer les notifications</span>
                </Button>
              )}
            </div>
          </div>

          {/* Disposition intelligente : 2 colonnes sur desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(340px,420px)_1fr] gap-0 lg:gap-4">

            {/* === COLONNE GAUCHE : Formulaire d'envoi === */}
            {canSendAlerts && !((isHunter || isGuide) && activeTab === 'outbox') && !(activeTab === 'inbox' && (isRegionalAgent || isSectorAgent)) && (
              <div className="bg-white rounded-b-lg lg:rounded-lg shadow-md border border-gray-200 p-4 lg:sticky lg:top-4 lg:self-start">
                <h3 className="text-lg font-semibold mb-3 text-gray-800">{(isHunter || isGuide) ? 'Envoyer une information' : 'Envoyer une alerte rapide'}</h3>
                
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
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 mb-3">
                    <MapPin className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm text-emerald-800 font-medium">Position enregistrée</span>
                    <span className="text-xs text-emerald-600 ml-auto">{location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</span>
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
                    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-md text-sm">
                      <p className="font-medium">Sélectionnez un type d'alerte</p>
                      <p className="mt-1">Veuillez choisir un type d'alerte ci-dessus pour continuer.</p>
                    </div>
                  )
                ) : null}
              </div>
            )}

            {/* === COLONNE DROITE : Liste des alertes === */}
            <div className="bg-white rounded-b-lg lg:rounded-lg shadow-md border border-gray-200 flex flex-col min-h-0">
              {/* Barre d'actions inbox (recherche/filtre/tri) */}
              {activeTab === 'inbox' && (
                <div className="px-4 py-3 border-b flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="w-full md:max-w-md relative">
                    <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPageInbox(1);
                      }}
                      className="pl-9"
                      placeholder="Rechercher une alerte..."
                    />
                  </div>

                  <div className="flex items-center gap-2 justify-end">
                    <Button variant="outline" className="gap-2" disabled>
                      <Filter className="h-4 w-4" />
                      Filtrer
                      <ChevronDown className="h-4 w-4" />
                    </Button>
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

            {activeTab === "inbox" ? (
              isLoadingAlerts ? (
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
                    {getPaginatedInbox(filteredInbox).map((alert: Alert) => {
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
                              {getUrgencyTag(alert.type, alert.nature)}
                              {!alert.isRead && (
                                <Badge variant="secondary" className="bg-blue-100 text-blue-800">Non lu</Badge>
                              )}
                            </div>

                            <div className="mt-0.5 text-sm text-gray-700 flex flex-wrap gap-x-4 gap-y-1">
                              <div className="flex items-center gap-1">
                                <User className="h-4 w-4 text-gray-500" />
                                <span>
                                  {alert.sender?.firstName ?? alert.sender?.username ?? 'Utilisateur'}
                                  {alert.sender?.lastName ? ` ${alert.sender.lastName}` : ''}
                                  {' '}({getProvenanceLabel(alert.sender?.role ?? 'unknown')})
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <MapPin className="h-4 w-4 text-gray-500" />
                                <span>
                                  {String(alert.departement || 'NON DÉFINI').toUpperCase()}
                                  {alert.region ? `/${alert.region}` : ''}
                                </span>
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
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => deleteAlert(alert.id)}
                              title="Supprimer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {filteredInbox.length > 0 && (
                    <div className="p-3 flex justify-between items-center text-sm bg-gray-50 border-t rounded-b-lg">
                      <div className="text-muted-foreground">
                        Affichage de {((currentPageInbox - 1) * itemsPerPage) + 1} à {Math.min(currentPageInbox * itemsPerPage, filteredInbox.length)} sur {filteredInbox.length} alertes
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPageInbox(Math.max(1, currentPageInbox - 1))}
                          disabled={currentPageInbox === 1}
                        >
                          Précédent
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPageInbox(currentPageInbox + 1)}
                          disabled={currentPageInbox >= Math.ceil(filteredInbox.length / itemsPerPage)}
                        >
                          Suivant
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )
            ) : (
              isLoadingSent ? (
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
                  {getPaginatedOutbox(sentAlertsData).map((alert: Alert) => (
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
                  {sentAlertsData.length > 0 && (
                    <div className="p-3 flex justify-between items-center text-sm bg-gray-50 border-t rounded-b-lg">
                      <div className="text-muted-foreground">
                        Affichage de {((currentPageOutbox - 1) * itemsPerPage) + 1} à {Math.min(currentPageOutbox * itemsPerPage, sentAlertsData.length)} sur {sentAlertsData.length} alertes
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPageOutbox(Math.max(1, currentPageOutbox - 1))}
                          disabled={currentPageOutbox === 1}
                        >
                          Précédent
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPageOutbox(currentPageOutbox + 1)}
                          disabled={currentPageOutbox >= Math.ceil(sentAlertsData.length / itemsPerPage)}
                        >
                          Suivant
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )
            )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal détails alerte */}
      <Dialog
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) setDetailsAlert(null);
        }}
      >
        <DialogContent className="w-[95vw] max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Détails de l'alerte</DialogTitle>
          </DialogHeader>

          {detailsAlert && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="font-semibold text-gray-900">{detailsAlert.title}</div>
                {getUrgencyTag(detailsAlert.type, detailsAlert.nature)}
                {!detailsAlert.isRead && (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">Non lu</Badge>
                )}
              </div>

              <div className="text-sm text-gray-700 whitespace-pre-line">{detailsAlert.message}</div>

              <div className="text-sm text-gray-600">
                Reçu de : {detailsAlert.sender?.firstName ?? detailsAlert.sender?.username ?? 'Utilisateur'}
                {detailsAlert.sender?.lastName ? ` ${detailsAlert.sender.lastName}` : ''}
                {' '}({getProvenanceLabel(detailsAlert.sender?.role ?? 'unknown')})
              </div>

              <div className="text-sm text-gray-600">
                Lieux : {String(detailsAlert.departement || 'NON DÉFINI').toUpperCase()}{detailsAlert.region ? `/${detailsAlert.region}` : ''}
              </div>

              <div className="flex flex-wrap gap-2 justify-end pt-2">
                {!detailsAlert.isRead && (
                  <Button variant="outline" onClick={() => markAsRead(detailsAlert.id)}>
                    Marquer comme lu
                  </Button>
                )}
                <Button variant="outline" className="text-red-600" onClick={() => deleteAlert(detailsAlert.id)}>
                  Supprimer
                </Button>
              </div>
            </div>
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
        <DialogContent className="w-[92vw] max-w-[92vw] sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-700">
              <Info className="h-5 w-5" />
              Zone d'alerte déjà identifiée
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-gray-800">
            <p>
              <span className="font-semibold">Information:</span><br />
              Une alerte similaire a déjà été enregistrée à proximité.
            </p>
            {duplicateModalInfo?.nature ? (
              <p>
                <span className="font-semibold">Nature:</span><br />
                {duplicateModalInfo.nature}
                {(() => {
                  const c = duplicateModalInfo?.createdAt ? new Date(duplicateModalInfo.createdAt) : null;
                  if (!c || isNaN(c.getTime())) return null;
                  const two = (n: number) => n.toString().padStart(2, '0');
                  const hhmm = `${two(c.getHours())}:${two(c.getMinutes())}`;
                  const ddmmyyyy = `${two(c.getDate())}/${two(c.getMonth()+1)}/${c.getFullYear()}`;
                  return <span> — {hhmm} le {ddmmyyyy}</span>;
                })()}
              </p>
            ) : null}
            {duplicateModalInfo?.lat != null && duplicateModalInfo?.lon != null && (
              <p>
                <span className="font-semibold">Coordonnées (WGS84):</span><br />
                {duplicateModalInfo.lat?.toFixed(4)}, {duplicateModalInfo.lon?.toFixed(4)}
              </p>
            )}
            <p>
              <span className="font-semibold">Signataire:</span><br />
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
                    {displayName} — Agent/{org}{loc ? ` (${loc})` : ''}
                  </span>
                );
              })()}
            </p>
            <p className="text-xs text-green-800 bg-green-50 border border-green-200 rounded px-2 py-1">
              <span className="font-semibold">Rayon de détection:</span> <span className="font-bold">{duplicateModalInfo?.radiusMeters ?? 20} mètres</span>
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setDuplicateModalOpen(false)} className="bg-blue-600 hover:bg-blue-700">Compris</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export default AlertsPage;
