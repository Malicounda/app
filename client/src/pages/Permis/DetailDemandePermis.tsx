import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { TypePermisSpecial, StatutDemande, DocumentJoint } from '@/types/permis';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  Download, 
  ArrowLeft, 
  Clock, 
  Check, 
  X, 
  AlertTriangle,
  Calendar,
  User,
  MapPin,
  MessageSquare
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const statutCouleurs = {
  NOUVELLE: 'bg-blue-100 text-blue-800',
  AFFECTEE: 'bg-purple-100 text-purple-800',
  RDV_PLANIFIE: 'bg-yellow-100 text-yellow-800',
  DOCUMENTS_VERIFIES: 'bg-indigo-100 text-indigo-800',
  VALIDEE: 'bg-green-100 text-green-800',
  REJETEE: 'bg-red-100 text-red-800',
};

const statutIcones = {
  NOUVELLE: <Clock className="h-4 w-4" />,
  AFFECTEE: <AlertTriangle className="h-4 w-4" />,
  RDV_PLANIFIE: <Calendar className="h-4 w-4" />,
  DOCUMENTS_VERIFIES: <Check className="h-4 w-4" />,
  VALIDEE: <Check className="h-4 w-4" />,
  REJETEE: <X className="h-4 w-4" />,
};

const typePermisLabels = {
  [TypePermisSpecial.PETITE_CHASSE_RESIDENT]: 'Petite Chasse (Résident)',
  [TypePermisSpecial.PETITE_CHASSE_COUTUMIER]: 'Petite Chasse (Coutumier)',
  [TypePermisSpecial.GRANDE_CHASSE]: 'Grande Chasse',
  [TypePermisSpecial.GIBIER_EAU]: 'Gibier d\'Eau',
  [TypePermisSpecial.SCIENTIFIQUE]: 'Scientifique',
  [TypePermisSpecial.CAPTURE_COMMERCIALE]: 'Capture Commerciale',
  [TypePermisSpecial.OISELLERIE]: 'Oisellerie',
};

type DocumentType = 'cni' | 'photo' | 'certificat' | 'autre';

const documentTypes: Record<DocumentType, string> = {
  cni: 'Pièce d\'identité',
  photo: 'Photo d\'identité',
  certificat: 'Certificat médical',
  autre: 'Autre document',
};

export default function DetailDemandePermis() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [demande, setDemande] = useState<{
    id: string;
    type: TypePermisSpecial;
    statut: StatutDemande;
    dateCreation: string;
    dateAffectation?: string;
    dateRdv?: string;
    dateValidation?: string;
    agentAffecte?: {
      id: string;
      nom: string;
      prenom: string;
      telephone: string;
    };
    lieuRetrait?: {
      type: 'REGIONAL' | 'SECTEUR';
      id: string;
      nom: string;
      adresse: string;
      contact: string;
      horaires: string;
    };
    documents: Array<DocumentJoint & { type: DocumentType }>;
    commentaires?: string;
    motifRejet?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchDemande = async () => {
      if (!user) return;
      
      try {
        // TODO: Remplacer par l'URL de l'API réelle
        const response = await fetch(`/api/permis-speciaux/demandes/${id}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (!response.ok) {
          throw new Error('Erreur lors du chargement de la demande');
        }

        const data = await response.json();
        setDemande(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Une erreur est survenue');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDemande();
  }, [id, user]);

  const handleDownload = (url: string | URL, filename: string) => {
    // TODO: Implémenter le téléchargement du fichier
    console.log(`Téléchargement de ${filename} depuis ${url}`);
    // Exemple de téléchargement :
    const link = document.createElement('a');
    link.href = typeof url === 'string' ? url : url.toString();
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatutBadge = (statut: StatutDemande) => (
    <div className="flex items-center">
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statutCouleurs[statut]}`}>
        {statutIcones[statut]}
        <span className="ml-1">
          {statut.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ')}
        </span>
      </span>
    </div>
  );

  if (!user) {
    navigate('/login');
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !demande || !id) {
    return (
      <div className="container mx-auto py-8">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Erreur ! </strong>
          <span className="block sm:inline">{error || 'Demande introuvable'}</span>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/', { replace: true })}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <Button 
        variant="ghost" 
        onClick={() => navigate('/', { replace: true })}
        className="mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Retour
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-2xl">
                    Demande de {typePermisLabels[demande.type] || demande.type}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Référence: {demande.id}
                  </p>
                </div>
                {getStatutBadge(demande.statut)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">Date de demande</h3>
                  <p>
                    {format(new Date(demande.dateCreation), 'PPP', { locale: fr })}
                  </p>
                </div>
                
                {demande.dateRdv && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Date de rendez-vous</h3>
                    <p>
                      {format(new Date(demande.dateRdv), 'PPPp', { locale: fr })}
                    </p>
                  </div>
                )}

                {demande.agentAffecte && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Agent affecté</h3>
                    <div className="flex items-center">
                      <User className="h-4 w-4 mr-2 text-muted-foreground" />
                      <span>{demande.agentAffecte.prenom} {demande.agentAffecte.nom}</span>
                    </div>
                    <div className="flex items-center text-sm text-muted-foreground">
                      <MessageSquare className="h-4 w-4 mr-2" />
                      <a href={`tel:${demande.agentAffecte.telephone}`} className="hover:underline">
                        {demande.agentAffecte.telephone}
                      </a>
                    </div>
                  </div>
                )}

                {demande.lieuRetrait && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Lieu de retrait</h3>
                    <div className="flex items-start">
                      <MapPin className="h-4 w-4 mt-0.5 mr-2 flex-shrink-0 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{demande.lieuRetrait.nom}</p>
                        <p className="text-sm text-muted-foreground">
                          {demande.lieuRetrait.adresse}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {demande.lieuRetrait.contact}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Horaires: {demande.lieuRetrait.horaires}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {demande.commentaires && (
                <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                  <h3 className="text-sm font-medium mb-2">Commentaires</h3>
                  <p className="text-sm">{demande.commentaires}</p>
                </div>
              )}

              {demande.motifRejet && (
                <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <h3 className="text-sm font-medium text-red-800 mb-2">Motif du rejet</h3>
                  <p className="text-sm text-red-700">{demande.motifRejet}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documents joints</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {demande.documents.length > 0 ? (
                  <div className="space-y-2">
                    {demande.documents.map((doc, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center">
                          <FileText className="h-5 w-5 text-muted-foreground mr-3" />
                          <div>
                            <p className="text-sm font-medium">
                              {documentTypes[doc.type] || 'Document'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(doc.dateDepot), 'PPP', { locale: fr })}
                            </p>
                          </div>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDownload(doc.url, `document-${index}.${doc.url.split('.').pop()}`)}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Télécharger
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Aucun document joint</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {demande.statut === 'RDV_PLANIFIE' && (
                <Button className="w-full">
                  Confirmer le rendez-vous
                </Button>
              )}
              
              {['NOUVELLE', 'AFFECTEE', 'RDV_PLANIFIE', 'DOCUMENTS_VERIFIES'].includes(demande.statut) && (
                <Button variant="outline" className="w-full">
                  Annuler la demande
                </Button>
              )}

              {demande.statut === 'VALIDEE' && demande.lieuRetrait && (
                <Button className="w-full">
                  Télécharger le permis
                </Button>
              )}

              <Button variant="outline" className="w-full">
                Contacter le support
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Statut</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="relative">
                  <div className="absolute left-4 h-full w-0.5 bg-muted -translate-x-1/2"></div>
                  
                  <div className="relative flex items-start pb-6">
                    <div className="bg-background rounded-full p-1">
                      <div className={`h-2 w-2 rounded-full ${
                        ['NOUVELLE', 'AFFECTEE', 'RDV_PLANIFIE', 'DOCUMENTS_VERIFIES', 'VALIDEE', 'REJETEE'].includes(demande.statut) 
                          ? 'bg-primary' 
                          : 'bg-muted'
                      }`}></div>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium">Demande déposée</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(demande.dateCreation), 'PPPp', { locale: fr })}
                      </p>
                    </div>
                  </div>

                  {demande.dateAffectation && (
                    <div className="relative flex items-start pb-6">
                      <div className="bg-background rounded-full p-1">
                        <div className={`h-2 w-2 rounded-full ${
                          ['AFFECTEE', 'RDV_PLANIFIE', 'DOCUMENTS_VERIFIES', 'VALIDEE', 'REJETEE'].includes(demande.statut) 
                            ? 'bg-primary' 
                            : 'bg-muted'
                        }`}></div>
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium">Demande affectée</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(demande.dateAffectation), 'PPPp', { locale: fr })}
                        </p>
                        {demande.agentAffecte && (
                          <p className="text-xs text-muted-foreground mt-1">
                            À {demande.agentAffecte.prenom} {demande.agentAffecte.nom}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {demande.dateRdv && (
                    <div className="relative flex items-start pb-6">
                      <div className="bg-background rounded-full p-1">
                        <div className={`h-2 w-2 rounded-full ${
                          ['RDV_PLANIFIE', 'DOCUMENTS_VERIFIES', 'VALIDEE', 'REJETEE'].includes(demande.statut) 
                            ? 'bg-primary' 
                            : 'bg-muted'
                        }`}></div>
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium">Rendez-vous planifié</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(demande.dateRdv), 'PPPp', { locale: fr })}
                        </p>
                      </div>
                    </div>
                  )}

                  {demande.statut === 'DOCUMENTS_VERIFIES' && (
                    <div className="relative flex items-start pb-6">
                      <div className="bg-background rounded-full p-1">
                        <div className="h-2 w-2 rounded-full bg-primary"></div>
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium">Documents vérifiés</p>
                        <p className="text-xs text-muted-foreground">
                          En attente de validation finale
                        </p>
                      </div>
                    </div>
                  )}

                  {demande.statut === 'VALIDEE' && demande.dateValidation && (
                    <div className="relative flex items-start">
                      <div className="bg-background rounded-full p-1">
                        <div className="h-2 w-2 rounded-full bg-green-500"></div>
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium">Demande validée</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(demande.dateValidation), 'PPPp', { locale: fr })}
                        </p>
                        {demande.lieuRetrait && (
                          <p className="text-xs text-muted-foreground mt-1">
                            À retirer à {demande.lieuRetrait.nom}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {demande.statut === 'REJETEE' && demande.dateValidation && (
                    <div className="relative flex items-start">
                      <div className="bg-background rounded-full p-1">
                        <div className="h-2 w-2 rounded-full bg-red-500"></div>
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium">Demande rejetée</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(demande.dateValidation), 'PPPp', { locale: fr })}
                        </p>
                        {demande.motifRejet && (
                          <p className="text-xs text-red-600 mt-1">
                            Motif: {demande.motifRejet}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
