import React, { useCallback, useState, useRef, ChangeEvent } from 'react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { useToast } from '../../hooks/use-toast';
import { Alert, AlertDescription } from '../ui/alert';
import { AlertCircle, FileText, Upload as UploadIcon, X } from 'lucide-react';

interface FileUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document?: {
    id: string;
    title: string;
    description?: string;
  } | null;
  onUpload: (file: File, meta?: { expiryDate?: string; issueDate?: string }) => Promise<void>;
}

export function FileUploadDialog({ open, onOpenChange, document, onUpload }: FileUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [expiryDate, setExpiryDate] = useState<string>("");

  const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      
      // Validate file type
      if (!ALLOWED_FILE_TYPES.includes(selectedFile.type)) {
        setError('Type de fichier non pris en charge. Veuillez télécharger un fichier PDF, JPG ou PNG.');
        return;
      }
      
      // Validate file size
      if (selectedFile.size > MAX_FILE_SIZE) {
        setError('La taille du fichier ne doit pas dépasser 5 Mo.');
        return;
      }
      
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Veuillez sélectionner un fichier à téléverser.');
      return;
    }
    
    try {
      setIsUploading(true);
      const meta: { expiryDate?: string } = {};
      if (expiryDate) meta.expiryDate = expiryDate; // format attendu: YYYY-MM-DD
      await onUpload(file, meta);
      
      // Reset form
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setExpiryDate("");
      
      onOpenChange(false);
    } catch (err) {
      console.error('Error uploading file:', err);
      setError('Une erreur est survenue lors du téléversement du fichier. Veuillez réessayer.');
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{document ? `Mettre à jour ${document.title}` : 'Téléverser un document'}</DialogTitle>
          <DialogDescription>
            {document ? (
              <>
                Téléversez le document pour : <span className="font-semibold">{document.title}</span>
                {document.description && (
                  <div className="text-sm text-muted-foreground mt-1">{document.description}</div>
                )}
              </>
            ) : (
              'Sélectionnez un fichier à téléverser'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!file ? (
            <div className="flex items-center justify-center w-full">
              <label
                htmlFor="file-upload"
                className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center">
                  <UploadIcon className="w-10 h-10 mb-3 text-gray-400" />
                  <p className="mb-2 text-sm text-gray-500">
                    <span className="font-semibold">Cliquez pour téléverser</span> ou glissez-déposez
                  </p>
                  <p className="text-xs text-gray-500">
                    PDF, JPG ou PNG (max. 5MB)
                  </p>
                </div>
                <input
                  id="file-upload"
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                  accept=".pdf,.jpg,.jpeg,.png"
                />
              </label>
            </div>
          ) : (
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-full bg-blue-100">
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm truncate max-w-xs">{file.name}</p>
                    <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleRemoveFile}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Supprimer le fichier</span>
                </Button>
              </div>
            </div>
          )}

          {/* Date d'expiration optionnelle */}
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="expiry-date">Date d'expiration (optionnel)</label>
            <input
              id="expiry-date"
              type="date"
              className="border rounded-md px-3 py-2 text-sm"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Laissez vide pour laisser le système calculer automatiquement si applicable (ex: Timbre Impôt).</p>
          </div>

          <div className="text-xs text-muted-foreground mt-2">
            <p>Types de fichiers acceptés : .pdf, .jpg, .jpeg, .png</p>
            <p>Taille maximale : 5 Mo</p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isUploading}
          >
            Annuler
          </Button>
          <Button
            type="button"
            onClick={handleUpload}
            disabled={!file || isUploading}
          >
            {isUploading ? 'Téléversement en cours...' : 'Téléverser le document'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
