/** Corrige les noms mal encodés (mojibake) sans altérer un UTF-8 déjà correct. */
export function repairAttachmentFileName(name?: string | null): string {
  if (!name) return '';
  const s = String(name).trim();
  if (!/Ã.|â€™|ï¿½|â€œ|â€/.test(s)) return s.normalize('NFC');
  try {
    const fixed = Buffer.from(s, 'latin1').toString('utf8');
    if (fixed && !fixed.includes('\uFFFD')) return fixed.normalize('NFC');
  } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
    /* ignore */
   }
  return s.normalize('NFC');
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
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    txt: 'text/plain',
  };
  return (ext && map[ext]) || mime || 'application/octet-stream';
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/');
}
