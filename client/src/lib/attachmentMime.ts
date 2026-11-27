/**
 * Corrige les noms mal encodés (mojibake UTF-8/latin1 ou caractère de remplacement 
 * enregistré en base par un ancien double-décodage) sans altérer un UTF-8 déjà correct.
 */
function repairCorruptedFrenchWords(text: string): string {
  if (!text.includes('\uFFFD')) return text;
  return text
    .replace(/d(['’])\uFFFDcran/gi, "d$1écran")
    .replace(/Pi\uFFFDce/g, 'Pièce')
    .replace(/pi\uFFFDce/g, 'pièce')
    .replace(/identit\uFFFD/gi, 'identité')
    .replace(/imp\uFFFDt/gi, 'impôt')
    .replace(/num\uFFFDro/gi, 'numéro')
    .replace(/d\uFFFDclaration/gi, 'déclaration')
    .replace(/r\uFFFDc\uFFFDpiss\uFFFD/gi, 'récépissé')
    .replace(/r\uFFFDgion/gi, 'région')
    .replace(/d\uFFFDpartement/gi, 'département')
    .replace(/t\uFFFDl\uFFFDchargement/gi, 'téléchargement')
    .replace(/m\uFFFDmoire/gi, 'mémoire')
    .replace(/arr\uFFFDt\uFFFD/gi, 'arrêté')
    .replace(/chasseur\uFFFDs/gi, 'chasseurs')
    .replace(/\uFFFD/g, 'é');
}

export function repairAttachmentFileName(name?: string | null): string {
  if (!name) return '';
  let s = String(name).trim();

  // 1. Corriger le mojibake latin1 -> utf8 côté navigateur via TextDecoder
  if (/Ã.|â€™|ï¿½|â€œ|â€/.test(s)) {
    try {
      const bytes = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) {
        bytes[i] = s.charCodeAt(i) & 0xff;
      }
      const fixed = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      if (fixed && !fixed.includes('\uFFFD')) {
        s = fixed;
      }
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
    }
  }

  // 2. Réparer les noms déjà stockés en base avec le caractère de remplacement  (\uFFFD)
  if (s.includes('\uFFFD')) {
    s = repairCorruptedFrenchWords(s);
  }

  return s.normalize('NFC');
}

/** Déduit le MIME à partir du nom de fichier si le serveur n'en a pas fourni. */
export function guessAttachmentMime(
  fileName?: string | null,
  mime?: string | null,
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
