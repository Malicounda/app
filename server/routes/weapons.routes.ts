import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';

const router = Router();

// GET /api/weapons/types?active=true|false (default: true)
router.get('/types', async (req: Request, res: Response) => {
  try {
    const activeParam = (req.query.active as string | undefined);
    const onlyActive = activeParam === undefined ? true : activeParam === 'true';

    const query = onlyActive
      ? sql`SELECT id, code, label, is_active AS "isActive" FROM weapon_types WHERE is_active = true ORDER BY label ASC`
      : sql`SELECT id, code, label, is_active AS "isActive" FROM weapon_types ORDER BY label ASC`;

    const rows = await db.execute(query);
    return res.json(rows);
  } catch (error: any) {
    console.error('Error fetching weapon types:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des types d\'armes' });
  }
});

// POST /api/weapons/types
router.post('/types', async (req: Request, res: Response) => {
  try {
    const { code, label } = req.body || {};
    if (!label) return res.status(400).json({ message: 'label requis' });
    const c = code && String(code).trim() !== '' ? String(code) : String(label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const q = sql`INSERT INTO weapon_types (code, label) VALUES (${c}, ${label}) RETURNING *`;
    const rows: any = await db.execute(q);
    const created = Array.isArray(rows) ? rows[0] : (rows?.rows?.[0] ?? rows?.[0] ?? rows);
    return res.status(201).json(created);
  } catch (error: any) {
    console.error('Error creating weapon type:', error);
    return res.status(500).json({ message: 'Erreur lors de la création du type d\'arme' });
  }
});

// PUT /api/weapons/types/:id
router.put('/types/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { code, label, isActive } = req.body || {};
    
    const q = sql`UPDATE weapon_types 
      SET code = COALESCE(${code}, code), 
          label = COALESCE(${label}, label),
          is_active = COALESCE(${isActive}, is_active)
      WHERE id = ${id} 
      RETURNING *`;
    const rows: any = await db.execute(q);
    const updated = Array.isArray(rows) ? rows[0] : (rows?.rows?.[0] ?? rows?.[0]);
    if (!updated) return res.status(404).json({ message: 'Type non trouvé' });
    return res.json(updated);
  } catch (error: any) {
    console.error('Error updating weapon type:', error);
    return res.status(500).json({ message: 'Erreur lors de la mise à jour du type d\'arme' });
  }
});

// DELETE /api/weapons/types/:id (soft delete)
router.delete('/types/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    let ok = false;
    try {
      const r1: any = await db.execute(sql`UPDATE weapon_types SET is_active = false WHERE id = ${id} RETURNING id`);
      ok = Array.isArray(r1) ? r1.length > 0 : !!(r1?.length || r1?.rows?.length);
    } catch (_) {
      try {
        const r2: any = await db.execute(sql`UPDATE weapon_types SET isActive = false WHERE id = ${id} RETURNING id`);
        ok = Array.isArray(r2) ? r2.length > 0 : !!(r2?.length || r2?.rows?.length);
      } catch (_) {
        // dernier recours: hard delete
        const r3: any = await db.execute(sql`DELETE FROM weapon_types WHERE id = ${id}`);
        ok = true;
      }
    }
    if (!ok) return res.status(404).json({ message: 'Type non trouvé' });
    return res.json({ ok: true });
  } catch (error: any) {
    console.error('Error deleting weapon type:', error);
    return res.status(500).json({ message: 'Erreur lors de la suppression du type d\'arme' });
  }
});

// GET /api/weapons/brands?typeId=<uuid>&active=true|false (default: true)
router.get('/brands', async (req: Request, res: Response) => {
  try {
    const { typeId } = req.query as { typeId?: string };
    const activeParam = (req.query.active as string | undefined);
    const onlyActive = activeParam === undefined ? true : activeParam === 'true';

    if (!typeId) {
      return res.status(400).json({ message: 'Paramètre manquant: typeId' });
    }

    const query = onlyActive
      ? sql`SELECT id, code, label, is_active AS "isActive", weapon_type_id AS "weaponTypeId" FROM weapon_brands WHERE weapon_type_id = ${typeId} AND is_active = true ORDER BY label ASC`
      : sql`SELECT id, code, label, is_active AS "isActive", weapon_type_id AS "weaponTypeId" FROM weapon_brands WHERE weapon_type_id = ${typeId} ORDER BY label ASC`;

    const rows = await db.execute(query);
    return res.json(rows);
  } catch (error: any) {
    console.error('Error fetching weapon brands:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des marques d\'armes' });
  }
});

// POST /api/weapons/brands
router.post('/brands', async (req: Request, res: Response) => {
  try {
    const { weaponTypeId, code, label } = req.body || {};
    if (!weaponTypeId) return res.status(400).json({ message: 'weaponTypeId requis' });
    if (!label) return res.status(400).json({ message: 'label requis' });
    const c = code && String(code).trim() !== '' ? String(code) : String(label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const q = sql`INSERT INTO weapon_brands (weapon_type_id, code, label) VALUES (${weaponTypeId}, ${c}, ${label}) RETURNING *`;
    const rows: any = await db.execute(q);
    const created = Array.isArray(rows) ? rows[0] : (rows?.rows?.[0] ?? rows?.[0] ?? rows);
    return res.status(201).json(created);
  } catch (error: any) {
    console.error('Error creating weapon brand:', error);
    return res.status(500).json({ message: 'Erreur lors de la création de la marque d\'arme' });
  }
});

// PUT /api/weapons/brands/:id
router.put('/brands/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { code, label, isActive, weaponTypeId } = req.body || {};
    
    const q = sql`UPDATE weapon_brands 
      SET code = COALESCE(${code}, code), 
          label = COALESCE(${label}, label),
          weapon_type_id = COALESCE(${weaponTypeId}, weapon_type_id),
          is_active = COALESCE(${isActive}, is_active)
      WHERE id = ${id} 
      RETURNING *`;
    const rows: any = await db.execute(q);
    const updated = Array.isArray(rows) ? rows[0] : (rows?.rows?.[0] ?? rows?.[0]);
    if (!updated) return res.status(404).json({ message: 'Marque non trouvée' });
    return res.json(updated);
  } catch (error: any) {
    console.error('Error updating weapon brand:', error);
    return res.status(500).json({ message: 'Erreur lors de la mise à jour de la marque d\'arme' });
  }
});

// DELETE /api/weapons/brands/:id (soft delete)
router.delete('/brands/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    let ok = false;
    try {
      const r1: any = await db.execute(sql`UPDATE weapon_brands SET is_active = false WHERE id = ${id} RETURNING id`);
      ok = Array.isArray(r1) ? r1.length > 0 : !!(r1?.length || r1?.rows?.length);
    } catch (_) {
      try {
        const r2: any = await db.execute(sql`UPDATE weapon_brands SET isActive = false WHERE id = ${id} RETURNING id`);
        ok = Array.isArray(r2) ? r2.length > 0 : !!(r2?.length || r2?.rows?.length);
      } catch (_) {
        await db.execute(sql`DELETE FROM weapon_brands WHERE id = ${id}`);
        ok = true;
      }
    }
    if (!ok) return res.status(404).json({ message: 'Marque non trouvée' });
    return res.json({ ok: true });
  } catch (error: any) {
    console.error('Error deleting weapon brand:', error);
    return res.status(500).json({ message: 'Erreur lors de la suppression de la marque d\'arme' });
  }
});

// GET /api/weapons/calibers?typeId=<uuid>&active=true|false (default: true)
router.get('/calibers', async (req: Request, res: Response) => {
  try {
    const { typeId } = req.query as { typeId?: string };
    const activeParam = (req.query.active as string | undefined);
    const onlyActive = activeParam === undefined ? true : activeParam === 'true';

    if (!typeId) {
      return res.status(400).json({ message: 'Paramètre manquant: typeId' });
    }

    const query = onlyActive
      ? sql`SELECT id, code, label, is_active AS "isActive", weapon_type_id AS "weaponTypeId" FROM weapon_calibers WHERE weapon_type_id = ${typeId} AND is_active = true ORDER BY label ASC`
      : sql`SELECT id, code, label, is_active AS "isActive", weapon_type_id AS "weaponTypeId" FROM weapon_calibers WHERE weapon_type_id = ${typeId} ORDER BY label ASC`;

    const rows = await db.execute(query);
    return res.json(rows);
  } catch (error: any) {
    console.error('Error fetching weapon calibers:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des calibres d\'armes' });
  }
});

// POST /api/weapons/calibers
router.post('/calibers', async (req: Request, res: Response) => {
  try {
    const { weaponTypeId, code, label } = req.body || {};
    if (!weaponTypeId) return res.status(400).json({ message: 'weaponTypeId requis' });
    if (!label) return res.status(400).json({ message: 'label requis' });
    const c = code && String(code).trim() !== '' ? String(code) : String(label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const q = sql`INSERT INTO weapon_calibers (weapon_type_id, code, label) VALUES (${weaponTypeId}, ${c}, ${label}) RETURNING *`;
    const rows: any = await db.execute(q);
    const created = Array.isArray(rows) ? rows[0] : (rows?.rows?.[0] ?? rows?.[0] ?? rows);
    return res.status(201).json(created);
  } catch (error: any) {
    console.error('Error creating weapon caliber:', error);
    return res.status(500).json({ message: 'Erreur lors de la création du calibre d\'arme' });
  }
});

// PUT /api/weapons/calibers/:id
router.put('/calibers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { code, label, isActive, weaponTypeId } = req.body || {};
    
    const q = sql`UPDATE weapon_calibers 
      SET code = COALESCE(${code}, code), 
          label = COALESCE(${label}, label),
          weapon_type_id = COALESCE(${weaponTypeId}, weapon_type_id),
          is_active = COALESCE(${isActive}, is_active)
      WHERE id = ${id} 
      RETURNING *`;
    const rows: any = await db.execute(q);
    const updated = Array.isArray(rows) ? rows[0] : (rows?.rows?.[0] ?? rows?.[0]);
    if (!updated) return res.status(404).json({ message: 'Calibre non trouvé' });
    return res.json(updated);
  } catch (error: any) {
    console.error('Error updating weapon caliber:', error);
    return res.status(500).json({ message: 'Erreur lors de la mise à jour du calibre d\'arme' });
  }
});

// DELETE /api/weapons/calibers/:id (soft delete)
router.delete('/calibers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    let ok = false;
    try {
      const r1: any = await db.execute(sql`UPDATE weapon_calibers SET is_active = false WHERE id = ${id} RETURNING id`);
      ok = Array.isArray(r1) ? r1.length > 0 : !!(r1?.length || r1?.rows?.length);
    } catch (_) {
      try {
        const r2: any = await db.execute(sql`UPDATE weapon_calibers SET isActive = false WHERE id = ${id} RETURNING id`);
        ok = Array.isArray(r2) ? r2.length > 0 : !!(r2?.length || r2?.rows?.length);
      } catch (_) {
        await db.execute(sql`DELETE FROM weapon_calibers WHERE id = ${id}`);
        ok = true;
      }
    }
    if (!ok) return res.status(404).json({ message: 'Calibre non trouvé' });
    return res.json({ ok: true });
  } catch (error: any) {
    console.error('Error deleting weapon caliber:', error);
    return res.status(500).json({ message: 'Erreur lors de la suppression du calibre d\'arme' });
  }
});

export default router;

