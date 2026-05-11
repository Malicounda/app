import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  Download,
  Edit,
  Eye,
  FileText,
  Image as ImageIcon,
  Info,
  Link2,
  Loader2,
  MapPin,
  Minus,
  Plus,
  Search,
  Shield,
  Trash2,
  Upload,
  User,
  Users,
  X
} from 'lucide-react';
import proj4 from 'proj4';
import { useCallback, useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { Cell, Pie, PieChart, Label as PieLabel, ResponsiveContainer, Sector, Tooltip } from 'recharts';
import { useLocation } from 'wouter';

type DeletionTarget =
  | { type: 'infraction'; id: number; label: string }
  | { type: 'code'; id: number; label: string }
  | { type: 'agent'; id: number; label: string }
  | { type: 'contrevenant'; id: number; label: string }
  | { type: 'contrevenant-association'; id: number; label: string }
  | { type: 'pv'; id: number; label: string };

type SaisieGroup = {
  id?: number;
  key: string;
  label: string;
  color?: string | null;
  is_active?: boolean | null;
};

type CheckContrevenantResult =
  | { status: 'existing'; numero_piece: string; contrevenant: any }
  | { status: 'new'; numero_piece: string };

type ContrevenantAssociationMeta = {
  associatedBy: string | null;
  associatedAt: string | null;
  status?: 'associated' | 'dissociated';
};

const IDENTITY_TYPE_OPTIONS = [
  'Passeport',
  "Carte d'identité",
  'Permis de conduire'
];

const PAGE_SIZE = 7;
const PV_PAGE_SIZE = 6;
const AGENT_PAGE_SIZE = 6;
const INFRACTION_PAGE_SIZE = 10;

const normalizeText = (value: string | null | undefined) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[_\s]+/g, ' ')
    .replace(/[\u0300-\u036f]/g, '');

const normalizePieceValue = (value: string | null | undefined) =>
  normalizeText(value)
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/gi, '');

const emptyContrevenantForm = {
  nom: '',
  prenom: '',
  date_naissance: '',
  lieu_naissance: '',
  adresse: '',
  filiation_pere: '',
  filiation_mere: '',
  numero_piece: '',
  type_piece: '',
  photo: null as File | null,
  piece_identite: null as File | null,
  donnees_biometriques: null as File | null
};

export default function Infractions() {
  const [activeTab, setActiveTab] = useState<'stats' | 'infractions' | 'codes' | 'agents' | 'contrevenants' | 'pv'>('codes');
  const [searchTerm, setSearchTerm] = useState('');

  const queryClient = useQueryClient();
  const toastHook = useToast();
  const toast = toastHook?.toast || (() => {});
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // Role detection (normalized) to adjust stats for regional agents
  const normalizedRole = (user?.role || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\s]+/g, '-');
  const isRegionalAgent = normalizedRole === 'agent' ||
    normalizedRole.includes('agent-regional') ||
    normalizedRole.includes('regional-agent');

  const isAdmin = (user?.role || '').toLowerCase().includes('admin');
  const isSectorAgent = (() => {
    const r = normalizedRole;
    return r === 'sub-agent' || r.includes('agent-secteur') || r.includes('secteur-agent') || r.includes('sector-agent');
  })();
  const isBrigadeOrOtherSubRole = ['brigade', 'triage', 'poste-control', 'sous-secteur'].includes(normalizedRole);
  const showGeoRepartition = isAdmin || isRegionalAgent || isSectorAgent;

  // Pie chart state for geography repartition
  const [geoPieActiveIndex, setGeoPieActiveIndex] = useState<number>(0);
  const GEO_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#06b6d4', '#f43f5e'];
  const GEO_PRIMARY_COLOR = GEO_COLORS[0];
  const geoGradientId = useId();
  const geoGradientNamespace = useMemo(
    () => geoGradientId.replace(/[^a-zA-Z0-9_-]/g, ''),
    [geoGradientId]
  );
  const GEO_PIE_OUTER_RADIUS = 96;
  const GEO_PIE_INNER_RADIUS = 56;

  const adjustGeoColor = useCallback((hex: string, amount: number) => {
    const clamp = (value: number) => Math.max(0, Math.min(255, value));
    const parsed = hex.replace('#', '');
    if (parsed.length !== 6) return hex;
    const num = parseInt(parsed, 16);
    const r = clamp(((num >> 16) & 0xff) + amount);
    const g = clamp(((num >> 8) & 0xff) + amount);
    const b = clamp((num & 0xff) + amount);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }, []);

  const geoDonutShading = useMemo(() => {
    const base = GEO_PRIMARY_COLOR;
    return {
      top: adjustGeoColor(base, 60),
      mid: base,
      bottom: adjustGeoColor(base, -55),
      core: adjustGeoColor(base, 28)
    };
  }, [GEO_PRIMARY_COLOR, adjustGeoColor]);

  const renderGeoActiveShape = (props: any) => {
    const RADIAN = Math.PI / 180;
    const { cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    const sin = Math.sin(-RADIAN * midAngle);
    const cos = Math.cos(-RADIAN * midAngle);
    const sx = cx + (outerRadius + 6) * cos;
    const sy = cy + (outerRadius + 6) * sin;
    const ex = cx + (outerRadius + 14) * cos;
    const ey = cy + (outerRadius + 14) * sin;
    return (
      <g>
        <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 8} startAngle={startAngle} endAngle={endAngle} fill={fill} />
        <Sector cx={cx} cy={cy} innerRadius={innerRadius - 2} outerRadius={innerRadius} startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.25} />
        <path d={`M${sx},${sy}L${ex},${ey}`} stroke={fill} fill="none" />
      </g>
    );
  };

  // Default unit suggestion per label
  const suggestDefaultUnit = (label: string): 'kg' | 'g' | 'L' | 'piece' | 'stere' | undefined => {
    const l = label.toLowerCase();
    if (/charbon/.test(l)) return 'kg'; // Charcoal
    if (/bois\s*de\s*chauffe/.test(l)) return 'stere'; // Firewood
    if (/(vin|huile)/.test(l)) return 'L'; // Liquids
    if (/(planche|plateau|poutrelle|madrier|latte|piquet|tige|pied|lattes|leurres?)/.test(l)) return 'piece'; // Wood items
    if (/(tronçonneuse|scie|marteau|haches|coupe-coupe|groupe|moto pompe|dynamo|meule|boitier|machine cracheuse|pelles|fusil|charrette|vélo|moto|tricycle|camion|véhicule|pirogue)/.test(l)) return 'piece'; // Tools/Vehicles
    return undefined;
  };

  // Dialog states
  const [openCreateInfraction, setOpenCreateInfraction] = useState(false);
  const [openCreateCode, setOpenCreateCode] = useState(false);
  const [openCreateAgent, setOpenCreateAgent] = useState(false);
  const [openCreateContrevenant, setOpenCreateContrevenant] = useState(false);
  const [openCheckContrevenant, setOpenCheckContrevenant] = useState(false);
  const [editingContrevenantId, setEditingContrevenantId] = useState<number | null>(null);
  const [editingAgentId, setEditingAgentId] = useState<number | null>(null);
  const [openCreatePV, setOpenCreatePV] = useState(false);
  const [openViewPV, setOpenViewPV] = useState(false);
  const [selectedPV, setSelectedPV] = useState<any>(null);
  const [openViewPhotos, setOpenViewPhotos] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<any>(null);
  const [openViewCodeDocs, setOpenViewCodeDocs] = useState(false);
  const [selectedCodeForDocs, setSelectedCodeForDocs] = useState<any>(null);
  const [codeDocuments, setCodeDocuments] = useState<any[]>([]);
  const [selectedCodeDocument, setSelectedCodeDocument] = useState<any>(null);
  const [selectedCodeDocUrl, setSelectedCodeDocUrl] = useState<string>('');
  const [openAgentsModal, setOpenAgentsModal] = useState(false);
  const [selectedContrevenantIds, setSelectedContrevenantIds] = useState<string[]>([]);
  const [contrevenantPage, setContrevenantPage] = useState(1);
  const [agentPage, setAgentPage] = useState(1);
  const [infractionPage, setInfractionPage] = useState(1);
  const [pvPage, setPvPage] = useState(1);
  const [selectedContrevenant, setSelectedContrevenant] = useState<any>(null);
  const [selectedContrevenantDetails, setSelectedContrevenantDetails] = useState<any>(null);
  const [viewContrevenantOpen, setViewContrevenantOpen] = useState(false);
  const [viewContrevenantHistoryOpen, setViewContrevenantHistoryOpen] = useState(false);
  const [viewContrevenantLoading, setViewContrevenantLoading] = useState(false);
  const [viewContrevenantError, setViewContrevenantError] = useState<string | null>(null);
  const [injectedContrevenants, setInjectedContrevenants] = useState<Record<string, any>>({});
  const [contrevenantTotalsOverrides, setContrevenantTotalsOverrides] = useState<Record<string, number>>({});
  const [associatedContrevenantsMetadata, setAssociatedContrevenantsMetadata] = useState<Record<string, ContrevenantAssociationMeta>>({});
  const [associationCacheLoaded, setAssociationCacheLoaded] = useState(false);
  const [zoomMedia, setZoomMedia] = useState<{ src: string; title: string } | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<DeletionTarget | null>(null);
  const [obsCollapsedGroups, setObsCollapsedGroups] = useState<Record<string, boolean>>({});
  const [saisieGroups, setSaisieGroups] = useState<SaisieGroup[]>([]);
  const [observationOptions, setObservationOptions] = useState<Array<{
    key: string;
    label: string;
    withQuantity?: boolean;
    unit_mode?: 'none' | 'fixed' | 'choices' | 'free';
    unit_fixed_key?: 'kg' | 'g' | 'L' | 'piece' | 'stere' | string;
    unit_allowed?: Array<'kg' | 'g' | 'L' | 'piece' | 'stere' | string>;
    group_key: string | null;
  }>>([]);
  const [zoneIdentifyMethod, setZoneIdentifyMethod] = useState<'geolocate' | 'coords'>('geolocate');
  const [verificationTab, setVerificationTab] = useState<'manual' | 'csv'>('manual');

  const loadObservationGroups = useCallback(async () => {
    try {
      const resp = await apiRequest<SaisieGroup[]>('GET', '/api/infractions/saisie-groups');
      if (resp.ok && Array.isArray(resp.data)) {
        setSaisieGroups(resp.data.filter(g => g.is_active !== false));
      }
    } catch (e) {
      console.error('[INFRACTIONS] loadObservationGroups error:', e);
    }
  }, []);

  useEffect(() => {
    void loadObservationGroups();
    let mounted = true;
    (async () => {
      try {
        const resp = await apiRequest<any>('GET', '/api/infractions/saisie-items');
        if (mounted && resp.ok && Array.isArray(resp.data)) {
          const rows = resp.data as Array<{
            id: number;
            key: string;
            label: string;
            quantity_enabled?: boolean;
            is_active?: boolean;
            unit_mode?: 'none' | 'fixed' | 'choices' | 'free';
            unit_fixed_key?: string;
            unit_allowed?: string[];
            group_key?: string | null;
          }>;
          const active = rows.filter(r => r.is_active !== false);
          setObservationOptions(active.map(r => ({
            key: r.key,
            label: r.label,
            withQuantity: !!r.quantity_enabled,
            unit_mode: (r.unit_mode as any) || 'none',
            unit_fixed_key: r.unit_fixed_key as any,
            unit_allowed: Array.isArray(r.unit_allowed) ? (r.unit_allowed as any) : undefined,
            group_key: r.group_key || null,
          })));
        }
      } catch (e) {
        // ignore, keep empty default
      }
    })();
    return () => { mounted = false; };
  }, [loadObservationGroups]);

  const [observationSelections, setObservationSelections] = useState<Record<string, { checked: boolean; qty: string; unit?: 'kg' | 'g' | 'L' | 'piece' | 'stere' }>>({});
  const [observationFlagEnabled, setObservationFlagEnabled] = useState<boolean>(false);
  const [obsSearch, setObsSearch] = useState('');

  const filteredObservationOptions = useMemo(() => {
    const term = obsSearch.trim().toLowerCase();
    if (!term) return observationOptions;
    return observationOptions.filter(o => o.label.toLowerCase().includes(term));
  }, [obsSearch, observationOptions]);

  const groupMap = useMemo(() => new Map(saisieGroups.map(g => [g.key, g] as const)), [saisieGroups]);

  const formatGroupLabel = useCallback((key: string, group?: SaisieGroup | null) => {
    if (group?.label) return group.label;
    if (key === 'autre') return 'Autre';
    return key.replace(/_/g, ' ').replace(/(^|\s)([a-zà-ÿ])/gi, (_, space: string, char: string) => `${space}${char.toUpperCase()}`);
  }, []);

  const groupedOptions = useMemo(() => {
    const groups: Record<string, { label: string; items: typeof observationOptions }> = {};
    for (const opt of filteredObservationOptions) {
      const key = opt.group_key || 'autre';
      const group = groupMap.get(key) || null;
      if (!groups[key]) {
        groups[key] = { label: formatGroupLabel(key, group), items: [] };
      }
      groups[key].items.push(opt);
    }
    return groups;
  }, [filteredObservationOptions, groupMap, formatGroupLabel]);

  const orderedGroupKeys = useMemo(() => {
    const baseOrder = ['bois', 'produits', 'autre', 'equipements', 'vehicules'];
    return Object.keys(groupedOptions).sort((a, b) => {
      const ia = baseOrder.indexOf(a);
      const ib = baseOrder.indexOf(b);
      if (ia !== -1 || ib !== -1) {
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      }
      const labelA = groupedOptions[a]?.label || a;
      const labelB = groupedOptions[b]?.label || b;
      return labelA.localeCompare(labelB, 'fr');
    });
  }, [groupedOptions]);

  const clearAllObs = () => setObservationSelections({});
  const resetQtyObs = () => setObservationSelections(prev => {
    const next: typeof prev = {};
    for (const k in prev) {
      const v = prev[k];
      next[k] = { checked: v?.checked || false, qty: '', unit: v?.unit };
    }
    return next;
  });
  const incQty = (key: string, delta: number) => setObservationSelections(prev => {
    const cur = prev[key] || { checked: false, qty: '', unit: undefined };
    const n = Math.max(0, Number(cur.qty || 0) + delta);
    return { ...prev, [key]: { ...cur, qty: String(n) } };
  });

  useEffect(() => {
    if (!observationFlagEnabled) {
      setFormInfraction((prev: any) => ({ ...prev, observations: 'Néant' }));
      return;
    }

    const parts: string[] = [];
    for (const opt of observationOptions) {
      const sel = observationSelections[opt.key];
      if (sel?.checked) {
        let qty = '';
        if (opt.withQuantity && sel.qty) {
          qty = ` - ${sel.qty}${sel.unit ? ` ${sel.unit}` : ''}`;
        }
        parts.push(`${opt.label}${qty}`);
      }
    }
    setFormInfraction((prev: any) => ({ ...prev, observations: parts.length > 0 ? parts.join('; ') : 'Néant' }));
  }, [observationFlagEnabled, observationSelections, observationOptions]);

  useEffect(() => {
    if (!openCreateInfraction) {
      setObservationFlagEnabled(false);
      setObservationSelections({});
      setObsSearch('');
    }
  }, [openCreateInfraction]);

  // Compute server base URL (without /api) for static uploads
  const getServerBaseUrlForUploads = (): string => {
    try {
      const envBase = (import.meta as any)?.env?.VITE_API_BASE_URL || (import.meta as any)?.env?.VITE_API_URL;
      if (envBase && typeof envBase === 'string' && /^https?:\/\//i.test(envBase)) {
        const base = envBase.replace(/\/+$/, '');
        return base.endsWith('/api') ? base.slice(0, -4) : base;
      }
    } catch {}
    try {
      const loc = typeof window !== 'undefined' ? window.location : undefined as any;
      if (loc && (loc.port === '5173' || loc.port === '5174')) {
        // En développement (Vite) on passe par le proxy /api, donc URL relative
        return '';
      }
      // Same-origin fallback
      if (loc) return `${loc.protocol}//${loc.host}`;
    } catch {}
    return '';
  };

  const filteredCodeDocuments = useMemo(() => codeDocuments, [codeDocuments]);

  const buildPdfViewerUrl = (base: string): string => {
    if (!base) return base;
    const [path, fragment = ''] = base.split('#', 2);
    const params = new URLSearchParams(fragment);
    params.set('toolbar', '0');
    params.set('navpanes', '0');
    params.set('scrollbar', '1');
    params.set('zoom', '95');
    const serialized = params.toString();
    return serialized ? `${path}#${serialized}` : `${path}#toolbar=0&navpanes=0&scrollbar=1&zoom=95`;
  };

  // Charger le document sélectionné en Blob (fiable pour images/PDF)
  useEffect(() => {
    let revoked: string | null = null;
    const load = async () => {
      try {
        if (!selectedCodeDocument) { setSelectedCodeDocUrl(''); return; }
        const url = getCodeDocUrl(selectedCodeDocument);
        console.log('URL générée pour le document:', url);
        console.log('Document sélectionné:', selectedCodeDocument);
        if (!url) { setSelectedCodeDocUrl(''); return; }

        const isPdf = String(selectedCodeDocument?.mime || '') === 'application/pdf' || /\.pdf$/i.test(selectedCodeDocument?.filename || '');
        if (isPdf) {
          setSelectedCodeDocUrl(url);
          return;
        }

        // Forcer le rechargement sans cache pour éviter les anciennes réponses
        const resp = await fetch(url, {
          credentials: 'include',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        console.log('Réponse API:', resp.status, resp.statusText);
        if (!resp.ok) {
          console.error('Erreur API:', resp.status);
          const text = await resp.text();
          console.error('Contenu de la réponse:', text);
          setSelectedCodeDocUrl(url);
          return;
        }
        const blob = await resp.blob();
        console.log('Blob reçu:', blob.size, 'bytes, type:', blob.type);

        // Vérifier que c'est bien un PDF et pas du JSON
        if (blob.type === 'application/json' || blob.size < 1000) {
          console.warn("Réponse suspecte, utilisation de l'URL directe");
          setSelectedCodeDocUrl(url);
          return;
        }

        const obj = URL.createObjectURL(blob);
        revoked = obj;
        setSelectedCodeDocUrl(obj);
      } catch (err) {
        console.error('Erreur lors du chargement:', err);
        // Fallback URL direct
        try {
          const url = getCodeDocUrl(selectedCodeDocument);
          setSelectedCodeDocUrl(url);
        } catch { setSelectedCodeDocUrl(''); }
      }
    };
    load();
    return () => { if (revoked) { try { URL.revokeObjectURL(revoked); } catch {} } };
  }, [selectedCodeDocument]);

  // Build a safe preview URL for code documents using the API endpoint
  const getCodeDocUrl = (doc: any): string => {
    try {
      if (!doc?.id) return '';
      const server = getServerBaseUrlForUploads();
      const base = server || '';
      return `${base}/api/infractions/codes/documents/${doc.id}/file`;
    } catch {
      return '';
    }
  };

  // Form states
  const [formCode, setFormCode] = useState({ code: '', nature: '', article_code: '' });
  const [formAgent, setFormAgent] = useState<{ nom: string; prenom: string; matricule: string }>({ nom: '', prenom: '', matricule: '' });
  const [formContrevenant, setFormContrevenant] = useState<typeof emptyContrevenantForm>(emptyContrevenantForm);
  const [duplicateContrevenantInfo, setDuplicateContrevenantInfo] = useState<{ id?: number; nom?: string; prenom?: string; numero_piece?: string; type_piece?: string; date_creation?: string } | null>(null);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [receiptDuplicateModalOpen, setReceiptDuplicateModalOpen] = useState(false);
  const [pendingDeselectContrevenantId, setPendingDeselectContrevenantId] = useState<string | null>(null);
  const [checkContrevenantNumber, setCheckContrevenantNumber] = useState('');
  const [checkContrevenantLoading, setCheckContrevenantLoading] = useState(false);
  const [checkContrevenantResult, setCheckContrevenantResult] = useState<CheckContrevenantResult | null>(null);
  const [checkContrevenantError, setCheckContrevenantError] = useState<string | null>(null);
  const [formInfraction, setFormInfraction] = useState<{ code_infraction_id: string; date_infraction: string; region: string; departement: string; commune: string; arrondissement?: string; latitude?: string; longitude?: string; montant_chiffre: string; numero_quittance?: string; observations?: string; agent_id?: string; contrevenants?: string[]; photo_quittance?: File | null; photo_infraction?: File | null }>({
    code_infraction_id: '',
    date_infraction: new Date().toISOString().split('T')[0],
    region: '',
    departement: '',
    commune: '',
    arrondissement: '',
    latitude: '',
    longitude: '',
    montant_chiffre: '',
    numero_quittance: '',
    observations: 'Néant',
    agent_id: '',
    contrevenants: [],
    photo_quittance: null,
    photo_infraction: null
  });

  const [geoOutOfZoneInfo, setGeoOutOfZoneInfo] = useState<{ region: string; departement: string } | null>(null);

  const { data: contrevenants = [] } = useQuery({
    queryKey: ['contrevenants'],
    queryFn: async () => {
      const response = await apiRequest<any>('GET', '/api/infractions/contrevenants');
      return response.data || [];
    }
  });

  const associationStorageKey = useMemo(() => {
    const userId = Number((user as any)?.id);
    if (!Number.isFinite(userId)) return null;
    return `contrevenant-associations:${userId}`;
  }, [user]);

  const resolvedUserAssociationLabel = useMemo(() => {
    if (!user) return 'Agent courant';
    const extract = (...candidates: Array<string | null | undefined>) => {
      const found = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
      return found ? String(found).trim() : '';
    };
    const firstName = extract((user as any)?.prenom, (user as any)?.first_name, (user as any)?.firstName, (user as any)?.username);
    const lastName = extract((user as any)?.nom, (user as any)?.last_name, (user as any)?.lastName);
    const parts = [firstName, lastName].filter((part) => part && part.length > 0);
    if (parts.length > 0) {
      return parts.join(' ');
    }
    const fallback = extract((user as any)?.username, (user as any)?.email, (user as any)?.matricule);
    return fallback || 'Agent courant';
  }, [user]);

  const normalizeAssociationLabel = useCallback((value: string | null | undefined) => {
    if (!value) return '';
    try {
      return String(value)
        .normalize('NFD')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    } catch {
      return String(value).trim().toLowerCase();
    }
  }, []);

  const normalizedCurrentAssociationLabel = useMemo(
    () => normalizeAssociationLabel(resolvedUserAssociationLabel),
    [normalizeAssociationLabel, resolvedUserAssociationLabel]
  );

  const roleContext = useMemo(() => {
    const norm = (value: any) =>
      String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

    if (!user) {
      return {
        hasUser: false,
        isAdmin: false,
        departement: '',
        region: '',
        commune: '',
        arrondissement: '',
        sousService: '',
        userType: '',
        userRole: '',
        isSectorSubRole: false,
        isDepartmentLevelSubRole: false,
        norm,
        isCreatedByMe: (_entity: any) => false
      };
    }

    const userId = Number((user as any)?.id);
    const isCreatedByMe = (entity: any) => {
      const created = entity?.created_by_user_id ?? entity?.created_by ?? entity?.created_by_user ?? entity?.createdBy ?? entity?.owner_id;
      const createdNumber = Number(created);
      return Number.isFinite(userId) && Number.isFinite(createdNumber) && userId === createdNumber;
    };

    const sectorSubRoles = ['sub-agent', 'brigade', 'triage', 'poste-control', 'sous-secteur'];
    const userRole = String(user.role || '').toLowerCase();
    const isSectorSubRole = sectorSubRoles.includes(userRole);
    // Les sous-rôles (brigade, triage, poste-control, sous-secteur) sont des sous-entités du département
    // Ils ne voient que les données de leur propre zone (commune/arrondissement/sousService)
    const isDepartmentLevelSubRole = ['brigade', 'triage', 'poste-control', 'sous-secteur'].includes(userRole);

    return {
      hasUser: true,
      isAdmin: String(user.role || '').toLowerCase().includes('admin'),
      departement: norm((user as any)?.departement),
      region: norm(user.region),
      commune: norm((user as any)?.commune),
      arrondissement: norm((user as any)?.arrondissement),
      sousService: norm((user as any)?.sousService || (user as any)?.sous_service),
      userType: norm((user as any)?.type),
      userRole,
      isSectorSubRole,
      isDepartmentLevelSubRole,
      norm,
      isCreatedByMe
    };
  }, [user]);

  useEffect(() => {
    if (!associationStorageKey || associationCacheLoaded) return;
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(associationStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          if (parsed.metadata && typeof parsed.metadata === 'object') {
            setAssociatedContrevenantsMetadata((prev) => ({ ...parsed.metadata, ...prev }));
          }
          if (parsed.injected && typeof parsed.injected === 'object') {
            setInjectedContrevenants((prev) => ({ ...parsed.injected, ...prev }));
          }
        }
      }
    } catch (error) {
      console.error('[Infractions] Unable to load contrevenant associations cache:', error);
    } finally {
      setAssociationCacheLoaded(true);
    }
  }, [associationStorageKey, associationCacheLoaded]);

  useEffect(() => {
    if (!associationStorageKey) return;
    if (typeof window === 'undefined') return;
    if (!associationCacheLoaded) return;
    try {
      const isMetadataEmpty = Object.keys(associatedContrevenantsMetadata).length === 0;
      const isInjectedEmpty = Object.keys(injectedContrevenants).length === 0;
      if (isMetadataEmpty && isInjectedEmpty) {
        window.localStorage.removeItem(associationStorageKey);
        return;
      }
      const payload = {
        metadata: associatedContrevenantsMetadata,
        injected: injectedContrevenants
      };
      window.localStorage.setItem(associationStorageKey, JSON.stringify(payload));
    } catch (error) {
      console.error('[Infractions] Unable to persist contrevenant associations cache:', error);
    }
  }, [associationStorageKey, associatedContrevenantsMetadata, injectedContrevenants, associationCacheLoaded]);

  const augmentedContrevenants = useMemo(() => {
    const baseList = Array.isArray(contrevenants) ? [...contrevenants] : [];
    const existingIds = new Set(baseList.map((c: any) => String((c?.id ?? '') as any)));
    Object.entries(injectedContrevenants).forEach(([id, data]) => {
      if (!existingIds.has(id)) {
        const assocMeta = associatedContrevenantsMetadata[id];
        baseList.push(assocMeta ? { ...data, associationMetadata: assocMeta } : data);
      }
    });
    return baseList;
  }, [contrevenants, injectedContrevenants, associatedContrevenantsMetadata]);

  const baseContrevenantIdSet = useMemo(() => {
    const set = new Set<string>();
    if (Array.isArray(contrevenants)) {
      contrevenants.forEach((item: any) => {
        if (item?.id != null) {
          set.add(String(item.id));
        }
      });
    }
    return set;
  }, [contrevenants]);

  const injectedContrevenantIds = useMemo(() => new Set(Object.keys(injectedContrevenants)), [injectedContrevenants]);

  useEffect(() => {
    if (!Array.isArray(contrevenants) || contrevenants.length === 0) return;
    setInjectedContrevenants((prev) => {
      const next = { ...prev };
      let changed = false;
      const existingIds = new Set(contrevenants.map((c: any) => String(c?.id)));
      for (const id of Object.keys(next)) {
        if (existingIds.has(id)) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [contrevenants]);

  const ensureContrevenantVisible = useCallback(
    (data: any, metadata?: { associatedBy?: string | null; associatedAt?: string | null; status?: 'associated' | 'dissociated' }) => {
      if (!data) return;
      const dataId = data.id ?? data?.id_contrevenant ?? data?.contrevenant_id;
      if (dataId == null) return;
      const idStr = String(dataId);
      const baseHas = Array.isArray(contrevenants) && contrevenants.some((c: any) => String(c?.id) === idStr);
      setInjectedContrevenants((prev) => {
        if (baseHas || prev[idStr]) return prev;
        return { ...prev, [idStr]: { id: dataId, ...data } };
      });
      if (typeof data?.total_infractions_global === 'number' && Number.isFinite(data.total_infractions_global) && data.total_infractions_global >= 0) {
        setContrevenantTotalsOverrides((prev) => {
          if (prev[idStr] === data.total_infractions_global) return prev;
          return { ...prev, [idStr]: data.total_infractions_global };
        });
      }
      if (metadata) {
        setAssociatedContrevenantsMetadata((prev) => {
          const prevMeta = prev[idStr];
          if (metadata?.status === 'associated') {
            return {
              ...prev,
              [idStr]: {
                associatedBy: metadata.associatedBy ?? prevMeta?.associatedBy ?? null,
                associatedAt: metadata.associatedAt ?? prevMeta?.associatedAt ?? new Date().toISOString(),
                status: 'associated'
              }
            };
          }

          if (prevMeta?.status === 'dissociated' && metadata?.associatedBy) {
            return {
              ...prev,
              [idStr]: {
                associatedBy: metadata.associatedBy ?? prevMeta.associatedBy ?? null,
                associatedAt: metadata.associatedAt ?? prevMeta.associatedAt ?? new Date().toISOString(),
                status: 'associated'
              }
            };
          }
          const normalizedAssociatedBy = metadata.associatedBy ?? prevMeta?.associatedBy ?? null;
          const normalizedAssociatedAt = (() => {
            if (metadata.associatedAt) return metadata.associatedAt;
            if (prevMeta?.associatedAt) return prevMeta.associatedAt;
            return normalizedAssociatedBy ? new Date().toISOString() : null;
          })();
          if (
            prevMeta &&
            prevMeta.associatedBy === normalizedAssociatedBy &&
            prevMeta.associatedAt === normalizedAssociatedAt
          ) {
            return prev;
          }
          return {
            ...prev,
            [idStr]: {
              associatedBy: normalizedAssociatedBy,
              associatedAt: normalizedAssociatedAt,
              status: metadata?.status ?? (normalizedAssociatedBy ? 'associated' : prevMeta?.status)
            }
          };
        });
      }
    },
    [contrevenants]
  );

  const attachContrevenantById = useCallback(
    (
      rawId: number | string,
      options?: { forceToast?: boolean; toastTitle?: string; toastDescription?: string; ensureVisibleData?: any }
    ) => {
      const idStr = String(rawId);
      let added = false;
      setSelectedContrevenantIds((prev) => {
        if (prev.includes(idStr)) {
          return prev;
        }
        added = true;
        return [...prev, idStr];
      });
      setFormInfraction((prev) => {
        const existing = Array.isArray(prev.contrevenants) ? prev.contrevenants.map(String) : [];
        if (existing.includes(idStr)) {
          return prev;
        }
        return { ...prev, contrevenants: [...existing, idStr] };
      });

      if (options?.forceToast || added) {
        const title = options?.toastTitle || 'Contrevenant ajouté';
        const description = options?.toastDescription || "Le contrevenant a été associé à votre infraction.";
        toast({ title, description });
      }

      const displayName = resolvedUserAssociationLabel || 'Agent courant';
      const associatedAt = new Date().toISOString();

      ensureContrevenantVisible(
        { id: rawId, ...options?.ensureVisibleData },
        {
          associatedBy: displayName,
          associatedAt,
          status: 'associated'
        }
      );

      setAssociatedContrevenantsMetadata((prev) => {
        const prevMeta = prev[idStr];
        return {
          ...prev,
          [idStr]: {
            associatedBy: displayName,
            associatedAt: prevMeta?.associatedAt ?? associatedAt,
            status: 'associated'
          }
        };
      });
    },
    [ensureContrevenantVisible, setSelectedContrevenantIds, setFormInfraction, toast, resolvedUserAssociationLabel]
  );

  const linkDuplicateContrevenant = useCallback(() => {
    if (!duplicateContrevenantInfo?.id) return;
    attachContrevenantById(duplicateContrevenantInfo.id, {
      forceToast: true,
      toastTitle: 'Contrevenant associé',
      toastDescription: 'Le contrevenant existant a été lié à votre infraction en cours.',
      ensureVisibleData: duplicateContrevenantInfo
    });
    setDuplicateModalOpen(false);
    setDuplicateContrevenantInfo(null);
  }, [attachContrevenantById, duplicateContrevenantInfo]);

  const [formPV, setFormPV] = useState<{ infraction_id: string; numero_pv: string; fichier_pv?: File | null }>({
    infraction_id: '',
    numero_pv: '01',
    fichier_pv: null
  });

  const pvNumberSuffix = useMemo(() => {
    const regionLabel = (user?.region || '').toString().trim();
    const departementLabel = ((user as any)?.departement || '').toString().trim();
    if (isAdmin) {
      return '/DEFCCS';
    }
    if (isRegionalAgent) {
      return regionLabel ? `/IREF/${regionLabel}` : '/IREF/____';
    }
    if (isSectorAgent) {
      const dep = departementLabel || 'Département';
      const reg = regionLabel || 'Région';
      return `/secteur-${dep}/${reg}`;
    }
    return '';
  }, [isAdmin, isRegionalAgent, isSectorAgent, user]);

  const pvNumberPlaceholder = useMemo(() => {
    // Exemple de numéro: 01
    return `N° 01${pvNumberSuffix}`;
  }, [pvNumberSuffix]);

  // Vérification de zone (CSV / saisie manuelle)
  type VerificationCoordinate = { latitude: string; longitude: string } | { easting: string; northing: string; utmZone: string };
  const [verificationCoordinateSystem, setVerificationCoordinateSystem] = useState<'geographic' | 'utm'>('geographic');
  const [verificationCoordinates, setVerificationCoordinates] = useState<VerificationCoordinate[]>([]);
  const [verificationSystemLocked, setVerificationSystemLocked] = useState(false);
  const [verificationDerived, setVerificationDerived] = useState<{ pointCount: number; centroid?: { lat: number; lon: number } | null; geometryType: 'none' | 'point' | 'polygon'; }>({ pointCount: 0, centroid: null, geometryType: 'none' });

  // Code selection helper for dynamic linking to Settings codes
  const [selectedExistingCodeId, setSelectedExistingCodeId] = useState<string>('');
  const [codeSearchTerm, setCodeSearchTerm] = useState<string>('');
  const [codeSearchEnabled, setCodeSearchEnabled] = useState<boolean>(false);

  // Items (nature/article) for the selected code
  type CodeItem = { id: number; code_infraction_id: number; code: string; nature: string; article_code: string; is_default: boolean };
  const [codeItems, setCodeItems] = useState<CodeItem[]>([]);
  const [selectedCodeItemId, setSelectedCodeItemId] = useState<string>('');
  const [duplicateReceiptOpen, setDuplicateReceiptOpen] = useState(false);
  const [duplicateReceiptMsg, setDuplicateReceiptMsg] = useState('');

  const parseFiliation = useCallback((value: string) => {
    if (!value) return { pere: '', mere: '' };
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') {
        const pere = typeof parsed.pere === 'string' ? parsed.pere : (typeof parsed.father === 'string' ? parsed.father : '');
        const mere = typeof parsed.mere === 'string' ? parsed.mere : (typeof parsed.mother === 'string' ? parsed.mother : '');
        return { pere, mere };
      }
    } catch {}
    const parts = value.split('|').map((p) => p.trim());
    return {
      pere: parts[0] || '',
      mere: parts[1] || ''
    };
  }, []);

  const formatFiliation = useCallback((parts: { pere: string; mere: string }) => {
    const pere = parts.pere.trim();
    const mere = parts.mere.trim();
    if (!pere && !mere) {
      return '';
    }
    return JSON.stringify({ pere, mere });
  }, []);

  const validateContrevenantForm = (options?: { requireUploads?: boolean }) => {
    const requireUploads = options?.requireUploads ?? true;
    const nom = formContrevenant.nom.trim();
    if (!nom) throw new Error('Le nom est requis');

    const prenom = formContrevenant.prenom.trim();
    if (!prenom) throw new Error('Le prénom est requis');

    const filiation = formatFiliation({
      pere: formContrevenant.filiation_pere,
      mere: formContrevenant.filiation_mere
    });
    const { pere, mere } = parseFiliation(filiation);

    if (!pere && !mere) {
      throw new Error('La filiation est requise');
    }

    const numeroPiece = formContrevenant.numero_piece.trim();
    if (!numeroPiece) throw new Error('Le numéro de pièce est requis');

    const typePiece = formContrevenant.type_piece?.trim();
    if (!typePiece) throw new Error('Le type de pièce est requis');

    if (requireUploads) {
      if (!formContrevenant.photo) throw new Error('La photo est requise');
      if (!formContrevenant.piece_identite) throw new Error("La pièce d'identité (scan) est requise");
    }

    return {
      nom,
      prenom,
      filiation,
      numeroPiece,
      typePiece
    };
  };

  const contrevenantFormIsValid = useMemo(() => {
    try {
      validateContrevenantForm({ requireUploads: !editingContrevenantId });
      return true;
    } catch {
      return false;
    }
  }, [formContrevenant, editingContrevenantId]);

  const agentFormIsValid = useMemo(() => {
    return Boolean(
      formAgent.prenom.trim() &&
      formAgent.nom.trim() &&
      formAgent.matricule.trim()
    );
  }, [formAgent]);

  const { data: infractions = [] } = useQuery({
    queryKey: ['infractions'],
    queryFn: async () => {
      const response = await apiRequest<any>('GET', '/api/infractions/infractions');
      return response.data || [];
    }
  });

  const contrevenantInfractionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const list = Array.isArray(contrevenants) ? contrevenants : [];
    list.forEach((item: any) => {
      if (!item) return;
      const rawId = item.id ?? item?.contrevenant_id ?? item?.contrevenantId;
      if (rawId == null) return;
      const key = String(rawId);
      const total = typeof item.total_infractions_global === 'number' ? item.total_infractions_global : undefined;
      if (typeof total === 'number' && Number.isFinite(total)) {
        counts.set(key, total);
        return;
      }
      const fallbackTotal = typeof item.totalInfractions === 'number' ? item.totalInfractions : undefined;
      if (typeof fallbackTotal === 'number' && Number.isFinite(fallbackTotal)) {
        counts.set(key, fallbackTotal);
      }
    });
    Object.entries(contrevenantTotalsOverrides).forEach(([key, total]) => {
      if (typeof total === 'number' && Number.isFinite(total) && total >= 0) {
        counts.set(key, total);
      }
    });
    return counts;
  }, [contrevenants, contrevenantTotalsOverrides]);

  useEffect(() => {
    if (!Array.isArray(augmentedContrevenants) || augmentedContrevenants.length === 0) return;
    const idsToFetch = augmentedContrevenants
      .map((c: any) => (c?.id != null ? String(c.id) : ''))
      .filter((id: string | undefined) => {
        if (!id) return false;
        if (baseContrevenantIdSet.has(id)) return false;
        if (contrevenantTotalsOverrides[id] !== undefined) return false;
        return true;
      });
    if (idsToFetch.length === 0) return;

    let cancelled = false;
    (async () => {
      for (const id of idsToFetch) {
        try {
          const resp = await apiRequest<any>('GET', `/api/infractions/contrevenants/${id}`);
          if (!resp?.ok || !resp?.data || cancelled) continue;
          const details = resp.data;
          const totalFromApi = typeof details.total_infractions_global === 'number' ? details.total_infractions_global : undefined;
          const totalFromHistory = Array.isArray(details.infractions_history) ? details.infractions_history.length : undefined;
          const effectiveTotal = typeof totalFromApi === 'number' && Number.isFinite(totalFromApi)
            ? totalFromApi
            : typeof totalFromHistory === 'number' && Number.isFinite(totalFromHistory)
              ? totalFromHistory
              : undefined;
          if (typeof effectiveTotal === 'number' && effectiveTotal >= 0) {
            setContrevenantTotalsOverrides((prev) => {
              if (prev[id] === effectiveTotal) return prev;
              return { ...prev, [id]: effectiveTotal };
            });
          }
        } catch (error) {
          console.warn('[Infractions] Impossible de récupérer le total global du contrevenant %s:', id, error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [augmentedContrevenants, baseContrevenantIdSet, contrevenantTotalsOverrides]);

  // Queries
  const updateContrevenantMutation = useMutation({
    mutationFn: async () => {
      if (!editingContrevenantId) throw new Error('Aucun contrevenant à mettre à jour');
      const sanitized = validateContrevenantForm({ requireUploads: false });

      const fd = new FormData();
      fd.append('nom', sanitized.nom);
      fd.append('prenom', sanitized.prenom);
      fd.append('filiation', sanitized.filiation);
      fd.append('numero_piece', sanitized.numeroPiece);
      fd.append('type_piece', sanitized.typePiece);
      if (formContrevenant.photo) fd.append('photo', formContrevenant.photo);
      if (formContrevenant.piece_identite) fd.append('piece_identite', formContrevenant.piece_identite);
      if (formContrevenant.donnees_biometriques) fd.append('donnees_biometriques', formContrevenant.donnees_biometriques);

      const resp = await apiRequest<any>('PUT', `/api/infractions/contrevenants/${editingContrevenantId}`, fd);
      if (!resp.ok) {
        const error = new Error(resp.error || 'Mise à jour impossible') as Error & { status?: number; payload?: any };
        error.status = resp.status;
        error.payload = resp.data;
        throw error;
      }
      return resp.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contrevenants'] });
      setOpenCreateContrevenant(false);
      setEditingContrevenantId(null);
      setFormContrevenant(emptyContrevenantForm);
      setDuplicateContrevenantInfo(null);
      setDuplicateModalOpen(false);
      toast({ title: 'Succès', description: 'Contrevenant mis à jour' });
    },
    onError: (e: any) => {
      if (e?.status === 409) {
        setDuplicateContrevenantInfo(e?.payload?.conflict || null);
        setDuplicateModalOpen(true);
        return;
      }
      toast({ title: 'Erreur', description: e?.message || 'Mise à jour échouée' });
    }
  });

  const resetContrevenantForm = () => {
    setFormContrevenant(emptyContrevenantForm);
    setEditingContrevenantId(null);
    setDuplicateContrevenantInfo(null);
  };

  const resetCheckContrevenantState = useCallback(() => {
    setCheckContrevenantNumber('');
    setCheckContrevenantLoading(false);
    setCheckContrevenantResult(null);
    setCheckContrevenantError(null);
  }, []);

  const handleOpenCheckContrevenant = () => {
    resetCheckContrevenantState();
    setOpenCheckContrevenant(true);
  };

  const handleOpenCreateContrevenant = () => {
    resetContrevenantForm();
    setOpenCreateContrevenant(true);
  };

  const handleCloseContrevenantModal = (open: boolean) => {
    setOpenCreateContrevenant(open);
    if (!open) {
      resetContrevenantForm();
    }
  };

  const parseRawFiliation = useCallback((value: string) => {
    if (!value) return { pere: '', mere: '' };
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') {
        return {
          pere: typeof parsed.pere === 'string' ? parsed.pere : (typeof parsed.father === 'string' ? parsed.father : ''),
          mere: typeof parsed.mere === 'string' ? parsed.mere : (typeof parsed.mother === 'string' ? parsed.mother : '')
        };
      }
    } catch {}
    const parts = value.split('|').map((p) => p.trim());
    return {
      pere: parts[0] || '',
      mere: parts[1] || ''
    };
  }, []);

  const renderFiliationLines = useCallback((value: string) => {
    const parts = parseRawFiliation(value);
    const lines: string[] = [];
    if (parts.pere) lines.push(`Père : ${parts.pere}`);
    if (parts.mere) lines.push(`Mère : ${parts.mere}`);
    return lines.length > 0 ? lines.join('\n') : '';
  }, [parseRawFiliation]);

  const formatDateTime = useCallback((value?: string | null) => {
    if (!value) return '—';
    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toLocaleString('fr-FR');
    } catch {
      return String(value);
    }
  }, []);

  const formatCurrency = useCallback((value?: number | string | null) => {
    if (value === null || value === undefined || value === '') return '—';
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return String(value);
    return `${num.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} F CFA`;
  }, []);

  const handleViewContrevenant = useCallback(async (payload: any) => {
    setSelectedContrevenant(payload);
    setSelectedContrevenantDetails(null);
    setViewContrevenantError(null);
    setViewContrevenantOpen(true);
    setViewContrevenantLoading(true);
    try {
      const resp = await apiRequest<any>('GET', `/api/infractions/contrevenants/${payload.id}`);
      if (!resp.ok) {
        throw new Error(resp.error || 'Impossible de charger le contrevenant');
      }
      const details = resp.data || null;
      if (details && details.id != null) {
        const key = String(details.id);
        const totalFromApi = typeof details.total_infractions_global === 'number' ? details.total_infractions_global : undefined;
        const totalFromHistory = Array.isArray(details.infractions_history) ? details.infractions_history.length : undefined;
        const effectiveTotal = typeof totalFromApi === 'number' && Number.isFinite(totalFromApi)
          ? totalFromApi
          : typeof totalFromHistory === 'number' && Number.isFinite(totalFromHistory)
            ? totalFromHistory
            : undefined;
        if (typeof effectiveTotal === 'number' && effectiveTotal >= 0) {
          setContrevenantTotalsOverrides((prev) => {
            if (prev[key] === effectiveTotal) return prev;
            return { ...prev, [key]: effectiveTotal };
          });
        }
      }
      setSelectedContrevenantDetails(details);
    } catch (error: any) {
      setViewContrevenantError(error?.message || 'Chargement impossible');
    } finally {
      setViewContrevenantLoading(false);
    }
  }, []);

  const handleOpenZoom = useCallback((src: string | null, title: string) => {
    if (!src) return;
    setZoomMedia({ src, title });
    setZoomOpen(true);
  }, []);

  const [contrevenantsMedia, setContrevenantsMedia] = useState<Record<string, { photo?: string | null; piece?: string | null }>>({});
  const [pvMedia, setPvMedia] = useState<Record<string, { infraction?: string | null; quittance?: string | null }>>({});

  const getAuthHeaders = useCallback((): HeadersInit => {
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('access_token');
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  }, []);

  const fetchObjectUrl = useCallback(async (path: string): Promise<string | null> => {
    try {
      const res = await fetch(path, { credentials: 'include', headers: getAuthHeaders() });
      if (!res.ok) return null;
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (!openViewPV || !selectedPV || !Array.isArray(selectedPV.contrevenants)) return;
    const needLoads = selectedPV.contrevenants.filter((c: any) => {
      const id = String(c.id ?? '');
      const cached = id ? contrevenantsMedia[id] : undefined;
      const hasAnyPhoto = c.photo_url || c.photo_base64 || c.photo || (cached && cached.photo);
      const hasAnyPiece = c.piece_identite_url || c.piece_identite_base64 || c.piece_identite || (cached && cached.piece);
      return id && (!hasAnyPhoto || !hasAnyPiece);
    });
    if (needLoads.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, { photo?: string | null; piece?: string | null }> = {};
      for (const c of needLoads) {
        try {
          const resp = await apiRequest<any>('GET', `/api/infractions/contrevenants/${c.id}`);
          if (resp.ok && resp.data) {
            updates[String(c.id)] = {
              photo: resp.data.photo_base64 ?? null,
              piece: resp.data.piece_identite_base64 ?? null,
            };
          }
          // Si base64 manquant, essayer via fetch blob sur endpoints binaires
          const current = updates[String(c.id)] || {};
          if (!current.photo) {
            const objUrl = await fetchObjectUrl(`/api/infractions/contrevenants/${c.id}/photo`);
            if (objUrl) current.photo = objUrl;
          }
          if (!current.piece) {
            const objUrl = await fetchObjectUrl(`/api/infractions/contrevenants/${c.id}/piece-identite`);
            if (objUrl) current.piece = objUrl;
          }
          updates[String(c.id)] = current;
        } catch {}
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setContrevenantsMedia((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openViewPV, selectedPV, apiRequest, fetchObjectUrl, contrevenantsMedia]);

  // Prefetch PV-level media (photo infraction / quittance) to ensure preview shows
  useEffect(() => {
    if (!openViewPV || !selectedPV?.id) return;
    let cancelled = false;
    (async () => {
      const infId = String(selectedPV.infraction?.id || selectedPV.id);
      const current = pvMedia[infId] || {};
      const updates: { infraction?: string | null; quittance?: string | null } = { ...current };

      if (!updates.infraction) {
        const objUrl = await fetchObjectUrl(`/api/infractions/infractions/${infId}/photo-infraction`);
        if (objUrl) updates.infraction = objUrl;
      }
      if (!updates.quittance) {
        const objUrl = await fetchObjectUrl(`/api/infractions/infractions/${infId}/photo-quittance`);
        if (objUrl) updates.quittance = objUrl;
      }
      if (!cancelled && (updates.infraction || updates.quittance)) {
        setPvMedia((prev) => ({ ...prev, [infId]: updates }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openViewPV, selectedPV, fetchObjectUrl]);

  // Révoquer tous les blob URLs quand le modal PV se ferme
  useEffect(() => {
    if (openViewPV) return;
    try {
      Object.values(contrevenantsMedia).forEach((m) => {
        if (m?.photo && typeof m.photo === 'string' && m.photo.startsWith('blob:')) URL.revokeObjectURL(m.photo);
        if (m?.piece && typeof m.piece === 'string' && m.piece.startsWith('blob:')) URL.revokeObjectURL(m.piece);
      });
      Object.values(pvMedia).forEach((m) => {
        if (m?.infraction && m.infraction.startsWith('blob:')) URL.revokeObjectURL(m.infraction);
        if (m?.quittance && m.quittance.startsWith('blob:')) URL.revokeObjectURL(m.quittance);
      });
    } catch {}
  }, [openViewPV]);

  const getContrevenantPhotoSrc = useCallback((c: any): string | null => {
    if (!c) return null;
    const id = String(c.id ?? '');
    const cached = id ? contrevenantsMedia[id]?.photo : null;
    const rel = cached || c.photo_url || c.photo_base64 || c.photo || (c.id ? `/api/infractions/contrevenants/${c.id}/photo` : null);
    if (!rel) return null;
    if (typeof rel === 'string' && (rel.startsWith('http://') || rel.startsWith('https://') || rel.startsWith('data:'))) return rel;
    return window.location.origin + rel;
  }, [contrevenantsMedia]);

  const getContrevenantPieceSrc = useCallback((c: any): string | null => {
    if (!c) return null;
    const id = String(c.id ?? '');
    const cached = id ? contrevenantsMedia[id]?.piece : null;
    const rel = cached || c.piece_identite_url || c.piece_identite_base64 || c.piece_identite || (c.id ? `/api/infractions/contrevenants/${c.id}/piece-identite` : null);
    if (!rel) return null;
    if (typeof rel === 'string' && (rel.startsWith('http://') || rel.startsWith('https://') || rel.startsWith('data:'))) return rel;
    return window.location.origin + rel;
  }, [contrevenantsMedia]);

  const isPdfSrc = useCallback((src: string | null | undefined) => {
    if (!src || typeof src !== 'string') return false;
    const lower = src.toLowerCase();
    return lower.includes('.pdf') || lower.startsWith('data:application/pdf');
  }, []);

  const isImageSrc = useCallback((src: string | null | undefined) => {
    if (!src || typeof src !== 'string') return false;
    const lower = src.toLowerCase();
    return (
      lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') ||
      lower.endsWith('.gif') || lower.endsWith('.webp') || lower.startsWith('data:image/') || lower.endsWith('#img')
    );
  }, []);

  const isBlobUrl = useCallback((src: string | null | undefined) => {
    return !!(src && typeof src === 'string' && src.startsWith('blob:'));
  }, []);

  const openPvInModal = useCallback(async (pv: any) => {
    // Le PV peut être dans pv.pv (si c'est une infraction avec PV) ou directement pv (si c'est un PV)
    const pvId = pv?.pv?.id || pv?.id;
    if (!pvId) {
      console.warn('Aucun ID PV trouvé pour ouvrir le document');
      return;
    }

    // 1) Essayer d'abord via fetch (avec Authorization) pour éviter les 401 dans l'iframe
    try {
      const objUrl = await fetchObjectUrl(`/api/infractions/pv/${pvId}/file?mode=inline`);
      if (objUrl) {
        setZoomMedia({ src: objUrl + '#zoom=80', title: 'Procès-verbal signé' });
        setZoomOpen(true);
        return;
      }
    } catch {}

    // 2) Fallback URL directe (même origine)
    setZoomMedia({ src: `/api/infractions/pv/${pvId}/file?mode=inline#zoom=80`, title: 'Procès-verbal signé' });
    setZoomOpen(true);
  }, [fetchObjectUrl]);

  const getInfractionPhotoSrc = useCallback((pv: any): string | null => {
    if (!pv) return null;
    const id = String(pv.infraction?.id || pv.id || '');
    const cached = id ? pvMedia[id]?.infraction : null;
    if (cached) return cached;
    const hasPhoto = pv.photo_infraction != null || pv.infraction?.photo_infraction != null;
    if (!hasPhoto) return null;
    const src = (typeof pv.photo_infraction === 'string' ? pv.photo_infraction : null) || (typeof pv.infraction?.photo_infraction === 'string' ? pv.infraction.photo_infraction : null);
    let rel: string | null = null;
    if (src && (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:'))) rel = src;
    else if (src) rel = src;
    else if (pv?.infraction?.id || pv?.id) rel = `/api/infractions/infractions/${pv.infraction?.id || pv.id}/photo-infraction`;
    if (!rel) return null;
    if (rel.startsWith('http') || rel.startsWith('data:')) return rel;
    return window.location.origin + rel;
  }, [pvMedia]);

  const addVerificationCoordinate = useCallback(() => {
    const next = verificationCoordinateSystem === 'geographic'
      ? ({ latitude: '', longitude: '' } as VerificationCoordinate)
      : ({ easting: '', northing: '', utmZone: '28N' } as unknown as VerificationCoordinate);
    setVerificationCoordinates(prev => [...prev, next]);
  }, [verificationCoordinateSystem]);

  const removeVerificationCoordinate = useCallback((index: number) => {
    setVerificationCoordinates(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateVerificationCoordinate = useCallback((index: number, field: 'latitude' | 'longitude' | 'easting' | 'northing' | 'utmZone', value: string) => {
    setVerificationCoordinates(prev => prev.map((c: any, i) => i === index ? { ...c, [field]: value } : c));
  }, []);

  const clearVerification = useCallback(() => {
    setVerificationCoordinates([]);
    setVerificationSystemLocked(false);
  }, []);

  const handleZoneIdentifyMethodChange = useCallback((value: 'geolocate' | 'coords') => {
    setZoneIdentifyMethod(value);

    // Réinitialiser les champs liés à la zone et aux coordonnées
    setFormInfraction(prev => ({
      ...prev,
      region: '',
      departement: '',
      commune: '',
      arrondissement: '',
      latitude: '',
      longitude: ''
    }));

    // Réinitialiser la vérification par coordonnées (CSV / saisie)
    setVerificationCoordinateSystem('geographic');
    setVerificationCoordinates([]);
    setVerificationSystemLocked(false);
    setVerificationDerived({ pointCount: 0, centroid: null, geometryType: 'none' });
    setVerificationTab('manual');
  }, [setZoneIdentifyMethod, setFormInfraction, setVerificationCoordinateSystem, setVerificationCoordinates, setVerificationSystemLocked, setVerificationDerived, setVerificationTab]);

  const utmToLatLon = (easting: number, northing: number, zone: string = '28N'): { latitude: number; longitude: number } => {
    const m = zone.match(/^(\d+)([NS]?)$/i);
    if (!m) throw new Error('Zone UTM invalide');
    const num = parseInt(m[1]);
    const hemi = (m[2] || 'N').toUpperCase();
    const epsg = hemi === 'N' ? 32600 + num : 32700 + num;
    const [lon, lat] = proj4(`EPSG:${epsg}`, 'EPSG:4326', [easting, northing]);
    return { latitude: lat, longitude: lon };
  };

  const calculateCentroid = (coordinates: VerificationCoordinate[], system: 'geographic' | 'utm') => {
    const valid = coordinates.filter((c: any) => system === 'geographic' ? (c?.latitude && c?.longitude) : (c?.easting && c?.northing));
    if (!valid.length) return { lat: 0, lon: 0 };
    if (system === 'geographic') {
      const sumLat = valid.reduce((s: number, c: any) => s + Number(String(c.latitude).replace(',', '.')), 0);
      const sumLon = valid.reduce((s: number, c: any) => s + Number(String(c.longitude).replace(',', '.')), 0);
      return { lat: sumLat / valid.length, lon: sumLon / valid.length };
    }
    const sumE = valid.reduce((s: number, c: any) => s + Number(String(c.easting).replace(',', '.')), 0);
    const sumN = valid.reduce((s: number, c: any) => s + Number(String(c.northing).replace(',', '.')), 0);
    const meanE = sumE / valid.length;
    const meanN = sumN / valid.length;
    const zone = (valid[0] as any).utmZone || '28N';
    const { latitude, longitude } = utmToLatLon(meanE, meanN, zone);
    return { lat: latitude, lon: longitude };
  };

  const findRegionFromPoint = useCallback(async (lat: number, lon: number): Promise<string | null> => {
    try {
      const resp = await apiRequest<any>('GET', `/api/regions/detect-from-point?latitude=${lat}&longitude=${lon}`);
      const data = resp?.data;
      const name = data?.region?.nom ?? data?.region?.name;
      return data?.success && name ? String(name) : null;
    } catch {
      return null;
    }
  }, []);

  const findDepartementFromPoint = useCallback(async (lat: number, lon: number): Promise<string | null> => {
    try {
      const resp = await apiRequest<any>('GET', `/api/departements/detect-from-point?latitude=${lat}&longitude=${lon}`);
      const data = resp?.data;
      const name = data?.departement?.nom ?? data?.departement?.name;
      return data?.success && name ? String(name) : null;
    } catch {
      return null;
    }
  }, []);

  const onVerificationCsvChange = useCallback(async (file?: File | null) => {
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return;
    const headerLine = lines[0];
    const delimiter = headerLine.includes(';') && !headerLine.includes(',') ? ';' : ',';
    const splitCsv = (line: string) => {
      const pattern = delimiter === ',' ? /,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/ : /;(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/;
      return line.split(pattern).map(s => s.trim().replace(/^\"|\"$/g, ''));
    };
    const headersRaw = splitCsv(headerLine);
    const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').trim();
    const headers = headersRaw.map(h => ({ raw: h, key: norm(h) }));
    const findCol = (...c: string[]) => {
      const set = c.map(norm);
      const hit = headers.find(h => set.includes(h.key));
      return hit ? headersRaw[headers.indexOf(hit)] : undefined;
    };
    const rows = lines.slice(1).map(splitCsv).filter(r => r.length > 0);
    const idx = (name?: string) => (name ? headersRaw.indexOf(name) : -1);
    const latCol = findCol('lat', 'latitude', 'y');
    const lonCol = findCol('lon', 'longitude', 'x');
    const eastCol = findCol('easting', 'east', 'e', 'x');
    const northCol = findCol('northing', 'north', 'n', 'y');
    const zoneCol = findCol('zone', 'utm', 'utmzone');
    let coords: VerificationCoordinate[] = [];
    let detected: 'geographic' | 'utm' = 'geographic';
    const toNum = (s: string) => Number(String(s ?? '').replace(',', '.'));
    if (latCol && lonCol) {
      const ilat = idx(latCol), ilon = idx(lonCol);
      const sample = rows.slice(0, Math.min(50, rows.length));
      const lats = sample.map(r => toNum(r[ilat])).filter(n => !isNaN(n));
      const lons = sample.map(r => toNum(r[ilon])).filter(n => !isNaN(n));
      const looksUTM = Math.max(...(lats.length ? lats.map(Math.abs) : [0])) > 1000 && Math.max(...(lons.length ? lons.map(Math.abs) : [0])) > 1000;
      if (looksUTM) {
        detected = 'utm';
        coords = rows.map(r => ({ easting: String(r[ilon] ?? '').replace(',', '.'), northing: String(r[ilat] ?? '').replace(',', '.'), utmZone: '28N' } as any));
      } else {
        detected = 'geographic';
        coords = rows.map(r => ({ latitude: String(r[ilat] ?? '').replace(',', '.'), longitude: String(r[ilon] ?? '').replace(',', '.') }));
      }
    } else if (eastCol && northCol) {
      const ie = idx(eastCol), in_ = idx(northCol), iz = idx(zoneCol);
      detected = 'utm';
      coords = rows.map(r => ({ easting: String(r[ie] ?? '').replace(',', '.'), northing: String(r[in_] ?? '').replace(',', '.'), utmZone: String((iz >= 0 ? r[iz] : '28N') || '28N') } as any));
    }
    coords = coords.filter((c: any) => detected === 'geographic' ? (c.latitude && c.longitude) : (c.easting && c.northing));
    if (!coords.length) return;
    setVerificationCoordinateSystem(detected);
    setVerificationCoordinates(coords);
    setVerificationSystemLocked(true);
  }, []);

  useEffect(() => {
    const arr = verificationCoordinates as any[];
    const count = arr.filter(c => verificationCoordinateSystem === 'geographic' ? (c?.latitude && c?.longitude) : (c?.easting && c?.northing)).length;
    let geometryType: 'none' | 'point' | 'polygon' = 'none';
    if (count === 1) geometryType = 'point'; else if (count >= 3) geometryType = 'polygon';
    const centroid = count > 0 ? calculateCentroid(verificationCoordinates, verificationCoordinateSystem) : null;
    setVerificationDerived({ pointCount: count, centroid, geometryType });
  }, [verificationCoordinates, verificationCoordinateSystem]);

  const isAreaWithinUserZone = useCallback((areas: { region?: string | null; departement?: string | null; commune?: string | null; arrondissement?: string | null } | null | undefined) => {
    if (!areas) return true;
    if (isAdmin) return true;

    const norm = roleContext?.norm || ((v: any) => String(v ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase());

    const userRegion = norm(user?.region);
    const userDept = norm((user as any)?.departement);
    const targetRegion = norm(areas.region);
    const targetDept = norm(areas.departement);

    if (isSectorAgent) {
      // Agent de secteur (sub-agent) : verrouillage sur le département
      if (userDept && targetDept && userDept !== targetDept) return false;
      // Si pas de département, on tombe sur la région
      if (!targetDept && userRegion && targetRegion && userRegion !== targetRegion) return false;
      return true;
    }

    if (isBrigadeOrOtherSubRole) {
      // Sous-rôles départementaux (brigade, triage, poste-control, sous-secteur) :
      // Verrouillage sur leur zone spécifique (commune/arrondissement/sousService)
      const userCommune = norm((user as any)?.commune);
      const userArrond = norm((user as any)?.arrondissement);
      const userSousService = norm((user as any)?.sousService || (user as any)?.sous_service);
      const targetCommune = norm(areas.commune);
      const targetArrond = norm(areas.arrondissement);

      // Département doit matcher
      if (userDept && targetDept && userDept !== targetDept) return false;
      // Commune doit matcher si l'utilisateur en a une
      if (userCommune && targetCommune && userCommune !== targetCommune) return false;
      // Arrondissement doit matcher si l'utilisateur en a un
      if (userArrond && targetArrond && userArrond !== targetArrond) return false;
      return true;
    }

    if (isRegionalAgent) {
      // Agent régional : verrouillage sur la région
      if (userRegion && targetRegion && userRegion !== targetRegion) return false;
      return true;
    }

    return true;
  }, [isAdmin, isSectorAgent, isBrigadeOrOtherSubRole, isRegionalAgent, roleContext, user]);

  const applyVerificationToForm = useCallback(async () => {
    const c = verificationDerived.centroid;
    if (!c) return;

    // Mettre à jour les coordonnées dans le formulaire
    setFormInfraction(prev => ({
      ...prev,
      latitude: c.lat.toString(),
      longitude: c.lon.toString(),
    }));

    try {
      // Utiliser l'endpoint dédié pour résoudre toutes les zones admin à partir du point
      const resp = await apiRequest<any>('GET', `/api/infractions/resolve-areas?lat=${c.lat}&lon=${c.lon}`);
      const areas = resp?.data || resp;

      if (areas) {
        const nextAreas = {
          region: areas.region ?? null,
          departement: areas.departement ?? null,
        };

        const within = isAreaWithinUserZone(nextAreas);
        setGeoOutOfZoneInfo(within ? null : {
          region: String(areas.region || ''),
          departement: String(areas.departement || ''),
        });

        setFormInfraction(prev => ({
          ...prev,
          region: areas.region ?? prev.region ?? '',
          departement: areas.departement ?? prev.departement ?? '',
          commune: areas.commune ?? prev.commune ?? '',
          arrondissement: areas.arrondissement ?? prev.arrondissement ?? '',
        }));
      } else {
        // Fallback minimal si jamais la réponse est vide
        const region = await findRegionFromPoint(c.lat, c.lon);
        const dep = await findDepartementFromPoint(c.lat, c.lon);
        setFormInfraction(prev => ({
          ...prev,
          region: region || prev.region,
          departement: dep || prev.departement,
        }));
      }
    } catch (err) {
      console.error('[applyVerificationToForm] resolve-areas error:', err);
      // En cas d'erreur, on garde le fallback région/département
      const region = await findRegionFromPoint(c.lat, c.lon);
      const dep = await findDepartementFromPoint(c.lat, c.lon);
      setFormInfraction(prev => ({
        ...prev,
        region: region || prev.region,
        departement: dep || prev.departement,
      }));
    }
  }, [verificationDerived, setFormInfraction, apiRequest, isAreaWithinUserZone, findRegionFromPoint, findDepartementFromPoint, setGeoOutOfZoneInfo]);

  const getQuittancePhotoSrc = useCallback((pv: any): string | null => {
    if (!pv) return null;
    const id = String(pv.id ?? '');
    const cached = id ? pvMedia[id]?.quittance : null;
    if (cached) return cached;
    const hasPhoto = pv.photo_quittance != null || pv.infraction?.photo_quittance != null;
    if (!hasPhoto) return null;
    const src = (typeof pv.photo_quittance === 'string' ? pv.photo_quittance : null) || (typeof pv.infraction?.photo_quittance === 'string' ? pv.infraction.photo_quittance : null);
    let rel: string | null = null;
    if (src && (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:'))) rel = src;
    else if (src) rel = src;
    else if (pv?.infraction?.id || pv?.id) rel = `/api/infractions/infractions/${pv.infraction?.id || pv.id}/photo-quittance`;
    if (!rel) return null;
    if (rel.startsWith('http') || rel.startsWith('data:')) return rel;
    return window.location.origin + rel;
  }, [pvMedia]);

  const handleCloseAgentModal = (open: boolean) => {
    setOpenCreateAgent(open);
    if (!open) {
      setFormAgent({ nom: '', prenom: '', matricule: '' });
      setEditingAgentId(null);
    }
  };

  const handleEditAgent = (agent: any) => {
    setEditingAgentId(agent.id);
    setFormAgent({
      nom: agent.nom || '',
      prenom: agent.prenom || '',
      matricule: agent.matricule || ''
    });
    setOpenCreateAgent(true);
  };

  const canEditContrevenant = useCallback(
    (entity: any) => {
      if (!entity) return false;
      if (roleContext?.isAdmin) return true;

      const id = entity?.id ?? entity?.contrevenant_id ?? entity?.contrevenantId;
      if (id == null) return false;
      const key = String(id);

      const isCreatedByCurrentUser = typeof roleContext?.isCreatedByMe === 'function' ? roleContext.isCreatedByMe(entity) : false;
      if (isCreatedByCurrentUser) return true;

      const associationMeta = associatedContrevenantsMetadata[key] ?? entity?.associationMetadata ?? null;
      if (!associationMeta) return true;
      const status = associationMeta?.status ?? (associationMeta?.associatedBy ? 'associated' : undefined);
      if (status === 'dissociated') return true;

      const associatedByLabel = normalizeAssociationLabel(
        associationMeta?.associatedBy ?? (associationMeta as any)?.associated_by ?? null
      );
      if (!associatedByLabel) return true;

      return associatedByLabel !== normalizedCurrentAssociationLabel;
    },
    [associatedContrevenantsMetadata, normalizeAssociationLabel, normalizedCurrentAssociationLabel, roleContext]
  );

  const handleEditContrevenant = (payload: any) => {
    if (!canEditContrevenant(payload)) {
      toast({
        title: 'Action non autorisée',
        description: 'Ce contrevenant a seulement été associé. Seul son créateur peut modifier sa fiche.',
        variant: 'destructive'
      });
      return;
    }
    setEditingContrevenantId(payload.id);
    const filiationParts = parseFiliation(payload.filiation || '');
    setFormContrevenant({
      nom: payload.nom || '',
      prenom: payload.prenom || '',
      filiation_pere: filiationParts.pere || '',
      filiation_mere: filiationParts.mere || '',
      numero_piece: payload.numero_piece || '',
      type_piece: payload.type_piece || '',
      photo: null,
      piece_identite: null,
      donnees_biometriques: null,
      date_naissance: payload.date_naissance || '',
      lieu_naissance: payload.lieu_naissance || '',
      adresse: payload.adresse || ''
    });
    setDuplicateContrevenantInfo(null);
    setDuplicateModalOpen(false);
    setOpenCreateContrevenant(true);
  };

  const handleSubmitContrevenant = () => {
    if (editingContrevenantId) {
      updateContrevenantMutation.mutate();
    } else {
      createContrevenantMutation.mutate();
    }
  };

  // Create mutations
  const createCodeMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...formCode } as any;
      const resp = await apiRequest<any>('POST', '/api/infractions/codes', payload);
      if (!resp.ok) throw new Error(resp.error || 'Création impossible');
      return resp.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['codes-infractions'] });
      setOpenCreateCode(false);
      setFormCode({ code: '', nature: '', article_code: '' });
      toast({ title: 'Succès', description: 'Code créé' });
    },
    onError: (e: any) => {
      const status = e?.status ?? e?.response?.status;
      const code = e?.payload?.code ?? e?.response?.data?.code;
      const targetRegion = e?.payload?.targetRegion ?? e?.response?.data?.targetRegion;
      const targetDepartement = e?.payload?.targetDepartement ?? e?.response?.data?.targetDepartement;
      if (status === 403 && code === 'OUTSIDE_REGION') {
        setOutOfZoneInfo({
          region: String(targetRegion || '').trim(),
          departement: String(targetDepartement || '').trim()
        });
        setOutOfZoneModalOpen(true);
        return;
      }
      if (status === 409 && code === 'RECEIPT_DUPLICATE') {
        const msg = e?.payload?.message || e?.response?.data?.message || 'Numéro de quittance déjà utilisé.';
        setDuplicateReceiptMsg(msg);
        setDuplicateReceiptOpen(true);
        return;
      }
      toast({ title: 'Erreur', description: e?.message || 'Création échouée' });
    }
  });

  const createAgentMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('nom', formAgent.nom);
      fd.append('prenom', formAgent.prenom);
      if (formAgent.matricule) fd.append('matricule', formAgent.matricule);
      const resp = await apiRequest<any>('POST', '/api/infractions/agents', fd);
      if (!resp.ok) throw new Error(resp.error || 'Création impossible');
      return resp.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agents-verbalisateurs'] });
      setOpenCreateAgent(false);
      setFormAgent({ nom: '', prenom: '', matricule: '' });
      setEditingAgentId(null);
      toast({ title: 'Succès', description: 'Agent créé' });
    },
    onError: (e: any) => {
      const status = e?.status ?? e?.response?.status;
      const code = e?.payload?.code ?? e?.response?.data?.code;
      const targetRegion = e?.payload?.targetRegion ?? e?.response?.data?.targetRegion;
      const targetDepartement = e?.payload?.targetDepartement ?? e?.response?.data?.targetDepartement;

      if (status === 403 && code === 'OUTSIDE_REGION') {
        setOutOfZoneInfo({
          region: String(targetRegion || '').trim(),
          departement: String(targetDepartement || '').trim()
        });
        setOutOfZoneModalOpen(true);
        return;
      }

      if (status === 409 && code === 'RECEIPT_DUPLICATE') {
        setReceiptDuplicateModalOpen(true);
        return;
      }

      toast({ title: 'Erreur', description: e?.message || 'Création échouée' });
    }
  });

  const updateAgentMutation = useMutation({
    mutationFn: async () => {
      if (!editingAgentId) throw new Error('Aucun agent sélectionné');
      const fd = new FormData();
      fd.append('nom', formAgent.nom);
      fd.append('prenom', formAgent.prenom);
      if (formAgent.matricule) fd.append('matricule', formAgent.matricule);
      const resp = await apiRequest<any>('PUT', `/api/infractions/agents/${editingAgentId}`, fd);
      if (!resp.ok) throw new Error(resp.error || 'Mise à jour impossible');
      return resp.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agents-verbalisateurs'] });
      setOpenCreateAgent(false);
      setFormAgent({ nom: '', prenom: '', matricule: '' });
      setEditingAgentId(null);
      toast({ title: 'Succès', description: 'Agent mis à jour' });
    },
    onError: (e: any) => toast({ title: 'Erreur', description: e?.message || 'Mise à jour échouée' })
  });

  const createContrevenantMutation = useMutation({
    mutationFn: async () => {
      const sanitized = validateContrevenantForm({ requireUploads: true });

      const fd = new FormData();
      fd.append('nom', sanitized.nom);
      fd.append('prenom', sanitized.prenom);
      fd.append('filiation', sanitized.filiation);
      fd.append('numero_piece', sanitized.numeroPiece);
      fd.append('type_piece', sanitized.typePiece);
      if (formContrevenant.photo) fd.append('photo', formContrevenant.photo);
      if (formContrevenant.piece_identite) fd.append('piece_identite', formContrevenant.piece_identite);
      if (formContrevenant.donnees_biometriques) fd.append('donnees_biometriques', formContrevenant.donnees_biometriques);
      const resp = await apiRequest<any>('POST', '/api/infractions/contrevenants', fd);
      if (!resp.ok) {
        const error = new Error(resp.error || 'Création impossible') as Error & { status?: number; payload?: any };
        error.status = resp.status;
        error.payload = resp.data;
        throw error;
      }
      return resp.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contrevenants'] });
      setOpenCreateContrevenant(false);
      setEditingContrevenantId(null);
      setFormContrevenant(emptyContrevenantForm);
      setDuplicateContrevenantInfo(null);
      setDuplicateModalOpen(false);
      toast({ title: 'Succès', description: 'Contrevenant créé' });
    },
    onError: (e: any) => {
      if (e?.status === 409) {
        setDuplicateContrevenantInfo(e?.payload?.conflict || null);
        setDuplicateModalOpen(true);
        return;
      }
      toast({ title: 'Erreur', description: e?.message || 'Création échouée' });
    }
  });

  const isContrevenantSubmitting = createContrevenantMutation.isPending || updateContrevenantMutation.isPending;

  const createInfractionMutation = useMutation({
    mutationFn: async () => {
      // Validation côté client
      if (!formInfraction.code_infraction_id) {
        throw new Error('Code d\'infraction requis');
      }
      if (!selectedCodeItemId) {
        throw new Error('Nature/Article requis');
      }
      if (!formInfraction.agent_id) {
        throw new Error('Agent verbalisateur requis');
      }
      if (!formInfraction.date_infraction) {
        throw new Error('Date d\'infraction requise');
      }
      // Coordonnées / zone obligatoires
      if (!formInfraction.latitude || !formInfraction.longitude) {
        throw new Error('Les coordonnées (latitude et longitude) sont requises');
      }
      if (!formInfraction.region || !formInfraction.departement || !formInfraction.commune) {
        throw new Error('La région, le département et la commune sont requis');
      }

      // Montant obligatoire
      if (!formInfraction.montant_chiffre) {
        throw new Error('Le montant de l\'infraction est requis');
      }

      // Numéro et photo de quittance obligatoires
      if (!formInfraction.numero_quittance || !formInfraction.numero_quittance.trim()) {
        throw new Error('Le numéro de quittance est requis');
      }
      if (!formInfraction.photo_quittance) {
        throw new Error('La photo de la quittance est requise');
      }

      // Observations obligatoires uniquement si le flag est activé
      if (observationFlagEnabled) {
        const obs = (formInfraction.observations || '').trim();
        if (!obs || obs.toLowerCase() === 'néant') {
          throw new Error('Les observations sont requises lorsque le détail des observations est activé');
        }
      }
      const contrevenantList = Array.isArray(formInfraction.contrevenants)
        ? formInfraction.contrevenants
        : selectedContrevenantIds;
      if (!contrevenantList || contrevenantList.length === 0) {
        throw new Error('Au moins un contrevenant doit être sélectionné');
      }

      // Validation cohérence code/item
      const selectedItemId = Number(selectedCodeItemId);
      const selectedCodeId = Number(formInfraction.code_infraction_id);
      const selectedItem = codeItems.find(ci => ci.id === selectedItemId);

      if (!selectedItem) {
        throw new Error('L\'item sélectionné est introuvable');
      }

      if (selectedItem.code_infraction_id !== selectedCodeId) {
        throw new Error(`L'item sélectionné n'appartient pas au code d'infraction choisi (item du code ${selectedItem.code_infraction_id}, code sélectionné ${selectedCodeId})`);
      }

      console.log('Validation réussie - Item appartient au code:', {
        item_id: selectedItemId,
        item_code_id: selectedItem.code_infraction_id,
        selected_code_id: selectedCodeId,
      });

      const fd = new FormData();
      fd.append('code_infraction_id', String(Number(formInfraction.code_infraction_id)));
      fd.append('code_item_id', String(Number(selectedCodeItemId)));
      fd.append('date_infraction', formInfraction.date_infraction);
      fd.append('agent_id', String(Number(formInfraction.agent_id)));

      // Champs optionnels
      if (formInfraction.region) fd.append('region', formInfraction.region);
      if (formInfraction.departement) fd.append('departement', formInfraction.departement);
      if (formInfraction.commune) fd.append('commune', formInfraction.commune);
      if (formInfraction.arrondissement) fd.append('arrondissement', formInfraction.arrondissement);
      if (formInfraction.latitude) fd.append('latitude', formInfraction.latitude);
      if (formInfraction.longitude) fd.append('longitude', formInfraction.longitude);
      if (formInfraction.montant_chiffre) fd.append('montant_chiffre', String(Number((formInfraction.montant_chiffre as any).toString().replace(/\D/g, ''))));
      if (formInfraction.numero_quittance) fd.append('numero_quittance', formInfraction.numero_quittance);
      fd.append('observations', formInfraction.observations || 'Néant');
      if (formInfraction.photo_quittance) fd.append('photo_quittance', formInfraction.photo_quittance);
      if (formInfraction.photo_infraction) fd.append('photo_infraction', formInfraction.photo_infraction);

      // Contrevenants
      if (Array.isArray((formInfraction as any).contrevenants) && (formInfraction as any).contrevenants.length > 0) {
        fd.append('contrevenants', JSON.stringify((formInfraction as any).contrevenants.map((v: any) => Number(v))));
      }

      console.log('Données envoyées:', {
        code_infraction_id: formInfraction.code_infraction_id,
        code_item_id: selectedCodeItemId,
        agent_id: formInfraction.agent_id,
        date_infraction: formInfraction.date_infraction,
        contrevenants: (formInfraction as any).contrevenants
      });

      const resp = await apiRequest<any>('POST', '/api/infractions/infractions', fd);
      if (!resp.ok) {
        const error = new Error(resp.error || 'Création impossible') as Error & { status?: number; payload?: any };
        error.status = resp.status;
        error.payload = resp.data;
        throw error;
      }
      return resp.data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['infractions'] }),
        queryClient.invalidateQueries({ queryKey: ['infractions-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['contrevenants'] })
      ]);
      setOpenCreateInfraction(false);
      setFormInfraction({
        code_infraction_id: '',
        date_infraction: new Date().toISOString().split('T')[0],
        region: '',
        departement: '',
        commune: '',
        arrondissement: '',
        latitude: '',
        longitude: '',
        montant_chiffre: '',
        numero_quittance: '',
        observations: 'Néant',
        agent_id: '',
        contrevenants: [],
        photo_quittance: null,
        photo_infraction: null
      });
      toast({ title: 'Succès', description: 'Infraction créée' });
    },
    onError: (e: any) => {
      const status = e?.status ?? e?.response?.status;
      const code = e?.payload?.code ?? e?.response?.data?.code;
      const targetRegion = e?.payload?.targetRegion ?? e?.response?.data?.targetRegion;
      const targetDepartement = e?.payload?.targetDepartement ?? e?.response?.data?.targetDepartement;
      if (status === 403 && code === 'OUTSIDE_REGION') {
        setOutOfZoneInfo({
          region: String(targetRegion || '').trim(),
          departement: String(targetDepartement || '').trim()
        });
        setOutOfZoneModalOpen(true);
        return;
      }
      toast({ title: 'Erreur', description: e?.message || 'Création échouée' });
    }
  });

  const { data: codes = [] } = useQuery({
    queryKey: ['codes-infractions'],
    queryFn: async () => {
      const response = await apiRequest<any>('GET', '/api/infractions/codes');
      return response.data || [];
    }
  });

  // Selected code details for current infraction form
  const selectedInfractionCode = useMemo(() => {
    try {
      const id = Number(formInfraction.code_infraction_id);
      if (!Number.isFinite(id)) return null as any;
      return codes.find((c: any) => c.id === id) || null;
    } catch {
      return null as any;
    }
  }, [codes, formInfraction.code_infraction_id]);

  // Load code items when a code is selected
  useEffect(() => {
    const loadItems = async () => {
      const idNum = Number(formInfraction.code_infraction_id);
      if (!Number.isFinite(idNum) || idNum <= 0) {
        setCodeItems([]);
        setSelectedCodeItemId('');
        setCodeSearchTerm('');
        return;
      }
      try {
        const resp = await apiRequest<any>('GET', `/api/infractions/codes/${idNum}/items`);
        const raw = Array.isArray(resp.data) ? resp.data : [];
        const arr: CodeItem[] = raw
          .map((it: any) => ({
            ...it,
            id: Number(it.id),
            code_infraction_id: Number(it.code_infraction_id),
          }))
          .filter(it => it.code_infraction_id === idNum);

        setCodeItems(arr);
        setCodeSearchTerm('');

        const def = arr.find(item => item.is_default) || arr[0];
        setSelectedCodeItemId(def ? String(def.id) : '');
      } catch (e) {
        setCodeItems([]);
        setSelectedCodeItemId('');
        setCodeSearchTerm('');
      }
    };
    void loadItems();
  }, [formInfraction.code_infraction_id]);

  const selectedItem = useMemo(() => {
    const id = Number(selectedCodeItemId);
    if (!Number.isFinite(id)) return null as any;
    return codeItems.find(ci => ci.id === id) || null;
  }, [selectedCodeItemId, codeItems]);

  const isInfractionFormValid = useMemo(() => {
    const codeId = Number(formInfraction.code_infraction_id);
    const itemId = Number(selectedCodeItemId);

    if (!Number.isFinite(codeId) || codeId <= 0) return false;
    if (!Number.isFinite(itemId) || itemId <= 0) return false;
    if (!formInfraction.agent_id || !formInfraction.agent_id.trim()) return false;
    if (!formInfraction.date_infraction) return false;
    // Montant obligatoire
    const montant = Number(formInfraction.montant_chiffre);
    if (!Number.isFinite(montant) || montant <= 0) return false;

    const contrevenantCount = Array.isArray(formInfraction.contrevenants)
      ? formInfraction.contrevenants.length
      : selectedContrevenantIds.length;
    if (contrevenantCount === 0) return false;

    const matchingItem = codeItems.find(ci => ci.id === itemId);
    if (!matchingItem || matchingItem.code_infraction_id !== codeId) return false;

    if (observationFlagEnabled) {
      let hasSelection = false;
      try {
        for (const opt of observationOptions) {
          const sel = observationSelections[opt.key];
          if (sel?.checked) {
            hasSelection = true;
            if (opt.withQuantity) {
              const n = Number(sel.qty);
              if (!Number.isFinite(n) || n <= 0) return false;
              if (!sel.unit) return false;
            }
          }
        }
      } catch {}

      if (!hasSelection) return false;
    }

    return true;
  }, [formInfraction.code_infraction_id, formInfraction.agent_id, formInfraction.date_infraction, selectedCodeItemId, codeItems, observationOptions, observationSelections, observationFlagEnabled]);

  // Filtrer les items (nature/article) du code sélectionné selon le terme de recherche
  const filteredCodeItems = useMemo(() => {
    try {
      const term = (codeSearchTerm || '').toLowerCase();
      if (!term) return codeItems;
      return codeItems.filter((item: CodeItem) =>
        String(item.nature || '').toLowerCase().includes(term) ||
        String(item.article_code || '').toLowerCase().includes(term)
      );
    } catch {
      return codeItems;
    }
  }, [codeItems, codeSearchTerm]);

  // Auto-sélectionner le premier item filtré si aucun n'est sélectionné ou si l'item sélectionné n'est plus dans les résultats
  useEffect(() => {
    if (filteredCodeItems.length > 0) {
      const currentSelected = filteredCodeItems.find(item => String(item.id) === selectedCodeItemId);
      if (!currentSelected) {
        // Sélectionner le premier item par défaut ou le premier de la liste filtrée
        const defaultItem = filteredCodeItems.find(item => item.is_default) || filteredCodeItems[0];
        if (defaultItem) {
          console.log('Auto-sélection item:', defaultItem.id, defaultItem.nature);
          setSelectedCodeItemId(String(defaultItem.id));
        }
      }
    } else if (codeSearchTerm && filteredCodeItems.length === 0) {
      // Si la recherche ne donne aucun résultat, désélectionner
      console.log('Aucun résultat de recherche, désélection');
      setSelectedCodeItemId('');
    }
  }, [filteredCodeItems, selectedCodeItemId, codeSearchTerm]);



const { data: agents = [] } = useQuery({
  queryKey: ['agents-verbalisateurs'],
  queryFn: async () => {
    const response = await apiRequest<any>('GET', '/api/infractions/agents');
    return response.data || [];
  }
});

const filteredAgentsByRole = useMemo(() => {
  if (!Array.isArray(agents)) return [] as any[];
  const { hasUser, isAdmin, departement, region, commune, arrondissement, sousService, userType, isSectorSubRole, isDepartmentLevelSubRole, norm } = roleContext;
  if (!hasUser) return agents as any[];

  // Admin : tous les agents
  if (isAdmin) return agents as any[];

  // Agent régional : agents de sa région
  if (userType === 'regional' && region) {
    return (agents as any[]).filter((agent: any) => {
      const agentRegion = norm(agent?.region || agent?.user?.region);
      return agentRegion === region;
    });
  }

  // Agent secteur (sub-agent) : agents de son département
  if ((userType === 'secteur' || (isSectorSubRole && !isDepartmentLevelSubRole)) && departement) {
    return (agents as any[]).filter((agent: any) => {
      const agentDept = norm(agent?.departement || agent?.user?.departement);
      return agentDept === departement;
    });
  }

  // Sous-rôles départementaux (brigade, triage, poste-control, sous-secteur) :
  // Agents de leur propre zone (commune/arrondissement/sousService)
  if (isDepartmentLevelSubRole) {
    return (agents as any[]).filter((agent: any) => {
      const a = agent?.user || agent;
      const agentCommune = norm(a?.commune);
      const agentArrond = norm(a?.arrondissement);
      const agentSousService = norm(a?.sousService || a?.sous_service);
      const agentDept = norm(a?.departement);
      const agentRegion = norm(a?.region);

      if (sousService && agentSousService && agentSousService === norm(sousService)) return true;
      if (arrondissement && agentArrond && agentArrond === norm(arrondissement)) return true;
      if (commune && agentCommune && agentCommune === norm(commune)) return true;
      if (departement && agentDept === norm(departement)) return true;
      if (!departement && region && agentRegion === norm(region)) return true;
      return false;
    });
  }

  // Fallback : agents de la même région ou département si disponible
  if (departement || region) {
    return (agents as any[]).filter((agent: any) => {
      if (departement) {
        const agentDept = norm(agent?.departement || agent?.user?.departement);
        if (agentDept === departement) return true;
      }
      if (region) {
        const agentRegion = norm(agent?.region || agent?.user?.region);
        if (agentRegion === region) return true;
      }
      return false;
    });
  }

  return agents as any[];
}, [agents, roleContext]);

const filteredAgentsList = useMemo(() => {
  const term = searchTerm.trim().toLowerCase();
  const base = filteredAgentsByRole;
  if (!term) return base;
  return base.filter((agent: any) =>
    agent.nom?.toLowerCase().includes(term) ||
    agent.prenom?.toLowerCase().includes(term) ||
    agent.matricule?.toLowerCase().includes(term) ||
    [agent.created_by_nom, agent.created_by_prenom]
      .filter(Boolean)
      .map((value: string) => value.toLowerCase())
      .some((value: string) => value.includes(term))
  );
}, [filteredAgentsByRole, searchTerm]);

const getAgentCreatorDetails = useCallback((agent: any) => {
  const creatorId = agent?.created_by_user_id ?? agent?.created_by;
  if (!creatorId) return null;

  const displayName = [agent?.created_by_prenom, agent?.created_by_nom]
    .filter((part: string | null | undefined) => Boolean(part && part.trim()))
    .join(' ')
    .trim();

  const rawRole = String(agent?.created_by_role || '').toLowerCase();
  const rawType = String(agent?.created_by_type || '').toLowerCase();
  const departement = String(agent?.created_by_departement || '').trim();
  const region = String(agent?.created_by_region || '').trim();

  const normalize = (value: string) => value.trim().toUpperCase();
  const depLabel = departement ? normalize(departement) : '';
  const regLabel = region ? normalize(region) : '';
  const locationLabel = (() => {
    if (depLabel && regLabel) return `${depLabel} / ${regLabel}`;
    return depLabel || regLabel || '';
  })();

  if (rawRole.includes('admin')) {
    return {
      displayName: displayName || null,
      description: 'Admin / DEFCCS'
    };
  }

  const hasDepartement = !!depLabel;
  const hasRegion = !!regLabel;
  const isSector = rawType.includes('secteur') || rawRole.includes('secteur') || rawRole.includes('sector') || rawRole.includes('sub-agent') || (hasDepartement && !rawRole.includes('iref'));
  const isIref = rawType.includes('iref') || rawRole.includes('iref');
  const isRegional = rawType.includes('regional') || rawRole.includes('regional') || (hasRegion && !isSector);

  if (isSector) {
    return {
      displayName: displayName || null,
      description: locationLabel ? `Secteur - ${locationLabel}` : 'Secteur'
    };
  }

  if (isIref) {
    return {
      displayName: displayName || null,
      description: locationLabel ? `Agent Régional (IREF) - ${locationLabel}` : 'Agent Régional (IREF)'
    };
  }

  if (isRegional) {
    return {
      displayName: displayName || null,
      description: locationLabel ? `Agent Régional - ${locationLabel}` : 'Agent Régional'
    };
  }

  if (rawRole.includes('agent')) {
    return {
      displayName: displayName || null,
      description: locationLabel ? `Agent - ${locationLabel}` : 'Agent'
    };
  }

  return {
    displayName: displayName || null,
    description: locationLabel || null
  };
}, []);

const totalAgentPages = Math.max(1, Math.ceil(filteredAgentsList.length / AGENT_PAGE_SIZE));

const paginatedAgents = useMemo(() => {
  const safePage = Math.min(agentPage, totalAgentPages);
  const start = (safePage - 1) * AGENT_PAGE_SIZE;
  return filteredAgentsList.slice(start, start + AGENT_PAGE_SIZE);
}, [filteredAgentsList, agentPage, totalAgentPages]);

const agentPageCursor = Math.min(agentPage, totalAgentPages);
const agentStartIndex = filteredAgentsList.length === 0 ? 0 : (agentPageCursor - 1) * AGENT_PAGE_SIZE + 1;
const agentEndIndex = filteredAgentsList.length === 0 ? 0 : Math.min(filteredAgentsList.length, agentPageCursor * AGENT_PAGE_SIZE);

const handleCloseCheckContrevenant = useCallback((open: boolean) => {
  setOpenCheckContrevenant(open);
  if (!open) {
    resetCheckContrevenantState();
  }
}, [resetCheckContrevenantState]);

const handleVerifyContrevenantNumber = useCallback(async () => {
  const rawValue = checkContrevenantNumber.trim();
  if (!rawValue) {
    setCheckContrevenantError('Merci de saisir un numéro de pièce.');
    setCheckContrevenantResult(null);
    return;
  }

  const normalizedInput = normalizePieceValue(rawValue);
  if (!normalizedInput) {
    setCheckContrevenantError('Numéro de pièce invalide.');
    setCheckContrevenantResult(null);
    return;
  }

  setCheckContrevenantLoading(true);
  setCheckContrevenantError(null);
  try {
    const response = await apiRequest<any>('GET', `/api/infractions/contrevenants/check?numero=${encodeURIComponent(rawValue)}`);
    if (!response.ok) {
      throw new Error(response.error || 'Vérification impossible pour le moment.');
    }

    if (response.data?.exists && response.data?.contrevenant) {
      setCheckContrevenantResult({
        status: 'existing',
        numero_piece: response.data.numero_piece || rawValue,
        contrevenant: response.data.contrevenant
      });
    } else {
      setCheckContrevenantResult({ status: 'new', numero_piece: rawValue });
    }
  } catch (error: any) {
    setCheckContrevenantError(error?.message || 'Une erreur est survenue lors de la vérification.');
    setCheckContrevenantResult(null);
  } finally {
    setCheckContrevenantLoading(false);
  }
}, [checkContrevenantNumber]);

const handleAttachExistingContrevenant = useCallback(() => {
  if (!checkContrevenantResult || checkContrevenantResult.status !== 'existing') return;
  const contrevenant = checkContrevenantResult.contrevenant;
  if (!contrevenant?.id) return;

  attachContrevenantById(contrevenant.id, {
    forceToast: true,
    toastTitle: 'Contrevenant associé',
    toastDescription: 'Le contrevenant existant a été lié à votre infraction en cours.',
    ensureVisibleData: contrevenant
  });
  handleCloseCheckContrevenant(false);
}, [attachContrevenantById, checkContrevenantResult, handleCloseCheckContrevenant]);

const handleContinueWithNewContrevenant = useCallback(() => {
  const numeroValue = (checkContrevenantResult?.status === 'new'
    ? checkContrevenantResult.numero_piece
    : checkContrevenantNumber
  ).trim();

  if (!numeroValue) {
    setCheckContrevenantError('Numéro de pièce manquant.');
    return;
  }

  setFormContrevenant({
    ...emptyContrevenantForm,
    numero_piece: numeroValue
  });
  setEditingContrevenantId(null);
  handleCloseCheckContrevenant(false);
  setOpenCreateContrevenant(true);
  toast({
    title: 'Numéro confirmé',
    description: 'Le numéro de pièce est disponible. Complétez la fiche du contrevenant.'
  });
}, [checkContrevenantNumber, checkContrevenantResult, handleCloseCheckContrevenant]);

const handleCheckContrevenantKeyDown = useCallback(
  (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!checkContrevenantLoading) {
        handleVerifyContrevenantNumber();
      }
    }
  },
  [checkContrevenantLoading, handleVerifyContrevenantNumber]
);

const handleCancelCheckContrevenant = useCallback(() => {
  if (checkContrevenantResult) {
    setCheckContrevenantResult(null);
    setCheckContrevenantNumber('');
    setCheckContrevenantError(null);
    setCheckContrevenantLoading(false);
    return;
  }
  handleCloseCheckContrevenant(false);
}, [checkContrevenantResult, handleCloseCheckContrevenant]);

const { data: procesVerbaux = [], isLoading: isPVLoading } = useQuery({
  queryKey: ['proces-verbaux'],
  queryFn: async () => {
    const response = await apiRequest<any>('GET', '/api/infractions/pv');
    return response.data || [];
  },
  staleTime: 60_000,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  refetchOnReconnect: false
});

const normalizedProcesVerbaux = useMemo(() => (
  Array.isArray(procesVerbaux) ? procesVerbaux : []
), [procesVerbaux]);

// Enrichir les infractions avec les données déjà en cache (codes, agents, contrevenants, PV)
const infractionsComplete = useMemo(() => {
  const baseInfractions = Array.isArray(infractions) ? infractions : [];
  const allCodes = Array.isArray(codes) ? codes : [];
  const allAgents = Array.isArray(agents) ? agents : [];
  const allContrevenants = Array.isArray(contrevenants) ? contrevenants : [];
  const allPV = Array.isArray(normalizedProcesVerbaux) ? normalizedProcesVerbaux : [];

  const enrichedInfractions = baseInfractions.map((infraction: any) => {
    const codeInfraction = allCodes.find((code: any) => code.id === infraction.code_infraction_id) || null;
    const agent = allAgents.find((ag: any) => ag.id === infraction.agent_id) || null;

    const rawContrevenants = Array.isArray(infraction.contrevenants) ? infraction.contrevenants : [];
    const linkedContrevenants = rawContrevenants
      .map((entry: any) => {
        if (!entry) return null;

        if (typeof entry === 'object') {
          const id = Number(entry.id);
          if (!Number.isFinite(id)) return null;
          return allContrevenants.find((c: any) => c.id === id) || { id };
        }

        const id = Number(entry);
        if (!Number.isFinite(id)) return null;
        return allContrevenants.find((c: any) => c.id === id) || { id };
      })
      .filter((value: any, index: number, self: any[]) => value && Number.isFinite(value.id) && self.findIndex((v) => v.id === value.id) === index);

    const pv = allPV.find((p: any) => p.infraction_id === infraction.id) || null;

    return {
      ...infraction,
      code: codeInfraction,
      agent,
      contrevenants: linkedContrevenants,
      pv
    };
  });

  console.log('Infractions enrichies:', enrichedInfractions);
  return enrichedInfractions;
}, [infractions, codes, agents, contrevenants, normalizedProcesVerbaux]);

// Stats: infractions per agent (for progress bars)
const agentInfractionCounts = useMemo(() => {
  const counts = new Map<number, number>();
  const list = Array.isArray(infractionsComplete) ? infractionsComplete : [];
  list.forEach((inf: any) => {
    const id = inf?.agent?.id ?? inf?.agent_id;
    if (id == null) return;
    const key = Number(id);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}, [infractionsComplete]);

const agentsMaxCount = useMemo(() => {
  let max = 0;
  agentInfractionCounts.forEach((v) => { if (v > max) max = v; });
  return max;
}, [agentInfractionCounts]);

const associationDataFromInfractions = useMemo(() => {
  const labels = new Map<string, string>();
  const metadata = new Map<string, { associatedBy: string; associatedAt: string | null }>();
  const enrichedInfractions = Array.isArray(infractionsComplete) ? infractionsComplete : [];

  enrichedInfractions.forEach((inf: any) => {
    const agentName = [inf?.agent?.prenom, inf?.agent?.nom].filter(Boolean).join(' ').trim() || '—';
    const associatedAt = typeof inf?.date_infraction === 'string'
      ? new Date(inf.date_infraction).toISOString()
      : null;
    const list = Array.isArray(inf?.contrevenants) ? inf.contrevenants : [];

    list.forEach((entry: any) => {
      const idValue = typeof entry === 'object' ? entry?.id ?? entry?.contrevenant_id ?? entry?.contrevenantId : entry;
      if (idValue == null) return;
      const key = String(idValue);
      if (!labels.has(key)) {
        labels.set(key, agentName);
      }
      if (!metadata.has(key)) {
        metadata.set(key, {
          associatedBy: agentName,
          associatedAt
        });
      }
    });
  });

  return { labels, metadata };
}, [infractionsComplete]);

useEffect(() => {
  if (!associationDataFromInfractions || associationDataFromInfractions.metadata.size === 0) return;
  setAssociatedContrevenantsMetadata((prev) => {
    const next = { ...prev };
    let changed = false;
    associationDataFromInfractions.metadata.forEach((value, key) => {
      const existing = next[key];
      if (existing?.status === 'dissociated') return;
      if (!existing?.associatedBy && value.associatedBy) {
        next[key] = {
          associatedBy: value.associatedBy,
          associatedAt: value.associatedAt ?? existing?.associatedAt ?? null,
          status: existing?.status ?? 'associated'
        };
        changed = true;
      }
    });
    return changed ? next : prev;
  });
}, [associationDataFromInfractions]);

const associationLabelByContrevenant = associationDataFromInfractions.labels;

const filteredContrevenantsByRole = useMemo(() => {
  const sourceList = Array.isArray(augmentedContrevenants) ? augmentedContrevenants : [];
  const { hasUser, isAdmin, departement, region, commune, arrondissement, sousService, userType, isSectorSubRole, isDepartmentLevelSubRole, norm, isCreatedByMe } = roleContext;
  if (!hasUser) return sourceList as any[];

  const enrichedInfractions = Array.isArray(infractionsComplete) ? infractionsComplete : [];
  const normalizedDepartement = departement ? norm(departement) : '';
  const normalizedRegion = region ? norm(region) : '';
  const normalizedCommune = commune ? norm(commune) : '';
  const normalizedArrondissement = arrondissement ? norm(arrondissement) : '';
  const normalizedSousService = sousService ? norm(sousService) : '';

  const allowedIds = new Set<string>();
  const myCreatedIds = new Set<string>();

  enrichedInfractions.forEach((inf: any) => {
    const entries = Array.isArray(inf?.contrevenants) ? inf.contrevenants : [];
    const depInf = norm(inf?.departement);
    const regInf = norm(inf?.region);
    const createdByMe = isCreatedByMe(inf);

    let includeByLocation = isAdmin;

    if (!includeByLocation) {
      if (normalizedDepartement) {
        includeByLocation = depInf === normalizedDepartement;
      } else if (normalizedRegion) {
        includeByLocation = regInf === normalizedRegion;
      }
    }

    if (!includeByLocation) {
      if ((userType === 'secteur' || (isSectorSubRole && !isDepartmentLevelSubRole)) && normalizedDepartement) {
        includeByLocation = depInf === normalizedDepartement;
      } else if (userType === 'regional' && normalizedRegion) {
        includeByLocation = regInf === normalizedRegion;
      }
    }

    // Sous-rôles départementaux : filtrer par zone spécifique (commune/arrondissement/sousService)
    if (!includeByLocation && isDepartmentLevelSubRole) {
      const infCommune = norm(inf?.commune);
      const infArrond = norm(inf?.arrondissement);
      const infSousService = norm(inf?.sousService || inf?.sous_service);
      if (normalizedSousService && infSousService === normalizedSousService) {
        includeByLocation = true;
      } else if (normalizedArrondissement && infArrond === normalizedArrondissement) {
        includeByLocation = true;
      } else if (normalizedCommune && infCommune === normalizedCommune) {
        includeByLocation = true;
      } else if (normalizedDepartement && depInf === normalizedDepartement) {
        includeByLocation = true;
      }
    }

    if (!includeByLocation && createdByMe) {
      includeByLocation = true;
    }

    if (!includeByLocation) return;

    entries.forEach((entry: any) => {
      const idValue = typeof entry === 'object' ? entry?.id ?? entry?.contrevenant_id ?? entry?.contrevenantId : entry;
      if (idValue == null) return;
      const key = String(idValue);
      allowedIds.add(key);
      if (createdByMe) {
        myCreatedIds.add(key);
      }
    });
  });

  return sourceList.filter((contrevenant: any) => {
    const idKey = contrevenant?.id != null ? String(contrevenant.id) : null;
    if (!idKey) return false;
    const associationMeta = associatedContrevenantsMetadata[idKey];
    const status = associationMeta?.status ?? undefined;
    const createdByMe = isCreatedByMe(contrevenant);

    if (status === 'dissociated' && !createdByMe) {
      return false;
    }

    if (isAdmin) return true;
    if (createdByMe) return true;
    if (myCreatedIds.has(idKey)) return true;
    if (allowedIds.size === 0 && !normalizedDepartement && !normalizedRegion) {
      return true;
    }
    return allowedIds.has(idKey);
  });
}, [augmentedContrevenants, infractionsComplete, roleContext, associatedContrevenantsMetadata]);

const filteredContrevenantsList = useMemo(() => {
  const term = searchTerm.trim().toLowerCase();
  if (!term) return filteredContrevenantsByRole;
  return filteredContrevenantsByRole.filter((contrevenant: any) =>
    contrevenant.nom?.toLowerCase().includes(term) ||
    contrevenant.prenom?.toLowerCase().includes(term) ||
    contrevenant.numero_piece?.toLowerCase().includes(term) ||
    (associationLabelByContrevenant.get(String(contrevenant.id))?.toLowerCase().includes(term) ?? false)
  );
}, [filteredContrevenantsByRole, searchTerm, associationLabelByContrevenant]);

const filteredContrevenantsWithAssociations = useMemo(() => {
  const isCreatedByMe = typeof roleContext.isCreatedByMe === 'function' ? roleContext.isCreatedByMe : () => false;

  return filteredContrevenantsList
    .filter((contrevenant: any) => {
      const associationMeta = associatedContrevenantsMetadata[String(contrevenant.id)] ?? contrevenant.associationMetadata;
      const status = associationMeta?.status ?? (associationMeta?.associatedBy ? 'associated' : undefined);
      if (status === 'dissociated') {
        return isCreatedByMe(contrevenant);
      }
      return true;
    })
    .map((contrevenant: any) => {
      const associationMeta = associatedContrevenantsMetadata[String(contrevenant.id)];
      if (contrevenant.associationMetadata && !contrevenant.associationMetadata.status) {
        return {
          ...contrevenant,
          associationMetadata: {
            ...contrevenant.associationMetadata,
            status: 'associated'
          }
        };
      }
      if (associationMeta) {
        return {
          ...contrevenant,
          associationMetadata: {
            ...associationMeta,
            status: associationMeta.status ?? 'associated'
          }
        };
      }
      return contrevenant;
    });
}, [filteredContrevenantsList, associatedContrevenantsMetadata, roleContext]);

const visibleContrevenantIdsForStats = useMemo(() => {
  const ids = new Set<string>();
  const isCreatedByMe = typeof roleContext.isCreatedByMe === 'function' ? roleContext.isCreatedByMe : () => false;

  const safeList = Array.isArray(filteredContrevenantsWithAssociations) ? filteredContrevenantsWithAssociations : [];

  safeList.forEach((contrevenant: any) => {
    if (!contrevenant || contrevenant.id == null) return;
    const idKey = String(contrevenant.id);
    const associationMeta = associatedContrevenantsMetadata[idKey] ?? contrevenant.associationMetadata;
    const status = associationMeta?.status ?? (associationMeta?.associatedBy ? 'associated' : undefined);
    if (status === 'dissociated' && !isCreatedByMe(contrevenant)) {
      return;
    }
    ids.add(idKey);
  });

  return ids;
}, [filteredContrevenantsWithAssociations, associatedContrevenantsMetadata, roleContext]);

const totalContrevenantPages = Math.max(1, Math.ceil(filteredContrevenantsWithAssociations.length / PAGE_SIZE));

const paginatedContrevenants = useMemo(() => {
  const safePage = Math.min(contrevenantPage, totalContrevenantPages);
  const start = (safePage - 1) * PAGE_SIZE;
  return filteredContrevenantsWithAssociations.slice(start, start + PAGE_SIZE);
}, [filteredContrevenantsWithAssociations, contrevenantPage, totalContrevenantPages]);

const contrevenantPageCursor = Math.min(contrevenantPage, totalContrevenantPages);
const contrevenantStartIndex = filteredContrevenantsWithAssociations.length === 0 ? 0 : (contrevenantPageCursor - 1) * PAGE_SIZE + 1;
const contrevenantEndIndex = filteredContrevenantsWithAssociations.length === 0 ? 0 : Math.min(filteredContrevenantsWithAssociations.length, contrevenantPageCursor * PAGE_SIZE);

  useEffect(() => {
    if (contrevenantPage > totalContrevenantPages) {
      setContrevenantPage(totalContrevenantPages);
    }
  }, [contrevenantPage, totalContrevenantPages]);

  useEffect(() => {
    if (activeTab === 'contrevenants') {
      setContrevenantPage(1);
    }
  }, [searchTerm, activeTab]);

  useEffect(() => {
    if (contrevenantPage > totalContrevenantPages) {
      setContrevenantPage(totalContrevenantPages);
    }
  }, [contrevenantPage, totalContrevenantPages]);

  useEffect(() => {
    if (activeTab === 'agents') {
      setAgentPage(1);
    }
  }, [searchTerm, activeTab]);

  useEffect(() => {
    if (activeTab === 'infractions') {
      setInfractionPage(1);
    }
  }, [searchTerm, activeTab]);

  useEffect(() => {
    if (activeTab === 'pv') {
      setPvPage(1);
    }
  }, [searchTerm, activeTab]);

  useEffect(() => {
    if (agentPage > totalAgentPages) {
      setAgentPage(totalAgentPages);
    }
  }, [agentPage, totalAgentPages]);

  const contrevenantsForInfraction = useMemo(() => {
  if (selectedContrevenantIds.length === 0) {
    return [];
  }
  const selectedSet = new Set(selectedContrevenantIds.map(String));
  return augmentedContrevenants.filter((c: any) => selectedSet.has(String(c.id)));
}, [augmentedContrevenants, selectedContrevenantIds]);

  const toggleContrevenantSelection = useCallback((id: string) => {
    setSelectedContrevenantIds((prev) => {
      const exists = prev.includes(id);
      if (exists) {
        return prev.filter((value) => value !== id);
      }
      return [...prev, id];
    });
  }, []);

  const toggleContrevenant = useCallback((id: string) => {
    setSelectedContrevenantIds((prev) => {
      const exists = prev.includes(id);
      const updated = exists ? prev.filter((value) => value !== id) : [...prev, id];
      setFormInfraction((prevForm) => ({
        ...prevForm,
        contrevenants: updated
      }));
      return updated;
    });
  }, []);

  useEffect(() => {
    setFormInfraction((prev) => {
      const desired = selectedContrevenantIds.map(String);
      const current = Array.isArray(prev.contrevenants) ? prev.contrevenants.map(String) : [];

      if (current.length === desired.length) {
        const currentSet = new Set(current);
        const matches = desired.every((id) => currentSet.has(id)) && current.every((id) => desired.includes(id));
        if (matches) {
          return prev;
        }
      }

      if (desired.length === 0 && (!prev.contrevenants || (Array.isArray(prev.contrevenants) && prev.contrevenants.length === 0))) {
        return prev;
      }

      return { ...prev, contrevenants: desired };
    });
  }, [selectedContrevenantIds]);

  useEffect(() => {
    if (selectedContrevenantIds.length === 0 && formInfraction.contrevenants && formInfraction.contrevenants.length > 0) {
      setSelectedContrevenantIds(Array.from(new Set(formInfraction.contrevenants.map(String))));
    }
  }, [formInfraction.contrevenants, selectedContrevenantIds.length]);

  useEffect(() => {
    const allowed = new Set(contrevenantsForInfraction.map((c: any) => String(c.id)));
    setFormInfraction((prev) => {
      const current = Array.isArray(prev.contrevenants) ? prev.contrevenants : [];
      if (current.length === 0) return prev;
      const filtered = current.filter((value) => allowed.has(String(value)));
      if (filtered.length === current.length) {
        return prev;
      }
      return { ...prev, contrevenants: filtered };
    });
  }, [contrevenantsForInfraction]);

  const filteredPvByRole = useMemo(() => {
  if (!Array.isArray(normalizedProcesVerbaux)) return [] as any[];
  const { hasUser, isAdmin, departement, region, commune, arrondissement, sousService, userType, isSectorSubRole, isDepartmentLevelSubRole, norm, isCreatedByMe } = roleContext;
  if (!hasUser) return normalizedProcesVerbaux as any[];

  const mineOnly = normalizedProcesVerbaux.filter((pv: any) => isCreatedByMe(pv));

  const apply = (predicate: (pv: any) => boolean, fallbackToMine = false) => {
    const list = (normalizedProcesVerbaux as any[]).filter((pv: any) => {
      if (predicate(pv)) return true;
      return isCreatedByMe(pv);
    });
    if (fallbackToMine && list.length === 0) {
      return mineOnly;
    }
    return list;
  };

  // Admin : tous les PV
  if (isAdmin) {
    return normalizedProcesVerbaux as any[];
  }

  // Agent régional : PV de sa région
  if (userType === 'regional') {
    if (!region) {
      return mineOnly;
    }
    return apply((pv) => norm(pv?.infraction?.region) === region, true);
  }

  // Agent secteur (sub-agent) : PV de son département
  if (userType === 'secteur' || (isSectorSubRole && !isDepartmentLevelSubRole)) {
    if (!(departement || region)) {
      return mineOnly;
    }
    return apply((pv) => {
      const dep = norm(pv?.infraction?.departement);
      const reg = norm(pv?.infraction?.region);
      if (departement) return dep === departement;
      if (region) return reg === region;
      return false;
    }, true);
  }

  // Sous-rôles départementaux (brigade, triage, poste-control, sous-secteur) :
  // PV de leur propre zone (commune/arrondissement/sousService)
  if (isDepartmentLevelSubRole) {
    return apply((pv) => {
      const inf = pv?.infraction;
      const infCommune = norm(inf?.commune);
      const infArrond = norm(inf?.arrondissement);
      const infSousService = norm(inf?.sousService || inf?.sous_service);
      const infDept = norm(inf?.departement);
      const infReg = norm(inf?.region);

      if (sousService && infSousService && infSousService === norm(sousService)) return true;
      if (arrondissement && infArrond && infArrond === norm(arrondissement)) return true;
      if (commune && infCommune && infCommune === norm(commune)) return true;
      if (departement && infDept === norm(departement)) return true;
      if (!departement && region && infReg === norm(region)) return true;
      return false;
    }, true);
  }

  // Fallback pour les autres rôles avec département ou région
  if (departement || region) {
    return apply((pv) => {
      const dep = norm(pv?.infraction?.departement);
      const reg = norm(pv?.infraction?.region);
      if (departement) return dep === departement;
      if (region) return reg === region;
      return false;
    });
  }

  return normalizedProcesVerbaux as any[];
}, [normalizedProcesVerbaux, roleContext]);

  const filteredPvList = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return filteredPvByRole;

    return filteredPvByRole.filter((pv: any) =>
      pv.numero_pv?.toLowerCase().includes(term) ||
      pv.infraction?.code?.code?.toLowerCase().includes(term) ||
      pv.infraction?.code?.nature?.toLowerCase().includes(term) ||
      pv.infraction?.code?.article_code?.toLowerCase().includes(term) ||
      pv.infraction?.region?.toLowerCase().includes(term) ||
      pv.infraction?.departement?.toLowerCase().includes(term) ||
      pv.infraction?.agent?.nom?.toLowerCase().includes(term) ||
      pv.infraction?.agent?.prenom?.toLowerCase().includes(term)
    );
  }, [filteredPvByRole, searchTerm]);

  const totalPvPages = Math.max(1, Math.ceil(filteredPvList.length / PV_PAGE_SIZE));

  const paginatedPvs = useMemo(() => {
    if (!Array.isArray(filteredPvList) || filteredPvList.length === 0) {
      return [];
    }
    const safePage = Math.min(pvPage, totalPvPages);
    const start = (safePage - 1) * PV_PAGE_SIZE;
    return filteredPvList.slice(start, start + PV_PAGE_SIZE);
  }, [filteredPvList, pvPage, totalPvPages]);

  const pvPageCursor = Math.min(pvPage, totalPvPages);
  const pvStartIndex = filteredPvList.length === 0 ? 0 : (pvPageCursor - 1) * PV_PAGE_SIZE + 1;
  const pvEndIndex = filteredPvList.length === 0 ? 0 : Math.min(filteredPvList.length, pvPageCursor * PV_PAGE_SIZE);

  useEffect(() => {
    if (pvPage > totalPvPages) {
      setPvPage(totalPvPages);
    }
  }, [pvPage, totalPvPages]);

  // Filtrage des infractions basé sur le rôle et la localisation de l'utilisateur
  const filteredInfractions = useMemo(() => {
    if (!Array.isArray(infractionsComplete) || infractionsComplete.length === 0) {
      return infractionsComplete;
    }

    const { hasUser, isAdmin, departement, region, commune, arrondissement, sousService, userType, userRole, isSectorSubRole, isDepartmentLevelSubRole, norm, isCreatedByMe } = roleContext;
    if (!hasUser) return infractionsComplete;

    const mineOnly = infractionsComplete.filter((inf: any) => isCreatedByMe(inf));

    const apply = (predicate: (inf: any) => boolean, fallbackToMine = false) => {
      const list = infractionsComplete.filter((inf: any) => {
        if (predicate(inf)) return true;
        return isCreatedByMe(inf);
      });
      if (fallbackToMine && list.length === 0) {
        return mineOnly;
      }
      return list;
    };

    // Admin : toutes les infractions du domaine
    if (isAdmin) {
      return infractionsComplete;
    }

    // Agent régional : infractions de sa région
    if (userType === 'regional') {
      if (!region) {
        return mineOnly;
      }
      return apply((inf) => norm(inf?.region) === region, true);
    }

    // Agent secteur (sub-agent) : infractions de son département
    if (userType === 'secteur' || (isSectorSubRole && !isDepartmentLevelSubRole)) {
      if (!departement && !region) {
        return mineOnly;
      }
      return apply((inf) => {
        const dep = norm(inf?.departement);
        const reg = norm(inf?.region);
        if (departement) return dep === departement;
        if (region) return reg === region;
        return false;
      }, true);
    }

    // Sous-rôles départementaux (brigade, triage, poste-control, sous-secteur) :
    // Ils ne voient que les données de leur propre zone (commune/arrondissement/sousService)
    if (isDepartmentLevelSubRole) {
      return apply((inf) => {
        // Filtrer par la zone la plus spécifique disponible
        const infCommune = norm(inf?.commune);
        const infArrond = norm(inf?.arrondissement);
        const infDept = norm(inf?.departement);
        const infReg = norm(inf?.region);

        // sousService est le plus spécifique
        if (sousService) {
          const infSousService = norm(inf?.sousService || inf?.sous_service);
          if (infSousService && infSousService === sousService) return true;
        }
        // Arrondissement
        if (arrondissement && infArrond && infArrond === arrondissement) return true;
        // Commune
        if (commune && infCommune && infCommune === commune) return true;
        // Fallback au département si aucune zone plus fine ne matche
        if (departement && infDept === departement) return true;
        if (!departement && region && infReg === region) return true;
        return false;
      }, true);
    }

    // Fallback pour les autres rôles avec département ou région
    if (departement || region) {
      return apply((inf) => {
        const dep = norm(inf?.departement);
        const reg = norm(inf?.region);
        if (departement) return dep === departement;
        if (region) return reg === region;
        return false;
      });
    }

    return infractionsComplete;
  }, [infractionsComplete, roleContext]);

  // Filtrage des statistiques basé sur les infractions filtrées
  const filteredStats = useMemo(() => {
    const { isAdmin } = roleContext;

    const infractionList = (isAdmin ? infractionsComplete : filteredInfractions) ?? [];
    const pvList = (isAdmin ? normalizedProcesVerbaux : filteredPvByRole) ?? [];
    const contrevenantList = (isAdmin ? contrevenants : filteredContrevenantsByRole) ?? [];

    const safeInfractions = Array.isArray(infractionList) ? infractionList : [];
    const safePvs = Array.isArray(pvList) ? pvList : [];
    const safeContrevenants = Array.isArray(contrevenantList) ? contrevenantList : [];

    if (safeInfractions.length === 0 && safePvs.length === 0 && safeContrevenants.length === 0) {
      return {
        total_infractions: 0,
        total_contrevenants: 0,
        total_pv: 0,
        montant_total: 0,
        infractions_30j: 0
      };
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const infractions30j = safeInfractions.filter((inf: any) => {
      const infractionDate = new Date(inf.date_infraction);
      return infractionDate >= thirtyDaysAgo;
    }).length;

    const totalContrevenants = isAdmin
      ? safeContrevenants.filter((value: any) => value && value.id != null).length
      : visibleContrevenantIdsForStats.size;
    const totalPV = safePvs.length || safeInfractions.filter((inf: any) => inf.pv).length;
    const montantTotal = safeInfractions.reduce((acc: number, inf: any) => {
      const montant = parseFloat(inf.montant_chiffre) || 0;
      return acc + montant;
    }, 0);

    return {
      total_infractions: safeInfractions.length,
      total_contrevenants: totalContrevenants,
      total_pv: totalPV,
      montant_total: montantTotal,
      infractions_30j: infractions30j
    };
  }, [
    contrevenants,
    filteredContrevenantsByRole,
    filteredInfractions,
    filteredPvByRole,
    infractionsComplete,
    normalizedProcesVerbaux,
    roleContext,
    associatedContrevenantsMetadata,
    visibleContrevenantIdsForStats
  ]);

  const { data: stats } = useQuery({
    queryKey: ['infractions-stats'],
    queryFn: async () => {
      const response = await apiRequest<any>('GET', '/api/infractions/stats');
      const fallback = { total_infractions: 0, total_contrevenants: 0, total_pv: 0, montant_total: 0, infractions_30j: 0 };
      return response.ok && response.data ? response.data : fallback;
    }
  });

  const filteredInfractionsBySearch = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return filteredInfractions;

    return filteredInfractions.filter((infraction: any) =>
      infraction.code?.code?.toLowerCase().includes(term) ||
      infraction.code?.nature?.toLowerCase().includes(term) ||
      infraction.code?.article_code?.toLowerCase().includes(term) ||
      infraction.region?.toLowerCase().includes(term) ||
      infraction.departement?.toLowerCase().includes(term) ||
      infraction.agent?.nom?.toLowerCase().includes(term) ||
      infraction.agent?.prenom?.toLowerCase().includes(term) ||
      (Array.isArray(infraction.contrevenants) && infraction.contrevenants.some((c: any) =>
        c.nom?.toLowerCase().includes(term) || c.prenom?.toLowerCase().includes(term)
      ))
    );
  }, [filteredInfractions, searchTerm]);

  const totalInfractionPages = Math.max(1, Math.ceil(filteredInfractionsBySearch.length / INFRACTION_PAGE_SIZE));

  const paginatedInfractions = useMemo(() => {
    const safePage = Math.min(infractionPage, totalInfractionPages);
    const start = (safePage - 1) * INFRACTION_PAGE_SIZE;
    return filteredInfractionsBySearch.slice(start, start + INFRACTION_PAGE_SIZE);
  }, [filteredInfractionsBySearch, infractionPage, totalInfractionPages]);

  const infractionPageCursor = Math.min(infractionPage, totalInfractionPages);
  const infractionStartIndex = filteredInfractionsBySearch.length === 0 ? 0 : (infractionPageCursor - 1) * INFRACTION_PAGE_SIZE + 1;
  const infractionEndIndex = filteredInfractionsBySearch.length === 0 ? 0 : Math.min(filteredInfractionsBySearch.length, infractionPageCursor * INFRACTION_PAGE_SIZE);

  useEffect(() => {
    if (infractionPage > totalInfractionPages) {
      setInfractionPage(totalInfractionPages);
    }
  }, [infractionPage, totalInfractionPages]);

  const pendingPvCount = useMemo(() => {
    return (Array.isArray(filteredInfractions) ? filteredInfractions : []).filter((inf: any) => !inf?.pv).length;
  }, [filteredInfractions]);

  const geolocateAndResolve = useCallback(async () => {
    try {
      if (!navigator.geolocation) {
        toast({ title: 'Erreur', description: 'Géolocalisation non supportée par ce navigateur', variant: 'destructive' });
        return;
      }

      toast({ title: 'Géolocalisation', description: 'Recherche de votre position...' });

      await new Promise<void>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            setFormInfraction((prev) => ({ ...prev, latitude: String(lat), longitude: String(lon) }));

            try {
              console.log(`[DEBUG] Appel API resolve-areas avec lat=${lat}, lon=${lon}`);

              try {
                const testR = await apiRequest<any>('GET', '/api/infractions/test-resolve');
                console.log('[DEBUG] Test endpoint accessible:', testR);
              } catch (testErr) {
                console.error('[DEBUG] Test endpoint échoué:', testErr);
              }

              const r = await apiRequest<any>('GET', `/api/infractions/resolve-areas?lat=${lat}&lon=${lon}`);
              console.log('[DEBUG] Réponse API resolve-areas:', r);

              if (r?.ok && r?.data) {
                const a = r.data;
                console.log('[DEBUG] Données zones reçues:', a);

                const nextAreas = {
                  region: a?.region || null,
                  departement: a?.departement || null,
                };

                const within = isAreaWithinUserZone(nextAreas);
                setGeoOutOfZoneInfo(within ? null : {
                  region: String(a?.region || ''),
                  departement: String(a?.departement || ''),
                });

                setFormInfraction((prev) => ({
                  ...prev,
                  region: a?.region || prev.region,
                  departement: a?.departement || prev.departement,
                  commune: a?.commune || prev.commune,
                  arrondissement: a?.arrondissement || prev.arrondissement
                }));

                if (within) {
                  toast({
                    title: 'Succès',
                    description: `Position trouvée et zones administratives remplies: ${a?.commune || 'N/A'}, ${a?.departement || 'N/A'}`
                  });
                } else {
                  toast({
                    title: 'Zone hors affectation',
                    description: `La position détectée se trouve dans ${a?.departement || 'un autre département'} / ${a?.region || 'une autre région'} qui ne correspond pas à votre zone d'affectation.`,
                    variant: 'destructive',
                  });
                }
              } else {
                console.error('[DEBUG] Réponse API invalide:', r);
                toast({ title: 'Avertissement', description: 'Position trouvée mais impossible de déduire les zones administratives' });
              }
            } catch (err) {
              console.error('Erreur résolution zones:', err);
              toast({ title: 'Avertissement', description: 'Position trouvée mais erreur lors de la résolution des zones' });
            }
            resolve();
          },
          (error) => {
            let message = 'Impossible d\'obtenir votre position';
            if (error.code === error.PERMISSION_DENIED) {
              message = 'Permission de géolocalisation refusée';
            } else if (error.code === error.POSITION_UNAVAILABLE) {
              message = 'Position non disponible';
            } else if (error.code === error.TIMEOUT) {
              message = 'Délai d\'attente dépassé';
            }
            toast({ title: 'Erreur', description: message, variant: 'destructive' });
            reject(error);
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
        );
      });
    } catch (err) {
      console.error('Erreur géolocalisation:', err);
    }
  }, [toast, setFormInfraction, isAreaWithinUserZone]);

  const deleteCodeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest<any>('DELETE', `/api/infractions/codes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['codes-infractions'] });
      toast({ title: 'Succès', description: 'Code supprimé' });
      setPendingDeletion(null);
    }
  });

  const deleteAgentMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest<any>('DELETE', `/api/infractions/agents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents-verbalisateurs'] });
      toast({ title: 'Succès', description: 'Agent supprimé' });
      setPendingDeletion(null);
    }
  });

  const deleteInfractionMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest<any>('DELETE', `/api/infractions/infractions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['infractions'] });
      queryClient.invalidateQueries({ queryKey: ['contrevenants'] });
      toast({ title: 'Succès', description: 'Infraction supprimée' });
      setPendingDeletion(null);
    }
  });

  const [blockedDeletionInfo, setBlockedDeletionInfo] = useState<{ label: string; details?: string } | null>(null);

  const deleteContrevenantMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest<any>('DELETE', `/api/infractions/contrevenants/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contrevenants'] });
      toast({ title: 'Succès', description: 'Contrevenant supprimé' });
      setPendingDeletion(null);
      setBlockedDeletionInfo(null);
    },
    onError: (error: any) => {
      const message = error?.message || error?.error || error?.response?.data?.error;
      if (message && typeof message === 'string' && message.toLowerCase().includes('lié à des infractions')) {
        setBlockedDeletionInfo({
          label: pendingDeletion?.label || 'Ce contrevenant',
          details: 'Il reste associé à au moins une infraction ou un PV. Dissociez-le d’abord avant de le supprimer définitivement.'
        });
        toast({
          title: 'Suppression impossible',
          description: 'Ce contrevenant est encore lié à des infractions. Veuillez le dissocier avant suppression.',
          variant: 'destructive'
        });
      } else {
        toast({ title: 'Erreur', description: message || 'Suppression échouée', variant: 'destructive' });
      }
      setPendingDeletion(null);
    }
  });

  const createPVMutation = useMutation({
    mutationFn: async () => {
      if (!formPV.infraction_id) {
        throw new Error('Veuillez sélectionner une infraction');
      }

      const rawNumeroDigits = (formPV.numero_pv || '').replace(/\D+/g, '');
      if (!rawNumeroDigits) {
        throw new Error('Le numéro du PV est requis');
      }

      if (!formPV.fichier_pv) {
        throw new Error('Le fichier PDF du PV est requis');
      }

      const regionLabel = (user?.region || '').toString().trim();
      const departementLabel = ((user as any)?.departement || '').toString().trim();
      const paddedNumber = rawNumeroDigits.padStart(2, '0');
      let numeroPvFormatted = paddedNumber;

      if (isAdmin) {
        numeroPvFormatted = `N°${paddedNumber}/DEFCCS`;
      } else if (isRegionalAgent) {
        numeroPvFormatted = `N°${paddedNumber}/IREF/${regionLabel || 'N/A'}`;
      } else if (isSectorAgent) {
        numeroPvFormatted = `N°${paddedNumber}/secteur-${departementLabel || 'N/A'}/${regionLabel || 'N/A'}`;
      } else {
        numeroPvFormatted = `N°${paddedNumber}`;
      }

      const fd = new FormData();
      fd.append('infraction_id', formPV.infraction_id);
      fd.append('numero_pv', numeroPvFormatted);
      fd.append('fichier_pv', formPV.fichier_pv);
      const resp = await apiRequest<any>('POST', '/api/infractions/pv', fd);
      if (!resp.ok) throw new Error(resp.error || 'Création impossible');
      return resp.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['proces-verbaux'] });
      setOpenCreatePV(false);
      setFormPV({ infraction_id: '', numero_pv: '', fichier_pv: null });
      toast({ title: 'Succès', description: 'Procès-verbal créé' });
    },
    onError: (e: any) => toast({ title: 'Erreur', description: e?.message || 'Création échouée' })
  });

  const deletePVMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest<any>('DELETE', `/api/infractions/pv/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proces-verbaux'] });
      toast({ title: 'Succès', description: 'Procès-verbal supprimé' });
      setPendingDeletion(null);
    }
  });

  const canSubmitPV = Boolean(
    formPV.infraction_id &&
    formPV.numero_pv.trim() &&
    formPV.fichier_pv &&
    !createPVMutation.isPending
  );

  const isDeleting =
    deleteInfractionMutation.isPending ||
    deleteCodeMutation.isPending ||
    deleteAgentMutation.isPending ||
    deleteContrevenantMutation.isPending ||
    deletePVMutation.isPending;

  const dissociateContrevenant = useCallback((id: number) => {
    const idStr = String(id);
    const isAdminUser = Boolean(roleContext?.isAdmin);
    const countFromMap = contrevenantInfractionCounts.get(idStr);
    const fallbackEntity = augmentedContrevenants.find((c: any) => String(c?.id) === idStr);
    const overrideTotal = typeof contrevenantTotalsOverrides[idStr] === 'number' ? contrevenantTotalsOverrides[idStr] : undefined;
    const totalGlobal = typeof fallbackEntity?.total_infractions_global === 'number' ? fallbackEntity.total_infractions_global : 0;
    const totalLinked = Number.isFinite(countFromMap as number)
      ? (countFromMap as number)
      : overrideTotal ?? totalGlobal;

    if (!isAdminUser && totalLinked > 0) {
      toast({
        title: 'Dissociation impossible',
        description: 'Ce contrevenant est lié à une infraction ou un PV. Seul un administrateur peut retirer cette association.',
        variant: 'destructive'
      });
      return;
    }

    setAssociatedContrevenantsMetadata((prev) => {
      const prevMeta = prev[idStr];
      if (prevMeta?.status === 'dissociated') {
        return prev;
      }
      return {
        ...prev,
        [idStr]: {
          associatedBy: prevMeta?.associatedBy ?? null,
          associatedAt: prevMeta?.associatedAt ?? null,
          status: 'dissociated'
        }
      };
    });
    setInjectedContrevenants((prev) => {
      if (!prev[idStr]) {
        return prev;
      }
      return {
        ...prev,
        [idStr]: {
          ...prev[idStr],
          associationMetadata: {
            associatedBy: prev[idStr]?.associationMetadata?.associatedBy ?? associatedContrevenantsMetadata[idStr]?.associatedBy ?? null,
            associatedAt: prev[idStr]?.associationMetadata?.associatedAt ?? associatedContrevenantsMetadata[idStr]?.associatedAt ?? null,
            status: 'dissociated'
          }
        }
      };
    });
    setSelectedContrevenantIds((prev) => prev.filter((value) => value !== idStr));
    setFormInfraction((prev) => ({
      ...prev,
      contrevenants: (prev.contrevenants || []).filter((value) => String(value) !== idStr)
    }));
    toast({
      title: 'Association retirée',
      description: 'Le contrevenant a été dissocié de votre infraction.',
      variant: 'default'
    });
  }, [augmentedContrevenants, associatedContrevenantsMetadata, contrevenantInfractionCounts, contrevenantTotalsOverrides, roleContext, toast]);

  const confirmDeletion = useCallback(() => {
    if (!pendingDeletion || isDeleting) {
      return;
    }

    switch (pendingDeletion.type) {
      case 'infraction':
        deleteInfractionMutation.mutate(pendingDeletion.id);
        return;
      case 'code':
        deleteCodeMutation.mutate(pendingDeletion.id);
        return;
      case 'agent':
        deleteAgentMutation.mutate(pendingDeletion.id);
        return;
      case 'contrevenant':
        deleteContrevenantMutation.mutate(pendingDeletion.id);
        return;
      case 'contrevenant-association':
        dissociateContrevenant(pendingDeletion.id);
        setPendingDeletion(null);
        return;
      case 'pv':
        deletePVMutation.mutate(pendingDeletion.id);
        return;
      default:
        return;
    }
  }, [pendingDeletion, isDeleting, deleteInfractionMutation, deleteCodeMutation, deleteAgentMutation, deleteContrevenantMutation, deletePVMutation, dissociateContrevenant]);

  const [openMonthGroups, setOpenMonthGroups] = useState<{ [key: string]: boolean }>({});
  const [codeFilter, setCodeFilter] = useState<string>("");
  const [monthFilter, setMonthFilter] = useState<string>("");

  // Modal: tentative de création hors zone
  const [outOfZoneModalOpen, setOutOfZoneModalOpen] = useState(false);
  const [outOfZoneInfo, setOutOfZoneInfo] = useState<{ region: string; departement: string }>({ region: '', departement: '' });
  const [contactRegionalPending, setContactRegionalPending] = useState(false);

  useEffect(() => {
    if (!outOfZoneModalOpen) {
      setContactRegionalPending(false);
    }
  }, [outOfZoneModalOpen]);

  useEffect(() => {
    if (!openCreateInfraction) {
      setGeoOutOfZoneInfo(null);
    }
  }, [openCreateInfraction]);

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Infractions</h1>
            <p className="mt-1 text-sm text-gray-600">Système de gestion des infractions et procès-verbaux</p>
            {/* Indicateur de filtrage */}
            {user && (user.type === 'secteur' || user.type === 'regional') && (
              <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                <Shield className="w-3 h-3" />
                {user.type === 'secteur'
                  ? `Filtré par département: ${user.departement || 'Non défini'}`
                  : `Filtré par région: ${user.region || 'Non définie'}`
                }
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white/80 backdrop-blur rounded-xl shadow border border-gray-200">
          <div className="border-b border-gray-200">
            <nav className="flex overflow-x-auto p-2 gap-2 bg-slate-50/70 rounded-t-xl">
              {[
                { id: 'agents', label: 'Agents', icon: Shield },
                { id: 'contrevenants', label: 'Contrevenants', icon: Users },
                { id: 'infractions', label: 'Infractions', icon: AlertTriangle },
                { id: 'pv', label: 'Procès-Verbaux', icon: FileText },
                { id: 'codes', label: 'Codes', icon: FileText },
                { id: 'stats', label: 'Statistiques', icon: BarChart3 } as const
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                const isInfractionTab = tab.id === 'infractions';
                const iconColor = isActive
                  ? isInfractionTab
                    ? 'text-orange-500'
                    : 'text-red-600'
                  : 'text-gray-400';

                return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex flex-shrink-0 items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    activeTab === tab.id
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
                  }`}
                >
                  <tab.icon
                    className={`w-5 h-5 ${iconColor}`}
                    strokeWidth={isInfractionTab ? 2.2 : undefined}
                  />
                  {tab.label}
                </button>
              );
              })}
            </nav>
          </div>

          <div className="p-4 sm:p-6">
            {/* Statistiques */}
            {activeTab === 'stats' && (
              <div className="bg-white/80 backdrop-blur rounded-xl shadow border border-gray-200">
              <div className="p-4 sm:p-6 space-y-8">
                {/* Résumé des enregistrements */}
                <div className="bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 p-6 rounded-xl border border-green-200">
                  <h3 className="text-lg font-semibold text-green-900 mb-6 flex items-center gap-2">
                    <BarChart3 className="w-6 h-6" />
                    Résumé des enregistrements
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg border border-gray-100 transition-shadow -translate-y-0.5 hover:-translate-y-1">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                          <AlertTriangle className="w-8 h-8 text-red-600" />
                        </div>
                    <div>
                          <p className="text-sm text-gray-600 mb-1">Total Infractions</p>
                          <p className="text-3xl font-bold text-gray-900">{filteredStats?.total_infractions || 0}</p>
                    </div>
                  </div>
                </div>

                    <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg border border-gray-100 transition-shadow -translate-y-0.5 hover:-translate-y-1">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                          <Users className="w-8 h-8 text-red-600" />
                        </div>
                    <div>
                          <p className="text-sm text-gray-600 mb-1">Contrevenants</p>
                          <p className="text-3xl font-bold text-gray-900">{filteredStats?.total_contrevenants || 0}</p>
                    </div>
                  </div>
                </div>

                    <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg border border-gray-100 transition-shadow -translate-y-0.5 hover:-translate-y-1">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                          <FileText className="w-8 h-8 text-green-600" />
                        </div>
                    <div>
                          <p className="text-sm text-gray-600 mb-1">PV Générés</p>
                          <p className="text-3xl font-bold text-gray-900">{filteredStats?.total_pv || 0}</p>
                    </div>
                  </div>
                </div>

                    <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg border border-gray-100 transition-shadow -translate-y-0.5 hover:-translate-y-1">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Montant Total</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {(filteredStats?.montant_total || 0).toLocaleString('fr-FR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })} XOF
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Statistiques détaillées */}
                 <div className={`grid grid-cols-1 ${showGeoRepartition ? 'lg:grid-cols-2' : 'lg:grid-cols-1'} gap-8`}>
                  {/* Répartition géographique - uniquement pour admin, agent régional et agent secteur */}
                  {showGeoRepartition && (
                  <div className="bg-white/80 backdrop-blur rounded-xl shadow border border-gray-200 p-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-purple-600" />
                      {isRegionalAgent ? 'Répartition par département' : (isSectorAgent ? 'Répartition par commune / arrondissement' : 'Répartition géographique')}
                    </h4>
                    <div className="space-y-3">
                      {(() => {
                        const bucketCounts = filteredInfractions.reduce((acc: any, inf: any) => {
                          if (isSectorAgent && user?.departement) {
                            const depInf = (inf.departement ? String(inf.departement) : '').toUpperCase();
                            const depUser = String(user.departement).toUpperCase();
                            if (depInf && depUser && depInf !== depUser) return acc;
                          }

                          const key = isRegionalAgent
                            ? (inf.departement ? String(inf.departement).toUpperCase() : 'Non spécifié')
                            : (isSectorAgent
                                ? ((inf.arrondissement && String(inf.arrondissement).trim())
                                    ? String(inf.arrondissement)
                                    : (inf.commune || 'Non spécifiée'))
                                : (inf.region || 'Non spécifiée'));
                          acc[key] = (acc[key] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>);

                        const buckets = Object.entries(bucketCounts).slice(0, 8);

                        if (buckets.length === 0) {
                          return (<p className="text-gray-500 text-sm">Aucune donnée géographique disponible</p>);
                        }

                        const pieData = buckets.map(([label, count]) => ({ name: label as string, value: count as number }));
                        const totalPieValue = pieData.reduce((sum, current) => sum + (current.value ?? 0), 0);
                        const dominantSlice = pieData.reduce((prev, current) => (current.value > prev.value ? current : prev), pieData[0]);
                        const dominantPercentage = totalPieValue > 0 ? Math.round((dominantSlice.value / totalPieValue) * 100) : 0;
                        const centerPrimaryValue = totalPieValue > 0 ? `${dominantPercentage}%` : `${dominantSlice.value}`;
                        const centerSecondaryValue = (dominantSlice?.name ?? '—').toString();
                        const truncatedSecondaryValue = centerSecondaryValue.length > 26 ? `${centerSecondaryValue.slice(0, 26)}…` : centerSecondaryValue;
                        const centerTertiaryValue = totalPieValue > 0 ? `${dominantSlice.value} cas` : undefined;

                        return (
                          <>
                            {(isAdmin || isRegionalAgent) && (
                              <div className="w-full h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                    <defs>
                                      {pieData.map((_, idx) => {
                                        const baseColor = GEO_COLORS[idx % GEO_COLORS.length];
                                        const gradientId = `${geoGradientNamespace}-slice-${idx}`;
                                        return (
                                          <radialGradient
                                            key={gradientId}
                                            id={gradientId}
                                            cx="50%"
                                            cy="32%"
                                            r="75%"
                                            fx="48%"
                                            fy="28%"
                                          >
                                            <stop offset="0%" stopColor={adjustGeoColor(baseColor, 90)} />
                                            <stop offset="45%" stopColor={adjustGeoColor(baseColor, 22)} />
                                            <stop offset="100%" stopColor={adjustGeoColor(baseColor, -60)} />
                                          </radialGradient>
                                        );
                                      })}
                                      <radialGradient
                                        id={`${geoGradientNamespace}-inner`}
                                        cx="50%"
                                        cy="36%"
                                        r="70%"
                                        fx="46%"
                                        fy="28%"
                                      >
                                        <stop offset="0%" stopColor={geoDonutShading.top} />
                                        <stop offset="48%" stopColor={geoDonutShading.core} />
                                        <stop offset="100%" stopColor={geoDonutShading.bottom} />
                                      </radialGradient>
                                      <filter id={`${geoGradientNamespace}-center-sheen`} x="-30%" y="-30%" width="160%" height="160%">
                                        <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="rgba(15,23,42,0.25)" />
                                      </filter>
                                    </defs>
                                    <Pie
                                      data={pieData}
                                      activeIndex={geoPieActiveIndex}
                                      activeShape={renderGeoActiveShape}
                                      innerRadius={GEO_PIE_INNER_RADIUS}
                                      outerRadius={GEO_PIE_OUTER_RADIUS}
                                      paddingAngle={2}
                                      dataKey="value"
                                      labelLine={false}
                                      label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
                                        if (typeof cx !== 'number' || typeof cy !== 'number' || typeof midAngle !== 'number') {
                                          return null;
                                        }
                                        const normalizedPercent = typeof percent === 'number' ? percent : 0;
                                        if (normalizedPercent <= 0) return null;
                                        const angleRad = -midAngle * (Math.PI / 180);
                                        const labelRadius = (innerRadius ?? GEO_PIE_INNER_RADIUS) + ((outerRadius ?? GEO_PIE_OUTER_RADIUS) - (innerRadius ?? GEO_PIE_INNER_RADIUS)) * 0.62;
                                        const x = cx + labelRadius * Math.cos(angleRad);
                                        const y = cy + labelRadius * Math.sin(angleRad);
                                        const valueLabel = `${Math.round(normalizedPercent * 100)}%`;
                                        return (
                                          <g>
                                            <text
                                              x={x}
                                              y={y - 2}
                                              textAnchor="middle"
                                              dominantBaseline="middle"
                                              fontSize={12}
                                              fontWeight={700}
                                              fill="#0f172a"
                                            >
                                              {valueLabel}
                                            </text>
                                            <text
                                              x={x}
                                              y={y + 11}
                                              textAnchor="middle"
                                              dominantBaseline="middle"
                                              fontSize={10}
                                              fill="#1f2937"
                                            >
                                              {name}
                                            </text>
                                          </g>
                                        );
                                      }}
                                      onMouseEnter={(_, index) => setGeoPieActiveIndex(index)}
                                    >
                                      {pieData.map((_, idx) => {
                                        const baseColor = GEO_COLORS[idx % GEO_COLORS.length];
                                        return (
                                          <Cell
                                            key={`cell-${idx}`}
                                            fill={`url(#${geoGradientNamespace}-slice-${idx})`}
                                            stroke={adjustGeoColor(baseColor, -60)}
                                            strokeWidth={1.2}
                                          />
                                        );
                                      })}
                                      <PieLabel
                                        position="center"
                                        content={({ cx, cy }) => {
                                          if (typeof cx !== 'number' || typeof cy !== 'number') return null;
                                          const mainDy = centerTertiaryValue ? -8 : 0;
                                          return (
                                            <g>
                                              <circle
                                                cx={cx}
                                                cy={cy}
                                                r={GEO_PIE_INNER_RADIUS - 6}
                                                fill={`url(#${geoGradientNamespace}-inner)`}
                                                stroke={adjustGeoColor(GEO_PRIMARY_COLOR, -45)}
                                                strokeWidth={1.5}
                                                opacity={0.98}
                                                filter={`url(#${geoGradientNamespace}-center-sheen)`}
                                              />
                                              <text x={cx} y={cy + mainDy} textAnchor="middle" fontSize="24" fontWeight={800} fill="#0f172a">
                                                {centerPrimaryValue}
                                              </text>
                                              <text x={cx} y={cy + 18} textAnchor="middle" fontSize="13" fontWeight={600} fill="#334155">
                                                {truncatedSecondaryValue}
                                              </text>
                                              {centerTertiaryValue && (
                                                <text x={cx} y={cy + 34} textAnchor="middle" fontSize="11" fill="#64748b">
                                                  {centerTertiaryValue}
                                                </text>
                                              )}
                                            </g>
                                          );
                                        }}
                                      />
                                    </Pie>
                                    <Tooltip formatter={(v: any, _n: any, p: any) => [`${v}`, p?.payload?.name]} />
                                  </PieChart>
                                </ResponsiveContainer>
                              </div>
                            )}

                            {!(isAdmin || isRegionalAgent) && (
                              <div className="space-y-2 mt-2">
                                {buckets.map(([label, count], index) => (
                                  <div key={label} className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <div className={`w-3 h-3 rounded-full ${
                                        index === 0 ? 'bg-red-500' :
                                        index === 1 ? 'bg-orange-500' :
                                        index === 2 ? 'bg-yellow-500' :
                                        index === 3 ? 'bg-green-500' : 'bg-blue-500'
                                      }`}></div>
                                      <span className="text-sm text-gray-700">{label}</span>
                                    </div>
                                    <span className="text-sm font-semibold text-gray-900">
                                      {count as number}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  )}
                </div>

                {/* Carte unique: Agents + Évolution des infractions (selon le code) */}
                <div className="bg-white/80 backdrop-blur rounded-xl shadow border border-gray-200 p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-base sm:text-[15px] font-semibold text-gray-900 flex items-center gap-1.5">
                      <Shield className="w-4 h-4 text-green-600" />
                      Agents verbalisateurs
                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-green-100 text-green-800">
                        {filteredAgentsByRole.length}
                      </span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => setOpenAgentsModal(true)}
                      className="px-2.5 py-1 text-xs sm:text-sm rounded-md bg-green-600 text-white hover:bg-green-700"
                      title="Voir tous les agents verbalisateurs"
                    >
                      Détail
                    </button>
                  </div>
                  {/* Aperçu agents masqué à la demande */}

                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <h5 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-orange-600" />
                      Infractions selon le code
                    </h5>
                    <div className="space-y-3">
                      {codes.length > 0 ? codes.slice(0, 5).map((code: any) => (
                        <div key={code.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
                              <FileText className="w-4 h-4 text-blue-600" />
                            </div>
                            <span className="text-sm text-gray-700">{code.code} - {code.nature}</span>
                          </div>
                          <span className="text-sm font-semibold text-gray-900">
                            {(Array.isArray(filteredInfractions) ? filteredInfractions : []).filter((inf: any) => inf.code_infraction_id === code.id).length}
                          </span>
                        </div>
                      )) : (
                        <p className="text-gray-500 text-sm">Aucun code d'infraction enregistré</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              </div>
            )}

            {/* Infractions */}
            {activeTab === 'infractions' && (
              <div className="space-y-4">
                <div className="bg-white/80 backdrop-blur rounded-xl shadow border border-gray-200">
                  <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-orange-500" />
                      <h3 className="text-base sm:text-lg font-semibold text-gray-900">Infractions</h3>
                      <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                        {filteredInfractionsBySearch.length}
                      </span>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:flex-1">
                      <div className="relative w-full sm:max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                          type="text"
                          placeholder="Rechercher..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white"
                        />
                      </div>
                      <button
                        onClick={() => setOpenCreateInfraction(true)}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-sm"
                      >
                        <Plus className="w-5 h-5" />
                        Nouvelle Infraction
                      </button>
                    </div>
                  </div>

                  <div className="p-4 sm:p-6">
                    {filteredInfractions.length === 0 ? (
                      <div className="text-center py-12 text-gray-500">
                        <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                        <p>Aucune infraction disponible</p>
                        <p className="text-sm">
                          {user && (user.type === 'secteur' || user.type === 'regional')
                            ? `Aucune infraction dans votre ${user.type === 'secteur' ? 'département' : 'région'}`
                            : 'Cliquez sur "Nouvelle Infraction" pour en ajouter une'
                          }
                        </p>
                      </div>
                    ) : (
                      <div className="bg-white/80 backdrop-blur rounded-xl shadow border border-gray-200 overflow-hidden">
                        <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gradient-to-r from-slate-50 to-gray-100">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nature</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Article</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lieu</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Montant</th>
                              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                        {paginatedInfractions.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-6 py-8 text-center text-sm text-gray-500">
                              Aucune infraction sur cette page.
                            </td>
                          </tr>
                        ) : (
                          paginatedInfractions.map((infraction: any) => {
                            const canManageInfraction = roleContext.isAdmin || roleContext.isCreatedByMe(infraction);

                            return (
                              <tr key={infraction.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{infraction.code?.code || 'N/A'}</td>
                                <td className="px-6 py-4 text-sm">
                                  {infraction.item_nature || infraction.nature || infraction.code?.nature || 'é\u001d'}
                                </td>
                                <td className="px-6 py-4 text-sm">
                                  {infraction.item_article || infraction.article_code || infraction.code?.article_code || 'é\u001d'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                  {new Date(infraction.date_infraction).toLocaleDateString('fr-FR')}
                                </td>
                                <td className="px-6 py-4 text-sm">{infraction.region && infraction.departement ? `${infraction.region} - ${infraction.departement}` : infraction.region || infraction.departement || '-'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                  {infraction.montant_chiffre ? `${infraction.montant_chiffre.toLocaleString()} XOF` : '-'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                  {canManageInfraction ? (
                                    <button
                                      onClick={() => setPendingDeletion({ type: 'infraction', id: infraction.id, label: infraction.code?.code || `Infraction #${infraction.id}` })}
                                      className="text-red-600 hover:text-red-900"
                                    >
                                      <Trash2 className="w-5 h-5" />
                                    </button>
                                  ) : (
                                    <span className="text-gray-400 italic">Aucune action</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                          </tbody>
                        </table>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
                          <div className="text-sm text-gray-600">
                            {`Affichage ${infractionStartIndex}-${infractionEndIndex} sur ${filteredInfractionsBySearch.length}`}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                              onClick={() => setInfractionPage((page) => Math.max(1, page - 1))}
                              disabled={infractionPageCursor === 1}
                            >
                              Précédent
                            </button>
                            <span className="text-sm text-gray-600">
                              Page {infractionPageCursor} / {totalInfractionPages}
                            </span>
                            <button
                              type="button"
                              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                              onClick={() => setInfractionPage((page) => Math.min(totalInfractionPages, page + 1))}
                              disabled={infractionPageCursor === totalInfractionPages}
                            >
                              Suivant
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Codes */}
            {activeTab === 'codes' && (
              <div className="bg-white/80 backdrop-blur rounded-xl shadow border border-gray-200">
              <div className="p-4 sm:p-6 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <input
                    type="text"
                    placeholder="Rechercher un code..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full sm:flex-1 sm:max-w-md px-4 py-2 border border-gray-300 rounded-lg"
                  />
                  <div className="w-full sm:w-auto sm:ml-4 flex items-center gap-2 text-sm text-gray-600">
                    {String(user?.role || '').toLowerCase() === 'admin' ? (
                      <button
                        onClick={() => setLocation('/settings?tab=codes')}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        title="Ouvrir Paramétres é  Codes Infractions"
                      >
                        Ouvrir la gestion des codes
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {codes.filter((code: any) =>
                    code.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    code.nature.toLowerCase().includes(searchTerm.toLowerCase())
                  ).map((code: any, index: number) => {
                    const colors = [
                      { border: 'border-green-400', iconBg: 'bg-green-100', accent: 'text-green-700', chipBg: 'bg-green-50' },
                      { border: 'border-yellow-400', iconBg: 'bg-yellow-100', accent: 'text-yellow-700', chipBg: 'bg-yellow-50' },
                      { border: 'border-red-400', iconBg: 'bg-red-100', accent: 'text-red-700', chipBg: 'bg-red-50' }
                    ];
                    const { border, iconBg, accent, chipBg } = colors[index % colors.length];
                    return (
                    <div
                      key={code.id}
                      className={`bg-white border ${border} rounded-lg shadow-sm hover:shadow-lg transition-all p-4 flex flex-col h-full`}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-blue-100">
                          <FileText className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <h5 className="text-sm font-semibold text-gray-900 break-words leading-snug">{code.code}</h5>
                          {code.nature ? (
                            <p className="text-xs text-gray-500 truncate">{code.nature}</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-gray-700 mb-2 line-clamp-3">{code.nature}</p>
                        {code.article_code && (
                          <p className={`inline-flex items-center gap-2 text-[11px] font-medium ${accent} ${chipBg} px-2 py-1 rounded-full` }>
                            Article {code.article_code}
                          </p>
                        )}
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-[11px] text-gray-400">Documents associés</span>
                        <button
                          onClick={async () => {
                            try {
                              setSelectedCodeForDocs(code);
                              const resp = await apiRequest<any>('GET', `/api/infractions/codes/${code.id}/documents`);
                              const docs = Array.isArray(resp?.data) ? resp.data : [];
                              setCodeDocuments(docs);
                              setSelectedCodeDocument(docs[0] || null);
                              setOpenViewCodeDocs(true);
                            } catch (e) {
                              toast({ title: 'Erreur', description: 'Impossible de charger les documents du code' });
                            }
                          }}
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
                          title="Voir les documents du code"
                        >
                          <Eye className="w-4 h-4" />
                          Voir
                        </button>
                      </div>
                    </div>
                  );
                  })}
                </div>
              </div>
              </div>
            )}

            {/* Agents */}
            {activeTab === 'agents' && (
              <div className="bg-white/80 backdrop-blur rounded-xl shadow border border-gray-200">
              <div className="p-4 sm:p-6 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative w-full sm:flex-1 sm:max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      placeholder="Rechercher un agent..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <button onClick={() => setOpenCreateAgent(true)} className="w-full sm:w-auto sm:ml-4 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                    <Plus className="w-5 h-5" />
                    Nouvel Agent
                  </button>
                </div>

                {filteredAgentsList.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Shield className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <p>Aucun agent verbalisateur enregistré</p>
                    <p className="text-sm">Cliquez sur "Nouvel Agent" pour en ajouter un</p>
                  </div>
                ) : (
                  <div className="bg-white/80 backdrop-blur rounded-xl shadow border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gradient-to-r from-slate-50 to-gray-100">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prénom</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nom</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Inscrit par</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {paginatedAgents.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-500">
                              Aucun agent sur cette page.
                            </td>
                          </tr>
                        ) : (
                          paginatedAgents.map((agent: any) => (
                          <tr key={agent.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-600 text-white">
                                  <User className="w-4 h-4" />
                                </span>
                                <span>{agent.prenom}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{agent.nom}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {(() => {
                                const meta = getAgentCreatorDetails(agent);
                                if (!meta) {
                                  return <span className="text-xs text-gray-400">-</span>;
                                }

                                return meta.displayName ? (
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium text-gray-900">{meta.displayName}</span>
                                    <span className="text-xs text-gray-500">{meta.description}</span>
                                  </div>
                                ) : (
                                  <span className="text-sm text-gray-600">{meta.description}</span>
                                );
                              })()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                              <button
                                className="text-blue-600 hover:text-blue-900 mr-3"
                                onClick={() => handleEditAgent(agent)}
                              >
                                <Edit className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => setPendingDeletion({ type: 'agent', id: agent.id, label: `${agent.nom} ${agent.prenom}`.trim() })}
                                className="text-red-600 hover:text-red-900"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </td>
                          </tr>
                        )))
                        }
                      </tbody>
                    </table>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
                      <div className="text-sm text-gray-600">
                        {`Affichage ${agentStartIndex}-${agentEndIndex} sur ${filteredAgentsList.length}`}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => setAgentPage((page) => Math.max(1, page - 1))}
                          disabled={agentPageCursor === 1}
                        >
                          Précédent
                        </button>
                        <span className="text-sm text-gray-600">
                          Page {agentPageCursor} / {totalAgentPages}
                        </span>
                        <button
                          type="button"
                          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => setAgentPage((page) => Math.min(totalAgentPages, page + 1))}
                          disabled={agentPageCursor === totalAgentPages}
                        >
                          Suivant
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              </div>
            )}

            {/* Contrevenants */}
            {activeTab === 'contrevenants' && (
              <div className="bg-white/80 backdrop-blur rounded-xl shadow border border-gray-200">
              <div className="p-4 sm:p-6 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative w-full sm:flex-1 sm:max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      placeholder="Rechercher un contrevenant..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <button
                    onClick={handleOpenCheckContrevenant}
                    className="w-full sm:w-auto sm:ml-4 flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                  >
                    <Plus className="w-5 h-5" />
                    Nouveau Contrevenant
                  </button>
                </div>

                {(() => {
                  if (augmentedContrevenants.length === 0) {
                    return (
                      <div className="text-center py-12 text-gray-500">
                        <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                        <p>Aucun contrevenant enregistré</p>
                        <p className="text-sm">Cliquez sur "Nouveau Contrevenant" pour en ajouter un.</p>
                      </div>
                    );
                  }

                  if (filteredContrevenantsList.length === 0) {
                    return (
                      <div className="text-center py-12 text-gray-500">
                        <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                        <p>Aucun résultat pour cette recherche</p>
                        <p className="text-sm">Modifiez vos critéres ou réinitialisez la recherche.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="bg-white/80 backdrop-blur rounded-xl shadow border border-gray-200 overflow-hidden">
                      <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gradient-to-r from-slate-50 to-gray-100">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sélection</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prénom</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nom</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">N Pièce</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type Pièce</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Inscrit par</th>
                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Suivi</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {paginatedContrevenants.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="px-6 py-8 text-center text-sm text-gray-500">
                                Aucun contrevenant sur cette page.
                              </td>
                            </tr>
                          ) : (
                            paginatedContrevenants.map((contrevenant: any) => (
                              <tr
                                key={contrevenant.id}
                                className={`transition-colors ${selectedContrevenantIds.includes(String(contrevenant.id)) ? 'bg-red-50 hover:bg-red-100/80' : 'hover:bg-gray-50'}`}
                              >
                                <td className="px-4 py-4 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4"
                                      checked={selectedContrevenantIds.includes(String(contrevenant.id))}
                                      onChange={() => toggleContrevenantSelection(String(contrevenant.id))}
                                    />
                                    {injectedContrevenantIds.has(String(contrevenant.id)) ? (
                                      <span
                                        className="inline-flex items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-600"
                                        title="Contrevenant associé depuis une autre liste"
                                      >
                                        <Link2 className="w-3.5 h-3.5" />
                                      </span>
                                    ) : null}
                                    {(() => {
                                      const count = contrevenantInfractionCounts.get(String(contrevenant.id)) ?? (
                                      typeof contrevenant.total_infractions_global === 'number'
                                        ? contrevenant.total_infractions_global
                                        : 0
                                    );
                                      if (count < 2) return null;
                                      return (
                                        <span
                                          className="inline-flex items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600"
                                          title={`${count} infractions enregistrées`}
                                        >
                                          <AlertTriangle className="w-3.5 h-3.5" />
                                        </span>
                                      );
                                    })()}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-600">
                                      <User className="w-4 h-4" />
                                    </span>
                                    <span>{contrevenant.prenom}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{contrevenant.nom}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{contrevenant.numero_piece}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{contrevenant.type_piece}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {contrevenant.date_creation ? new Date(contrevenant.date_creation).toLocaleDateString('fr-FR') : '-'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {(() => {
                                    const idKey = String(contrevenant.id);
                                    const associationMeta = associatedContrevenantsMetadata[idKey] ?? contrevenant.associationMetadata;
                                    const createdByMe = typeof roleContext.isCreatedByMe === 'function'
                                      ? roleContext.isCreatedByMe(contrevenant)
                                      : false;
                                    const associationStatus = associationMeta?.status ?? (associationMeta?.associatedBy ? 'associated' : undefined);

                                    const effectiveAssoc: ContrevenantAssociationMeta | null = (() => {
                                      // On n'affiche une association que si le backend fournit
                                      // des métadonnées d'association (associationMeta.associatedBy).
                                      if (associationMeta?.associatedBy) {
                                        return associationMeta;
                                      }

                                      // Sinon, tenter d'utiliser un cache éventuel uniquement
                                      // lorsque ce n'est pas le créateur lui-même.
                                      if (!createdByMe) {
                                        const cachedMeta = associatedContrevenantsMetadata[idKey];
                                        if (cachedMeta?.associatedBy) {
                                          return {
                                            associatedBy: cachedMeta.associatedBy,
                                            associatedAt: cachedMeta.associatedAt ?? null,
                                            status: cachedMeta.status ?? 'associated'
                                          };
                                        }
                                      }

                                      return null;
                                    })();

                                    const creatorFullName = [
                                      typeof contrevenant.created_by_prenom === 'string' ? contrevenant.created_by_prenom : null,
                                      typeof contrevenant.created_by_nom === 'string' ? contrevenant.created_by_nom : null
                                    ]
                                      .filter((part) => typeof part === 'string' && part.trim().length > 0)
                                      .join(' ')
                                      .trim();
                                    const creatorId = contrevenant?.created_by_user_id ?? contrevenant?.created_by ?? null;
                                    const isCreatorSameAsAssociation = (() => {
                                      if (!effectiveAssoc?.associatedBy) return false;
                                      const assocNormalized = normalizeAssociationLabel(effectiveAssoc.associatedBy);
                                      const creatorNormalized = normalizeAssociationLabel(creatorFullName || resolvedUserAssociationLabel);
                                      if (assocNormalized && creatorNormalized && assocNormalized === creatorNormalized) {
                                        return true;
                                      }
                                      if (createdByMe && assocNormalized === normalizedCurrentAssociationLabel) {
                                        return true;
                                      }
                                      return false;
                                    })();

                                    if (effectiveAssoc && effectiveAssoc.associatedBy) {
                                      if (isCreatorSameAsAssociation) {
                                        // Eviter de présenter un créateur comme simple association
                                        const meta = getAgentCreatorDetails(contrevenant);
                                        if (meta) {
                                          return meta.displayName ? (
                                            <div className="flex flex-col">
                                              <span className="text-sm font-medium text-gray-900">{meta.displayName}</span>
                                              <span className="text-xs text-gray-500">{meta.description}</span>
                                            </div>
                                          ) : (
                                            <span className="text-sm text-gray-600">{meta?.description || creatorFullName || 'Créateur'}</span>
                                          );
                                        }
                                        return creatorFullName ? (
                                          <div className="flex flex-col">
                                            <span className="text-sm font-medium text-gray-900">{creatorFullName}</span>
                                            <span className="text-xs text-gray-500">Créateur</span>
                                          </div>
                                        ) : (
                                          <span className="text-xs text-gray-400">-</span>
                                        );
                                      }
                                      const status = effectiveAssoc.status ?? 'associated';
                                      if (status === 'dissociated') {
                                        // Si l'association est retirée, on ne mentionne plus l'agent d'association
                                        // et on revient simplement à l'information de création
                                        const meta = getAgentCreatorDetails(contrevenant);
                                        if (meta) {
                                          return meta.displayName ? (
                                            <div className="flex flex-col">
                                              <span className="text-sm font-medium text-gray-900">{meta.displayName}</span>
                                              <span className="text-xs text-gray-500">{meta.description}</span>
                                            </div>
                                          ) : (
                                            <span className="text-sm text-gray-600">{meta.description || creatorFullName || 'Créateur'}</span>
                                          );
                                        }
                                        return creatorFullName ? (
                                          <div className="flex flex-col">
                                            <span className="text-sm font-medium text-gray-900">{creatorFullName}</span>
                                            <span className="text-xs text-gray-500">Créateur</span>
                                          </div>
                                        ) : (
                                          <span className="text-xs text-gray-400">-</span>
                                        );
                                      }
                                      const assocLabelRaw = String(effectiveAssoc.associatedBy || '').trim();
                                      const assocLabel = assocLabelRaw === '—' ? '' : assocLabelRaw;

                                      // Si aucune info d'association exploitable, on retombe sur le créateur
                                      if (!assocLabel) {
                                        const meta = getAgentCreatorDetails(contrevenant);
                                        if (meta) {
                                          return meta.displayName ? (
                                            <div className="flex flex-col">
                                              <span className="text-sm font-medium text-gray-900">{meta.displayName}</span>
                                              <span className="text-xs text-gray-500">{meta.description}</span>
                                            </div>
                                          ) : (
                                            <span className="text-sm text-gray-600">{meta.description || creatorFullName || 'Créateur'}</span>
                                          );
                                        }
                                        return creatorFullName ? (
                                          <div className="flex flex-col">
                                            <span className="text-sm font-medium text-gray-900">{creatorFullName}</span>
                                            <span className="text-xs text-gray-500">Créateur</span>
                                          </div>
                                        ) : (
                                          <span className="text-xs text-gray-400">-</span>
                                        );
                                      }

                                      // Créateur A + associé à cette infraction par B
                                      if (creatorFullName && !isCreatorSameAsAssociation) {
                                        return (
                                          <div className="flex flex-col items-start">
                                            <span className="text-xs text-gray-500">Créé par</span>
                                            <span className="text-sm font-medium text-gray-900 mb-1">{creatorFullName}</span>
                                            <span className="text-xs text-gray-500">Associé à cette infraction par</span>
                                            <span className="text-sm font-medium text-blue-600">{assocLabel}</span>
                                          </div>
                                        );
                                      }

                                      // Sinon, simple association (cas historique sans créateur connu)
                                      return (
                                        <div className="flex flex-col items-start">
                                          <span className="text-sm font-medium text-blue-600">Associé à cette infraction</span>
                                          <span className="text-xs text-gray-500">par {assocLabel}</span>
                                        </div>
                                      );
                                    }

                                    const meta = getAgentCreatorDetails(contrevenant);
                                    if (!meta && creatorFullName) {
                                      return (
                                        <div className="flex flex-col">
                                          <span className="text-sm font-medium text-gray-900">{creatorFullName}</span>
                                          <span className="text-xs text-gray-500">Créateur</span>
                                        </div>
                                      );
                                    }
                                    if (!meta) {
                                      return <span className="text-xs text-gray-400">-</span>;
                                    }
                                    return meta.displayName ? (
                                      <div className="flex flex-col">
                                        <span className="text-sm font-medium text-gray-900">{meta.displayName}</span>
                                        <span className="text-xs text-gray-500">{meta.description}</span>
                                      </div>
                                    ) : (
                                      <span className="text-sm text-gray-600">{meta.description}</span>
                                    );
                                  })()}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                                  {(() => {
                                    const count = contrevenantInfractionCounts.get(String(contrevenant.id)) ?? (
                                      typeof contrevenant.total_infractions_global === 'number'
                                        ? contrevenant.total_infractions_global
                                        : 0
                                    );
                                    if (count <= 0) {
                                      return <span className="text-xs text-gray-400 italic">Néant</span>;
                                    }
                                    const severityClass = count > 1 ? 'bg-red-100 text-red-700 border-red-200' : 'bg-amber-50 text-amber-600 border-amber-200';
                                    return (
                                      <div
                                        className="inline-flex items-center justify-center gap-2"
                                        title={`Antécédents détectés : ${count}`}
                                      >
                                        <span
                                          className={`inline-flex items-center justify-center w-8 h-8 rounded-full border ${severityClass}`}
                                        >
                                          <AlertTriangle className="w-4 h-4" />
                                          <span className="sr-only">Antécédents</span>
                                        </span>
                                        <span className="text-sm font-semibold text-gray-700">{count}</span>
                                      </div>
                                    );
                                  })()}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                  <button
                                    className="text-blue-600 hover:text-blue-900 mr-3"
                                    onClick={() => handleViewContrevenant(contrevenant)}
                                    title="Voir les informations"
                                  >
                                    <Info className="w-5 h-5" />
                                  </button>
                                  <button
                                    className={`${canEditContrevenant(contrevenant)
                                      ? 'text-blue-600 hover:text-blue-900 mr-3'
                                      : 'text-gray-400 cursor-not-allowed mr-3'
                                    }`}
                                    onClick={() => handleEditContrevenant(contrevenant)}
                                    title={canEditContrevenant(contrevenant)
                                      ? 'Modifier le contrevenant'
                                      : 'Modification impossible pour un contrevenant seulement associé'}
                                  >
                                    <Edit className="w-5 h-5" />
                                  </button>
                                  {(() => {
                                    const idKey = String(contrevenant.id);
                                    const associationMeta = associatedContrevenantsMetadata[idKey] ?? contrevenant.associationMetadata;
                                    const createdByMe = typeof roleContext.isCreatedByMe === 'function'
                                      ? roleContext.isCreatedByMe(contrevenant)
                                      : false;
                                    const associationStatus = associationMeta?.status ?? (associationMeta?.associatedBy ? 'associated' : undefined);
                                    const isLinkedInCurrentInfraction = selectedContrevenantIds.includes(idKey);
                                    const linkedInfractionCount = (() => {
                                      const mapValue = contrevenantInfractionCounts.get(idKey);
                                      if (typeof mapValue === 'number' && Number.isFinite(mapValue)) return mapValue;
                                      if (typeof contrevenant.total_infractions_global === 'number') return contrevenant.total_infractions_global;
                                      return 0;
                                    })();
                                    const hasLinkedInfractions = linkedInfractionCount > 0;
                                    const hasAssociationLink = Boolean(associationMeta?.associatedBy || isLinkedInCurrentInfraction);
                                    const shouldDissociate = !createdByMe && hasAssociationLink && associationStatus !== 'dissociated';
                                    const dissociationBlocked = shouldDissociate && hasLinkedInfractions && !roleContext.isAdmin;
                                    const deletionBlocked = !shouldDissociate && hasLinkedInfractions;
                                    const displayName = `${contrevenant.nom || ''} ${contrevenant.prenom || ''}`.trim();
                                    const fallbackLabel = displayName || `Contrevenant #${contrevenant.id}`;
                                    const ActionIcon = shouldDissociate ? Link2 : Trash2;
                                    const actionClass = shouldDissociate
                                      ? dissociationBlocked
                                        ? 'text-gray-400 cursor-not-allowed'
                                        : 'text-orange-600 hover:text-orange-800'
                                      : deletionBlocked
                                        ? 'text-gray-400 cursor-not-allowed'
                                        : 'text-red-600 hover:text-red-900';
                                    const actionTitle = shouldDissociate
                                      ? dissociationBlocked
                                        ? 'Dissociation impossible tant que des infractions ou PV sont liés (réservé aux administrateurs)'
                                        : 'Retirer uniquement l\'association'
                                      : deletionBlocked
                                        ? 'Suppression impossible tant que le contrevenant est lié à des infractions'
                                        : 'Supprimer définitivement le contrevenant';

                                    return (
                                      <button
                                        onClick={() => {
                                          if (dissociationBlocked) {
                                            toast({
                                              title: 'Dissociation refusée',
                                              description: 'Seul un administrateur peut retirer l\'association tant que des infractions ou PV existent.',
                                              variant: 'destructive'
                                            });
                                            setPendingDeletion(null);
                                            return;
                                          }

                                          if (deletionBlocked) {
                                            setBlockedDeletionInfo({
                                              label: fallbackLabel,
                                              details:
                                                linkedInfractionCount === 1
                                                  ? 'Ce contrevenant est lié à 1 infraction. Supprimez d\'abord ce lien (ou le PV associé).'
                                                  : `Ce contrevenant est lié à ${linkedInfractionCount} infractions. Supprimez ces liens (ou les PV associés) avant la suppression.`
                                            });
                                            setPendingDeletion(null);
                                            return;
                                          }

                                          if (shouldDissociate) {
                                            setPendingDeletion({
                                              type: 'contrevenant-association',
                                              id: contrevenant.id,
                                              label: fallbackLabel
                                            });
                                            return;
                                          }

                                          setPendingDeletion({
                                            type: 'contrevenant',
                                            id: contrevenant.id,
                                            label: fallbackLabel
                                          });
                                        }}
                                        className={actionClass}
                                        title={actionTitle}
                                        disabled={deletionBlocked || dissociationBlocked}
                                      >
                                        <ActionIcon className="w-5 h-5" />
                                      </button>
                                    );
                                  })()}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
                        <div className="text-sm text-gray-600">
                          {`Affichage ${contrevenantStartIndex}-${contrevenantEndIndex} sur ${filteredContrevenantsList.length}`}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => setContrevenantPage((page) => Math.max(1, page - 1))}
                            disabled={contrevenantPageCursor === 1}
                          >
                            Précédent
                          </button>
                          <span className="text-sm text-gray-600">
                            Page {contrevenantPageCursor} / {totalContrevenantPages}
                          </span>
                          <button
                            type="button"
                            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => setContrevenantPage((page) => Math.min(totalContrevenantPages, page + 1))}
                            disabled={contrevenantPageCursor === totalContrevenantPages}
                          >
                            Suivant
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
              </div>
            )}

            {/* PV */}
            {activeTab === 'pv' && (
              <div className="bg-white/80 backdrop-blur rounded-xl shadow border border-gray-200">
              <div className="p-4 sm:p-6 space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative w-full sm:flex-1 sm:max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      placeholder="Rechercher une infraction..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>

                {/* Section de génération de PV */}
                <div className="bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 p-6 rounded-xl border border-green-200">
                  <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
                    <h3 className="text-lg font-semibold text-green-900 flex items-center gap-2">
                      <FileText className="w-6 h-6" />
                      Génération de Procès-Verbaux
                    </h3>
                    <div className="flex items-center gap-3 flex-wrap ml-auto">
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-green-900">Mois</label>
                        <select
                          className="border border-green-200 bg-white text-sm rounded-md px-2 py-1"
                          value={monthFilter}
                          onChange={(e) => setMonthFilter(e.target.value)}
                        >
                          <option value="">Tous</option>
                          {Array.from(new Set((filteredInfractions || []).map((inf: any) => {
                            const d = new Date(inf.date_infraction);
                            if (isNaN(d.getTime())) return null;
                            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                          }).filter(Boolean))).sort((a: any, b: any) => b.localeCompare(a)).map((key: any) => {
                            const [y, m] = String(key).split('-');
                            const d = new Date(Number(y), Number(m) - 1, 1);
                            const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
                            return <option key={key} value={key}>{label}</option>;
                          })}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-green-900">Code</label>
                        <select
                          className="border border-green-200 bg-white text-sm rounded-md px-2 py-1 min-w-[140px]"
                          value={codeFilter}
                          onChange={(e) => setCodeFilter(e.target.value)}
                        >
                          <option value="">Tous</option>
                          {Array.from(new Set((filteredInfractions || []).map((inf: any) => inf.code?.code).filter(Boolean))).sort().map((code: any) => (
                            <option key={String(code)} value={String(code)}>{String(code)}</option>
                          ))}
                        </select>
                      </div>
                      <div className="text-sm text-green-900">
                        Utilisations: {(() => {
                          let list = (filteredInfractions || []) as any[];
                          if (monthFilter) {
                            list = list.filter((inf: any) => {
                              const d = new Date(inf.date_infraction);
                              if (isNaN(d.getTime())) return false;
                              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                              return key === monthFilter;
                            });
                          }
                          if (codeFilter) {
                            list = list.filter((inf: any) => inf.code?.code === codeFilter);
                          }
                          return list.length;
                        })()}
                      </div>

                      <span className="hidden sm:inline text-green-300">|</span>
                      <div className="text-sm text-green-900">Page {pvPageCursor} / {totalPvPages}</div>

                    </div>
                  </div>

                  {/* Sélection d'infraction pour génération PV */}
                  <div className="bg-white/80 backdrop-blur p-6 rounded-xl shadow border border-gray-200">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
                      <h4 className="text-md font-semibold text-gray-900">Sélectionner une infraction pour générer le PV</h4>
                      <div className="inline-flex items-center gap-2 text-sm text-gray-600 bg-red-50 border border-red-100 px-3 py-1 rounded-full">
                        <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true"></span>
                        <span>{pendingPvCount} PV à générer</span>
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-200">
                      {(() => {
                        const normalizedTerm = searchTerm.trim().toLowerCase();
                        const baseList = Array.isArray(filteredInfractions) ? filteredInfractions : [];

                        const filteredList = baseList.filter((inf: any) => {
                          if (codeFilter && inf.code?.code !== codeFilter) return false;
                          if (monthFilter) {
                            const d = new Date(inf.date_infraction);
                            if (Number.isNaN(d.getTime())) return false;
                            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                            if (key !== monthFilter) return false;
                          }

                          if (normalizedTerm) {
                            const haystacks: string[] = [];
                            if (inf.code?.code) haystacks.push(String(inf.code.code).toLowerCase());
                            if (inf.code?.nature) haystacks.push(String(inf.code.nature).toLowerCase());
                            if (inf.code?.article_code) haystacks.push(String(inf.code.article_code).toLowerCase());
                            if (inf.agent?.nom) haystacks.push(String(inf.agent.nom).toLowerCase());
                            if (inf.agent?.prenom) haystacks.push(String(inf.agent.prenom).toLowerCase());
                            if (inf.region) haystacks.push(String(inf.region).toLowerCase());
                            if (inf.departement) haystacks.push(String(inf.departement).toLowerCase());
                            if (Array.isArray(inf.contrevenants)) {
                              inf.contrevenants.forEach((c: any) => {
                                if (c?.nom) haystacks.push(String(c.nom).toLowerCase());
                                if (c?.prenom) haystacks.push(String(c.prenom).toLowerCase());
                              });
                            }
                            if (!haystacks.some((value) => value.includes(normalizedTerm))) {
                              return false;
                            }
                          }

                          return true;
                        });

                        type DepartmentGroup = { label: string; items: any[] };
                        type RegionGroup = { label: string; items: any[]; departements: Record<string, DepartmentGroup> };
                        type MonthGroup = { label: string; items: any[]; regions: Record<string, RegionGroup> };

                        const monthGroups: Record<string, MonthGroup> = {};

                        const toLabel = (value: any, fallback: string) => {
                          const str = typeof value === 'string' ? value.trim() : '';
                          return str ? str.toUpperCase() : fallback;
                        };

                        filteredList.forEach((inf: any) => {
                          const date = new Date(inf.date_infraction);
                          if (Number.isNaN(date.getTime())) return;

                          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                          const monthLabel = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
                          const regionLabel = toLabel(inf.region, 'SANS RÉGION');
                          const departementLabel = toLabel(inf.departement, 'SANS DÉPARTEMENT');

                          const monthData = monthGroups[monthKey] ||= { label: monthLabel, items: [], regions: {} };
                          monthData.items.push(inf);

                          const regionData = monthData.regions[regionLabel] ||= { label: regionLabel, items: [], departements: {} };
                          regionData.items.push(inf);

                          const departementData = regionData.departements[departementLabel] ||= { label: departementLabel, items: [] };
                          departementData.items.push(inf);
                        });

                        const orderedMonthKeys = Object.keys(monthGroups).sort((a, b) => b.localeCompare(a));
                        if (!orderedMonthKeys.length) return null;

                        return orderedMonthKeys.map((monthKey) => {
                          const monthData = monthGroups[monthKey];
                          const isOpen = openMonthGroups[monthKey] ?? true;
                          const count = monthData.items.length;
                          const totalAmount = monthData.items.reduce((sum: number, it: any) => sum + Number(it.montant_chiffre ?? 0), 0);
                          const totalContrevenants = monthData.items.reduce((sum: number, it: any) => sum + (Array.isArray(it.contrevenants) ? it.contrevenants.length : 0), 0);
                          const formattedTotalAmount = totalAmount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                          return (
                            <div key={monthKey} className="border-b last:border-b-0">
                              <button
                                type="button"
                                className="w-full flex items-center justify-between px-4 py-2 bg-green-50/70 hover:bg-green-50 text-green-900"
                                onClick={() => setOpenMonthGroups((s) => ({ ...s, [monthKey]: !(s[monthKey] ?? true) }))}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 rounded-lg bg-red-100 text-red-700 text-sm font-medium">
                                    {monthData.label}
                                  </span>
                                  <span className="text-sm text-gray-600">{count} élément(s)</span>
                                </div>
                                <div className="text-sm text-gray-600 flex items-center gap-2">
                                  <span>transaction</span>
                                  <span className="mx-2 text-gray-300">"</span>
                                  <span className="text-red-600 font-semibold text-[13px]">{formattedTotalAmount} XOF</span>
                                  <span className="mx-2 text-gray-300">"</span>
                                  <span className="text-[13px]">{totalContrevenants} contrevenant(s)</span>
                                  <span className="ml-2 text-lg leading-none">{isOpen ? '−' : '+'}</span>
                                </div>
                              </button>

                              {isOpen && (
                                <div className="divide-y">
                                  {Object.entries(monthData.regions)
                                    .sort((a, b) => a[0].localeCompare(b[0]))
                                    .map(([regionKey, regionData]) => {
                                      const regionTotalAmount = regionData.items.reduce((sum: number, it: any) => sum + Number(it.montant_chiffre ?? 0), 0);
                                      const regionTotalContrevenants = regionData.items.reduce((sum: number, it: any) => sum + (Array.isArray(it.contrevenants) ? it.contrevenants.length : 0), 0);
                                      const regionAmountLabel = regionTotalAmount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                                      return (
                                        <div key={regionKey} className="bg-white">
                                          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-green-100 text-green-900 text-sm font-semibold">
                                            <span>Région : {regionData.label}</span>
                                            <span className="text-xs text-green-800">
                                              {regionData.items.length} élément(s) — {regionTotalContrevenants} contrevenant(s) — {regionAmountLabel} XOF
                                            </span>
                                          </div>

                                          <div className="divide-y">
                                            {Object.entries(regionData.departements)
                                              .sort((a, b) => a[0].localeCompare(b[0]))
                                              .map(([depKey, depData]) => {
                                                const depItems = [...depData.items].sort((a, b) => new Date(b.date_infraction).getTime() - new Date(a.date_infraction).getTime());
                                                const depTotalAmount = depItems.reduce((sum: number, it: any) => sum + Number(it.montant_chiffre ?? 0), 0);
                                                const depTotalContrevenants = depItems.reduce((sum: number, it: any) => sum + (Array.isArray(it.contrevenants) ? it.contrevenants.length : 0), 0);
                                                const depAmountLabel = depTotalAmount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                                                return (
                                                  <div key={`${regionKey}-${depKey}`} className="bg-white">
                                                    <div className="px-4 py-2 bg-gray-50 text-sm text-gray-700 flex flex-wrap items-center gap-2">
                                                      <span className="font-medium text-gray-800">Département : {depData.label}</span>
                                                      <span className="text-xs text-gray-500">
                                                        {depItems.length} élément(s) — {depTotalContrevenants} contrevenant(s) — {depAmountLabel} XOF
                                                      </span>
                                                    </div>

                                                    <div className="divide-y">
                                                      {depItems.map((infraction: any) => {
                                                        const creatorMeta = getAgentCreatorDetails(infraction);
                                                        return (
                                                          <div key={infraction.id} className="p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                                            <div className="flex-1 min-w-0">
                                                              <div className="flex items-baseline justify-between md:justify-start md:gap-6">
                                                                <div className="min-w-0">
                                                                  <h5 className="font-semibold text-gray-900 truncate">{infraction.code?.code || 'N/A'}</h5>
                                                                  {infraction.code?.nature ? (
                                                                    <p className="text-sm text-gray-600 truncate">{infraction.code.nature}</p>
                                                                  ) : null}
                                                                </div>
                                                              </div>

                                                              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                                <div className="flex items-center gap-2 text-sm">
                                                                  <Shield className="w-4 h-4 text-green-600" />
                                                                  <span className="text-gray-700 truncate">{infraction.agent?.nom} {infraction.agent?.prenom}</span>
                                                                </div>
                                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                                                                  <Users className="w-4 h-4 text-orange-600" />
                                                                  <span className="text-gray-700 text-[13px]">
                                                                    {(() => {
                                                                      if (!infraction) return '0 contrevenant(s)';
                                                                      const list2 = infraction.contrevenants;
                                                                      if (Array.isArray(list2)) {
                                                                        const count2 = list2.length;
                                                                        if (count2 > 0) {
                                                                          const first = list2[0];
                                                                          if (typeof first === 'object' && first !== null) {
                                                                            return `${count2} contrevenant(s)`;
                                                                          }
                                                                          return `${count2} contrevenant(s)`;
                                                                        }
                                                                      }
                                                                      return '0 contrevenant(s)';
                                                                    })()}
                                                                  </span>
                                                                  <span className="text-gray-300">•</span>
                                                                  <span className="text-red-600 font-semibold text-[13px]">
                                                                    {(Number(infraction.montant_chiffre ?? 0)).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} XOF
                                                                  </span>
                                                                  <span className="text-gray-300">•</span>
                                                                  <span className="text-gray-500 text-[13px]">
                                                                    {new Date(infraction.date_infraction).toLocaleDateString('fr-FR')}
                                                                  </span>

                                                                  <div className="flex items-center gap-2 text-gray-500 text-[13px] basis-full mt-1">
                                                                    <User className="w-4 h-4 text-blue-500" />
                                                                    <span className="truncate">
                                                                      {creatorMeta ? (
                                                                        <>
                                                                          <span className="font-medium text-gray-700">{creatorMeta.displayName ?? '-'}</span>
                                                                          {creatorMeta.description ? (
                                                                            <span className="text-gray-500"> — {creatorMeta.description}</span>
                                                                          ) : null}
                                                                        </>
                                                                      ) : (
                                                                        <span className="text-gray-500">-</span>
                                                                      )}
                                                                    </span>
                                                                  </div>
                                                                </div>
                                                                {(infraction.region || infraction.departement || infraction.commune) && (
                                                                  <div className="flex items-center gap-2 text-sm sm:col-span-2">
                                                                    <MapPin className="w-4 h-4 text-purple-600" />
                                                                    <span className="text-gray-700 truncate">
                                                                      {[infraction.region, infraction.departement, infraction.commune].filter(Boolean).join(' - ')}
                                                                    </span>
                                                                  </div>
                                                                )}
                                                              </div>
                                                            </div>

                                                            <div className="w-full md:w-auto flex gap-2">
                                                              {isPVLoading ? (
                                                                <button
                                                                  disabled
                                                                  className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-3 py-2 bg-gray-200 text-gray-500 rounded-lg text-sm cursor-not-allowed"
                                                                >
                                                                  Chargement…
                                                                </button>
                                                              ) : infraction.pv ? (
                                                                  <button
                                                                    onClick={() => {
                                                                      setSelectedPV(infraction);
                                                                      setOpenViewPV(true);
                                                                    }}
                                                                    className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                                                                  >
                                                                    <Eye className="w-4 h-4" />
                                                                    Voir PV
                                                                  </button>
                                                              ) : (
                                                                  <button
                                                                    onClick={() => {
                                                                      setFormPV({ ...formPV, infraction_id: String(infraction.id) });
                                                                      setOpenCreatePV(true);
                                                                    }}
                                                                    className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                                                                  >
                                                                    <Plus className="w-4 h-4" />
                                                                    Ajouter PV
                                                                  </button>
                                                              )}
                                                            </div>
                                                          </div>
                                                        );
                                                      })}
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                          </div>
                                        </div>
                                      );
                                    })}
                                </div>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                    {filteredInfractions.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                        <p>Aucune infraction disponible</p>
                        <p className="text-sm">
                          {user && (user.type === 'secteur' || user.type === 'regional')
                            ? `Aucune infraction dans votre ${user.type === 'secteur' ? 'département' : 'région'}`
                            : 'Les infractions apparaétront ici pour génération de PV'
                          }
                        </p>
                      </div>
                    )}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 mt-4 rounded-b-lg">
                      <div className="text-sm text-gray-600">
                        {`Affichage ${pvStartIndex}-${pvEndIndex} sur ${filteredPvList.length}`}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => setPvPage((page) => Math.max(1, page - 1))}
                          disabled={pvPageCursor === 1}
                        >
                          Précédent
                        </button>
                        <span className="text-sm text-gray-600">
                          Page {pvPageCursor} / {totalPvPages}
                        </span>
                        <button
                          type="button"
                          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => setPvPage((page) => Math.min(totalPvPages, page + 1))}
                          disabled={pvPageCursor === totalPvPages}
                        >
                          Suivant
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              </div>
            )}
          </div>
        </div>

        {/* Dialogs */}
        <Dialog open={openCreateCode} onOpenChange={setOpenCreateCode}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Choisir un Code d'infraction</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Code</Label>
                <Select value={selectedExistingCodeId} onValueChange={(v) => setSelectedExistingCodeId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un code" />
                  </SelectTrigger>
                  <SelectContent>
                    {codes.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.code} - {c.nature}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedExistingCodeId && (() => {
                const c = codes.find((x: any) => String(x.id) === String(selectedExistingCodeId));
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Nature</Label>
                      <Input value={c?.nature || ''} readOnly className="bg-gray-100" />
                    </div>
                    <div>
                      <Label>Article</Label>
                      <Input value={c?.article_code || ''} readOnly className="bg-gray-100" />
                    </div>
                  </div>
                );
              })()}
              <div className="flex justify-end gap-2">
                <button className="px-4 py-2 rounded border" onClick={() => setOpenCreateCode(false)}>Annuler</button>
                <button
                  className="px-4 py-2 rounded bg-blue-600 text-white"
                  onClick={() => {
                    if (!selectedExistingCodeId) return;
                    setFormInfraction((prev) => ({ ...prev, code_infraction_id: String(selectedExistingCodeId) }));
                    setOpenCreateCode(false);
                  }}
                >
                  Utiliser ce code
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={pendingDeselectContrevenantId !== null} onOpenChange={(open) => {
          if (!open) setPendingDeselectContrevenantId(null);
        }}>
          <DialogContent className="max-w-md border border-amber-200 bg-amber-50/80">
            <DialogHeader>
              <DialogTitle className="text-amber-900">Retirer le contrevenant ?</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm text-amber-900">
              <p>
                Ce contrevenant sera retiré de la liste des contrevenants associés à cette infraction.
              </p>
              <p className="text-xs text-amber-800">
                Vous pourrez toujours le réassocier plus tard en le cochant de nouveau, mais cette infraction
                ne lui sera plus liée si vous enregistrez.
              </p>
            </div>
            <DialogFooter className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded border border-gray-300 text-gray-800 hover:bg-gray-100"
                onClick={() => setPendingDeselectContrevenantId(null)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded bg-amber-600 text-white hover:bg-amber-700"
                onClick={() => {
                  if (pendingDeselectContrevenantId) {
                    toggleContrevenant(pendingDeselectContrevenantId);
                  }
                  setPendingDeselectContrevenantId(null);
                }}
              >
                Retirer ce contrevenant
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal d'information: N° de quittance déjà utilisé */}
        <Dialog open={duplicateReceiptOpen} onOpenChange={setDuplicateReceiptOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-red-600">Attention</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <p className="text-sm text-gray-700">{duplicateReceiptMsg || 'Numéro de quittance déjà utilisé.'}</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
                onClick={() => setDuplicateReceiptOpen(false)}
              >
                OK
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal: Détail des agents verbalisateurs */}
        <Dialog open={openAgentsModal} onOpenChange={setOpenAgentsModal}>
          <DialogContent className="w-[86vw] sm:w-[70vw] max-w-[460px] sm:max-w-sm md:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold flex items-center gap-2">
                <Shield className="w-5 h-5 text-green-600" />
                Liste des agents verbalisateurs
              </DialogTitle>
              <DialogDescription>
                Total: {filteredAgentsByRole.length} agent(s)
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {filteredAgentsByRole.length === 0 ? (
                <p className="text-sm text-gray-500">Aucun agent verbalisateur enregistré.</p>
              ) : (
                <div className="divide-y divide-gray-200 rounded-lg border border-gray-200">
                  {filteredAgentsByRole.map((agent: any) => {
                    const total = agentInfractionCounts.get(Number(agent.id)) || 0;
                    const agentInfractions = (Array.isArray(infractionsComplete) ? infractionsComplete : []).filter((inf: any) => (inf?.agent?.id ?? inf?.agent_id) === agent.id);
                    const pvItems = agentInfractions.map((inf: any) => inf?.pv).filter(Boolean);
                    const pvCount = pvItems.length;
                    const photoInfCount = agentInfractions.filter((inf: any) => !!inf?.photo_infraction).length;
                    const photoQuitCount = agentInfractions.filter((inf: any) => !!inf?.photo_quittance).length;
                    const latestWithPv = pvItems.length > 0 ? agentInfractions.find((inf: any) => !!inf?.pv) : null;
                    return (
                      <div key={agent.id} className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {agent.prenom} {agent.nom}
                            </p>
                            {agent.matricule ? (
                              <p className="text-xs text-gray-600 truncate">
                                matricule : {agent.matricule}
                              </p>
                            ) : null}
                            <p className="text-xs text-gray-500 truncate">
                              {(() => {
                                const rawRole = String(agent.created_by_role || agent.role || agent.created_by_type || '').toLowerCase();
                                const roleLabel = rawRole.replace(/sub[- ]agent/g, 'agent secteur');
                                const region = String(agent.created_by_region || '').toUpperCase();
                                const parts: string[] = [];
                                if (roleLabel) parts.push(roleLabel);
                                if (region) parts.push(region);
                                return parts.length ? parts.join(' • ') : '—';
                              })()}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                                <AlertTriangle className="w-3 h-3 text-orange-500" /> {total} infraction{total > 1 ? 's' : ''}
                              </span>
                              {pvCount > 0 ? (
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-blue-200 text-blue-700 hover:bg-blue-50"
                                  onClick={() => { if (latestWithPv) { setSelectedPV(latestWithPv); setOpenViewPV(true); } }}
                                  title="Ouvrir le dernier PV de cet agent"
                                >
                                  <FileText className="w-3 h-3" /> PV: {pvCount}
                                </button>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                                  <FileText className="w-3 h-3" /> PV: 0
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="ml-4 text-sm font-semibold text-gray-900 whitespace-nowrap">{total} infraction{total > 1 ? 's' : ''}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <DialogFooter>
              <button className="px-4 py-2 rounded border" onClick={() => setOpenAgentsModal(false)}>Fermer</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={receiptDuplicateModalOpen} onOpenChange={setReceiptDuplicateModalOpen}>
          <DialogContent className="max-w-md border border-amber-200 bg-amber-50/70">
            <DialogHeader>
              <DialogTitle className="text-amber-900">Attention</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm text-amber-900">
              <p>
                Enregistrement bloqué : ce <span className="font-semibold">numéro de quittance</span> est déjà utilisé
                pour un permis, une taxe ou une autre infraction.
              </p>
              <p className="text-xs text-amber-800">
                Veuillez vérifier le reçu utilisé ou saisir un autre numéro de quittance valide et disponible
                avant de réessayer.
              </p>
            </div>
            <DialogFooter className="flex justify-end">
              <button
                type="button"
                className="px-4 py-2 rounded border border-amber-300 text-amber-900 hover:bg-amber-100"
                onClick={() => setReceiptDuplicateModalOpen(false)}
              >
                Fermer
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={zoomOpen} onOpenChange={(open) => {
          setZoomOpen(open);
          if (!open) {
            setZoomMedia(null);
          }
        }}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{zoomMedia?.title || 'Aperéu'}</DialogTitle>
            </DialogHeader>
            {zoomMedia ? (
              <div className="w-full">
                <div className="mx-auto w-full overflow-hidden rounded-lg bg-black/5">
                  {isImageSrc(zoomMedia?.src || '') ? (
                    <img
                      src={zoomMedia?.src || ''}
                      alt={zoomMedia?.title || 'Aperéu'}
                      className="mx-auto max-h-[70vh] w-full object-contain"
                    />
                  ) : (
                    <iframe
                      src={zoomMedia?.src || ''}
                      title={zoomMedia?.title || 'Document'}
                      className="w-full h-[70vh] bg-white"
                      allow="autoplay; clipboard-read; clipboard-write; encrypted-media; fullscreen; geolocation; picture-in-picture"
                    />
                  )}
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <a
                    href={zoomMedia?.src || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Ouvrir dans un nouvel onglet
                  </a>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Aucun média é afficher.</p>
            )}
          </DialogContent>
        </Dialog>

        {/* Dialog Documents d'un Code d'infraction */}
        <Dialog open={openViewCodeDocs} onOpenChange={setOpenViewCodeDocs}>
          <DialogContent className="max-w-5xl w-[95vw] md:w-[80vw] h-[90vh] max-h-[90vh] p-6 flex flex-col overflow-hidden">
            <DialogHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <DialogTitle>Documents é {selectedCodeForDocs?.code || ''}</DialogTitle>
                {selectedCodeDocument && (
                  <div className="flex items-center gap-2 md:mr-10">
                    <a
                      href={getCodeDocUrl(selectedCodeDocument)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
                    >
                      Ouvrir dans un nouvel onglet
                    </a>
                    <a
                      href={getCodeDocUrl(selectedCodeDocument)}
                      download
                      className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
                    >
                      Télécharger
                    </a>
                  </div>
                )}
              </div>
            </DialogHeader>
            {codeDocuments.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  Aucun document disponible pour ce code
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col md:flex-row gap-4 overflow-hidden">
                <div className="md:w-64 flex-shrink-0 flex flex-col overflow-hidden">
                  <div className="space-y-2 overflow-y-auto pr-1">
                    {filteredCodeDocuments.length === 0 ? (
                      <div className="text-sm text-gray-500 text-center py-6 px-3">
                        Aucun document ne correspond é votre recherche
                      </div>
                    ) : (
                      filteredCodeDocuments.map((doc: any) => (
                        <button
                          key={doc.id}
                          onClick={() => setSelectedCodeDocument(doc)}
                          className={`w-full text-left px-3 py-2 rounded border ${selectedCodeDocument?.id === doc.id ? 'bg-blue-50 border-blue-300' : 'bg-white hover:bg-gray-50'}`}
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-600" />
                            <div>
                              <p className="text-sm font-medium line-clamp-1">{doc.filename}</p>
                              <p className="text-xs text-gray-500">{doc.mime || 'document'}</p>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-hidden">
                  {selectedCodeDocument ? (
                    <div className="h-full flex flex-col">
                      <div className="bg-white border rounded p-2 flex-1 flex items-center justify-center overflow-hidden">
                        {(() => {
                          const rawUrl = selectedCodeDocUrl || getCodeDocUrl(selectedCodeDocument);
                          if (!rawUrl) {
                            return <div className="text-gray-500 text-sm">Aperéu indisponible</div>;
                          }

                          const isImage = String(selectedCodeDocument?.mime || '').startsWith('image/');
                          const isPdf = String(selectedCodeDocument?.mime || '') === 'application/pdf' || /\.pdf$/i.test(selectedCodeDocument?.filename || '');
                          const viewerUrl = isPdf ? buildPdfViewerUrl(rawUrl.startsWith('blob:') ? rawUrl : getCodeDocUrl(selectedCodeDocument)) : rawUrl;

                          if (isImage) {
                            return <img src={rawUrl} alt={selectedCodeDocument?.filename} className="max-h-full max-w-full object-contain" />;
                          }

                          if (isPdf) {
                            return <embed src={viewerUrl} type="application/pdf" className="w-full h-full border" />;
                          }

                          return <iframe src={rawUrl} className="w-full h-full" title={selectedCodeDocument?.filename} />;
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-500">
                      Sélectionnez un document pour l'aperéu
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={openCreateAgent} onOpenChange={setOpenCreateAgent}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouvel Agent verbalisateur</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Prénom</Label>
                  <Input value={formAgent.prenom} onChange={(e) => setFormAgent({ ...formAgent, prenom: e.target.value })} />
                </div>
                <div>
                  <Label>Nom</Label>
                  <Input value={formAgent.nom} onChange={(e) => setFormAgent({ ...formAgent, nom: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Matricule</Label>
                  <Input value={formAgent.matricule} onChange={(e) => setFormAgent({ ...formAgent, matricule: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button className="px-4 py-2 rounded border" onClick={() => handleCloseAgentModal(false)}>Annuler</button>
                <button
                  className={`px-4 py-2 rounded text-white transition-colors ${agentFormIsValid ? 'bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500' : 'bg-green-300 cursor-not-allowed opacity-70'}`}
                  disabled={!agentFormIsValid || createAgentMutation.isPending || updateAgentMutation.isPending}
                  onClick={() => {
                    if (!agentFormIsValid) return;
                    if (createAgentMutation.isPending || updateAgentMutation.isPending) return;
                    if (editingAgentId) {
                      updateAgentMutation.mutate();
                    } else {
                      createAgentMutation.mutate();
                    }
                  }}
                >
                  {editingAgentId ? 'Mettre é jour' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={viewContrevenantOpen} onOpenChange={(open) => {
          setViewContrevenantOpen(open);
          if (!open) {
            setSelectedContrevenant(null);
            setSelectedContrevenantDetails(null);
            setViewContrevenantError(null);
            setViewContrevenantLoading(false);
            setViewContrevenantHistoryOpen(false);
          }
        }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Détails du contrevenant</DialogTitle>
            </DialogHeader>
            {viewContrevenantLoading ? (
              <p className="py-8 text-center text-sm text-gray-500">Chargement des informations...</p>
            ) : viewContrevenantError ? (
              <div className="py-8 text-center">
                <p className="text-sm text-red-600 mb-4">{viewContrevenantError}</p>
                {selectedContrevenant ? (
                  <button
                    className="px-4 py-2 rounded bg-orange-600 text-white hover:bg-orange-700"
                    onClick={() => handleViewContrevenant(selectedContrevenant)}
                  >
                    Réessayer
                  </button>
                ) : null}
              </div>
            ) : (selectedContrevenant || selectedContrevenantDetails) ? (
              (() => {
                const contrevenantToDisplay = selectedContrevenantDetails || selectedContrevenant;
                const photoSrc = selectedContrevenantDetails?.photo_base64 || selectedContrevenant?.photo_url || null;
                const pieceSrc = selectedContrevenantDetails?.piece_identite_base64 || selectedContrevenant?.piece_identite_url || null;
                const filiationParts = parseFiliation(contrevenantToDisplay?.filiation || '');
                const hasFiliation = Boolean(filiationParts.pere?.trim() || filiationParts.mere?.trim());
                const infractionsHistory = Array.isArray(selectedContrevenantDetails?.infractions_history)
                  ? selectedContrevenantDetails.infractions_history
                  : [];
                const historyCount = infractionsHistory.length;
                return (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Nom</Label>
                    <p className="mt-1 text-sm text-gray-900 font-medium">{contrevenantToDisplay?.nom || '—'}</p>
                  </div>
                  <div>
                    <Label>Prénom</Label>
                    <p className="mt-1 text-sm text-gray-900 font-medium">{contrevenantToDisplay?.prenom || 'é'}</p>
                  </div>
                  <div>
                    <Label>Filiation</Label>
                    {hasFiliation ? (
                      <ul className="mt-1 space-y-1 text-sm text-gray-900">
                        {filiationParts.pere ? (
                          <li><span className="font-medium">Père&nbsp;:</span> {filiationParts.pere}</li>
                        ) : null}
                        {filiationParts.mere ? (
                          <li><span className="font-medium">Mère&nbsp;:</span> {filiationParts.mere}</li>
                        ) : null}
                      </ul>
                    ) : (
                      <p className="mt-1 text-sm text-gray-900">é</p>
                    )}
                  </div>
                  <div>
                    <Label>Numéro de pièce</Label>
                    <p className="mt-1 text-sm text-gray-900 font-medium">{contrevenantToDisplay?.numero_piece || 'é'}</p>
                  </div>
                  <div>
                    <Label>Type de pièce</Label>
                    <p className="mt-1 text-sm text-gray-900">{contrevenantToDisplay?.type_piece || 'é'}</p>
                  </div>
                  <div>
                    <Label>Date d'enregistrement</Label>
                    <p className="mt-1 text-sm text-gray-900">
                      {contrevenantToDisplay?.date_creation ? new Date(contrevenantToDisplay.date_creation).toLocaleString('fr-FR') : 'é'}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="inline-flex items-center gap-2 text-red-600">
                      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide">Photo</span>
                      <span>Contrevenant</span>
                    </Label>
                    {photoSrc ? (
                      <div className="mt-2 space-y-2">
                        <button
                          type="button"
                          onClick={() => handleOpenZoom(photoSrc, 'Photo du contrevenant')}
                          className="w-full focus:outline-none"
                        >
                          <span className="sr-only">Voir la photo en grand</span>
                          <div
                            className="relative mx-auto w-full max-w-xs overflow-hidden rounded border bg-gray-100"
                            style={{ aspectRatio: '4 / 3' }}
                          >
                            <img
                              src={photoSrc}
                              alt="Photo contrevenant"
                              className="absolute inset-0 h-full w-full object-cover object-center"
                            />
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenZoom(photoSrc, 'Photo du contrevenant')}
                          className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
                        >
                          Voir en taille réelle
                        </button>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-gray-500">Non disponible</p>
                    )}
                  </div>
                  <div>
                    <Label className="inline-flex items-center gap-2 text-red-600">
                      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide">Photo</span>
                      <span>Pièce</span>
                    </Label>
                    {pieceSrc ? (
                      <div className="mt-2 space-y-2">
                        <button
                          type="button"
                          onClick={() => handleOpenZoom(pieceSrc, 'Pièce')}
                          className="w-full focus:outline-none"
                        >
                          <span className="sr-only">Voir la pièce d'identité en grand</span>
                          <div
                            className="relative mx-auto w-full max-w-xs overflow-hidden rounded border bg-gray-100"
                            style={{ aspectRatio: '4 / 3' }}
                          >
                            <img
                              src={pieceSrc}
                              alt="Pièce d'identité"
                              className="absolute inset-0 h-full w-full object-cover object-center"
                            />
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenZoom(pieceSrc, 'Pièce')}
                          className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
                        >
                          Ouvrir le document
                        </button>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-gray-500">Non disponible</p>
                    )}
                  </div>
                </div>
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <Label className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Historique des infractions associées</Label>
                      <p className="mt-1 text-sm text-gray-700">
                        {historyCount > 0
                          ? `${historyCount} infraction${historyCount > 1 ? 's' : ''} associée${historyCount > 1 ? 's' : ''}`
                          : "Aucune infraction associée"}
                      </p>
                    </div>
                    {historyCount > 0 ? (
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                        onClick={() => setViewContrevenantHistoryOpen(true)}
                      >
                        Voir le détail
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="flex justify-end">
                  <button className="px-4 py-2 rounded border" onClick={() => setViewContrevenantOpen(false)}>Fermer</button>
                </div>
              </div>
                );
              })()
            ) : (
              <p className="text-sm text-gray-500">Aucun contrevenant sélectionné.</p>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={viewContrevenantHistoryOpen} onOpenChange={(open) => setViewContrevenantHistoryOpen(open)}>
          <DialogContent className="max-w-3xl w-full">
            <DialogHeader>
              <DialogTitle>Historique des infractions</DialogTitle>
              <DialogDescription>
                Détails de toutes les infractions associées à ce contrevenant.
              </DialogDescription>
            </DialogHeader>
            {(() => {
              const infractionsHistory = Array.isArray(selectedContrevenantDetails?.infractions_history)
                ? selectedContrevenantDetails!.infractions_history
                : [];
              if (infractionsHistory.length === 0) {
                return <p className="py-6 text-sm text-gray-500">Aucune donnée à afficher.</p>;
              }
              return (
                <div className="space-y-4">
                  <p className="text-sm text-gray-700">
                    {infractionsHistory.length} infraction{infractionsHistory.length > 1 ? 's' : ''} associée{infractionsHistory.length > 1 ? 's' : ''}.
                  </p>
                  <div className="max-h-[70vh] overflow-y-auto pr-2 space-y-3">
                    {infractionsHistory.map((entry: any, index: number) => {
                      const locationParts = [entry.commune, entry.departement, entry.region]
                        .map((part: any) => (part ? String(part).trim() : ''))
                        .filter((part: string) => part !== '');
                      const locationLabel = locationParts.length > 0 ? locationParts.join(' / ') : 'Non renseignée';
                      return (
                        <div key={entry.id ?? `history-detail-${index}`} className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm">
                          <div className="flex flex-col gap-1">
                            <span className="font-semibold text-gray-900">Infraction #{entry.id ?? '—'}</span>
                            <span><span className="font-medium">Date :</span> {formatDateTime(entry.date_infraction)}</span>
                            <span><span className="font-medium">Code :</span> {entry.code || '—'} {entry.nature ? `– ${entry.nature}` : ''}</span>
                            <span><span className="font-medium">Article :</span> {entry.article_code || '—'}</span>
                            <span><span className="font-medium">Zone :</span> {locationLabel}</span>
                            <span><span className="font-medium">Transaction :</span> {formatCurrency(entry.montant_chiffre)}</span>
                            <span><span className="font-medium">Quittance :</span> {entry.numero_quittance || '—'}</span>
                            <span><span className="font-medium">PV :</span> {entry.numero_pv || (entry.pv_id ? `PV #${entry.pv_id}` : '—')}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            <DialogFooter className="flex justify-end">
              <button
                type="button"
                className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                onClick={() => setViewContrevenantHistoryOpen(false)}
              >
                Fermer
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!blockedDeletionInfo} onOpenChange={(open) => { if (!open) setBlockedDeletionInfo(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Suppression impossible</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm text-gray-700">
              <p>
                <span className="font-semibold text-gray-900">{blockedDeletionInfo?.label}</span> ne peut pas être supprimé tant qu'il est lié à des infractions ou des PV.
              </p>
              {blockedDeletionInfo?.details ? (
                <p className="text-sm text-gray-600">{blockedDeletionInfo.details}</p>
              ) : null}
            </div>
            <DialogFooter>
              <button
                type="button"
                className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700"
                onClick={() => setBlockedDeletionInfo(null)}
              >
                Compris
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={openCheckContrevenant} onOpenChange={handleCloseCheckContrevenant}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Vérifier le numéro de pièce</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contrevenant-piece-check">Numéro de pièce</Label>
                <Input
                  id="contrevenant-piece-check"
                  placeholder="Ex: Carte d'identité, Passeport, Permis"
                  value={checkContrevenantNumber}
                  onChange={(e) => setCheckContrevenantNumber(e.target.value)}
                  onKeyDown={handleCheckContrevenantKeyDown}
                  disabled={!!checkContrevenantResult}
                  className={checkContrevenantResult ? 'bg-gray-100 text-gray-700 cursor-not-allowed' : ''}
                  autoFocus
                />
              </div>

              {checkContrevenantError ? (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {checkContrevenantError}
                </div>
              ) : null}

              {checkContrevenantLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Vérification en cours...
                </div>
              ) : null}

              {!checkContrevenantLoading && checkContrevenantResult?.status === 'existing' ? (
                <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                  <p className="font-semibold">Ce numéro est déjà enregistré.</p>
                  <p className="mt-1 text-xs text-green-800">
                    Associez directement ce contrevenant à l'infraction ou consultez sa fiche détaillée.
                  </p>
                  <div className="mt-3 space-y-1 text-xs text-green-900">
                    <p><span className="font-semibold">Nom :</span> {checkContrevenantResult.contrevenant?.nom || '—'} {checkContrevenantResult.contrevenant?.prenom || ''}</p>
                    <p><span className="font-semibold">Numéro :</span> {checkContrevenantResult.contrevenant?.numero_piece || '—'}</p>
                    <p><span className="font-semibold">Type :</span> {checkContrevenantResult.contrevenant?.type_piece || '—'}</p>
                    <p><span className="font-semibold">Enregistré le :</span> {checkContrevenantResult.contrevenant?.date_creation ? new Date(checkContrevenantResult.contrevenant.date_creation).toLocaleString('fr-FR') : '—'}</p>
                  </div>
                </div>
              ) : null}

              {!checkContrevenantLoading && checkContrevenantResult?.status === 'new' ? (
                <div className="rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                  Ce numéro n'est pas encore enregistré. Vous pouvez poursuivre la création du contrevenant.
                </div>
              ) : null}
            </div>
            <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                className="w-full sm:w-auto rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleCancelCheckContrevenant}
              >
                Annuler
              </button>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                {!checkContrevenantResult && (
                  <button
                    type="button"
                    className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => void handleVerifyContrevenantNumber()}
                    disabled={checkContrevenantLoading}
                  >
                    {checkContrevenantLoading ? 'Vérification...' : 'Vérifier'}
                  </button>
                )}
                {checkContrevenantResult?.status === 'existing' ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      className="rounded border border-blue-200 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
                      onClick={() => checkContrevenantResult.contrevenant?.id && handleViewContrevenant(checkContrevenantResult.contrevenant)}
                    >
                      Voir la fiche
                    </button>
                    <button
                      type="button"
                      className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                      onClick={handleAttachExistingContrevenant}
                    >
                      Associer à l'infraction
                    </button>
                  </div>
                ) : null}
                {checkContrevenantResult?.status === 'new' ? (
                  <button
                    type="button"
                    className="rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
                    onClick={handleContinueWithNewContrevenant}
                  >
                    Continuer la création
                  </button>
                ) : null}
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={openCreateContrevenant} onOpenChange={handleCloseContrevenantModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingContrevenantId ? 'Modifier le contrevenant' : 'Nouveau Contrevenant'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Prénom</Label>
                  <Input required value={formContrevenant.prenom} onChange={(e) => setFormContrevenant({ ...formContrevenant, prenom: e.target.value })} />
                </div>
                <div>
                  <Label>Nom</Label>
                  <Input required value={formContrevenant.nom} onChange={(e) => setFormContrevenant({ ...formContrevenant, nom: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Filiation</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="filiation-pere" className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Prénom du pére</Label>
                    <Input
                      id="filiation-pere"
                      placeholder="Prénom du pére"
                      value={formContrevenant.filiation_pere}
                      onChange={(e) => {
                        setFormContrevenant((prev) => ({
                          ...prev,
                          filiation_pere: e.target.value
                        }));
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="filiation-mere" className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Nom et prénom de la mére</Label>
                    <Input
                      id="filiation-mere"
                      placeholder="Nom et prénom de la mére"
                      value={formContrevenant.filiation_mere}
                      onChange={(e) => {
                        setFormContrevenant((prev) => ({
                          ...prev,
                          filiation_mere: e.target.value
                        }));
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Numéro de pièce</Label>
                  <Input required value={formContrevenant.numero_piece} onChange={(e) => setFormContrevenant({ ...formContrevenant, numero_piece: e.target.value })} />
                </div>
                <div>
                  <Label>Type de pièce</Label>
                  <Select
                    value={formContrevenant.type_piece || undefined}
                    onValueChange={(value) => setFormContrevenant({ ...formContrevenant, type_piece: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un type de pièce" />
                    </SelectTrigger>
                    <SelectContent>
                      {IDENTITY_TYPE_OPTIONS.map((label) => (
                        <SelectItem key={label} value={label}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Photo contrevenant</Label>
                  <Input required type="file" accept="image/*" onChange={(e) => setFormContrevenant({ ...formContrevenant, photo: e.target.files?.[0] || null })} />
                </div>
                <div>
                  <Label>Pièce (scan)</Label>
                  <Input required type="file" accept="image/*,application/pdf" onChange={(e) => setFormContrevenant({ ...formContrevenant, piece_identite: e.target.files?.[0] || null })} />
                </div>
                <div>
                  <Label>Données biométriques</Label>
                  <Input
                    type="file"
                    accept="image/*,application/pdf,application/zip,.wsq"
                    capture="environment"
                    onChange={(e) => setFormContrevenant({ ...formContrevenant, donnees_biometriques: e.target.files?.[0] || null })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button className="px-4 py-2 rounded border" onClick={() => handleCloseContrevenantModal(false)}>Annuler</button>
                <button
                  className="px-4 py-2 rounded bg-orange-600 text-white disabled:opacity-60 disabled:cursor-not-allowed"
                  onClick={handleSubmitContrevenant}
                  disabled={!contrevenantFormIsValid || isContrevenantSubmitting}
                >
                  {editingContrevenantId ? 'Mettre é jour' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={duplicateModalOpen} onOpenChange={setDuplicateModalOpen}>
          <DialogContent className="max-w-md border border-red-200 bg-red-50/70">
            <DialogHeader>
              <DialogTitle className="text-red-900">Doublon détecté</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm text-red-900">
              <p>
                Création bloquée : ce numéro de pièce est déjé associé é un contrevenant existant.
                Pour éviter les doublons et suivre les récidives, utilisez la fiche ci-dessous.
              </p>
              {duplicateContrevenantInfo ? (
                <div className="rounded-md border border-red-300 bg-white p-3 text-xs text-gray-800">
                  <p><span className="font-semibold">Nom :</span> {duplicateContrevenantInfo?.nom || '—'} {duplicateContrevenantInfo?.prenom || ''}</p>
                  <p><span className="font-semibold">Numéro de pièce :</span> {duplicateContrevenantInfo?.numero_piece || '—'}</p>
                  <p><span className="font-semibold">Type de pièce :</span> {duplicateContrevenantInfo?.type_piece || '—'}</p>
                  <p><span className="font-semibold">Date d'enregistrement :</span> {duplicateContrevenantInfo?.date_creation ? new Date(duplicateContrevenantInfo?.date_creation as string).toLocaleString('fr-FR') : '—'}</p>
                </div>
              ) : null}
              <p className="text-xs text-gray-700">Associez l'infraction à ce contrevenant existant pour suivre les récidives.</p>
            </div>
            <DialogFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                onClick={() => duplicateContrevenantInfo?.id && handleViewContrevenant({ id: duplicateContrevenantInfo.id })}
                disabled={!duplicateContrevenantInfo?.id}
              >
                <Info className="w-4 h-4" />
                Voir les informations
              </button>
              <div className="flex items-center gap-2">
                <button
                  className="px-4 py-2 rounded border border-red-300 text-red-700 hover:bg-red-100"
                  onClick={() => setDuplicateModalOpen(false)}
                >
                  Fermer
                </button>
                <button
                  className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  onClick={linkDuplicateContrevenant}
                  disabled={!duplicateContrevenantInfo?.id}
                >
                  Associer à cette infraction
                </button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={openCreateInfraction} onOpenChange={setOpenCreateInfraction}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nouvelle Infraction</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <Label>Code d'infraction</Label>
                  <Select
                    value={formInfraction.code_infraction_id}
                    onValueChange={(v) => {
                      setFormInfraction((prev) => ({ ...prev, code_infraction_id: v }));
                      setCodeItems([]);
                      setSelectedCodeItemId('');
                      setCodeSearchTerm('');
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un code" />
                    </SelectTrigger>
                    <SelectContent className="z-[99999] fixed">
                      {codes.map((c: any) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          <span className="inline-flex items-center gap-2">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600">
                              <FileText className="w-4 h-4" />
                            </span>
                            <span>{c.code} - {c.nature}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Agent verbalisateur</Label>
                  <Select value={formInfraction.agent_id || ''} onValueChange={(v) => setFormInfraction({ ...formInfraction, agent_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map((a: any) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          <span className="inline-flex items-center gap-2">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500 text-white">
                              <User className="w-4 h-4" />
                            </span>
                            <span>{a.nom} {a.prenom}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Recherche basée sur nature et article (sous les champs Code et Agent) */}
              <div>
                <div className="flex items-center">
                  <Label>Recherche (nature et article)</Label>
                  <Switch
                    className="ml-2"
                    checked={codeSearchEnabled}
                    onCheckedChange={(v) => {
                      const nv = Boolean(v);
                      setCodeSearchEnabled(nv);
                      if (!nv) setCodeSearchTerm('');
                    }}
                    aria-label="Afficher/Masquer la recherche"
                  />
                </div>
                {!codeSearchEnabled ? (
                  <p className="mt-2 text-sm text-muted-foreground">Recherche désactivée.</p>
                ) : (
                  <div className="relative mt-1">
                    <Input
                      id="code-search-input"
                      placeholder="Rechercher (nature, article)"
                      value={codeSearchTerm}
                      onChange={(e) => setCodeSearchTerm(e.target.value)}
                      className="pl-8"
                    />
                    <Search
                      className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer"
                      onClick={() => document.getElementById('code-search-input')?.focus()}
                      aria-label="Activer la recherche"
                      role="button"
                    />
                  </div>
                )}
              </div>
              {/* Sélection de l'item et affichage nature/article */}
              {selectedInfractionCode && (
                <div className="space-y-3">
                  {codeItems.length > 1 && (
                    <div>
                      <Label>Nature/Article</Label>
                      <Select value={selectedCodeItemId} onValueChange={(v) => setSelectedCodeItemId(v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choisir nature/article" />
                        </SelectTrigger>
                        <SelectContent className="z-[99999] fixed">
                          {filteredCodeItems.length > 0 ? (
                            filteredCodeItems.map((it) => (
                              <SelectItem key={it.id} value={String(it.id)}>
                                {it.nature} é {it.article_code} {it.is_default ? '(par défaut)' : ''}
                              </SelectItem>
                            ))
                          ) : (
                            <div className="p-2 text-sm text-gray-500">Aucun résultat trouvé</div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Nature</Label>
                      <Input value={selectedItem?.nature || filteredCodeItems[0]?.nature || ''} readOnly className="bg-gray-100" />
                    </div>
                    <div>
                      <Label>Article</Label>
                      <Input value={selectedItem?.article_code || filteredCodeItems[0]?.article_code || ''} readOnly className="bg-gray-100" />
                    </div>
                  </div>
                  {codeSearchTerm && filteredCodeItems.length === 0 && (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                      <p className="text-sm text-yellow-800">
                        Aucun résultat trouvé pour "{codeSearchTerm}". Essayez un autre terme de recherche.
                      </p>
                    </div>
                  )}
                </div>
              )}
              <div>
                <Label>Contrevenant(s)</Label>
                {selectedContrevenantIds.length === 0 && (
                  <div className="mt-2 text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded px-3 py-2 text-center">
                    Aucun contrevenant n'est encore sélectionné dans l'onglet « Contrevenants ».
                  </div>
                )}
                <div className="mt-2 max-h-32 overflow-auto border rounded-md p-3 bg-gray-50">
                  {contrevenantsForInfraction.length === 0 ? (
                    <p className="text-sm text-gray-500">Aucun contrevenant disponible.</p>
                  ) : (
                    <div className="space-y-2">
                      {contrevenantsForInfraction.map((c: any) => (
                        <label key={c.id} className="flex items-center gap-3 text-sm cursor-pointer hover:bg-gray-100 p-2 rounded">
                          <input
                            type="checkbox"
                            className="w-4 h-4"
                            checked={!!(formInfraction.contrevenants && formInfraction.contrevenants.includes(String(c.id)))}
                            onChange={() => {
                              const id = String(c.id);
                              const isCurrentlySelected = !!(formInfraction.contrevenants && formInfraction.contrevenants.includes(id));
                              if (isCurrentlySelected) {
                                setPendingDeselectContrevenantId(id);
                              } else {
                                toggleContrevenant(id);
                              }
                            }}
                          />
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-600">
                            <User className="w-4 h-4" />
                          </span>
                          <div className="flex flex-1 flex-col sm:flex-row sm:items-center gap-2">
                            <span className="font-medium">{c.nom} {c.prenom}</span>
                            {c.numero_piece && <span className="text-gray-500">({c.numero_piece})</span>}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleViewContrevenant(c);
                            }}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                          >
                            <Info className="w-4 h-4" />
                            Infos
                          </button>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Date (automatique)</Label>
                  <Input
                    type="date"
                    value={formInfraction.date_infraction}
                    readOnly
                    className="bg-gray-100 cursor-not-allowed"
                    title="Date automatiquement définie par le système"
                  />
                </div>
                <div>
                  <Label>Photo infraction</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setFormInfraction(prev => ({ ...prev, photo_infraction: file }));
                      }
                    }}
                  />
                </div>
              </div>
              <div className="space-y-4">
                {geoOutOfZoneInfo && (
                  <div className="rounded-md border border-orange-300 bg-orange-50 p-4">
                    <div className="flex flex-col gap-2 text-sm text-orange-900">
                      <div className="flex items-center gap-2 text-orange-700 font-semibold">
                        <AlertTriangle className="w-4 h-4" />
                        Infraction détectée en dehors de votre région d'affectation
                      </div>
                      <p>Rapprochez-vous du service des Eaux et Forêts le plus proche de la région détectée pour enregistrer cette infraction.</p>
                      <ul className="text-xs text-orange-800 space-y-1">
                        <li><span className="font-semibold">Région détectée :</span> {geoOutOfZoneInfo.region || ''}</li>
                        <li><span className="font-semibold">Département détecté :</span> {geoOutOfZoneInfo.departement || ''}</li>
                      </ul>
                    </div>
                  </div>
                )}
                <div className="space-y-3">
                  <div>
                    <Label>Méthode d'identification de la zone</Label>
                    <RadioGroup
                      className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2"
                      value={zoneIdentifyMethod}
                      onValueChange={(v) => handleZoneIdentifyMethodChange(v as 'geolocate' | 'coords')}
                    >
                      <div className="flex items-center space-x-2 p-2 border rounded">
                        <RadioGroupItem value="geolocate" id="method-geolocate" />
                        <Label htmlFor="method-geolocate" className="cursor-pointer">Géolocaliser et remplir</Label>
                      </div>
                      <div className="flex items-center space-x-2 p-2 border rounded">
                        <RadioGroupItem value="coords" id="method-coords" />
                        <Label htmlFor="method-coords" className="cursor-pointer">Système de coordonnées (CSV / saisie)</Label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>
                {zoneIdentifyMethod === 'geolocate' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <Label>Latitude</Label>
                      <Input
                        type="number"
                        step="any"
                        value={formInfraction.latitude || ''}
                        onChange={(e) => setFormInfraction({ ...formInfraction, latitude: e.target.value })}
                        placeholder="14.4427960"
                      />
                    </div>
                    <div>
                      <Label>Longitude</Label>
                      <Input
                        type="number"
                        step="any"
                        value={formInfraction.longitude || ''}
                        onChange={(e) => setFormInfraction({ ...formInfraction, longitude: e.target.value })}
                        placeholder="-16.947863"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={geolocateAndResolve}
                        className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        📍 Géolocaliser et remplir
                      </button>
                    </div>
                  </div>
                )}
                {/* Vérification de zone (CSV / Saisie manuelle) */}
                {zoneIdentifyMethod === 'coords' && (
                  <div className="border rounded-md p-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                      <div>
                        <Label>Système de coordonnées</Label>
                        <Select value={verificationCoordinateSystem} onValueChange={(v) => setVerificationCoordinateSystem(v as any)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choisir" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="geographic">Géographiques (Latitude/Longitude)</SelectItem>
                            <SelectItem value="utm">WGS84 / UTM zone 28N</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-end justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={addVerificationCoordinate} disabled={verificationTab !== 'manual'} title={verificationTab !== 'manual' ? 'Disponible en saisie manuelle' : undefined}>
                          <Plus className="h-3 w-3 mr-1" /> Ajouter un point
                        </Button>
                        {verificationCoordinates.length > 0 && (
                          <Button type="button" variant="destructive" size="sm" onClick={clearVerification}>
                            <X className="h-3 w-3 mr-1" /> Effacer
                          </Button>
                        )}
                      </div>
                    </div>
                    <Tabs value={verificationTab} onValueChange={(v) => setVerificationTab(v as 'csv' | 'manual')} className="w-full">
                      <TabsList className="grid grid-cols-2 w-full">
                        <TabsTrigger value="csv">Importer CSV</TabsTrigger>
                        <TabsTrigger value="manual">Saisie manuelle</TabsTrigger>
                      </TabsList>
                      <TabsContent value="csv" className="space-y-3">
                        <div className="flex items-center gap-2">
                          <input id="verification-csv-input" type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => { const f = e.currentTarget.files?.[0]; await onVerificationCsvChange(f); try { e.currentTarget.value = ''; } catch {} }} />
                          <Button type="button" variant="outline" onClick={() => document.getElementById('verification-csv-input')?.click()}>
                            <Upload className="h-4 w-4 mr-2" /> Sélectionner un fichier CSV
                          </Button>
                          {verificationDerived.pointCount > 0 && (
                            <div className="text-xs bg-blue-50 px-2 py-1 rounded border border-blue-200">
                              {verificationDerived.pointCount} point(s)
                            </div>
                          )}
                        </div>
                      </TabsContent>
                      <TabsContent value="manual" className="space-y-2">
                        {verificationCoordinates.length > 0 && (
                          <div className="space-y-2 max-h-40 overflow-y-auto">
                            {verificationCoordinates.map((c: any, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                {verificationCoordinateSystem === 'geographic' ? (
                                  <>
                                    <div className="flex-1">
                                      <Label className="text-xs">Latitude</Label>
                                      <Input type="number" step="any" value={c.latitude || ''} onChange={(e) => updateVerificationCoordinate(idx, 'latitude', e.target.value)} />
                                    </div>
                                    <div className="flex-1">
                                      <Label className="text-xs">Longitude</Label>
                                      <Input type="number" step="any" value={c.longitude || ''} onChange={(e) => updateVerificationCoordinate(idx, 'longitude', e.target.value)} />
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="flex-1">
                                      <Label className="text-xs">Easting (X)</Label>
                                      <Input type="number" step="any" value={c.easting || ''} onChange={(e) => updateVerificationCoordinate(idx, 'easting', e.target.value)} />
                                    </div>
                                    <div className="flex-1">
                                      <Label className="text-xs">Northing (Y)</Label>
                                      <Input type="number" step="any" value={c.northing || ''} onChange={(e) => updateVerificationCoordinate(idx, 'northing', e.target.value)} />
                                    </div>
                                  </>
                                )}
                                {verificationCoordinates.length > 1 && (
                                  <Button type="button" variant="destructive" size="sm" className="h-8 w-8 p-0" onClick={() => removeVerificationCoordinate(idx)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="text-xs text-slate-600">
                        {verificationDerived.centroid ? (
                          <>Centre: {verificationDerived.centroid.lat.toFixed(6)}, {verificationDerived.centroid.lon.toFixed(6)}</>
                        ) : 'Centre: N/A'}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={applyVerificationToForm} disabled={!verificationDerived.centroid}>
                          Appliquer aux champs
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
                <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${formInfraction.arrondissement ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
                  <div>
                    <Label>Région</Label>
                    <Input
                      value={formInfraction.region}
                      readOnly
                      className="bg-gray-100 cursor-not-allowed"
                      placeholder="Sera déduite des coordonnées"
                      title="Région automatiquement déduite des coordonnées GPS"
                    />
                  </div>
                  <div>
                    <Label>Département</Label>
                    <Input
                      value={formInfraction.departement}
                      readOnly
                      className="bg-gray-100 cursor-not-allowed"
                      placeholder="Sera déduit des coordonnées"
                      title="Département automatiquement déduit des coordonnées GPS"
                    />
                  </div>
                  <div>
                    <Label>Commune</Label>
                    <Input
                      value={formInfraction.commune}
                      readOnly
                      className="bg-gray-100 cursor-not-allowed"
                      placeholder="Sera déduite des coordonnées"
                      title="Commune automatiquement déduite des coordonnées GPS"
                    />
                  </div>
                  {formInfraction.arrondissement && (
                    <div>
                      <Label>Arrondissement</Label>
                      <Input
                        value={formInfraction.arrondissement}
                        readOnly
                        className="bg-gray-100 cursor-not-allowed"
                        title="Arrondissement automatiquement déduit des coordonnées GPS"
                      />
                    </div>
                  )}
                </div>
              </div>
              {!geoOutOfZoneInfo ? (
                <>
                  <div>
                    <Label>Montant (F CFA)</Label>
                    <Input
                      value={formInfraction.montant_chiffre ? Number(formInfraction.montant_chiffre).toLocaleString('fr-FR') : ''}
                      onChange={(e) => {
                        const digits = (e.target.value || '').replace(/\D+/g, '');
                        setFormInfraction({ ...formInfraction, montant_chiffre: digits });
                      }}
                      onKeyDown={(ev) => {
                        const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Home','End'];
                        if (allowed.includes(ev.key)) return;
                        if (!/\d/.test(ev.key)) {
                          ev.preventDefault();
                        }
                      }}
                      onPaste={(ev) => {
                        ev.preventDefault();
                        const text = (ev.clipboardData.getData('text') || '').replace(/\D+/g, '');
                        setFormInfraction({ ...formInfraction, montant_chiffre: text });
                      }}
                      inputMode="numeric"
                      placeholder="ex: 150 000 F CFA"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Photo quittance</Label>
                      <Input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setFormInfraction((prev) => ({ ...prev, photo_quittance: file }));
                          }
                        }}
                      />
                    </div>
                    <div>
                      <Label>Numéro de quittance</Label>
                      <Input
                        value={formInfraction.numero_quittance || ''}
                        onChange={(e) => {
                          // Live mask to canonical 'NNNNNNN/NN LL'
                          const raw = (e.target.value || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
                          const digits = raw.replace(/[^0-9]/g, '');
                          const letters = raw.replace(/[^A-Z]/g, '');
                          const part1 = digits.slice(0, 7);
                          const part2 = digits.slice(7, 9);
                          const part3 = letters.slice(0, 2);
                          let formatted = part1;
                          if (part2) formatted += `/${part2}`;
                          if (part3) formatted += ` ${part3}`;
                          setFormInfraction({ ...formInfraction, numero_quittance: formatted });
                        }}
                        onBlur={(e) => {
                          const v = (e.target.value || '').toUpperCase().trim();
                          const m = v.match(/^(\d{7})\/(\d{2})\s*([A-Z]{2})$/);
                          if (m) {
                            const canonical = `${m[1]}/${m[2]} ${m[3]}`;
                            setFormInfraction((prev) => ({ ...prev, numero_quittance: canonical }));
                          }
                        }}
                        placeholder="ex: 1234567/24 JS"
                      />
                    </div>
                  </div>
                </>
              ) : null}
              <div>
                <div className="flex items-center">
                  <Label className="inline-flex items-center px-2 py-1 rounded bg-red-50 text-red-700 border border-red-200">
                    Observations / Saisies
                  </Label>
                  <Switch
                    className="ml-2"
                    checked={observationFlagEnabled}
                    onCheckedChange={(v) => setObservationFlagEnabled(Boolean(v))}
                    aria-label="Activer observations"
                  />
                </div>
                {!observationFlagEnabled ? (
                  <p className="mt-3 text-sm text-muted-foreground">Aucune observation requise (Néant).</p>
                ) : (
                <div className="mt-2 space-y-4">
                  {/* Barre de recherche et actions rapides */}
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                    <div className="relative max-w-sm w-full">
                      <Input
                        placeholder="Rechercher un item..."
                        value={obsSearch}
                        onChange={(e) => setObsSearch(e.target.value)}
                        className="pl-8"
                      />
                      <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={clearAllObs}>Tout décocher</Button>
                      <Button type="button" variant="outline" size="sm" onClick={resetQtyObs}>Réinitialiser quantités</Button>
                    </div>
                  </div>

                  {/* Groupes */}
                  {Object.keys(groupedOptions).length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aucun résultat.</p>
                  ) : (
                    <div className="space-y-6">
                      {orderedGroupKeys.map((groupKey) => {
                        const groupData = groupedOptions[groupKey];
                        const items = groupData?.items || [];
                        const displayGroup = groupData?.label || formatGroupLabel(groupKey, groupMap.get(groupKey) || null);
                        const collapsed = obsCollapsedGroups[groupKey] ?? true;
                        return (
                          <div key={groupKey} className="space-y-3">
                            <div
                              className="flex items-center justify-between cursor-pointer select-none"
                              onClick={() => setObsCollapsedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }))}
                            >
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 text-xs font-medium">
                                {displayGroup}
                              </span>
                              <span className="flex items-center gap-1 text-xs text-gray-600">
                                {items.length} élément(s)
                                <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? '-rotate-90' : 'rotate-0'}`} />
                              </span>
                            </div>
                            {!collapsed && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {items.map((opt) => {
                                  const sel = observationSelections[opt.key] || { checked: false, qty: '', unit: undefined };
                                  const invalid = sel.checked && opt.withQuantity && (!sel.qty || isNaN(Number(sel.qty)));
                                  return (
                                    <div key={opt.key} className={`border rounded-md p-2 shadow-sm ${invalid ? 'border-red-500 bg-red-50' : sel.checked ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-white'}`}>
                                      <div className="flex items-center gap-2">
                                        <Checkbox
                                          id={`obs-${opt.key}`}
                                          checked={!!sel.checked}
                                          onCheckedChange={(checked) => {
                                            setObservationSelections((prev) => {
                                              const nextChecked = Boolean(checked);
                                              let unit = sel.unit;
                                              let qty = sel.qty || '';
                                              if (!nextChecked) {
                                                unit = undefined;
                                                qty = '';
                                              } else if (opt.withQuantity) {
                                                if (opt.unit_mode === 'fixed' && opt.unit_fixed_key) {
                                                  unit = opt.unit_fixed_key as any;
                                                } else if (opt.unit_mode === 'choices' && Array.isArray(opt.unit_allowed) && opt.unit_allowed.length > 0) {
                                                  unit = (unit as any) || (opt.unit_allowed[0] as any);
                                                } else if (opt.unit_mode === 'none' || opt.unit_mode === 'free') {
                                                  unit = undefined;
                                                } else {
                                                  unit = (unit as any) || (suggestDefaultUnit(opt.label) as any) || undefined;
                                                }
                                              }
                                              return {
                                                ...prev,
                                                [opt.key]: { checked: nextChecked, qty, unit }
                                              };
                                            });
                                          }}
                                        />
                                        <Label htmlFor={`obs-${opt.key}`} className="cursor-pointer text-sm flex-1">{opt.label}</Label>
                                      </div>
                                      {opt.withQuantity && (
                                        <div className="mt-2 space-y-2">
                                          <div className="flex items-center gap-2">
                                            <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => incQty(opt.key, -1)} disabled={!sel.checked}>
                                              <Minus className="w-3 h-3" />
                                            </Button>
                                            <Label className="text-sm font-medium text-gray-700 w-10">Qté</Label>
                                            <Input
                                              type="number"
                                              min="0"
                                              step="any"
                                              value={sel.qty}
                                              placeholder="ex: 10"
                                              className={`h-9 w-28 bg-white border-gray-300 ${!sel.checked ? 'opacity-100' : ''}`}
                                              onChange={(e) =>
                                                setObservationSelections((prev) => ({
                                                  ...prev,
                                                  [opt.key]: { checked: !!sel.checked, qty: e.target.value, unit: sel.unit }
                                                }))
                                              }
                                              disabled={!sel.checked}
                                            />
                                            <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => incQty(opt.key, 1)} disabled={!sel.checked}>
                                              <Plus className="w-3 h-3" />
                                            </Button>
                                          </div>
                                          {(opt.unit_mode === 'fixed' || opt.unit_mode === 'choices') && (
                                            <div className="flex items-center gap-2">
                                              {/* Spacers to align under the quantity input */}
                                              <div className="w-8" />
                                              <div className="w-10" />
                                              <div className="w-28 flex justify-center">
                                                <Select
                                                  value={sel.unit}
                                                  onValueChange={(val) =>
                                                    setObservationSelections((prev) => ({
                                                      ...prev,
                                                      [opt.key]: { checked: !!sel.checked, qty: sel.qty, unit: val as any }
                                                    }))
                                                  }
                                                  disabled={!sel.checked || opt.unit_mode === 'fixed'}
                                                >
                                                  <SelectTrigger className={`h-9 w-24 bg-white border-gray-300 ${!sel.checked ? 'opacity-100' : ''}`}>
                                                    <SelectValue placeholder="Unité" />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                    {(() => {
                                                      const allowed = opt.unit_mode === 'fixed' && opt.unit_fixed_key
                                                        ? [opt.unit_fixed_key]
                                                        : (Array.isArray(opt.unit_allowed) && opt.unit_allowed.length > 0
                                                          ? opt.unit_allowed
                                                          : ['kg','g','L','piece','stere']);
                                                      return allowed.map((u) => (
                                                        <SelectItem key={u} value={u as any}>{u}</SelectItem>
                                                      ));
                                                    })()}
                                                  </SelectContent>
                                                </Select>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <button className="px-4 py-2 rounded border" onClick={() => setOpenCreateInfraction(false)}>Annuler</button>
                <button
                  className="px-4 py-2 rounded bg-red-600 text-white disabled:opacity-60 disabled:cursor-not-allowed"
                  onClick={() => {
                    if (createInfractionMutation.isPending) return;
                    console.log('=== AVANT CREATION INFRACTION ===');
                    console.log('formInfraction:', formInfraction);
                    console.log('selectedCodeItemId:', selectedCodeItemId);
                    console.log('selectedInfractionCode:', selectedInfractionCode);
                    console.log('codeItems disponibles:', codeItems);
                    console.log('IDs des codeItems:', codeItems.map((item) => item.id));
                    console.log('selectedCodeItemId (number):', Number(selectedCodeItemId));
                    console.log('Item sélectionné dans codeItems:', codeItems.find((item) => item.id === Number(selectedCodeItemId)));

                    try {
                      createInfractionMutation.mutate();
                    } catch (error) {
                      console.error('Erreur lors de la mutation:', error);
                    }
                  }}
                  disabled={!isInfractionFormValid || createInfractionMutation.isPending}
                >
                  {createInfractionMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog Création PV */}
        <Dialog open={openCreatePV} onOpenChange={setOpenCreatePV}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Ajouter un Procés-Verbal</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {!formPV.infraction_id && (
                <div>
                  <Label>Infraction associée</Label>
                  <Select value={formPV.infraction_id} onValueChange={(v) => setFormPV({ ...formPV, infraction_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner une infraction" />
                    </SelectTrigger>
                    <SelectContent>
                      {infractionsComplete.map((inf: any) => (
                        <SelectItem key={inf.id} value={String(inf.id)}>
                          {inf.code?.code} - {inf.code?.nature} ({new Date(inf.date_infraction).toLocaleDateString('fr-FR')})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label>Numéro du PV</Label>
                <Input
                  value={formPV.numero_pv}
                  onChange={(e) => {
                    const digits = (e.target.value || '').replace(/\D+/g, '').slice(0, 6);
                    setFormPV({ ...formPV, numero_pv: digits });
                  }}
                  placeholder={pvNumberPlaceholder}
                />
              </div>

              <div>
                <Label>Fichier PV généré (PDF)</Label>
                <Input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setFormPV({ ...formPV, fichier_pv: e.target.files?.[0] || null })}
                />
              </div>

              <div className="flex justify-end gap-2">
                <button className="px-4 py-2 rounded border" onClick={() => setOpenCreatePV(false)}>Annuler</button>
                <button
                  className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60 disabled:cursor-not-allowed"
                  onClick={() => createPVMutation.mutate()}
                  disabled={!canSubmitPV}
                >
                  {createPVMutation.isPending ? 'Enregistrement...' : 'Enregistrer le PV'}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog Visualisation PV */}
        <Dialog open={openViewPV} onOpenChange={setOpenViewPV}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Détails du Procés-Verbal</DialogTitle>
            </DialogHeader>
            {selectedPV && (
              <div className="space-y-5">
                {/* En-téte avec numéro PV et date */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-5 rounded-lg shadow-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium opacity-90">Numéro du Procés-Verbal</p>
                      <p className="text-2xl font-bold mt-1">{selectedPV.pv?.numero_pv || selectedPV.numero_pv || `PV-${selectedPV.id}`}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium opacity-90">Date de création</p>
                      <p className="text-lg font-semibold mt-1">
                        {selectedPV.pv?.created_at ? new Date(selectedPV.pv.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Détails de l'infraction */}
                <div className="bg-red-50 border border-red-200 p-5 rounded-lg">
                  <h3 className="text-lg font-bold text-red-900 mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    Infraction constatée
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="bg-white p-3 rounded-lg">
                      <Label className="text-xs font-semibold text-gray-500 uppercase">Code d'infraction</Label>
                      <p className="text-base font-bold text-gray-900 mt-1">
                        {selectedPV.code?.code || selectedPV.infraction?.code || selectedPV.ci?.code || 'N/A'}
                      </p>
                    </div>
                    <div className="bg-white p-3 rounded-lg md:col-span-2">
                      <Label className="text-xs font-semibold text-gray-500 uppercase">Nature de l'infraction</Label>
                      <p className="text-base font-medium text-gray-900 mt-1">
                        {selectedPV.code?.nature || selectedPV.infraction?.nature || selectedPV.item_nature || (selectedPV.code?.item_nature) || 'N/A'}
                      </p>
                    </div>
                    <div className="bg-white p-3 rounded-lg">
                      <Label className="text-xs font-semibold text-gray-500 uppercase">Date de l'infraction</Label>
                      <p className="text-base font-medium text-gray-900 mt-1">
                        {selectedPV.date_infraction ? new Date(selectedPV.date_infraction).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : 'N/A'}
                      </p>
                    </div>
                    <div className="bg-white p-3 rounded-lg">
                      <Label className="text-xs font-semibold text-gray-500 uppercase">Montant de la transaction</Label>
                      <p className="text-lg font-bold text-red-600 mt-1">
                        {selectedPV.montant_chiffre ? `${selectedPV.montant_chiffre.toLocaleString()} XOF` : 'Non spécifié'}
                      </p>
                    </div>
                    <div className="bg-white p-3 rounded-lg">
                      <Label className="text-xs font-semibold text-gray-500 uppercase">Agent verbalisateur</Label>
                      <p className="text-base font-medium text-gray-900 mt-1">
                        {selectedPV.agent ? `${selectedPV.agent.nom} ${selectedPV.agent.prenom}` : 'Non renseigné'}
                      </p>
                      {selectedPV.agent?.matricule && (
                        <p className="text-xs text-gray-500 mt-0.5">Matricule: {selectedPV.agent.matricule}</p>
                      )}
                    </div>
                    <div className="bg-white p-3 rounded-lg lg:col-span-3">
                      <Label className="text-xs font-semibold text-gray-500 uppercase">Lieu de l'infraction</Label>
                      <p className="text-base font-medium text-gray-900 mt-1 flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-purple-600" />
                        {(() => {
                          const parts: string[] = [];
                          if (selectedPV?.region) parts.push(`Région: ${selectedPV.region}`);
                          if (selectedPV?.departement) parts.push(`Département: ${selectedPV.departement}`);
                          if (selectedPV?.commune) parts.push(`Commune: ${selectedPV.commune}`);
                          if (selectedPV?.arrondissement) parts.push(`Arrondissement: ${selectedPV.arrondissement}`);
                          return parts.join(' / ') || 'Non renseigné';
                        })()}
                      </p>
                    </div>
                    {selectedPV.observations && (
                      <div className="bg-white p-3 rounded-lg lg:col-span-3">
                        <Label className="text-xs font-semibold text-gray-500 uppercase">Observations</Label>
                        <p className="text-sm text-gray-700 mt-2 leading-relaxed">{selectedPV.observations}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Contrevenants */}
                {selectedPV.contrevenants && selectedPV.contrevenants.length > 0 ? (
                  <div className="bg-orange-50 border border-orange-200 p-5 rounded-lg">
                    <h3 className="text-lg font-bold text-orange-900 mb-4 flex items-center gap-2">
                      <Users className="w-5 h-5" />
                      Contrevenant(s) impliqué(s) ({selectedPV.contrevenants.length})
                    </h3>
                    <div className="space-y-4">
                      {selectedPV.contrevenants.map((contrevenant: any, index: number) => (
                        <div key={contrevenant.id || index} className="bg-white border border-orange-200 p-4 rounded-lg shadow-sm">
                          <div className="flex flex-col md:flex-row gap-4">
                            {/* Vignettes: Photo + Pièce d'identité */}
                            <div className="flex-shrink-0 space-y-2">
                              <div>
                                {(() => {
                                  const src = getContrevenantPhotoSrc(contrevenant);
                                  if (!src) {
                                    return (
                                      <div className="w-24 h-24 bg-gray-200 rounded-lg flex items-center justify-center">
                                        <ImageIcon className="w-10 h-10 text-gray-400" />
                                      </div>
                                    );
                                  }
                                  return (
                                    <button
                                      onClick={async () => {
                                        const title = 'Photo - ' + (contrevenant.nom || '') + ' ' + (contrevenant.prenom || '');
                                        const s = String(src);
                                        if (s.startsWith('blob:')) { handleOpenZoom(s.endsWith('#img') ? s : s + '#img', title); return; }
                                        try {
                                          const url = `/api/infractions/contrevenants/${contrevenant.id}/photo`;
                                          const res = await fetch(url, { credentials: 'include', headers: getAuthHeaders() });
                                          if (res.ok) {
                                            const blob = await res.blob();
                                            const obj = URL.createObjectURL(blob);
                                            const tagged = blob.type && blob.type.startsWith('image/') ? (obj + '#img') : (obj + '#doc');
                                            handleOpenZoom(tagged, title);
                                            return;
                                          }
                                        } catch {}
                                        handleOpenZoom(window.location.origin + `/api/infractions/contrevenants/${contrevenant.id}/photo`, title);
                                      }}
                                      className="w-24 h-24 rounded-lg overflow-hidden border-2 border-orange-300 hover:border-orange-500 transition-all cursor-pointer block"
                                      type="button"
                                      title="Voir la photo"
                                    >
                                      <img
                                        src={src as string}
                                        alt={`${contrevenant.nom} ${contrevenant.prenom}`}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                          const img = e.currentTarget as HTMLImageElement;
                                          img.onerror = null;
                                          if (contrevenant?.id) {
                                            img.src = window.location.origin + `/api/infractions/contrevenants/${contrevenant.id}/photo`;
                                          }
                                        }}
                                      />
                                    </button>
                                  );
                                })()}
                              </div>
                              {(() => {
                                const src = getContrevenantPieceSrc(contrevenant);
                                if (!src) return null;
                                const title = "Pièce d'identité - " + (contrevenant.nom || '') + ' ' + (contrevenant.prenom || '');
                                if (isPdfSrc(src)) {
                                  return (
                                    <div>
                                      <button
                                        onClick={() => handleOpenZoom(src, title)}
                                        className="w-24 h-24 rounded-lg overflow-hidden border-2 border-green-300 hover:border-green-500 transition-all cursor-pointer block bg-green-50 text-green-700 flex items-center justify-center"
                                        type="button"
                                        title="Voir la pièce d'identité (PDF)"
                                      >
                                        <FileText className="w-8 h-8" />
                                      </button>
                                    </div>
                                  );
                                }
                                return (
                                  <div>
                                    <button
                                      onClick={async () => {
                                        const s = String(src);
                                        if (s.startsWith('blob:')) { handleOpenZoom(s.endsWith('#img') || s.endsWith('#doc') ? s : s + '#img', title); return; }
                                        try {
                                          const url = `/api/infractions/contrevenants/${contrevenant.id}/piece-identite`;
                                          const res = await fetch(url, { credentials: 'include', headers: getAuthHeaders() });
                                          if (res.ok) {
                                            const blob = await res.blob();
                                            const obj = URL.createObjectURL(blob);
                                            const tagged = blob.type && blob.type.startsWith('image/') ? (obj + '#img') : (obj + '#doc');
                                            handleOpenZoom(tagged, title);
                                            return;
                                          }
                                        } catch {}
                                        handleOpenZoom(window.location.origin + `/api/infractions/contrevenants/${contrevenant.id}/piece-identite`, title);
                                      }}
                                      className="w-24 h-24 rounded-lg overflow-hidden border-2 border-green-300 hover:border-green-500 transition-all cursor-pointer block"
                                      type="button"
                                      title="Voir la pièce d'identité"
                                    >
                                      <img
                                        src={src as string}
                                        alt={`Pièce d'identité de ${contrevenant.nom} ${contrevenant.prenom}`}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                          const img = e.currentTarget as HTMLImageElement;
                                          img.onerror = null;
                                          if (contrevenant?.id) {
                                            img.src = window.location.origin + `/api/infractions/contrevenants/${contrevenant.id}/piece-identite`;
                                          }
                                        }}
                                      />
                                    </button>
                                  </div>
                                );
                              })()}
                            </div>

                            {/* Informations du contrevenant */}
                            <div className="flex-1 space-y-3">
                              <div>
                                <h4 className="text-lg font-bold text-gray-900">{contrevenant.nom} {contrevenant.prenom}</h4>
                                <p className="text-sm text-gray-500">Contrevenant #{index + 1}</p>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="bg-gray-50 p-2 rounded">
                                  <Label className="text-xs font-semibold text-gray-500 uppercase">Pièce d'identité</Label>
                                  <p className="text-sm font-medium text-gray-900 mt-0.5">{contrevenant.numero_piece || 'N/A'}</p>
                                  <p className="text-xs text-gray-500">{contrevenant.type_piece || 'Type non spécifié'}</p>
                                </div>
                                {contrevenant.filiation && (
                                  <div className="bg-gray-50 p-2 rounded">
                                    <Label className="text-xs font-semibold text-gray-500 uppercase">Filiation</Label>
                                    <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-line">
                                      {(() => {
                                        const parts = parseRawFiliation(contrevenant.filiation);
                                        const lines: string[] = [];
                                        if (parts.pere) lines.push('Père: ' + parts.pere);
                                        if (parts.mere) lines.push('Mère: ' + parts.mere);
                                        return lines.join('\n') || contrevenant.filiation;
                                      })()}
                                    </p>
                                  </div>
                                )}
                              </div>


                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-orange-50 border border-orange-200 p-5 rounded-lg text-center">
                    <Users className="w-12 h-12 mx-auto text-orange-300 mb-2" />
                    <p className="text-gray-600">Aucun contrevenant enregistré pour ce PV</p>
                  </div>
                )}

                {/* Photos liées é l'infraction */}
                <div className="bg-purple-50 border border-purple-200 p-5 rounded-lg">
                  <h3 className="text-lg font-bold text-purple-900 mb-4 flex items-center gap-2">
                    <ImageIcon className="w-5 h-5" />
                    Photos liées
                  </h3>
                  {(() => {
                    const photoInf = getInfractionPhotoSrc(selectedPV);
                    const photoQuit = getQuittancePhotoSrc(selectedPV);
                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {photoInf ? (
                          <button
                            onClick={async () => {
                              const infId = String(selectedPV.infraction?.id || selectedPV.id);
                              const url = `/api/infractions/infractions/${infId}/photo-infraction`;
                              try {
                                const res = await fetch(url, { credentials: 'include', headers: getAuthHeaders() });
                                if (res.ok) {
                                  const blob = await res.blob();
                                  const obj = URL.createObjectURL(blob);
                                  const tagged = blob.type && blob.type.startsWith('image/') ? (obj + '#img') : (obj + '#doc');
                                  handleOpenZoom(tagged, 'Photo de l\'infraction');
                                  return;
                                }
                              } catch {}
                              handleOpenZoom(window.location.origin + url, 'Photo de l\'infraction');
                            }}
                            className="w-full h-28 sm:h-32 md:h-36 rounded-lg overflow-hidden border-2 border-purple-300 hover:border-purple-500 transition-all cursor-pointer bg-white"
                            type="button"
                            title="Voir la photo de l'infraction"
                          >
                            {isPdfSrc(photoInf) ? (
                              <div className="w-full h-full flex items-center justify-center text-purple-700 bg-purple-50">
                                <FileText className="w-8 h-8" />
                              </div>
                            ) : (
                              <img
                                src={photoInf || undefined}
                                alt={'Photo de l\'infraction'}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  const img = e.currentTarget as HTMLImageElement;
                                  img.onerror = null;
                                  if (selectedPV?.id) {
                                    img.src = window.location.origin + `/api/infractions/infractions/${selectedPV.id}/photo-infraction`;
                                  }
                                }}
                              />
                            )}
                          </button>
                        ) : (
                          <div className="w-full h-28 sm:h-32 md:h-36 rounded-lg overflow-hidden border-2 border-dashed border-purple-300 bg-white flex items-center justify-center px-3 text-center">
                            <p className="text-xs sm:text-sm text-gray-500 font-medium">Aucune pièce jointe à l'infraction</p>
                          </div>
                        )}
                        {photoQuit ? (
                          <button
                            onClick={async () => {
                              const infId = String(selectedPV.infraction?.id || selectedPV.id);
                              const url = `/api/infractions/infractions/${infId}/photo-quittance`;
                              try {
                                const res = await fetch(url, { credentials: 'include', headers: getAuthHeaders() });
                                if (res.ok) {
                                  const blob = await res.blob();
                                  const obj = URL.createObjectURL(blob);
                                  const tagged = blob.type && blob.type.startsWith('image/') ? (obj + '#img') : (obj + '#doc');
                                  handleOpenZoom(tagged, 'Photo de la quittance');
                                  return;
                                }
                              } catch {}
                              handleOpenZoom(window.location.origin + url, 'Photo de la quittance');
                            }}
                            className="w-full h-28 sm:h-32 md:h-36 rounded-lg overflow-hidden border-2 border-green-300 hover:border-green-500 transition-all cursor-pointer bg-white"
                            type="button"
                            title="Voir la photo de la quittance"
                          >
                            {isPdfSrc(photoQuit) ? (
                              <div className="w-full h-full flex items-center justify-center text-green-700 bg-green-50">
                                <FileText className="w-8 h-8" />
                              </div>
                            ) : (
                              <img
                                src={photoQuit || undefined}
                                alt={'Photo de la quittance'}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  const img = e.currentTarget as HTMLImageElement;
                                  img.onerror = null;
                                  if (selectedPV?.id) {
                                    img.src = window.location.origin + `/api/infractions/infractions/${selectedPV.id}/photo-quittance`;
                                  }
                                }}
                              />
                            )}
                          </button>
                        ) : (
                          <div className="w-full h-28 sm:h-32 md:h-36 rounded-lg overflow-hidden border-2 border-dashed border-green-300 bg-white flex items-center justify-center px-3 text-center">
                            <p className="text-xs sm:text-sm text-gray-500 font-medium">Aucune pièce jointe à la quittance</p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Document PV */}
                <div className="bg-blue-50 border border-blue-200 p-5 rounded-lg">
                  <h3 className="text-lg font-bold text-blue-900 mb-4 flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Document du Procés-Verbal
                  </h3>
                  {selectedPV.pv?.fichier_pv || selectedPV.fichier_pv ? (
                    <div className="bg-white border border-blue-300 p-4 rounded-lg shadow-sm">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <div className="flex-shrink-0">
                          <div className="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center">
                            <FileText className="w-8 h-8 text-blue-600" />
                          </div>
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-gray-900 text-base">Procès-verbal officiel signé</p>
                          <p className="text-sm text-gray-600 mt-1">Document PDF attaché é l'enregistrement</p>
                          <p className="text-xs text-gray-500 mt-1">Format: PDF " Téléversé le {selectedPV.pv?.created_at ? new Date(selectedPV.pv.created_at).toLocaleDateString('fr-FR') : 'N/A'}</p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                          <button
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-sm"
                            onClick={() => openPvInModal(selectedPV)}
                            type="button"
                          >
                            <Eye className="w-4 h-4" />
                            Ouvrir le document
                          </button>
                          <button
                            className="border-2 border-blue-600 text-blue-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
                            onClick={() => window.open(`/api/infractions/pv/${selectedPV.pv?.id || selectedPV.id}/file?mode=download`, '_blank')}
                            type="button"
                          >
                            <Download className="w-4 h-4" />
                            Télécharger
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white border border-dashed border-gray-300 p-8 rounded-lg text-center">
                      <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                      <p className="text-gray-600 font-medium">Aucun document PV disponible</p>
                      <p className="text-sm text-gray-500 mt-1">Le fichier PDF n'a pas encore été téléversé</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Dialog Visualisation Photos et Documents */}
        <Dialog open={openViewPhotos} onOpenChange={setOpenViewPhotos}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>éxé Photos et Documents</DialogTitle>
            </DialogHeader>
            {selectedPhotos ? (
              <div className="space-y-4">
                {/* Debug info */}
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <h3 className="font-semibold text-blue-900 mb-2">Informations de l'infraction</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p><strong>ID:</strong> {selectedPhotos.id}</p>
                      <p><strong>Code:</strong> {selectedPhotos.code?.code || 'N/A'}</p>
                      <p><strong>Nature:</strong> {selectedPhotos.code?.nature || 'N/A'}</p>
                    </div>
                    <div>
                      <p><strong>Contrevenants:</strong> {selectedPhotos.contrevenants?.length || 0}</p>
                      <p><strong>Photo infraction:</strong> {selectedPhotos.photo_infraction ? 'Oui' : 'Non'}</p>
                      <p><strong>Photo quittance:</strong> {selectedPhotos.photo_quittance ? 'Oui' : 'Non'}</p>
                    </div>
                  </div>
                </div>
                {/* Photos de l'infraction */}
                <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                  <h3 className="text-lg font-semibold text-red-800 mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    Photos de l'infraction
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedPhotos.photo_infraction && (
                      <div className="bg-white p-4 rounded-lg border">
                        <h4 className="font-medium text-gray-900 mb-2">Photo de l'infraction</h4>
                        <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center">
                          <div className="text-center">
                            <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                            <p className="text-sm text-gray-500">Photo de l'infraction</p>
                            <button className="mt-2 px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700">
                              <Download className="w-4 h-4 inline mr-1" />
                              Télécharger
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    {selectedPhotos.photo_quittance && (
                      <div className="bg-white p-4 rounded-lg border">
                        <h4 className="font-medium text-gray-900 mb-2">Photo de la quittance</h4>
                        <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center">
                          <div className="text-center">
                            <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                            <p className="text-sm text-gray-500">Photo de la quittance</p>
                            <button className="mt-2 px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700">
                              <Download className="w-4 h-4 inline mr-1" />
                              Télécharger
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    {!selectedPhotos.photo_infraction && !selectedPhotos.photo_quittance && (
                      <div className="col-span-2 text-center py-8 text-gray-500">
                        <ImageIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                        <p>Aucune photo d'infraction ou de quittance disponible</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Photos des contrevenants */}
                {selectedPhotos.contrevenants && selectedPhotos.contrevenants.length > 0 && (
                  <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                    <h3 className="text-lg font-semibold text-orange-800 mb-4 flex items-center gap-2">
                      <Users className="w-5 h-5" />
                      Photos et Documents des Contrevenants
                    </h3>
                    <div className="space-y-6">
                      {selectedPhotos.contrevenants.map((contrevenant: any) => (
                        <div key={contrevenant.id} className="bg-white p-4 rounded-lg border">
                          <h4 className="font-semibold text-gray-900 mb-4 text-lg">
                            {contrevenant.nom} {contrevenant.prenom}
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* Photo du contrevenant */}
                            {contrevenant.photo && (
                              <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                                <h5 className="font-medium text-blue-800 mb-2 text-sm">Photo</h5>
                                <div className="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center">
                                  <div className="text-center">
                                    <ImageIcon className="w-8 h-8 text-gray-400 mx-auto mb-1" />
                                    <p className="text-xs text-gray-500">Photo</p>
                                    <button className="mt-1 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">
                                      <Download className="w-3 h-3 inline mr-1" />
                                      Télécharger
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Pièce d'identité */}
                            {contrevenant.piece_identite && (
                              <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                                <h5 className="font-medium text-green-800 mb-2 text-sm">Pièce d'identité</h5>
                                <div className="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center">
                                  <div className="text-center">
                                    <FileText className="w-8 h-8 text-gray-400 mx-auto mb-1" />
                                    <p className="text-xs text-gray-500">Pièce d'identité</p>
                                    <button className="mt-1 px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700">
                                      <Download className="w-3 h-3 inline mr-1" />
                                      Télécharger
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Données biométriques */}
                            {contrevenant.donnees_biometriques && (
                              <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                                <h5 className="font-medium text-yellow-800 mb-2 text-sm">Biométrie</h5>
                                <div className="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center">
                                  <div className="text-center">
                                    <FileText className="w-8 h-8 text-gray-400 mx-auto mb-1" />
                                    <p className="text-xs text-gray-500">Données biométriques</p>
                                    <button className="mt-1 px-2 py-1 bg-yellow-600 text-white rounded text-xs hover:bg-yellow-700">
                                      <Download className="w-3 h-3 inline mr-1" />
                                      Télécharger
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Informations du contrevenant */}
                          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                              <p><strong>Pièce d'identité:</strong> {contrevenant.numero_piece} ({contrevenant.type_piece})</p>
                              {contrevenant.filiation && <p><strong>Filiation:</strong> {contrevenant.filiation}</p>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Résumé des documents */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" />
                    Résumé des Documents
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600 mb-1">
                        {(selectedPhotos.photo_infraction ? 1 : 0) + (selectedPhotos.photo_quittance ? 1 : 0)}
                      </div>
                      <p className="text-sm text-gray-600">Photos infraction</p>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600 mb-1">
                        {selectedPhotos.contrevenants?.reduce((acc: number, c: any) =>
                          acc + (c.photo ? 1 : 0) + (c.piece_identite ? 1 : 0) + (c.donnees_biometriques ? 1 : 0), 0) || 0
                        }
                      </div>
                      <p className="text-sm text-gray-600">Documents contrevenants</p>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600 mb-1">
                        {selectedPhotos.contrevenants?.length || 0}
                      </div>
                      <p className="text-sm text-gray-600">Contrevenants</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <ImageIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p>Aucune infraction sélectionnée</p>
                <p className="text-sm">Sélectionnez une infraction pour voir ses photos et documents</p>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={!!pendingDeletion} onOpenChange={(open) => { if (!open) setPendingDeletion(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>
                {pendingDeletion?.type === 'contrevenant-association'
                  ? 'Confirmer la dissociation'
                  : 'Confirmer la suppression'}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-600">
              {pendingDeletion?.type === 'contrevenant-association' ? (
                <>Voulez-vous retirer l'association de&nbsp;
                  <span className="font-semibold text-gray-900">
                    {pendingDeletion.label || 'ce contrevenant'}
                  </span>
                  &nbsp;? Le contrevenant restera disponible dans la base.</>
              ) : (
                <>Êtes-vous sûr de vouloir supprimer&nbsp;
                  <span className="font-semibold text-gray-900">
                    {pendingDeletion?.label || 'cet élément'}
                  </span>
                  &nbsp;? Cette action est irréversible.</>
              )}
            </p>
            <DialogFooter className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded border"
                onClick={() => setPendingDeletion(null)}
                disabled={isDeleting}
              >
                Annuler
              </button>
              <button
                className="px-4 py-2 rounded bg-red-600 text-white disabled:opacity-60"
                onClick={confirmDeletion}
                disabled={isDeleting}
              >
                {isDeleting
                  ? (pendingDeletion?.type === 'contrevenant-association' ? 'Dissociation...' : 'Suppression...')
                  : (pendingDeletion?.type === 'contrevenant-association' ? 'Dissocier' : 'Supprimer')}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
  );
}

