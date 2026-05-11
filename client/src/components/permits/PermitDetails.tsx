import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiRequestBlob } from "@/lib/api";
import { departmentsByRegion, regionEnum } from "@/lib/constants";
import { useHunters } from "@/lib/hooks/useHunters";
import { usePermits } from "@/lib/hooks/usePermits";
import { Hunter } from "@/types/hunters";
import { Permit } from "@/types/permits";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addYears, format } from "date-fns";
import { fr } from "date-fns/locale";
import { Ban, MailQuestion, Printer, Repeat, ScrollText, Trash, User } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import PermitCard from "./PermitCard";

interface PermitDetailsProps {
  permitId?: number;
  open: boolean;
  onClose: () => void;
}

interface PermitResponse {
  id: number;
  hunterId: number;
  type: string;
  expiryDate: string;
  area: string;
  status: 'active' | 'suspended' | 'expired';
  createdAt: string;
  updatedAt: string;
}

interface MutationResponse {
  success: boolean;
  message?: string;
}

export default function PermitDetails({ permitId, open, onClose }: PermitDetailsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Read admin feature flag (local fallback) to allow agents to view any permit
  const AGENT_PERMIT_ACCESS_LOCAL_KEY = 'agentPermitAccess';
  const readLocalAgentPermitAccess = () => {
    try {
      if (typeof window === 'undefined') return false;
      const raw = localStorage.getItem(AGENT_PERMIT_ACCESS_LOCAL_KEY);
      return raw === 'true';
    } catch (e) { return false; }
  };
  const agentPermitAccessEnabled = readLocalAgentPermitAccess();

  // Fonction utilitaire pour formater les dates de manière sécurisée
  const formatSafeDate = (dateValue: any) => {
    if (!dateValue) return 'Non renseigné';
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return 'Date invalide';
    return format(date, 'dd/MM/yyyy', { locale: fr });
  };
  // Helper: expiration effective (priorité au calcul backend)
  const getEffectiveExpiry = (p?: any) => (p?.computedEffectiveExpiry || p?.expiryDate || null);

  // Définition des permissions basées sur le rôle
  const permissions = {
    // Renouveler (éditer) autorisé pour admin, agent régional et agent de secteur
    canEditPermit: user?.role === 'admin' || user?.role === 'agent' || user?.role === 'sub-agent',
    // Suppression réelle: admin et agent régional
    canDeletePermit: user?.role === 'admin' || user?.role === 'agent',
    // Suspension autorisée pour admin, agent régional et agent de secteur
    canSuspendPermit: user?.role === 'admin' || user?.role === 'agent' || user?.role === 'sub-agent'
  };

  const { allPermits: permits, isLoading: permitsLoading, error: permitsError } = usePermits();
  const { allHunters, huntersLoading, error: huntersError } = useHunters();

  const [permit, setPermit] = useState<Permit | null>(null);
  const [hunter, setHunter] = useState<Hunter | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenewing, setIsRenewing] = useState(false);
  const [isSuspending, setIsSuspending] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRenewConfirm, setShowRenewConfirm] = useState(false);
  // Champ pour le nouveau N° de quittance lors du renouvellement
  const [renewReceipt, setRenewReceipt] = useState<string>('');
  const [renewReceiptTouched, setRenewReceiptTouched] = useState<boolean>(false);
  const [showSuspendConfirm, setShowSuspendConfirm] = useState(false);
  const [showReactivateConfirm, setShowReactivateConfirm] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  // Boîte de dialogue explicative quand suppression interdite (403)
  const [showDeleteForbidden, setShowDeleteForbidden] = useState(false);
  const [deleteForbiddenMessage, setDeleteForbiddenMessage] = useState<string>('');

  // Éligibilité à la réactivation (backend)
  const [reactivationAllowed, setReactivationAllowed] = useState<boolean | null>(null);
  const [reactivationReason, setReactivationReason] = useState<string>('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [hunterPhotoUrl, setHunterPhotoUrl] = useState<string | null>(null);
  // Campagne et validité calculée (robuste)
  const [campaign, setCampaign] = useState<any | null>(null);
  const [validityDaysComputed, setValidityDaysComputed] = useState<number | undefined>(undefined);
  const [permitCategories, setPermitCategories] = useState<Array<any>>([]);
  const [campaignPeriods, setCampaignPeriods] = useState<Array<any>>([]);

  // Helpers to compute Lieu de service string
  // Date helpers: normalize to UTC midnight and inclusive day diff
  const toUtcMidnight = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const diffDaysInclusive = (start: Date, end: Date) => {
    const s = toUtcMidnight(start).getTime();
    const e = toUtcMidnight(end).getTime();
    const msPerDay = 1000 * 60 * 60 * 24;
    const raw = Math.floor((e - s) / msPerDay);
    return Math.max(0, raw + 1);
  };
  const normalize = (s: string) => s
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .toLowerCase();
  const toSlug = (s: string) => normalize(s).replace(/\s+/g, '-');
  const ucfirstWords = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
  const getRegionLabel = (raw: string) => {
    const trimmed = (raw || '').trim();
    if (!trimmed) return '';
    const byValue = regionEnum.find(r => r.value === trimmed)?.label;
    if (byValue) return byValue;
    const norm = normalize(trimmed).replace(/\s+/g, '');
    const byLabel = regionEnum.find(r => normalize(r.label).replace(/\s+/g, '') === norm)?.label;
    return byLabel || '';
  };
  const getSectorLabel = (regionRaw: string, zoneRaw: string) => {
    const regionKey = toSlug(regionRaw || '');
    const list = (departmentsByRegion as any)[regionKey] as Array<{ value: string; label: string }> | undefined;
    const zoneVal = (zoneRaw || '').toLowerCase();
    const found = list?.find(d => d.value === zoneVal);
    const label = found?.label?.replace(/^Secteur\s+/i, '');
    if (label) return label;
    const fallback = zoneVal ? ucfirstWords(zoneVal.replace(/-/g, ' ')) : '';
    return fallback;
  };
  const computeServiceLocation = (roleLike: string, regionRaw: string, zoneRaw: string, deptRaw?: string) => {
    const rl = (roleLike || '').toLowerCase();
    // Normalize role buckets
    const isRegional = rl.includes('region') || rl.includes('regional') || rl === 'agent' || rl.includes('admin-agent-regional');
    const isSector = rl.includes('secteur') || rl.includes('sector') || rl.includes('sub-agent') || rl.includes('subagent') || rl.includes('agent-secteur');
    // Admin national (DEFCCS)
    if (rl === 'admin') {
      return 'Service des Eaux et Forêts DEFCCS';
    }
    if (isRegional) {
      const reg = getRegionLabel(regionRaw);
      return reg ? `IREF/${reg}` : 'IREF';
    }
    if (isSector) {
      // Prefer explicit department if provided
      const dept = (deptRaw || '').trim();
      if (dept) {
        return `Secteur/${dept}`;
      }
      const reg = getRegionLabel(regionRaw);
      const sec = getSectorLabel(regionRaw, zoneRaw);
      const secPart = sec || 'Non défini';
      return `Secteur/${secPart}`;
    }
    // Fallback inference: if we have a zone, assume Secteur; else assume IREF/Region
    if ((deptRaw || '').trim() || (zoneRaw || '').trim()) {
      const dept = (deptRaw || '').trim();
      if (dept) return `Secteur/${dept}`;
      const sec = getSectorLabel(regionRaw, zoneRaw);
      const secPart = sec || 'Non défini';
      return `Secteur/${secPart}`;
    }
    const reg = getRegionLabel(regionRaw);
    return reg ? `IREF/${reg}` : 'IREF';
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!open || !permitId) {
        setLoading(false);
        return;
      }

      if (permitsLoading || huntersLoading) {
        setLoading(true);
        return;
      }

      let foundPermit = permits?.find((p: Permit) => p.id === permitId);
      // If not found in cache, attempt direct fetch (this allows agents to open permits outside their usual scope when admin enabled)
      if (!foundPermit) {
        try {
          const resp = await apiRequest<PermitResponse>('GET', `/api/permits/${permitId}`);
          if (resp?.ok && resp?.data) {
            foundPermit = resp.data as any as Permit;
          }
        } catch (e) {
          // ignore and fallback to error below
        }
      }

      if (!foundPermit) {
        if (!cancelled) {
          setError("Impossible de trouver le permis.");
          toast({
            title: "Erreur",
            description: "Impossible de charger les détails du permis.",
            variant: "destructive",
          });
          setLoading(false);
        }
        return;
      }

      if (cancelled) return;

      setPermit(foundPermit as any);
    // Résolution immédiate du chasseur pour éviter un rendu vide
    const fp = foundPermit as Permit;
    const localHunter = allHunters?.find((h: Hunter) => h.id === fp.hunterId) || null;
    const fallbackHunter: Hunter | any = localHunter || {
      id: fp.hunterId,
      firstName: (fp as any).hunterFirstName || '',
      lastName: (fp as any).hunterLastName || '',
      idNumber: (fp as any).hunterIdNumber || '',
      region: (fp as any).hunterRegion || '',
      departement: (fp as any).hunterDepartement || '',
      weaponBrand: (fp as any).weaponBrand || '',
      weaponCaliber: (fp as any).weaponCaliber || '',
    };
    setHunter(fallbackHunter as Hunter);
    // Raffiner en arrière-plan via l'API si besoin
    (async () => {
      try {
        if (!localHunter) {
          const resp = await apiRequest<Hunter>('GET', `/hunters/${foundPermit.hunterId}`);
          if ((resp as any)?.ok && (resp as any)?.data) {
            setHunter((resp as any).data as Hunter);
          }
        }
      } catch {}
    })();

    // Charger la campagne pour borne de validité (et dérogations éventuelles)
    (async () => {
      try {
        const resp = await apiRequest<any>('GET', '/api/settings/campaign');
        if (resp?.ok && resp?.data) {
          setCampaign(resp.data);
        } else {
          setCampaign(null);
        }
      } catch (_) {
        setCampaign(null);
      }
    })();

    // Charger la table Catégories (Tarifs des Permis) pour utiliser la clé (key) et la validité par défaut
    (async () => {
      try {
        // Aligner avec PermitForm: endpoint /api/permit-categories
        const resp = await apiRequest<any>('GET', '/api/permit-categories');
        if (resp?.ok && Array.isArray(resp?.data)) {
          setPermitCategories(resp.data);
        } else if (resp?.ok && resp?.data?.data && Array.isArray(resp.data.data)) {
          setPermitCategories(resp.data.data);
        } else {
          setPermitCategories([]);
        }
      } catch { setPermitCategories([]); }
    })();

    // Charger les périodes de campagne (hunting_campaign_periods)
    (async () => {
      const tryUrls = ['/api/settings/campaign-periods', '/api/hunting-campaign-periods'];
      for (const url of tryUrls) {
        try {
          const resp = await apiRequest<any>('GET', url);
          if (resp?.ok && Array.isArray(resp?.data)) { setCampaignPeriods(resp.data); return; }
          if (resp?.ok && resp?.data?.data && Array.isArray(resp.data.data)) { setCampaignPeriods(resp.data.data); return; }
        } catch { /* try next */ }
      }
      setCampaignPeriods([]);
    })();
    // Charger la photo du chasseur via fetch authentifié (JWT + cookies) et créer un blob URL
    (async () => {
      try {
        const res = await apiRequestBlob(`/attachments/${fallbackHunter.id}/hunterPhoto?inline=1`, 'GET');
        if (res.ok && res.blob) {
          const url = URL.createObjectURL(res.blob);
          setHunterPhotoUrl(url);
          // Libérer après 2 min
          setTimeout(() => URL.revokeObjectURL(url), 120_000);
        } else {
          setHunterPhotoUrl(null);
        }
      } catch (_) {
        setHunterPhotoUrl(null);
      }
    })();
    setError(null);

    // Charger la campagne pour borne de validité (et dérogations éventuelles)
    (async () => {
      try {
        const resp = await apiRequest<any>('GET', '/settings/campaign');
        if (resp?.ok && resp?.data) {
          setCampaign(resp.data);
        } else {
          setCampaign(null);
        }
      } catch (_) {
        setCampaign(null);
      }
    })();

    // Generate QR code with permit number and key info
    // Conformément à la demande: écrire uniquement le calibre (numérique) et la marque sur des lignes séparées
    const brandLine = (fallbackHunter as any).weaponBrand ? `\nMarque: ${(fallbackHunter as any).weaponBrand}` : '';
    const rawCaliber = ((fallbackHunter as any).weaponCaliber || '').toString();
    // Extraire la partie numérique principale du calibre (ex: "12/70", "7.62", "9mm" => "12/70", "7.62", "9")
    const caliberMatch = rawCaliber.match(/\d+(?:[\/.]\d+)?(?:\/\d+)?/);
    const normalizedCaliber = caliberMatch ? caliberMatch[0] : rawCaliber;
    const caliberLine = rawCaliber ? `\nCalibre: ${normalizedCaliber}` : '';

    // Build issuer display depending on role, with fallback to logged-in agent profile
    const fallbackType = (user?.type || '').toLowerCase();
    const fallbackRoleFromAppRole = (user?.role === 'agent') ? 'regional' : (user?.role === 'sub-agent' ? 'secteur' : '');
    const effRole = (foundPermit.issuerRole || fallbackType || fallbackRoleFromAppRole || '').toLowerCase();
    const region = (foundPermit.issuerRegion || user?.region || '').trim();
    const zone = (
      (foundPermit as any).issuerZone ||
      (user as any)?.zone ||
      ''
    ).trim();
    const dept = (
      (foundPermit as any).issuerDepartement ||
      (user as any)?.departement ||
      ''
    ).trim();
    const issuerInfo = computeServiceLocation(effRole, region, zone, dept);

    // Zone: supprimer si c'est explicitement "Sénégal" (ou "Senegal")
    const areaRaw = (foundPermit.area || '').toString().trim();
    const areaLc = areaRaw.toLowerCase();
    const isSenegal = areaLc === 'sénégal' || areaLc === 'senegal';
    const zoneLine = areaRaw && !isSenegal ? `Zone de chasse: ${areaRaw}` : '';

    // Construire les lignes de renouvellement pour le QR
    const renewals = Array.isArray((foundPermit.metadata as any)?.renewals)
      ? ((foundPermit.metadata as any).renewals as any[])
      : [];
    const renewalLines = renewals.length
      ? (`\nRenouvellements (${renewals.length}):` +
         renewals.map((r: any, idx: number) => {
           const d = r?.date ? new Date(r.date) : null;
           const dStr = d && !isNaN(d.getTime()) ? format(d, 'dd/MM/yyyy HH:mm', { locale: fr }) : String(r?.date || '');
           const who = r?.by ? `${r.by.firstName || ''} ${r.by.lastName || ''}`.trim() : '';
           const role = (r?.by?.role || '').toLowerCase();
           const rgn = (r?.by?.region || '').trim();
           const zn = (r?.by?.zone || '').trim();
           let issuerLike = '';
           issuerLike = computeServiceLocation(role, rgn, zn);
           const whoPart = who ? ` - Par: ${who}` : '';
           const issuerPart = issuerLike ? ` - ${issuerLike}` : '';
           return `\n  ${idx + 1}. ${dStr}${whoPart}${issuerPart}`;
         }).join(''))
      : '';

    const qrType = (foundPermit as any).categoryId && String((foundPermit as any).categoryId).trim().length > 0
      ? String((foundPermit as any).categoryId)
      : (foundPermit.type === 'petite-chasse' ? 'Petite Chasse' :
         foundPermit.type === 'grande-chasse' ? 'Grande Chasse' :
         foundPermit.type === 'gibier-eau' ? "Gibier d'Eau" :
         foundPermit.type);

    // Calcul de la validité en jours (colonne renvoyée par l'API ou fallback via dates)
    const msPerDay = 1000 * 60 * 60 * 24;
    const validityDaysForQR = ((): number | undefined => {
      // Priorité aux valeurs calculées dynamiquement par le backend
      const computedDays = (foundPermit as any)?.computedEffectiveValidityDays;
      if (typeof computedDays === 'number' && computedDays > 0) return computedDays;

      // Essayera d'être recalculé quand la campagne est connue, via state validityDaysComputed
      const direct = (foundPermit as any)?.validityDays;
      if (typeof direct === 'number' && direct > 0) return direct;
      if (typeof validityDaysComputed === 'number' && validityDaysComputed > 0) return validityDaysComputed;
      try {
        const issue = foundPermit.issueDate ? new Date(foundPermit.issueDate as any) : null;
        // Utiliser l'expiration calculée dynamiquement si fournie par le backend
        const expiryRaw = (foundPermit as any)?.computedEffectiveExpiry || foundPermit.expiryDate;
        const expiry = expiryRaw ? new Date(expiryRaw as any) : null;
        if (issue && expiry && !isNaN(issue.getTime()) && !isNaN(expiry.getTime())) {
          return diffDaysInclusive(issue, expiry);
        }
      } catch {}
      return undefined;
    })();

    // Déterminer l'expiration affichée avec priorité au champ calculé dynamiquement
    const effectiveExpiryForDisplay = (foundPermit as any)?.computedEffectiveExpiry || foundPermit.expiryDate;

    const qrData = `Numéro de Permis: ${foundPermit.permitNumber || ''}\n` +
      `Nom: ${(fallbackHunter as any).lastName || ''}\n` +
      `Prénom: ${(fallbackHunter as any).firstName || ''}\n` +
      `N° Pièce d'identité: ${(fallbackHunter as any)?.idNumber || ''}\n` +
      `Type de permis: ${qrType}\n` +
      `Date d'émission: ${formatSafeDate(foundPermit.issueDate)}\n` +
      `Date d'expiration: ${formatSafeDate(effectiveExpiryForDisplay)}\n` +
      `${typeof validityDaysForQR === 'number' && validityDaysForQR > 0 ? `Validité: ${validityDaysForQR} jours\n` : ''}` +
      `Prix: ${Number(foundPermit.price).toLocaleString()} FCFA\n` +
      `N° Quittance: ${foundPermit.receiptNumber || ''}\n` +
      `Émetteur: Service des Eaux et Forêts${effRole === 'admin' ? ' DEFCCS' : ''}\n` +
      `${issuerInfo && effRole !== 'admin' ? issuerInfo + "\n" : ''}` +
      `${zoneLine ? zoneLine : ''}${brandLine}${caliberLine}${renewalLines ? '\n' + renewalLines : ''}\n` +
      `Statut: ${foundPermit.status === 'active' ? 'Actif' :
        foundPermit.status === 'suspended' ? 'Suspendu' :
        foundPermit.status === 'expired' ? 'Expiré' : 'Inconnu'}`;

    QRCode.toDataURL(qrData)
      .then(async (url) => {
        try {
          // Dessiner le QR sur un canvas et superposer le logo au centre
          const qrImg = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
          });

          const size = 300; // taille standardisée pour la composition
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            setQrCodeUrl(url);
            return;
          }
          // Dessiner le QR
          ctx.drawImage(qrImg, 0, 0, size, size);

          // Charger le logo
          const logoUrl = '/logo_forets.png';
          const logoImg = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = logoUrl;
          });

          // Déterminer la taille du logo (plus petit, ~15% du QR)
          const logoScale = 0.15;
          const logoW = Math.floor(size * logoScale);
          const logoH = Math.floor(size * logoScale);
          const logoX = Math.floor((size - logoW) / 2);
          const logoY = Math.floor((size - logoH) / 2);

          // Dessiner le logo sans fond blanc pour conserver l'image originale
          ctx.drawImage(logoImg, logoX, logoY, logoW, logoH);

          const composedUrl = canvas.toDataURL('image/png');
          setQrCodeUrl(composedUrl);
        } catch (composeErr) {
          // En cas d'échec de la composition, on retombe sur le QR simple
          setQrCodeUrl(url);
        }
      })
      .catch(err => {
        console.error("Error generating QR code:", err);
        toast({
          title: "Erreur",
          description: "Impossible de générer le QR code.",
          variant: "destructive",
        });
      });

      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [permitId, open, permits, allHunters, permitsLoading, huntersLoading, toast]);

  // Helpers parsing: extraire durée depuis le type/label du permis
  const parseValidityDaysFromType = (typeStr: string | undefined | null): number | undefined => {
    const raw = (typeStr || '').toString().toLowerCase();
    if (!raw) return undefined;
    // Ex: "Touriste-1-Mois-Grande", "3-Jours", "7-Jours", "2-Semaines", "Saison"
    const mois = raw.match(/(\d+)\s*[- ]?mois/);
    if (mois) {
      const n = Number(mois[1]);
      if (!isNaN(n) && n > 0) return n * 30; // approximation mois=30 jours
    }
    const semaines = raw.match(/(\d+)\s*[- ]?semaines?/);
    if (semaines) {
      const n = Number(semaines[1]);
      if (!isNaN(n) && n > 0) return n * 7;
    }
    const jours = raw.match(/(\d+)\s*[- ]?jours?/);
    if (jours) {
      const n = Number(jours[1]);
      if (!isNaN(n) && n > 0) return n;
    }
    // "Saison" -> sera géré via dates de campagne
    if (/saison/.test(raw)) return undefined;
    return undefined;
  };

  // Détermine le groupe (grande/petite/gibier d'eau) à partir du type
  const inferGroupFromType = (typeOrCategory?: string): 'big' | 'small' | 'water' | undefined => {
    const s = (typeOrCategory || '').toString().toLowerCase();
    if (!s) return undefined;
    if (s.includes('grande')) return 'big';
    if (s.includes('gibier') || s.includes("eau") || s.includes('water')) return 'water';
    if (s.includes('petite')) return 'small';
    return undefined;
  };

  // Normalisation texte simple pour fallback par libellé
  const normalizeText = (s: string) => (s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  // Résout la catégorie en privilégiant la clé (categoryId ↔ permit_categories.key), puis fallback par libellé
  const findCategoryByPermit = (p?: Permit | null) => {
    if (!p) return null;
    const list = permitCategories || [];
    const keyFromPermit = String((p as any)?.categoryId || '').trim();
    if (keyFromPermit) {
      const byKey = list.find((c: any) => String(c?.key || c?.id || '')
        .trim()
        .toLowerCase() === keyFromPermit.toLowerCase());
      if (byKey) return byKey;
    }
    // Fallback par libellé (anciens enregistrements)
    const displayLabel = (() => {
      if ((p as any)?.categoryId && String((p as any).categoryId).trim().length > 0) return String((p as any).categoryId);
      if (p.type === 'petite-chasse') return 'Petite Chasse';
      if (p.type === 'grande-chasse') return 'Grande Chasse';
      if (p.type === 'gibier-eau') return "Gibier d'Eau";
      return String(p.type || '');
    })();
    const target = normalizeText(displayLabel);
    const exact = list.find((c: any) => normalizeText(c?.labelFr || c?.label || c?.name || '') === target);
    if (exact) return exact;
    const loose = list.find((c: any) => {
      const cand = [c?.labelFr, c?.label, c?.name, c?.key, c?.code]
        .map((x: any) => normalizeText(String(x || '')));
      return cand.includes(target);
    });
    return loose || null;
  };

  // Calculer et mémoriser la validité robuste quand permit/campaign sont prêts
  useEffect(() => {
    if (!permit) return;
    try {
      // 1) priorité au champ explicite
      const vd = (permit as any)?.validityDays;
      if (typeof vd === 'number' && vd > 0) {
        setValidityDaysComputed(vd);
        return;
      }

      // 2) prendre la validité par défaut depuis la catégorie (libellé officiel des Tarifs)
      const cat = findCategoryByPermit(permit) as any;
      const fromCategory = (cat?.defaultValidityDays ?? cat?.validityDays ?? undefined) as number | undefined;
      if (typeof fromCategory === 'number' && fromCategory > 0) {
        setValidityDaysComputed(fromCategory);
        // ne pas return; on peut encore borner par période/campagne via base = issue + fromCategory plus bas
      }

      // 2bis) si toujours rien, parser depuis le type/catégorie textuel
      const fromType = typeof fromCategory === 'number' && fromCategory > 0
        ? undefined
        : parseValidityDaysFromType((permit as any)?.categoryId || permit.type);
      if (typeof fromType === 'number' && fromType > 0) {
        setValidityDaysComputed(fromType);
        // idem, pas de return; on bornera plus bas
      }

      // 3) sinon, utiliser les dates + bornage période/campagne si disponible
      const issue = permit.issueDate ? new Date(permit.issueDate as any) : null;
      const expiry = permit.expiryDate ? new Date(permit.expiryDate as any) : null;
      const msPerDayLocal = 1000 * 60 * 60 * 24;
      // Dérogation: par groupe (priorité à la catégorie trouvée)
      const group = (() => {
        const g = (cat?.groupe || '').toString().toLowerCase();
        if (g.includes('grande')) return 'big';
        if (g.includes('gibier') || g.includes('eau')) return 'water';
        if (g.includes('petite')) return 'small';
        return inferGroupFromType((permit as any)?.categoryId || permit.type);
      })();
      const dero = (() => {
        const c = campaign || {};
        if (group === 'big') return !!(c.bigGameDerogation || c.bigGame_derogation);
        if (group === 'water') return !!(c.waterGameDerogation || c.waterGame_derogation);
        // petite chasse -> pas de flag spécifique, on se base sur campagne globale
        return !!(c.derogationEnabled || c.globalDerogation);
      })();

      // Bornage à la fin de période si définie, sinon fin de campagne; si dérogation, utiliser fin période dérogatoire
      const findPeriodForGroup = (): { end: Date | null } => {
        try {
          if (!campaignPeriods || !Array.isArray(campaignPeriods)) return { end: null };
          // match par groupe (grande_chasse/petite_chasse/gibier_eau) et éventuellement genre
          const grpKey = (cat?.groupe || '').toString().toLowerCase();
          const genKey = (cat?.genre || '').toString().toLowerCase();
          const candidates = campaignPeriods.filter((p: any) => {
            const pg = (p?.groupe || p?.group || '').toString().toLowerCase();
            const pgen = (p?.genre || '').toString().toLowerCase();
            const grpOk = grpKey ? pg === grpKey : true;
            const genOk = genKey ? (pgen ? pgen === genKey : true) : true;
            return grpOk && genOk;
          });
          if (!candidates.length) return { end: null };
          // on prend le premier pertinent; en cas de multiples, on peut choisir celui dont issueDate tombe dans [start,end]
          const chosen = (() => {
            if (!issue) return candidates[0];
            const inRange = candidates.find((p: any) => {
              const s = p?.startDate || p?.start_date; const e = p?.endDate || p?.end_date;
              const sd = s ? new Date(s) : null; const ed = e ? new Date(e) : null;
              return sd && ed && !isNaN(sd.getTime()) && !isNaN(ed.getTime()) && issue >= sd && issue <= ed;
            });
            return inRange || candidates[0];
          })();
          const deroEnabled = !!(chosen?.derogationEnabled || chosen?.derogation_enabled || chosen?.is_derogation || chosen?.derogation);
          const endStd = chosen?.endDate || chosen?.end_date;
          const endDer = chosen?.derogationEndDate || chosen?.derogation_end_date || chosen?.endDateDerogation;
          const endRaw = dero && deroEnabled ? (endDer || endStd) : endStd;
          const dt = endRaw ? new Date(endRaw) : null;
          return { end: dt && !isNaN(dt.getTime()) ? dt : null };
        } catch { return { end: null }; }
      };

      const periodEnd = findPeriodForGroup().end;
      const campaignEnd = (() => {
        const c = campaign || {};
        const d = c?.endDate || c?.end_date;
        const dt = d ? new Date(d) : null;
        return dt && !isNaN(dt.getTime()) ? dt : null;
      })();

      if (issue && !isNaN(issue.getTime())) {
        let effectiveExpiry: Date | null = expiry && !isNaN(expiry.getTime()) ? expiry : null;
        // Clamping par période prioritaire, sinon campagne
        const clampTarget = periodEnd || campaignEnd;
        if (clampTarget) {
          if (!effectiveExpiry || effectiveExpiry > clampTarget) effectiveExpiry = clampTarget;
        }
        // Si on dispose d'une base calculée via catégorie/fromType, l'utiliser pour base
        const baseDays = (typeof fromCategory === 'number' && fromCategory > 0)
          ? fromCategory
          : (typeof fromType === 'number' && fromType > 0 ? fromType : undefined);
        if (typeof baseDays === 'number' && baseDays > 0) {
          const baseExpiry = new Date(issue.getTime() + baseDays * msPerDayLocal);
          if (!effectiveExpiry || baseExpiry < effectiveExpiry) effectiveExpiry = baseExpiry;
        }
        if (effectiveExpiry) {
          const days = Math.max(0, Math.ceil((effectiveExpiry.getTime() - issue.getTime()) / msPerDayLocal));
          setValidityDaysComputed(days > 0 ? days : undefined);
          return;
        }
      }
      setValidityDaysComputed(undefined);
    } catch {
      setValidityDaysComputed(undefined);
    }
  }, [permit, campaign]);

  // Re-générer le QR si la date d'expiration/émission/statut ou la validité recalculée changent (ex: après renouvellement)
  useEffect(() => {
    try {
      if (!permit || !hunter) return;
      // Brand/Caliber lines from hunter info
      const brandLine = (hunter as any).weaponBrand ? `\nMarque: ${(hunter as any).weaponBrand}` : '';
      const rawCaliber = ((hunter as any).weaponCaliber || '').toString();
      const caliberMatch = rawCaliber.match(/\d+(?:[\/.]\d+)?(?:\/\d+)?/);
      const normalizedCaliber = caliberMatch ? caliberMatch[0] : rawCaliber;
      const caliberLine = rawCaliber ? `\nCalibre: ${normalizedCaliber}` : '';

      // Issuer info pour QR: préférer la dernière entrée de renouvellement (by.role/region/departement)
      const fallbackType = (user?.type || '').toLowerCase();
      const fallbackRoleFromAppRole = (user?.role === 'agent') ? 'regional' : (user?.role === 'sub-agent' ? 'secteur' : '');
      const renewalsForIssuer = Array.isArray((permit.metadata as any)?.renewals) ? ((permit.metadata as any).renewals as any[]) : [];
      const lastByForIssuer = renewalsForIssuer.length > 0 ? (renewalsForIssuer[renewalsForIssuer.length - 1]?.by || {}) : {};
      const lastRoleForIssuer = (lastByForIssuer.role || '').toLowerCase();
      const lastRegionForIssuer = (lastByForIssuer.region || '').toString().trim();
      const lastDeptForIssuer = (lastByForIssuer.departement || (lastByForIssuer as any).department || lastByForIssuer.zone || '').toString().trim();
      const effRole = (lastRoleForIssuer || permit.issuerRole || fallbackType || fallbackRoleFromAppRole || '').toLowerCase();
      const region = (lastRegionForIssuer || permit.issuerRegion || user?.region || '').trim();
      const zone = (
        lastDeptForIssuer ||
        (permit as any).issuerZone ||
        (user as any)?.zone ||
        ''
      ).trim();
      const dept = (
        lastDeptForIssuer ||
        (permit as any).issuerDepartement ||
        (user as any)?.departement ||
        ''
      ).trim();
      const issuerInfo = computeServiceLocation(effRole, region, zone, dept);

      // Zone de chasse
      const areaRaw = (permit.area || '').toString().trim();
      const areaLc = areaRaw.toLowerCase();
      const isSenegal = areaLc === 'sénégal' || areaLc === 'senegal';
      const zoneLine = areaRaw && !isSenegal ? `Zone de chasse: ${areaRaw}` : '';

      // Renouvellements
      const renewals = Array.isArray((permit.metadata as any)?.renewals)
        ? ((permit.metadata as any).renewals as any[])
        : [];
      const renewalLines = renewals.length
        ? (`\nRenouvellements (${renewals.length}):` +
           renewals.map((r: any, idx: number) => {
             const d = r?.date ? new Date(r.date) : null;
             const dStr = d && !isNaN(d.getTime()) ? format(d, 'dd/MM/yyyy HH:mm', { locale: fr }) : String(r?.date || '');
             const who = r?.by ? `${r.by.firstName || ''} ${r.by.lastName || ''}`.trim() : '';
             const role = (r?.by?.role || '').toLowerCase();
             const rgn = (r?.by?.region || '').trim();
             const zn = (r?.by?.zone || '').trim();
             const deptBy = (r?.by?.departement || (r as any)?.by?.department || '').trim();
             let issuerLike = computeServiceLocation(role, rgn, zn, deptBy);
             const whoPart = who ? ` - Par: ${who}` : '';
             const issuerPart = issuerLike ? ` - ${issuerLike}` : '';
             return `\n  ${idx + 1}. ${dStr}${whoPart}${issuerPart}`;
           }).join(''))
        : '';

      const qrType = (permit as any).categoryId && String((permit as any).categoryId).trim().length > 0
        ? String((permit as any).categoryId)
        : (permit.type === 'petite-chasse' ? 'Petite Chasse' :
           permit.type === 'grande-chasse' ? 'Grande Chasse' :
           permit.type === 'gibier-eau' ? "Gibier d'Eau" :
           permit.type);

      const validityPart = (typeof validityDaysComputed === 'number' && validityDaysComputed > 0)
        ? `Validité: ${validityDaysComputed} jours\n`
        : '';

      const qrData = `Numéro de Permis: ${permit.permitNumber || ''}\n` +
        `Nom: ${(hunter as any).lastName || ''}\n` +
        `Prénom: ${(hunter as any).firstName || ''}\n` +
        `N° Pièce d'identité: ${(hunter as any)?.idNumber || ''}\n` +
        `Type de permis: ${qrType}\n` +
        `Date d'émission: ${formatSafeDate(permit.issueDate)}\n` +
        `Date d'expiration: ${formatSafeDate(permit.expiryDate)}\n` +
        `${validityPart}` +
        `Prix: ${Number(permit.price).toLocaleString()} FCFA\n` +
        `N° Quittance: ${permit.receiptNumber || ''}\n` +
        `Émetteur: Service des Eaux et Forêts${effRole === 'admin' ? ' DEFCCS' : ''}\n` +
        `${issuerInfo && effRole !== 'admin' ? issuerInfo + "\n" : ''}` +
        `${zoneLine ? zoneLine : ''}${brandLine}${caliberLine}${renewalLines ? '\n' + renewalLines : ''}\n` +
        `Statut: ${permit.status === 'active' ? 'Actif' :
          permit.status === 'suspended' ? 'Suspendu' :
          permit.status === 'expired' ? 'Expiré' : 'Inconnu'}`;

      QRCode.toDataURL(qrData)
        .then(async (url) => {
          try {
            const qrImg = await new Promise<HTMLImageElement>((resolve, reject) => {
              const img = new Image();
              img.crossOrigin = 'anonymous';
              img.onload = () => resolve(img);
              img.onerror = reject;
              img.src = url;
            });
            const size = 300;
            const canvas = document.createElement('canvas');
            canvas.width = size; canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (!ctx) { setQrCodeUrl(url); return; }
            ctx.drawImage(qrImg, 0, 0, size, size);
            const logoUrl = '/logo_forets.png';
            const logoImg = await new Promise<HTMLImageElement>((resolve, reject) => {
              const img = new Image();
              img.crossOrigin = 'anonymous';
              img.onload = () => resolve(img);
              img.onerror = reject;
              img.src = logoUrl;
            });
            const logoScale = 0.15;
            const logoW = Math.floor(size * logoScale);
            const logoH = Math.floor(size * logoScale);
            const logoX = Math.floor((size - logoW) / 2);
            const logoY = Math.floor((size - logoH) / 2);
            ctx.drawImage(logoImg, logoX, logoY, logoW, logoH);
            setQrCodeUrl(canvas.toDataURL('image/png'));
          } catch {
            // fallback simple
            // eslint-disable-next-line no-console
            setQrCodeUrl(prev => prev); // conserve l'ancien en cas d'échec
          }
        })
        .catch(() => { /* ignore */ });
    } catch { /* ignore */ }
  }, [
    permit?.expiryDate,
    permit?.issueDate,
    permit?.status,
    validityDaysComputed,
    hunter?.id,
    Array.isArray((permit as any)?.metadata?.renewals) ? (permit as any).metadata.renewals.length : 0
  ]);

  // Charger l'éligibilité à la réactivation si le permis est suspendu
  useEffect(() => {
    const loadEligibility = async () => {
      try {
        if (!permit || permit.status !== 'suspended') {
          setReactivationAllowed(null);
          setReactivationReason('');
          return;
        }
        const resp = await apiRequest<{ allowed: boolean; reason?: string }>('GET', `/permits/${permit.id}/reactivation-eligibility`);
        if (resp.ok && resp.data) {
          setReactivationAllowed(!!resp.data.allowed);
          setReactivationReason(resp.data.reason || '');
        } else {
          setReactivationAllowed(false);
          setReactivationReason(resp.error || '');
        }
      } catch (e: any) {
        setReactivationAllowed(false);
        setReactivationReason(String(e?.message || ''));
      }
    };
    loadEligibility();
  }, [permit?.id, permit?.status, open]);

  const deletePermitMutation = useMutation<void, Error, number>({
    mutationFn: async (id: number) => {
      const response = await apiRequest<void>('DELETE', `/permits/${id}`);
      if (!response.ok) {
        throw new Error(response.error || 'Une erreur est survenue lors de la suppression du permis.');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/permits'] });
      queryClient.invalidateQueries({ queryKey: ['/api/taxes'] });
      setShowDeleteConfirm(false);
      setIsDeleting(false);
      onClose();
      toast({
        title: "Succès",
        description: "Le permis a été supprimé avec succès.",
      });
    },
    onError: (error: Error) => {
      setIsDeleting(false);
      // Message simple demandé par l'utilisateur
      const agentRegion = (user?.region || '').toString();
      const issuerRegion = ((permit as any)?.issuerRegion || '').toString();
      setDeleteForbiddenMessage(
        `Agent Régional de ${agentRegion || 'N/A'} : seul l'administrateur ou l'agent régional de l'émetteur (${issuerRegion || 'inconnu'}) peut supprimer ce permis.`
      );
      setShowDeleteForbidden(true);
    },
    onSettled: () => setIsDeleting(false),
  });

  const renewPermitMutation = useMutation<MutationResponse | any, Error, number>({
    mutationKey: ['renewPermit'],
    mutationFn: async (id: number) => {
      if (!permit) throw new Error("No permit data");
      // Calcul initial: +1 an
      let targetExpiry = addYears(new Date(permit.expiryDate), 1);
      // Récupérer la fin de campagne et borner la date d'expiration
      try {
        const resp = await fetch('/api/settings/campaign');
        if (resp.ok) {
          const campaign = await resp.json();
          const end = campaign?.endDate ? new Date(campaign.endDate) : null;
          if (end && !isNaN(end.getTime()) && targetExpiry > end) {
            targetExpiry = end;
          }
        }
      } catch (_) {
        // En cas d'échec, continuer avec +1 an
      }
      // Construire la nouvelle metadata avec l'historique de renouvellement
      const currentMeta: any = permit.metadata && typeof permit.metadata === 'object' ? { ...permit.metadata } : {};
      const list: any[] = Array.isArray(currentMeta.renewals) ? [...currentMeta.renewals] : [];
      const renewalEntry = {
        date: new Date().toISOString(),
        by: {
          id: user?.id,
          username: user?.username,
          firstName: user?.firstName,
          lastName: user?.lastName,
          role: (user?.role === 'agent') ? 'regional' : (user?.role === 'sub-agent' ? 'secteur' : (user?.role || '')),
          region: user?.region,
          zone: user?.zone,
        }
      };
      list.push(renewalEntry);
      const nextMeta = { ...currentMeta, renewCount: list.length, renewals: list };

      // Valider la quittance (obligatoire côté backend aussi)
      const rx = /^[0-9]{7}\/[0-9]{2} [A-Z]{2}$/;
      if (!rx.test(renewReceipt)) {
        throw new Error('Veuillez saisir un N° de quittance valide (ex: 1234567/24 AB)');
      }

      const response = await apiRequest<MutationResponse | any>(
        "POST",
        `/permits/${id}/renew`,
        { receiptNumber: renewReceipt }
      );
      if (!response.ok) {
        const msg = (response as any)?.error || (response as any)?.data?.message || "Échec du renouvellement du permis";
        throw new Error(msg);
      }
      return response.data as any;
    },
    onSuccess: (data) => {
      // Best-effort extraction of updated permit from server response (Drizzle returns an array)
      const updated = Array.isArray(data) ? (data[0] || null) : (data && typeof data === 'object' ? data : null);
      // Invalidate permits list and specific permit detail
      queryClient.invalidateQueries({ queryKey: ['/api/permits'] });
      if (permit?.id) {
        queryClient.invalidateQueries({ queryKey: [`/api/permits/${permit.id}`] });
        // Optimistically update cached detail if present
        try {
          queryClient.setQueryData([`/api/permits/${permit.id}`], (prev: any) => {
            const nextExpiry = updated?.expiryDate || (permit?.expiryDate ? addYears(new Date(permit.expiryDate), 1).toISOString() : undefined);
            const nextIssue = updated?.issueDate || new Date().toISOString().split('T')[0];
            const nextValidity = typeof (updated as any)?.validityDays === 'number' ? (updated as any).validityDays : (prev?.validityDays ?? (permit as any)?.validityDays);
            return {
              ...(prev || permit || {}),
              ...(updated || {}),
              expiryDate: nextExpiry || (updated?.expiryDate ?? prev?.expiryDate),
              issueDate: nextIssue || (updated?.issueDate ?? prev?.issueDate),
              validityDays: nextValidity,
              status: 'active',
            };
          });
        } catch (_) { /* noop */ }
      }
      // Also refresh local state quickly if modal remains open
      if (permit) {
        setPermit({
          ...permit,
          expiryDate: (updated?.expiryDate as any) || addYears(new Date(permit.expiryDate), 1).toISOString(),
          issueDate: (updated?.issueDate as any) || new Date().toISOString().split('T')[0],
          validityDays: typeof (updated as any)?.validityDays === 'number' ? (updated as any).validityDays : (permit as any)?.validityDays,
          status: 'active',
          metadata: (updated?.metadata as any) || (permit.metadata as any),
          receiptNumber: (updated as any)?.receiptNumber || permit.receiptNumber || (renewReceipt || ''),
        } as any);
      }
      toast({
        title: 'Succès',
        description: 'Le permis a été renouvelé avec succès',
      });
      setShowRenewConfirm(false);
      setRenewReceipt('');
      setRenewReceiptTouched(false);
    },
    onError: (error: Error) => {
      setIsRenewing(false);
      toast({
        title: 'Renouvellement impossible',
        description: error.message || 'Échec du renouvellement du permis',
        variant: 'destructive',
      });
      setShowRenewConfirm(false);
    },
    onSettled: () => setIsRenewing(false),
  });

  const suspendPermitMutation = useMutation<Permit, Error, number>({
    mutationKey: ['suspendPermit'],
    mutationFn: async (id: number) => {
      const response = await apiRequest<Permit>('PATCH', `/permits/${id}/suspend`);
      if (!response.ok) {
        throw new Error(response.error || 'Une erreur est survenue lors de la suspension du permis.');
      }
      const data = response.data;
      if (!data) {
        throw new Error('No permit data returned');
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/permits'] });
      toast({
        title: "Succès",
        description: "Le permis a été suspendu avec succès.",
      });
      setShowSuspendConfirm(false);
      onClose();
    },
    onError: (error: Error) => {
      setIsSuspending(false);
      toast({
        title: "Erreur",
        description: error.message || "Impossible de suspendre le permis.",
        variant: "destructive",
      });
    },
    onSettled: () => setIsSuspending(false),
  });

  const reactivatePermitMutation = useMutation<Permit, Error, number>({
    mutationKey: ['reactivatePermit'],
    mutationFn: async (id: number) => {
      const response = await apiRequest<Permit>('PATCH', `/permits/${id}/suspend`);
      if (!response.ok) {
        throw new Error(response.error || "Une erreur est survenue lors de la réactivation du permis.");
      }
      const data = response.data;
      if (!data) {
        throw new Error('No permit data returned');
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/permits'] });
      toast({
        title: "Succès",
        description: "Le permis a été réactivé avec succès.",
      });
      setShowReactivateConfirm(false);
      onClose();
    },
    onError: (error: Error) => {
      setIsReactivating(false);
      toast({
        title: "Réactivation refusée",
        description: error.message || "Impossible de réactiver le permis. Vous n'êtes pas autorisé ou les conditions ne sont pas réunies.",
        variant: "destructive",
      });
    },
    onSettled: () => setIsReactivating(false),
  });

  const handleDelete = () => {
    if (!permit) return;
    setIsDeleting(true);
    deletePermitMutation.mutate(permit.id);
    setShowDeleteConfirm(false);
  };

  const handleRenew = () => {
    if (!permit) return;
    const count = Array.isArray((permit.metadata as any)?.renewals) ? (permit.metadata as any).renewals.length : 0;
    if (count >= 2) {
      toast({
        title: 'Limite atteinte',
        description: 'Ce permis a déjà été renouvelé 2 fois.',
        variant: 'destructive',
      });
      setShowRenewConfirm(false);
      setIsRenewing(false);
      return;
    }
    // Vérifier le N° de quittance saisi
    const rx = /^[0-9]{7}\/[0-9]{2} [A-Z]{2}$/;
    if (!rx.test(renewReceipt)) {
      setRenewReceiptTouched(true);
      toast({ title: 'Quittance requise', description: 'Veuillez saisir un N° de quittance valide (ex: 1234567/24 AB)', variant: 'destructive' });
      return;
    }
    setIsRenewing(true);
    renewPermitMutation.mutate(permit.id);
  };

  const handleSuspend = () => {
    if (!permit) return;
    setIsSuspending(true);
    suspendPermitMutation.mutate(permit.id);
    setShowSuspendConfirm(false);
  };

  const handleReactivate = () => {
    if (!permit) return;
    setIsReactivating(true);
    reactivatePermitMutation.mutate(permit.id);
    setShowReactivateConfirm(false);
  };

  const handlePrint = () => {
    window.print();
  };

  const handlePrintReceipt = () => {
    if (!permit || !hunter) return;
    // Recompute issuer info to use in the receipt
    const renewals = Array.isArray((permit as any)?.metadata?.renewals) ? ((permit as any).metadata.renewals as any[]) : [];
    const lastRenewalBy = renewals.length > 0 ? (renewals[renewals.length - 1]?.by || {}) : {};
    const lastRole = (lastRenewalBy.role || '').toLowerCase();
    const lastRegion = (lastRenewalBy.region || '').toString().trim();
    const lastDept = (lastRenewalBy.departement || (lastRenewalBy.department) || lastRenewalBy.zone || '').toString().trim();
    const fallbackType = (user?.type || '').toLowerCase();
    const fallbackRoleFromAppRole = (user?.role === 'agent') ? 'regional' : (user?.role === 'sub-agent' ? 'secteur' : '');
    const effRole = (lastRole || permit.issuerRole || fallbackType || fallbackRoleFromAppRole || '').toLowerCase();
    const region = (lastRegion || permit.issuerRegion || user?.region || '').trim();
    const zone = (
      (lastDept) ||
      (permit as any).issuerZone ||
      (user as any)?.zone ||
      ''
    ).trim();
    const dept = (
      (lastDept) ||
      (permit as any).issuerDepartement ||
      (user as any)?.departement ||
      ''
    ).trim();
    const issuerInfo = computeServiceLocation(effRole, region, zone, dept);

    // Build lines similar to the model
    const priceLine = `${Number(permit.price).toLocaleString()} FCFA`;
    const receiptNumber = permit.receiptNumber || '';
    const receiptDigits = (receiptNumber || '').toString().replace(/\D/g, '');

    // Build HTML for receipt preview (58/80mm) matching the reference design
    const printedAt = `${format(new Date(), "dd/MM/yyyy HH:mm", { locale: fr })}`;
    const issueAt = permit.issueDate ? `${format(new Date(permit.issueDate), "dd/MM/yyyy", { locale: fr })}` : '';
    const effExpiry = getEffectiveExpiry(permit);
    const expiryAt = effExpiry ? `${format(new Date(effExpiry), "dd/MM/yyyy", { locale: fr })}` : '';
    // Calcul de la validité et insertion au-dessus de la ligne Expire le
    const validityDaysLocal = (() => {
      const vd = (permit as any)?.validityDays;
      if (typeof vd === 'number' && vd > 0) return vd;
      try {
        const issue = permit.issueDate ? new Date(permit.issueDate as any) : null;
        const expiry = permit.expiryDate ? new Date(permit.expiryDate as any) : null;
        const msPerDayLocal = 1000 * 60 * 60 * 24;
        if (issue && expiry && !isNaN(issue.getTime()) && !isNaN(expiry.getTime())) {
          return Math.max(0, Math.ceil((expiry.getTime() - issue.getTime()) / msPerDayLocal));
        }
      } catch {}
      return undefined;
    })();
    // Footer service line like: "Service des Eaux et Forêts IREF/Kolda" ou "Service des Eaux et Forêts DEFCCS"
    const footerTrail = issuerInfo;
    const footerRowHtml = effRole === 'admin'
      ? `<div class="row">Service des Eaux et Forêts DEFCCS</div>`
      : (footerTrail ? `<div class="row">Service des Eaux et Forêts ${footerTrail}</div>` : '');
    const html = `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Quitus</title>
        <style>
          @page { size: 58mm auto; margin: 3mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; width: 58mm; margin: 0 auto; color: #000; }
          .wrap { text-align: center; }
          .frame { border: 1px dashed #000; padding: 6px 8px; margin: 2px 0 6px; border-radius: 4px; }
          .header { font-weight: 700; font-size: 14px; line-height: 1.15; margin: 2px 0 6px; }
          .subheader { font-weight: 700; font-size: 12px; line-height: 1.1; margin-bottom: 6px; }
          .qr { width: 150px; height: 150px; margin: 4px auto 6px; }
          .line { border: 0; border-top: 1px solid #000; margin: 6px 0; }
          .row { text-align: center; font-size: 12px; margin: 4px 0; }
          .row-left { text-align: left; }
          .row strong { font-weight: 700; }
          .name { text-align: center; font-size: 14px; font-weight: 800; margin-top: 2px; }
          .amount { text-align: left; font-size: 13px; font-weight: 700; }
          .receipt-number { font-family: 'Courier New', Courier, monospace; font-weight: 800; font-size: 14px; letter-spacing: 1px; }
          .footer { text-align: center; font-size: 12px; margin-top: 8px; }
          .actions { text-align: center; margin-top: 10px; }
          .print-btn { padding: 6px 10px; border: 1px solid #333; border-radius: 4px; background: #fff; font-size: 12px; cursor: pointer; margin: 0 4px; }
          @media print { .actions { display: none; } }
        </style>
      </head>
      <body>
        <div class="wrap">
          <div class="frame">
            <div class="header">Direction Eaux et Forêts</div>
            <div class="subheader">Chasse et Conservation des Sols</div>
            ${qrCodeUrl ? `<img src="${qrCodeUrl}" class="qr" alt="QR" />` : ''}
            ${footerRowHtml}
            <div class="row row-left"><strong>Permis de chasse :</strong> ${permit.permitNumber || ''}</div>
            <div class="row"><strong>Type :</strong> ${(
                (permit as any).categoryId && String((permit as any).categoryId).trim().length > 0
                  ? String((permit as any).categoryId)
                  : (permit.type === 'petite-chasse' ? 'Petite Chasse' :
                     permit.type === 'grande-chasse' ? 'Grande Chasse' :
                     permit.type === 'gibier-eau' ? "Gibier d'Eau" :
                     (permit.type || ''))
              )}</div>
            <div class="row"><strong>Nom du chasseur :</strong></div>
            <div class="name">${hunter.firstName || ''} ${(hunter.lastName || '').toString().toUpperCase()}</div>
            <div class="row row-left"><strong>Prix :</strong> ${priceLine}</div>
            ${issueAt ? `<div class=\"row row-left\"><strong>Émis le :</strong> ${issueAt}</div>` : ''}
            ${typeof validityDaysLocal === 'number' && validityDaysLocal > 0 ? `<div class=\"row row-left\"><strong>Validité :</strong> ${validityDaysLocal} jours</div>` : ''}
            ${expiryAt ? `<div class=\"row row-left\"><strong>Expire le :</strong> ${expiryAt}</div>` : ''}
            <div class="row row-left"><strong>Quittance :</strong> <span class="receipt-number">${receiptDigits || receiptNumber}</span></div>
          </div>
          <hr class="line" />
          <div class="actions">
            <button class="print-btn" onclick="(function(){ setWidth(58); setTimeout(function(){ window.print(); }, 50); })()">Imprimer 58mm</button>
            <button class="print-btn" onclick="(function(){ setWidth(80); setTimeout(function(){ window.print(); }, 50); })()">Imprimer 80mm</button>
          </div>
        </div>
        <script>
          function allImagesLoaded(){
            const imgs = Array.from(document.images);
            return imgs.every(img => img.complete);
          }
          function whenReady(){
            if (allImagesLoaded()) { return; }
            setTimeout(whenReady, 100);
          }
          window.onload = whenReady;
          function setWidth(mm){
            document.body.style.width = mm + 'mm';
            try {
              var styleTag = document.querySelector('style');
              if (styleTag) {
                var css = styleTag.innerHTML.replace(/@page\s*\{[^}]*\}/, '@page { size: ' + mm + 'mm auto; margin: 4mm; }');
                styleTag.innerHTML = css;
              }
            } catch(e) {}
          }
        <\/script>
      </body>
    </html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (w) {
      try { w.focus(); } catch(_) {}
      // Revoke after some delay (the new document won't have access to parent URL.revokeObjectURL)
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  };

  if (!open) return null;

  const isExpired = permit && getEffectiveExpiry(permit) ? (() => {
    const expiryDate = new Date(getEffectiveExpiry(permit) as any);
    return !isNaN(expiryDate.getTime()) && expiryDate < new Date();
  })() : false;
  const isSuspended = permit && permit.status === "suspended";

  // Calcul et affichage de la validité côté UI: STRICTEMENT basé sur les dates visibles
  // Validité = jours inclusifs entre issueDate et (computedEffectiveExpiry || expiryDate)
  const validityDaysUI: number | undefined = (() => {
    try {
      const issue = permit?.issueDate ? new Date(permit.issueDate as any) : null;
      const effectiveExpiryRaw = (permit as any)?.computedEffectiveExpiry || permit?.expiryDate;
      const expiry = effectiveExpiryRaw ? new Date(effectiveExpiryRaw as any) : null;
      if (issue && expiry && !isNaN(issue.getTime()) && !isNaN(expiry.getTime())) {
        return diffDaysInclusive(issue, expiry);
      }
      return validityDaysComputed; // fallback si une des dates manque
    } catch {
      return validityDaysComputed;
    }
  })();

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[92%] md:max-w-[740px] lg:max-w-[820px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center justify-between">
              Détails du Permis
            </DialogTitle>
            <DialogDescription>
              Consultez les informations détaillées du permis de chasse
            </DialogDescription>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <div className="text-xs text-gray-500">Émis le</div>
                <div className="text-sm font-semibold">{formatSafeDate(permit?.issueDate)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Validité</div>
                <div className="text-sm font-semibold">{typeof validityDaysUI === 'number' && validityDaysUI > 0 ? `${validityDaysUI} jours` : '—'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Expire le</div>
                <div className="text-sm font-semibold">{formatSafeDate(getEffectiveExpiry(permit))}</div>
              </div>
            </div>
            {/* Avertissement si dates incohérentes */}
            {permit?.issueDate && getEffectiveExpiry(permit) && (() => {
              const i = new Date(permit.issueDate as any);
              const e = new Date(getEffectiveExpiry(permit) as any);
              return !isNaN(i.getTime()) && !isNaN(e.getTime()) && i > e;
            })() ? (
              <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 text-amber-800 px-3 py-2 text-sm">
                Attention: les dates semblent incohérentes (expiration antérieure à la date d'émission). Vérifiez le permis ou la campagne.
              </div>
            ) : null}
          </DialogHeader>

          {/* Suppression de l'en-tête comme demandé */}

          {loading ? (
            <div className="flex justify-center py-8">Chargement...</div>
          ) : error ? (
            <div className="text-red-500 text-center py-8">{error}</div>
          ) : permit && hunter ? (
            <div>
              {/* Version détaillée pour l'écran (non imprimable) */}
              <div className="hidden-print mb-6">
                <Card className="printable-table">
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <div className="space-y-3">
                          <div>
                            <h3 className="text-sm font-medium text-gray-500">Numéro de Permis</h3>
                            <p className="text-base font-bold">{permit.permitNumber}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-medium text-gray-500">Nom Complet</h3>
                            <p className="text-base">{hunter.firstName} {hunter.lastName}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-medium text-gray-500">Catégorie du Chasseur</h3>
                            <p className="text-base capitalize">{hunter.category}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-medium text-gray-500">Type de Permis</h3>
                            <p className="text-base capitalize">
                              {permit.categoryId && String(permit.categoryId).trim().length > 0
                                ? permit.categoryId
                                : (permit.type === 'petite-chasse' ? 'Petite Chasse' :
                                   permit.type === 'grande-chasse' ? 'Grande Chasse' :
                                   permit.type === 'gibier-eau' ? "Gibier d'Eau" :
                                   (permit.type || ''))
                              }
                            </p>
                          </div>
                          <div>
                            <h3 className="text-sm font-medium text-gray-500">N° Pièce d'Identité</h3>
                            <p className="text-base">{hunter.idNumber}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-medium text-gray-500">Date d'Émission</h3>
                            <p className="text-base">{formatSafeDate(permit.issueDate)}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-medium text-gray-500">Date d'Expiration</h3>
                            <p className={`text-base ${isExpired ? "text-red-600 font-bold" : ""}`}>
                              {formatSafeDate(getEffectiveExpiry(permit))}
                            </p>
                          </div>
                          <div>
                            <h3 className="text-sm font-medium text-gray-500">Statut</h3>
                            <p
                              className={`text-base ${
                                isSuspended
                                  ? "text-orange-600 font-bold"
                                  : isExpired
                                    ? "text-red-600 font-bold"
                                    : "text-green-600 font-bold"
                              }`}
                            >
                              {isSuspended ? "Suspendu" : (isExpired ? "Expiré" : "Actif")}
                            </p>
                          </div>
                          {/* Renouvellements */}
                          <div>
                            <h3 className="text-sm font-medium text-gray-500">Renouvellements</h3>
                            <p className="text-base font-semibold">{Array.isArray((permit.metadata as any)?.renewals) ? (permit.metadata as any).renewals.length : 0}</p>
                            {Array.isArray((permit.metadata as any)?.renewals) && (permit.metadata as any).renewals.length > 0 && (
                              <div className="mt-2 space-y-1 text-sm text-gray-700">
                                {((permit.metadata as any).renewals as any[]).map((r: any, idx: number) => {
                                  const d = r?.date ? new Date(r.date) : null;
                                  const dStr = d && !isNaN(d.getTime()) ? format(d, 'dd/MM/yyyy HH:mm', { locale: fr }) : String(r?.date || '');
                                  const who = r?.by ? `${r.by.firstName || ''} ${r.by.lastName || ''}`.trim() : '';
                                  const role = (r?.by?.role || '').toLowerCase();
                                  const rgn = (r?.by?.region || '').trim();
                                  const zn = (r?.by?.zone || '').trim();
                                  const deptBy = (r?.by?.departement || (r as any)?.by?.department || '').trim();
                                  let issuerLike = '';
                                  if (role.includes('region')) {
                                    issuerLike = rgn ? `Région : ${rgn}` : '';
                                  } else if (role.includes('secteur') || role.includes('sector') || role.includes('sub-agent')) {
                                    // Afficher Secteur : <Departement>
                                    const deptText = deptBy || zn;
                                    issuerLike = deptText ? `Secteur : ${deptText}` : (rgn ? `Région : ${rgn}` : '');
                                  } else {
                                    issuerLike = rgn ? `Région : ${rgn}` : (zn ? zn : '');
                                  }
                                  return (
                                    <div key={idx} className="flex items-start gap-2">
                                      <span className="text-gray-400">{idx + 1}.</span>
                                      <div>
                                        <div className="font-medium">{dStr}</div>
                                        <div className="text-xs text-gray-600">{who ? `Par: ${who}` : ''}{issuerLike ? (who ? ' — ' : '') + issuerLike : ''}</div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          {/* Prix, Quittance et Emetteur déplacés sous le QR à droite */}

                          {/* Informations sur l'arme */}
                          {hunter.weaponType && (
                            <div className="border-t pt-3 mt-3">
                              <h3 className="text-sm font-medium text-gray-500 mb-2">Informations sur l'Arme</h3>
                              <div className="space-y-2">
                                <div>
                                  <span className="text-xs text-gray-400">Type:</span>
                                  <span className="text-sm ml-2 capitalize">{hunter.weaponType}</span>
                                </div>
                                {hunter.weaponBrand && (
                                  <div>
                                    <span className="text-xs text-gray-400">Marque:</span>
                                    <span className="text-sm ml-2">{hunter.weaponBrand}</span>
                                  </div>
                                )}
                                {hunter.weaponCaliber && (
                                  <div>
                                    <span className="text-xs text-gray-400">Calibre:</span>
                                    <span className="text-sm ml-2">{hunter.weaponCaliber}</span>
                                  </div>
                                )}
                                {hunter.weaponReference && (
                                  <div>
                                    <span className="text-xs text-gray-400">Référence:</span>
                                    <span className="text-sm ml-2">{hunter.weaponReference}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-center justify-center border-l border-gray-200 pl-6">
                        <div className="mb-4">
                          {hunterPhotoUrl ? (
                            <img
                              src={hunterPhotoUrl}
                              alt="Photo du chasseur"
                              className="w-32 h-32 rounded-full object-cover mb-2 mx-auto border"
                              onError={() => setHunterPhotoUrl(null)}
                            />
                          ) : (
                            <div className="w-32 h-32 bg-gray-200 rounded-full mb-2 mx-auto flex items-center justify-center">
                              <User className="h-16 w-16 text-gray-400" />
                            </div>
                          )}
                          <p className="text-center text-sm text-gray-500">Photo du chasseur</p>
                        </div>
                        {/* QR Code Réactivé comme demandé */}
                        {qrCodeUrl && (
                          <div className="mt-4 w-full">
                            <img
                              src={qrCodeUrl}
                              alt="QR Code"
                              className="w-32 h-32 mx-auto"
                            />
                            <p className="text-center text-sm text-gray-500 mt-2">QR Code d'identification</p>
                            <Separator className="my-4" />
                            {/* Section informations déplacée ici */}
                            <div className="space-y-3 text-center">
                              <div>
                                <h3 className="text-sm font-medium text-gray-500">Prix</h3>
                                <p className="text-base">{Number(permit.price).toLocaleString()} FCFA</p>
                              </div>
                              <div>
                                <h3 className="text-sm font-medium text-gray-500">N° Quittance Permis</h3>
                                <p className="text-base font-bold">{permit.receiptNumber || 'Non défini'}</p>
                              </div>
                              <div className="border-t pt-3 mt-3">
                                <div className="space-y-1">
                                  {(() => {
                                    // Préférer la dernière entrée de renouvellement pour afficher le lieu de service
                                    const renewals = Array.isArray((permit as any)?.metadata?.renewals) ? ((permit as any).metadata.renewals as any[]) : [];
                                    const lastBy = renewals.length > 0 ? (renewals[renewals.length - 1]?.by || {}) : {};
                                    const lastRole = (lastBy.role || '').toLowerCase();
                                    const lastRegion = (lastBy.region || '').toString().trim();
                                    const lastDept = (lastBy.departement || (lastBy as any).department || lastBy.zone || '').toString().trim();
                                    const fallbackType = (user?.type || '').toLowerCase();
                                    const fallbackRoleFromAppRole = (user?.role === 'agent') ? 'regional' : (user?.role === 'sub-agent' ? 'secteur' : '');
                                    const roleLike = (lastRole || permit.issuerRole || fallbackType || fallbackRoleFromAppRole || '').toLowerCase();
                                    const region = (lastRegion || permit.issuerRegion || user?.region || '').trim();
                                    const deptOrZone = (
                                      lastDept || (permit as any).issuerDepartement || (permit as any).issuerZone || (user as any)?.departement || (user as any)?.zone || ''
                                    ).trim();
                                    if (roleLike === 'admin') {
                                      return (
                                        <div>
                                          <span className="text-sm font-medium">Service des Eaux et Forêts DEFCCS</span>
                                        </div>
                                      );
                                    }
                                    return (
                                      <>
                                        <div>
                                          <span className="text-sm font-medium">Service des Eaux et Forêts</span>
                                        </div>
                                        {(region || deptOrZone) && (
                                          <div>
                                            <span className="text-sm">{computeServiceLocation(
                                              roleLike,
                                              region,
                                              deptOrZone,
                                              deptOrZone
                                            )}</span>
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Version carte pour impression */}
              <div className="print-only">
                  <PermitCard permit={permit as any} hunter={hunter as any} />
              </div>
            </div>
          ) : (
            <div className="text-center py-8">Permis non trouvé</div>
          )}

          {permit && hunter && (
            <DialogFooter className="gap-1 no-print flex flex-wrap items-center justify-start w-full pl-0">
              {/* Bouton d'impression - accessible à tous */}
              <Button
                variant="outline"
                onClick={handlePrint}
                className="gap-1"
                size="sm"
              >
                <Printer className="h-3.5 w-3.5" />
                Imprimer
              </Button>
              {/* Bouton d'impression du Quitus (slip QR minimal) */}
              <Button
                variant="default"
                onClick={handlePrintReceipt}
                className="gap-1"
                size="sm"
              >
                <ScrollText className="h-3.5 w-3.5" />
                Imprimer le Quitus
              </Button>

              {/* Boutons d'actions */}
              <>
                    {/* Bouton renouveler */}
                    {permissions.canEditPermit && (() => {
                      // Vérifier si la date d'expiration est atteinte
                      const effectiveExpiry = getEffectiveExpiry(permit);
                      const expiryDate = effectiveExpiry ? new Date(effectiveExpiry) : null;
                      const today = new Date();
                      today.setHours(0, 0, 0, 0); // Normaliser à minuit
                      const isExpired = expiryDate ? expiryDate <= today : false;

                      // Vérifier le nombre de renouvellements
                      const renewalCount = Array.isArray((permit.metadata as any)?.renewals)
                        ? (permit.metadata as any).renewals.length
                        : 0;
                      const maxRenewalsReached = renewalCount >= 2;

                      // Déterminer le message de tooltip
                      let tooltipMessage = undefined;
                      if (isSuspended) {
                        tooltipMessage = 'Permis suspendu';
                      } else if (!isExpired) {
                        tooltipMessage = 'Le renouvellement n\'est possible qu\'après la date d\'expiration';
                      } else if (maxRenewalsReached) {
                        tooltipMessage = 'Nombre maximal de renouvellements atteint';
                      }

                      return (
                        <Button
                          variant="outline"
                          onClick={() => {
                            if (!isExpired) {
                              toast({
                                title: 'Renouvellement impossible',
                                description: 'Le permis ne peut être renouvelé qu\'après sa date d\'expiration.',
                                variant: 'destructive'
                              });
                              return;
                            }
                            if (maxRenewalsReached) {
                              toast({
                                title: 'Limite atteinte',
                                description: 'Maximum 2 renouvellements.',
                                variant: 'destructive'
                              });
                              return;
                            }
                            setShowRenewConfirm(true);
                          }}
                          className="gap-1 disabled:opacity-60"
                          size="sm"
                          disabled={isSuspended || !isExpired || maxRenewalsReached}
                          title={tooltipMessage}
                        >
                          <Repeat className="h-3.5 w-3.5" />
                          Renouveler
                        </Button>
                      );
                    })()}

                    {/* Bouton suspendre */}
                    {permissions.canSuspendPermit && !isSuspended && (
                      <Button
                        variant="default"
                        className="flex items-center gap-2"
                        onClick={() => setShowSuspendConfirm(true)}
                        disabled={isSuspending}
                        size="sm"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Suspendre
                      </Button>
                    )}

                    {/* Bouton réactiver */}
                    {permissions.canSuspendPermit && isSuspended && reactivationAllowed === true && (
                      <Button
                        variant="default"
                        className="flex items-center gap-2"
                        onClick={() => setShowReactivateConfirm(true)}
                        disabled={isReactivating}
                        size="sm"
                      >
                        <Repeat className="h-3.5 w-3.5" />
                        Réactiver
                      </Button>
                    )}

                    {/* Bouton supprimer - administrateur seulement */}
                    {permissions.canDeletePermit ? (
                      <Button
                        variant="destructive"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="gap-1"
                        size="sm"
                      >
                        <Trash className="h-3.5 w-3.5" />
                        Supprimer
                      </Button>
                    ) : permissions.canSuspendPermit && (
                      <Button
                        variant="outline"
                        className="gap-1 border-red-300 text-red-600 hover:bg-red-50"
                        size="sm"
                        onClick={() => {
                          toast({
                            title: "Information",
                            description: "Seul un administrateur peut supprimer un permis.",
                          });
                        }}
                      >
                        <MailQuestion className="h-3.5 w-3.5" />
                        Demander suppression
                      </Button>
                    )}
              </>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

  {/* Dialog Réactivation */}
  <Dialog open={showReactivateConfirm ? true : false} onOpenChange={(open) => setShowReactivateConfirm(open)}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Réactiver le Permis</DialogTitle>
      </DialogHeader>
      <p>Êtes-vous sûr de vouloir réactiver ce permis ?</p>
      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => setShowReactivateConfirm(false)}
        >
          Annuler
        </Button>
        <Button
          variant="default"
          onClick={handleReactivate}
          disabled={isReactivating}
        >
          {isReactivating ? "Réactivation..." : "Réactiver"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

      {/* Suspend Confirmation Dialog */}
      <Dialog open={showSuspendConfirm ? true : false} onOpenChange={(open) => setShowSuspendConfirm(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspendre le Permis</DialogTitle>
          </DialogHeader>
          <p>Êtes-vous sûr de vouloir suspendre ce permis ? Le chasseur ne pourra plus l'utiliser.</p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSuspendConfirm(false)}
              disabled={isSuspending}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleSuspend}
              disabled={isSuspending}
            >
              {isSuspending ? "Suspension..." : "Suspendre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm ? true : false} onOpenChange={(open) => setShowDeleteConfirm(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le Permis</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            Êtes-vous sûr de vouloir supprimer définitivement ce permis ? Cette action est irréversible.
            \n\nAttention: toutes les taxes d'abattage associées à ce permis seront également supprimées.
          </DialogDescription>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Suppression..." : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Forbidden Info Dialog */}
      <Dialog open={showDeleteForbidden ? true : false} onOpenChange={(open) => setShowDeleteForbidden(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suppression refusée</DialogTitle>
            <DialogDescription>
              {deleteForbiddenMessage || "Vous n'êtes pas autorisé à supprimer ce permis."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="default" onClick={() => setShowDeleteForbidden(false)}>Compris</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Boîte de dialogue de confirmation de renouvellement avec N° de quittance obligatoire */}
      <Dialog open={showRenewConfirm} onOpenChange={setShowRenewConfirm}>
        <DialogContent className="sm:max-w-[92%] md:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Renouveler le Permis</DialogTitle>
            <DialogDescription>
              Voulez-vous renouveler ce permis pour une année supplémentaire ?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Nouveau N° de quittance</label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 select-none">N°</span>
              <input
                value={renewReceipt}
                onChange={(e) => {
                  let raw = e.target.value.toUpperCase();
                  // Autoriser chiffres, lettres, '/', ' ', '.' puis normaliser
                  raw = raw.replace(/[^0-9A-Z\/. ]/g, '');
                  raw = raw.replace(/[.]/g, '');
                  raw = raw.replace(/\s+/g, ' ');
                  const only = raw.replace(/[^0-9A-Z]/g, '');
                  let digits = only.replace(/[^0-9]/g, '');
                  let letters = only.replace(/[^A-Z]/g, '');
                  digits = digits.slice(0, 9);
                  letters = letters.slice(0, 2);
                  let formatted = '';
                  const first7 = digits.slice(0, 7);
                  formatted += first7;
                  if (first7.length === 7) {
                    formatted += '/';
                    const next2 = digits.slice(7, 9);
                    formatted += next2;
                    if (next2.length === 2) {
                      formatted += ' ';
                      formatted += letters;
                    }
                  }
                  setRenewReceipt(formatted);
                  if (!renewReceiptTouched) setRenewReceiptTouched(true);
                }}
                onPaste={(e) => e.preventDefault()}
                className="w-full bg-yellow-50 border border-yellow-200 focus:border-yellow-300 rounded px-3 py-2 font-bold text-lg tracking-wider"
                placeholder="Exemple: 1234567/24 AB"
                autoComplete="off"
              />
              <span className="animate-pulse text-amber-600 select-none">|</span>
            </div>
            {renewReceiptTouched && !/^\d{7}\/\d{2} [A-Z]{2}$/.test(renewReceipt) && (
              <p className="text-sm text-red-600">Format attendu: 1234567/24 AB</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowRenewConfirm(false); }}>Annuler</Button>
            <Button onClick={handleRenew} disabled={isRenewing}>Confirmer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

