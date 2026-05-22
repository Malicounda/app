/** Corrige les noms de fichiers (UTF-8 / latin1) sans casser les accents déjà corrects. */
export function normalizeOriginalFilename(name: string): string {
  const raw = String(name || '').trim() || 'fichier';
  if (/Ã.|â€™|ï¿½|â€œ|â€/.test(raw)) {
    try {
      const fixed = Buffer.from(raw, 'latin1').toString('utf8');
      if (fixed && !fixed.includes('\uFFFD')) {
        return fixed.normalize('NFC');
      }
    } catch {
      /* ignore */
    }
  }
  return raw.normalize('NFC');
}
