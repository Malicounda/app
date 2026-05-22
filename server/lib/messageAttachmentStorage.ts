import fs from 'fs';
import path from 'path';
import { getUploadsDir, resolveAttachmentFilePath } from './uploadsPath.js';

const BUCKET = 'message-attachments';

type SupabaseConfig = { url: string; key: string };

function deriveSupabaseUrl(): string | null {
  const raw = (process.env.SUPABASE_URL || '').trim();
  if (raw) return raw.replace(/\/+$/, '');
  const db = process.env.DATABASE_URL || '';
  const m = db.match(/postgres\.([^:@/]+)/);
  return m ? `https://${m[1]}.supabase.co` : null;
}

function getSupabaseConfig(): SupabaseConfig | null {
  const url = deriveSupabaseUrl();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  return { url, key };
}

export function guessMimeFromFilename(filename: string, fallback?: string): string {
  if (fallback && fallback !== 'application/octet-stream') return fallback;
  const ext = path.extname(filename).replace(/^\./, '').toLowerCase();
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    pdf: 'application/pdf',
  };
  return map[ext] || fallback || 'application/octet-stream';
}

export function buildSafeAttachmentKey(originalName: string): string {
  const decoded = Buffer.from(originalName, 'latin1').toString('utf8');
  const ext = path.extname(decoded);
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
}

export function logAttachmentStorageStatus(): void {
  const dir = getUploadsDir();
  const supabase = getSupabaseConfig();
  console.log(
    `[attachments] stockage local: ${dir}` +
      (supabase ? ` | Supabase Storage: ${supabase.url}/storage/v1/object/${BUCKET}` : ' | Supabase Storage: désactivé (SUPABASE_SERVICE_ROLE_KEY manquant)')
  );
}

async function ensureSupabaseBucket(cfg: SupabaseConfig): Promise<void> {
  try {
    const res = await fetch(`${cfg.url}/storage/v1/bucket`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
    });
    if (res.ok || res.status === 409) return;
    const text = await res.text().catch(() => '');
    console.warn('[attachments] création bucket Supabase:', res.status, text.slice(0, 200));
  } catch (e) {
    console.warn('[attachments] ensureSupabaseBucket:', e);
  }
}

async function uploadToSupabase(cfg: SupabaseConfig, storageKey: string, buffer: Buffer, mime: string): Promise<void> {
  await ensureSupabaseBucket(cfg);
  const url = `${cfg.url}/storage/v1/object/${BUCKET}/${storageKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': mime,
      'x-upsert': 'true',
    },
    body: buffer,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase upload ${res.status}: ${text.slice(0, 300)}`);
  }
}

async function downloadFromSupabase(cfg: SupabaseConfig, storageKey: string): Promise<Buffer | null> {
  const url = `${cfg.url}/storage/v1/object/${BUCKET}/${storageKey}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${cfg.key}` },
  });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

export type PersistedAttachment = {
  key: string;
  name: string;
  mime: string;
  size: number;
};

/** Enregistre une PJ sur disque (+ Supabase si configuré). */
export async function persistMessageAttachment(opts: {
  buffer: Buffer;
  originalName: string;
  mimeType?: string;
}): Promise<PersistedAttachment> {
  const name = Buffer.from(opts.originalName, 'latin1').toString('utf8');
  const mime = guessMimeFromFilename(name, opts.mimeType);
  const key = buildSafeAttachmentKey(name);
  const uploadsDir = getUploadsDir();
  const localPath = path.join(uploadsDir, key);
  fs.writeFileSync(localPath, opts.buffer);

  const supabase = getSupabaseConfig();
  if (supabase) {
    try {
      await uploadToSupabase(supabase, key, opts.buffer, mime);
    } catch (e) {
      console.error('[attachments] échec upload Supabase (fichier local conservé):', e);
    }
  }

  return { key, name, mime, size: opts.buffer.length };
}

export type AttachmentReadResult = { buffer: Buffer; size: number };

/** Lit une PJ : disque local, puis Supabase ; met en cache local si trouvé dans le cloud. */
export async function readMessageAttachment(storageKey: string): Promise<AttachmentReadResult | null> {
  const localPath = resolveAttachmentFilePath(storageKey);
  if (fs.existsSync(localPath)) {
    const buffer = fs.readFileSync(localPath);
    return { buffer, size: buffer.length };
  }

  const supabase = getSupabaseConfig();
  if (!supabase) return null;

  const buffer = await downloadFromSupabase(supabase, storageKey);
  if (!buffer?.length) return null;

  try {
    const cachePath = path.join(getUploadsDir(), path.basename(storageKey));
    if (!fs.existsSync(cachePath)) {
      fs.writeFileSync(cachePath, buffer);
    }
  } catch (e) {
    console.warn('[attachments] cache local après Supabase:', e);
  }

  return { buffer, size: buffer.length };
}
