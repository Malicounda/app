import RegisterForm from '@/components/auth/RegisterForm';
import HunterLayout, { Badge, EmptyState, ErrorState, LoadingState, StatCard } from '@/components/layout/HunterLayout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/api';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  AlertCircle,
  Download,
  Eye,
  FileText,
  ShieldCheck
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

  // Classes CSS conditionnelles pour les permis épuisés (responsive, sans largeur fixe)
  const cardClasses = isExhausted
    ? "rounded-lg border border-slate-300 bg-slate-100 p-4 opacity-60 cursor-not-allowed transition-shadow w-full"
    : "rounded-lg border border-green-200 bg-green-50 p-4 hover:shadow-sm transition-shadow cursor-pointer w-full";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={cardClasses}
    >
      {/* Ligne du haut : Numéro de permis et badge statut */}
      <div className="flex items-center justify-between mb-2">
        <div className={`font-semibold text-sm ${isExhausted ? 'text-slate-500' : 'text-slate-900'}`}>
          N° {item.permitNumber}
        </div>
        {getStatusBadge(item.status)}
      </div>

      {/* Numéro de quittance avec fond jaune */}
      {item.receiptNumber && (
        <div className="mb-2">
          <span className="inline-block px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200 rounded">
            Quittance: {item.receiptNumber}
          </span>
        </div>
      )}

      {/* Catégorie */}
      <div className={`text-sm mb-3 ${isExhausted ? 'text-slate-400' : 'text-slate-600'}`}>
        Catégorie: {getCategoryLabel(item.categoryId, item.type)}
      </div>

      {/* Messages d'état du permis */}
      {isExhausted && (
        <div className="mb-2">
          <span className="inline-block px-2 py-1 text-xs font-medium bg-red-100 text-red-700 border border-red-200 rounded">
            ⚠️ Permis épuisé - Limite de renouvellement atteinte et expiré
          </span>
        </div>
      )}
      {hasReachedRenewalLimit && !isExpired && (
        <div className="mb-2">
          <span className="inline-block px-2 py-1 text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200 rounded">
            ⚠️ Limite de renouvellement atteinte - Sera épuisé à l'expiration
          </span>
        </div>
      )}

      {/* Ligne du bas : Nom du chasseur et bouton Voir */}
      <div className="flex items-center justify-between">
        <div className={`text-sm font-medium ${isExhausted ? 'text-slate-400' : 'text-slate-700'}`}>
          {user?.firstName} {user?.lastName}
        </div>
        <button
          onClick={isExhausted ? undefined : () => onViewDetails(item)}
          disabled={isExhausted}
          className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
            isExhausted
              ? 'text-slate-400 cursor-not-allowed'
              : 'text-slate-700 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Eye className="w-4 h-4" />
          Voir
        </button>
      </div>
    </motion.div>
  );
};

const DocumentCard = ({ doc, onView }: { doc: HunterDocument, onView: (doc: HunterDocument) => void }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35 }}
    className="rounded-2xl border bg-white shadow-sm p-4 flex flex-col gap-3 hover:shadow-md"
  >
    <div className="flex items-center gap-3">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 flex items-center justify-center">
        <FileText className="w-6 h-6" />
      </div>
      <div>
        <div className="font-medium text-slate-800">{getDocumentLabel(doc.documentType)}</div>
        <div className="text-xs text-slate-500">{doc.fileName}</div>
      </div>
    </div>
    <div className="text-xs text-slate-500">{formatFileSize(doc.fileSize)} • Téléversé le {formatDate(doc.uploadedAt)}</div>
    <div className="flex gap-2 mt-auto">
      <button
        onClick={() => onView(doc)}
        className="px-3 py-2 text-sm rounded-xl border bg-slate-50 hover:bg-slate-100 flex items-center gap-2"
      >
        <Eye className="w-4 h-4"/> Voir
      </button>
    </div>
  </motion.div>
);


// Fonctions utilitaires
const getDocumentLabel = (documentType: string): string => {
  const labels: { [key: string]: string } = {
    'idCardDocument': 'Pièce d\'identité',
    'weaponPermit': 'Permis d\'arme',
    'hunterPhoto': 'Photo du chasseur',
    'treasuryStamp': 'Timbre du trésor',
    'weaponReceipt': 'Reçu d\'arme',
    'insurance': 'Assurance',
    'moralCertificate': 'Certificat de moralité'
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
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  return `${baseUrl}/api/hunters/documents/${doc.id}/view`;
};

export default function HunterDashboard() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedDocument, setSelectedDocument] = useState<HunterDocument | null>(null);
  const [selectedPermit, setSelectedPermit] = useState<HunterPermit | null>(null);
  const [hunterInfo, setHunterInfo] = useState<HunterInfo | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [hunterPhotoUrl, setHunterPhotoUrl] = useState<string | null>(null);
  const [showCompletionModal, setShowCompletionModal] = useState<boolean>(false);
  const [completionStatusLoading, setCompletionStatusLoading] = useState<boolean>(true);

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
          // Afficher le modal si le profil chasseur n'existe pas encore OU s'il est incomplet
          const shouldShow = !response.data.hasHunterProfile || !response.data.isComplete;
          setShowCompletionModal(shouldShow);
        } else {
          // Fallback: pas de modal si pas de réponse
          setShowCompletionModal(false);
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
      } catch {}
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

  // Filtrage des permis par statut (utilisant les statuts calculés côté serveur)
  // Toujours opérer sur des tableaux pour éviter les erreurs de type
  const permitsArr = Array.isArray(permits) ? permits : [];
  const documentsArr = Array.isArray(documents) ? documents : [];

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
          const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
          const photoUrl = `${baseUrl}/api/attachments/${permit.hunterId}/hunterPhoto?inline=1`;

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
      <HunterLayout>
        <LoadingState message="Chargement de votre espace chasseur..." />
      </HunterLayout>
    );
  }

  return (
    <HunterLayout
      title="Mon Espace Chasseur"
      subtitle="Gérez vos permis et documents en un coup d'œil"
      showToolbar={false}
    >
      {/* Contenu principal du compte chasseur (sans wrapper fixe) */}
      {/* Blocage: forcer la complétion de l'étape 2 si nécessaire */}
      {showCompletionModal && (
        <Dialog open={showCompletionModal} onOpenChange={() => { /* Bloqué tant que non complété */ }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle>Compléter votre profil chasseur</DialogTitle>
                  <DialogDescription>
                    Veuillez renseigner toutes les informations requises afin d'accéder à votre espace chasseur.
                  </DialogDescription>
                </div>
                <button
                  onClick={logout}
                  className="px-3 py-1.5 text-sm rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                >
                  Se déconnecter
                </button>
              </div>
            </DialogHeader>
            <div className="mt-2">
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
                  } catch {}
                  try {
                    toast({
                      title: "Profil complété",
                      description: "Votre profil chasseur a été enregistré. Rechargement en cours...",
                    });
                  } catch {}
                  // Recharger complètement la page pour repartir sur un état propre
                  setTimeout(() => {
                    try { window.location.reload(); } catch {}
                  }, 250);
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}


      {/* Cartes de stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard icon={ShieldCheck} label="Permis actifs" value={activePermits.length} />
        <StatCard icon={FileText} label="Documents" value={documentsArr.length} />
      </div>

      {/* Mes Permis */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Mes Permis</h2>
        </div>

        {permitsError ? (
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
                      Certificat de Bonne Vie et Mœurs (Document optionnel mais recommandé)
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {permitsArr.map((permit: HunterPermit) => (
              <PermitCard key={permit.id} item={permit} onViewDetails={handleViewPermitDetails} user={user} />
            ))}
          </div>
        )}
      </section>

      {/* Mes Documents */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Mes Documents</h2>
        </div>

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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {documentsArr.map((doc: HunterDocument) => (
              <DocumentCard key={doc.id} doc={doc} onView={handleViewDocument} />
            ))}
          </div>
        )}
      </section>

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
                    onClick={() => window.open(getDocumentViewUrl(selectedDocument), '_blank')}
                  >
                    Ouvrir dans un nouvel onglet
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de détails du permis */}
      <Dialog open={!!selectedPermit} onOpenChange={() => setSelectedPermit(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle>Détails du Permis</DialogTitle>
            <DialogDescription>
              Consultez les informations détaillées du permis de chasse
            </DialogDescription>
          </DialogHeader>
          {selectedPermit && (
            <div className="mt-4">

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Colonne gauche - Informations principales */}
                <div className="lg:col-span-2 space-y-6 bg-green-50 p-6 rounded-lg border border-green-100">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-sm font-medium text-slate-500 mb-1">Numéro de Permis</h3>
                      <p className="text-lg font-semibold">{selectedPermit.permitNumber}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-slate-500 mb-1">Type de Permis</h3>
                      <p className="text-lg font-semibold">
                        {selectedPermit.categoryId ||
                         (selectedPermit.type === 'petite-chasse' ? 'Petite Chasse' :
                          selectedPermit.type === 'grande-chasse' ? 'Grande Chasse' :
                          selectedPermit.type === 'gibier-eau' ? "Gibier d'Eau" :
                          selectedPermit.type)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-sm font-medium text-slate-500 mb-1">Date d'Émission</h3>
                      <p className="text-base">{formatDate(selectedPermit.issueDate)}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-slate-500 mb-1">Date d'Expiration</h3>
                      <p className="text-base">{formatDate(selectedPermit.expiryDate)}</p>
                    </div>
                  </div>

                  {/* Informations du chasseur */}
                  {hunterInfo && (
                    <div className="border-t pt-6">
                      <h3 className="text-lg font-semibold mb-4">Informations du Chasseur</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-sm font-medium text-slate-500 mb-1">Nom Complet</h4>
                          <p className="text-base">{hunterInfo.firstName} {hunterInfo.lastName}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-slate-500 mb-1">Numéro Pièce d'Identité</h4>
                          <p className="text-base">{hunterInfo.idNumber}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-slate-500 mb-1">Téléphone</h4>
                          <p className="text-base">{hunterInfo.phone || 'Non renseigné'}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-slate-500 mb-1">Adresse</h4>
                          <p className="text-base">{hunterInfo.address || 'Non renseignée'}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-slate-500 mb-1">Région</h4>
                          <p className="text-base">{hunterInfo.region || 'Non renseignée'}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-slate-500 mb-1">Catégorie</h4>
                          <p className="text-base">{hunterInfo.category || 'Non renseignée'}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Informations de renouvellement */}
                  <div className="border-t pt-6">
                    <h3 className="text-lg font-semibold mb-4">Historique des Renouvellements</h3>
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

                  {/* Informations sur les armes */}
                  {hunterInfo && (
                    <div className="border-t pt-6">
                      <h3 className="text-lg font-semibold mb-4">Informations sur les Armes</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-sm font-medium text-slate-500 mb-1">Type d'Arme</h4>
                          <p className="text-base">{(hunterInfo.weaponType && hunterInfo.weaponType !== 'nan') ? hunterInfo.weaponType : 'Non renseigné'}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-slate-500 mb-1">Marque</h4>
                          <p className="text-base">{(hunterInfo.weaponBrand && hunterInfo.weaponBrand !== 'nan') ? hunterInfo.weaponBrand : 'Non renseigné'}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-slate-500 mb-1">Calibre</h4>
                          <p className="text-base">{(hunterInfo.weaponCaliber && hunterInfo.weaponCaliber !== 'nan') ? hunterInfo.weaponCaliber : 'Non renseigné'}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-slate-500 mb-1">Référence</h4>
                          <p className="text-base">{(hunterInfo.weaponReference && hunterInfo.weaponReference !== 'nan') ? hunterInfo.weaponReference : 'Non renseigné'}</p>
                        </div>
                        {hunterInfo.weaponOtherDetails && hunterInfo.weaponOtherDetails !== 'nan' && (
                          <div className="md:col-span-2">
                            <h4 className="text-sm font-medium text-slate-500 mb-1">Autres Détails</h4>
                            <p className="text-base">{hunterInfo.weaponOtherDetails}</p>
                          </div>
                        )}
                      </div>
                      {(!hunterInfo.weaponType || hunterInfo.weaponType === 'nan') &&
                       (!hunterInfo.weaponBrand || hunterInfo.weaponBrand === 'nan') &&
                       (!hunterInfo.weaponCaliber || hunterInfo.weaponCaliber === 'nan') && (
                        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                          <p className="text-sm text-amber-700">
                            Aucune information sur les armes n'est disponible pour ce chasseur.
                          </p>
                        </div>
                      )}
                    </div>
                  )}


                  {/* Informations administratives */}
                  <div className="border-t pt-6">
                    <h3 className="text-lg font-semibold mb-4">Informations Administratives</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-medium text-slate-500 mb-1">Numéro de Quittance</h4>
                        <p className="text-base">{selectedPermit.receiptNumber || 'Non disponible'}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-slate-500 mb-1">Émetteur</h4>
                        <p className="text-base">
                          {selectedPermit.metadata?.createdByUser ?
                            `${selectedPermit.metadata.createdByUser.firstName} ${selectedPermit.metadata.createdByUser.lastName}` :
                            'Service des Eaux et Forêts'
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Colonne droite - Carte de permis téléchargeable */}
                <div className="lg:col-span-1 flex flex-col items-start mt-4">
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
                    className="mt-4 w-full max-w-sm bg-green-600 hover:bg-green-700"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Télécharger le Permis
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </HunterLayout>
  );
}
