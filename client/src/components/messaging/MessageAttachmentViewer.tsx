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
          } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
            try {
              msg = await res.text();
             } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
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

function downloadBlob(url: string, filename: string) {
  // Les téléchargements blob ne marchent pas toujours dans les WebViews Capacitor/Android
  // Nous passons plutôt par window.open() vers l'URL d'API (avec le token) qui a Content-Disposition: attachment
  const token = localStorage.getItem('token');
  let finalUrl = url;
  if (token) {
    finalUrl += finalUrl.includes('?') ? `&token=${encodeURIComponent(token)}` : `?token=${encodeURIComponent(token)}`;
  }
  
  // Utiliser _system pour essayer d'ouvrir via le navigateur/téléchargeur natif
  window.open(finalUrl, '_system');
}

function InteractiveImage({ src, alt }: { src: string; alt: string }) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialDistance, setInitialDistance] = useState<number | null>(null);
  const [initialScale, setInitialScale] = useState(1);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setScale(s => Math.min(Math.max(1, s - e.deltaY * 0.01), 4));
  };

  const handleDoubleClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setScale(s => s > 1 ? 1 : 2);
    setPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      setInitialDistance(dist);
      setInitialScale(scale);
    } else if (e.touches.length === 1 && scale > 1) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX - position.x, y: e.touches[0].clientY - position.y });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialDistance !== null) {
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const zoomFactor = currentDist / initialDistance;
      setScale(Math.min(Math.max(1, initialScale * zoomFactor), 4));
    } else if (e.touches.length === 1 && isDragging && scale > 1) {
      setPosition({ x: e.touches[0].clientX - dragStart.x, y: e.touches[0].clientY - dragStart.y });
    }
  };

  const handleTouchEnd = () => {
    setInitialDistance(null);
    setIsDragging(false);
  };

  const [lastTap, setLastTap] = useState(0);
  const onTouchEndCombo = (e: React.TouchEvent) => {
    handleTouchEnd();
    const now = Date.now();
    if (now - lastTap < 300) {
      handleDoubleClick(e);
    }
    setLastTap(now);
  };

  return (
    <div 
      className="w-full h-full flex items-center justify-center overflow-hidden touch-none"
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={onTouchEndCombo}
    >
      <img
        src={src}
        alt={alt}
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          transition: isDragging || initialDistance !== null ? 'none' : 'transform 0.2s ease-out',
          cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
        }}
        className="max-w-full max-h-full w-auto h-auto object-contain select-none"
        draggable={false}
      />
    </div>
  );
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

  const handleDownload = () => {
    try {
      downloadBlob(downloadUrl, displayName || 'fichier');
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
            <InteractiveImage src={blobUrl} alt={displayName || 'image'} />
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
