import PermitDetails from "@/components/permits/PermitDetails";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Ban, CheckCircle2, Edit, FileText, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
// Supprime les imports non utilisés et doublons de queryClient
import { apiRequest, apiRequestBlob } from "@/lib/api";
import { useHunterDetails } from "@/lib/hooks/useHunters";
import { usePermissions } from "@/lib/hooks/usePermissions";
import type { Hunter } from "@shared/schema";
import HunterForm from "./HunterForm";

interface HunterDetailsProps {
  hunterId: number;
  open: boolean;
  onClose: () => void;
}

export default function HunterDetails({ hunterId, open, onClose }: HunterDetailsProps) {
  const { toast } = useToast();
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showForceDeleteConfirm, setShowForceDeleteConfirm] = useState(false);
  const [suspendConfirm, setSuspendConfirm] = useState(false);
  const [reactivateConfirm, setReactivateConfirm] = useState(false);
  // États pour la gestion des documents
  const [updatingDoc, setUpdatingDoc] = useState<string | null>(null);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [expiryDate, setExpiryDate] = useState<string>('');
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  // Aperçu de document (modal interne)
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDocType, setPreviewDocType] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('Aperçu du document');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // États pour le modal des taxes
  const [showTaxesModal, setShowTaxesModal] = useState(false);
  const [selectedPermitId, setSelectedPermitId] = useState<number | null>(null);
  const [selectedPermitNumber, setSelectedPermitNumber] = useState<string>('');
  const [taxesForPermit, setTaxesForPermit] = useState<any[]>([]);
  const [loadingTaxes, setLoadingTaxes] = useState(false);
  // Présence de taxes par permis (pour masquer le bouton si aucune taxe)
  const [hasTaxesMap, setHasTaxesMap] = useState<Record<number, boolean>>({});
  // Sélecteur de permis (si le chasseur en a plusieurs)
  const [showPermitPicker, setShowPermitPicker] = useState(false);

  // Les appels GET utilisent apiRequest pour centraliser l'authentification.
  // Pour les envois multipart/POST sans JSON, on ajoute manuellement l'en-tête Authorization.
  const bearerHeader = (): Record<string, string> => {
    try {
      const token = (typeof window !== 'undefined')
        ? (localStorage.getItem('token') || sessionStorage.getItem('token'))
        : null;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  };

  const queryClient = useQueryClient();
  // State pour les documents téléversés
  const [documentsByType, setDocumentsByType] = useState<Record<string, boolean>>({});
  // State pour les attachments avec dates d'expiration
  const [attachmentItems, setAttachmentItems] = useState<any[]>([]);

  // Récupérer les attachments avec dates d'expiration
  const { data: attachmentData, isLoading: loadingAttachments, error: attachmentError } = useQuery({
    queryKey: ['hunter-attachments', hunterId],
    queryFn: async () => {
      console.log('Fetching attachments for hunter:', hunterId);
      const response = await fetch(`/api/attachments/${hunterId}`);
      console.log('Response status:', response.status);
      if (!response.ok) {
        console.error('Failed to fetch attachments:', response.statusText);
        throw new Error('Failed to fetch attachments');
      }
      const data = await response.json();
      console.log('Attachments data:', data);
      return data;
    },
    enabled: !!hunterId && open,
  });



  // Chargement des pièces jointes (stockées en base) via l'API attachments
  const fetchDocuments = async () => {
    try {
      const res = await apiRequest<any>('GET', `/attachments/${hunterId}`);
      if (!res.ok) throw new Error(res.error || 'Erreur chargement des pièces jointes');
      const data = res.data as any;
      const items = Array.isArray((data as any)?.items) ? (data as any).items : [];
      const map: Record<string, any> = {};
      for (const it of items) {
        if (it?.type && it?.present) map[it.type] = true;
      }
      setDocumentsByType(map);
      setAttachmentItems(items); // Stocker tous les items avec leurs détails
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (open && hunterId) {
      fetchDocuments();
    }
  }, [open, hunterId, attachmentData]);

  // Mutation pour mettre à jour un document (même endpoint que la création)
  const updateDocument = useMutation({
    mutationFn: async ({ docType, file, expiryDate }: {
      docType: string,
      file: File,
      expiryDate?: string
    }) => {
      const formData = new FormData();
      formData.append('file', file);

      // Ajouter la date d'expiration uniquement si elle est fournie et pour les documents qui en ont besoin
      if (expiryDate && docType !== 'hunterPhoto') {
        formData.append('expiryDate', expiryDate);
      }
      // Type de document attendu par le backend
      formData.append('documentType', docType);
      // Utiliser apiRequest pour gérer JWT + cookies et FormData
      const res = await apiRequest<any>('POST', `/attachments/${hunterId}`, formData);
      if (!res.ok) {
        throw new Error(res.error || 'Erreur lors de la mise à jour du document');
      }
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hunter-attachments", hunterId] });
      queryClient.invalidateQueries({ queryKey: ["hunter", hunterId] });
      // Forcer la mise à jour de l'état local des documents
      setDocumentsByType({});
      setAttachmentItems([]);
      toast({
        title: "Document mis à jour",
        description: "Le document a été mis à jour avec succès.",
      });
      setUpdatingDoc(null);
      setFileToUpload(null);
      setExpiryDate('');
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const { data: permits = [], isLoading: loadingPermits } = useQuery<any[]>({
    queryKey: ['hunter-permits', hunterId],
    queryFn: async () => {
      const response = await fetch(`/api/permits/hunter/${hunterId}`);
      if (!response.ok) throw new Error('Failed to fetch permits');
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!hunterId && open,
  });

  // Quand la liste des permis change, déterminer s'il existe au moins une taxe par permis
  useEffect(() => {
    const run = async () => {
      try {
        if (!Array.isArray(permits) || permits.length === 0) {
          setHasTaxesMap({});
          return;
        }
        const entries = await Promise.allSettled(
          permits.map(async (p: any) => {
            try {
              const res = await apiRequest<any[]>('GET', `/taxes/permit/${p.id}`);
              const ok = res?.ok && Array.isArray(res.data) && res.data.length > 0;
              return [p.id, !!ok] as [number, boolean];
            } catch {
              return [p.id, false] as [number, boolean];
            }
          })
        );
        const map: Record<number, boolean> = {};
        for (const e of entries) {
          if (e.status === 'fulfilled') {
            const [id, has] = e.value as [number, boolean];
            map[id] = has;
          }
        }
        setHasTaxesMap(map);
      } catch {
        setHasTaxesMap({});
      }
    };
    run();
  }, [permits]);

  // Récupérer les données du chasseur
  const { data: hunter, isLoading, error } = useQuery({
    queryKey: ['hunter', hunterId],
    queryFn: async () => {
      const response = await fetch(`/api/hunters/${hunterId}`);
      if (!response.ok) throw new Error('Failed to fetch hunter');
      return response.json();
    },
    enabled: !!hunterId && open,
  });

  // Cache local pour les données du chasseur
  const [hunterData, setHunterData] = useState<Hunter | null>(null);

  // Mutation pour créer une demande de permis
  const createRequestMutation = useMutation({
    mutationFn: async (hunterId: number) => {
      const res = await apiRequest<any>('POST', `/permit-requests/${hunterId}/create-request`);
      if (!res.ok) {
        throw new Error(res.error || 'Erreur lors de la création de la demande');
      }
      return res.data;
    },
    onSuccess: () => {
      toast({
        title: "Demande créée avec succès",
        description: "Votre demande de permis a été enregistrée et sera traitée sous peu.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateRequest = () => {
    if (hunter?.id) {
      createRequestMutation.mutate(hunter.id);
    }
  };

  // Utiliser le hook personnalisé uniquement pour les mutations
  const {
    suspendHunter,
    suspendLoading,
    reactivateHunter,
    reactivateLoading,
    deleteHunter,
    deleteLoading,
    toggleMinorStatus
  } = useHunterDetails(hunterId);
  // Permissions de l'utilisateur courant
  const perms = usePermissions();
  const { user } = useAuth();

  // Feature flag: allow agents to open permit details from hunter modal
  const AGENT_PERMIT_ACCESS_LOCAL_KEY = 'agentPermitAccess';
  const readLocalAgentPermitAccess = () => {
    try {
      if (typeof window === 'undefined') return null;
      const raw = localStorage.getItem(AGENT_PERMIT_ACCESS_LOCAL_KEY);
      if (!raw) return null;
      return { enabled: raw === 'true' } as { enabled: boolean };
    } catch (e) {
      return null;
    }
  };

  const { data: agentPermitAccess = { enabled: false } } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/agent-permit-access"],
    queryFn: async () => {
      try {
        const res: any = await apiRequest<{ enabled: boolean }>('GET', '/api/settings/agent-permit-access');
        if (res && res.ok && typeof res.data !== 'undefined') return res.data as any;
        // if server returned ok=false, fallback to local
        const local = readLocalAgentPermitAccess();
        return local ?? { enabled: false };
      } catch (e) {
        const local = readLocalAgentPermitAccess();
        return local ?? { enabled: false };
      }
    },
    initialData: readLocalAgentPermitAccess() ?? { enabled: false },
    enabled: !!user,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const [showPermitDetailsModal, setShowPermitDetailsModal] = useState(false);
  const [permitIdToView, setPermitIdToView] = useState<number | null>(null);

  const blurActiveElement = useCallback(() => {
    try {
      const el = document.activeElement as HTMLElement | null;
      el?.blur?.();
    } catch {}
  }, []);

  // Plus de récupération directe verbeuse: s'appuyer sur React Query

  // Gérer la suppression d'un chasseur
  const handleDelete = async () => {
    try {
      await deleteHunter.mutateAsync({ id: hunterId, force: true });
      setShowDeleteConfirm(false);
      onClose();
    } catch (error) {
      setShowDeleteConfirm(false);
    }
  };

  // Gérer la suppression forcée d'un chasseur (même avec des permis actifs)
  const handleForceDelete = async () => {
    try {
      await deleteHunter.mutateAsync({ id: hunterId, force: true });
      setShowForceDeleteConfirm(false);
      onClose();
    } catch (error) {
      setShowForceDeleteConfirm(false);
    }
  };

  // Gérer la suspension d'un chasseur
  const handleSuspend = async () => {
    try {
      await suspendHunter.mutateAsync();
      setSuspendConfirm(false);
    } catch (error) {
      setSuspendConfirm(false);
    }
  };

  // Gérer la réactivation d'un chasseur
  const handleReactivate = async () => {
    try {
      await reactivateHunter.mutateAsync();
      setReactivateConfirm(false);
    } catch (error) {
      setReactivateConfirm(false);
    }
  };

  // Fonction pour charger les taxes d'un permis
  const loadTaxesForPermit = async (permitId: number): Promise<any[]> => {
    setLoadingTaxes(true);
    try {
      const res = await apiRequest<any[]>('GET', `/taxes/permit/${permitId}`);
      if (res.ok) {
        const items = (res.data as any[]) || [];
        setTaxesForPermit(items);
        return items;
      } else {
        toast({
          title: "Erreur",
          description: res.error || "Impossible de charger les taxes associées",
          variant: "destructive",
        });
        return [];
      }
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de charger les taxes associées",
        variant: "destructive",
      });
      return [];
    } finally {
      setLoadingTaxes(false);
    }
  };

  // Fonction pour ouvrir le modal des taxes
  const openTaxesModal = async (permitId: number, permitNumber: string) => {
    const items = await loadTaxesForPermit(permitId);
    if (!items || items.length === 0) {
      toast({ title: 'Aucune taxe', description: "Ce permis n'est associé à aucune taxe.", variant: 'default' });
      return;
    }
    setSelectedPermitId(permitId);
    setSelectedPermitNumber(permitNumber);
    setShowTaxesModal(true);
  };

  // Helper: compute issuer service location for taxes (align with permits logic)
  const computeServiceLocation = (roleLike?: string, regionRaw?: string, zoneRaw?: string, deptRaw?: string) => {
    const rl = (roleLike || '').toLowerCase();
    const region = (regionRaw || '').trim();
    const zone = (zoneRaw || '').trim();
    const dept = (deptRaw || '').trim();
    // Admin national (DEFCCS)
    if (rl === 'admin') {
      return 'Service des Eaux et Forêts DEFCCS';
    }
    const isRegional = rl.includes('region') || rl.includes('regional') || rl === 'agent' || rl.includes('admin-agent-regional');
    const isSector = rl.includes('secteur') || rl.includes('sector') || rl.includes('sub-agent') || rl.includes('subagent') || rl.includes('agent-secteur');
    if (isRegional) return region ? `IREF/${region}` : 'IREF';
    if (isSector) {
      if (dept) return `Secteur/${dept}`;
      return `Secteur/${zone || 'Non défini'}`;
    }
    // Fallback inference
    if (dept) return `Secteur/${dept}`;
    if (zone) return `Secteur/${zone}`;
    if (region) return `IREF/${region}`;
    return 'Service des Eaux et Forêts';
  };

  if (!open) return null;

  // Fonction pour gérer la soumission du formulaire de document
  const handleDocumentSubmit = () => {
    if (!updatingDoc || !fileToUpload) {
      toast({
        title: "Erreur",
        description: "Veuillez sélectionner un fichier à télécharger",
        variant: "destructive",
      });
      return;
    }

    const requiresExpiry = (doc: string) => ['idCardDocument','weaponPermit','insurance','weaponReceipt'].includes(doc);
    if (requiresExpiry(updatingDoc) && !expiryDate) {
      toast({
        title: "Date d'expiration requise",
        description: "Ce type de document nécessite une date d'expiration.",
        variant: "destructive",
      });
      return;
    }

    // Pour la photo d'identité, on ne demande pas de date d'expiration
    if (updatingDoc === 'hunterPhoto') {
      updateDocument.mutate({
        docType: updatingDoc,
        file: fileToUpload,
        // Pas de date d'expiration pour la photo
      });
    } else {
      // Pour les autres documents, on envoie la date d'expiration si elle est fournie
      updateDocument.mutate({
        docType: updatingDoc,
        file: fileToUpload,
        expiryDate: expiryDate || undefined
      });
    }
  };

  // Fonction pour obtenir le libellé d'un type de document
  const getDocumentLabel = (docType: string): string => {
    const labels: { [key: string]: string } = {
      'idCardDocument': "Pièce d'Identité",
      'weaponPermit': "Permis de Port d'Arme",
      'hunterPhoto': "Photo du Chasseur",
      'treasuryStamp': "Timbre Impôt",
      'weaponReceipt': "Quittance de l'Arme par le Trésor",
      'insurance': "Assurance",
      'moralCertificate': "Certificat de Bonne Vie et Mœurs"
    };
    return labels[docType] || docType;
  };

  // Ouvrir un document en prévisualisation (modal interne) avec JWT + cookies
  const handlePreview = async (docType: string) => {
    const present = documentsByType[docType];
    setPreviewTitle(`Aperçu - ${getDocumentLabel(docType)}`);
    setPreviewDocType(docType);
    // Nettoyage ancien
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setPreviewError(null);
    setPreviewLoading(true);
    setPreviewMime(null);
    if (!present) {
      setPreviewError('Aucun fichier disponible pour cet élément. Veuillez utiliser “Ajouter”.');
      setPreviewOpen(true);
      setPreviewLoading(false);
      return;
    }
    try {
      const res = await apiRequestBlob(`/attachments/${hunterId}/${docType}?inline=1`, 'GET');
      if (!res.ok || !res.blob) {
        throw new Error(res.error || 'Aperçu indisponible');
      }
      // Essayer de déduire correctement le MIME (PNG, JPG, PDF, etc.)
      const headerCT = res.contentType || '';
      const headerCD = res.fileName || '';
      const blobType = (res.blob as Blob).type || '';
      const inferMimeFromFilename = (filename: string): string | '' => {
        const lower = filename.toLowerCase();
        if (lower.endsWith('.png')) return 'image/png';
        if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
        if (lower.endsWith('.webp')) return 'image/webp';
        if (lower.endsWith('.gif')) return 'image/gif';
        if (lower.endsWith('.pdf')) return 'application/pdf';
        return '';
      };
      let filename = '';
      const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(headerCD);
      if (match) {
        filename = decodeURIComponent(match[1] || match[2] || '');
      }
      const inferredFromName = filename ? inferMimeFromFilename(filename) : '';
      const effectiveMime = headerCT || blobType || inferredFromName;
      if (effectiveMime) setPreviewMime(effectiveMime);
      const blobUrl = URL.createObjectURL(res.blob);
      setPreviewUrl(blobUrl);
      setPreviewOpen(true);
    } catch (e: any) {
      setPreviewError(e?.message || 'Impossible d\'ouvrir le document');
      setPreviewOpen(true);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Nettoyage URL blob à la fermeture
  const closePreview = () => {
    setPreviewOpen(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setPreviewError(null);
    setPreviewMime(null);
    setPreviewDocType(null);
  };

  // Fonction pour vérifier si un document est expiré
  const isDocumentExpired = (expiryDateString?: string): boolean => {
    if (!expiryDateString) return false;
    return new Date(expiryDateString) < new Date();
  };

  // Helper pour formater les dates
  const formatExpiryDate = (date: Date) => {
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  };

  // Fonction pour obtenir le statut d'un document avec calcul dynamique
  const getDocumentExpiryInfo = useCallback((docType: string) => {
    const isPresent = !!documentsByType[docType];
    let expiryDate: string | null = null;

    // Récupérer la date d'expiration depuis attachmentData
    if (attachmentData?.items) {
      const attachment = attachmentData.items.find((item: any) => item.type === docType);
      if (attachment?.expiryDate) {
        expiryDate = attachment.expiryDate;
      }
    }

    if (!isPresent) {
      return {
        status: 'missing',
        text: '❌ Manquant',
        color: 'bg-red-100 text-red-800'
      };
    }

    // Calculer le statut d'expiration dynamiquement
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (expiryDate) {
      const expiry = new Date(expiryDate);
      expiry.setHours(0, 0, 0, 0);
      const diffTime = expiry.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        return {
          status: 'expired',
          text: '✅ Fourni',
          color: 'bg-green-100 text-green-800',
          expiryDate: expiry,
          daysLeft: diffDays,
          isExpired: true
        };
      } else if (diffDays <= 30) {
        return {
          status: 'dueSoon',
          text: '✅ Fourni',
          color: 'bg-green-100 text-green-800',
          expiryDate: expiry,
          daysLeft: diffDays,
          isDueSoon: true
        };
      }
    }

    return {
      status: 'valid',
      text: '✅ Fourni',
      color: 'bg-green-100 text-green-800',
      expiryDate: expiryDate ? new Date(expiryDate) : undefined
    };
  }, [documentsByType, attachmentData]);

  return (
    <>
      {/* Dialogue de mise à jour de document */}
      <Dialog open={!!updatingDoc} onOpenChange={(open) => !open && setUpdatingDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mettre à jour {updatingDoc && getDocumentLabel(updatingDoc)}</DialogTitle>
            <DialogDescription>
              Téléchargez le nouveau document et renseignez sa date d'expiration si nécessaire.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="document-file">Fichier du document</Label>
              <Input
                id="document-file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => e.target.files?.[0] && setFileToUpload(e.target.files[0])}
              />
              {fileToUpload && (
                <p className="text-sm text-gray-500">
                  Fichier sélectionné: {fileToUpload.name} ({(fileToUpload.size / 1024).toFixed(2)} KB)
                </p>
              )}
            </div>

            {updatingDoc !== 'hunterPhoto' && (
              <div className="grid w-full max-w-sm items-center gap-1.5">
                <Label htmlFor="expiry-date">Date d'expiration {['idCardDocument','weaponPermit','insurance','weaponReceipt'].includes(updatingDoc || '') ? '(obligatoire)' : '(optionnel)'}
                </Label>
                <Input
                  id="expiry-date"
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  required={['idCardDocument','weaponPermit','insurance','weaponReceipt'].includes(updatingDoc || '')}
                />
                {['idCardDocument','weaponPermit','insurance','weaponReceipt'].includes(updatingDoc || '') && (
                  <p className="text-xs text-gray-500">Cette date est obligatoire pour ce document.</p>
                )}
              </div>
            )}
            {updatingDoc === 'hunterPhoto' && (
              <p className="text-sm text-gray-500 mt-2">
                Note : La photo d'identité n'a pas de date d'expiration.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUpdatingDoc(null);
                setFileToUpload(null);
                setExpiryDate('');
              }}
            >
              Annuler
            </Button>
            <Button
              onClick={handleDocumentSubmit}
              disabled={!fileToUpload || updateDocument.isPending}
              className="mt-4 w-full"
            >
              {updateDocument.isPending ? 'Enregistrement...' : 'Enregistrer le document'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sélecteur de permis quand plusieurs existent */}
      <Dialog open={showPermitPicker} onOpenChange={setShowPermitPicker}>
        <DialogContent className="max-w-lg w-full">
          <DialogHeader>
            <DialogTitle>Choisir un permis à afficher</DialogTitle>
            <DialogDescription>
              Sélectionnez le permis à visualiser dans la liste ci-dessous.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {Array.isArray(permits) && (permits as any[]).length > 0 ? (
              (permits as any[]).map((p: any) => (
                <div
                  key={String(p.id)}
                  className="flex items-center justify-between border rounded p-3 hover:bg-gray-50"
                >
                  <div className="text-sm">
                    <div className="font-medium">Permis #{String(p.permitNumber || p.id)}</div>
                    <div className="text-gray-600">
                      {(p.type || p.categoryId) ? String(p.type || p.categoryId) : 'Type non défini'}
                      {p.issueDate ? ` · Émis le ${format(new Date(p.issueDate), 'dd/MM/yyyy')}` : ''}
                      {p.status ? ` · Statut: ${String(p.status)}` : ''}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (p && p.id) {
                        setPermitIdToView(Number(p.id));
                        setShowPermitPicker(false);
                        setShowPermitDetailsModal(true);
                      }
                    }}
                  >
                    Ouvrir
                  </Button>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500">Aucun permis disponible.</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPermitPicker(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permit details modal opened from HunterDetails */}
      <PermitDetails
        permitId={permitIdToView ?? undefined}
        open={showPermitDetailsModal}
        onClose={() => setShowPermitDetailsModal(false)}
      />

      {/* Modal Aperçu Document */}
      <Dialog open={previewOpen} onOpenChange={(o) => (o ? setPreviewOpen(true) : closePreview())}>
        <DialogContent className="max-w-3xl w-full">
          <DialogHeader>
            <DialogTitle>{previewTitle}</DialogTitle>
            <DialogDescription>
              {previewMime ? `Type: ${previewMime}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-[400px]">
            {previewLoading && (
              <div className="flex items-center justify-center h-96 text-gray-500">
                Chargement de l'aperçu...
              </div>
            )}
            {previewError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                {previewError}
              </div>
            )}
            {!previewLoading && !previewError && previewUrl && (
              <div className="border rounded overflow-hidden">
                {previewMime?.startsWith('image/') ? (
                  <img src={previewUrl || ''} alt="aperçu document" className="max-h-[70vh] w-full object-contain bg-black/5" />
                ) : (previewMime === 'application/pdf' || (previewMime?.includes('pdf'))) ? (
                  <iframe src={previewUrl || ''} className="w-full h-[70vh]" title="Aperçu PDF" />
                ) : (
                  <div className="p-4 text-sm text-gray-600">
                    Type non prévisualisable ({previewMime || 'inconnu'}). Utilisez le téléchargement.
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" onClick={closePreview}>Fermer</Button>
            {previewUrl && (
              <a
                href={previewUrl}
                download
                target="_blank"
                rel="noreferrer"
              >
                <Button>Télécharger</Button>
              </a>
            )}
            {previewDocType && (
              <a
                href={`/api/attachments/${hunterId}/${previewDocType}?inline=1`}
                target="_blank"
                rel="noreferrer"
              >
                <Button variant="secondary">Ouvrir dans un onglet</Button>
              </a>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[90%] md:max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center">
                <div />
                <div className="text-center">Détails du Chasseur</div>
                <div className="pr-10 text-right text-xs font-normal text-gray-600">
                  <span className="inline-flex items-center justify-end gap-2 max-w-full">
                    <span className="truncate max-w-[420px]">{(hunter as any)?.registeredBy || '-'}</span>
                    <span className="text-gray-500 whitespace-nowrap">
                      {(hunter as any)?.createdAt ? format(new Date((hunter as any).createdAt), 'dd MMMM yyyy', { locale: fr }) : ''}
                    </span>
                  </span>
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>

          {isLoading && !hunter ? (
            <div className="flex justify-center py-8">Chargement...</div>
          ) : error && !hunter ? (
            <div className="text-red-500 text-center py-8">Erreur lors du chargement</div>
          ) : hunter ? (
            <Tabs defaultValue="details">
              <div className="overflow-x-auto">
                <TabsList className="inline-grid grid-cols-3 min-w-[560px] w-full">
                  <TabsTrigger value="details">Informations</TabsTrigger>
                  <TabsTrigger value="weapons">Armes & Documents</TabsTrigger>
                  <TabsTrigger value="permits">Permis ({Array.isArray(permits) ? permits.length : 0})</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="details">
                <Card>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Nom Complet</h3>
                        <p className="text-base font-medium">{hunter?.firstName || hunterData?.firstName || "Non renseigné"} {hunter?.lastName || hunterData?.lastName || ""}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Date de Naissance</h3>
                        <p className="text-base">
                          {(hunter?.dateOfBirth || hunterData?.dateOfBirth) ? format(new Date(hunter?.dateOfBirth || hunterData?.dateOfBirth || ""), "dd MMMM yyyy", { locale: fr }) : "Non renseignée"}
                        </p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Numéro de Pièce d'Identité</h3>
                        <p className="text-base">{(hunter as any)?.idNumber || "Non renseigné"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Téléphone</h3>
                        <p className="text-base">{(hunter as any)?.phone || "Non renseigné"}</p>
                      </div>
                      <div className="md:col-span-2">
                        <h3 className="text-sm font-medium text-gray-500">Adresse</h3>
                        <p className="text-base">{(hunter as any)?.address || "Non renseignée"}</p>
                      </div>

                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Pays</h3>
                        <p className="text-base">{(hunter as any)?.pays || hunterData?.pays || "Non renseigné"}</p>
                      </div>

                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Nationalité</h3>
                        <p className="text-base">{(hunter as any)?.nationality || hunterData?.nationality || "Non renseignée"}</p>
                      </div>

                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Profession</h3>
                        <p className="text-base">{(hunter as any)?.profession || "Non renseignée"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Années d'Expérience</h3>
                        <p className="text-base">{(hunter as any)?.experience !== undefined && (hunter as any)?.experience !== null ? `${(hunter as any)?.experience} ans` : "Non renseigné"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Catégorie</h3>
                        <p className="text-base capitalize">{(hunter as any)?.category || "Non renseignée"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Date d'Enregistrement</h3>
                        <p className="text-base">
                          {(hunter as any)?.createdAt ? format(new Date((hunter as any).createdAt), "dd MMMM yyyy", { locale: fr }) : "Non renseignée"}
                        </p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Statut</h3>
                        <p className={`text-base font-medium ${(hunter as any)?.isActive ? 'text-green-600' : 'text-red-600'}`}>
                          {(hunter as any)?.isActive ? 'Actif' : 'Suspendu'}
                        </p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Âge</h3>
                        <p className="text-base font-medium text-blue-600">
                          {(hunter as any)?.dateOfBirth ?
                            `${Math.floor((new Date().getTime() - new Date((hunter as any).dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 365))} ans` :
                            "Non renseigné"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="weapons">
                <Card>
                  <CardContent className="pt-6">
                    <div className="space-y-6">
                      {/* Section Informations sur l'Arme */}
                      <div>
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                          <FileText className="h-5 w-5" />
                          Informations sur l'Arme
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h4 className="text-sm font-medium text-gray-500">Type d'Arme</h4>
                            <p className="text-base capitalize">{(hunter as any)?.weaponType || "Non renseigné"}</p>
                          </div>
                          <div>
                            <h4 className="text-sm font-medium text-gray-500">Marque</h4>
                            <p className="text-base">{(hunter as any)?.weaponBrand || "Non renseignée"}</p>
                          </div>
                          <div>
                            <h4 className="text-sm font-medium text-gray-500">Référence/Modèle</h4>
                            <p className="text-base">{(hunter as any)?.weaponReference || "Non renseignée"}</p>
                          </div>
                          <div>
                            <h4 className="text-sm font-medium text-gray-500">Calibre</h4>
                            <p className="text-base">{(hunter as any)?.weaponCaliber || "Non renseigné"}</p>
                          </div>
                          {(hunter as any)?.weaponOtherDetails && (
                            <div className="md:col-span-2">
                              <h4 className="text-sm font-medium text-gray-500">Autres Détails</h4>
                              <p className="text-base">{(hunter as any)?.weaponOtherDetails}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Section Documents Justificatifs */}
                      <div className="border-t pt-6">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                          <FileText className="h-5 w-5" />
                          Documents Justificatifs
                        </h3>
                        <div className="space-y-4">
                          {/* Documents obligatoires */}
                          <div>
                            <h4 className="text-md font-medium text-gray-700 mb-3">Documents Obligatoires</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {/* Pièce d'Identité */}
                              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div>
                                  <p className="font-medium text-sm">Pièce d'Identité</p>
                                  <p className="text-xs text-gray-500">Carte nationale ou passeport (recto-verso)</p>
                                  {(attachmentData?.items?.find((item: any) => item.type === 'idCardDocument')?.expiryDate || attachmentData?.items?.find((item: any) => item.type === 'idCardDocument')?.present) && (
                                    <p className="text-xs text-gray-500 mt-1">
                                      {attachmentData.items.find((item: any) => item.type === 'idCardDocument')?.expiryDate
                                        ? `Expire le: ${format(new Date(attachmentData.items.find((item: any) => item.type === 'idCardDocument')!.expiryDate), "dd/MM/yyyy")}`
                                        : 'Document fourni sans date d\'expiration'
                                      }
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {(() => {
                                    const status = getDocumentExpiryInfo('idCardDocument');
                                    return (
                                      <div className="flex flex-col gap-1">
                                        <div className="flex gap-1">
                                          <span className={`px-2 py-1 text-xs rounded-full ${status.color}`}>
                                            {status.text}
                                          </span>
                                          {(status as any).isExpired && (
                                            <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">
                                              ⚠️ Expiré
                                            </span>
                                          )}
                                          {(status as any).isDueSoon && (
                                            <span className="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-800">
                                              ⚠️ À mettre à jour
                                            </span>
                                          )}
                                        </div>
                                        {status.expiryDate && (
                                          <span className="text-xs text-gray-500">
                                            Expire le {formatExpiryDate(status.expiryDate)}
                                            {(status as any).daysLeft !== undefined && (status as any).daysLeft >= 0 && (
                                              <span className="ml-1">({(status as any).daysLeft} jours)</span>
                                            )}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => {
                                      setUpdatingDoc('idCardDocument');
                                      fileInputRefs.current['idCardDocument']?.click();
                                    }}
                                  >
                                    {(hunter as any)?.idCardDocument ? 'Changer' : 'Ajouter'}
                                  </Button>
                                  {documentsByType['idCardDocument'] && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 px-2 text-xs"
                                      onClick={() => handlePreview('idCardDocument')}
                                    >
                                      Aperçu
                                    </Button>
                                  )}
                                  <input
                                    type="file"
                                    ref={el => fileInputRefs.current['idCardDocument'] = el}
                                    className="hidden"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={(e) => {
                                      if (e.target.files && e.target.files[0]) {
                                        setFileToUpload(e.target.files[0]);
                                        setUpdatingDoc('idCardDocument');
                                      }
                                    }}
                                  />
                                </div>
                              </div>

                              {/* Permis de Port d'Arme */}
                              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div>
                                  <p className="font-medium text-sm">Permis de Port d'Arme</p>
                                  <p className="text-xs text-gray-500">Autorisation officielle</p>
                                  {(attachmentData?.items?.find((item: any) => item.type === 'weaponPermit')?.expiryDate || attachmentData?.items?.find((item: any) => item.type === 'weaponPermit')?.present) && (
                                    <p className="text-xs text-gray-500 mt-1">
                                      {attachmentData.items.find((item: any) => item.type === 'weaponPermit')?.expiryDate
                                        ? `Expire le: ${format(new Date(attachmentData.items.find((item: any) => item.type === 'weaponPermit')!.expiryDate), "dd/MM/yyyy")}`
                                        : 'Document fourni sans date d\'expiration'
                                      }
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {(() => {
                                    const status = getDocumentExpiryInfo('weaponPermit');
                                    return (
                                      <div className="flex flex-col gap-1">
                                        <div className="flex gap-1">
                                          <span className={`px-2 py-1 text-xs rounded-full ${status.color}`}>
                                            {status.text}
                                          </span>
                                          {status.status === 'expired' && (
                                            <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">
                                              ⚠️ Expiré
                                            </span>
                                          )}
                                          {status.status === 'dueSoon' && (
                                            <span className="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-800">
                                              ⚠️ À mettre à jour
                                            </span>
                                          )}
                                        </div>
                                        {status.expiryDate && (
                                          <span className="text-xs text-gray-500">
                                            Expire le {formatExpiryDate(status.expiryDate)}
                                            {status.daysLeft !== undefined && status.daysLeft >= 0 && (
                                              <span className="ml-1">({status.daysLeft} jours)</span>
                                            )}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => {
                                      setUpdatingDoc('weaponPermit');
                                      fileInputRefs.current['weaponPermit']?.click();
                                    }}
                                  >
                                    {(hunter as any)?.weaponPermit ? 'Changer' : 'Ajouter'}
                                  </Button>
                                  {documentsByType['weaponPermit'] && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 px-2 text-xs"
                                      onClick={() => handlePreview('weaponPermit')}
                                    >
                                      Aperçu
                                    </Button>
                                  )}
                                  <input
                                    type="file"
                                    ref={el => fileInputRefs.current['weaponPermit'] = el}
                                    className="hidden"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={(e) => {
                                      if (e.target.files && e.target.files[0]) {
                                        setFileToUpload(e.target.files[0]);
                                        setUpdatingDoc('weaponPermit');
                                      }
                                    }}
                                  />
                                </div>
                              </div>

                              {/* Photo du Chasseur */}
                              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div>
                                  <p className="font-medium text-sm">Photo du Chasseur</p>
                                  <p className="text-xs text-gray-500">Photo d'identité récente</p>
                                  {(attachmentData?.items?.find((item: any) => item.type === 'hunterPhoto')?.present) && (
                                    <p className="text-xs text-gray-500 mt-1">
                                      Document fourni
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {documentsByType['hunterPhoto'] ? (
                                    <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                                      ✅ Fourni
                                    </span>
                                  ) : (
                                    <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">
                                      ❌ Manquant
                                    </span>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => {
                                      setUpdatingDoc('hunterPhoto');
                                      fileInputRefs.current['hunterPhoto']?.click();
                                    }}
                                  >
                                    {(hunter as any)?.hunterPhoto ? 'Changer' : 'Ajouter'}
                                  </Button>
                                  {documentsByType['hunterPhoto'] && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 px-2 text-xs"
                                      onClick={() => handlePreview('hunterPhoto')}
                                    >
                                      Aperçu
                                    </Button>
                                  )}
                                  <input
                                    type="file"
                                    ref={el => fileInputRefs.current['hunterPhoto'] = el}
                                    className="hidden"
                                    accept=".jpg,.jpeg,.png"
                                    onChange={(e) => {
                                      if (e.target.files && e.target.files[0]) {
                                        setFileToUpload(e.target.files[0]);
                                        setUpdatingDoc('hunterPhoto');
                                      }
                                    }}
                                  />
                                </div>
                              </div>

                              {/* Timbre Impôt */}
                              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div>
                                  <p className="font-medium text-sm">Timbre Impôt</p>
                                  <p className="text-xs text-gray-500">Timbre fiscal obligatoire</p>
                                  {(attachmentData?.items?.find((item: any) => item.type === 'treasuryStamp')?.expiryDate || attachmentData?.items?.find((item: any) => item.type === 'treasuryStamp')?.present) && (
                                    <p className="text-xs text-gray-500 mt-1">
                                      {attachmentData.items.find((item: any) => item.type === 'treasuryStamp')?.expiryDate
                                        ? `Valable jusqu'au: ${format(new Date(attachmentData.items.find((item: any) => item.type === 'treasuryStamp')!.expiryDate), "dd/MM/yyyy")}`
                                        : 'Document fourni sans date d\'expiration'
                                      }
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {(() => {
                                    const status = getDocumentExpiryInfo('treasuryStamp');
                                    return (
                                      <div className="flex flex-col gap-1">
                                        <div className="flex gap-1">
                                          <span className={`px-2 py-1 text-xs rounded-full ${status.color}`}>
                                            {status.text}
                                          </span>
                                          {status.status === 'expired' && (
                                            <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">
                                              ⚠️ Expiré
                                            </span>
                                          )}
                                          {status.status === 'dueSoon' && (
                                            <span className="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-800">
                                              ⚠️ À mettre à jour
                                            </span>
                                          )}
                                        </div>
                                        {status.expiryDate && (
                                          <span className="text-xs text-gray-500">
                                            Expire le {formatExpiryDate(status.expiryDate)}
                                            {status.daysLeft !== undefined && status.daysLeft >= 0 && (
                                              <span className="ml-1">({status.daysLeft} jours)</span>
                                            )}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => {
                                      setUpdatingDoc('treasuryStamp');
                                      fileInputRefs.current['treasuryStamp']?.click();
                                    }}
                                  >
                                    {(hunter as any)?.treasuryStamp ? 'Changer' : 'Ajouter'}
                                  </Button>
                                  {documentsByType['treasuryStamp'] && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 px-2 text-xs"
                                      onClick={() => handlePreview('treasuryStamp')}
                                    >
                                      Aperçu
                                    </Button>
                                  )}
                                  <input
                                    type="file"
                                    ref={el => fileInputRefs.current['treasuryStamp'] = el}
                                    className="hidden"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={(e) => {
                                      if (e.target.files && e.target.files[0]) {
                                        setFileToUpload(e.target.files[0]);
                                        setUpdatingDoc('treasuryStamp');
                                      }
                                    }}
                                  />
                                </div>
                              </div>

                              {/* Quittance de l'Arme par le Trésor */}
                              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div>
                                  <p className="font-medium text-sm">Quittance de l'Arme par le Trésor</p>
                                  <p className="text-xs text-gray-500">Document officiel</p>
                                  {(attachmentData?.items?.find((item: any) => item.type === 'weaponReceipt')?.expiryDate || attachmentData?.items?.find((item: any) => item.type === 'weaponReceipt')?.present) && (
                                    <p className="text-xs text-gray-500 mt-1">
                                      {attachmentData.items.find((item: any) => item.type === 'weaponReceipt')?.expiryDate
                                        ? `Date: ${format(new Date(attachmentData.items.find((item: any) => item.type === 'weaponReceipt')!.expiryDate), "dd/MM/yyyy")}`
                                        : 'Document fourni sans date d\'expiration'
                                      }
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {(() => {
                                    const status = getDocumentExpiryInfo('weaponReceipt');
                                    return (
                                      <div className="flex flex-col gap-1">
                                        <div className="flex gap-1">
                                          <span className={`px-2 py-1 text-xs rounded-full ${status.color}`}>
                                            {status.text}
                                          </span>
                                          {status.status === 'expired' && (
                                            <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">
                                              ⚠️ Expiré
                                            </span>
                                          )}
                                          {status.status === 'dueSoon' && (
                                            <span className="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-800">
                                              ⚠️ À mettre à jour
                                            </span>
                                          )}
                                        </div>
                                        {status.expiryDate && (
                                          <span className="text-xs text-gray-500">
                                            {status.expiryDate && formatExpiryDate(status.expiryDate)}
                                            {status.daysLeft !== undefined && status.daysLeft >= 0 && (
                                              <span className="ml-1">({status.daysLeft} jours)</span>
                                            )}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => {
                                      setUpdatingDoc('weaponReceipt');
                                      fileInputRefs.current['weaponReceipt']?.click();
                                    }}
                                  >
                                    {(hunter as any)?.weaponReceipt ? 'Changer' : 'Ajouter'}
                                  </Button>
                                  {documentsByType['weaponReceipt'] && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 px-2 text-xs"
                                      onClick={() => handlePreview('weaponReceipt')}
                                    >
                                      Aperçu
                                    </Button>
                                  )}
                                  <input
                                    type="file"
                                    ref={el => fileInputRefs.current['weaponReceipt'] = el}
                                    className="hidden"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={(e) => {
                                      if (e.target.files && e.target.files[0]) {
                                        setFileToUpload(e.target.files[0]);
                                        setUpdatingDoc('weaponReceipt');
                                      }
                                    }}
                                  />
                                </div>
                              </div>

                              {/* Assurance */}
                              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div>
                                  <p className="font-medium text-sm">Assurance</p>
                                  <p className="text-xs text-gray-500">Assurance responsabilité civile</p>
                                  {(attachmentData?.items?.find((item: any) => item.type === 'insurance')?.expiryDate || attachmentData?.items?.find((item: any) => item.type === 'insurance')?.present) && (
                                    <p className="text-xs text-gray-500 mt-1">
                                      {attachmentData.items.find((item: any) => item.type === 'insurance')?.expiryDate
                                        ? `Valable jusqu'au: ${format(new Date(attachmentData.items.find((item: any) => item.type === 'insurance')!.expiryDate), "dd/MM/yyyy")}`
                                        : 'Document fourni sans date d\'expiration'
                                      }
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {(() => {
                                    const status = getDocumentExpiryInfo('insurance');
                                    return (
                                      <div className="flex flex-col gap-1">
                                        <div className="flex gap-1">
                                          <span className={`px-2 py-1 text-xs rounded-full ${status.color}`}>
                                            {status.text}
                                          </span>
                                          {status.status === 'expired' && (
                                            <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">
                                              ⚠️ Expiré
                                            </span>
                                          )}
                                          {status.status === 'dueSoon' && (
                                            <span className="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-800">
                                              ⚠️ À mettre à jour
                                            </span>
                                          )}
                                        </div>
                                        {status.expiryDate && (
                                          <span className="text-xs text-gray-500">
                                            Expire le {formatExpiryDate(status.expiryDate)}
                                            {status.daysLeft !== undefined && status.daysLeft >= 0 && (
                                              <span className="ml-1">({status.daysLeft} jours)</span>
                                            )}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => {
                                      setUpdatingDoc('insurance');
                                      fileInputRefs.current['insurance']?.click();
                                    }}
                                  >
                                    {(hunter as any)?.insurance ? 'Changer' : 'Ajouter'}
                                  </Button>
                                  {documentsByType['insurance'] && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 px-2 text-xs"
                                      onClick={() => handlePreview('insurance')}
                                    >
                                      Aperçu
                                    </Button>
                                  )}
                                  <input
                                    type="file"
                                    ref={el => fileInputRefs.current['insurance'] = el}
                                    className="hidden"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={(e) => {
                                      if (e.target.files && e.target.files[0]) {
                                        setFileToUpload(e.target.files[0]);
                                        setUpdatingDoc('insurance');
                                      }
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Documents optionnels */}
                          <div>
                            <h4 className="text-md font-medium text-gray-700 mb-3">Documents Optionnels</h4>
                            <div className="grid grid-cols-1 gap-3">
                              {/* Certificat de Bonne Vie et Mœurs */}
                              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                                <div>
                                  <p className="font-medium text-sm">Certificat de Bonne Vie et Mœurs</p>
                                  <p className="text-xs text-gray-500">Document optionnel mais recommandé</p>
                                  {(attachmentData?.items?.find((item: any) => item.type === 'moralCertificate')?.present) && (
                                    <p className="text-xs text-gray-500 mt-1">
                                      Document fourni
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-1 text-xs rounded-full ${documentsByType['moralCertificate']
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-gray-100 text-gray-600'
                                    }`}>
                                    {documentsByType['moralCertificate'] ? '✅ Fourni' : '⚪ Optionnel'}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => {
                                      setUpdatingDoc('moralCertificate');
                                      fileInputRefs.current['moralCertificate']?.click();
                                    }}
                                  >
                                    {(hunter as any)?.moralCertificate ? 'Changer' : 'Ajouter'}
                                  </Button>
                                  {documentsByType['moralCertificate'] && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 px-2 text-xs"
                                      onClick={() => handlePreview('moralCertificate')}
                                    >
                                      Aperçu
                                    </Button>
                                  )}
                                  <input
                                    type="file"
                                    ref={el => fileInputRefs.current['moralCertificate'] = el}
                                    className="hidden"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={(e) => {
                                      if (e.target.files && e.target.files[0]) {
                                        setFileToUpload(e.target.files[0]);
                                        setUpdatingDoc('moralCertificate');
                                      }
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="permits">
                <Card>
                  <CardContent className="pt-6">
                    {permits.length === 0 ? (
                      <p className="text-center py-4 text-gray-500">Aucun permis trouvé pour ce chasseur</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-gray-500">N° Permis</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-500">Type</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-500">Prix</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-500">Date Émission</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-500">Date Expiration</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-500">Statut</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-500">Émetteur</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-500">Taxes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {permits.map((permit: any) => {
                              const isExpired = permit.expiryDate && new Date(permit.expiryDate) < new Date();
                              const status = isExpired ? "Expiré" : permit.status === "active" ? "Actif" : "Suspendu";
                              const statusClass =
                                status === "Actif" ? "bg-green-100 text-green-800" :
                                  status === "Expiré" ? "bg-red-100 text-red-800" :
                                    "bg-orange-100 text-orange-800";

                              return (
                                <tr key={permit.id} className="border-t border-gray-200">
                                  <td className="px-3 py-3 font-medium">{permit.permitNumber}</td>
                                  <td className="px-3 py-3">
                                    {permit.type === "petite-chasse"
                                      ? "Petite Chasse"
                                      : permit.type === "grande-chasse"
                                        ? "Grande Chasse"
                                        : "Gibier d'Eau"}
                                  </td>
                                  <td className="px-3 py-3">
                                    {Number(permit.price).toLocaleString()} FCFA
                                  </td>
                                  <td className="px-3 py-3">
                                    {permit.issueDate ? format(new Date(permit.issueDate), "dd/MM/yyyy") : "Non renseignée"}
                                  </td>
                                  <td className="px-3 py-3">
                                    {permit.expiryDate ? format(new Date(permit.expiryDate), "dd/MM/yyyy") : "Non renseignée"}
                                  </td>
                                  <td className="px-3 py-3">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}`}>
                                      {status}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 text-sm text-gray-700">
                                    {((permit as any).issuerFirstName || (permit as any).issuerLastName) ? (
                                      <div className="flex flex-col">
                                        <span className="font-medium">{`${(permit as any).issuerFirstName || ''} ${(permit as any).issuerLastName || ''}`.trim()}</span>
                                        <span className="text-xs text-gray-500">
                                          {computeServiceLocation((permit as any).issuerRole, (permit as any).issuerRegion, (permit as any).issuerZone, (permit as any).issuerDepartement)}
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-gray-400">—</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-3">
                                    {hasTaxesMap[permit.id] ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => openTaxesModal(permit.id, permit.permitNumber)}
                                        className="gap-1 text-xs"
                                      >
                                        <FileText className="h-3 w-3" />
                                        Voir taxes
                                      </Button>
                                    ) : (
                                      <span className="text-gray-400">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="text-center py-8">Chasseur non trouvé</div>
          )}

          {hunter && (
            <DialogFooter className="gap-2 flex-wrap">
              {/* Bouton d'édition */}
              <Button
                variant="outline"
                onClick={() => setShowEditForm(true)}
                className="gap-2"
              >
                <Edit className="h-4 w-4" />
                Modifier
              </Button>

              {/* If current user is an admin or an agent and admin enabled the feature, show Permis button */}
              {(
                (typeof user?.role === 'string') &&
                ((user.role === 'admin') || user.role.includes('agent')) &&
                agentPermitAccess?.enabled
              ) && (
                <Button
                  variant="outline"
                  disabled={loadingPermits || !(Array.isArray(permits) && (permits as any[]).length > 0)}
                  title={loadingPermits ? 'Chargement des permis…' : ((Array.isArray(permits) && (permits as any[]).length > 0) ? 'Voir les détails des permis' : 'Aucun permis disponible')}
                  onClick={() => {
                    const list = Array.isArray(permits) ? (permits as any[]) : [];
                    if (list.length === 0) {
                      toast({ title: 'Aucun permis', description: 'Ce chasseur ne possède aucun permis.', variant: 'destructive' });
                      return;
                    }
                    if (list.length === 1) {
                      const only = list[0];
                      if (only && only.id) {
                        setPermitIdToView(Number(only.id));
                        setShowPermitDetailsModal(true);
                        return;
                      }
                    }
                    // Plusieurs permis -> ouvrir le sélecteur
                    setShowPermitPicker(true);
                  }}
                  className="gap-2 disabled:opacity-60"
                >
                  <FileText className="h-4 w-4" />
                  Permis
                </Button>
              )}

              {/* Boutons de suspension/réactivation */}
              {hunter.isActive ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    blurActiveElement();
                    setSuspendConfirm(true);
                  }}
                  disabled={!perms.canSuspendHunter}
                  title={!perms.canSuspendHunter ? "Vous n'avez pas l'autorisation de suspendre un chasseur." : undefined}
                  className="gap-2 border-orange-500 text-orange-500 hover:bg-orange-50 disabled:opacity-60"
                >
                  <Ban className="h-4 w-4" />
                  Suspendre
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    blurActiveElement();
                    setReactivateConfirm(true);
                  }}
                  disabled={!perms.canReactivateHunter}
                  title={!perms.canReactivateHunter ? "Vous n'avez pas l'autorisation de réactiver un chasseur." : undefined}
                  className="gap-2 border-green-500 text-green-500 hover:bg-green-50 disabled:opacity-60"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Réactiver
                </Button>
              )}



              {/* Bouton de suppression */}
              <Button
                variant="destructive"
                onClick={() => {
                  blurActiveElement();
                  setShowDeleteConfirm(true);
                }}
                disabled={!perms.canDeleteHunter}
                title={!perms.canDeleteHunter ? "Vous n'avez pas l'autorisation de supprimer un chasseur." : undefined}
                className="gap-2 disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                Supprimer
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Hunter Form */}
      {showEditForm && hunter && (
        <HunterForm
          hunterId={hunterId}
          open={showEditForm}
          onClose={() => setShowEditForm(false)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer ce chasseur ? Cette action ne peut pas être annulée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteLoading || !perms.canDeleteHunter}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteLoading ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Force Delete Confirmation Dialog (when hunter has active permits) */}
      <AlertDialog open={showForceDeleteConfirm} onOpenChange={setShowForceDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suppression forcée</AlertDialogTitle>
            <AlertDialogDescription>
              Ce chasseur possède des permis actifs. La suppression forcée supprimera le chasseur et tous ses permis associés. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleForceDelete}
              disabled={deleteLoading || !perms.canDeleteHunter}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteLoading ? "Suppression..." : "Supprimer définitivement"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Suspend Confirmation Dialog */}
      <AlertDialog open={suspendConfirm} onOpenChange={setSuspendConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suspension</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir suspendre ce chasseur ? Le chasseur ne pourra plus se connecter au système et ses permis associés seront suspendus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={suspendLoading}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSuspend}
              disabled={suspendLoading || !perms.canSuspendHunter}
              className="bg-orange-500 text-white hover:bg-orange-600"
            >
              {suspendLoading ? "Suspension..." : "Suspendre"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reactivate Confirmation Dialog */}
      <AlertDialog open={reactivateConfirm} onOpenChange={setReactivateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la réactivation</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir réactiver ce chasseur ? Le chasseur pourra à nouveau se connecter au système et ses permis associés seront réactivés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reactivateLoading}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReactivate}
              disabled={reactivateLoading || !perms.canReactivateHunter}
              className="bg-green-500 text-white hover:bg-green-600"
            >
              {reactivateLoading ? "Réactivation..." : "Réactiver"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal des taxes associées au permis */}
      <Dialog open={showTaxesModal} onOpenChange={setShowTaxesModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Taxes associées au permis {selectedPermitNumber}
            </DialogTitle>
            <DialogDescription>
              Liste des taxes d'abattage associées à ce permis de chasse
            </DialogDescription>
          </DialogHeader>

          {loadingTaxes ? (
            <div className="flex justify-center py-8">Chargement des taxes...</div>
          ) : taxesForPermit.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Aucune taxe d'abattage associée à ce permis
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">N° Taxe</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Date</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Animal</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Quantité</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">N° Quittance</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Émetteur</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {taxesForPermit.map((tax) => (
                    <tr key={tax.id} className="border-t border-gray-200">
                      <td className="px-3 py-3 font-medium">{tax.taxNumber}</td>
                      <td className="px-3 py-3">
                        {tax.issueDate ? format(new Date(tax.issueDate), "dd/MM/yyyy") : "Non renseignée"}
                      </td>
                      <td className="px-3 py-3 capitalize">{tax.animalType}</td>
                      <td className="px-3 py-3">{tax.quantity}</td>
                      <td className="px-3 py-3">{tax.receiptNumber}</td>
                      <td className="px-3 py-3">
                        {computeServiceLocation(tax.issuerRole, tax.issuerRegion, (tax as any).issuerZone, (tax as any).issuerDepartement)}
                      </td>
                      <td className="px-3 py-3 font-medium">
                        {Number(tax.amount).toLocaleString()} FCFA
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTaxesModal(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
