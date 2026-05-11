  import MapComponent from '@/components/MapComponent';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/api';
import { loadRegionsGeoJSON } from '@/lib/geoData';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ArrowLeft,
  Camera,
  Loader,
  Navigation
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';

// Types
interface Species {
  id: string | number;
  name: string;
  scientificName?: string;
  category: 'water' | 'small' | 'large';
  emoji: string;
  image?: string;
  description?: string;
  habitat?: string;
  groupe?: string;
  taxable?: boolean;
  chassable?: boolean;
}

interface DBSpecies {
  id: number;
  nom: string;
  nom_scientifique?: string;
  groupe: string;
  statut_protection: string;
  chassable: boolean;
  taxable: boolean;
  quota?: number | null;
  cites_annexe?: string | null;
  photo_url?: string;
  photo_data?: string;
  photo_mime?: string;
  photo_name?: string;
}

type UserPermit = {
  id: number;
  permitNumber: string;
  type: string;
  status: string;
  categoryId?: string;
};

type PermitCategory = {
  id: number;
  key: string;
  labelFr: string;
  groupe: string;
  genre: string;
  sousCategorie?: string | null;
  defaultValidityDays?: number | null;
  maxRenewals: number;
  isActive: boolean;
};

export default function HuntingReports() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isGuide = user?.role === 'hunting-guide';
  const [, setLocation] = useLocation();
  const [selectedHunterId, setSelectedHunterId] = useState<number | null>(null);

  // Vérifier si le chasseur a des permis actifs
  const { data: hunterPermits = [] } = useQuery({
    queryKey: ['hunter-permits'],
    queryFn: async () => {
      if (user?.role !== 'hunter') return [];
      const response = await apiRequest('GET', '/api/permits/hunter/my-permits');
      const permits = Array.isArray(response) ? response : (response as any)?.data || [];
      console.log('[HuntingReports] Permis récupérés:', permits);
      return permits;
    },
    enabled: user?.role === 'hunter'
  });

  // Activités consolidées (déclarations+validées) du chasseur connecté (flux chasseur)
  const { data: myActivities = [] } = useQuery<any[]>({
    queryKey: ['/api/hunting-activities/hunter', user?.hunterId],
    enabled: !isGuide && !!user?.hunterId,
    queryFn: async () => {
      if (!user?.hunterId) return [];
      const res: any = await apiRequest('GET', `/api/hunting-activities/hunter/${user.hunterId}`);
      return Array.isArray(res) ? res : (res?.data ?? []);
    },
  });

  // Vérifier si le chasseur a des permis actifs (non expirés et non suspendus)
  const hasActivePermits = hunterPermits.some((permit: any) => {
    const isActive = permit.status === 'active';
    const isNotExpired = permit.expiryDate && new Date(permit.expiryDate) >= new Date();
    const result = isActive && isNotExpired;
    console.log(`[HuntingReports] Permis ${permit.permitNumber}: status=${permit.status}, expiryDate=${permit.expiryDate}, isActive=${isActive}, isNotExpired=${isNotExpired}, hasActivePermit=${result}`);
    return result;
  });

  console.log('[HuntingReports] hasActivePermits:', hasActivePermits, 'Total permis:', hunterPermits.length);


  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState('information');

  const [formData, setFormData] = useState({
    permitNumber: '',
    speciesId: '',
    sex: 'Mâle' as 'Mâle' | 'Femelle' | 'Inconnu',
    coordinates: '',
    location: '',
    quantity: 1,
    // Champs additionnels pour backend
    category: undefined as undefined | 'water' | 'small' | 'large',
    nom_espece: '' as string | undefined,
    nom_scientifique: '' as string | undefined,
  });

  const [selectedCategory, setSelectedCategory] = useState<'water' | 'small' | 'large'>('water');
  const [selectedSpecies, setSelectedSpecies] = useState<Species | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [dialogGpsCoords, setDialogGpsCoords] = useState<string | null>(null);
  const [geolocationStatus, setGeolocationStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [allowedCategories, setAllowedCategories] = useState<Array<'water' | 'small' | 'large'>>([]);
  const [permitCategories, setPermitCategories] = useState<PermitCategory[]>([]);
  const [availableSpecies, setAvailableSpecies] = useState<Species[]>([]);
  const [remainingBySpeciesId, setRemainingBySpeciesId] = useState<Record<string | number, number | undefined>>({});
  const [paidBySpeciesId, setPaidBySpeciesId] = useState<Record<string | number, boolean>>({});
  const [loadingSpecies, setLoadingSpecies] = useState(true);
  const [regionsGeoJSON, setRegionsGeoJSON] = useState<any | null>(null);
  const [regionStatuses, setRegionStatuses] = useState<any>({});
  // Espèce personnalisée
  const [isCustomSpecies, setIsCustomSpecies] = useState(false);
  const [customSpeciesName, setCustomSpeciesName] = useState('');
  const [customScientificName, setCustomScientificName] = useState('');
  // Saisie quantité en texte pour éviter le clamp immédiat qui bloque la saisie
  const [quantityInput, setQuantityInput] = useState<string>('1');

  // Fonction pour convertir le groupe DB en catégorie frontend
  const mapGroupeToCategory = (g: string | null | undefined): 'water' | 'small' | 'large' => {
    if (!g) return 'small';
    const norm = String(g).toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (norm === 'gibier_eau' || norm === 'gibier_d_eau') return 'water';
    if (norm === 'grande_chasse' || norm === 'grandechasse') return 'large';
    if (norm === 'petite_chasse' || norm === 'petitechasse') return 'small';
    return 'small';
  };

  // Normaliser la source d'image d'une espèce (data URL, base64 + mime, ou URL relative/absolue)
  const resolveSpeciesImage = (sp: DBSpecies): string | undefined => {
    try {
      const data = (sp?.photo_data ?? '').toString();
      const mime = (sp?.photo_mime ?? '').toString();
      const url = (sp?.photo_url ?? '').toString();

      if (data) {
        if (data.startsWith('data:')) return data; // déjà un data URL complet
        if (mime) return `data:${mime};base64,${data}`; // base64 sans préfixe -> le reconstruire
      }

      if (url) {
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
        const path = url.startsWith('/') ? url : `/${url}`;
        return `${window.location.origin}${path}`; // URL relative -> absolue
      }
    } catch {}
    return undefined; // pas d'image
  };

  // Charger les espèces chassables depuis la base de données
  useEffect(() => {
    (async () => {
      try {
        setLoadingSpecies(true);
        const resp = await apiRequest<{ok: boolean, data: DBSpecies[]}>('GET', '/api/settings/species/huntable');
        console.log('[HuntingReports] Réponse API espèces chassables:', resp);

        if (resp.ok && resp.data) {
          const serverResponse = resp.data as any;
          const speciesData = serverResponse?.data || [];

          // Convertir au format frontend (déjà chassables côté backend)
          const huntableSpecies: Species[] = speciesData
            .map((sp: DBSpecies) => ({
              id: sp.id,
              name: sp.nom,
              scientificName: sp.nom_scientifique,
              category: mapGroupeToCategory(sp.groupe),
              groupe: sp.groupe,
              emoji: '🦌', // Emoji par défaut
              image: resolveSpeciesImage(sp),
              taxable: sp.taxable,
              chassable: sp.chassable,
            }));

          setAvailableSpecies(huntableSpecies);
          console.log('[HuntingReports] Espèces chassables chargées:', huntableSpecies.length);
        } else {
          console.warn('Espèces non chargées:', resp.error);
          setAvailableSpecies([]);
        }
      } catch (err) {
        console.error('Erreur chargement espèces:', err);
        setAvailableSpecies([]);
      } finally {
        setLoadingSpecies(false);
      }
    })();
  }, []);

  // Charger les catégories de permis depuis le backend
  useEffect(() => {
    (async () => {
      try {
        const resp = await apiRequest<PermitCategory[]>('GET', '/api/permit-categories?activeOnly=true');
        if (resp.ok && resp.data) {
          setPermitCategories(resp.data);
          console.log('[HuntingReports] Catégories de permis chargées:', resp.data);
        } else {
          console.warn('Catégories de permis non chargées:', resp.error);
        }
      } catch (err) {
        console.error('Erreur chargement catégories de permis:', err);
      }
    })();
  }, []);

  // Charger les statuts des régions depuis le backend (après init des états)
  useEffect(() => {
    (async () => {
      try {
        const resp = await apiRequest<Record<string, { status: 'open' | 'partial' | 'closed' | 'unknown'; color?: string }>>('GET', '/api/statuses/regions');
        if (resp.ok) {
          setRegionStatuses(resp.data || {});
        } else {
          console.warn('Statuts régions non chargés (Reports):', resp.error);
        }
      } catch (err) {
        console.error('Erreur chargement statuts régions (Reports):', err);
      }
    })();
  }, []);
  // Camera capture (pour espèce non listée)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [hasCaptured, setHasCaptured] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  // Pour forcer l'affichage du viseur dès que l'utilisateur clique sur l'icône caméra (espèce listée)
  const [cameraRequested, setCameraRequested] = useState(false);
  // Affichage conditionnel des champs texte pour espèce non listée (un seul interrupteur)
  const [showCustomName, setShowCustomName] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      streamRef.current = null;
    }
    setIsCameraOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      console.log('Démarrage de la caméra...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      console.log('Stream obtenu:', stream);
      streamRef.current = stream;
      if (videoRef.current) {
        console.log('Attribution du stream au video element...');
        videoRef.current.srcObject = stream;

        // Attendre que les métadonnées soient chargées avant de jouer
        videoRef.current.onloadedmetadata = async () => {
          console.log('Métadonnées vidéo chargées');
          try {
            await videoRef.current!.play();
            console.log('Vidéo en cours de lecture');
            setIsCameraOn(true);
          } catch (playError) {
            console.error('Erreur lors de la lecture vidéo:', playError);
            setCameraError("Impossible de démarrer l'aperçu vidéo. Réessayez.");
          }
        };

        // Fallback si onloadedmetadata ne se déclenche pas
        setTimeout(() => {
          if (!isCameraOn && videoRef.current && videoRef.current.srcObject) {
            console.log('Tentative de lecture vidéo (fallback)');
            videoRef.current.play().then(() => {
              setIsCameraOn(true);
            }).catch(console.error);
          }
        }, 1000);
      }
    } catch (e: any) {
      console.error('Erreur accès caméra:', e);
      setCameraError("Impossible d'accéder à la caméra. Autorisez l'accès et réessayez.");
    }
  }, [isCameraOn]);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob: Blob | null) => {
      if (blob) {
        const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
        setPhotoFile(file);
        setHasCaptured(true);
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
          setCapturedDataUrl(dataUrl);
        } catch {}
        // On éteint la caméra après capture pour économiser la batterie
        stopCamera();
      }
    }, 'image/jpeg', 0.9);
  }, [stopCamera]);

  const retakePhoto = useCallback(() => {
    setHasCaptured(false);
    setPhotoFile(null);
    setCapturedDataUrl(null);
    startCamera();
  }, [startCamera]);

  // Démarrer automatiquement la caméra quand l'utilisateur choisit "espèce non listée"
  useEffect(() => {
    if (selectedSpecies && isCustomSpecies && !isCameraOn && !hasCaptured) {
      console.log('Auto-démarrage caméra pour espèce non listée');
      startCamera();
    }
  }, [selectedSpecies, isCustomSpecies, isCameraOn, hasCaptured, startCamera]);

  const arraysEqual = <T,>(a: T[], b: T[]) => a.length === b.length && a.every((v, i) => v === b[i]);

  const normalize = (s?: string) => (s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
  const namesMatch = (a?: string, b?: string) => {
    const na = normalize(a);
    const nb = normalize(b);
    if (!na || !nb) return false;
    return na === nb || na.includes(nb) || nb.includes(na);
  };

  // Charger les rapports (déclarations) de l'utilisateur pour calculer la consommation de taxes
  const { data: reports = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/hunting-reports', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const response = await apiRequest<any[]>('GET', `/hunting-reports?userId=${user.id}`);
      if (!response.ok) {
        console.error('Erreur chargement rapports:', response.error);
        return [];
      }
      return response.data || [];
    },
    enabled: !!user?.id,
  });

  const { data: userPermits = [], isLoading: permitsLoading } = useQuery<UserPermit[]>({
    queryKey: ['/api/permits/hunter/active', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const res: any = await apiRequest('GET', '/api/permits/hunter/active');
      const permits = Array.isArray(res) ? res : (res?.data ?? []);
      console.log('[Reports] userPermits chargés:', permits);
      return permits;
    },
    enabled: !!user && (user.role === 'hunter' || !!user.hunterId) && showForm && !isGuide,
  });

  // Flux guide: récupérer chasseurs associés puis leurs permis
  type GuideInfo = { id: number };
  type Assoc = { id: number; hunterId: number; hunter?: { firstName?: string; lastName?: string } };
  const { data: guideInfo } = useQuery<GuideInfo | undefined>({
    queryKey: ['/guides', user?.id],
    queryFn: async () => {
      if (!isGuide || !user?.id) return undefined as any;
      const res: any = await apiRequest('GET', `/api/guides/${user.id}`);
      return (res && res.id) ? (res as GuideInfo) : (res?.data as GuideInfo | undefined);
    },
    enabled: isGuide && !!user?.id,
  });
  const { data: associatedHunters = [] } = useQuery<Assoc[]>({
    queryKey: ['/guides', guideInfo?.id, 'hunters'],
    queryFn: async () => {
      const res: any = await apiRequest('GET', `/api/guides/${guideInfo?.id}/hunters`);
      return Array.isArray(res) ? res : (res?.data ?? []);
    },
    enabled: isGuide && !!guideInfo?.id,
  });
  const { data: permitsByHunter = {}, isLoading: loadingGuidePermits } = useQuery<Record<number, UserPermit[]>>({
    queryKey: ['/permits/by-hunters', associatedHunters.map(a => a.hunterId)],
    enabled: isGuide && associatedHunters.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        associatedHunters.map(async (a) => {
          try {
            const res: any = await apiRequest('GET', `/api/permits/hunter/${a.hunterId}`);
            const list = Array.isArray(res) ? res : (res?.data ?? []);
            return [a.hunterId, list] as const;
          } catch {
            return [a.hunterId, []] as const;
          }
        })
      );
      return Object.fromEntries(entries);
    },
    placeholderData: {},
  });
  // Flux guide: activités/déclarations du chasseur sélectionné (directes et par guides)
  const [hunterActivities, setHunterActivities] = useState<any[]>([]);
  const [hunterActivitiesLoading, setHunterActivitiesLoading] = useState(false);
  const [hunterActivitiesVersion, setHunterActivitiesVersion] = useState(0);

  useEffect(() => {
    if (!isGuide || !selectedHunterId) {
      setHunterActivities([]);
      return;
    }
    let cancelled = false;
    setHunterActivitiesLoading(true);
    (async () => {
      try {
        console.log('[Guide] Chargement activités pour hunterId:', selectedHunterId);
        const res: any = await apiRequest('GET', `/api/hunting-activities/hunter/${selectedHunterId}`);
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        if (!cancelled) {
          setHunterActivities(list);
          console.log('[Guide] Activités récupérées:', list?.length ?? 0);
        }
      } catch (error) {
        console.warn('[Guide] Échec chargement activités:', error);
        if (!cancelled) setHunterActivities([]);
      } finally {
        if (!cancelled) setHunterActivitiesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isGuide, selectedHunterId, hunterActivitiesVersion]);
  const nowTs = Date.now();
  const getActiveForHunter = (hid: number) => {
    const list = (permitsByHunter as any)[hid] as UserPermit[] | undefined;
    return Array.isArray(list) ? list.filter(p => String(p.status) === 'active') : [];
  };
  const eligibleHunters = (associatedHunters || []).filter(h => getActiveForHunter(h.hunterId).length > 0);
  const getActiveCount = (hid: number) => getActiveForHunter(hid).length;
  const eligibleHuntersSorted = [...eligibleHunters].sort((a, b) => getActiveCount(b.hunterId) - getActiveCount(a.hunterId));
  useEffect(() => {
    if (!isGuide || !showForm) return;
    if (!selectedHunterId && eligibleHuntersSorted.length > 0) {
      setSelectedHunterId(eligibleHuntersSorted[0].hunterId);
    } else if (selectedHunterId && !eligibleHuntersSorted.some(h => h.hunterId === selectedHunterId)) {
      setSelectedHunterId(null);
    }
  }, [isGuide, showForm, selectedHunterId, JSON.stringify(eligibleHuntersSorted.map(h => h.hunterId))]);

  const activePermits = useMemo(() => {
    if (isGuide) {
      return selectedHunterId ? getActiveForHunter(selectedHunterId) : [];
    }
    return (userPermits || []).filter(p => String(p.status) === 'active');
  }, [isGuide, selectedHunterId, userPermits, permitsByHunter]);

  useEffect(() => {
    if (!isGuide) return;
    const list = selectedHunterId ? getActiveForHunter(selectedHunterId) : [];
    if (!list || list.length === 0) {
      if (formData.permitNumber) {
        setFormData(prev => ({ ...prev, permitNumber: '' }));
      }
      return;
    }
    const belongsToHunter = list.some(p => p.permitNumber === formData.permitNumber);
    if (!belongsToHunter) {
      setFormData(prev => ({ ...prev, permitNumber: list[0].permitNumber }));
    }
  }, [isGuide, selectedHunterId, permitsByHunter]);

  const getCategoriesForPermitCategory = useCallback((categoryKey: string): Array<'water' | 'small' | 'large'> => {
    console.log('[getCategoriesForPermitCategory] Recherche pour categoryKey:', categoryKey);

    // Rechercher la catégorie dans la table permit_categories
    const category = permitCategories.find(c => c.key === categoryKey);

    if (category) {
      console.log('[getCategoriesForPermitCategory] Catégorie trouvée:', category);
      const groupe = category.groupe.toLowerCase();

      // Logique basée sur le groupe de la catégorie
      if (groupe.includes('gibier') && groupe.includes('eau')) {
        console.log('[getCategoriesForPermitCategory] → Gibier d\'eau uniquement');
        return ['water'];
      }
      if (groupe.includes('grande') && groupe.includes('chasse')) {
        console.log('[getCategoriesForPermitCategory] → Grande chasse (inclut petite chasse)');
        return ['large', 'small'];
      }
      if (groupe.includes('petite') && groupe.includes('chasse')) {
        console.log('[getCategoriesForPermitCategory] → Petite chasse uniquement');
        return ['small'];
      }
    }

    // Si la catégorie n'est pas trouvée ou le groupe n'est pas reconnu
    console.warn('[getCategoriesForPermitCategory] ⚠️ Catégorie non trouvée ou groupe non reconnu pour:', categoryKey);
    return [];
  }, [permitCategories]);

  useEffect(() => {
    if (activePermits.length > 0 && !formData.permitNumber) {
      setFormData(prev => ({ ...prev, permitNumber: activePermits[0].permitNumber }));
    }
  }, [activePermits]);

  useEffect(() => {
    if (!formData.permitNumber) {
      if (allowedCategories.length !== 0) setAllowedCategories([]);
      if (selectedSpecies) setSelectedSpecies(null);
      if (Object.keys(remainingBySpeciesId).length !== 0) setRemainingBySpeciesId({});
      if (Object.keys(paidBySpeciesId).length !== 0) setPaidBySpeciesId({});
    }
  }, [formData.permitNumber]);

  // Stabiliser les IDs d'espèces pour éviter les re-renders en boucle
  const speciesIds = useMemo(() => availableSpecies.map(s => s.id).join(','), [availableSpecies]);

  // Taxes du permis couramment sélectionné (cache via React Query)
  const { data: taxesList = [] } = useQuery<any[]>({
    queryKey: ['/api/taxes/by-permit', formData.permitNumber],
    enabled: !!formData.permitNumber,
    queryFn: async () => {
      const permitNumber = formData.permitNumber;
      const taxesResp: any = await apiRequest('GET', `/api/taxes?permitNumber=${encodeURIComponent(permitNumber)}`);
      return Array.isArray(taxesResp)
        ? taxesResp
        : (taxesResp?.data?.data ?? taxesResp?.data ?? []);
    },
    staleTime: 30000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (formData.permitNumber) {
      const selectedPermit = activePermits.find(p => p.permitNumber === formData.permitNumber);
      if (selectedPermit) {
        const newCategories = getCategoriesForPermitCategory(selectedPermit.categoryId || selectedPermit.type);
        if (!arraysEqual(allowedCategories, newCategories)) {
          setAllowedCategories(newCategories);
        }
        // Charger les taxes souscrites pour ce permis et calculer les crédits restants par espèce
        (async () => {
          try {
            const permitNumber = formData.permitNumber;
            if (!permitNumber) {
              console.log('[Reports] Pas de permit_number');
              setRemainingBySpeciesId({});
              setPaidBySpeciesId({});
              return;
            }
            console.log('[Reports] Taxes list length:', Array.isArray(taxesList) ? taxesList.length : 'n/a');
            console.log('[Reports] Taxes brutes:', taxesList);

            // Agréger les quantités achetées par NOM d'espèce (table taxes -> animalType)
            const totalByName: Record<string, number> = {};
            taxesList.forEach((t: any) => {
              const qty = Number(t.quantity || 0);
              if (!Number.isFinite(qty) || qty <= 0) return;
              const name = t.animalType || t.speciesName || t.species_name || t.nom || t.name;
              const key = normalize(name);
              if (key) {
                totalByName[key] = (totalByName[key] || 0) + qty;
                console.log(`[Reports] Taxe: animalType='${name}' (key='${key}'), quantity=${qty}, taxNumber=${t.taxNumber}`);
              }
            });
            console.log('[Reports] totalByName (taxes achetées) keys:', Object.keys(totalByName));

            // Compter les déclarations consommées par NOM d'espèce (déclarations + activités validées)
            const usedByName: Record<string, number> = {};
            const source = (isGuide && selectedHunterId)
              ? (hunterActivities || [])
              : (myActivities || []);
            source
              .filter((r: any) => (r.permitNumber || r.permit_number) === formData.permitNumber)
              // Compter 'approved', 'pending', 'activity' validée, et direct (status null/undefined)
              .filter((r: any) => {
                const raw = (r as any).status;
                const st = raw == null ? null : String(raw).toLowerCase();
                return st === 'approved' || st === 'pending' || st === null || !!(r as any).activity_number;
              })
              .forEach((r: any) => {
                const q = Number(r.quantity || 1);
                if (!Number.isFinite(q) || q <= 0) return;
                const key = normalize(r.speciesName || r.species_name);
                if (key) usedByName[key] = (usedByName[key] || 0) + q;
              });
            console.log('[Reports] usedByName (déclarations consommées) keys:', Object.keys(usedByName));

            // Calculer le restant par espèce disponible et marquer celles avec taxe achetée
            const mapRemaining: Record<string | number, number | undefined> = {};
            const mapPaid: Record<string | number, boolean> = {};
            availableSpecies.forEach(sp => {
              // Calcul par NOM: total acheté - total consommé
              let purchased = 0;
              let used = 0;
              // matcher par nom normalisé
              for (const [key, tot] of Object.entries(totalByName)) {
                if (namesMatch(key, sp.name)) purchased += Number(tot) || 0;
              }
              for (const [key, u] of Object.entries(usedByName)) {
                if (namesMatch(key, sp.name)) used += Number(u) || 0;
              }
              const remaining = Math.max(0, purchased - used);
              mapRemaining[sp.id] = remaining;
              mapPaid[sp.id] = purchased > 0;
              if (purchased > 0) {
                console.log(`[Reports] ${sp.name} - Acheté:${purchased}, Consommé:${used}, Restant:${remaining}`);
              }
            });

            setRemainingBySpeciesId(mapRemaining);
            setPaidBySpeciesId(mapPaid);
          } catch (e) {
            console.warn('Impossible de charger les taxes pour ce permis:', e);
            setRemainingBySpeciesId({});
            setPaidBySpeciesId({});
          }
        })();
      }
    }
  }, [formData.permitNumber, activePermits, getCategoriesForPermitCategory, speciesIds, isGuide, selectedHunterId, reports, hunterActivities, myActivities, taxesList]);

  useEffect(() => {
    if (allowedCategories.length > 0 && !allowedCategories.includes(selectedCategory)) {
      setSelectedCategory(allowedCategories[0]);
    }
  }, [allowedCategories]);


  useEffect(() => {
    (async () => {
      try {
        const geojsonData = await loadRegionsGeoJSON();
        setRegionsGeoJSON(geojsonData);

        if (geojsonData && geojsonData.features) {
          const statuses = geojsonData.features.reduce((acc: any, feature: any) => {
            if (feature.properties && feature.properties.nom) {
              acc[feature.properties.nom] = feature.properties.statut_chasse;
            }
            return acc;
          }, {});
          setRegionStatuses(statuses);
        }
      } catch (e) {
        console.error("Erreur chargement GeoJSON:", e);
      }
    })();
  }, []);



  const stats = useMemo(() => {
    const getQty = (r: any) => {
      const q = Number(r?.quantity ?? 1);
      return Number.isFinite(q) && q > 0 ? q : 1;
    };
    const total = (reports || []).reduce((sum: number, r: any) => sum + getQty(r), 0);
    const bySpecies: Record<string, number> = (reports || []).reduce((acc: Record<string, number>, r: any) => {
      const id = r?.speciesId || 'unknown';
      acc[id] = (acc[id] || 0) + getQty(r);
      return acc;
    }, {});
    const byMonth: Record<string, number> = (reports || []).reduce((acc: Record<string, number>, r: any) => {
      const month = format(new Date(r.date), 'MMMM', { locale: fr });
      acc[month] = (acc[month] || 0) + getQty(r);
      return acc;
    }, {});
    return { total, bySpecies, byMonth };
  }, [reports]);

  const alertsForMap = useMemo(() => {
    return (reports || [])
      .filter((r: any) => typeof r.lat === 'number' && typeof r.lon === 'number')
      .map((r: any) => ({
        id: r.id,
        title: r.speciesName || availableSpecies.find(s => s.id === r.speciesId)?.name || (r.speciesId === 'custom' ? 'Espèce inconnue' : (r.speciesId || 'Prélèvement')),
        message: r.location || 'Lieu de prélèvement',
        nature: 'prélèvement',
        region: null,
        departement: null,
        lat: r.lat,
        lon: r.lon,
        created_at: r.date,
        sender: undefined,
      }));
  }, [reports]);

  const submitReportMutation = useMutation({
    mutationFn: async (data: any) => {
      console.log('=== submitReportMutation.mutationFn ===');
      console.log('Data à envoyer:', data);
      const resp = await apiRequest<any>('POST', '/hunting-reports', data);
      if (!resp?.ok) {
        const msg = (resp && (resp as any).error) ? (resp as any).error : 'Erreur lors de la soumission';
        throw new Error(msg);
      }
      return resp;
    },
    onSuccess: async (response) => {
      console.log('✅ Succès mutation:', response);
      // Invalider les rapports (chasseur) et activités (guide)
      await queryClient.invalidateQueries({ queryKey: ['/api/hunting-reports', user?.id] });
      if (isGuide && selectedHunterId) {
        await queryClient.invalidateQueries({ queryKey: ['/api/hunting-activities/hunter', selectedHunterId] });
      } else if (!isGuide && user?.hunterId) {
        await queryClient.invalidateQueries({ queryKey: ['/api/hunting-activities/hunter', user.hunterId] });
      }
      toast({ title: 'Déclaration soumise avec succès' });
      setShowForm(false);
      // Forcer le recalcul immédiat des taxes restantes en réinitialisant le permitNumber
      const currentPermit = formData.permitNumber;
      setFormData(prev => ({ ...prev, permitNumber: '' }));
      setTimeout(() => setFormData(prev => ({ ...prev, permitNumber: currentPermit })), 50);
    },
    onError: (error: any) => {
      console.error('❌ Erreur mutation:', error);
      const desc = String(error?.message || 'Conflit: vérifiez quotas/taxes et validité du permis');
      toast({ title: 'Erreur', description: desc, variant: 'destructive' });
    },
  });

  // Soumission immédiate au clic "Confirmer l'espèce"
  const autoSubmitReport = async (payload: any, defaultImageUrl?: string) => {
    console.log('=== autoSubmitReport appelée ===');
    console.log('📦 Payload complet:', JSON.stringify(payload, null, 2));

    // Construire le payload avec les bonnes informations selon le rôle
    let basePayload: any = {
      ...payload,
      userId: user?.id,
      date: new Date().toISOString()
    };

    // Si c'est un guide qui fait la déclaration pour un chasseur
    if (isGuide && selectedHunterId) {
      basePayload = {
        ...basePayload,
        hunterId: selectedHunterId,  // ID du chasseur pour qui on déclare
        guideId: user?.id,          // ID du guide qui fait la déclaration
      };
      console.log('🎯 Déclaration par guide pour chasseur:', { hunterId: selectedHunterId, guideId: user?.id });
    } else if (!isGuide) {
      // Si c'est un chasseur qui fait sa propre déclaration
      basePayload = {
        ...basePayload,
        hunterId: user?.hunterId || user?.id,  // ID du chasseur
        guideId: null,                         // Pas de guide
      };
      console.log('🏹 Déclaration directe par chasseur:', { hunterId: user?.hunterId || user?.id });
    }

    console.log('📦 basePayload final:', JSON.stringify(basePayload, null, 2));
    console.log('📷 photoFile présent:', !!photoFile);
    console.log('🔢 Quantité dans payload:', basePayload.quantity);

    // Fonction utilitaire pour envoyer via FormData avec un fichier photo
    const sendWithPhoto = (file: File) => {
      const fd = new FormData();
      Object.entries(basePayload).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          console.log(`FormData ajout: ${k} = ${v}`);
          fd.append(k, String(v));
        }
      });
      fd.append('photo', file);
      console.log('Envoi avec FormData et photo');
      submitReportMutation.mutate(fd);
    };

    if (photoFile) {
      sendWithPhoto(photoFile);
    } else {
      // Si pas de photo fournie par l'utilisateur, essayer d'utiliser l'image par défaut de l'espèce
      if (defaultImageUrl) {
        try {
          console.log('Téléchargement de la photo par défaut:', defaultImageUrl);
          const res = await fetch(defaultImageUrl);
          const blob = await res.blob();
          const fallbackFile = new File([blob], 'species-default.jpg', { type: blob.type || 'image/jpeg' });
          sendWithPhoto(fallbackFile);
          return;
        } catch (e) {
          console.warn('Impossible de récupérer la photo par défaut, envoi sans photo.', e);
        }
      }
      console.log('Envoi sans photo');
      submitReportMutation.mutate(basePayload);
    }
  };

  const getDialogGeolocation = () => {
    if (!navigator.geolocation) {
      setGeolocationStatus('error');
      return toast({ title: 'Géolocalisation non supportée', variant: 'destructive' });
    }
    setGeolocationStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
        setDialogGpsCoords(coords);
        setGeolocationStatus('success');
        toast({ title: 'Position GPS capturée' });
      },
      () => {
        setGeolocationStatus('error');
        toast({ title: 'Erreur de géolocalisation', description: "Veuillez autoriser l'accès à votre position.", variant: 'destructive' });
      }
    );
  };

  const handleSpeciesSelect = (species: Species) => {
    setSelectedSpecies(species);
    setDialogGpsCoords(null);
    setGeolocationStatus('idle');
    // Réinitialiser la saisie quantité à la valeur actuelle du formulaire
    setQuantityInput(String(formData.quantity || 1));
    getDialogGeolocation();
  };

  const handleConfirmSpecies = async (sex: 'Mâle' | 'Femelle' | 'Inconnu') => {
    console.log('=== handleConfirmSpecies appelée ===');
    console.log('Sex:', sex);
    console.log('dialogGpsCoords:', dialogGpsCoords);
    console.log('formData.permitNumber:', formData.permitNumber);
    console.log('isCustomSpecies:', isCustomSpecies);
    console.log('customSpeciesName:', customSpeciesName);
    console.log('photoFile:', photoFile);
    console.log('hasCaptured:', hasCaptured);
    console.log('selectedSpecies:', selectedSpecies);
    console.log('formData:', formData);

    if (!dialogGpsCoords) {
      console.log('❌ GPS manquant');
      toast({ title: 'GPS requis', description: 'Autorisez la géolocalisation', variant: 'destructive' });
      return;
    }
    if (!formData.permitNumber) {
      console.log('❌ Permis manquant');
      toast({ title: 'Permis requis', description: 'Sélectionnez votre permis actif', variant: 'destructive' });
      return;
    }
    // Validation quantité (utiliser quantityInput pour prendre en compte la saisie en cours)
    const rawNum = parseInt((quantityInput || '').trim(), 10);
    const minQ = 1;
    const maxQ = selectedSpecies ? (remainingBySpeciesId[selectedSpecies.id] ?? Infinity) : Infinity;
    const validNum = Number.isFinite(rawNum) ? rawNum : 1;
    const q = Math.max(minQ, Math.min(Number.isFinite(maxQ) ? (maxQ as number) : Infinity, validNum));
    if (!Number.isFinite(q) || q <= 0) {
      toast({ title: 'Quantité invalide', description: 'Veuillez saisir une quantité supérieure à 0', variant: 'destructive' });
      return;
    }
    // Si espèce listée ET taxable, vérifier le restant de taxes disponibles
    if (!isCustomSpecies && selectedSpecies) {
      const isTaxable = (selectedSpecies as any).taxable !== false;
      if (isTaxable) {
        const remaining = remainingBySpeciesId[selectedSpecies.id] ?? undefined;
        if (remaining !== undefined && q > remaining) {
          toast({ title: 'Quantité dépassée', description: `Vous ne pouvez pas déclarer plus que les taxes restantes (${remaining}).`, variant: 'destructive' });
          return;
        }
      }
    }

    // Si espèce personnalisée, seule la photo est obligatoire (noms facultatifs)
    if (isCustomSpecies) {
      if (!photoFile) {
        console.log('❌ Photo manquante');
        toast({ title: 'Photo requise', description: 'Prenez une photo avec la caméra', variant: 'destructive' });
        return;
      }
      const payload = {
        ...formData,
        quantity: q,
        sex,
        speciesId: 'custom',
        coordinates: dialogGpsCoords,
        location: `GPS: ${dialogGpsCoords}`,
        category: selectedSpecies?.category || selectedCategory,
        nom_espece: customSpeciesName?.trim() ? customSpeciesName.trim() : undefined,
        nom_scientifique: customScientificName?.trim() ? customScientificName.trim() : undefined,
      };
      console.log('✅ Payload espèce personnalisée:', payload);
      await autoSubmitReport(payload);
    } else {
      if (!selectedSpecies) {
        console.log('❌ Espèce sélectionnée manquante');
        return;
      }
      const payload = {
        ...formData,
        quantity: q,
        sex,
        speciesId: selectedSpecies.id,
        coordinates: dialogGpsCoords,
        location: `GPS: ${dialogGpsCoords}`,
        category: selectedSpecies.category,
        nom_espece: selectedSpecies.name,
        nom_scientifique: selectedSpecies.scientificName,
      };
      console.log('✅ Payload espèce listée:', payload);
      await autoSubmitReport(payload, selectedSpecies.image);
    }

    // Nettoyage et fermeture du dialogue
    setSelectedSpecies(null);
    setIsCustomSpecies(false);
    setCustomSpeciesName('');
    setCustomScientificName('');
    setPhotoFile(null);
  };

  const StatsView = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3 md:gap-4 mb-3 sm:mb-4 md:mb-6">
      <Card className="p-2 sm:p-3"><CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4"><CardTitle className="text-xs sm:text-sm font-medium">Total prélèvements</CardTitle></CardHeader><CardContent className="p-2 sm:p-4 pt-0"><div className="text-lg sm:text-xl md:text-2xl font-bold">{stats.total}</div></CardContent></Card>
      <Card className="p-2 sm:p-3"><CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4"><CardTitle className="text-xs sm:text-sm font-medium">Espèce la plus chassée</CardTitle></CardHeader><CardContent className="p-2 sm:p-4 pt-0"><div className="text-sm sm:text-base md:text-xl font-bold break-words">{Object.keys(stats.bySpecies).length > 0 ? availableSpecies.find(s => s.id === Object.keys(stats.bySpecies).sort((a,b) => stats.bySpecies[b] - stats.bySpecies[a])[0])?.name : 'Aucune'}</div></CardContent></Card>
      <Card className="p-2 sm:p-3 sm:col-span-2 md:col-span-1"><CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4"><CardTitle className="text-xs sm:text-sm font-medium">Mois le plus actif</CardTitle></CardHeader><CardContent className="p-2 sm:p-4 pt-0"><div className="text-lg sm:text-xl md:text-2xl font-bold">{Object.keys(stats.byMonth).length > 0 ? Object.keys(stats.byMonth).sort((a,b) => stats.byMonth[b] - stats.byMonth[a])[0] : 'Aucun'}</div></CardContent></Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-100">
      <div className="container mx-auto max-w-4xl px-2 sm:px-4 py-4 sm:py-8">
        {/* Fil d'Ariane / Bouton de retour vers Carnet d'activités */}
        <div className="mb-3 sm:mb-4">

        </div>
        {!showForm ? (
          <div className="relative">
            <div className="w-full max-w-4xl mx-auto bg-gradient-to-br from-[#0b3d2e] to-[#14532d] rounded-lg shadow-2xl p-3 sm:p-6 relative overflow-hidden flex flex-col justify-center items-center font-serif text-white">
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(34,139,34,0.15) 2px, rgba(34,139,34,0.15) 4px), repeating-linear-gradient(-45deg, transparent, transparent 2px, rgba(34,139,34,0.15) 2px, rgba(34,139,34,0.15) 4px)` }}></div>
              <div className="absolute left-0 top-0 bottom-0 w-4 sm:w-8 bg-gradient-to-r from-emerald-900 to-emerald-800 shadow-inner">
                <div className="flex flex-col justify-evenly h-full px-0.5 sm:px-1">{[...Array(8)].map((_, i) => (<div key={i} className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-yellow-600 rounded-full shadow-inner mx-auto"></div>))}</div>
              </div>
              <div className="ml-6 sm:ml-12 relative z-10 text-center w-full px-2">
                <div className="w-full text-left mb-2 sm:mb-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLocation('/hunting-activities')}
                    className="bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200"
                  >
                    ← Retour aux Activités
                  </Button>
                </div>
                <h1 className="text-xl sm:text-3xl md:text-4xl font-bold text-emerald-100 mb-2 font-serif" style={{ textShadow: '2px 2px 4px rgba(1, 124, 57, 0.36)' }}>CARNET DE CHASSE</h1>
                                <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 mx-auto mb-3 sm:mb-6 bg-emerald-100 rounded-full flex items-center justify-center shadow-lg overflow-hidden">
                                  <img src="/images/logo_carnet.jpg" alt="Logo carnet" className="max-w-full h-auto object-contain" />
                                </div>
                <div className="text-emerald-200 text-sm sm:text-base md:text-lg font-serif mb-3 sm:mb-6"><p>{isGuide ? 'Guide de Chasse' : 'Chasseur'}: <span className="font-bold text-emerald-100">{user ? `${user.firstName} ${user.lastName}` : 'Non identifié'}</span></p></div>
                <Button onClick={() => setShowForm(true)} className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2 px-4 sm:py-3 sm:px-8 md:py-4 md:px-10 text-sm sm:text-base md:text-lg rounded-lg shadow-lg transform transition-all duration-200 hover:scale-105">📝 Nouveau prélèvement</Button>
              </div>
            </div>
            <div className="bg-emerald-50/70 rounded-lg shadow-xl p-2 sm:p-4 md:p-6 relative overflow-hidden mt-4">
              <div className="absolute left-0 top-0 bottom-0 w-4 sm:w-6 md:w-8 bg-gradient-to-r from-emerald-900 to-emerald-800 shadow-inner"><div className="flex flex-col justify-evenly h-full px-0.5 sm:px-1">{[...Array(8)].map((_, i) => (<div key={i} className="w-1 h-1 sm:w-1.5 sm:h-1.5 md:w-2 md:h-2 bg-yellow-600 rounded-full shadow-inner mx-auto"></div>))}</div></div>
              <div className="ml-5 sm:ml-8 md:ml-12">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-3 bg-amber-200/50 text-xs sm:text-sm">
                    <TabsTrigger value="information" className="px-1 sm:px-3">Information</TabsTrigger>
                    <TabsTrigger value="list" className="px-1 sm:px-3">Liste</TabsTrigger>
                    <TabsTrigger value="map" className="px-1 sm:px-3">Carte</TabsTrigger>
                  </TabsList>
                  <TabsContent value="list" className="space-y-4 sm:space-y-6 md:space-y-8">
                    <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-2 sm:p-3 md:p-4 shadow-md max-h-96 overflow-y-auto">
                      <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-amber-900 font-serif mb-2 sm:mb-3 border-b-2 border-amber-300 pb-2">📈 Statistiques</h2>
                      <div className="scale-75 sm:scale-90 -mt-2 sm:-mt-4 -mb-2 sm:-mb-4">
                        <StatsView />
                      </div>
                    </div>
              </TabsContent>

                  <TabsContent value="map">
                    <div className="bg-amber-50 border-2 border-amber-200 rounded-lg overflow-hidden w-full shadow-md" style={{
                      height: '400px',
                      maxHeight: '96vh'
                    }}>
                      <MapComponent
                        regionsGeoJSON={regionsGeoJSON}
                        departementsGeoJSON={null}
                        ecoZonesGeoJSON={null}
                        protectedZonesGeoJSON={null}
                        regionStatuses={regionStatuses || {}}
                        showRegions={true}
                        showZics={false}
                        showAmodiees={false}
                        showEcoZones={false}
                        showProtectedZones={false}
                        showRegionalAgents={false}
                        showDepartements={false}
                        colorizeRegionsByStatus={true}
                        selectedMarkerType={null}
                        onMarkerPlaced={() => {}}
                        onMarkerTypeSelected={() => {}}
                        alerts={alertsForMap}
                        minimal={false}
                        compactControls={true}
                        hideLegendForHunterGuide={true}
                        showHuntingReports={true}
                        huntingReports={[]}
                        userRole={user?.role || null}
                        userRegion={(user as any)?.region || null}
                        userDepartement={(user as any)?.departement || (user as any)?.zone || null}
                        enableHuntingReportsToggle={!!user && (user.role !== 'hunter')}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="information">
                    <div className="bg-white p-3 sm:p-4 md:p-6 rounded-lg shadow-md">
                      <h2 className="text-base sm:text-lg md:text-xl font-bold text-amber-900 mb-3 sm:mb-4">Informations importantes</h2>
                      <div className="space-y-3 sm:space-y-4">
                        <div className="p-2 sm:p-3 md:p-4 bg-amber-50 border-l-4 border-amber-500 rounded">
                          <h3 className="text-sm sm:text-base font-semibold text-amber-800">Règles de chasse</h3>
                          <p className="text-xs sm:text-sm text-amber-700 mt-1">
                            Consultez les réglementations en vigueur dans votre région avant toute activité de chasse.
                            Les périodes d'ouverture et les quotas sont stricts.
                          </p>
                        </div>

                        <div className="p-2 sm:p-3 md:p-4 bg-blue-50 border-l-4 border-blue-500 rounded">
                          <h3 className="text-sm sm:text-base font-semibold text-blue-800">Sécurité</h3>
                          <ul className="list-disc pl-4 sm:pl-5 text-xs sm:text-sm text-blue-700 space-y-1 mt-1">
                            <li>Portez un gilet de chasse haute visibilité</li>
                            <li>Vérifiez toujours votre matériel</li>
                            <li>Respectez les zones d'exclusion</li>
                          </ul>
                        </div>

                        <div className="p-2 sm:p-3 md:p-4 bg-green-50 border-l-4 border-green-500 rounded">
                          <h3 className="text-sm sm:text-base font-semibold text-green-800">Contacts utiles</h3>
                          <div className="text-xs sm:text-sm text-green-700 mt-1 space-y-2">
                            <p className="break-words">Service des Eaux et Forêts : <span className="font-medium">+221 33 831 01 01</span> / BP: 1831 Dakar-Hann</p>
                            <p className="break-words">Urgences : <span className="font-medium">18</span> (Sapeurs-Pompiers)</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-emerald-50/70 rounded-lg shadow-xl p-3 sm:p-4 md:p-8 relative">
            <div className="flex flex-col sm:flex-row items-start sm:items-center mb-4 sm:mb-6 gap-2 sm:gap-0"><Button variant="ghost" onClick={() => setShowForm(false)} className="sm:mr-4 bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs sm:text-sm"><ArrowLeft className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />Retour au carnet</Button><h1 className="text-xs sm:text-sm md:text-base font-bold text-amber-900 font-serif">📝 Nouvelle déclaration d'abattage</h1></div>
            <form onSubmit={(e) => e.preventDefault()} className="space-y-4 sm:space-y-6 md:space-y-8">
              <Card>
                <CardHeader className="p-3 sm:p-4 md:p-6">
                  <CardTitle className="text-base sm:text-lg md:text-xl">Permis de chasse</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Sélectionnez votre numéro de permis actif</CardDescription>
                </CardHeader>
                <CardContent className="p-3 sm:p-4 md:p-6">
                  <div className="max-w-md space-y-3 sm:space-y-4">
                    {isGuide && (
                      <div>
                        <Label htmlFor="hunterSelect">Chasseur associé</Label>
                        {loadingGuidePermits ? (
                          <p>Chargement…</p>
                        ) : eligibleHuntersSorted.length === 0 ? (
                          <p className="text-red-600">Aucun chasseur associé avec permis actif.</p>
                        ) : (
                          <Select value={selectedHunterId ? String(selectedHunterId) : ""} onValueChange={(v) => setSelectedHunterId(v ? parseInt(v) : null)}>
                            <SelectTrigger id="hunterSelect">
                              <SelectValue placeholder="Sélectionner un chasseur" />
                            </SelectTrigger>
                            <SelectContent>
                              {eligibleHuntersSorted.map((h) => (
                                <SelectItem key={h.id} value={String(h.hunterId)}>
                                  {(h.hunter?.firstName || '') + ' ' + (h.hunter?.lastName || '')} — {getActiveCount(h.hunterId)} permis actif{getActiveCount(h.hunterId) > 1 ? 's' : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}

                    <div>
                      <Label htmlFor="permitNumber">Numéro de permis</Label>
                      {permitsLoading || (isGuide && loadingGuidePermits) ? (
                        <p>Chargement...</p>
                      ) : (isGuide && !selectedHunterId) ? (
                        <p className="text-gray-600">Veuillez d'abord sélectionner un chasseur.</p>
                      ) : activePermits.length === 0 ? (
                        <p className="text-red-600">Aucun permis actif.</p>
                      ) : (
                        <Select value={formData.permitNumber} onValueChange={(value) => setFormData({ ...formData, permitNumber: value })}>
                          <SelectTrigger id="permitNumber">
                            <SelectValue placeholder="Sélectionner un permis" />
                          </SelectTrigger>
                          <SelectContent>
                            {activePermits.map(p => (
                              <SelectItem key={p.id} value={p.permitNumber}>{p.permitNumber} - {p.type}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 sm:p-4 md:pt-6">
                  <div>
                    <h2 className="text-base sm:text-xl md:text-2xl font-bold text-amber-900 font-serif mb-3 sm:mb-4 border-b-2 border-amber-300 pb-2">Sélectionnez une espèce</h2>
                    {loadingSpecies ? (
                      <div className="text-center bg-gray-100 p-3 sm:p-4 md:p-6 rounded-lg">
                        <Loader className="h-6 w-6 animate-spin mx-auto mb-2 text-amber-600" />
                        <p className="text-xs sm:text-sm text-gray-600">Chargement des espèces...</p>
                      </div>
                    ) : allowedCategories.length === 0 ? (
                      <div className="text-center bg-gray-100 p-3 sm:p-4 md:p-6 rounded-lg"><p className="text-xs sm:text-sm text-gray-600">Veuillez sélectionner un permis.</p></div>
                    ) : availableSpecies.length === 0 ? (
                      <div className="text-center bg-amber-100 p-3 sm:p-4 md:p-6 rounded-lg">
                        <p className="text-xs sm:text-sm text-amber-800">Aucune espèce chassable disponible. Veuillez contacter l'administrateur.</p>
                      </div>
                    ) : (
                      <Tabs value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as any)} className="w-full">
                        <TabsList className={`grid w-full bg-amber-200/50 text-xs sm:text-sm ${
                          allowedCategories.length === 1 ? 'grid-cols-1' :
                          allowedCategories.length === 2 ? 'grid-cols-2' :
                          'grid-cols-3'
                        }`}>
                          {allowedCategories.includes('water') && <TabsTrigger value="water" className="px-1 sm:px-3">Gibier d'eau</TabsTrigger>}
                          {allowedCategories.includes('small') && <TabsTrigger value="small" className="px-1 sm:px-3">Petite chasse</TabsTrigger>}
                          {allowedCategories.includes('large') && <TabsTrigger value="large" className="px-1 sm:px-3">Grande chasse</TabsTrigger>}
                        </TabsList>
                        {['water', 'small', 'large']
                          .filter(cat => allowedCategories.includes(cat as 'water' | 'small' | 'large'))
                          .map(cat => (
                          <TabsContent key={cat} value={cat}>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
                              {availableSpecies
                                .filter(s => s.category === cat)
                                .filter(s => {
                                  const isChassable = (s as any).chassable !== false;
                                  if (!isChassable) return false;
                                  // Afficher toutes les espèces chassables (taxables ou non)
                                  return true;
                                })
                                .map(s => {
                                const remaining = remainingBySpeciesId[s.id] ?? undefined;
                                const isChassable = (s as any).chassable !== false;
                                const isTaxable = (s as any).taxable !== false;
                                // Désactiver seulement si: non chassable OU (taxable ET taxes épuisées)
                                const disabled = !isChassable || (isTaxable && paidBySpeciesId[s.id] && remaining !== undefined && remaining <= 0);
                                return (
                                <Card key={s.id} className={`cursor-pointer transition-shadow duration-200 flex flex-col items-center text-center p-1.5 sm:p-2 ${disabled ? 'bg-gray-100 border-gray-200 opacity-60' : 'bg-amber-50 border-amber-200 hover:shadow-lg hover:border-amber-400'}`}
                                  onClick={() => {
                                    if (disabled) {
                                      // Message contextuel: non chassable ou taxes épuisées
                                      if (!isChassable) {
                                        toast({ title: "Espèce non chassable", description: "Cette espèce n'est pas autorisée à la chasse.", variant: 'destructive' });
                                      } else if (paidBySpeciesId[s.id] && remaining !== undefined && remaining <= 0) {
                                        toast({ title: "Taxes épuisées", description: "Le quota de cette espèce pour ce permis est épuisé.", variant: 'destructive' });
                                      }
                                      return;
                                    }
                                    handleSpeciesSelect(s);
                                  }}
                                >
                                  <img
                                    src={s.image || '/images/logo_carnet.jpg'}
                                    alt={s.name}
                                    loading="lazy"
                                    decoding="async"
                                    onError={(e) => {
                                      const img = e.currentTarget as HTMLImageElement;
                                      img.onerror = null;
                                      img.src = '/images/logo_carnet.jpg';
                                    }}
                                    className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 object-cover rounded-md mb-1 sm:mb-2"
                                  />
                                  <CardTitle className="text-xs sm:text-sm font-semibold text-amber-900 break-words">{s.name}</CardTitle>
                                  {paidBySpeciesId[s.id] && remaining !== undefined && (
                                    <div className={`mt-1 text-[10px] px-2 py-0.5 rounded-full ${remaining > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'}`}>
                                      {`Taxes restantes: ${remaining}`}
                                    </div>
                                  )}
                                </Card>
                              );})}
                              {/* Carte pour ajouter une espèce non présente */}
                              <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 flex flex-col items-center text-center p-1.5 sm:p-2 bg-white border-dashed border-2 border-amber-300 hover:border-amber-500" onClick={() => { setIsCustomSpecies(true); setSelectedSpecies({ id: 'custom', name: 'Espèce non listée', category: cat as any, emoji: '🦌' }); setDialogGpsCoords(null); setGeolocationStatus('idle'); getDialogGeolocation(); }}>
                                <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 flex items-center justify-center rounded-md mb-1 sm:mb-2 bg-amber-50 text-xl sm:text-2xl md:text-3xl">➕</div>
                                <CardTitle className="text-xs sm:text-sm font-semibold text-amber-900 break-words">Ajouter une espèce non listée</CardTitle>
                              </Card>
                            </div>
                          </TabsContent>
                        ))}
                      </Tabs>
                    )}
                  </div>
                </CardContent>
              </Card>
              <div className="flex justify-end gap-4"><Button type="button" variant="outline" onClick={() => setShowForm(false)}>Annuler</Button></div>
            </form>
          </div>
        )}
        {selectedSpecies && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4">
            {/* Overlay semi-transparent */}
            <div
              className="absolute inset-0 bg-black bg-opacity-50 z-[10000]"
              onClick={() => {
                setSelectedSpecies(null);
                setIsCustomSpecies(false);
                stopCamera();
                setHasCaptured(false);
                setPhotoFile(null);
                setCameraRequested(false);
              }}
            />
            {/* Contenu de la modal */}
            <div className="relative z-[10001] bg-white rounded-lg shadow-xl max-w-[520px] w-full max-h-[90vh] overflow-y-auto">
              <div className="p-3 sm:p-4 md:p-6">
                <div className="mb-3 sm:mb-4">
                  <h2 className="text-base sm:text-lg font-semibold">{isCustomSpecies ? 'Ajouter une espèce non listée' : selectedSpecies.name}</h2>
                  {!isCustomSpecies && (
                    <p className="text-xs sm:text-sm text-gray-600 mt-1">
                      <em>{selectedSpecies.scientificName}</em>{selectedSpecies.habitat ? ` - ${selectedSpecies.habitat}` : ''}
                    </p>
                  )}
                </div>
                {!isCustomSpecies && (
                  <div className="my-4 text-center relative">
                    {/* Si la caméra est demandée/active ou qu'une photo a été capturée, on remplace l'image par le flux/aperçu */}
                    {cameraRequested || isCameraOn || hasCaptured ? (
                      <div className="space-y-3">
                        {!hasCaptured ? (
                          <div className="relative">
                            <video
                              ref={videoRef}
                              className="w-full rounded-lg border-2 border-amber-300 max-h-80 object-cover bg-black"
                              playsInline
                              muted
                              autoPlay
                              style={{ display: 'block' }}
                            />
                            {!isCameraOn && (
                              <div className="w-full h-64 rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 flex flex-col items-center justify-center text-amber-700">
                                <div className="text-center">
                                  <div className="text-lg mb-2">📷 Caméra en cours d'activation...</div>
                                  <div className="text-sm">Autorisez l'accès à la caméra</div>
                                  <button type="button" className="mt-2 underline hover:no-underline" onClick={startCamera}>Réessayer</button>
                                </div>
                              </div>
                            )}
                            {isCameraOn && (
                              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
                                <Button
                                  className="bg-white hover:bg-gray-100 text-black border-2 border-gray-300 rounded-full w-16 h-16 p-0 shadow-lg"
                                  onClick={capturePhoto}
                                  type="button"
                                >
                                  📸
                                </Button>
                              </div>
                            )}
                            {/* Bouton pour annuler et revenir à l'image par défaut */}
                            <div className="absolute top-3 right-3">
                              <Button type="button" variant="secondary" size="sm" onClick={() => { setCameraRequested(false); setHasCaptured(false); setCapturedDataUrl(null); stopCamera(); }}>
                                Annuler
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative">
                            <img
                              src={capturedDataUrl || ''}
                              alt="Photo capturée"
                              className="w-full rounded-lg border-2 border-green-300 max-h-80 object-contain bg-black"
                            />
                            <div className="absolute top-2 right-2 bg-green-600 text-white px-2 py-1 rounded text-sm">
                              ✓ Capturée
                            </div>
                            <div className="absolute bottom-3 left-3">
                              <Button
                                variant="outline"
                                onClick={retakePhoto}
                                className="border-amber-600 text-amber-600 hover:bg-amber-50"
                              >
                                🔄 Reprendre
                              </Button>
                            </div>
                          </div>
                        )}
                        <canvas ref={canvasRef} className="hidden" />
                      </div>
                    ) : (
                      <>
                        <img
                          src={selectedSpecies.image}
                          alt={selectedSpecies.name}
                          className="w-full max-w-full h-56 object-contain rounded-lg mx-auto border-2 border-emerald-200 p-1 bg-white"
                        />
                        {/* Bouton icône appareil photo pour activer la caméra */}
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          className="absolute bottom-3 right-3 rounded-full shadow-md"
                          onClick={() => { setHasCaptured(false); setCapturedDataUrl(null); setCameraRequested(true); startCamera(); }}
                          title="Activer la caméra"
                        >
                          <Camera className="w-5 h-5" />
                        </Button>
                      </>
                    )}
                  </div>
                )}
                <div className="space-y-3 sm:space-y-4">
                  {/* Pour espèce non listée: placer la prise de photo tout en haut */}
                  {isCustomSpecies && (
                    <div>
                      <Label className="text-xs sm:text-sm">Photo (obligatoire, prise avec la caméra)</Label>
                      {cameraError && <p className="text-xs sm:text-sm text-red-600">{cameraError}</p>}
                      <div className="space-y-3">
                        {!hasCaptured ? (
                          // Mode aperçu caméra en direct
                          <div className="relative">
                            <video
                              ref={videoRef}
                              className="w-full rounded-lg border-2 border-amber-300 max-h-80 object-cover bg-black"
                              playsInline
                              muted
                              autoPlay
                              style={{ display: isCameraOn ? 'block' : 'none' }}
                            />
                            {!isCameraOn && (
                              <div className="w-full h-64 rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 flex flex-col items-center justify-center text-amber-700">
                                <div className="text-center">
                                  <div className="text-lg mb-2">📷 Caméra en cours d'activation...</div>
                                  <div className="text-sm">Autorisez l'accès à la caméra</div>
                                  <button type="button" className="mt-2 underline hover:no-underline" onClick={startCamera}>Réessayer</button>
                                </div>
                              </div>
                            )}
                            {isCameraOn && (
                              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
                                <Button
                                  className="bg-white hover:bg-gray-100 text-black border-2 border-gray-300 rounded-full w-16 h-16 p-0 shadow-lg"
                                  onClick={capturePhoto}
                                  type="button"
                                >
                                  📸
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : (
                          // Mode aperçu de la photo capturée
                          <div className="space-y-3">
                            <div className="relative">
                              <img
                                src={capturedDataUrl || ''}
                                alt="Photo capturée"
                                className="w-full rounded-lg border-2 border-green-300 max-h-80 object-contain bg-black"
                              />
                              <div className="absolute top-2 right-2 bg-green-600 text-white px-2 py-1 rounded text-sm">
                                ✓ Capturée
                              </div>
                            </div>
                            <div className="flex gap-3 justify-center">
                              <Button
                                variant="outline"
                                onClick={retakePhoto}
                                className="border-amber-600 text-amber-600 hover:bg-amber-50"
                              >
                                🔄 Reprendre
                              </Button>
                            </div>
                          </div>
                        )}
                        <canvas ref={canvasRef} className="hidden" />
                      </div>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs sm:text-sm">Sexe de l'animal</Label>
                    <RadioGroup defaultValue="Mâle" className="flex flex-col sm:flex-row gap-2 sm:gap-4" onValueChange={(v) => setFormData({...formData, sex: v as any})}>
                      <div className="flex items-center space-x-2"><RadioGroupItem value="Mâle" id="sex-male" /><Label htmlFor="sex-male" className="text-xs sm:text-sm">Mâle</Label></div>
                      <div className="flex items-center space-x-2"><RadioGroupItem value="Femelle" id="sex-female" /><Label htmlFor="sex-female" className="text-xs sm:text-sm">Femelle</Label></div>
                      <div className="flex items-center space-x-2"><RadioGroupItem value="Inconnu" id="sex-unknown" /><Label htmlFor="sex-unknown" className="text-xs sm:text-sm">Inconnu</Label></div>
                    </RadioGroup>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:gap-4">
                    <div>
                      <Label htmlFor="species-gps" className="text-xs sm:text-sm">GPS (lieu de prélèvement)</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="species-gps"
                          value={dialogGpsCoords || (geolocationStatus === 'loading' ? 'Acquisition...' : 'Erreur GPS')}
                          readOnly
                          className={`w-full sm:max-w-[260px] text-xs sm:text-sm ${geolocationStatus === 'error' ? 'border-red-500' : 'border-emerald-300'} bg-emerald-50 text-emerald-700 font-semibold`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={getDialogGeolocation}
                          disabled={geolocationStatus === 'loading'}
                          className="flex-shrink-0"
                        >
                          {geolocationStatus === 'loading' ? (
                            <Loader className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                          ) : (
                            <Navigation className="h-3 w-3 sm:h-4 sm:w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="species-quantity" className="text-xs sm:text-sm">Quantité</Label>
                      <Input
                        id="species-quantity"
                        type="number"
                        min={1}
                        step={1}
                        required
                        value={quantityInput}
                        onChange={(e) => {
                          console.log('🔵 Quantité changée:', e.target.value);
                          setQuantityInput(e.target.value);
                        }}
                        onBlur={() => {
                          const rawNum = parseInt((quantityInput || '').trim(), 10);
                          const min = 1;
                          // Pour espèces non taxables, pas de limite max
                          const isTaxable = selectedSpecies ? ((selectedSpecies as any).taxable !== false) : true;
                          const max = (selectedSpecies && isTaxable) ? (remainingBySpeciesId[selectedSpecies.id] ?? Infinity) : Infinity;
                          const valid = Number.isFinite(rawNum) ? rawNum : 1;
                          const clamped = Math.max(min, Math.min(Number.isFinite(max) ? (max as number) : Infinity, valid));
                          console.log('🔵 Quantité validée:', { rawNum, min, max, valid, clamped, isTaxable });
                          setQuantityInput(String(clamped));
                          setFormData({ ...formData, quantity: clamped });
                        }}
                        className="w-20 sm:max-w-[120px] bg-emerald-50 border-emerald-300 text-black font-bold text-base sm:text-lg text-center"
                      />
                    </div>
                    {isCustomSpecies && (
                      <>
                        <div className="flex items-center justify-between p-2 rounded border border-amber-200 bg-amber-50">
                          <Label htmlFor="toggle-custom-name" className="m-0 text-xs sm:text-sm">Renseigner le nom (facultatif)</Label>
                          <Switch id="toggle-custom-name" checked={showCustomName} onCheckedChange={setShowCustomName} />
                        </div>
                        {showCustomName && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-3">
                            <div>
                              <Input id="custom-name" value={customSpeciesName} onChange={(e) => setCustomSpeciesName(e.target.value)} placeholder="Ex: Espèce observée" className="text-xs sm:text-sm" />
                            </div>
                            <div>
                              <Input id="custom-sci" value={customScientificName} onChange={(e) => setCustomScientificName(e.target.value)} placeholder="Nom scientifique (facultatif)" className="text-xs sm:text-sm" />
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 p-3 sm:p-4 md:p-6 border-t">
                  <Button variant="outline" onClick={() => { setSelectedSpecies(null); setIsCustomSpecies(false); stopCamera(); setHasCaptured(false); setPhotoFile(null); setCameraRequested(false); setQuantityInput('1'); }} className="text-xs sm:text-sm">Annuler</Button>
                  <Button
                    onClick={() => {
                      console.log('🔵 Bouton Confirmer cliqué!');
                      console.log('État du bouton - dialogGpsCoords:', dialogGpsCoords);
                      console.log('État du bouton - isCustomSpecies:', isCustomSpecies);
                      console.log('État du bouton - hasCaptured:', hasCaptured);
                      console.log('État du bouton - disabled:', !dialogGpsCoords || (isCustomSpecies && !hasCaptured));
                      handleConfirmSpecies(formData.sex);
                    }}
                    disabled={!dialogGpsCoords || (isCustomSpecies && !hasCaptured)}
                    className="text-xs sm:text-sm"
                  >
                    {geolocationStatus === 'loading' ? 'Attente GPS...' : 'Confirmer l\'espèce'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
