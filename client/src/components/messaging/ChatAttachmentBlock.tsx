import { authenticatedFetch } from '@/lib/authenticatedFetch';
import { guessAttachmentMime, isImageMime, repairAttachmentFileName } from '@/lib/attachmentMime';
import { Download, FileText, Image as ImageIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

const formatFileSize = (bytes?: number | null) => {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
};

// Cache global en mémoire pour éviter de re-télécharger les images 
// à chaque aller-retour dans la discussion
const blobCache = new Map<string, string>();

function AuthInlineImage({ url, alt, className }: { url: string; alt: string; className?: string }) {
  const [src, setSrc] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (blobCache.has(url)) {
      setSrc(blobCache.get(url)!);
      return;
    }

    let objectUrl = '';
    setError(null);
    setSrc('');
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
        blobCache.set(url, objectUrl);
        setSrc(objectUrl);
      })
      .catch((e) => {
        setError(e?.message || 'Chargement impossible');
      });
  }, [url]);

  if (error) {
    return (
      <p className="text-[10px] text-red-200 px-1 py-2 text-center leading-tight">{error}</p>
    );
  }
  if (!src) {
    return (
      <div className="h-24 flex items-center justify-center text-[10px] opacity-70 animate-pulse">
        Chargement…
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} />;
}

export type ChatAttachmentBlockProps = {
  url: string;
  name: string;
  mime?: string | null;
  size?: number | null;
  variant: 'sent' | 'received';
  onOpen: () => void;
};

function downloadAttachment(url: string, filename: string) {
  authenticatedFetch(url.includes('download=1') ? url : (url + (url.includes('?') ? '&download=1' : '?download=1')))
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || 'fichier';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl); }, 200);
    })
    .catch(() => {
      const token = localStorage.getItem('token');
      let finalUrl = url;
      if (token) {
        finalUrl += finalUrl.includes('?') ? `&token=${encodeURIComponent(token)}` : `?token=${encodeURIComponent(token)}`;
      }
      window.open(finalUrl, '_system');
    });
}

export default function ChatAttachmentBlock({
  url,
  name,
  mime,
  size,
  variant,
  onOpen,
}: ChatAttachmentBlockProps) {
  const displayName = repairAttachmentFileName(name);
  const resolvedMime = guessAttachmentMime(displayName, mime);
  const isImage = isImageMime(resolvedMime);
  const sizeLabel = formatFileSize(size);

  const cardClass =
    variant === 'sent'
      ? 'mt-1 rounded-lg overflow-hidden border border-green-500/30 bg-green-700/40 hover:bg-green-700/60 active:scale-[0.98] transition-colors cursor-pointer'
      : 'mt-1 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 hover:bg-gray-100 active:scale-[0.98] transition-colors cursor-pointer';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onOpen();
        }
      }}
      className={cardClass}
    >
      {isImage && url ? (
        <AuthInlineImage
          url={url}
          alt={displayName}
          className="max-h-40 w-full object-cover rounded-t-lg"
        />
      ) : null}
      <div className={`flex items-center gap-2 p-2 ${isImage ? 'border-t border-black/5' : ''}`}>
        {isImage ? (
          <ImageIcon className={`w-4 h-4 shrink-0 ${variant === 'sent' ? 'text-green-100' : 'text-gray-500'}`} />
        ) : (
          <FileText className={`w-4 h-4 shrink-0 ${variant === 'sent' ? 'text-green-100' : 'text-gray-500'}`} />
        )}
        <div className="flex flex-col min-w-0">
          <span
            className={`text-xs font-medium truncate w-32 md:w-48 ${
              variant === 'sent' ? 'text-white' : 'text-gray-700'
            }`}
          >
            {displayName}
          </span>
          {sizeLabel ? (
            <span
              className={`text-[9px] ${variant === 'sent' ? 'text-green-200' : 'text-gray-400'}`}
            >
              {sizeLabel}
            </span>
          ) : null}
        </div>
      </div>
      {variant === 'received' && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); downloadAttachment(url, displayName || 'fichier'); }}
          className="flex items-center gap-1.5 w-full px-2 py-1.5 text-[10px] font-semibold text-green-700 bg-green-50 hover:bg-green-100 border-t border-gray-200 transition-colors"
        >
          <Download className="h-3 w-3" />
          Télécharger
        </button>
      )}
    </div>
  );
}
