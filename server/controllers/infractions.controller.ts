import { Request, Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { pg as pgdb } from '../db.js';
import { resolveAdministrativeAreas } from '../lib/resolveAdminAreas.js';

const storage = multer.memoryStorage();
export const upload = multer({ storage });
// Compatibilité: garder le nom "db" utilisé dans le fichier
const db = pgdb;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRootDir = path.resolve(__dirname, '..', '..');
const uploadsRootDir = path.resolve(projectRootDir, 'uploads');

const resolveStoredPath = (storagePath: string): string => {
  if (!storagePath) return storagePath;
  if (path.isAbsolute(storagePath)) return storagePath;

  const candidateFromProjectRoot = path.resolve(projectRootDir, storagePath);
  if (fs.existsSync(candidateFromProjectRoot)) return candidateFromProjectRoot;

  const candidateFromCwd = path.resolve(process.cwd(), storagePath);
  return candidateFromCwd;
};

// =====================================================
// 📋 CODES D'INFRACTIONS
// =====================================================

export const getCodesInfractions = async (req: Request, res: Response) => {
  try {
    const result = await pgdb.query(
      'SELECT * FROM code_infractions ORDER BY code ASC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des codes:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// =====================================================
// 🧩 SAISIE GROUPS (CRUD)
// =====================================================

export const getSaisieGroups = async (_req: Request, res: Response) => {
  try {
    await ensureSaisieTables();
    const r = await db.query(`
      SELECT id, key, label, color, is_active
      FROM saisie_groups
      ORDER BY label ASC
    `);
    res.json(r.rows);
  } catch (e) {
    console.error('getSaisieGroups error:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const createSaisieGroup = async (req: Request, res: Response) => {
  try {
    await ensureSaisieTables();
    const key = String(req.body?.key || '').trim();
    const label = String(req.body?.label || '').trim();
    const color = String(req.body?.color || 'red-light').trim();
    const is_active = req.body?.is_active === false ? false : true;
    if (!key || !label) return res.status(400).json({ error: 'key et label requis' });
    const r = await db.query(
      `INSERT INTO saisie_groups(key, label, color, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING id, key, label, color, is_active`,
      [key, label, color || 'red-light', is_active]
    );
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e?.code === '23505') return res.status(400).json({ error: 'key déjà existant' });
    console.error('createSaisieGroup error:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const updateSaisieGroup = async (req: Request, res: Response) => {
  try {
    await ensureSaisieTables();
    const keyParam = String(req.params?.key || '').trim();
    const label = req.body?.label != null ? String(req.body.label).trim() : null;
    const color = req.body?.color != null ? String(req.body.color).trim() : null;
    const is_active = typeof req.body?.is_active === 'boolean' ? req.body.is_active : null;
    if (!keyParam) return res.status(400).json({ error: 'key requis' });
    const r = await db.query(
      `UPDATE saisie_groups
       SET label = COALESCE($1, label),
           color = COALESCE($2, color),
           is_active = COALESCE($3, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE key = $4
       RETURNING id, key, label, color, is_active`,
      [label, color, is_active, keyParam]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Groupe introuvable' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error('updateSaisieGroup error:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const deleteSaisieGroup = async (req: Request, res: Response) => {
  try {
    await ensureSaisieTables();
    const keyParam = String(req.params?.key || '').trim();
    if (!keyParam) return res.status(400).json({ error: 'key requis' });
    await db.query('UPDATE saisie_items SET group_key = NULL WHERE group_key = $1', [keyParam]);
    const r = await db.query('DELETE FROM saisie_groups WHERE key = $1 RETURNING key', [keyParam]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Groupe introuvable' });
    res.json({ ok: true });
  } catch (e) {
    console.error('deleteSaisieGroup error:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// =====================================================
// 🧾 SAISIE ITEMS (observations) + GROUPES + CONFIG D'UNITÉ/QUANTITÉ
// =====================================================

const ensureSaisieTables = async () => {
  await ensureUnitsTables();
  // Table des groupes
  await db.query(`
    CREATE TABLE IF NOT EXISTS saisie_groups (
      id SERIAL PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      label TEXT NOT NULL,
      color TEXT DEFAULT 'red-light',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // Items
  await db.query(`
    CREATE TABLE IF NOT EXISTS saisie_items (
      id SERIAL PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      label TEXT NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      quantity_enabled BOOLEAN DEFAULT FALSE,
      unit_mode TEXT NOT NULL DEFAULT 'none' CHECK (unit_mode IN ('none','fixed','choices','free')),
      unit_fixed_key TEXT,
      unit_allowed TEXT[],
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // Lien groupe -> items
  await db.query(`
    ALTER TABLE saisie_items
    ADD COLUMN IF NOT EXISTS group_key TEXT NULL REFERENCES saisie_groups(key) ON UPDATE CASCADE ON DELETE SET NULL;
  `);
};

export const getSaisieItems = async (_req: Request, res: Response) => {
  try {
    await ensureSaisieTables();
    const r = await db.query(`
      SELECT id, key, label, is_active, quantity_enabled, unit_mode, unit_fixed_key, unit_allowed, group_key
      FROM saisie_items
      ORDER BY group_key NULLS LAST, label ASC
    `);
    res.json(r.rows);
  } catch (e) {
    console.error('getSaisieItems error:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const createSaisieItem = async (req: Request, res: Response) => {
  try {
    await ensureSaisieTables();
    const key = String(req.body?.key || '').trim();
    const label = String(req.body?.label || '').trim();
    const is_active = req.body?.is_active === false ? false : true;
    const quantity_enabled = !!req.body?.quantity_enabled;
    const unit_modeRaw = String(req.body?.unit_mode || 'none').trim();
    const unit_mode = ['none','fixed','choices','free'].includes(unit_modeRaw) ? unit_modeRaw : 'none';
    const unit_fixed_key = req.body?.unit_fixed_key ? String(req.body.unit_fixed_key).trim() : null;
    const unit_allowed = Array.isArray(req.body?.unit_allowed) ? req.body.unit_allowed.map((s: any) => String(s)) : [];
    const group_key = req.body?.group_key ? String(req.body.group_key).trim() : null;

    if (!key || !label) return res.status(400).json({ error: 'key et label requis' });
    if (unit_mode === 'fixed') {
      if (!unit_fixed_key) return res.status(400).json({ error: 'unit_fixed_key requis pour mode fixed' });
      const chk = await db.query('SELECT 1 FROM units WHERE key = $1', [unit_fixed_key]);
      if (chk.rows.length === 0) {
        await db.query('INSERT INTO units(key, label) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [unit_fixed_key, unit_fixed_key]);
      }
    } else if (unit_mode === 'choices' && unit_allowed.length > 0) {
      const q = await db.query('SELECT key FROM units WHERE key = ANY($1)', [unit_allowed]);
      const found = new Set(q.rows.map((r: any) => r.key));
      for (const k of unit_allowed) {
        if (!found.has(k)) await db.query('INSERT INTO units(key, label) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING', [k, k]);
      }
    }

    const r = await db.query(
      `INSERT INTO saisie_items(key, label, is_active, quantity_enabled, unit_mode, unit_fixed_key, unit_allowed, group_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, key, label, is_active, quantity_enabled, unit_mode, unit_fixed_key, unit_allowed, group_key`,
      [key, label, is_active, quantity_enabled, unit_mode, unit_mode === 'fixed' ? unit_fixed_key : null, unit_mode === 'choices' ? (unit_allowed.length ? unit_allowed : null) : null, group_key || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e?.code === '23505') return res.status(400).json({ error: 'key déjà existant' });
    console.error('createSaisieItem error:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const updateSaisieItem = async (req: Request, res: Response) => {
  try {
    await ensureSaisieTables();
    const id = Number(req.params?.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalide' });
    const key = String(req.body?.key || '').trim();
    const label = String(req.body?.label || '').trim();
    const is_active = req.body?.is_active === false ? false : true;
    const quantity_enabled = !!req.body?.quantity_enabled;
    const unit_modeRaw = String(req.body?.unit_mode || 'none').trim();
    const unit_mode = ['none','fixed','choices','free'].includes(unit_modeRaw) ? unit_modeRaw : 'none';
    const unit_fixed_key = req.body?.unit_fixed_key ? String(req.body.unit_fixed_key).trim() : null;
    const unit_allowed = Array.isArray(req.body?.unit_allowed) ? req.body.unit_allowed.map((s: any) => String(s)) : [];
    const group_key = req.body?.group_key ? String(req.body.group_key).trim() : null;

    if (!key || !label) return res.status(400).json({ error: 'key et label requis' });
    if (unit_mode === 'fixed') {
      if (!unit_fixed_key) return res.status(400).json({ error: 'unit_fixed_key requis pour mode fixed' });
      const chk = await db.query('SELECT 1 FROM units WHERE key = $1', [unit_fixed_key]);
      if (chk.rows.length === 0) {
        await db.query('INSERT INTO units(key, label) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [unit_fixed_key, unit_fixed_key]);
      }
    } else if (unit_mode === 'choices' && unit_allowed.length > 0) {
      const q = await db.query('SELECT key FROM units WHERE key = ANY($1)', [unit_allowed]);
      const found = new Set(q.rows.map((r: any) => r.key));
      for (const k of unit_allowed) {
        if (!found.has(k)) await db.query('INSERT INTO units(key, label) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING', [k, k]);
      }
    }

    const r = await db.query(
      `UPDATE saisie_items
       SET key = $1, label = $2, is_active = $3, quantity_enabled = $4,
           unit_mode = $5, unit_fixed_key = $6, unit_allowed = $7, group_key = $8, updated_at = CURRENT_TIMESTAMP
       WHERE id = $9
       RETURNING id, key, label, is_active, quantity_enabled, unit_mode, unit_fixed_key, unit_allowed, group_key`,
      [key, label, is_active, quantity_enabled, unit_mode, unit_mode === 'fixed' ? unit_fixed_key : null, unit_mode === 'choices' ? (unit_allowed.length ? unit_allowed : null) : null, group_key || null, id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Item introuvable' });
    res.json(r.rows[0]);
  } catch (e: any) {
    if (e?.code === '23505') return res.status(400).json({ error: 'key déjà existant' });
    console.error('updateSaisieItem error:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const deleteSaisieItem = async (req: Request, res: Response) => {
  try {
    await ensureSaisieTables();
    const id = Number(req.params?.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalide' });
    const r = await db.query('DELETE FROM saisie_items WHERE id = $1 RETURNING id', [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Item introuvable' });
    res.json({ ok: true });
  } catch (e) {
    console.error('deleteSaisieItem error:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// =====================================================
// 🔧 UNITÉS (CRUD) + CONFIGURATION D'UNITÉS PAR ITEM
// =====================================================

const ensureUnitsTables = async () => {
  // Crée les tables si elles n'existent pas
  await db.query(`
    CREATE TABLE IF NOT EXISTS units (
      id SERIAL PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      label TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS code_item_units_config (
      item_id INTEGER PRIMARY KEY REFERENCES code_infraction_items(id) ON DELETE CASCADE,
      mode TEXT NOT NULL CHECK (mode IN ('choices','fixed')),
      allowed TEXT[],
      fixed TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
};

export const getUnits = async (_req: Request, res: Response) => {
  try {
    await ensureUnitsTables();
    const r = await db.query('SELECT id, key, label FROM units ORDER BY label ASC');
    res.json(r.rows);
  } catch (e) {
    console.error('getUnits error:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const createUnit = async (req: Request, res: Response) => {
  try {
    await ensureUnitsTables();
    const key = String(req.body?.key || '').trim();
    const label = String(req.body?.label || '').trim();
    if (!key || !label) return res.status(400).json({ error: 'Clé et libellé requis' });
    const r = await db.query('INSERT INTO units(key, label) VALUES ($1,$2) RETURNING id, key, label', [key, label]);
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e?.code === '23505') return res.status(400).json({ error: 'Clé d\'unité déjà existante' });
    console.error('createUnit error:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const updateUnit = async (req: Request, res: Response) => {
  try {
    await ensureUnitsTables();
    const id = Number(req.params?.id);
    const key = String(req.body?.key || '').trim();
    const label = String(req.body?.label || '').trim();
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalide' });
    if (!key || !label) return res.status(400).json({ error: 'Clé et libellé requis' });
    const r = await db.query(
      `UPDATE units SET key = $1, label = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING id, key, label`,
      [key, label, id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Unité introuvable' });
    res.json(r.rows[0]);
  } catch (e: any) {
    if (e?.code === '23505') return res.status(400).json({ error: 'Clé d\'unité déjà existante' });
    console.error('updateUnit error:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const deleteUnit = async (req: Request, res: Response) => {
  try {
    await ensureUnitsTables();
    const id = Number(req.params?.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID invalide' });
    const r = await db.query('DELETE FROM units WHERE id = $1 RETURNING id', [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Unité introuvable' });
    res.json({ ok: true });
  } catch (e) {
    console.error('deleteUnit error:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const getItemUnitsConfig = async (req: Request, res: Response) => {
  try {
    await ensureUnitsTables();
    const itemId = Number(req.params?.id);
    if (!Number.isFinite(itemId)) return res.status(400).json({ error: 'ID item invalide' });
    const r = await db.query('SELECT mode, allowed, fixed FROM code_item_units_config WHERE item_id = $1', [itemId]);
    if (r.rows.length === 0) return res.json({ mode: 'choices', allowed: [], fixed: '' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error('getItemUnitsConfig error:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const putItemUnitsConfig = async (req: Request, res: Response) => {
  try {
    await ensureUnitsTables();
    const itemId = Number(req.params?.id);
    if (!Number.isFinite(itemId)) return res.status(400).json({ error: 'ID item invalide' });

    const modeRaw = String(req.body?.mode || '').trim();
    const mode = modeRaw === 'fixed' ? 'fixed' : 'choices';
    const allowed = Array.isArray(req.body?.allowed) ? req.body.allowed.map((x: any) => String(x)) : [];
    const fixed = req.body?.fixed ? String(req.body.fixed) : '';

    // Valider que les unités existent
    if (mode === 'fixed') {
      if (!fixed) return res.status(400).json({ error: 'Unité fixe requise' });
      const chk = await db.query('SELECT 1 FROM units WHERE key = $1', [fixed]);
      if (chk.rows.length === 0) return res.status(400).json({ error: `Unité inconnue: ${fixed}` });
    } else if (allowed.length > 0) {
      const q = await db.query('SELECT key FROM units WHERE key = ANY($1)', [allowed]);
      const found = new Set(q.rows.map((r: any) => r.key));
      const missing = allowed.filter((k: string) => !found.has(k));
      if (missing.length > 0) return res.status(400).json({ error: `Unités inconnues: ${missing.join(', ')}` });
    }

    const up = await db.query(
      `INSERT INTO code_item_units_config(item_id, mode, allowed, fixed, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (item_id)
       DO UPDATE SET mode = EXCLUDED.mode, allowed = EXCLUDED.allowed, fixed = EXCLUDED.fixed, updated_at = CURRENT_TIMESTAMP
       RETURNING mode, allowed, fixed`,
      [itemId, mode, mode === 'fixed' ? null : (allowed.length ? allowed : null), mode === 'fixed' ? fixed : null]
    );
    res.json(up.rows[0]);
  } catch (e) {
    console.error('putItemUnitsConfig error:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// =====================================================
// 📦 IMPORT EN LOT: codes + items
// payload: [{ code, nature, article, par_defaut }]
// =====================================================
const normalizeStr = (s: string) => (s || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

export const importCodesAndItems = async (req: Request, res: Response) => {
  try {
    const rows = Array.isArray(req.body) ? req.body : (Array.isArray(req.body?.rows) ? req.body.rows : []);
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'Aucune donnée à importer' });

    const report = { codes_crees: 0, codes_existants: 0, items_crees: 0, items_ignores: 0, defaults_appliques: 0 };

    // cache code by normalized label
    const codeCache: Record<string, { id: number; code: string }> = {};

    for (const r of rows) {
      const codeRaw = String(r.code || '').trim();
      const natureRaw = String(r.nature || '').trim();
      const articleRaw = String(r.article || '').trim();
      const isDefault = String(r.par_defaut || '').toLowerCase() === 'true' || r.par_defaut === true;

      if (!codeRaw || !natureRaw || !articleRaw) { report.items_ignores++; continue; }
      const codeKey = normalizeStr(codeRaw);

      // Upsert code (par label normalisé)
      let codeId: number | null = null;
      if (codeCache[codeKey]) {
        codeId = codeCache[codeKey].id;
      } else {
        const existing = await db.query('SELECT id, code FROM code_infractions WHERE LOWER(code) = LOWER($1) LIMIT 1', [codeRaw]);
        if (existing.rows.length > 0) {
          codeId = existing.rows[0].id;
          report.codes_existants++;
        } else {
          const created = await db.query('INSERT INTO code_infractions (code) VALUES ($1) RETURNING id, code', [codeRaw]);
          codeId = created.rows[0].id;
          report.codes_crees++;
        }
        codeCache[codeKey] = { id: codeId!, code: codeRaw };
      }

      // Skip if somehow no codeId
      if (!codeId) { report.items_ignores++; continue; }

      // Duplicate check for item within same code
      const dup = await db.query(
        `SELECT id FROM code_infraction_items
         WHERE code_infraction_id = $1
           AND LOWER(nature) = LOWER($2)
           AND LOWER(article_code) = LOWER($3)
         LIMIT 1`,
        [codeId, natureRaw, articleRaw]
      );
      if (dup.rows.length > 0) { report.items_ignores++; continue; }

      // Create item
      const insItem = await db.query(
        `INSERT INTO code_infraction_items (code_infraction_id, nature, article_code, is_default)
         VALUES ($1, $2, $3, FALSE) RETURNING id`,
        [codeId, natureRaw, articleRaw]
      );
      const itemId = insItem.rows[0].id as number;
      report.items_crees++;

      // Set default if requested
      if (isDefault) {
        await db.query(
          `WITH reset AS (
             UPDATE code_infraction_items SET is_default = FALSE WHERE code_infraction_id = $1
           )
           UPDATE code_infraction_items SET is_default = TRUE WHERE id = $2`,
          [codeId, itemId]
        );
        report.defaults_appliques++;
      }
    }

    res.json({ ok: true, report });
  } catch (error) {
    console.error('Erreur import codes/items:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// =====================================================
// 📎 DOCUMENTS DES CODES D'INFRACTIONS
// =====================================================

export const getCodeDocuments = async (req: Request, res: Response) => {
  try {
    const { codeId } = req.params;
    const rows = await db.query(
      `SELECT id, code_infraction_id, filename, mime, size, storage_path, created_at
       FROM code_infraction_documents
       WHERE code_infraction_id = $1
       ORDER BY created_at DESC`,
      [codeId]
    );
    res.json(rows.rows);
  } catch (error) {
    console.error('Erreur list docs code:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const uploadCodeDocuments = async (req: Request, res: Response) => {
  try {
    const { codeId } = req.params;
    // Vérifier que le code existe
    const chk = await db.query('SELECT id FROM code_infractions WHERE id = $1', [codeId]);
    if (chk.rows.length === 0) return res.status(404).json({ error: 'Code introuvable' });

    const files = (req.files as Express.Multer.File[]) || [];
    if (!Array.isArray(files) || files.length === 0) return res.status(400).json({ error: 'Aucun fichier fourni' });

    const dir = path.resolve(uploadsRootDir, 'code-docs', String(codeId));
    fs.mkdirSync(dir, { recursive: true });

    const inserted: any[] = [];
    for (const f of files) {
      // Préserver l'extension du fichier original
      const originalName = f.originalname || 'document';
      const ext = path.extname(originalName);
      const baseName = path.basename(originalName, ext).replace(/[^a-zA-Z0-9._-]/g, '_');
      const safeName = `${Date.now()}-${baseName}${ext}`;
      const fullPath = path.join(dir, safeName);
      fs.writeFileSync(fullPath, f.buffer);
      const relPath = path.relative(projectRootDir, fullPath).replace(/\\/g, '/');
      const ins = await db.query(
        `INSERT INTO code_infraction_documents (code_infraction_id, filename, mime, size, storage_path)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, code_infraction_id, filename, mime, size, storage_path, created_at`,
        [codeId, originalName, f.mimetype || null, f.size || null, relPath]
      );
      inserted.push(ins.rows[0]);
    }
    res.status(201).json(inserted);
  } catch (error) {
    console.error('Erreur upload docs code:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const deleteCodeDocument = async (req: Request, res: Response) => {
  try {
    const { docId } = req.params;
    const row = await db.query('SELECT storage_path FROM code_infraction_documents WHERE id = $1', [docId]);
    if (row.rows.length === 0) return res.status(404).json({ error: 'Document introuvable' });
    const storage_path = row.rows[0].storage_path as string;
    const fullPath = resolveStoredPath(storage_path);
    try {
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch (e) {
      console.warn('Suppression fichier échouée (continuation):', e);
    }
    await db.query('DELETE FROM code_infraction_documents WHERE id = $1', [docId]);
    res.json({ message: 'Document supprimé' });
  } catch (error) {
    console.error('Erreur suppression doc code:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const serveCodeDocument = async (req: Request, res: Response) => {
  try {
    const { docId } = req.params;
    const row = await db.query(
      'SELECT storage_path, filename, mime FROM code_infraction_documents WHERE id = $1',
      [docId]
    );
    if (row.rows.length === 0) {
      return res.status(404).json({ error: 'Document introuvable' });
    }
    const doc = row.rows[0];
    const fullPath = resolveStoredPath(doc.storage_path);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Fichier physique introuvable' });
    }

    // Définir le type MIME si disponible
    if (doc.mime) {
      res.type(doc.mime);
    }

    // Forcer l'affichage inline pour les PDFs et images
    if (doc.mime && (doc.mime.startsWith('image/') || doc.mime === 'application/pdf')) {
      res.setHeader('Content-Disposition', `inline; filename="${doc.filename}"`);
    } else {
      res.setHeader('Content-Disposition', `attachment; filename="${doc.filename}"`);
    }

    res.sendFile(fullPath);
  } catch (error) {
    console.error('Erreur servir doc code:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// =====================================================
// 📋 CODE ITEMS (nature/article par code)
// =====================================================

export const getCodeInfractionItems = async (req: Request, res: Response) => {
  try {
    const rawParamId = req.params?.codeId;
    const rawQueryId = Array.isArray(req.query?.codeId) ? req.query.codeId[0] : req.query?.codeId;
    const rawCodeId = rawParamId ?? (typeof rawQueryId === 'string' ? rawQueryId : undefined);

    let rows;
    if (rawCodeId) {
      const numericId = Number(rawCodeId);
      if (!Number.isFinite(numericId)) {
        return res.status(400).json({ error: 'codeId invalide' });
      }

      const result = await db.query(
        `SELECT items.*, ci.code
         FROM code_infraction_items items
         JOIN code_infractions ci ON ci.id = items.code_infraction_id
         WHERE items.code_infraction_id = $1
         ORDER BY items.is_default DESC, items.updated_at DESC`,
        [numericId]
      );
      rows = result.rows;
    } else {
      const result = await db.query(
        `SELECT items.*, ci.code
         FROM code_infraction_items items
         JOIN code_infractions ci ON ci.id = items.code_infraction_id
         ORDER BY ci.code ASC, items.is_default DESC, items.updated_at DESC`
      );
      rows = result.rows;
    }
    res.json(rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des items de code:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const createCodeInfractionItem = async (req: Request, res: Response) => {
  try {
    const { codeId } = req.params;
    const { nature, article_code, is_default } = req.body;

    const safeCodeId = parseInt(codeId);
    if (!Number.isFinite(safeCodeId)) return res.status(400).json({ error: 'codeId invalide' });

    // Si is_default demandé, on laisse la contrainte unique gérer le cas concurrent
    const result = await db.query(
      `INSERT INTO code_infraction_items (code_infraction_id, nature, article_code, is_default)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [safeCodeId, nature || '', article_code || '', !!is_default]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Erreur création code item:', error);
    if (error.code === '23505') {
      res.status(400).json({ error: 'Doublon nature/article pour ce code' });
    } else {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
};

export const updateCodeInfractionItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { nature, article_code, is_default } = req.body;

    const result = await db.query(
      `UPDATE code_infraction_items
       SET nature = $1, article_code = $2, is_default = COALESCE($3, is_default), updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 RETURNING *`,
      [nature, article_code, typeof is_default === 'boolean' ? is_default : null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Item non trouvé' });
    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Erreur mise à jour code item:', error);
    if (error.code === '23505') {
      res.status(400).json({ error: 'Conflit d\'unicité (nature/article)' });
    } else {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
};

export const deleteCodeInfractionItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'DELETE FROM code_infraction_items WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Item non trouvé' });
    res.json({ message: 'Item supprimé' });
  } catch (error) {
    console.error('Erreur suppression code item:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const setDefaultCodeInfractionItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `WITH target AS (
         SELECT code_infraction_id FROM code_infraction_items WHERE id = $1
       ), reset AS (
         UPDATE code_infraction_items
         SET is_default = FALSE
         WHERE code_infraction_id = (SELECT code_infraction_id FROM target)
       )
       UPDATE code_infraction_items
       SET is_default = TRUE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Item non trouvé' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur set default code item:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const createCodeInfraction = async (req: Request, res: Response) => {
  try {
    const { code } = req.body;

    if (!code || String(code).trim() === '') {
      return res.status(400).json({ error: 'Le code est requis' });
    }

    const result = await db.query(
      `INSERT INTO code_infractions (code)
       VALUES ($1) RETURNING *`,
      [code]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Erreur lors de la création du code:', error);
    if (error.code === '23505') {
      res.status(400).json({ error: 'Ce code existe déjà' });
    } else {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
};

export const updateCodeInfraction = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { code } = req.body;

    const result = await db.query(
      `UPDATE code_infractions
       SET code = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING *`,
      [code, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Code d\'infraction non trouvé' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Erreur lors de la mise à jour du code:', error);
    if (error.code === '23505') {
      res.status(400).json({ error: 'Ce code existe déjà' });
    } else {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
};

export const deleteCodeInfraction = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'DELETE FROM code_infractions WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Code non trouvé' });
    }

    res.json({ message: 'Code supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// =====================================================
// 👮 AGENTS VERBALISATEURS
// =====================================================

export const getAgentsVerbalisateurs = async (req: Request, res: Response) => {
  try {
    const user: any = (req as any)?.user || {};
    const userId: number | null = user?.id ?? null;
    const role: string | undefined = user?.role;
    const region: string | undefined = user?.region;

    const normalizedRole = typeof role === 'string' ? role.trim().toLowerCase() : '';
    const isSector = normalizedRole.includes('sub') || normalizedRole.includes('sector') || normalizedRole.includes('secteur');
    const isRegional = normalizedRole.includes('regional') || normalizedRole.includes('régional') || normalizedRole === 'agent';

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (isSector) {
      whereClauses.push(`av.created_by = $${params.length + 1}`);
      params.push(userId);
    } else if (isRegional) {
      const createdParamIdx = params.length + 1;
      const regionParamIdx = params.length + 2;
      const deptParamIdx = params.length + 3;
      whereClauses.push(`(
        av.created_by = $${createdParamIdx}
        OR av.created_by IN (
          SELECT u.id FROM users u
          WHERE LOWER(COALESCE(u.region, '')) = LOWER($${regionParamIdx})
             OR LOWER(COALESCE(u.departement, '')) = LOWER($${deptParamIdx})
        )
        OR av.id IN (
          SELECT DISTINCT i.agent_id
          FROM infractions i
          LEFT JOIN lieux l ON l.id = i.lieu_id
          WHERE LOWER(COALESCE(l.region, '')) = LOWER($${regionParamIdx})
             OR LOWER(COALESCE(l.departement, '')) = LOWER($${deptParamIdx})
        )
      )`);
      const userDept: string = typeof (user as any)?.departement === 'string' ? (user as any).departement : '';
      params.push(userId, region || null, userDept || null);
    }

    const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    console.log('[GET /infractions/agents] userId=%s role=%s region=%s where=%s params=%j', userId, role, region, whereClauses.join(' AND '), params);
    const result = await db.query(
      `SELECT
         av.*,
         creator.id AS created_by_user_id,
         creator.first_name AS created_by_prenom,
         creator.last_name AS created_by_nom,
         creator.role AS created_by_role,
         creator.region AS created_by_region,
         creator.departement AS created_by_departement
       FROM agents_verbalisateurs av
       LEFT JOIN users creator ON creator.id = av.created_by
       ${whereSQL}
       ORDER BY av.nom, av.prenom ASC`,
      params
    );
    console.log('[GET /infractions/agents] rows=%d', result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des agents:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const createAgentVerbalisateur = async (req: Request, res: Response) => {
  try {
    const { nom, prenom, matricule } = req.body;
    const user: any = (req as any)?.user || {};
    const createdBy: number | null = user?.id ?? null;

    // Convert undefined values to null for PostgreSQL compatibility
    const safeNom = nom || null;
    const safePrenom = prenom || null;
    const safeMatricule = matricule || null;

    const result = await db.query(
      `INSERT INTO agents_verbalisateurs (nom, prenom, matricule, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [safeNom, safePrenom, safeMatricule, createdBy]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Erreur lors de la création de l\'agent:', error);
    if (error.code === '23505') {
      res.status(400).json({ error: 'Ce matricule existe déjà' });
    } else {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
};

export const updateAgentVerbalisateur = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { nom, prenom, matricule } = req.body;

    const result = await pgdb.query(
      `UPDATE agents_verbalisateurs
       SET nom = $1, prenom = $2, matricule = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 RETURNING *`,
      [nom, prenom, matricule, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent non trouvé' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur lors de la mise à jour:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const deleteAgentVerbalisateur = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user: any = (req as any)?.user || {};
    const role: string = String(user?.role || '').trim().toLowerCase();
    const userId: number | null = user?.id ?? null;
    const region: string = String(user?.region || '').trim();

    const isSector = role.includes('sub') || role.includes('sector') || role.includes('secteur');
    const isRegional = role.includes('regional') || role.includes('régional') || role === 'agent';

    // Construire la condition d'autorisation selon le rôle
    const whereClauses: string[] = ['av.id = $1'];
    const params: any[] = [id];

    if (role === 'admin') {
      // Pas de contrainte supplémentaire
    } else if (isSector) {
      // Agent secteur: ne peut supprimer que ses propres créations
      whereClauses.push(`av.created_by = $${params.length + 1}`);
      params.push(userId);
    } else if (isRegional) {
      // Agent régional: peut supprimer ses propres agents ou ceux créés par des utilisateurs de sa région
      whereClauses.push(`(
        av.created_by = $${params.length + 1}
        OR av.created_by IN (
          SELECT u.id FROM users u WHERE LOWER(COALESCE(u.region, '')) = LOWER($${params.length + 2})
        )
      )`);
      params.push(userId, region || null);
    } else {
      // Autres rôles: non autorisés
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const sql = `
      DELETE FROM agents_verbalisateurs av
      WHERE ${whereClauses.join(' AND ')}
      RETURNING *
    `;

    const result = await db.query(sql, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent non trouvé ou non autorisé' });
    }

    res.json({ message: 'Agent supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// =====================================================
// 👤 CONTREVENANTS
// =====================================================

export const getContrevenants = async (req: Request, res: Response) => {
  try {
    const user: any = (req as any)?.user || {};
    const userId: number | null = user?.id ?? null;
    const role: string | undefined = user?.role;
    const region: string | undefined = user?.region;

    const normalizedRole = typeof role === 'string' ? role.trim().toLowerCase() : '';
    const isSector = normalizedRole.includes('sub') || normalizedRole.includes('sector') || normalizedRole.includes('secteur');
    const isRegional = normalizedRole.includes('regional') || normalizedRole.includes('régional') || normalizedRole === 'agent';

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (isSector) {
      // Agent secteur: voit ses propres créations, qu'elles soient stockées avec users.id ou agents_verbalisateurs.id
      whereClauses.push(`(
        c.created_by = $${params.length + 1}
        OR c.created_by IN (
          SELECT av.id FROM agents_verbalisateurs av WHERE av.created_by = $${params.length + 1}
        )
      )`);
      params.push(userId);
    } else if (isRegional) {
      // Agent régional:
      // - ses propres créations (users.id)
      // - créations d'utilisateurs de sa région/département (users.id)
      // - créations enregistrées sous un agent_verbalisateur dont le créateur (users.id) est de sa région/département
      // - créateur nul
      const regionParamIdx = params.length + 2;
      const deptParamIdx = params.length + 3;
      whereClauses.push(`(
        c.created_by = $${params.length + 1}
        OR c.created_by IN (
          SELECT u.id FROM users u
          WHERE LOWER(COALESCE(u.region, '')) = LOWER($${regionParamIdx})
             OR LOWER(COALESCE(u.departement, '')) = LOWER($${deptParamIdx})
        )
        OR EXISTS (
          SELECT 1
          FROM agents_verbalisateurs av
          JOIN users u2 ON u2.id = av.created_by
          WHERE av.id = c.created_by
            AND (
              LOWER(COALESCE(u2.region, '')) = LOWER($${regionParamIdx})
              OR LOWER(COALESCE(u2.departement, '')) = LOWER($${deptParamIdx})
            )
        )
        OR c.created_by IS NULL
      )`);
      const userDept: string = typeof (user as any)?.departement === 'string' ? (user as any).departement : '';
      params.push(userId, region || null, userDept || null);
    }

    const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    console.log('[GET /infractions/contrevenants] userId=%s role=%s region=%s where=%s params=%j', userId, role, region, whereClauses.join(' AND '), params);
    const result = await db.query(
      `SELECT
         c.*,
         COALESCE(stats.global_total, 0) AS total_infractions_global,
         COALESCE(creator_direct.id, creator_agent.id) AS created_by_user_id,
         COALESCE(creator_direct.first_name, creator_agent.first_name) AS created_by_prenom,
         COALESCE(creator_direct.last_name, creator_agent.last_name) AS created_by_nom,
         COALESCE(creator_direct.role, creator_agent.role) AS created_by_role,
         COALESCE(creator_direct.region, creator_agent.region) AS created_by_region,
         COALESCE(creator_direct.departement, creator_agent.departement) AS created_by_departement,
         CASE WHEN c.photo IS NOT NULL THEN c.id::text ELSE NULL END AS photo_token,
         CASE WHEN c.piece_identite IS NOT NULL THEN c.id::text ELSE NULL END AS piece_token
       FROM contrevenants c
       LEFT JOIN (
         SELECT ci.contrevenant_id AS contrevenant_id, COUNT(*)::int AS global_total
         FROM contrevenants_infractions ci
         GROUP BY ci.contrevenant_id
       ) stats ON stats.contrevenant_id = c.id
       LEFT JOIN agents_verbalisateurs av ON av.id = c.created_by
       LEFT JOIN users creator_direct ON creator_direct.id = c.created_by
       LEFT JOIN users creator_agent ON creator_agent.id = av.created_by
       ${whereSQL}
       ORDER BY c.date_creation DESC NULLS LAST, c.nom, c.prenom`,
      params
    );
    console.log('[GET /infractions/contrevenants] rows=%d', result.rows.length);

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const rows = result.rows.map((row: any) => ({
      ...row,
      photo_url: row.photo_token ? `${baseUrl}/api/infractions/contrevenants/${row.id}/photo` : null,
      piece_identite_url: row.piece_token ? `${baseUrl}/api/infractions/contrevenants/${row.id}/piece-identite` : null,
      photo_token: undefined,
      piece_token: undefined
    }));

    res.json(rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des contrevenants:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const checkContrevenantByNumero = async (req: Request, res: Response) => {
  const numeroParam = String((req.query?.numero ?? '') as string).trim();

  if (!numeroParam) {
    return res.status(400).json({ error: 'Le numéro de pièce est requis' });
  }

  const normalizedNumero = numeroParam
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

  try {
    const result = await db.query(
      `SELECT id, nom, prenom, numero_piece, type_piece, date_creation
       FROM contrevenants
       WHERE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(numero_piece, ''), ' ', ''), '-', ''), '.', ''), '/', ''), '_', '')) = $1
          OR LOWER(COALESCE(numero_piece, '')) = $2
       LIMIT 1`,
      [normalizedNumero, numeroParam.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.json({ exists: false, numero_piece: numeroParam });
    }

    const row = result.rows[0];
    return res.json({
      exists: true,
      numero_piece: numeroParam,
      contrevenant: {
        id: row.id,
        nom: row.nom,
        prenom: row.prenom,
        numero_piece: row.numero_piece,
        type_piece: row.type_piece,
        date_creation: row.date_creation
      }
    });
  } catch (error) {
    console.error('Erreur lors de la vérification du contrevenant:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const getContrevenantDetails = async (req: Request, res: Response) => {
  const { id } = req.params;
  const user: any = (req as any)?.user || {};
  const rawRole = String(user?.role || '').toLowerCase();
  const normalize = (value: any) =>
    typeof value === 'string'
      ? value
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim()
          .toLowerCase()
      : '';
  const userRegion = normalize(user?.region);
  const userDepartement = normalize((user as any)?.departement);
  const userType = normalize((user as any)?.type);
  const userId = Number((user as any)?.id);
  const hasUser = Number.isFinite(userId);
  const isAdmin = rawRole.includes('admin');
  const isSector =
    userType === 'secteur' ||
    rawRole.includes('sector') ||
    rawRole.includes('secteur') ||
    rawRole.includes('sub-agent');
  const isRegional =
    userType === 'regional' ||
    rawRole.includes('regional') ||
    rawRole.includes('régional') ||
    rawRole === 'agent';
  const isCreatedByMe = (createdBy: any) => {
    const createdId = Number(createdBy);
    return hasUser && Number.isFinite(createdId) && createdId === userId;
  };

  try {
    const result = await db.query(
      `SELECT
         c.id,
         c.nom,
         c.prenom,
         c.filiation,
         c.numero_piece,
         c.type_piece,
         c.date_creation,
         c.photo,
         c.piece_identite,
         c.donnees_biometriques,
         COALESCE(stats.global_total, 0) AS total_infractions_global
       FROM contrevenants c
       LEFT JOIN (
         SELECT ci.contrevenant_id, COUNT(*)::int AS global_total
         FROM contrevenants_infractions ci
         GROUP BY ci.contrevenant_id
       ) stats ON stats.contrevenant_id = c.id
       WHERE c.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contrevenant non trouvé' });
    }

    const row = result.rows[0];
    const encodeImage = (buffer: Buffer | null, fallbackMime = 'image/jpeg') => {
      if (!buffer) return null;
      return `data:${fallbackMime};base64,${buffer.toString('base64')}`;
    };

    const historyResult = await db.query(
      `SELECT
        i.id,
        i.date_infraction,
        i.montant_chiffre,
        i.numero_quittance,
        i.created_by,
        l.region,
        l.departement,
        l.commune,
        l.arrondissement,
        ci.code AS code_infraction,
        cii.nature AS item_nature,
        cii.article_code AS item_article,
        pv.id AS pv_id,
        pv.numero_pv
      FROM contrevenants_infractions ci_link
      JOIN infractions i ON i.id = ci_link.infraction_id
      LEFT JOIN lieux l ON i.lieu_id = l.id
      LEFT JOIN code_infractions ci ON ci.id = i.code_infraction_id
      LEFT JOIN code_infraction_items cii ON cii.id = i.code_item_id
      LEFT JOIN proces_verbaux pv ON pv.infraction_id = i.id
      WHERE ci_link.contrevenant_id = $1
      ORDER BY i.date_infraction DESC NULLS LAST, i.id DESC`,
      [id]
    );

    const infractionsHistory = (historyResult.rows || [])
      .map((row: any) => ({
        id: row.id,
        date_infraction: row.date_infraction,
        montant_chiffre: row.montant_chiffre,
        numero_quittance: row.numero_quittance,
        region: row.region,
        departement: row.departement,
        commune: row.commune,
        arrondissement: row.arrondissement,
        code: row.code_infraction,
        nature: row.item_nature,
        article_code: row.item_article,
        pv_id: row.pv_id,
        numero_pv: row.numero_pv,
        created_by: row.created_by
      }));

    res.json({
      id: row.id,
      nom: row.nom,
      prenom: row.prenom,
      filiation: row.filiation,
      numero_piece: row.numero_piece,
      type_piece: row.type_piece,
      date_creation: row.date_creation,
      photo_base64: encodeImage(row.photo),
      piece_identite_base64: encodeImage(row.piece_identite),
      donnees_biometriques: row.donnees_biometriques ? true : false,
      infractions_history: infractionsHistory,
      total_infractions_global: row.total_infractions_global ?? 0
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des détails du contrevenant:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const getContrevenantPhoto = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT photo FROM contrevenants WHERE id = $1', [id]);

    if (result.rows.length === 0 || !result.rows[0].photo) {
      return res.status(404).json({ error: 'Photo non trouvée' });
    }

    const { photo } = result.rows[0];
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.send(photo);
  } catch (error) {
    console.error('Erreur lors de la récupération de la photo contrevenant:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const getContrevenantPieceIdentite = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT piece_identite FROM contrevenants WHERE id = $1', [id]);

    if (result.rows.length === 0 || !result.rows[0].piece_identite) {
      return res.status(404).json({ error: "Pièce d'identité non trouvée" });
    }

    const { piece_identite } = result.rows[0];
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.send(piece_identite);
  } catch (error) {
    console.error("Erreur lors de la récupération de la pièce d'identité contrevenant:", error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const createContrevenant = async (req: Request, res: Response) => {
  const { nom, prenom, filiation, numero_piece, type_piece } = req.body;
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  const user: any = (req as any)?.user || {};
  const createdBy: number | null = user?.id ?? null;

  const trimmedNom = typeof nom === 'string' ? nom.trim() : '';
  const trimmedPrenom = typeof prenom === 'string' ? prenom.trim() : '';
  const trimmedFiliation = typeof filiation === 'string' ? filiation.trim() : '';
  const trimmedNumeroPiece = typeof numero_piece === 'string' ? numero_piece.trim() : '';
  const trimmedTypePiece = typeof type_piece === 'string' ? type_piece.trim() : '';

  if (!trimmedNom) {
    return res.status(400).json({ error: 'Le nom est requis' });
  }
  if (!trimmedPrenom) {
    return res.status(400).json({ error: 'Le prénom est requis' });
  }
  if (!trimmedFiliation) {
    return res.status(400).json({ error: 'La filiation est requise' });
  }
  if (!trimmedNumeroPiece) {
    return res.status(400).json({ error: 'Le numéro de pièce est requis' });
  }
  if (!trimmedTypePiece) {
    return res.status(400).json({ error: 'Le type de pièce est requis' });
  }

  const photoFile = files?.photo?.[0];
  const pieceIdentiteFile = files?.piece_identite?.[0];

  if (!photoFile) {
    return res.status(400).json({ error: 'La photo est requise' });
  }
  if (!pieceIdentiteFile) {
    return res.status(400).json({ error: "La pièce d'identité (scan) est requise" });
  }

  const photo = photoFile.buffer;
  const piece_identite = pieceIdentiteFile.buffer;
  const donnees_biometriques = files?.donnees_biometriques?.[0]?.buffer || null;

  try {
    const result = await db.query(
      `INSERT INTO contrevenants
       (nom, prenom, filiation, photo, piece_identite, numero_piece, type_piece, donnees_biometriques, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [trimmedNom, trimmedPrenom, trimmedFiliation, photo, piece_identite, trimmedNumeroPiece, trimmedTypePiece, donnees_biometriques, createdBy]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Erreur lors de la création du contrevenant:', error);
    if (error.code === '23505' && trimmedNumeroPiece) {
      try {
        const conflict = await db.query(
          `SELECT id, nom, prenom, numero_piece, type_piece, date_creation
           FROM contrevenants
           WHERE LOWER(numero_piece) = LOWER($1)
           LIMIT 1`,
          [trimmedNumeroPiece]
        );
        return res.status(409).json({
          error: 'Un contrevenant avec ce numéro de pièce existe déjà',
          conflict: conflict.rows[0] || null
        });
      } catch (lookupError) {
        console.error('Erreur lors de la vérification du doublon contrevenant:', lookupError);
      }
      return res.status(409).json({ error: 'Un contrevenant avec ce numéro de pièce existe déjà' });
    }
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// =====================================================
// 📄 FICHIERS PV ET MÉDIAS INFRACTIONS
// =====================================================

// Détection simple du type MIME par "magic bytes"
function detectMime(buffer: Buffer | null, fallback: string): string {
  if (!buffer) return fallback;
  const sig = buffer.subarray(0, 12);
  const hex = sig.toString('hex');
  // PDF: %PDF-
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return 'application/pdf';
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (hex.startsWith('89504e470d0a1a0a')) return 'image/png';
  // GIF: GIF87a/GIF89a
  if (sig.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  // WEBP: RIFF....WEBP
  if (sig.toString('ascii', 0, 4) === 'RIFF' && sig.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return fallback;
}

export const getPvFile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pgdb.query('SELECT fichier_pv FROM proces_verbaux WHERE id = $1', [id]);

    if (result.rows.length === 0 || !result.rows[0].fichier_pv) {
      return res.status(404).json({ error: 'Fichier PV non trouvé' });
    }

    const { fichier_pv } = result.rows[0];
    const mime = detectMime(fichier_pv, 'application/pdf');
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Disposition', 'inline; filename="proces-verbal"');
    // Autoriser l'affichage en iframe dans le même origine
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
    return res.send(fichier_pv);
  } catch (error) {
    console.error('Erreur lors de la récupération du fichier PV:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const getInfractionPhoto = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pgdb.query('SELECT photo_infraction FROM infractions WHERE id = $1', [id]);

    if (result.rows.length === 0 || !result.rows[0].photo_infraction) {
      return res.status(404).json({ error: 'Photo infraction non trouvée' });
    }

    const { photo_infraction } = result.rows[0];
    const mime = detectMime(photo_infraction, 'image/jpeg');
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.send(photo_infraction);
  } catch (error) {
    console.error('Erreur lors de la récupération de la photo infraction:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const getInfractionQuittance = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pgdb.query('SELECT photo_quittance FROM infractions WHERE id = $1', [id]);

    if (result.rows.length === 0 || !result.rows[0].photo_quittance) {
      return res.status(404).json({ error: 'Photo quittance non trouvée' });
    }

    const { photo_quittance } = result.rows[0];
    const mime = detectMime(photo_quittance, 'image/jpeg');
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.send(photo_quittance);
  } catch (error) {
    console.error('Erreur lors de la récupération de la photo quittance:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const updateContrevenant = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { nom, prenom, filiation, numero_piece, type_piece } = req.body;
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };

  const photoFile = files?.photo?.[0] || null;
  const pieceIdentiteFile = files?.piece_identite?.[0] || null;
  const photo = photoFile?.buffer || null;
  const piece_identite = pieceIdentiteFile?.buffer || null;
  const donnees_biometriques = files?.donnees_biometriques?.[0]?.buffer || null;

  const trimmedNom = typeof nom === 'string' ? nom.trim() : '';
  const trimmedPrenom = typeof prenom === 'string' ? prenom.trim() : '';
  const trimmedFiliation = typeof filiation === 'string' ? filiation.trim() : '';
  const trimmedNumeroPiece = typeof numero_piece === 'string' ? numero_piece.trim() : '';
  const trimmedTypePiece = typeof type_piece === 'string' ? type_piece.trim() : '';

  if (!trimmedNom) {
    return res.status(400).json({ error: 'Le nom est requis' });
  }
  if (!trimmedPrenom) {
    return res.status(400).json({ error: 'Le prénom est requis' });
  }
  if (!trimmedFiliation) {
    return res.status(400).json({ error: 'La filiation est requise' });
  }
  if (!trimmedNumeroPiece) {
    return res.status(400).json({ error: 'Le numéro de pièce est requis' });
  }
  if (!trimmedTypePiece) {
    return res.status(400).json({ error: 'Le type de pièce est requis' });
  }

  try {
    let query = `UPDATE contrevenants
                 SET nom = $1, prenom = $2, filiation = $3, numero_piece = $4, type_piece = $5`;
    const params: any[] = [trimmedNom, trimmedPrenom, trimmedFiliation, trimmedNumeroPiece, trimmedTypePiece];
    let paramIndex = 6;

    if (photo) {
      query += `, photo = $${paramIndex}`;
      params.push(photo);
      paramIndex++;
    }
    if (piece_identite) {
      query += `, piece_identite = $${paramIndex}`;
      params.push(piece_identite);
      paramIndex++;
    }
    if (donnees_biometriques) {
      query += `, donnees_biometriques = $${paramIndex}`;
      params.push(donnees_biometriques);
      paramIndex++;
    }

    query += ` WHERE id = $${paramIndex} RETURNING *`;
    params.push(id);

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contrevenant non trouvé' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Erreur lors de la mise à jour:', error);
    if (error.code === '23505' && trimmedNumeroPiece) {
      const conflict = await db.query(
        `SELECT id, nom, prenom, numero_piece, type_piece, date_creation
         FROM contrevenants
         WHERE LOWER(numero_piece) = LOWER($1)
         LIMIT 1`,
        [trimmedNumeroPiece]
      );
      return res.status(409).json({
        error: 'Un contrevenant avec ce numéro de pièce existe déjà',
        conflict: conflict.rows[0] || null
      });
    }
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const deleteContrevenant = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user: any = (req as any)?.user || {};
    const role: string = String(user?.role || '').trim().toLowerCase();
    const userId: number | null = user?.id ?? null;
    const region: string = String(user?.region || '').trim();
    const departement: string = String((user as any)?.departement || '').trim();

    const dependencyCheck = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM contrevenants_infractions
       WHERE contrevenant_id = $1`,
      [id]
    );

    const linkedCount = dependencyCheck.rows?.[0]?.total ?? 0;
    if (linkedCount > 0) {
      return res.status(409).json({
        error: 'Impossible de supprimer ce contrevenant car il est encore lié à des infractions.'
      });
    }

    const isSector = role.includes('sub') || role.includes('sector') || role.includes('secteur');
    const isRegional = role.includes('regional') || role.includes('régional') || role === 'agent';

    const whereClauses: string[] = ['c.id = $1'];
    const params: any[] = [id];

    if (role === 'admin') {
      // no extra constraints
    } else if (isSector) {
      // Sector agent: can delete only own records
      whereClauses.push(`c.created_by = $${params.length + 1}`);
      params.push(userId);
    } else if (isRegional) {
      // Regional agent: own or created by users in same region/departement
      const regionIdx = params.length + 2; // after userId to be pushed first
      const deptIdx = params.length + 3;
      whereClauses.push(`(
        c.created_by = $${params.length + 1}
        OR c.created_by IN (
          SELECT u.id FROM users u
          WHERE LOWER(COALESCE(u.region, '')) = LOWER($${regionIdx})
             OR LOWER(COALESCE(u.departement, '')) = LOWER($${deptIdx})
        )
      )`);
      params.push(userId, region || null, departement || null);
    } else {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const sql = `
      DELETE FROM contrevenants c
      WHERE ${whereClauses.join(' AND ')}
      RETURNING *
    `;

    const result = await db.query(sql, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contrevenant non trouvé ou non autorisé' });
    }

    res.json({ message: 'Contrevenant supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// =====================================================
// 🚨 INFRACTIONS
// =====================================================

export const getInfractions = async (req: Request, res: Response) => {
  try {
    const user: any = (req as any)?.user || {};
    const userId: number | null = user?.id ?? null;
    const role: string | undefined = user?.role;
    const normalizedRole = typeof role === 'string' ? role.trim().toLowerCase() : '';
    const rawRegion: string = typeof user?.region === 'string' ? user.region.trim() : '';
    const rawDepartement: string = typeof (user as any)?.departement === 'string' ? (user as any).departement.trim() : '';

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (normalizedRole.includes('sub-agent') || normalizedRole.includes('sector') || normalizedRole.includes('secteur')) {
      // Agent secteur: ses propres enregistrements + toutes les infractions de son département (s'il est défini)
      if (rawDepartement) {
        whereClauses.push(`(
          i.created_by = $${params.length + 1}
          OR LOWER(COALESCE(l.departement, '')) = LOWER($${params.length + 2})
        )`);
        params.push(userId, rawDepartement);
      } else {
        whereClauses.push(`i.created_by = $${params.length + 1}`);
        params.push(userId);
      }
    } else if (normalizedRole.includes('regional') || normalizedRole === 'agent') {
      // Agent régional: ses propres enregistrements + toutes les infractions localisées dans sa région/département
      const userDept: string = typeof (user as any)?.departement === 'string' ? (user as any).departement.trim() : '';
      if (rawRegion || userDept) {
        const createdParamIdx = params.length + 1;
        const regionParamIdx = params.length + 2;
        const deptParamIdx = params.length + 3;
        whereClauses.push(`(
          i.created_by = $${createdParamIdx}
          OR LOWER(COALESCE(l.region, '')) = LOWER($${regionParamIdx})
          OR LOWER(COALESCE(l.departement, '')) = LOWER($${deptParamIdx})
          OR i.created_by IN (
            SELECT u.id FROM users u
            WHERE LOWER(COALESCE(u.region, '')) = LOWER($${regionParamIdx})
               OR LOWER(COALESCE(u.departement, '')) = LOWER($${deptParamIdx})
          )
        )`);
        params.push(userId, rawRegion || null, userDept || null);
      } else {
        whereClauses.push(`i.created_by = $${params.length + 1}`);
        params.push(userId);
      }
    } else {
      // admin et autres: pas de filtre
    }

    const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const sql = `
      SELECT i.*,
             ci.code,
             cii.nature AS item_nature,
             cii.article_code AS item_article,
             l.region, l.departement, l.commune,
             av.nom as agent_nom, av.prenom as agent_prenom,
             creator.id AS created_by_user_id,
             creator.first_name AS created_by_prenom,
             creator.last_name AS created_by_nom,
             creator.role AS created_by_role,
             creator.region AS created_by_region,
             creator.departement AS created_by_departement,
             array_agg(json_build_object(
               'id', c.id,
               'nom', c.nom,
               'prenom', c.prenom,
               'numero_piece', c.numero_piece,
               'type_piece', c.type_piece
             ) ORDER BY c.date_creation DESC NULLS LAST) AS contrevenants
      FROM infractions i
      LEFT JOIN code_infractions ci ON i.code_infraction_id = ci.id
      LEFT JOIN code_infraction_items cii ON i.code_item_id = cii.id
      LEFT JOIN lieux l ON i.lieu_id = l.id
      LEFT JOIN agents_verbalisateurs av ON i.agent_id = av.id
      LEFT JOIN users creator ON creator.id = i.created_by
      LEFT JOIN contrevenants_infractions ci2 ON i.id = ci2.infraction_id
      LEFT JOIN contrevenants c ON ci2.contrevenant_id = c.id
      ${whereSQL}
      GROUP BY i.id, ci.code, cii.nature, cii.article_code, l.region, l.departement, l.commune, av.nom, av.prenom,
               creator.id, creator.first_name, creator.last_name, creator.role, creator.region, creator.departement
      ORDER BY i.date_infraction DESC`;

    console.log('[GET /infractions/infractions] userId=%s role=%s departement=%s region=%s where=%s params=%j', userId, role, rawDepartement || null, rawRegion || null, whereClauses.join(' AND '), params);
    const result = await db.query(sql, params);
    console.log('[GET /infractions/infractions] rows=%d', result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des infractions:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const createInfraction = async (req: Request, res: Response) => {
  try {
    console.log('=== CREATE INFRACTION DEBUG ===');
    console.log('req.body:', req.body);
    console.log('req.files:', req.files);
    const user: any = (req as any)?.user || {};
    const createdBy: number | null = user?.id ?? null;

    const {
      code_infraction_id,
      code_item_id,
      date_infraction,
      agent_id,
      montant_chiffre,
      numero_quittance,
      observations,
      region,
      departement,
      commune,
      arrondissement,
      latitude,
      longitude,
      contrevenants
    } = req.body;

    // Validations de base
    if (!code_infraction_id) {
      console.log('createInfraction → 400: code_infraction_id manquant');
      return res.status(400).json({ error: 'Code d\'infraction requis' });
    }
    if (!code_item_id) {
      console.log('createInfraction → 400: code_item_id manquant');
      return res.status(400).json({ error: 'Nature/Article requis' });
    }
    if (!agent_id) {
      console.log('createInfraction → 400: agent_id manquant');
      return res.status(400).json({ error: 'Agent verbalisateur requis' });
    }
    if (!date_infraction) {
      console.log('createInfraction → 400: date_infraction manquante');
      return res.status(400).json({ error: 'Date d\'infraction requise' });
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const photo_quittance = files?.photo_quittance?.[0]?.buffer || null;
    const photo_infraction = files?.photo_infraction?.[0]?.buffer || null;

    // Normaliser et valider l'unicité globale du numéro de quittance
    let normalizedReceipt: string | null = null;
    try {
      const rnRaw = String(req.body?.numero_quittance || '').toUpperCase().trim();
      if (rnRaw) {
        const m = rnRaw.match(/^(\d{7})\/(\d{2})[ .]?([A-Z]{2})$/);
        if (!m) {
          return res.status(400).json({ message: "Numéro de quittance invalide (ex: 1234567/24 JS)" });
        }
        normalizedReceipt = `${m[1]}/${m[2]} ${m[3]}`;
        // Vérifier unicité dans permits
        const dupPermit = await db.query('SELECT 1 FROM permits WHERE receipt_number = $1 LIMIT 1', [normalizedReceipt]);
        if (dupPermit.rows.length > 0) {
          return res.status(409).json({ message: 'Numéro de quittance déjà utilisé (permis).', code: 'RECEIPT_DUPLICATE', source: 'permit' });
        }
        // Vérifier unicité dans taxes (tester plusieurs colonnes possibles si existent)
        try {
          const colCheck = await db.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_schema='public' AND table_name='taxes' AND column_name IN ('receipt_number','receiptNumber','quittance')
          `);
          const names = (colCheck.rows || []).map(r => String(r.column_name));
          for (const cname of names) {
            const r = await db.query(`SELECT 1 FROM taxes WHERE ${cname} = $1 LIMIT 1`, [normalizedReceipt]);
            if (r.rows.length > 0) {
              return res.status(409).json({ message: 'Numéro de quittance déjà utilisé (taxe).', code: 'RECEIPT_DUPLICATE', source: 'tax' });
            }
          }
        } catch {}
        // Vérifier unicité dans infractions
        const dupInf = await db.query('SELECT 1 FROM infractions WHERE numero_quittance = $1 LIMIT 1', [normalizedReceipt]);
        if (dupInf.rows.length > 0) {
          return res.status(409).json({ message: 'Numéro de quittance déjà utilisé (infraction).', code: 'RECEIPT_DUPLICATE', source: 'infraction' });
        }
      }
    } catch (e) {
      console.warn('Normalization/uniqueness check failed (non-blocking log):', e);
    }

    // Convert undefined values to null for PostgreSQL compatibility
    const safeRegion = region || null;
    const safeDepartement = departement || null;
    const safeCommune = commune || null;
    const safeArrondissement = arrondissement || null;
    const safeLatitude = latitude ? parseFloat(latitude) : null;
    const safeLongitude = longitude ? parseFloat(longitude) : null;
    const safeCodeInfractionId = code_infraction_id ? parseInt(code_infraction_id) : null;
    const safeCodeItemId = code_item_id ? parseInt(code_item_id) : null;
    const safeAgentId = agent_id ? parseInt(agent_id) : null;
    const safeMontantChiffre = montant_chiffre ? parseFloat(montant_chiffre) : null;
    const safeNumeroQuittance = normalizedReceipt ?? (numero_quittance || null);
    const safeObservations = observations || null;

    // Règle d'accès: empêcher création hors zone pour agents secteur/région
    {
      const rawRole = String((user as any)?.role || '').toLowerCase();
      const isAdmin = rawRole.includes('admin');
      if (!isAdmin) {
        const userRegion = String((user as any)?.region || '').trim().toLowerCase();
        const userDepartement = String((user as any as any)?.departement || '').trim().toLowerCase();
        const targetRegion = String(safeRegion || '').trim().toLowerCase();
        const targetDepartement = String(safeDepartement || '').trim().toLowerCase();

        const isSector = rawRole === 'sub-agent' || rawRole === 'sector-agent';
        const isRegional = rawRole === 'regional-agent' || rawRole === 'agent-regional';

        if (isSector) {
          if (userDepartement && targetDepartement && userDepartement !== targetDepartement) {
            return res.status(403).json({
              code: 'OUTSIDE_REGION',
              message: "Création refusée hors de votre zone (département).",
              targetRegion: safeRegion,
              targetDepartement: safeDepartement
            });
          }
          // Si département cible absent mais région fournie et différente, bloquer aussi
          if (!targetDepartement && userRegion && targetRegion && userRegion !== targetRegion) {
            return res.status(403).json({
              code: 'OUTSIDE_REGION',
              message: "Création refusée hors de votre zone (région).",
              targetRegion: safeRegion,
              targetDepartement: safeDepartement
            });
          }
        }

        if (isRegional) {
          if (userRegion && targetRegion && userRegion !== targetRegion) {
            return res.status(403).json({
              code: 'OUTSIDE_REGION',
              message: "Création refusée hors de votre zone (région).",
              targetRegion: safeRegion,
              targetDepartement: safeDepartement
            });
          }
        }
      }
    }

    // Récupérer la nature/article de l'item sélectionné si fourni
      let itemNature: string | null = null;
      let itemArticleCode: string | null = null;
      if (safeCodeItemId) {
      const chk = await db.query(
        'SELECT code_infraction_id, nature, article_code FROM code_infraction_items WHERE id = $1',
        [safeCodeItemId]
      );
      if (chk.rows.length === 0) {
        console.log('createInfraction → 400: code_item_id inexistant', { safeCodeItemId });
        return res.status(400).json({ error: "code_item_id invalide" });
      }
      const { code_infraction_id: itemCodeIdRaw, nature: itemNatureRaw, article_code: itemArticleRaw } = chk.rows[0];
      const itemCodeId = Number(itemCodeIdRaw);
      itemNature = itemNatureRaw ?? null;
      itemArticleCode = itemArticleRaw ?? null;
      if (safeCodeInfractionId && itemCodeId !== safeCodeInfractionId) {
        console.log('createInfraction → 400: incohérence item/code', {
          safeCodeItemId,
          itemCodeId,
          safeCodeInfractionId
        });
        return res.status(400).json({ error: "L'item sélectionné n'appartient pas au code choisi" });
      }
    }

    // Créer le lieu
    const lieuResult = await pgdb.query(
      `INSERT INTO lieux (region, departement, commune, arrondissement, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [safeRegion, safeDepartement, safeCommune, safeArrondissement, safeLatitude, safeLongitude]
    );
    const lieu_id = lieuResult.rows[0].id;

    // Créer l'infraction
    const infractionResult = await pgdb.query(
      `INSERT INTO infractions
       (code_infraction_id, code_item_id, lieu_id, date_infraction, agent_id, montant_chiffre,
        numero_quittance, photo_quittance, photo_infraction, observations, nature, article_code, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [safeCodeInfractionId, safeCodeItemId, lieu_id, date_infraction, safeAgentId, safeMontantChiffre,
       safeNumeroQuittance, photo_quittance, photo_infraction, safeObservations, itemNature, itemArticleCode, createdBy]
    );

    const infraction_id = infractionResult.rows[0].id;

    let contrevenantsArr: number[] = [];
    if (Array.isArray(contrevenants)) {
      contrevenantsArr = (contrevenants as any[]).map((v) => Number(v)).filter((n) => Number.isFinite(n));
    } else if (typeof contrevenants === 'string' && contrevenants.trim() !== '') {
      try {
        const parsed = JSON.parse(contrevenants);
        if (Array.isArray(parsed)) {
          contrevenantsArr = parsed.map((v: any) => Number(v)).filter((n: number) => Number.isFinite(n));
        }
      } catch {}
    }
    if (contrevenantsArr.length > 0) {
      for (const contrevenant_id of contrevenantsArr) {
        await pgdb.query(
          `INSERT INTO contrevenants_infractions (contrevenant_id, infraction_id)
           VALUES ($1, $2)`,
          [contrevenant_id, infraction_id]
        );
      }
    }

    console.log('SUCCESS: Infraction créée avec succès');
    res.status(201).json(infractionResult.rows[0]);
  } catch (error: any) {
    console.error('=== ERREUR CREATE INFRACTION ===');
    console.error('Error message:', error?.message);
    console.error('Error code:', error?.code);
    console.error('Error detail:', error?.detail);
    console.error('Full error:', error);

    // Erreurs PostgreSQL spécifiques
    if (error?.code === '23503') {
      return res.status(400).json({ error: 'Référence invalide (code, agent ou contrevenant inexistant)' });
    }
    if (error?.code === '23505') {
      return res.status(400).json({ error: 'Conflit de données (doublon)' });
    }
    if (error?.code === '22P02') {
      return res.status(400).json({ error: 'Format de données invalide' });
    }

    res.status(500).json({ error: error?.message || 'Erreur serveur' });
  }
};

export const updateInfraction = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user: any = (req as any)?.user || {};
    const userId: number | null = user?.id ?? null;
    const role: string = String(user?.role || '').trim().toLowerCase();

    const ownership = await db.query(
      'SELECT created_by FROM infractions WHERE id = $1 LIMIT 1',
      [id]
    );

    if (ownership.rows.length === 0) {
      return res.status(404).json({ error: 'Infraction non trouvée' });
    }

    const creatorIdRaw = ownership.rows[0]?.created_by;
    const creatorId = creatorIdRaw === null || creatorIdRaw === undefined ? null : Number(creatorIdRaw);
    const isAdmin = role.includes('admin');
    const isOwner = Number.isFinite(creatorId) && Number.isFinite(userId) && creatorId === userId;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'Vous ne pouvez modifier que vos propres infractions' });
    }

    const {
      code_infraction_id,
      code_item_id,
      date_infraction,
      agent_id,
      montant_chiffre,
      numero_quittance,
      observations
    } = req.body;

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const photo_quittance = files?.photo_quittance?.[0]?.buffer || null;
    const photo_infraction = files?.photo_infraction?.[0]?.buffer || null;

    const safeCodeInfractionId = code_infraction_id ? parseInt(code_infraction_id) : null;
    const safeCodeItemId = code_item_id ? parseInt(code_item_id) : null;
    const safeAgentId = agent_id ? parseInt(agent_id) : null;
    const safeMontantChiffre = montant_chiffre ? parseFloat(montant_chiffre) : null;
    let safeNumeroQuittance: string | null = numero_quittance || null;
    const safeObservations = observations || null;

    try {
      const rnRaw = String(numero_quittance || '').toUpperCase().trim();
      if (rnRaw) {
        const m = rnRaw.match(/^(\d{7})\/(\d{2})[ .]?([A-Z]{2})$/);
        if (!m) {
          return res.status(400).json({ message: "Numéro de quittance invalide (ex: 1234567/24 JS)" });
        }
        const normalized = `${m[1]}/${m[2]} ${m[3]}`;
        const current = await db.query('SELECT numero_quittance FROM infractions WHERE id = $1', [id]);
        const currentVal = String(current.rows[0]?.numero_quittance || '').toUpperCase();
        if (!currentVal || currentVal !== normalized) {
          const dupPermit = await db.query('SELECT 1 FROM permits WHERE receipt_number = $1 LIMIT 1', [normalized]);
          if (dupPermit.rows.length > 0) {
            return res.status(409).json({ message: 'Numéro de quittance déjà utilisé (permis).', code: 'RECEIPT_DUPLICATE', source: 'permit' });
          }
          try {
            const colCheck = await db.query(`
              SELECT column_name FROM information_schema.columns
              WHERE table_schema='public' AND table_name='taxes' AND column_name IN ('receipt_number','receiptNumber','quittance')
            `);
            const names = (colCheck.rows || []).map(r => String(r.column_name));
            for (const cname of names) {
              const r = await db.query(`SELECT 1 FROM taxes WHERE ${cname} = $1 LIMIT 1`, [normalized]);
              if (r.rows.length > 0) {
                return res.status(409).json({ message: 'Numéro de quittance déjà utilisé (taxe).', code: 'RECEIPT_DUPLICATE', source: 'tax' });
              }
            }
          } catch {}
          const dupInf = await db.query('SELECT 1 FROM infractions WHERE id <> $1 AND numero_quittance = $2 LIMIT 1', [id, normalized]);
          if (dupInf.rows.length > 0) {
            return res.status(409).json({ message: 'Numéro de quittance déjà utilisé (infraction).', code: 'RECEIPT_DUPLICATE', source: 'infraction' });
          }
        }
        safeNumeroQuittance = normalized;
      }
    } catch (e) {
      console.warn('Normalization/uniqueness check (update) failed:', e);
    }

    let itemNature: string | null = null;
    let itemArticleCode: string | null = null;

    if (safeCodeItemId) {
      const chk = await db.query(
        'SELECT code_infraction_id, nature, article_code FROM code_infraction_items WHERE id = $1',
        [safeCodeItemId]
      );
      if (chk.rows.length === 0) {
        return res.status(400).json({ error: "code_item_id invalide" });
      }
      const { code_infraction_id: itemCodeIdRaw, nature: itemNatureRaw, article_code: itemArticleRaw } = chk.rows[0];
      const itemCodeId = Number(itemCodeIdRaw);
      itemNature = itemNatureRaw ?? null;
      itemArticleCode = itemArticleRaw ?? null;
      if (safeCodeInfractionId && itemCodeId !== safeCodeInfractionId) {
        return res.status(400).json({ error: "L'item sélectionné n'appartient pas au code choisi" });
      }
    }

    let query = `UPDATE infractions
                 SET code_infraction_id = $1, code_item_id = $2, date_infraction = $3, agent_id = $4,
                    montant_chiffre = $5, numero_quittance = $6, observations = $7,
                    nature = $8, article_code = $9,
                    updated_at = CURRENT_TIMESTAMP`;
    const params: any[] = [safeCodeInfractionId, safeCodeItemId, date_infraction, safeAgentId,
                           safeMontantChiffre, safeNumeroQuittance, safeObservations,
                           itemNature, itemArticleCode];
    let paramIndex = 10;

    if (photo_quittance) {
      query += `, photo_quittance = $${paramIndex}`;
      params.push(photo_quittance);
      paramIndex++;
    }
    if (photo_infraction) {
      query += `, photo_infraction = $${paramIndex}`;
      params.push(photo_infraction);
      paramIndex++;
    }

    query += ` WHERE id = $${paramIndex} RETURNING *`;
    params.push(id);

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Infraction non trouvée' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur lors de la mise à jour:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const deleteInfraction = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user: any = (req as any)?.user || {};
    const userId: number | null = user?.id ?? null;
    const role: string = String(user?.role || '').trim().toLowerCase();

    const ownership = await db.query(
      'SELECT created_by FROM infractions WHERE id = $1 LIMIT 1',
      [id]
    );

    if (ownership.rows.length === 0) {
      return res.status(404).json({ error: 'Infraction non trouvée' });
    }

    const creatorIdRaw = ownership.rows[0]?.created_by;
    const creatorId = creatorIdRaw === null || creatorIdRaw === undefined ? null : Number(creatorIdRaw);
    const isAdmin = role.includes('admin');
    const isOwner = Number.isFinite(creatorId) && Number.isFinite(userId) && creatorId === userId;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'Vous ne pouvez supprimer que vos propres infractions' });
    }

    const result = await db.query(
      'DELETE FROM infractions WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Infraction non trouvée' });
    }

    res.json({ message: 'Infraction supprimée avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// =====================================================
// 📄 PROCÈS-VERBAUX
// =====================================================

export const getProcesVerbaux = async (req: Request, res: Response) => {
  try {
    const user: any = (req as any)?.user || {};
    const userId: number | null = user?.id ?? null;
    const role: string | undefined = user?.role;
    const region: string | undefined = user?.region;
    const departement: string | undefined = (user as any)?.departement;

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (role === 'sub-agent' || role === 'sector-agent') {
      // PV liés aux infractions du user et dans son département
      whereClauses.push(`i.created_by = $${params.length + 1}`);
      params.push(userId);
      whereClauses.push(`l.departement = $${params.length + 1}`);
      params.push(departement || null);
    } else if (role === 'regional-agent' || role === 'agent-regional') {
      // PV liés aux infractions de sa région (créés par lui ou par des agents de sa région) et dans sa région
      whereClauses.push(`(
        i.created_by = $${params.length + 1}
        OR i.created_by IN (SELECT u.id FROM users u WHERE u.region = $${params.length + 2})
      )`);
      params.push(userId, region || null);
      whereClauses.push(`l.region = $${params.length + 1}`);
      params.push(region || null);
    }

    const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const sql = `
      SELECT pv.*,
             i.date_infraction, i.montant_chiffre,
             ci.code,
             cii.nature AS item_nature,
             cii.article_code AS item_article,
             l.region, l.departement
      FROM proces_verbaux pv
      LEFT JOIN infractions i ON pv.infraction_id = i.id
      LEFT JOIN code_infractions ci ON i.code_infraction_id = ci.id
      LEFT JOIN code_infraction_items cii ON i.code_item_id = cii.id
      LEFT JOIN lieux l ON i.lieu_id = l.id
      ${whereSQL}
      ORDER BY pv.id DESC`;

    console.log('[GET /infractions/pv] userId=%s role=%s region=%s departement=%s where=%s params=%j', userId, role, region, departement, whereClauses.join(' AND '), params);
    const result = await db.query(sql, params);
    console.log('[GET /infractions/pv] rows=%d', result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des PV:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const createProcesVerbal = async (req: Request, res: Response) => {
  try {
    const { infraction_id, numero_pv } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    const fichier_pv = files?.fichier_pv?.[0]?.buffer || null;

    // Convert undefined values to null for PostgreSQL compatibility
    const safeInfractionId = infraction_id ? parseInt(infraction_id) : null;
    const safeNumeroPv = numero_pv || null;

    if (!safeInfractionId) {
      return res.status(400).json({ error: "infraction_id requis" });
    }
    if (!safeNumeroPv) {
      return res.status(400).json({ error: "numero_pv requis" });
    }
    if (!fichier_pv) {
      return res.status(400).json({ error: "fichier_pv requis" });
    }

    // Règle d'accès :
    // - Admin : peut créer un PV pour n'importe quelle infraction
    // - Agent (secteur / régional) : uniquement pour une infraction qu'il a créée
    const currentUser: any = (req as any)?.user || {};
    const userId = Number(currentUser?.id);
    const rawRole = String(currentUser?.role || '').toLowerCase();
    const isAdmin = rawRole.includes('admin');

    // Vérifier que l'infraction existe et récupérer son créateur
    const infResult = await db.query(
      'SELECT id, created_by FROM infractions WHERE id = $1 LIMIT 1',
      [safeInfractionId]
    );
    if (infResult.rows.length === 0) {
      return res.status(404).json({ error: "Infraction introuvable" });
    }

    const inf = infResult.rows[0] as any;
    const createdBy = Number(inf.created_by);

    if (!isAdmin) {
      if (!Number.isFinite(userId) || !Number.isFinite(createdBy) || userId !== createdBy) {
        return res.status(403).json({
          error: "Vous n'êtes pas autorisé à créer un PV pour une infraction que vous n'avez pas enregistrée",
        });
      }
    }

    const result = await db.query(
      `INSERT INTO proces_verbaux (infraction_id, numero_pv, fichier_pv)
       VALUES ($1, $2, $3) RETURNING *`,
      [safeInfractionId, safeNumeroPv, fichier_pv]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Erreur lors de la création du PV:', error);
    if (error.code === '23505') {
      res.status(400).json({ error: 'Ce numéro de PV existe déjà' });
    } else {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
};

export const deleteProcesVerbal = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'DELETE FROM proces_verbaux WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'PV non trouvé' });
    }

    res.json({ message: 'PV supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// =====================================================
// 📊 STATISTIQUES
// =====================================================

export const getStatistiques = async (req: Request, res: Response) => {
  try {
    const stats = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM infractions) as total_infractions,
        (SELECT COUNT(*) FROM contrevenants) as total_contrevenants,
        (SELECT COUNT(*) FROM proces_verbaux) as total_pv,
        (SELECT COALESCE(SUM(montant_chiffre), 0) FROM infractions) as montant_total,
        (SELECT COUNT(*) FROM infractions WHERE date_infraction >= NOW() - INTERVAL '30 days') as infractions_30j
    `);

    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const resolveAreas = async (req: Request, res: Response) => {
  try {
    console.log('[resolveAreas] Requête reçue avec query:', req.query);
    const latRaw = req.query.lat as string;
    const lonRaw = req.query.lon as string;
    const lat = parseFloat(String(latRaw));
    const lon = parseFloat(String(lonRaw));
    console.log('[resolveAreas] Coordonnées parsées:', { lat, lon });

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      console.log('[resolveAreas] Coordonnées invalides');
      return res.status(400).json({ error: 'Coordonnées invalides' });
    }

    console.log('[resolveAreas] Appel resolveAdministrativeAreas...');
    const areas = await resolveAdministrativeAreas(lat, lon);
    console.log('[resolveAreas] Zones résolues:', areas);

    return res.json(areas);
  } catch (error) {
    console.error('Erreur lors de la résolution des zones administratives:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};
