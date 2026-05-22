/** Corrige les noms de fichiers mal encodés (latin1 lu comme utf8). */
export function repairAttachmentFileName(name?: string | null): string {
  if (!name) return '';
  const s = String(name);
  if (!/Ã.|â€™|ï¿½/.test(s)) return s;
  try {
    return Buffer.from(s, 'latin1').toString('utf8');
  } catch {
    return s;
  }
}

/** Déduit le MIME à partir du nom de fichier si le serveur n'en a pas fourni. */
export function guessAttachmentMime(
  fileName?: string | null,
  mime?: string | null
): string {
  if (mime && mime !== 'application/octet-stream') return mime;
  const ext = repairAttachmentFileName(fileName).split('.').pop()?.toLowerCase();
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
