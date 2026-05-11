import React from 'react';
import { Button } from '../ui/button';
import { FileText, Download, Trash2, Upload, XCircle, Eye, AlertTriangle, Check } from 'lucide-react';
import { Badge } from '../ui/badge';

type DocumentStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'missing';

interface DocumentCardProps {
  title: string;
  description?: string;
  status: DocumentStatus;
  uploadDate?: Date;
  expiryDate?: Date;
  fileSize?: number;
  onUpload: () => void;
  onDownload: () => void;
  onDelete: () => void;
  isRequired?: boolean;
  className?: string;
}

export function DocumentCard({
  title,
  description,
  status,
  uploadDate,
  expiryDate,
  fileSize,
  onUpload,
  onDownload,
  onDelete,
  isRequired = true,
  className = '',
}: DocumentCardProps) {
  const statusConfig = {
    pending: {
      icon: <AlertTriangle className="h-4 w-4" />,
      text: 'À mettre à jour',
      color: 'bg-amber-100 text-amber-800',
    },
    approved: {
      // icône gérée spécifiquement dans le rendu pour afficher le carré vert + coche
      icon: <Check className="h-3 w-3" />,
      text: 'Fourni',
      color: 'bg-green-100 text-green-800',
    },
    rejected: {
      icon: <XCircle className="h-4 w-4" />,
      text: 'Rejeté',
      color: 'bg-red-100 text-red-800',
    },
    expired: {
      icon: <AlertTriangle className="h-4 w-4" />,
      text: 'Expiré',
      color: 'bg-amber-100 text-amber-800',
    },
    missing: {
      icon: <FileText className="h-4 w-4" />,
      text: 'Manquant',
      color: 'bg-gray-100 text-gray-800',
    },
  } as const;

  const statusInfo = statusConfig[status] || statusConfig.missing;

  return (
    <div className={`border rounded-lg p-4 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-4">
          <div className="p-2 rounded-full bg-gray-100">
            <FileText className="h-5 w-5 text-gray-600" />
          </div>
          <div>
            <h3 className="font-medium">
              {title}
              {isRequired && (
                <span className="ml-2 text-xs text-red-500">*</span>
              )}
            </h3>
            {description && (
              <p className="text-sm text-gray-500 mt-1">{description}</p>
            )}
            <div className="flex items-center mt-2 space-x-2">
              {status === 'approved' ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-xs font-medium">
                  <span className="w-4 h-4 grid place-items-center rounded-sm bg-green-600 text-white">
                    <Check className="w-3 h-3" />
                  </span>
                  {statusInfo.text}
                </span>
              ) : (
                <span className={`inline-flex items-center gap-2 rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.color}`}>
                  {statusInfo.icon}
                  {statusInfo.text}
                </span>
              )}
              {uploadDate && (
                <span className="text-xs text-gray-500">
                  Téléversé le: {new Date(uploadDate).toLocaleDateString()}
                </span>
              )}
              {expiryDate && (
                <span className="text-xs text-gray-500">
                  Expire le: {new Date(expiryDate).toLocaleDateString()}
                </span>
              )}
              {fileSize && (
                <span className="text-xs text-gray-500">
                  {(fileSize / 1024 / 1024).toFixed(2)} MB
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex space-x-2">
          {status !== 'missing' ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onDownload}
                className="h-8 px-2"
              >
                <Eye className="h-4 w-4 mr-1" />
                Aperçu
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onUpload}
                className="h-8 px-2"
              >
                <Upload className="h-4 w-4 mr-1" />
                Changer
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onDelete}
                className="h-8 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Supprimer
              </Button>
            </>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={onUpload}
              className="h-8"
            >
              <Upload className="h-4 w-4 mr-1" />
              Ajouter
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
