import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { TypePermisSpecial, DocumentJoint } from '@/types/permis';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, FileText, AlertCircle } from 'lucide-react';

export default function DemandePermisSpecial() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [typePermis, setTypePermis] = useState<TypePermisSpecial | ''>('');
  const [documents, setDocuments] = useState<DocumentJoint[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map(file => {
        const fileUrl = URL.createObjectURL(file);
        return {
          id: fileUrl,
          type: file.type,
          url: fileUrl,
          dateDepot: new Date(),
          name: file.name // Ajout du nom du fichier
        };
      });
      setDocuments(prev => [...prev, ...newFiles]);
    }
  };

  const removeDocument = (index: number) => {
    setDocuments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!typePermis) {
      setError('Veuillez sélectionner un type de permis');
      return;
    }

    if (documents.length === 0) {
      setError('Veuillez joindre au moins un document');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      // TODO: Implémenter l'appel API pour soumettre la demande
      const formData = new FormData();
      formData.append('type', typePermis);
      // Convertir les documents en fichiers pour l'envoi
      const files = await Promise.all(documents.map(async (doc) => {
        const response = await fetch(doc.url);
        return await response.blob();
      }));
      
      files.forEach((file, index) => {
        formData.append(`documents`, file);
      });

      const response = await fetch('/api/permis-speciaux/demandes', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la soumission de la demande');
      }

      navigate('/mes-demandes', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) {
    navigate('/login');
    return null;
  }

  return (
    <div className="container mx-auto py-8">
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>Demande de Permis Spécial</CardTitle>
          <CardDescription>
            Remplissez le formulaire ci-dessous pour soumettre une demande de permis spécial.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
              <AlertCircle className="inline mr-2" />
              {error}
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="typePermis">Type de permis</Label>
              <Select 
                value={typePermis} 
                onValueChange={(value: TypePermisSpecial) => setTypePermis(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionnez un type de permis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TypePermisSpecial.PETITE_CHASSE_RESIDENT}>
                    Permis de Petite Chasse (Résident)
                  </SelectItem>
                  <SelectItem value={TypePermisSpecial.PETITE_CHASSE_COUTUMIER}>
                    Permis de Petite Chasse (Coutumier)
                  </SelectItem>
                  <SelectItem value={TypePermisSpecial.GRANDE_CHASSE}>
                    Permis de Grande Chasse
                  </SelectItem>
                  <SelectItem value={TypePermisSpecial.GIBIER_EAU}>
                    Permis de Gibier d'Eau
                  </SelectItem>
                  <SelectItem value={TypePermisSpecial.SCIENTIFIQUE}>
                    Permis Scientifique de Chasse
                  </SelectItem>
                  <SelectItem value={TypePermisSpecial.CAPTURE_COMMERCIALE}>
                    Permis de Capture Commerciale
                  </SelectItem>
                  <SelectItem value={TypePermisSpecial.OISELLERIE}>
                    Permis d'Oisellerie
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Documents à fournir</Label>
              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                <div className="flex flex-col items-center justify-center space-y-2">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <div className="text-sm text-muted-foreground">
                    <Label 
                      htmlFor="file-upload" 
                      className="relative cursor-pointer rounded-md font-medium text-primary hover:text-primary/90"
                    >
                      Téléversez des fichiers
                    </Label>
                    <span className="ml-1">ou glissez-déposez</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    PDF, JPG, PNG jusqu'à 10MB
                  </p>
                  <Input
                    id="file-upload"
                    name="file-upload"
                    type="file"
                    className="sr-only"
                    multiple
                    onChange={handleFileChange}
                    accept=".pdf,.jpg,.jpeg,.png"
                  />
                </div>
              </div>
              
              {documents.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h4 className="text-sm font-medium">Fichiers sélectionnés ({documents.length})</h4>
                  <ul className="space-y-2">
                    {documents.map((file, index) => (
                      <li key={index} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                        <div className="flex items-center space-x-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{file.name || file.url.split('/').pop()}</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeDocument(index)}
                          className="text-destructive hover:text-destructive/90"
                        >
                          Supprimer
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-4 pt-4">
              <Button 
                type="button" 
                variant="outline"
                onClick={() => window.history.back()}
                disabled={isSubmitting}
              >
                Annuler
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting || !typePermis || documents.length === 0}
              >
                {isSubmitting ? 'Envoi en cours...' : 'Soumettre la demande'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
