/** Déduit le MIME à partir du nom de fichier si le serveur n'en a pas fourni. */
export function guessAttachmentMime(
  fileName?: string | null,
  mime?: string | null
): string {
  if (mime && mime !== 'application/octet-stream') return mime;
  const ext = (fileName || '').split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    pdf: 'application/pdf',
  };
  return (ext && map[ext]) || mime || 'application/octet-stream';
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/');
}
