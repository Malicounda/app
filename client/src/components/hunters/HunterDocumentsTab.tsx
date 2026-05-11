import React, { useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useToast } from '../../hooks/use-toast';
import { DocumentCard } from '../documents/DocumentCard';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { FileUploadDialog } from './FileUploadDialog';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { AlertCircle } from 'lucide-react';
import { apiRequest, apiRequestBlob } from '@/lib/api';

interface Document {
  id: string;
  type: string;
  title: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'missing';
  uploadDate?: Date;
  expiryDate?: Date;
  fileSize?: number;
  isRequired: boolean;
}

export function HunterDocumentsTab() {
  const { hunterId } = useParams<{ hunterId: string }>();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const { toast } = useToast();

  // Libellés et exigences par type (alignés sur le backend camelCase)
  const DOC_DEFS: Record<string, { title: string; description: string; required: boolean } > = {
    idCardDocument: { title: "Pièce d'identité", description: "Carte nationale ou passeport (recto-verso)", required: true },
    weaponPermit: { title: "Permis de Port d'Arme", description: "Autorisation officielle de port d'arme", required: true },
    hunterPhoto: { title: "Photo du Chasseur", description: "Photo d'identité récente", required: true },
    treasuryStamp: { title: "Timbre Impôt", description: "Timbre fiscal obligatoire", required: true },
    weaponReceipt: { title: "Quittance de l'Arme par le Trésor", description: "Preuve d'achat légal de l'arme", required: true },
    insurance: { title: "Assurance", description: "Assurance responsabilité civile", required: true },
    moralCertificate: { title: "Certificat de Bonne Vie et Mœurs", description: "Document optionnel mais recommandé", required: false },
  };

  // Fetch hunter's attachments (statuts + dates)
  const fetchDocuments = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await apiRequest<any>('GET', `/attachments/${hunterId}`);
      if (!res.ok) throw new Error(res.error || 'Impossible de charger les pièces jointes');
      const data = res.data as any;

      const now = new Date();
      const mapped: Document[] = (Array.isArray(data?.items) ? data.items : []).map((d: any) => {
        const type: string = d.type; // camelCase depuis le backend
        const def = DOC_DEFS[type] ?? { title: type, description: '', required: false };
        const expiryDate = d.expiryDate ? new Date(d.expiryDate) : undefined;
        // Mapper le statut backend vers nos catégories d'affichage
        let status: Document['status'] = 'missing';
        if (d.status === 'expired') status = 'expired';
        else if (d.status === 'dueSoon') status = 'pending'; // à surveiller
        else if (d.status === 'valid') status = 'approved';
        else status = 'missing';

        return {
          id: type,
          type,
          title: def.title,
          description: def.description,
          status,
          expiryDate,
          isRequired: def.required,
        } as Document;
      });

      // Ajouter les documents manquants (non présents en base)
      const typesPresent = new Set(mapped.map(m => m.type));
      const missing: Document[] = Object.entries(DOC_DEFS)
        .filter(([t]) => !typesPresent.has(t))
        .map(([t, def]) => ({
          id: `missing-${t}`,
          type: t,
          title: def.title,
          description: def.description,
          status: 'missing',
          isRequired: def.required,
        } as Document));

      setDocuments([...mapped, ...missing]);
    } catch (error) {
      console.error('Error fetching documents:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de charger les documents du chasseur',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [hunterId, toast]);

  useEffect(() => {
    if (hunterId) {
      fetchDocuments();
    }
  }, [hunterId, fetchDocuments]);

  const handleUploadClick = (document: Document) => {
    setSelectedDocument(document);
    setIsUploadDialogOpen(true);
  };

  const handleDownload = async (documentId: string) => {
    try {
      const res = await apiRequestBlob(`/attachments/${hunterId}/${documentId}?inline=1`, 'GET');
      if (!res.ok || !res.blob) throw new Error(res.error || 'Téléchargement indisponible');
      const blobUrl = URL.createObjectURL(res.blob);
      window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (error) {
      console.error('Error downloading document:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de télécharger le document',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (documentId: string) => {
    try {
      const res = await apiRequest<any>('DELETE', `/attachments/${hunterId}/${documentId}`);
      if (!res.ok) throw new Error(res.error || 'Suppression échouée');
      await fetchDocuments();
      toast({ title: 'Suppression', description: 'Le document a été supprimé avec succès' });
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de supprimer le document',
        variant: 'destructive',
      });
    }
  };

  const handleFileUpload = async (file: File, meta?: { expiryDate?: string; issueDate?: string }) => {
    if (!selectedDocument) return;
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      // Le backend attend des types camelCase
      formData.append('documentType', selectedDocument.type);
      if (meta?.expiryDate) formData.append('expiryDate', meta.expiryDate);
      if (meta?.issueDate) formData.append('issueDate', meta.issueDate);
      const res = await apiRequest<any>('POST', `/attachments/${hunterId}`, formData);
      if (!res.ok) throw new Error(res.error || 'Upload échoué');
      await fetchDocuments();
      toast({ title: 'Succès', description: 'Le document a été téléversé avec succès' });
      setIsUploadDialogOpen(false);
      setSelectedDocument(null);
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de téléverser le document',
        variant: 'destructive',
      });
    }
  };

  // Categorize documents by status for tabs
  const pendingDocuments = documents.filter(doc => doc.status === 'pending');
  const approvedDocuments = documents.filter(doc => doc.status === 'approved');
  const rejectedDocuments = documents.filter(doc => doc.status === 'rejected' || doc.status === 'expired');
  const missingDocuments = documents.filter(doc => doc.status === 'missing');

  // Calculate completion status
  const requiredDocuments = documents.filter(doc => doc.isRequired);
  const completedDocuments = requiredDocuments.filter(
    doc => doc.status === 'approved' || doc.status === 'pending'
  ).length;
  const completionPercentage = requiredDocuments.length > 0
    ? Math.round((completedDocuments / requiredDocuments.length) * 100)
    : 0;

  let statusVariant: 'default' | 'destructive' | null | undefined = 'destructive';
  let statusMessage = 'Dossier Non Conforme';
  
  if (completionPercentage === 100) {
    statusVariant = 'default';
    statusMessage = '✅ Dossier Complet';
  } else if (completionPercentage >= 70) {
    // 'warning' n'est pas un variant supporté par Alert, on garde 'default' et on affiche l'emoji
    statusVariant = 'default';
    statusMessage = '⚠️ Dossier Incomplet';
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Documents du Chasseur</h2>
        <Alert variant={statusVariant} className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>État du dossier</AlertTitle>
          <AlertDescription>
            {statusMessage} ({completedDocuments}/{requiredDocuments.length} documents fournis)
          </AlertDescription>
        </Alert>
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">Tous les documents</TabsTrigger>
          <TabsTrigger value="pending">En attente</TabsTrigger>
          <TabsTrigger value="approved">Approuvés</TabsTrigger>
          <TabsTrigger value="rejected">Rejetés/Expirés</TabsTrigger>
          <TabsTrigger value="missing">Manquants</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              title={doc.title}
              description={doc.description}
              status={doc.status}
              uploadDate={doc.uploadDate}
              expiryDate={doc.expiryDate}
              fileSize={doc.fileSize}
              onUpload={() => handleUploadClick(doc)}
              onDownload={() => handleDownload(doc.id)}
              onDelete={() => handleDelete(doc.id)}
              isRequired={doc.isRequired}
            />
          ))}
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          {pendingDocuments.length > 0 ? (
            pendingDocuments.map((doc) => (
              <DocumentCard
                key={doc.id}
                title={doc.title}
                description={doc.description}
                status={doc.status}
                uploadDate={doc.uploadDate}
                expiryDate={doc.expiryDate}
                fileSize={doc.fileSize}
                onUpload={() => handleUploadClick(doc)}
                onDownload={() => handleDownload(doc.id)}
                onDelete={() => handleDelete(doc.id)}
                isRequired={doc.isRequired}
              />
            ))
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                Aucun document en attente de validation
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="approved" className="space-y-4">
          {approvedDocuments.length > 0 ? (
            approvedDocuments.map((doc) => (
              <DocumentCard
                key={doc.id}
                title={doc.title}
                description={doc.description}
                status={doc.status}
                uploadDate={doc.uploadDate}
                expiryDate={doc.expiryDate}
                fileSize={doc.fileSize}
                onUpload={() => handleUploadClick(doc)}
                onDownload={() => handleDownload(doc.id)}
                onDelete={() => handleDelete(doc.id)}
                isRequired={doc.isRequired}
              />
            ))
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                Aucun document approuvé
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="rejected" className="space-y-4">
          {rejectedDocuments.length > 0 ? (
            rejectedDocuments.map((doc) => (
              <DocumentCard
                key={doc.id}
                title={doc.title}
                description={doc.description}
                status={doc.status}
                uploadDate={doc.uploadDate}
                expiryDate={doc.expiryDate}
                fileSize={doc.fileSize}
                onUpload={() => handleUploadClick(doc)}
                onDownload={() => handleDownload(doc.id)}
                onDelete={() => handleDelete(doc.id)}
                isRequired={doc.isRequired}
              />
            ))
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                Aucun document rejeté ou expiré
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="missing" className="space-y-4">
          {missingDocuments.length > 0 ? (
            missingDocuments.map((doc) => (
              <DocumentCard
                key={doc.id}
                title={doc.title}
                description={doc.description}
                status={doc.status}
                uploadDate={doc.uploadDate}
                expiryDate={doc.expiryDate}
                fileSize={doc.fileSize}
                onUpload={() => handleUploadClick(doc)}
                onDownload={() => handleDownload(doc.id)}
                onDelete={() => handleDelete(doc.id)}
                isRequired={doc.isRequired}
              />
            ))
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                Aucun document manquant
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <FileUploadDialog
        open={isUploadDialogOpen}
        onOpenChange={setIsUploadDialogOpen}
        document={selectedDocument}
        onUpload={handleFileUpload}
      />
    </div>
  );
}
