import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useDocumentUpload } from '@/hooks/usePermitRequests';

interface DocumentUploadProps {
  hunterId: number;
  documentType: string;
  currentDocument?: string;
  onUploadSuccess: () => void;
}

const DocumentUpload: React.FC<DocumentUploadProps> = ({ 
  hunterId, 
  documentType, 
  currentDocument, 
  onUploadSuccess 
}) => {
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadDocument, uploading } = useDocumentUpload();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Vérifier la taille du fichier (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Le fichier est trop volumineux (5MB maximum)');
        return;
      }
      // Vérifier le type de fichier
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Type de fichier non autorisé. Seuls les formats JPEG, PNG et PDF sont acceptés.');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    
    try {
      await uploadDocument(hunterId, documentType, selectedFile);
      setOpen(false);
      setSelectedFile(null);
      onUploadSuccess();
    } catch (error) {
      // Error is handled in the hook
    }
  };

  const getDocumentLabel = (type: string) => {
    const labels: Record<string, string> = {
      idCardDocument: 'Carte d\'identité',
      weaponPermit: 'Port d\'arme',
      hunterPhoto: 'Photo du chasseur',
      treasuryStamp: 'Timbre Impôt',
      weaponReceipt: 'Quittance de l\'Arme par le Trésor',
      insurance: 'Assurance',
      moralCertificate: 'Certificat de bonne conduite'
    };
    return labels[type] || type;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant={currentDocument ? "outline" : "default"} 
          size="sm"
          className="h-8"
        >
          <Upload className="h-4 w-4 mr-1" />
          {currentDocument ? 'Remplacer' : 'Ajouter'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {currentDocument ? 'Remplacer' : 'Ajouter'} - {getDocumentLabel(documentType)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="file-upload">Sélectionner un fichier</Label>
            <Input
              id="file-upload"
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".jpg,.jpeg,.png,.pdf"
              className="mt-1"
            />
            <p className="text-sm text-muted-foreground mt-1">
              Formats acceptés: JPEG, PNG, PDF (5MB maximum)
            </p>
          </div>
          {selectedFile && (
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm font-medium">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button 
            onClick={handleUpload} 
            disabled={!selectedFile || uploading}
          >
            {uploading ? 'Upload...' : 'Uploader'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentUpload;
