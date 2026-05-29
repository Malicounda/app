import { authenticatedFetch } from '@/lib/authenticatedFetch';
import { guessAttachmentMime, isImageMime, repairAttachmentFileName } from '@/lib/attachmentMime';
import { buildMessageAttachmentUrl } from '@/lib/messageAttachments';
import { Download, FileText, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export type AttachmentViewPayload = {
  messageId: number;
  isGroup?: boolean;
  name?: string | null;
  mime?: string | null;
  size?: number | null;
};

type Props = {
  payload: AttachmentViewPayload | null;
  onClose: () => void;
};

function useAuthBlob(url: string, enabled: boolean) {
  const [blobUrl, setBlobUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !url) {
      setBlobUrl('');
      setError(null);
      return;
    }
    let objectUrl = '';
    setLoading(true);
    setError(null);
    authenticatedFetch(url)
      .then(async (res) => {
        if (!res.ok) {
          let msg = `Erreur ${res.status}`;
          try {
            const j = await res.json();
            msg = j?.message || msg;
          } catch {
            try {
              msg = await res.text();
            } catch {
              /* ignore */
            }
          }
          throw new Error(msg);
        }
        return res.blob();
      })
      .then((blob) => {
        if (!blob.size) throw new Error('Fichier vide');
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch((e) => {
        setError(e?.message || 'Chargement impossible');
        setBlobUrl('');
      })
      .finally(() => setLoading(false));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, enabled]);

  return { blobUrl, error, loading };
}

async function downloadBlob(url: string, filename: string) {
  const res = await authenticatedFetch(url);
  if (!res.ok) throw new Error('Téléchargement impossible');
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

export default function MessageAttachmentViewer({ payload, onClose }: Props) {
  if (!payload) return null;

  const displayName = repairAttachmentFileName(payload.name);
  const mime = guessAttachmentMime(displayName, payload.mime);
  const isImage = isImageMime(mime);
  const isPdf = mime === 'application/pdf';
  const url = buildMessageAttachmentUrl(payload.messageId, {
    isGroup: payload.isGroup,
  });
  const downloadUrl = buildMessageAttachmentUrl(payload.messageId, {
    isGroup: payload.isGroup,
    download: true,
  });

  const { blobUrl, error, loading } = useAuthBlob(url, true);

  const handleDownload = async () => {
    try {
      await downloadBlob(downloadUrl, displayName || 'fichier');
    } catch (e) {
      console.error('[MessageAttachmentViewer] download', e);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] shrink-0 bg-black/80 border-b border-white/10">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white truncate">{displayName}</p>
          {payload.size ? (
            <p className="text-[10px] text-white/60">
              {(payload.size / 1024).toFixed(1)} Ko
              {!isImage && !isPdf ? ' · Document' : ''}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="shrink-0 h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20"
          aria-label="Télécharger"
        >
          <Download className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20"
          aria-label="Fermer"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        className="flex-1 min-h-0 flex items-center justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        onClick={onClose}
      >
        <div
          className="w-full h-full flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {loading ? (
            <p className="text-white/70 text-sm animate-pulse">Chargement…</p>
          ) : error ? (
            <div className="text-center px-6">
              <p className="text-red-300 text-sm mb-4">{error}</p>
              <button
                type="button"
                onClick={handleDownload}
                className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium"
              >
                Télécharger quand même
              </button>
            </div>
          ) : isImage && blobUrl ? (
            <img
              src={blobUrl}
              alt={displayName}
              className="max-w-full max-h-full w-auto h-auto object-contain"
            />
          ) : isPdf && blobUrl ? (
            <iframe
              src={blobUrl}
              title={displayName}
              className="w-full h-full max-h-[85vh] rounded bg-white"
            />
          ) : (
            <div className="text-center px-6 max-w-sm">
              <FileText className="h-16 w-16 text-white/40 mx-auto mb-4" />
              <p className="text-white text-sm font-medium mb-2">Document joint</p>
              <p className="text-white/60 text-xs mb-6">
                Aperçu disponible pour les images et PDF. Pour ce fichier, utilisez le
                téléchargement.
              </p>
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium"
              >
                <Download className="h-4 w-4" />
                Télécharger
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  
  return modalContent;
}
