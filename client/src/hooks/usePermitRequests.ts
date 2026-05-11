import { useState, useEffect } from 'react';
import { toast } from 'sonner';

export interface PermitRequest {
  id: number;
  hunterId: number;
  hunterName: string;
  hunterCategory: 'resident' | 'non_resident';
  requestDate: string;
  requestStatus: 'pending' | 'processed' | 'rejected';
  permitType: string;
  region: string;
  phone: string;
  documents: {
    idCardDocument?: string;
    weaponPermit?: string;
    hunterPhoto?: string;
    treasuryStamp?: string;
    weaponReceipt?: string;
    insurance?: string;
    moralCertificate?: string;
  };
  documentsComplete: boolean;
  processedBy?: number;
  processedAt?: string;
  agentName?: string;
}

export const usePermitRequests = () => {
  const [requests, setRequests] = useState<PermitRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/permit-requests', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des demandes');
      }

      const data = await response.json();
      setRequests(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
      toast.error('Erreur lors de la récupération des demandes');
    } finally {
      setLoading(false);
    }
  };

  const processRequest = async (requestId: number, action: 'approve' | 'reject', processedBy: number) => {
    try {
      const response = await fetch(`/api/permit-requests/${requestId}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ action, processedBy }),
      });

      if (!response.ok) {
        throw new Error('Erreur lors du traitement de la demande');
      }

      const result = await response.json();
      
      // Mettre à jour la liste des demandes
      await fetchRequests();
      
      toast.success(result.message);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Une erreur est survenue';
      toast.error(message);
      throw err;
    }
  };

  const downloadDocument = async (hunterId: number, documentType: string) => {
    try {
      const response = await fetch(`/api/permit-requests/documents/${hunterId}/${documentType}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Erreur lors du téléchargement du document');
      }

      const result = await response.json();
      toast.info(result.message);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Une erreur est survenue';
      toast.error(message);
      throw err;
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  return {
    requests,
    loading,
    error,
    fetchRequests,
    processRequest,
    downloadDocument,
  };
};

export const useDocumentUpload = () => {
  const [uploading, setUploading] = useState(false);

  const uploadDocument = async (hunterId: number, documentType: string, file: File) => {
    try {
      setUploading(true);
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', documentType);

      const response = await fetch(`/api/attachments/${hunterId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erreur lors de l\'upload du document');
      }

      const result = await response.json();
      toast.success(result.message);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Une erreur est survenue';
      toast.error(message);
      throw err;
    } finally {
      setUploading(false);
    }
  };

  const deleteDocument = async (hunterId: number, documentType: string) => {
    try {
      const response = await fetch(`/api/attachments/${hunterId}/${documentType}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la suppression du document');
      }

      const result = await response.json();
      toast.success(result.message);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Une erreur est survenue';
      toast.error(message);
      throw err;
    }
  };

  return {
    uploading,
    uploadDocument,
    deleteDocument,
  };
};
