import DocumentUpload from '@/components/documents/DocumentUpload';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle,
  Check,
  CheckCircle,
  FileText,
  MapPin,
  Phone,
  User,
  XCircle
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';

// Types pour les chasseurs avec documents
interface HunterWithDocuments {
  id: number;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  region: string;
  category: string;
  isMinor: boolean;
  isActive?: boolean;
  weaponType?: string;
  weaponBrand?: string;
  weaponCaliber?: string;
  pays?: string | null;
  nationality?: string | null;
}

// Type pour un document renvoyé par l'API des pièces jointes
interface HunterDocument {
  id: number;
  hunterId: number;
  documentType: string; // ex: 'idCardDocument', 'weaponPermit', ...
  originalName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  // statut issu de /api/attachments/:id → valid | expired | dueSoon | missing
  // (fallback: "valid" si l'API ne fournit pas d'info d'expiration)
  validityStatus?: 'valid' | 'expired' | 'dueSoon' | 'missing';
  expiryDate?: string | null;
  daysLeft?: number;
  status: 'pending' | 'approved' | 'rejected';
  uploadDate: string;
}

interface HunterDetailsWithDocumentsProps {
  hunterId: number;
  open: boolean;
  onClose: () => void;
}

const HunterDetailsWithDocuments: React.FC<HunterDetailsWithDocumentsProps> = ({
  hunterId,
  open,
  onClose
}) => {
  const [hunter, setHunter] = useState<HunterWithDocuments | null>(null);
  const [documents, setDocuments] = useState<HunterDocument[]>([]);
  const [loading, setLoading] = useState(true);
  // Aperçu de document
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDocType, setPreviewDocType] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Fonction pour charger les détails du chasseur
  const fetchHunterDetails = async () => {
    try {
      const hRes = await fetch(`/api/hunters/${hunterId}`, {
        credentials: 'include',
      });
      if (!hRes.ok) throw new Error('Erreur chargement chasseur');
      const hData = await hRes.json();
      return hData;
    } catch (error) {
      console.error('Erreur lors du chargement du chasseur:', error);
      throw error;
    }
  };

  // Activer/Suspendre le compte du chasseur
  const toggleAccountStatus = async () => {
    if (!hunter) return;
    const newStatus = !hunter.isActive;

    try {
      // Mise à jour optimiste
      setHunter(prev => prev ? { ...prev, isActive: newStatus } : null);

      // Appel API pour mettre à jour le statut
      const response = await fetch(`/api/hunters/${hunter.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: newStatus }),
        credentials: 'include',
      });

      if (!response.ok) {
        // En cas d'erreur, on annule la mise à jour optimiste
        setHunter(prev => prev ? { ...prev, isActive: !newStatus } : null);
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Échec de la mise à jour du statut');
      }

      const updatedHunter = await response.json();
      toast.success(updatedHunter.message || `Compte ${newStatus ? 'activé' : 'suspendu'} avec succès`);

      // Rafraîchir les données du chasseur
      const hData = await fetchHunterDetails();
      setHunter({
        id: hData.id,
        firstName: hData.firstName,
        lastName: hData.lastName,
        dateOfBirth: hData.dateOfBirth,
        phone: hData.phone,
        region: hData.region,
        category: hData.category,
        isMinor: Boolean(hData.isMinor),
        isActive: hData.isActive,
        weaponType: hData.weaponType || undefined,
        weaponBrand: hData.weaponBrand || undefined,
        weaponCaliber: hData.weaponCaliber || undefined,
      });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error);
      toast.error(error instanceof Error ? error.message : 'Une erreur est survenue lors de la mise à jour du statut');
    }
  };

  // Charger les données réelles depuis l'API
  useEffect(() => {
    let abort = false;
    async function loadAll() {
      try {
        if (!open || !hunterId) return;
        setLoading(true);
        // 1) Profil chasseur
        const hRes = await fetch(`/api/hunters/${hunterId}`, {
          credentials: 'include',
        });
        if (!hRes.ok) throw new Error('Erreur chargement chasseur');
        const hData = await hRes.json();
        // Adapter les champs attendus par l'UI si nécessaire
        const mappedHunter: HunterWithDocuments = {
          id: hData.id,
          firstName: hData.firstName,
          lastName: hData.lastName,
          dateOfBirth: hData.dateOfBirth,
          phone: hData.phone,
          region: hData.region,
          category: hData.category,
          isMinor: Boolean(hData.isMinor),
          isActive: hData.isActive,
          weaponType: hData.weaponType || undefined,
          weaponBrand: hData.weaponBrand || undefined,
          weaponCaliber: hData.weaponCaliber || undefined,
          pays: hData.pays ?? null,
          nationality: hData.nationality ?? null,
        };

        // 2) Statut des pièces jointes (nouvelle API attachments)
        const dRes = await fetch(`/api/attachments/${hunterId}`, {
          credentials: 'include',
        });
        if (!dRes.ok) throw new Error('Erreur chargement pièces jointes');
        const statusData: { items?: Array<{ type: string; present: boolean; status?: 'valid' | 'expired' | 'dueSoon' | 'missing'; expiryDate?: string | null; daysLeft?: number; mime?: string; name?: string }>; updatedAt?: string | null } = await dRes.json();
        const items = Array.isArray(statusData?.items) ? statusData.items : [];
        // Adapter en liste de documents avec statut de validité (prise en compte de l'expiration)
        const presentDocs: HunterDocument[] = items
          .filter(it => it && (it as any).type)
          .map((it: any, idx) => ({
            id: idx + 1,
            hunterId,
            documentType: it.type,
            originalName: it.name || it.type,
            filePath: '',
            fileSize: 0,
            mimeType: it.mime || '',
            validityStatus: it.status ?? (it.present ? 'valid' : 'missing'),
            expiryDate: it.expiryDate ?? null,
            daysLeft: it.daysLeft,
            status: 'approved',
            uploadDate: statusData?.updatedAt || new Date().toISOString(),
          }));
        if (!abort) {
          setHunter(mappedHunter);
          setDocuments(presentDocs);
        }
      } catch (e) {
        console.error('Erreur chargement détails chasseur:', e);
      } finally {
        if (!abort) setLoading(false);
      }
    }
    loadAll();
    return () => { abort = true; };
  }, [open, hunterId]);

  // Utilitaires de statut document
  const getDoc = (key: string) => documents.find(d => d.documentType === key);
  const getDocValidity = (key: string): 'valid' | 'expired' | 'dueSoon' | 'missing' => {
    const doc = getDoc(key);
    if (!doc) return 'missing';
    return doc.validityStatus ?? 'valid';
  };
  const hasValidDocument = (key: string) => getDocValidity(key) === 'valid';

  // Ouverture de l'aperçu
  const openPreview = async (docKey: string, label?: string) => {
    // Nettoyer ancien blob si existant
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setPreviewError(null);
    setPreviewLoading(true);
    setPreviewDocType(docKey);
    try {
      // Si le document est manquant, ouvrir un message informatif au lieu d'appeler l'API
      const validity = getDocValidity(docKey);
      if (validity === 'missing') {
        setPreviewError("Aucun document n'est disponible pour cet élément. Veuillez utiliser 'Ajouter' pour téléverser un fichier.");
        setPreviewOpen(true);
        return;
      }
      const res = await fetch(`/api/attachments/${hunterId}/${docKey}?inline=1`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const msg = `Impossible de charger l'aperçu (${res.status})`;
        setPreviewError(msg);
        throw new Error(msg);
      }
      const headerCT = res.headers.get('Content-Type') || '';
      const headerCD = res.headers.get('Content-Disposition') || '';
      const blob = await res.blob();
      const blobType = blob.type || '';
      // Essayer d'inférer depuis le nom de fichier
      let filename = '';
      const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(headerCD);
      if (match) {
        filename = decodeURIComponent(match[1] || match[2] || '');
      }
      const inferMimeFromFilename = (name: string): string => {
        const lower = name.toLowerCase();
        if (lower.endsWith('.png')) return 'image/png';
        if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
        if (lower.endsWith('.webp')) return 'image/webp';
        if (lower.endsWith('.gif')) return 'image/gif';
        if (lower.endsWith('.pdf')) return 'application/pdf';
        return '';
      };
      const inferredFromName = filename ? inferMimeFromFilename(filename) : '';
      let effectiveMime = headerCT || blobType || inferredFromName;
      if (!effectiveMime && docKey === 'hunterPhoto') {
        // Par défaut, considérer la photo comme PNG
        effectiveMime = 'image/png';
      }
      setPreviewMime(effectiveMime);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPreviewOpen(true);
    } catch (e) {
      console.error('Erreur chargement aperçu:', e);
      toast.error("Échec du chargement de l'aperçu du document");
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewDocType(null);
    setPreviewMime(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setPreviewError(null);
  };

  const handleDocumentUploadSuccess = async () => {
    // Recharger les données réelles après upload
    toast.success('Document uploadé avec succès');
    try {
      const [hRes, dRes] = await Promise.all([
        fetch(`/api/hunters/${hunterId}`, { credentials: 'include' }),
        fetch(`/api/attachments/${hunterId}`, { credentials: 'include' }),
      ]);
      if (hRes.ok) {
        const hData = await hRes.json();
        setHunter({
          id: hData.id,
          firstName: hData.firstName,
          lastName: hData.lastName,
          dateOfBirth: hData.dateOfBirth,
          phone: hData.phone,
          region: hData.region,
          category: hData.category,
          isMinor: Boolean(hData.isMinor),
          isActive: hData.isActive,
          weaponType: hData.weaponType || undefined,
          weaponBrand: hData.weaponBrand || undefined,
          weaponCaliber: hData.weaponCaliber || undefined,
        });
      }
      if (dRes.ok) {
        const statusData: { items?: Array<{ type: string; present: boolean; status?: 'valid' | 'expired' | 'dueSoon' | 'missing'; expiryDate?: string | null; daysLeft?: number; mime?: string; name?: string }>; updatedAt?: string | null } = await dRes.json();
        const items = Array.isArray(statusData?.items) ? statusData.items : [];
        const list: HunterDocument[] = items
          .filter(it => it && (it as any).type)
          .map((it: any, idx) => ({
            id: idx + 1,
            hunterId,
            documentType: it.type,
            originalName: it.name || it.type,
            filePath: '',
            fileSize: 0,
            mimeType: it.mime || '',
            validityStatus: it.status ?? (it.present ? 'valid' : 'missing'),
            expiryDate: it.expiryDate ?? null,
            daysLeft: it.daysLeft,
            status: 'approved',
            uploadDate: statusData?.updatedAt || new Date().toISOString(),
          }));
        setDocuments(list);
      }
    } catch (e) {
      console.error('Erreur lors du rechargement après upload:', e);
    }
  };

  // Configuration des documents requis
  const requiredDocuments = [
    {
      key: 'idCardDocument',
      label: 'Pièce d\'Identité',
      description: 'Carte nationale ou passeport (recto-verso en un seul document)',
      required: true
    },
    {
      key: 'weaponPermit',
      label: 'Permis de Port d\'Arme',
      description: 'Autorisation officielle',
      required: true
    },
    {
      key: 'hunterPhoto',
      label: 'Photo du Chasseur',
      description: 'Photo d\'identité récente',
      required: true
    },
    {
      key: 'treasuryStamp',
      label: 'Timbre Impôt',
      description: 'Timbre fiscal obligatoire',
      required: true
    },
    {
      key: 'weaponReceipt',
      label: 'Quittance de l\'Arme par le Trésor',
      description: 'Preuve d\'achat légal',
      required: true
    },
    {
      key: 'insurance',
      label: 'Assurance',
      description: 'Assurance responsabilité civile',
      required: true
    },
    {
      key: 'moralCertificate',
      label: 'Certificat de Bonne Vie et Mœurs',
      description: 'Document optionnel mais recommandé',
      required: false
    }
  ];

  // Calculer la complétude des documents
  const getDocumentCompleteness = () => {
    const requiredDocs = requiredDocuments.filter(doc => doc.required);
    const completedCount = requiredDocs.filter(doc => hasValidDocument(doc.key)).length;
    return {
      complete: completedCount,
      total: requiredDocs.length,
      percentage: requiredDocs.length ? (completedCount / requiredDocs.length) * 100 : 0,
    };
  };

  // Déterminer le statut global du dossier
  const getDossierStatus = () => {
    const { percentage } = getDocumentCompleteness();

    // Vérifier si tous les documents requis sont présents (ignorer l'expiration)
    const requiredDocs = requiredDocuments.filter(doc => doc.required);
    const allDocsPresent = requiredDocs.every(doc => {
      const validity = getDocValidity(doc.key);
      return validity !== 'missing'; // Seulement vérifier la présence, pas l'expiration
    });

    if (percentage === 100 && allDocsPresent) {
      return {
        status: 'complete',
        label: 'Dossier Complet',
        color: 'text-green-600 border-green-600',
        icon: CheckCircle,
        canCreatePermit: true
      };
    } else if (percentage >= 70) {
      return {
        status: 'incomplete',
        label: 'Dossier Incomplet',
        color: 'text-orange-600 border-orange-600',
        icon: AlertTriangle,
        canCreatePermit: false
      };
    } else {
      return {
        status: 'non-conforme',
        label: 'Dossier Non Conforme',
        color: 'text-red-600 border-red-600',
        icon: XCircle,
        canCreatePermit: false
      };
    }
  };

  const calculateAge = (dateOfBirth: string) => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  };

  if (!open) return null;

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chargement des détails du chasseur</DialogTitle>
            <DialogDescription>Veuillez patienter pendant le chargement des informations et des documents.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2">Chargement des détails du chasseur...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!hunter) return null;

  const dossierStatus = getDossierStatus();
  const { complete, total, percentage } = getDocumentCompleteness();
  const age = calculateAge(hunter.dateOfBirth);

  return (
    <>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Détails du Chasseur - {hunter.firstName} {hunter.lastName}
          </DialogTitle>
          <DialogDescription>
            Consultez les informations personnelles, les documents requis et les permis associés au chasseur.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="documents" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="informations">Informations</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="permits">Permis</TabsTrigger>
          </TabsList>

          <TabsContent value="informations">
            <Card>
              <CardHeader>
                <CardTitle>Informations Personnelles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="font-medium">Nom complet:</span> {hunter.firstName} {hunter.lastName}
                  </div>
                  <div>
                    <span className="font-medium">Âge:</span> {age} ans
                  </div>
                  <div>
                    <span className="font-medium">Pays:</span> {hunter.pays ?? 'Non renseigné'}
                  </div>
                  <div>
                    <span className="font-medium">Nationalité:</span> {hunter.nationality ?? 'Non renseignée'}
                  </div>
                  <div className="flex items-center">
                    <Phone className="w-4 h-4 mr-1" />
                    {hunter.phone}
                  </div>
                  <div className="flex items-center">
                    <MapPin className="w-4 h-4 mr-1" />
                    {hunter.region}
                  </div>
                  <div>
                    <span className="font-medium">Catégorie:</span> {hunter.category}
                  </div>
                  <div>
                    <span className="font-medium">Statut:</span>
                    <Badge variant="outline" className={hunter.isMinor ? "text-orange-600 border-orange-600 ml-2" : "text-blue-600 border-blue-600 ml-2"}>
                      {hunter.isMinor ? "Mineur" : "Adulte"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Statut du compte:</span>
                    <Badge
                      variant="outline"
                      className={hunter.isActive ? 'text-green-600 border-green-600' : 'text-red-600 border-red-600'}
                    >
                      {hunter.isActive ? 'Actif' : 'Suspendu'}
                    </Badge>
                    <Button
                      size="sm"
                      variant={hunter.isActive ? 'destructive' : 'default'}
                      className="ml-2"
                      onClick={() => toggleAccountStatus()}
                    >
                      {hunter.isActive ? 'Suspendre le compte' : 'Activer le compte'}
                    </Button>
                  </div>
                </div>

                {hunter.weaponType && (
                  <div className="mt-6">
                    <h4 className="font-medium mb-2">Informations sur l'Arme</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="font-medium">Type:</span> {hunter.weaponType}
                      </div>
                      <div>
                        <span className="font-medium">Marque:</span> {hunter.weaponBrand}
                      </div>
                      <div>
                        <span className="font-medium">Calibre:</span> {hunter.weaponCaliber}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents">
            <div className="space-y-4">
              {/* Statut global du dossier */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>État du Dossier</span>
                    <Badge variant="outline" className={dossierStatus.color}>
                      <dossierStatus.icon className="w-3 h-3 mr-1" />
                      {dossierStatus.label}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between mb-2">
                    <span>Progression des documents</span>
                    <span className="text-sm font-medium">{complete}/{total} documents</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${percentage === 100 ? 'bg-green-500' :
                        percentage >= 70 ? 'bg-orange-500' : 'bg-red-500'
                        }`}
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-gray-600 mt-2">
                    {percentage.toFixed(0)}% des documents obligatoires fournis
                  </p>

                  {!dossierStatus.canCreatePermit && (
                    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                      <p className="text-sm text-yellow-800 mb-2">
                        <AlertTriangle className="w-4 h-4 inline mr-1" />
                        Aucune demande de permis ne peut être générée tant que tous les documents obligatoires ne sont pas fournis.
                      </p>
                      <ul className="list-disc pl-5 space-y-1 text-sm">
                        {requiredDocuments.filter(d => d.required).map((doc) => {
                          const validity = getDocValidity(doc.key);
                          return (
                            <li key={doc.key} className="text-yellow-900">
                              <span className="font-medium">{doc.label}:</span>{' '}
                              {validity === 'missing' ? (
                                <span className="text-red-700">Manquant</span>
                              ) : (
                                <span className="text-green-700">Fourni</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Documents obligatoires */}
              <Card>
                <CardHeader>
                  <CardTitle>Documents Obligatoires</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {requiredDocuments.filter(doc => doc.required).map((doc) => {
                    const validity = getDocValidity(doc.key);
                    const isValid = validity === 'valid';
                    const isExpired = validity === 'expired';
                    const isDueSoon = validity === 'dueSoon';
                    const isPresent = validity !== 'missing';

                    return (
                      <div key={doc.key} className="flex items-center justify-between p-3 border rounded">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{doc.label}</h4>
                            {isPresent && (
                              <span className="inline-flex items-center gap-2 rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-xs font-medium">
                                <span className="w-4 h-4 grid place-items-center rounded-sm bg-green-600 text-white">
                                  <Check className="w-3 h-3" />
                                </span>
                                Fourni
                              </span>
                            )}
                            {isExpired && (
                              <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-medium">
                                <AlertTriangle className="w-3 h-3" />
                                Expiré
                              </span>
                            )}
                            {isDueSoon && (
                              <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-medium">
                                <AlertTriangle className="w-3 h-3" />
                                À mettre à jour
                              </span>
                            )}
                            {validity === 'missing' && (
                              <span className="inline-flex items-center gap-2 rounded-full bg-red-100 text-red-800 px-2 py-0.5 text-xs font-medium">
                                <XCircle className="w-3 h-3" />
                                Manquant
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">{doc.description}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => openPreview(doc.key, doc.label)}
                          >
                            Aperçu
                          </Button>
                          <DocumentUpload
                            key={`${doc.key}-${hunter.id}`}
                            hunterId={hunter.id}
                            documentType={doc.key}
                            currentDocument={getDoc(doc.key)?.filePath || ''}
                            onUploadSuccess={handleDocumentUploadSuccess}
                          />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Documents optionnels */}
              <Card>
                <CardHeader>
                  <CardTitle>Documents Optionnels</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {requiredDocuments.filter(doc => !doc.required).map((doc) => {
                    const validity = getDocValidity(doc.key);
                    const isValid = validity === 'valid';
                    const isPresent = validity !== 'missing';
                    return (
                      <div key={doc.key} className="flex items-center justify-between p-3 border rounded">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{doc.label}</h4>
                            {isPresent ? (
                              <span className="inline-flex items-center gap-2 rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-xs font-medium">
                                <span className="w-4 h-4 grid place-items-center rounded-sm bg-green-600 text-white">
                                  <Check className="w-3 h-3" />
                                </span>
                                Fourni
                              </span>
                            ) : (
                              <Badge variant="outline" className="text-gray-600 border-gray-600">
                                Optionnel
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">{doc.description}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => openPreview(doc.key, doc.label)}
                            disabled={validity === 'missing'}
                          >
                            Aperçu
                          </Button>
                          <DocumentUpload
                            key={`${doc.key}-${hunter.id}`}
                            hunterId={hunter.id}
                            documentType={doc.key}
                            currentDocument={getDoc(doc.key)?.filePath || ''}
                            onUploadSuccess={handleDocumentUploadSuccess}
                          />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="permits">
            <Card>
              <CardHeader>
                <CardTitle>Permis de Chasse</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <FileText className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  {dossierStatus.canCreatePermit ? (
                    <div>
                      <p className="text-gray-500 mb-4">Aucun permis actuel</p>
                      <Button>
                        <FileText className="w-4 h-4 mr-2" />
                        Créer une Demande de Permis
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <p className="text-gray-500 mb-2">Impossible de créer une demande de permis</p>
                      <p className="text-sm text-red-600">
                        Veuillez compléter tous les documents obligatoires avant de pouvoir générer une demande de permis.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
    {/* Modal Aperçu Document */}
    <Dialog open={previewOpen} onOpenChange={(o) => (o ? setPreviewOpen(true) : closePreview())}>
      <DialogContent className="max-w-3xl w-full">
        <DialogHeader>
          <DialogTitle>Aperçu du document</DialogTitle>
          <DialogDescription>
            {previewDocType ? `Type: ${previewDocType}` : ''}
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
              ) : previewMime === 'application/pdf' || (previewMime?.includes('pdf')) ? (
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
          {previewDocType && (
            <a
              href={`/api/attachments/${hunterId}/${previewDocType as string}`}
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
    </>
  );
};

export default HunterDetailsWithDocuments;
