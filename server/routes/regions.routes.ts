import { Router } from 'express';
import {
    getArrondissements,
    getCommunes,
    getDepartements,
    getRegions
} from '../controllers/regions.controller.js';
import { detectDepartementFromPoint, detectRegionFromPoint } from '../controllers/statuses.controller.js';
import { isAuthenticated, isAdmin } from './middlewares/auth.middleware.js';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';


const router = Router();

// Routes pour les régions et départements
// Ces routes pourraient être protégées par authentification si nécessaire
router.get('/regions', isAuthenticated, getRegions);
router.get('/departements', isAuthenticated, getDepartements);
router.get('/communes', isAuthenticated, getCommunes);
router.get('/arrondissements', isAuthenticated, getArrondissements);

// Routes pour détecter la région/département à partir de coordonnées (PostGIS)
router.get('/regions/detect-from-point', isAuthenticated, detectRegionFromPoint);
router.get('/departements/detect-from-point', isAuthenticated, detectDepartementFromPoint);

// ─── DELETE routes pour la suppression d'entités géographiques (admin only) ───

router.delete('/regions/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ ok: false, error: 'ID invalide' });
    await db.execute(sql`DELETE FROM regions WHERE id = ${id}`);
    res.json({ ok: true, message: 'Région supprimée' });
  } catch (error) {
    console.error('[DELETE /regions/:id]', error);
    res.status(500).json({ ok: false, error: 'Erreur lors de la suppression' });
  }
});

router.delete('/departements/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ ok: false, error: 'ID invalide' });
    await db.execute(sql`DELETE FROM departements WHERE id = ${id}`);
    res.json({ ok: true, message: 'Département supprimé' });
  } catch (error) {
    console.error('[DELETE /departements/:id]', error);
    res.status(500).json({ ok: false, error: 'Erreur lors de la suppression' });
  }
});

router.delete('/communes/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ ok: false, error: 'ID invalide' });
    await db.execute(sql`DELETE FROM communes WHERE id = ${id}`);
    res.json({ ok: true, message: 'Commune supprimée' });
  } catch (error) {
    console.error('[DELETE /communes/:id]', error);
    res.status(500).json({ ok: false, error: 'Erreur lors de la suppression' });
  }
});

router.delete('/arrondissements/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ ok: false, error: 'ID invalide' });
    await db.execute(sql`DELETE FROM arrondissements WHERE id = ${id}`);
    res.json({ ok: true, message: 'Arrondissement supprimé' });
  } catch (error) {
    console.error('[DELETE /arrondissements/:id]', error);
    res.status(500).json({ ok: false, error: 'Erreur lors de la suppression' });
  }
});

// ─── Eco-géographie zones : GET + DELETE ───

router.get('/eco-zones', isAuthenticated, async (_req, res) => {
  try {
    const cols = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'eco_geographie_zones'
    `) as unknown as { column_name: string }[];
    const has = (c: string) => cols.some(k => k.column_name === c);

    const geomCol = has('geom') ? 'geom' : (has('geometry') ? 'geometry' : null);
    const nomCol = has('nom') ? 'nom' : (has('name') ? 'name' : null);
    const idCol = has('id') ? 'id' : null;

    if (!idCol) {
      return res.json({ type: 'FeatureCollection', features: [] });
    }

    const selects: string[] = [`"id"`];
    if (nomCol) selects.push(`"${nomCol}" as nom`);
    if (geomCol) selects.push(`ST_AsGeoJSON(ST_Transform(ST_Force2D(${geomCol}), 4326)) as geometry`);

    const query = `SELECT ${selects.join(', ')} FROM eco_geographie_zones`;
    const rows = await db.execute(sql.raw(query)) as any[];
    const items = Array.isArray(rows) ? rows : (rows as any);

    const features = items.map((item: any) => {
      const { geometry, ...properties } = item;
      return {
        type: 'Feature',
        geometry: geometry ? JSON.parse(geometry) : null,
        properties: { ...properties, nom: properties.nom || `ID: ${properties.id}` }
      };
    }).filter((f: any) => !!f.geometry);

    res.json({ type: 'FeatureCollection', features });
  } catch (error) {
    console.error('[GET /eco-zones]', error);
    res.status(200).json({ type: 'FeatureCollection', features: [] });
  }
});

router.delete('/eco-zones/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ ok: false, error: 'ID invalide' });
    await db.execute(sql`DELETE FROM eco_geographie_zones WHERE id = ${id}`);
    res.json({ ok: true, message: 'Zone éco-géographique supprimée' });
  } catch (error) {
    console.error('[DELETE /eco-zones/:id]', error);
    res.status(500).json({ ok: false, error: 'Erreur lors de la suppression' });
  }
});

export default router;
