import RegisterForm from '@/components/auth/RegisterForm';
import HunterLayout, { Badge, EmptyState, ErrorState, LoadingState, StatCard } from '@/components/layout/HunterLayout';
import AgentTopHeader from '@/components/layout/AgentTopHeader';
import AlerteDomainActionCard from '@/components/alerte/AlerteDomainActionCard';
import { FileUploadDialog } from '@/components/hunters/FileUploadDialog';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/api';
import { getApiBaseUrl, getAppLogo } from '@/utils/environment';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  ShieldCheck,
  Home,
  CreditCard,
  FolderOpen,
  Lock,
  User,
  Plus,
  X,
  Crosshair,
  BookOpen,
  Users,
  ChevronRight
} from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

// Types pour les permis du chasseur
interface HunterPermit {
  id: number;
  permitNumber: string;
  type: string;
  categoryId?: string;
  issueDate: string;
  expiryDate: string;
  status: 'active' | 'expired' | 'suspended';
  price: number;
  hunterId: number;
  receiptNumber?: string;
  renewals?: any[];
  renewalCount?: number;
  metadata?: {
    renewals?: any[];
    renewalCount?: number;
    createdByUser?: {
      firstName?: string;
      lastName?: string;
      departement?: string;
      region?: string;
    };
  };
}

// Type pour les informations du chasseur
interface HunterInfo {
  id: number;
  firstName: string;
  lastName: string;
  idNumber: string;
  category: string;
  phone: string;
  address: string;
  region: string;
  experience: number;
  profession: string;
  weaponType?: string;
  weaponBrand?: string;
  weaponCaliber?: string;
  weaponReference?: string;
  weaponOtherDetails?: string;
};

// Types pour les documents
type HunterDocument = {
  id: string;
  hunterId: number;
  documentType: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
};

// Composants spécifiques au dashboard

const PermitCard = ({ item, onViewDetails, user }: { item: HunterPermit, onViewDetails: (permit: HunterPermit) => void, user: any }) => {
  // Calculer le nombre de renouvellements
  const renewalCount = item.renewalCount ||
                      item.metadata?.renewalCount ||
                      (Array.isArray(item.renewals) ? item.renewals.length : 0) ||
                      (Array.isArray(item.metadata?.renewals) ? item.metadata.renewals.length : 0);

  // Utiliser le statut calculé côté serveur (plus de calcul côté client)
  const isExpired = item.status === 'expired';
  const isSuspended = item.status === 'suspended';
  const isActive = item.status === 'active';

  // Limite de renouvellement (généralement 2)
  const renewalLimit = 2;
  const hasReachedRenewalLimit = renewalCount >= renewalLimit;

  // Un permis est épuisé seulement si la limite de renouvellement est atteinte ET qu'il est expiré
  const isExhausted = hasReachedRenewalLimit && isExpired;

  const getStatusBadge = (status: string) => {
    if (isExhausted) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
          Épuisé
        </span>
      );
    }

    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
            Actif
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
            Expiré
          </span>
        );
      case 'suspended':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
            Suspendu
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
            {status}
          </span>
        );
    }
  };

  const getCategoryLabel = (categoryId: string | undefined, type: string) => {
    if (categoryId === 'touriste-gibier-eau-1mois') return 'touriste-gibier-eau-1mois';
    if (categoryId === 'grande-chasse') return 'grande-chasse';
    if (categoryId === 'petite-chasse') return 'petite-chasse';
    return categoryId || type || 'Non défini';
  };

  // Classes CSS conditionnelles pour les permis épuisés (format carte moyenne adaptable à tout écran)
  const cardClasses = isExhausted
    ? "w-full sm:max-w-[380px] rounded-2xl border border-slate-300 bg-slate-100 overflow-hidden opacity-65 cursor-not-allowed transition-all"
    : "w-full sm:max-w-[380px] rounded-2xl border border-emerald-200 bg-gradient-to-br from-white via-emerald-50/40 to-emerald-50 overflow-hidden shadow-sm hover:shadow-md hover:border-emerald-300 transition-all cursor-pointer";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      onClick={isExhausted ? undefined : () => onViewDetails(item)}
      className={cardClasses}
    >
      {/* Barre d'accentuation supérieure */}
      <div className={`h-1.5 w-full ${isExhausted ? 'bg-slate-400' : 'bg-gradient-to-r from-[#0b3d2e] via-emerald-600 to-emerald-500'}`} />

      <div className="p-4 flex flex-col gap-3">
        {/* Ligne du haut : Numéro de permis et badge statut */}
        <div className="flex items-center justify-between gap-2">
          <div className={`font-bold text-sm tracking-tight ${isExhausted ? 'text-slate-500' : 'text-slate-900'}`}>
            N° {item.permitNumber}
          </div>
          {getStatusBadge(item.status)}
        </div>

        {/* Numéro de quittance avec fond jaune */}
        {item.receiptNumber && (
          <div>
            <span className="inline-flex items-center px-2.5 py-1 text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 rounded-lg">
              Quittance : {item.receiptNumber}
            </span>
          </div>
        )}

        {/* Catégorie et date de délivrance */}
        <div className={`flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm ${isExhausted ? 'text-slate-400' : 'text-slate-600'}`}>
          <div>
            <span className="text-slate-400">Catégorie :</span>{' '}
            <span className="font-medium capitalize text-slate-700">{getCategoryLabel(item.categoryId, item.type)}</span>
          </div>
          {item.issueDate && (
            <div className="text-xs text-slate-500">
              <span className="text-slate-400">Délivré le :</span>{' '}
              <span className="font-medium text-slate-700">
                {format(new Date(item.issueDate), "dd/MM/yyyy")}
              </span>
            </div>
          )}
        </div>

        {/* Messages d'état du permis */}
        {isExhausted && (
          <div>
            <span className="inline-block px-2 py-1 text-xs font-medium bg-red-100 text-red-700 border border-red-200 rounded-lg">
              ⚠️ Permis épuisé - Limite de renouvellement atteinte et expiré
            </span>
          </div>
        )}
        {hasReachedRenewalLimit && !isExpired && (
          <div>
            <span className="inline-block px-2 py-1 text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200 rounded-lg">
              ⚠️ Limite de renouvellement atteinte - Sera épuisé à l&apos;expiration
            </span>
          </div>
        )}

        {/* Ligne du bas : Nom du chasseur et bouton Voir */}
        <div className="pt-2.5 border-t border-emerald-100 flex items-center justify-between gap-2">
          <div className={`text-sm font-semibold truncate ${isExhausted ? 'text-slate-400' : 'text-slate-800'}`}>
            {user?.firstName} {user?.lastName}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!isExhausted) onViewDetails(item);
            }}
            disabled={isExhausted}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors shrink-0 ${
              isExhausted
                ? 'text-slate-400 bg-slate-200/70 cursor-not-allowed'
                : 'text-emerald-800 bg-emerald-100/80 hover:bg-emerald-700 hover:text-white'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Voir
          </button>
        </div>
      </div>
    </motion.div>
  );
};

const DocumentCard = ({
  doc,
  onView,
  isInvalidated,
}: {
  doc: HunterDocument;
  onView: (doc: HunterDocument) => void;
  isInvalidated?: boolean;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35 }}
    onClick={() => onView(doc)}
    className={`w-full sm:max-w-[380px] rounded-2xl border overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col ${
      isInvalidated
        ? 'border-red-300 bg-gradient-to-br from-white via-red-50/40 to-red-50'
        : 'border-slate-200 bg-white hover:border-emerald-300'
    }`}
  >
    <div
      className={`h-1.5 w-full ${
        isInvalidated
          ? 'bg-gradient-to-r from-red-600 to-red-400'
          : 'bg-gradient-to-r from-[#0b3d2e] via-emerald-600 to-emerald-500'
      }`}
    />
    <div className="p-4 flex flex-col gap-3 flex-1">
      <div className="flex items-center gap-3">
        <div
          className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${
            isInvalidated
              ? 'bg-red-100 border-red-200 text-red-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <FileText className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm text-slate-800 flex items-center gap-1.5 flex-wrap">
            <span className="truncate">{getDocumentLabel(doc.documentType)}</span>
            {isInvalidated && (
              <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-full bg-red-100 text-red-700 border border-red-200">
                Invalidée — à corriger
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 truncate">{doc.fileName}</div>
        </div>
      </div>

      <div className="pt-2.5 mt-auto border-t border-slate-100 flex items-center justify-between gap-2">
        <div className="text-[11px] text-slate-500 truncate">
          {formatFileSize(doc.fileSize)} • {formatDate(doc.uploadedAt)}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onView(doc);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-emerald-800 bg-emerald-100/80 hover:bg-emerald-700 hover:text-white transition-colors shrink-0"
        >
          <Eye className="w-3.5 h-3.5" /> Voir
        </button>
      </div>
    </div>
  </motion.div>
);


// Fonctions utilitaires
const getDocumentLabel = (documentType: string): string => {
  if (documentType.startsWith('moralCertificate_') || documentType.startsWith('otherDocument_')) {
    return 'Autre document justificatif';
  }
  const labels: { [key: string]: string } = {
    'idCardDocument': 'Pièce d\'identité',
    'weaponPermit': 'Permis d\'arme',
    'hunterPhoto': 'Photo du chasseur',
    'treasuryStamp': 'Timbre du trésor',
    'weaponReceipt': 'Reçu d\'arme',
    'insurance': 'Assurance',
    'moralCertificate': 'Club de Tir (carte) / ou Justificatif',
    'other': 'Autre document justificatif'
  };
  return labels[documentType] || documentType;
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const getDocumentViewUrl = (doc: HunterDocument): string => {
  const baseUrl = getApiBaseUrl();
  if (doc.id.startsWith('other_')) {
    return `${baseUrl}/hunter-documents/${doc.hunterId}/${doc.documentType}?inline=1`;
  }
  return `${baseUrl}/attachments/${doc.hunterId}/${doc.documentType}?inline=1`;
};

export default function HunterDashboard() {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedDocument, setSelectedDocument] = useState<HunterDocument | null>(null);
  const [selectedPermit, setSelectedPermit] = useState<HunterPermit | null>(null);
  const [hunterInfo, setHunterInfo] = useState<HunterInfo | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [hunterPhotoUrl, setHunterPhotoUrl] = useState<string | null>(null);
  const [showCompletionModal, setShowCompletionModal] = useState<boolean>(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);

  const handleFileUpload = async (file: File, meta?: { expiryDate?: string; type?: string }) => {
    if (!user?.hunterId || !meta?.type) return;
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', meta.type);
      if (meta.expiryDate) formData.append('expiryDate', meta.expiryDate);
      
      const res = await apiRequest<any>('POST', `/api/attachments/${user.hunterId}`, formData);
      // We don't check res.ok if the API wrapper throws on error or returns data directly.
      // Usually apiRequest from '@/lib/api' throws on non-ok status if used correctly, or we check if there's an error.
      await queryClient.invalidateQueries({ queryKey: ['hunter-documents'] });
      await queryClient.invalidateQueries({ queryKey: ['hunter-dossier-status'] });
      
      toast({ title: 'Succès', description: 'Le document a été téléversé avec succès' });
      setIsUploadDialogOpen(false);
    } catch (error: any) {
      console.error('Error uploading file:', error);
      toast({
        title: 'Erreur',
        description: error?.message || 'Impossible de téléverser le document',
        variant: 'destructive',
      });
    }
  };

  const [isProfileComplete, setIsProfileComplete] = useState<boolean>(true);
  const [completionStatusLoading, setCompletionStatusLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'home' | 'permits' | 'documents'>('home');
  const [permitsSubTab, setPermitsSubTab] = useState<'permits' | 'taxes'>('permits');
  const [showFabMenu, setShowFabMenu] = useState(false);

  // Sync activeTab with URL path
  useEffect(() => {
    if (location === '/hunter/permits') {
      setActiveTab('permits');
    } else if (location === '/hunter/documents') {
      setActiveTab('documents');
    } else if (location === '/hunter' || location === '/hunter/home') {
      setActiveTab('home');
    }
  }, [location]);

  // Cleanup function for photo URL to prevent memory leaks
  useEffect(() => {
    return () => {
      if (hunterPhotoUrl) {
        URL.revokeObjectURL(hunterPhotoUrl);
      }
    };
  }, [hunterPhotoUrl]);

  // Vérifier la complétion du profil chasseur via l'API
  useEffect(() => {
    const checkCompletionStatus = async () => {
      if (!user || user.role !== 'hunter') {
        setShowCompletionModal(false);
        setCompletionStatusLoading(false);
        return;
      }

      try {
        const response = await apiRequest<{
          hasHunterProfile: boolean;
          isComplete: boolean;
          missingFields: string[];
          details: {
            nationality: string | null;
            category: string | null;
            dateOfBirth: string | null;
            age: number | null;
          };
        }>('GET', '/api/hunters/me/completion-status');

        if (response && response.ok && response.data) {
          const isComplete = response.data.hasHunterProfile && response.data.isComplete;
          setIsProfileComplete(isComplete);
        } else {
          // Fallback: si pas de réponse, on considère incomplet par sécurité
          setIsProfileComplete(false);
        }
      } catch (error) {
        console.error('Erreur lors de la vérification du statut de complétion:', error);
        // Fallback: pas de modal en cas d'erreur
        setShowCompletionModal(false);
      } finally {
        setCompletionStatusLoading(false);
      }
    };

    checkCompletionStatus();
  }, [user]);

  // Signaler au Header de masquer/afficher les boutons selon l'état du modal
  useEffect(() => {
    const evtNameRefresh = showCompletionModal ? 'hide-refresh' : 'show-refresh';
    const evtNameLogout = showCompletionModal ? 'hide-logout' : 'show-logout';
    window.dispatchEvent(new Event(evtNameRefresh));
    window.dispatchEvent(new Event(evtNameLogout));
    if (showCompletionModal) {
      // Message d'accompagnement pour guider l'utilisateur
      try {
        toast({
          title: "Bienvenue",
          description: "Complétez votre profil chasseur pour accéder à toutes les fonctionnalités.",
        });
      } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  }
    }
    return () => {
      // En cas de démontage, réafficher par défaut
      window.dispatchEvent(new Event('show-refresh'));
      window.dispatchEvent(new Event('show-logout'));
    };
  }, [showCompletionModal]);

  // Récupération des permis
  const { data: permits = [], isLoading: permitsLoading, error: permitsError } = useQuery({
    queryKey: ['hunter-permits'],
    queryFn: async () => {
      console.log('[Dashboard] Récupération des permis pour user:', user);
      console.log('[Dashboard] hunterId:', user?.hunterId);
      const response = await apiRequest<HunterPermit[]>('GET', '/api/permits/hunter/my-permits');
      console.log('[Dashboard] Réponse API permis:', response);
      if (!response) {
        throw new Error('Erreur lors du chargement des permis');
      }
      // Si l'API répond avec une erreur (ex: 404 pour nouveau compte), retourner un tableau vide
      if ((response as any).ok === false) {
        return [] as HunterPermit[];
      }
      const permits = Array.isArray(response) ? response : (response as any)?.data || [];
      console.log('[Dashboard] Permis traités:', permits);
      return permits;
    },
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  // Récupération des documents
  const { data: documents = [], isLoading: documentsLoading, error: documentsError } = useQuery({
    queryKey: ['hunter-documents'],
    queryFn: async () => {
      const response = await apiRequest<HunterDocument[]>('GET', '/api/hunters/my-documents');
      if (!response) {
        throw new Error('Erreur lors du chargement des documents');
      }
      // Si l'API répond avec une erreur (ex: 400/404 pour nouveau compte), retourner []
      if ((response as any).ok === false) {
        return [] as HunterDocument[];
      }
      return Array.isArray(response) ? response : (response as any)?.data || [];
    },
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  // Vérification de l'association avec un guide
  const { data: guideStatus } = useQuery({
    queryKey: ['hunter-active-guide'],
    queryFn: async () => {
      const response = await apiRequest<{ hasActiveGuide: boolean }>('GET', '/api/hunters/me/active-guide');
      if (response && response.ok && response.data) {
        return response.data;
      }
      return { hasActiveGuide: false };
    },
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  // Statut de vérification / validation du dossier par l'administration (tenant compte de la campagne)
  const { data: dossierStatus } = useQuery({
    queryKey: ['hunter-dossier-status'],
    queryFn: async () => {
      try {
        const response: any = await apiRequest('GET', '/api/hunters/me/dossier-status');
        const payload = response?.data || response;
        if (payload?.status) {
          return payload as {
            status: 'pending' | 'validated' | 'rejected';
            invalidatedDocs: string[];
            reason: string | null;
            campaignOpen?: boolean;
            campaignYear?: string | null;
            expiredForNewCampaign?: boolean;
          };
        }
      } catch {
        // Fallback sécurisé : en attente
      }
      return {
        status: 'pending' as const,
        invalidatedDocs: [] as string[],
        reason: null as string | null,
        campaignOpen: true,
        campaignYear: null as string | null,
        expiredForNewCampaign: false,
      };
    },
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });

  // Taxes d'abattage payées par le chasseur (liées à ses permis)
  const { data: hunterTaxes = [], isLoading: taxesLoading } = useQuery({
    queryKey: ['hunter-taxes', user?.hunterId],
    enabled: Boolean(user?.hunterId),
    queryFn: async () => {
      try {
        const response: any = await apiRequest('GET', `/api/taxes/hunter/${user?.hunterId}`);
        if (Array.isArray(response)) return response;
        if (Array.isArray(response?.data)) return response.data;
        return [];
      } catch {
        return [];
      }
    },
    refetchOnMount: 'always',
    staleTime: 15_000,
  });

  // Filtrage des permis par statut (utilisant les statuts calculés côté serveur)
  // Toujours opérer sur des tableaux pour éviter les erreurs de type
  const permitsArr = Array.isArray(permits) ? permits : [];
  const documentsArr = Array.isArray(documents) ? documents : [];
  const taxesArr = Array.isArray(hunterTaxes) ? hunterTaxes : [];

  const activePermits = permitsArr.filter((p: HunterPermit) => {
    console.log(`[Dashboard] Filtrage permis ${p.permitNumber}: status=${p.status}, expiryDate=${p.expiryDate}`);
    return p.status === 'active';
  });
  const expiredPermits = permitsArr.filter((p: HunterPermit) => p.status === 'expired');
  const suspendedPermits = permitsArr.filter((p: HunterPermit) => p.status === 'suspended');

  console.log('[Dashboard] Permis actifs:', activePermits.length, activePermits);
  console.log('[Dashboard] Permis expirés:', expiredPermits.length);
  console.log('[Dashboard] Permis suspendus:', suspendedPermits.length);

  // Calcul des permis arrivant à expiration (parmi les actifs, vérifier la date)
  const expiringSoonPermits = activePermits.filter((p: HunterPermit) => {
    const expiryDate = new Date(p.expiryDate);
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return expiryDate <= thirtyDaysFromNow;
  });

  const handleViewDocument = (doc: HunterDocument) => {
    setSelectedDocument(doc);
  };

  const handleDownloadPermit = () => {
    const permitCard = document.getElementById('permit-card');
    if (permitCard && selectedPermit) {
      html2canvas(permitCard, { scale: 2 }).then((canvas: any) => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a6'); // A6 size for a small card
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`permis-${selectedPermit.permitNumber}.pdf`);
      });
    }
  };

  const handleViewPermitDetails = async (permit: HunterPermit) => {
    setSelectedPermit(permit);

    // Charger les informations complètes du chasseur depuis la table hunters
    try {
      console.log('[DEBUG] Récupération chasseur ID:', permit.hunterId);
      const hunterResponse = await apiRequest<HunterInfo>('GET', `/api/hunters/${permit.hunterId}`);
      console.log('[DEBUG] Réponse API chasseur:', hunterResponse);
      if (hunterResponse) {
        // La réponse de l'API est dans le format {ok: true, data: {...}}
        const hunter = (hunterResponse as any).data || hunterResponse;
        console.log('[DEBUG] Données chasseur traitées:', hunter);
        setHunterInfo(hunter as HunterInfo);

        // Charger la photo du chasseur
        try {
          const baseUrl = getApiBaseUrl();
          const photoUrl = `${baseUrl}/attachments/${permit.hunterId}/hunterPhoto?inline=1`;

          const photoResponse = await fetch(photoUrl, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          if (photoResponse.ok) {
            const blob = await photoResponse.blob();
            const photoUrl = URL.createObjectURL(blob);
            setHunterPhotoUrl(photoUrl);
          } else {
            // Photo non disponible, utiliser l'icône par défaut
            setHunterPhotoUrl(null);
          }
        } catch (error) {
          // Erreur de réseau ou endpoint non implémenté
          console.log('[DEBUG] Erreur photo:', error);
          setHunterPhotoUrl(null);
        }

        // Générer le QR Code avec le format exact demandé
        const hunterData = hunter as HunterInfo;
        const renewalCount = permit.renewalCount ||
                           permit.metadata?.renewalCount ||
                           (Array.isArray(permit.renewals) ? permit.renewals.length : 0) ||
                           (Array.isArray(permit.metadata?.renewals) ? permit.metadata.renewals.length : 0);

        const emetteur = permit.metadata?.createdByUser?.region ?
          `Service des Eaux et Forêts IREF/${permit.metadata.createdByUser.region}` :
          permit.metadata?.createdByUser?.departement ?
          `Service des Eaux et Forêts Secteur/${permit.metadata.createdByUser.departement}` :
          'Service des Eaux et Forêts DEFCCS';

        let qrData = `Numéro de Permis: ${permit.permitNumber}\n` +
          `Nom: ${hunterData.lastName}\n` +
          `Prénom: ${hunterData.firstName}\n` +
          `N° Pièce d'identité: ${hunterData.idNumber}\n` +
          `Type de permis: ${permit.categoryId || permit.type}\n` +
          `Date d'émission: ${new Date(permit.issueDate).toLocaleDateString('fr-FR')}\n` +
          `Date d'expiration: ${new Date(permit.expiryDate).toLocaleDateString('fr-FR')}\n` +
          `Prix: ${Number(permit.price).toLocaleString()} FCFA\n` +
          `N° Quittance: ${permit.receiptNumber || ''}\n` +
          `Émetteur: ${emetteur}\n`;

        // Ajouter les informations d'armes si disponibles
        if (hunterData.weaponType && hunterData.weaponType !== 'nan') {
          qrData += `Information de l'arme:\n`;
          qrData += `Type: ${hunterData.weaponType}\n`;
          if (hunterData.weaponBrand && hunterData.weaponBrand !== 'nan') {
            qrData += `Marque: ${hunterData.weaponBrand}\n`;
          }
          if (hunterData.weaponCaliber && hunterData.weaponCaliber !== 'nan') {
            qrData += `Calibre: ${hunterData.weaponCaliber}\n`;
          }
          if (hunterData.weaponReference && hunterData.weaponReference !== 'nan') {
            qrData += `Référence: ${hunterData.weaponReference}\n`;
          }
          qrData += `\n`;
        }

        // Ajouter les renouvellements
        if (renewalCount > 0) {
          qrData += `Renouvellements (${renewalCount}):\n`;
          qrData += `  1. ${new Date(permit.issueDate).toLocaleDateString('fr-FR')} ${new Date(permit.issueDate).toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})} - Par: ${permit.metadata?.createdByUser?.firstName || 'Admin'} ${permit.metadata?.createdByUser?.lastName || 'SENE'} - ${emetteur}\n`;
        }

        qrData += `Statut: ${permit.status === 'active' ? 'Actif' : permit.status === 'suspended' ? 'Suspendu' : 'Expiré'}`;

        // Générer l'image QR Code puis superposer le logo au centre
        try {
          const baseQrUrl = await QRCode.toDataURL(qrData, {
            width: 300,
            margin: 1,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          });

          // Charger le QR généré
          const qrImg = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = baseQrUrl;
          });

          const size = 300;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            setQrCodeUrl(baseQrUrl);
            return;
          }
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

          const logoScale = 0.15;
          const logoW = Math.floor(size * logoScale);
          const logoH = Math.floor(size * logoScale);
          const logoX = Math.floor((size - logoW) / 2);
          const logoY = Math.floor((size - logoH) / 2);
          // Dessiner le logo sans fond blanc pour conserver l'image originale
          ctx.drawImage(logoImg, logoX, logoY, logoW, logoH);

          const composedUrl = canvas.toDataURL('image/png');
          setQrCodeUrl(composedUrl);
          console.log('[DEBUG] QR Code composé avec logo généré avec succès');
        } catch (qrError) {
          console.error('[DEBUG] Erreur génération/overlay QR Code:', qrError);
          setQrCodeUrl('');
        }
       } else {
        console.log('[DEBUG] Aucune réponse du serveur pour le chasseur');
      }
    } catch (error) {
      console.error('[DEBUG] Erreur lors du chargement des informations du chasseur:', error);
      setHunterInfo(null);
    }
  };

  if (permitsLoading || documentsLoading || completionStatusLoading) {
    return (
      <div className="fixed inset-0 flex flex-col overflow-hidden bg-slate-50">
        <AgentTopHeader />
        <div className="flex-1 flex items-center justify-center">
          <LoadingState message="Chargement de votre espace chasseur..." />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-slate-50">
      <AgentTopHeader />
      
      <div className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden no-scrollbar overscroll-contain px-4 pb-36 pt-4">
        
        {activeTab === 'home' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            {/* Logo and Title */}
            <div className="flex flex-col items-center gap-3 pb-2 pt-2">
              <img
                src="/assets/logoprojets/Sans fond_Scodi/android-chrome-512x512.png"
                alt="ScoDi"
                className="h-16 object-contain"
              />
              <p className="max-w-xs text-center text-[11px] font-bold leading-tight text-gray-700">
                Système de Contrôle et de Digitalisation
              </p>
            </div>

            {/* Bandeau statut de validation du dossier */}
            {isProfileComplete && (
              <div className="mx-auto w-full max-w-md">
                {dossierStatus?.campaignOpen === false ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-xs text-slate-700 flex items-start gap-2">
                    <Lock className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                    <span>
                      Campagne de chasse clôturée — Les demandes de permis reprendront à l&apos;ouverture de la prochaine campagne (une nouvelle validation de votre dossier sera requise).
                    </span>
                  </div>
                ) : dossierStatus?.status === 'rejected' ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                      Pièce(s) invalidée(s) — Correction requise
                    </div>
                    {dossierStatus.invalidatedDocs?.length > 0 && (
                      <p className="text-[11px]">
                        <strong>Pièces concernées :</strong>{' '}
                        {dossierStatus.invalidatedDocs.map((c) => getDocumentLabel(c)).join(', ')}
                      </p>
                    )}
                    {dossierStatus.reason && (
                      <p className="text-[11px]">
                        <strong>Motif :</strong> {dossierStatus.reason}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('documents');
                        setLocation('/hunter/documents');
                      }}
                      className="mt-1 inline-flex items-center text-[11px] font-semibold text-red-700 underline"
                    >
                      Corriger mes documents
                    </button>
                  </div>
                ) : dossierStatus?.status === 'validated' ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Dossier validé — Vous pouvez effectuer votre demande de permis.</span>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 flex items-start gap-2">
                    <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      {dossierStatus?.expiredForNewCampaign
                        ? "Nouvelle campagne de chasse — Une nouvelle validation de votre dossier est requise avant toute demande de permis."
                        : documentsArr.length === 0
                        ? "Déposez vos pièces dans « Documents » pour qu'elles soient vérifiées par l'administration avant toute demande de permis."
                        : "Vos documents sont en attente de vérification. La demande de permis sera débloquée dès validation de votre dossier."}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Action Cards Grid */}
            <div className="relative z-10 mx-auto w-full max-w-md pt-2">
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {(() => {
                  const isCampaignOpen = dossierStatus?.campaignOpen !== false;
                  const isDossierValidated = dossierStatus?.status === 'validated';
                  const canAccessDemande = isProfileComplete && isCampaignOpen && isDossierValidated;
                  const canAccessReports = isProfileComplete && permitsArr.some((p: HunterPermit) => p.status === 'active' || p.status === 'expired');
                  const canAccessPermits = isProfileComplete && activePermits.length > 0;

                  return (
                    <>
                      {/* Demande de permis */}
                      <motion.button
                        whileTap={canAccessDemande ? { scale: 0.96 } : {}}
                        onClick={() => {
                          if (canAccessDemande) {
                            setLocation('/permit-request');
                          } else if (!isProfileComplete) {
                            setShowCompletionModal(true);
                          } else if (!isCampaignOpen) {
                            toast({
                              title: 'Campagne de chasse fermée',
                              description: "Les demandes de permis reprendront à l'ouverture de la prochaine campagne.",
                            });
                          } else {
                            toast({
                              title: dossierStatus?.status === 'rejected' ? 'Pièces à corriger' : 'Dossier en attente de validation',
                              description:
                                dossierStatus?.status === 'rejected'
                                  ? 'Certaines pièces ont été invalidées. Consultez vos Documents ou votre Messagerie pour les remplacer.'
                                  : dossierStatus?.expiredForNewCampaign
                                  ? "Une nouvelle campagne a commencé : votre dossier doit être validé à nouveau avant de faire une demande."
                                  : "Vos documents doivent d'abord être vérifiés et validés par l'administration avant d'effectuer une demande de permis.",
                              variant: dossierStatus?.status === 'rejected' ? 'destructive' : 'default',
                            });
                          }
                        }}
                        className={`group relative flex flex-col items-center gap-2.5 rounded-2xl border p-4 text-center transition-all duration-200 
                          ${canAccessDemande 
                            ? 'border-emerald-100 bg-gradient-to-br from-emerald-50 to-green-50 hover:shadow-md hover:shadow-emerald-500/10 hover:border-emerald-200 active:bg-emerald-100 cursor-pointer' 
                            : 'border-slate-200 bg-slate-100 opacity-65 cursor-not-allowed grayscale'}`}
                      >
                        {!canAccessDemande && (
                          <span className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-slate-200/90 text-slate-600 flex items-center justify-center" title="Verrouillé">
                            <Lock className="h-3 w-3" />
                          </span>
                        )}
                        <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg transition-shadow
                          ${canAccessDemande
                            ? 'bg-gradient-to-br from-emerald-400 to-green-600 shadow-emerald-500/25 group-hover:shadow-emerald-500/40'
                            : 'bg-slate-400 shadow-slate-500/20'}`}
                        >
                          <ShieldCheck className="h-6 w-6 text-white" strokeWidth={2} />
                        </div>
                        <div>
                          <span className="block text-xs font-bold text-slate-800 leading-tight">Demande</span>
                          <span className="block text-[10px] font-medium text-slate-500 mt-0.5">de permis</span>
                        </div>
                      </motion.button>

                      {/* Nouveau prélèvement */}
                      <motion.button
                        whileTap={canAccessReports ? { scale: 0.96 } : {}}
                        onClick={() => {
                          if (canAccessReports) setLocation('/hunting-reports');
                        }}
                        className={`group relative flex flex-col items-center gap-2.5 rounded-2xl border p-4 text-center transition-all duration-200
                          ${canAccessReports
                            ? 'border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 hover:shadow-md hover:shadow-amber-500/10 hover:border-amber-200 active:bg-amber-100 cursor-pointer'
                            : 'border-slate-200 bg-slate-100 opacity-65 cursor-not-allowed grayscale'}`}
                      >
                        {!canAccessReports && (
                          <span className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-slate-200/90 text-slate-600 flex items-center justify-center" title="Verrouillé">
                            <Lock className="h-3 w-3" />
                          </span>
                        )}
                        <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg transition-shadow
                          ${canAccessReports
                            ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-500/25 group-hover:shadow-amber-500/40'
                            : 'bg-slate-400 shadow-slate-500/20'}`}
                        >
                          <Crosshair className="h-6 w-6 text-white" strokeWidth={2} />
                        </div>
                        <div>
                          <span className="block text-xs font-bold text-slate-800 leading-tight">Prélèvement</span>
                          <span className="block text-[10px] font-medium text-slate-500 mt-0.5">nouveau rapport</span>
                        </div>
                      </motion.button>

                {/* Mes permis */}
                <motion.button
                  whileTap={canAccessPermits ? { scale: 0.96 } : {}}
                  onClick={() => { 
                    if (canAccessPermits) {
                      setActiveTab('permits'); setLocation('/hunter/permits'); 
                    }
                  }}
                  className={`group relative flex flex-col items-center gap-2.5 rounded-2xl border p-4 text-center transition-all duration-200
                    ${canAccessPermits
                      ? 'border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 hover:shadow-md hover:shadow-blue-500/10 hover:border-blue-200 active:bg-blue-100 cursor-pointer'
                      : 'border-slate-200 bg-slate-100 opacity-65 cursor-not-allowed grayscale'}`}
                >
                  {!canAccessPermits && (
                    <span className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-slate-200/90 text-slate-600 flex items-center justify-center" title="Verrouillé">
                      <Lock className="h-3 w-3" />
                    </span>
                  )}
                  <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg transition-shadow
                    ${isProfileComplete && activePermits.length > 0
                      ? 'bg-gradient-to-br from-blue-400 to-indigo-500 shadow-blue-500/25 group-hover:shadow-blue-500/40'
                      : 'bg-slate-400 shadow-slate-500/20'}`}
                  >
                    <CreditCard className="h-6 w-6 text-white" strokeWidth={2} />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-slate-800 leading-tight">Mes permis</span>
                    <span className="block text-[10px] font-medium text-slate-500 mt-0.5">{activePermits.length} actif{activePermits.length !== 1 ? 's' : ''}</span>
                  </div>
                </motion.button>

                {/* Mes documents */}
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => { 
                    if (!isProfileComplete) {
                      setShowCompletionModal(true);
                    } else {
                      setActiveTab('documents'); setLocation('/hunter/documents'); 
                    }
                  }}
                  className="group relative flex flex-col items-center gap-2.5 rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-purple-50 p-4 text-center transition-all duration-200 hover:shadow-md hover:shadow-violet-500/10 hover:border-violet-200 active:bg-violet-100 cursor-pointer"
                >
                  <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25 group-hover:shadow-violet-500/40 transition-shadow">
                    <BookOpen className="h-6 w-6 text-white" strokeWidth={2} />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-slate-800 leading-tight">Documents</span>
                    <span className="block text-[10px] font-medium text-slate-500 mt-0.5">pièces jointes</span>
                  </div>
                </motion.button>

                    </>
                  );
                })()}

                {/* Déclarations du Guide - Visible uniquement si associé à un guide */}
                {guideStatus?.hasActiveGuide && (
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setLocation('/hunting-declarations')}
                    className="col-span-2 group relative flex items-center justify-between gap-3.5 rounded-2xl border border-teal-100 bg-gradient-to-r from-teal-50 to-emerald-50 p-4 text-left transition-all duration-200 hover:shadow-md hover:shadow-teal-500/10 hover:border-teal-200 active:bg-teal-100"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-teal-500/25 group-hover:shadow-teal-500/40 transition-shadow flex-shrink-0">
                        <Users className="h-6 w-6 text-white" strokeWidth={2} />
                      </div>
                      <div>
                        <span className="block text-xs font-bold text-slate-800 leading-tight">Déclarations du Guide</span>
                        <span className="block text-[10px] font-medium text-slate-500 mt-0.5">Valider/invalider et association</span>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-teal-600 transition-transform group-hover:translate-x-1" strokeWidth={2.5} />
                  </motion.button>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'permits' && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 max-w-6xl">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                {permitsSubTab === 'permits' ? (
                  <>
                    <CreditCard className="w-5 h-5 text-green-600" /> Mes Permis
                  </>
                ) : (
                  <>
                    <FileText className="w-5 h-5 text-amber-600" /> Mes Taxes d&apos;abattage
                  </>
                )}
              </h2>

              {/* Sélecteur d'onglets discret : Permis / Taxes */}
              <div className="inline-flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setPermitsSubTab('permits')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    permitsSubTab === 'permits'
                      ? 'bg-white text-emerald-800 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  Permis
                  {permitsArr.length > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-800">
                      {permitsArr.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setPermitsSubTab('taxes')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    permitsSubTab === 'taxes'
                      ? 'bg-white text-amber-800 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Taxes
                  {taxesArr.length > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800">
                      {taxesArr.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

        {permitsSubTab === 'taxes' ? (
          taxesLoading ? (
            <LoadingState message="Chargement de vos taxes..." />
          ) : taxesArr.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Aucune taxe d'abattage"
              description="Les taxes d'abattage (phacochère, grand gibier, etc.) liées à vos permis apparaîtront ici dès leur paiement."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl">
              {taxesArr.map((tax: any) => (
                <motion.div
                  key={tax.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="w-full sm:max-w-[380px] h-full flex flex-col rounded-2xl border border-amber-200 bg-gradient-to-br from-white via-amber-50/40 to-amber-50 overflow-hidden shadow-sm hover:shadow-md transition-all"
                >
                  <div className="h-1.5 w-full bg-gradient-to-r from-amber-600 via-amber-500 to-orange-400 shrink-0" />
                  <div className="p-4 flex flex-col gap-2.5 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-slate-900 capitalize truncate">
                          {tax.animalType || 'Taxe d’abattage'}
                        </div>
                        {tax.taxNumber && (
                          <div className="text-[11px] text-slate-500 font-mono truncate">{tax.taxNumber}</div>
                        )}
                      </div>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200 shrink-0">
                        Qté : {tax.quantity ?? 1}
                      </span>
                    </div>

                    <div className="flex flex-col items-start gap-1.5">
                      <span className="inline-flex items-center max-w-full px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg truncate">
                        Permis : {tax.permitNumber || '—'}
                      </span>
                      <span className="inline-flex items-center max-w-full px-2.5 py-1 text-xs font-medium bg-white text-slate-700 border border-slate-200 rounded-lg truncate">
                        Quittance : {tax.receiptNumber || '—'}
                      </span>
                    </div>

                    <div className="pt-2.5 mt-auto border-t border-amber-100 flex items-center justify-between gap-2 text-xs">
                      <div className="font-bold text-sm text-emerald-800">
                        {Number(tax.amount || 0).toLocaleString('fr-FR')} FCFA
                      </div>
                      {tax.issueDate && (
                        <div className="text-slate-500">
                          <span className="text-slate-400">Payé le :</span>{' '}
                          <span className="font-medium text-slate-700">
                            {format(new Date(tax.issueDate), "dd/MM/yyyy")}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )
        ) : permitsError ? (
          <ErrorState
            title="Erreur de chargement"
            message="Impossible de charger vos permis. Veuillez réessayer."
          />
        ) : permitsArr.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-amber-100 rounded-lg">
                <AlertCircle className="w-6 h-6 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-amber-800 mb-2">Aucun permis de chasse trouvé</h3>
                <p className="text-amber-700 mb-4">
                  Rapprochez-vous du Service des Eaux et Forêts avec les documents originaux suivants :
                </p>
                <div className="bg-white rounded-lg p-4 border border-amber-200">
                  <h4 className="font-medium text-amber-800 mb-3">Documents Obligatoires :</h4>
                  <ul className="space-y-2 text-sm text-amber-700">
                    <li className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                      Pièce d'Identité (Carte nationale ou passeport)
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                      Permis de Port d'Arme (Autorisation officielle)
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                      Photo du Chasseur (Photo d'identité récente)
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                      Timbre Impôt (Timbre fiscal obligatoire)
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                      Quittance de l'Arme par le Trésor (Preuve d'achat légal)
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                      Assurance (Assurance responsabilité civile)
                    </li>
                  </ul>
                  <h4 className="font-medium text-amber-800 mb-2 mt-4">Documents Optionnels :</h4>
                  <ul className="space-y-2 text-sm text-amber-700">
                    <li className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-amber-300 rounded-full"></div>
                      Club de Tir (carte) / ou Justificatif (Document optionnel mais recommandé)
                    </li>
                  </ul>
                </div>
                <div className="mt-4 p-3 bg-amber-100 rounded-lg">
                  <p className="text-sm text-amber-800">
                    <strong>Important :</strong> Tous les documents doivent être des originaux <strong>en cours de validité</strong>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl">
            {permitsArr.map((permit: HunterPermit) => (
              <PermitCard key={permit.id} item={permit} onViewDetails={handleViewPermitDetails} user={user} />
            ))}
          </div>
        )}
          </motion.div>
        )}

        {activeTab === 'documents' && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 max-w-6xl">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-green-600" /> Mes Documents
              </h2>
              <Button
                type="button"
                size="sm"
                onClick={() => setIsUploadDialogOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Ajouter un document
              </Button>
            </div>

            {dossierStatus?.status === 'rejected' && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-900 space-y-1">
                <div className="font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                  Pièce(s) invalidée(s) par l&apos;administration
                </div>
                {dossierStatus.invalidatedDocs?.length > 0 && (
                  <p className="text-xs">
                    <strong>À remplacer :</strong>{' '}
                    {dossierStatus.invalidatedDocs.map((c) => getDocumentLabel(c)).join(', ')}
                  </p>
                )}
                {dossierStatus.reason && (
                  <p className="text-xs">
                    <strong>Motif :</strong> {dossierStatus.reason}
                  </p>
                )}
                <p className="text-xs text-red-700">
                  Téléversez à nouveau les pièces concernées via le bouton <strong>+</strong> ci-dessous pour soumettre votre dossier à une nouvelle vérification.
                </p>
              </div>
            )}

        {documentsError ? (
          <ErrorState
            title="Erreur de chargement"
            message="Impossible de charger vos documents. Veuillez réessayer."
          />
        ) : documentsArr.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Aucun document trouvé"
            description="Vos documents téléversés apparaîtront ici"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl">
            {documentsArr.map((doc: HunterDocument) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                onView={handleViewDocument}
                isInvalidated={Boolean(dossierStatus?.invalidatedDocs?.includes(doc.documentType))}
              />
            ))}
          </div>
        )}
          </motion.div>
        )}

      {/* Modal de visualisation des documents */}
      <Dialog open={!!selectedDocument} onOpenChange={() => setSelectedDocument(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Prévisualisation du Document</DialogTitle>
            <DialogDescription>
              Consultez le contenu de votre document téléchargé
            </DialogDescription>
          </DialogHeader>
          {selectedDocument && (
            <div className="mt-4">
              <div className="mb-4 text-sm text-slate-600">
                <p><strong>Fichier :</strong> {selectedDocument.fileName}</p>
                <p><strong>Taille :</strong> {formatFileSize(selectedDocument.fileSize)}</p>
                <p><strong>Téléversé le :</strong> {formatDate(selectedDocument.uploadedAt)}</p>
              </div>

              {selectedDocument.mimeType.startsWith('image/') ? (
                <img
                  src={getDocumentViewUrl(selectedDocument)}
                  alt={getDocumentLabel(selectedDocument.documentType)}
                  className="max-w-full h-auto rounded-lg border"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const parent = target.parentNode as HTMLElement;
                    if (parent && !parent.querySelector('.error-message')) {
                      const errorDiv = document.createElement('div');
                      errorDiv.className = 'p-4 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 error-message';
                      errorDiv.textContent = 'Prévisualisation non disponible pour ce document';
                      parent.appendChild(errorDiv);
                    }
                  }}
                />
              ) : selectedDocument.mimeType === 'application/pdf' ? (
                <iframe
                  src={getDocumentViewUrl(selectedDocument)}
                  className="w-full h-96 border rounded-lg"
                  title={getDocumentLabel(selectedDocument.documentType)}
                />
              ) : (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-slate-600">
                    Prévisualisation non disponible pour ce type de fichier.
                  </p>
                  <Button
                    className="mt-2"
                    onClick={() => {
                      const url = getDocumentViewUrl(selectedDocument);
                      const isCapacitor = typeof window !== 'undefined' && !!(window as any).Capacitor;
                      const isCustomApk = typeof navigator !== 'undefined' && 
                        (/AlerteAPK/i.test(navigator.userAgent) || /ChasseAPK/i.test(navigator.userAgent));
                      const isMobileNative = isCapacitor || isCustomApk;
                      
                      const token = localStorage.getItem('token');
                      let finalUrl = url;
                      if (token) {
                        finalUrl += finalUrl.includes('?') ? `&token=${encodeURIComponent(token)}` : `?token=${encodeURIComponent(token)}`;
                      }
                      
                      if (isMobileNative) {
                        window.location.href = finalUrl;
                      } else {
                        window.open(finalUrl, '_blank');
                      }
                    }}
                  >
                    Ouvrir dans un nouvel onglet
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de détails du permis - Adaptatif mobile & desktop */}
      <Dialog open={!!selectedPermit} onOpenChange={() => setSelectedPermit(null)}>
        <DialogContent hideClose className="w-[95vw] max-w-4xl max-h-[90vh] p-0 overflow-hidden flex flex-col rounded-2xl border-emerald-900/20">
          {/* En-tête harmonisé */}
          <div className="sticky top-0 z-20 bg-gradient-to-r from-[#0b3d2e] to-[#14532d] text-white px-4 sm:px-6 py-3.5 flex items-center justify-between shrink-0">
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold tracking-tight truncate">Quitus du Permis</h2>
              <p className="text-xs text-emerald-200 truncate">
                {selectedPermit ? `N° ${selectedPermit.permitNumber} · Détails officiels` : 'Détails officiels'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPermit(null)}
              className="p-2 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors shrink-0"
              aria-label="Fermer"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>

          <div className="bg-slate-50 flex-1 overflow-y-auto subtle-scrollbar">
          {selectedPermit && (
            <div className="p-4 sm:p-6 pb-10 grid grid-cols-1 lg:grid-cols-[296px_1fr] gap-5 items-start">

              {/* COLONNE GAUCHE (ou haut sur mobile) : Carte de permis téléchargeable intacte */}
              <div className="flex flex-col items-center w-full lg:sticky lg:top-4 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
                <div id="permit-card" className="w-64 p-4 bg-white border-2 border-dashed border-black text-left font-sans text-black bg-gray-50 rounded-lg border border-gray-200">
                  <h2 className="text-sm font-bold mb-1 text-center">Direction Eaux et Forêts</h2>
                  <p className="text-xs mb-3 text-center">Chasse et Conservation des Sols</p>

                  {qrCodeUrl && (
                    <div className="w-32 h-32 mx-auto mb-3">
                      <img src={qrCodeUrl} alt="QR Code" className="w-full h-full" />
                    </div>
                  )}

                  <p className="text-xs font-semibold mb-2 text-center">
                    Service des Eaux et Forêts<br />
                    {selectedPermit.metadata?.createdByUser?.region ?
                      `IREF/${selectedPermit.metadata.createdByUser.region}` :
                      selectedPermit.metadata?.createdByUser?.departement ?
                      `SECTEUR/${selectedPermit.metadata.createdByUser.departement}` :
                      'DEFCCS'
                    }
                  </p>

                  <p className="text-xs mb-1 text-left">
                    <span className="font-bold">Permis de chasse :</span> {selectedPermit.permitNumber}
                  </p>

                  <p className="text-xs mb-1 text-left">
                    <span className="font-bold">Type :</span> {selectedPermit.categoryId || selectedPermit.type}
                  </p>

                  <p className="text-xs mb-1 text-center">
                    <span className="font-bold">Nom du chasseur :</span>
                  </p>
                  <p className="text-lg font-bold mb-2 text-center">
                    {hunterInfo ? `${hunterInfo.lastName.toUpperCase()} ${hunterInfo.firstName.toUpperCase()}` : 'Chargement...'}
                  </p>

                  <p className="text-xs mb-1 text-left">
                    <span className="font-bold">Prix :</span> {Number(selectedPermit.price).toLocaleString()} FCFA
                  </p>

                  <p className="text-xs mb-1 text-left">
                    <span className="font-bold">Émis le :</span> {format(new Date(selectedPermit.issueDate), "dd/MM/yyyy")}
                  </p>

                  <p className="text-xs mb-1 text-left">
                    <span className="font-bold">Expire le :</span> {format(new Date(selectedPermit.expiryDate), "dd/MM/yyyy")}
                  </p>

                  <p className="text-xs text-left">
                    <span className="font-bold">Quittance :</span> {selectedPermit.receiptNumber || 'N/A'}
                  </p>
                </div>

                <Button
                  onClick={handleDownloadPermit}
                  size="sm"
                  className="mt-4 w-full max-w-[256px] bg-emerald-700 hover:bg-emerald-800 text-xs font-semibold h-9 rounded-xl shadow-sm"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Télécharger le Permis
                </Button>
              </div>

              {/* COLONNE DROITE : Fiches d'informations structurées */}
              <div className="space-y-4 w-full min-w-0">

                {/* Informations du chasseur */}
                {hunterInfo && (
                  <div className="bg-white p-4 sm:p-5 rounded-2xl border border-emerald-100 shadow-sm">
                    <h3 className="text-sm sm:text-base font-bold text-emerald-900 pb-2.5 mb-3.5 border-b border-emerald-100">
                      Informations du Chasseur
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <div className="text-[11px] font-medium text-slate-500">Nom Complet</div>
                        <div className="font-semibold text-slate-800 truncate">{hunterInfo.firstName} {hunterInfo.lastName}</div>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <div className="text-[11px] font-medium text-slate-500">Numéro Pièce d&apos;Identité</div>
                        <div className="font-semibold text-slate-800 truncate">{hunterInfo.idNumber}</div>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <div className="text-[11px] font-medium text-slate-500">Téléphone</div>
                        <div className="font-medium text-slate-800">{hunterInfo.phone || 'Non renseigné'}</div>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <div className="text-[11px] font-medium text-slate-500">Région</div>
                        <div className="font-medium text-slate-800">{hunterInfo.region || 'Non renseignée'}</div>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <div className="text-[11px] font-medium text-slate-500">Catégorie</div>
                        <div className="font-medium text-slate-800 capitalize">{hunterInfo.category || 'Non renseignée'}</div>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <div className="text-[11px] font-medium text-slate-500">Adresse</div>
                        <div className="font-medium text-slate-800 break-words">{hunterInfo.address || 'Non renseignée'}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Informations sur les armes */}
                {hunterInfo && (
                  <div className="bg-white p-4 sm:p-5 rounded-2xl border border-emerald-100 shadow-sm">
                    <h3 className="text-sm sm:text-base font-bold text-emerald-900 pb-2.5 mb-3.5 border-b border-emerald-100">
                      Informations sur les Armes
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <div className="text-[11px] font-medium text-slate-500">Type d&apos;Arme</div>
                        <div className="font-medium text-slate-800">{(hunterInfo.weaponType && hunterInfo.weaponType !== 'nan') ? hunterInfo.weaponType : 'Non renseigné'}</div>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <div className="text-[11px] font-medium text-slate-500">Marque</div>
                        <div className="font-medium text-slate-800">{(hunterInfo.weaponBrand && hunterInfo.weaponBrand !== 'nan') ? hunterInfo.weaponBrand : 'Non renseigné'}</div>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <div className="text-[11px] font-medium text-slate-500">Calibre</div>
                        <div className="font-medium text-slate-800">{(hunterInfo.weaponCaliber && hunterInfo.weaponCaliber !== 'nan') ? hunterInfo.weaponCaliber : 'Non renseigné'}</div>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <div className="text-[11px] font-medium text-slate-500">Référence</div>
                        <div className="font-medium text-slate-800">{(hunterInfo.weaponReference && hunterInfo.weaponReference !== 'nan') ? hunterInfo.weaponReference : 'Non renseigné'}</div>
                      </div>
                      {hunterInfo.weaponOtherDetails && hunterInfo.weaponOtherDetails !== 'nan' && (
                        <div className="sm:col-span-2 rounded-lg bg-slate-50 px-3 py-2">
                          <div className="text-[11px] font-medium text-slate-500">Autres Détails</div>
                          <div className="font-medium text-slate-800">{hunterInfo.weaponOtherDetails}</div>
                        </div>
                      )}
                    </div>
                    {(!hunterInfo.weaponType || hunterInfo.weaponType === 'nan') &&
                     (!hunterInfo.weaponBrand || hunterInfo.weaponBrand === 'nan') &&
                     (!hunterInfo.weaponCaliber || hunterInfo.weaponCaliber === 'nan') && (
                      <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-xs text-amber-700">
                          Aucune information sur les armes n&apos;est disponible pour ce chasseur.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Détails du Quitus & Administratif */}
                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-emerald-100 shadow-sm">
                  <h3 className="text-sm sm:text-base font-bold text-emerald-900 pb-2.5 mb-3.5 border-b border-emerald-100">
                    Détails du Quitus &amp; Administration
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-emerald-50/60 px-3 py-2">
                      <div className="text-[11px] font-medium text-emerald-700">Numéro de Permis</div>
                      <div className="font-bold text-slate-900">{selectedPermit.permitNumber}</div>
                    </div>
                    <div className="rounded-lg bg-emerald-50/60 px-3 py-2">
                      <div className="text-[11px] font-medium text-emerald-700">Type de Permis</div>
                      <div className="font-bold text-slate-900 capitalize">
                        {selectedPermit.categoryId ||
                         (selectedPermit.type === 'petite-chasse' ? 'Petite Chasse' :
                          selectedPermit.type === 'grande-chasse' ? 'Grande Chasse' :
                          selectedPermit.type === 'gibier-eau' ? "Gibier d'Eau" :
                          selectedPermit.type)}
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-medium text-slate-500">Numéro de Quittance</div>
                      <div className="font-semibold text-slate-800">{selectedPermit.receiptNumber || 'Non disponible'}</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-medium text-slate-500">Émetteur</div>
                      <div className="font-medium text-slate-800">
                        {selectedPermit.metadata?.createdByUser ?
                          `${selectedPermit.metadata.createdByUser.firstName} ${selectedPermit.metadata.createdByUser.lastName}` :
                          'Service des Eaux et Forêts'
                        }
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-medium text-slate-500">Date d&apos;Émission</div>
                      <div className="font-medium text-slate-800">{formatDate(selectedPermit.issueDate)}</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-medium text-slate-500">Date d&apos;Expiration</div>
                      <div className="font-medium text-slate-800">{formatDate(selectedPermit.expiryDate)}</div>
                    </div>
                  </div>
                </div>

                {/* Informations de renouvellement */}
                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-emerald-100 shadow-sm">
                  <h3 className="text-sm sm:text-base font-bold text-emerald-900 pb-2.5 mb-3.5 border-b border-emerald-100">
                    Historique des Renouvellements
                  </h3>
                  {(() => {
                    const renewalCount = selectedPermit.renewalCount ||
                                       selectedPermit.metadata?.renewalCount ||
                                       (Array.isArray(selectedPermit.renewals) ? selectedPermit.renewals.length : 0) ||
                                       (Array.isArray(selectedPermit.metadata?.renewals) ? selectedPermit.metadata.renewals.length : 0);

                    if (renewalCount === 0) {
                      return (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <div className="flex items-center gap-2">
                            <Badge tone="slate">Première émission</Badge>
                          </div>
                          <p className="text-sm text-blue-700 mt-2">
                            Ce permis n'a pas encore été renouvelé. Il s'agit de la première émission.
                          </p>
                        </div>
                      );
                    } else {
                      return (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                          <div className="flex items-center gap-2">
                            <Badge tone="green">Renouvellement n°{renewalCount}</Badge>
                          </div>
                          <p className="text-sm text-green-700 mt-2">
                            Ce permis a été renouvelé {renewalCount} fois.
                          </p>
                        </div>
                      );
                    }
                  })()}
                </div>

              </div>
            </div>
          )}
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Footer Blasons only visible on home */}
      {activeTab === 'home' && (
        <div className="mt-6 flex items-center justify-center gap-6 pb-6 pt-4 border-t border-slate-200">
          <img src="/icon-blason.svg" alt="Blason" className="h-16 object-contain opacity-70" />
          <img
            src={getAppLogo()}
            alt="Eaux et Forets"
            className="h-16 object-contain mix-blend-multiply opacity-70"
          />
        </div>
      )}

      {/* Blocage: forcer la complétion de l'étape 2 si nécessaire */}
      {showCompletionModal && (
        <Dialog open={showCompletionModal} onOpenChange={setShowCompletionModal}>
          <DialogContent 
            className="max-w-4xl w-[95vw] h-[88vh] max-h-[88vh] flex flex-col p-0 overflow-hidden rounded-2xl gap-0" 
            hideClose
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
          >
            <DialogHeader className="shrink-0 px-5 sm:px-6 py-4 border-b border-slate-100 bg-white">
              <div className="flex items-start sm:items-center justify-between gap-4">
                <div>
                  <DialogTitle className="text-lg font-bold text-slate-900">Compléter votre profil chasseur</DialogTitle>
                  <DialogDescription className="text-xs sm:text-sm text-slate-500 mt-0.5">
                    Veuillez renseigner toutes les informations requises afin d'accéder à votre espace chasseur.
                  </DialogDescription>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCompletionModal(false)}
                  className="px-4 py-1.5 text-sm font-medium rounded-md border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors shrink-0 shadow-sm"
                >
                  Fermer
                </button>
              </div>
            </DialogHeader>
            <div className="flex-1 min-h-0 flex overflow-hidden">
              <RegisterForm
                userType="hunter"
                embedded
                initialStep={2}
                onSubmittingChange={(submitting) => {
                  // Masquer le bouton Déconnexion du header pendant l'envoi
                  window.dispatchEvent(new Event(submitting ? 'hide-logout' : 'show-logout'));
                }}
                onCompleted={async () => {
                  // Marquer la complétion côté UI
                  setShowCompletionModal(false);
                  // Invalider les requêtes clés pour rafraîchir l'espace chasseur
                  try {
                    await Promise.all([
                      queryClient.invalidateQueries({ queryKey: ['hunter-permits'] }),
                      queryClient.invalidateQueries({ queryKey: ['hunter-documents'] }),
                    ]);
                  } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  }
                  try {
                    toast({
                      title: "Profil complété",
                      description: "Votre profil chasseur a été enregistré. Rechargement en cours...",
                    });
                  } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  }
                  // Recharger complètement la page pour repartir sur un état propre
                  setTimeout(() => {
                    try { window.location.reload(); } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  }
                  }, 250);
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      </div>

      {/* FAB Button - Affiché uniquement sur l'accueil pour ne jamais masquer les permis, taxes ou documents */}
      {activeTab === 'home' && (
        <motion.button 
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="fixed bottom-20 right-4 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white active:scale-95 transition-colors z-[80] bg-green-600 shadow-green-600/30"
          onClick={() => {
            setLocation('/hunting-reports?new=true');
          }}
          aria-label="Nouvelle déclaration"
        >
          <Plus className="w-6 h-6" strokeWidth={2.5} />
        </motion.button>
      )}

      <FileUploadDialog
        open={isUploadDialogOpen}
        onOpenChange={setIsUploadDialogOpen}
        onUpload={handleFileUpload}
        providedDocumentTypes={documentsArr.map((d: any) => d.documentType)}
      />
    </div>
  );
}
