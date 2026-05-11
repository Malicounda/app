import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger, 
  DialogFooter 
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  FileText, 
  Download, 
  Eye, 
  CheckCircle, 
  XCircle, 
  Clock,
  User,
  Phone,
  MapPin,
  Calendar,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

// Types simplifiés
interface PermitRequest {
  id: string;
  hunterName: string;
  permitType: string;
  requestDate: string;
  status: "pending" | "approved" | "rejected";
  documents: {
    id: string;
    name: string;
    type: string;
    url: string;
    status: 'pending' | 'approved' | 'rejected';
  }[];
  hunterId: string;
  region: string;
  phone: string;
  email: string;
  notes?: string;
}

const PermitRequestManagementSimple: React.FC = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<PermitRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<PermitRequest | null>(null);
  const [processingAction, setProcessingAction] = useState<'approve' | 'reject' | 'deliver' | null>(null);

  // Données de test pour démonstration
  const mockRequests: PermitRequest[] = [
    {
      id: '1',
      hunterName: "Mamadou Diallo",
      permitType: "Petite Chasse",
      requestDate: "2025-01-10",
      status: "pending",
      documents: [
        {
          id: '1',
          name: 'Document 1',
          type: 'pdf',
          url: 'https://example.com/document1.pdf',
          status: 'pending'
        }
      ],
      hunterId: '101',
      region: "Dakar",
      phone: "+221 77 123 4567",
      email: 'mamadou.diallo@example.com'
    },
    {
      id: '2',
      hunterName: "Fatou Sall",
      permitType: "Grande Chasse",
      requestDate: "2025-01-09",
      status: "pending",
      documents: [
        {
          id: '2',
          name: 'Document 2',
          type: 'pdf',
          url: 'https://example.com/document2.pdf',
          status: 'pending'
        }
      ],
      hunterId: '102',
      region: "Saint-Louis",
      phone: "+221 76 987 6543",
      email: 'fatou.sall@example.com'
    },
    {
      id: '3',
      hunterName: "Ousmane Ba",
      permitType: "Gibier d'Eau",
      requestDate: "2025-01-08",
      status: "approved",
      documents: [
        {
          id: '3',
          name: 'Document 3',
          type: 'pdf',
          url: 'https://example.com/document3.pdf',
          status: 'approved'
        }
      ],
      hunterId: '103',
      region: "Tambacounda",
      phone: "+221 78 456 7890",
      email: 'ousmane.ba@example.com'
    }
  ];

  useEffect(() => {
    // Simuler le chargement des données
    setTimeout(() => {
      setRequests(mockRequests);
      setLoading(false);
    }, 1000);
  }, []);

  // Filtrer les demandes par statut
  const pendingRequests = requests.filter(r => r.status === 'pending');
  const approvedRequests = requests.filter(r => r.status === 'approved');
  const rejectedRequests = requests.filter(r => r.status === 'rejected');

  const handleStatusUpdate = async (requestId: string, action: 'approve' | 'reject') => {
    setRequests(prevRequests =>
      prevRequests.map(request =>
        request.id === requestId
          ? {
              ...request,
              status: action === 'approve' 
                ? 'approved' 
                : 'rejected',
            }
          : request
      )
    );
    // Ici, ajouter l'appel API pour mettre à jour le statut
    try {
      const response = await fetch(`/api/permit-requests/${requestId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: action === 'approve' 
            ? 'approved' 
            : 'rejected'
        }),
      });
      
      if (!response.ok) {
        throw new Error('Échec de la mise à jour du statut');
      }
      
      // Recharger les données si nécessaire
      // await fetchRequests();
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error);
      // Revenir à l'état précédent en cas d'erreur
      setRequests(requests);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline">En attente</Badge>;
      case 'approved':
        return <Badge className="bg-green-500 text-white">Approuvé</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejeté</Badge>;
      default:
        return <Badge variant="outline">Inconnu</Badge>;
    }
  };

  const RequestsTable = ({ requests: tableRequests }: { requests: PermitRequest[] }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Chasseur</TableHead>
          <TableHead>Type de Permis</TableHead>
          <TableHead>Région</TableHead>
          <TableHead>Date de Demande</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tableRequests.map((request) => (
          <TableRow key={request.id}>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium">{request.hunterName}</span>
              </div>
            </TableCell>
            <TableCell>{request.permitType}</TableCell>
            <TableCell>{request.region}</TableCell>
            <TableCell>
              {format(new Date(request.requestDate), 'dd/MM/yyyy', { locale: fr })}
            </TableCell>
            <TableCell>{getStatusBadge(request.status)}</TableCell>
            <TableCell>
              <Dialog>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setSelectedRequest(request)}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Voir
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Détails de la Demande de Permis</DialogTitle>
                  </DialogHeader>
                  
                  {selectedRequest && (
                    <div className="space-y-4">
                      {/* Informations du chasseur */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg flex items-center">
                            <User className="w-5 h-5 mr-2" />
                            Informations du Chasseur
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="font-medium">Nom:</span> {selectedRequest.hunterName}
                            </div>
                            <div>
                              <span className="font-medium">Région:</span> {selectedRequest.region}
                            </div>
                            <div className="flex items-center">
                              <Phone className="w-4 h-4 mr-1" />
                              {selectedRequest.phone}
                            </div>
                            <div className="flex items-center">
                              <MapPin className="w-4 h-4 mr-1" />
                              {selectedRequest.region}
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Informations de la demande */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg flex items-center">
                            <FileText className="w-5 h-5 mr-2" />
                            Détails de la Demande
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="font-medium">Type de Permis:</span> {selectedRequest.permitType}
                            </div>
                            <div className="flex items-center">
                              <Calendar className="w-4 h-4 mr-1" />
                              {format(new Date(selectedRequest.requestDate), 'dd/MM/yyyy', { locale: fr })}
                            </div>
                            <div>
                              <span className="font-medium">Statut:</span> {getStatusBadge(selectedRequest.status)}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                  
                  <DialogFooter>
                    {selectedRequest?.status === 'pending' && (
                      <div className="flex gap-2">
                        <Button 
                          onClick={() => handleStatusUpdate(selectedRequest.id, 'reject')}
                          className="bg-red-500 hover:bg-red-600 text-white"
                        >
                          Rejeter
                        </Button>
                        <Button 
                          onClick={() => handleStatusUpdate(selectedRequest.id, 'approve')}
                          className="bg-green-500 hover:bg-green-600 text-white"
                        >
                          Approuver
                        </Button>
                      </div>
                    )}
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin" />
        <span className="ml-2">Chargement des demandes...</span>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Gestion des Demandes de Permis</h1>
        <Button
          onClick={() => {
            setLoading(true);
            setTimeout(() => setLoading(false), 1000);
          }}
          variant="outline"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualiser
        </Button>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending">En attente ({pendingRequests.length})</TabsTrigger>
          <TabsTrigger value="approved">Approuvées ({approvedRequests.length})</TabsTrigger>
          <TabsTrigger value="rejected">Rejetées ({rejectedRequests.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Demandes en Attente</CardTitle>
            </CardHeader>
            <CardContent>
              {pendingRequests.length > 0 ? (
                <RequestsTable requests={pendingRequests} />
              ) : (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500">Aucune demande en attente</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approved">
          <Card>
            <CardHeader>
              <CardTitle>Demandes approuvées</CardTitle>
            </CardHeader>
            <CardContent>
              {approvedRequests.length > 0 ? (
                <RequestsTable requests={approvedRequests} />
              ) : (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500">Aucune demande approuvée</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rejected">
          <Card>
            <CardHeader>
              <CardTitle>Demandes Rejetées</CardTitle>
            </CardHeader>
            <CardContent>
              {rejectedRequests.length > 0 ? (
                <RequestsTable requests={rejectedRequests} />
              ) : (
                <div className="text-center py-8">
                  <XCircle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500">Aucune demande rejetée</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PermitRequestManagementSimple;
