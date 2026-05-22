import fs from 'fs';
import path from 'path';

/**
 * Dossier unique pour toutes les pièces jointes (messages, documents, etc.).
 * En prod Render : définir STORAGE_PATH sur un disque persistant (voir render.yaml).
 */
export function getUploadsDir(): string {
  const raw = (process.env.STORAGE_PATH || process.env.UPLOADS_DIR || 'uploads').trim();
  const dir = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
  return dir;
}

/** Normalise attachment_path DB → chemin absolu sur disque. */
export function resolveAttachmentFilePath(attachmentPath: string): string {
  if (!attachmentPath) return attachmentPath;
  if (path.isAbsolute(attachmentPath)) return attachmentPath;

  const clean = String(attachmentPath)
    .trim()
    .replace(/^\/+/, '')
    .replace(/^uploads[/\\]/, '');

  const primary = path.join(getUploadsDir(), clean);
  if (fs.existsSync(primary)) return primary;

  // Ancien build : fichiers dans dist/uploads
  const legacyDist = path.resolve(process.cwd(), 'dist', 'uploads', clean);
  if (fs.existsSync(legacyDist)) return legacyDist;

  const legacyCwd = path.resolve(process.cwd(), 'uploads', clean);
  return legacyCwd;
}

/** Copie dist/uploads → dossier canonique au démarrage (récupère anciennes PJ). */
export function migrateLegacyUploadsToCanonical(): number {
  const targetDir = getUploadsDir();
  const sources = [
    path.resolve(process.cwd(), 'dist', 'uploads'),
    path.resolve(process.cwd(), 'uploads'),
  ];
  let copied = 0;
  for (const src of sources) {
    if (!src || path.resolve(src) === path.resolve(targetDir)) continue;
    if (!fs.existsSync(src)) continue;
    try {
      const names = fs.readdirSync(src);
      for (const name of names) {
        if (!name || name === '.' || name === '..') continue;
        const from = path.join(src, name);
        const to = path.join(targetDir, name);
        if (!fs.statSync(from).isFile()) continue;
        if (fs.existsSync(to)) continue;
        fs.copyFileSync(from, to);
        copied += 1;
      }
    } catch (e) {
      console.warn('[uploads] migration legacy ignorée pour', src, e);
    }
  }
  if (copied > 0) {
    console.log(`[uploads] ${copied} fichier(s) migré(s) vers ${targetDir}`);
  }
  return copied;
}
