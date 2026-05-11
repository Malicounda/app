import { Request, Response } from 'express';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import proj4 from 'proj4';

export const getZones = async (req: Request, res: Response) => {
  try {
    const { type } = req.query as { type?: string };

    const base = sql`
      SELECT 
        id, name, type, status, color,
        responsible_name, responsible_phone, responsible_email, responsible_photo,
        attachments, notes, guides_count, trackers_count,
        region, departement, commune, arrondissement,
        centroid_lat, centroid_lon, area_sq_km,
        created_by, created_at, updated_at,
        ST_AsGeoJSON(geometry) AS geojson
      FROM zones
    `;

    const q = type
      ? sql`${base} WHERE type = ${type} ORDER BY id DESC`
      : sql`${base} ORDER BY id DESC`;

    const rows = await db.execute(q);

    const features = (rows as any[]).map((r) => {
      let geometry = null;
      try { geometry = r.geojson ? JSON.parse(r.geojson as string) : null; } catch (_) { geometry = null; }
      // Parse attachments JSON if stored as JSONB
      let attachments: any = null;
      try {
        attachments = r.attachments ? (typeof r.attachments === 'string' ? JSON.parse(r.attachments) : r.attachments) : null;
      } catch {
        attachments = null;
      }
      return geometry ? {
        type: 'Feature',
        geometry,
        properties: {
          id: r.id,
          name: r.name,
          type: r.type,
          status: r.status,
          color: r.color,
          responsible_name: r.responsible_name,
          responsible_phone: r.responsible_phone,
          responsible_email: r.responsible_email,
          responsible_photo: r.responsible_photo,
          attachments,
          notes: r.notes,
          guides_count: r.guides_count,
          trackers_count: r.trackers_count,
          region: r.region,
          departement: r.departement,
          commune: r.commune,
          arrondissement: r.arrondissement,
          centroid_lat: r.centroid_lat,
          centroid_lon: r.centroid_lon,
          area_sq_km: r.area_sq_km,
          created_by: r.created_by,
          created_at: r.created_at,
          updated_at: r.updated_at,
        }
      } : null;
    }).filter(Boolean);

    return res.status(200).json({ type: 'FeatureCollection', features });
  } catch (error) {
    console.error('getZones error', error);
    return res.status(500).json({ message: 'Erreur serveur lors de la récupération des zones.' });
  }
};

export const createZone = async (req: Request, res: Response) => {
  try {
    // Support à la fois JSON et FormData
    let body: any = req.body;
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      // Pour FormData, on doit parser les champs
      const {
        name,
        type,
        status = 'active',
        color = '#0ea5e9',
        responsible_name,
        responsible_phone,
        responsible_email,
        responsible_photo,
        attachments,
        notes,
        guides_count,
        trackers_count,
        region,
        departement,
        commune,
        arrondissement,
        centroid_lat,
        centroid_lon,
        created_by = (req as any)?.user?.username || 'system',
        geometry: geometryGeoJSON,
      } = req.body || {};

      body = {
        name,
        type,
        status,
        color,
        responsible_name,
        responsible_phone,
        responsible_email,
        responsible_photo,
        attachments: attachments ? JSON.parse(attachments) : null,
        notes,
        guides_count,
        trackers_count,
        region,
        departement,
        commune,
        arrondissement,
        centroid_lat: centroid_lat ? parseFloat(centroid_lat) : null,
        centroid_lon: centroid_lon ? parseFloat(centroid_lon) : null,
        created_by,
        geometry: geometryGeoJSON ? JSON.parse(geometryGeoJSON) : null,
      };
    } else {
      body = req.body;
    }

    const {
      name,
      type,
      status = 'active',
      color = '#0ea5e9',
      responsible_name,
      responsible_phone,
      responsible_email,
      responsible_photo,
      attachments,
      notes,
      guides_count,
      trackers_count,
      region,
      departement,
      commune,
      arrondissement,
      centroid_lat,
      centroid_lon,
      created_by = (req as any)?.user?.username || 'system',
      geometry: geometryGeoJSON,
    } = body || {};

    if (!name || !type) {
      return res.status(400).json({ message: 'name et type sont obligatoires' });
    }
    if (!geometryGeoJSON) {
      return res.status(400).json({ message: 'geometry (GeoJSON) est obligatoire pour la V1' });
    }

    // Validation périmètre pour agents régionaux et secteur
    const userRole = (req as any)?.user?.role;
    const userType = (req as any)?.user?.type;
    const userRegion = (req as any)?.user?.region;
    const userDepartement = (req as any)?.user?.departement || (req as any)?.user?.zone;

    const normalize = (s?: string | null) => String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Agent régional: vérifier que la zone est dans sa région
    if (userRole === 'agent' && userType !== 'secteur' && userRegion) {
      const normalizedZoneRegion = normalize(region);
      const normalizedUserRegion = normalize(userRegion);
      if (normalizedZoneRegion && normalizedZoneRegion !== normalizedUserRegion) {
        console.log('[Backend] Agent régional tente de créer zone hors région:', { zoneRegion: region, userRegion });
        return res.status(403).json({ 
          message: `Vous n'êtes pas autorisé à créer une zone hors de votre région (${userRegion}).` 
        });
      }
    }

    // Agent secteur: vérifier que la zone est dans son département
    if ((userRole === 'agent' && userType === 'secteur' && userDepartement) || (userRole === 'sub-agent' && userDepartement)) {
      const normalizedZoneDep = normalize(departement);
      const normalizedUserDep = normalize(userDepartement);
      if (normalizedZoneDep && normalizedZoneDep !== normalizedUserDep) {
        console.log('[Backend] Agent secteur tente de créer zone hors département:', { zoneDep: departement, userDep: userDepartement });
        return res.status(403).json({ 
          message: `Vous n'êtes pas autorisé à créer une zone hors de votre département (${userDepartement}).` 
        });
      }
    }

    const geometryText = JSON.stringify(geometryGeoJSON);

    const result = await db.execute(sql`
      INSERT INTO zones (
        name, type, status, color,
        responsible_name, responsible_phone, responsible_email, responsible_photo,
        attachments, notes, guides_count, trackers_count,
        geometry, region, departement, commune, arrondissement,
        centroid_lat, centroid_lon, area_sq_km, created_by
      )
      VALUES (
        ${name}, ${type}, ${status}, ${color},
        ${responsible_name ?? null}, ${responsible_phone ?? null}, ${responsible_email ?? null}, ${responsible_photo ?? null},
        ${attachments ? JSON.stringify(attachments) : null}, ${notes ?? null}, ${guides_count ?? null}, ${trackers_count ?? null},
        ST_SetSRID(ST_GeomFromGeoJSON(${geometryText}), 4326), ${region ?? null}, ${departement ?? null}, ${commune ?? null}, ${arrondissement ?? null},
        ${centroid_lat ?? null},
        ${centroid_lon ?? null},
        ST_Area(Geography(ST_SetSRID(ST_GeomFromGeoJSON(${geometryText}), 4326)))/1000000.0,
        ${created_by}
      )
      RETURNING id;
    `);
    const row = Array.isArray(result) ? result[0] : (result as any)?.rows?.[0] || result;

    return res.status(201).json({ id: row?.id });
  } catch (error) {
    console.error('createZone error', error);
    return res.status(500).json({ message: 'Erreur serveur lors de la création de la zone.' });
  }
};

export const updateZone = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'id requis' });
    
    // Charger la zone existante pour appliquer les règles d'autorisation sur son créateur et sa localisation
    let existingZone: { created_by?: string | null; region?: string | null; departement?: string | null } | null = null;
    try {
      const rows: any[] = await db.execute(sql`SELECT created_by, region, departement FROM zones WHERE id = ${id} LIMIT 1`);
      existingZone = rows?.[0] || null;
    } catch (e) {
      console.error('updateZone fetch existing error', e);
    }
    if (!existingZone) {
      return res.status(404).json({ message: 'Zone introuvable' });
    }

    // Support à la fois JSON et FormData
    let body: any = req.body;
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      // Pour FormData, on doit parser les champs
      const {
        name,
        type,
        status,
        color,
        responsible_name,
        responsible_phone,
        responsible_email,
        notes,
        guides_count,
        trackers_count,
        region,
        departement,
        commune,
        arrondissement,
        attachments,
      } = req.body || {};

      body = {
        name,
        type,
        status,
        color,
        responsible_name,
        responsible_phone,
        responsible_email,
        notes,
        guides_count,
        trackers_count,
        region,
        departement,
        commune,
        arrondissement,
        attachments,
      };
    } else {
      body = req.body;
    }

    const {
      name,
      type,
      status,
      color,
      responsible_name,
      responsible_phone,
      responsible_email,
      notes,
      guides_count,
      trackers_count,
      region,
      departement,
      commune,
      arrondissement,
      attachments,
    } = body || {};

    if (!name || !type) {
      return res.status(400).json({ message: 'name et type sont obligatoires' });
    }

    // Validation périmètre et RBAC pour UPDATE
    const userRole = (req as any)?.user?.role;
    const userType = (req as any)?.user?.type;
    const userRegion = (req as any)?.user?.region;
    const userDepartement = (req as any)?.user?.departement || (req as any)?.user?.zone;

    const normalize = (s?: string | null) => String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const normalizeText = (s?: string | null) => String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim();
    const getCreatorLevel = (createdBy?: string | null): 'admin' | 'regional' | 'sector' | 'unknown' => {
      const c = normalizeText(createdBy);
      if (!c) return 'unknown';
      if (c.includes('admin')) return 'admin';
      if (c.includes('region') || c.includes('iref')) return 'regional';
      if (c.includes('secteur') || c.includes('sector') || c.includes('dept') || c.includes('departement')) return 'sector';
      return 'unknown';
    };

    // Règles RBAC basées sur le créateur de la zone existante
    if (userRole !== 'admin') {
      const creatorLevel = getCreatorLevel(existingZone.created_by);
      // Interdiction pour tous les agents/modérateurs sur zones créées par admin
      if ((userRole === 'agent' || userRole === 'sub-agent') && creatorLevel === 'admin') {
        return res.status(403).json({ message: `Vous n'êtes pas autorisé à modifier une zone créée par un administrateur.` });
      }
      // Agent secteur/sub-agent ne peut pas modifier une zone créée par un agent régional
      if (((userRole === 'agent' && userType === 'secteur') || userRole === 'sub-agent') && creatorLevel === 'regional') {
        return res.status(403).json({ message: `Vous n'êtes pas autorisé à modifier une zone créée par un agent régional.` });
      }
      // Agent régional peut modifier une zone créée par un agent de secteur uniquement si même région
      if (userRole === 'agent' && userType !== 'secteur' && creatorLevel === 'sector') {
        const zoneReg = normalize(existingZone.region);
        const usrReg = normalize(userRegion);
        if (zoneReg && usrReg && zoneReg !== usrReg) {
          return res.status(403).json({ message: `Vous n'êtes pas autorisé à modifier une zone hors de votre région (${userRegion}).` });
        }
      }
    }

    // Périmètre: se baser sur la localisation de la zone existante pour éviter contournement par payload
    if (userRole === 'agent' && userType !== 'secteur' && userRegion) {
      const normalizedExistingZoneRegion = normalize(existingZone.region);
      const normalizedUserRegion = normalize(userRegion);
      if (normalizedExistingZoneRegion && normalizedExistingZoneRegion !== normalizedUserRegion) {
        console.log('[Backend] Agent régional tente de modifier zone hors région (existing):', { zoneRegion: existingZone.region, userRegion });
        return res.status(403).json({ message: `Vous n'êtes pas autorisé à modifier une zone hors de votre région (${userRegion}).` });
      }
    }

    if ((userRole === 'agent' && userType === 'secteur' && userDepartement) || (userRole === 'sub-agent' && userDepartement)) {
      const normalizedExistingZoneDep = normalize(existingZone.departement);
      const normalizedUserDep = normalize(userDepartement);
      if (normalizedExistingZoneDep && normalizedExistingZoneDep !== normalizedUserDep) {
        console.log('[Backend] Agent secteur tente de modifier zone hors département (existing):', { zoneDep: existingZone.departement, userDep: userDepartement });
        return res.status(403).json({ message: `Vous n'êtes pas autorisé à modifier une zone hors de votre département (${userDepartement}).` });
      }
    }

    // Files uploaded by multer (from zones.routes.ts uploadDocs.any())
    // @ts-ignore
    const files = (req as any).files as Express.Multer.File[] | undefined;
    let responsiblePhotoUrl: string | null = null;
    const newAttachments: { name: string; url: string; mime?: string }[] = [];
    if (Array.isArray(files)) {
      for (const f of files) {
        const relative = `/uploads/documents/${f.filename}`;
        if (f.fieldname === 'responsible_photo') {
          responsiblePhotoUrl = relative;
        } else if (f.fieldname.startsWith('attachment_')) {
          newAttachments.push({ name: f.originalname, url: relative, mime: f.mimetype });
        }
      }
    }

    // Charger les pièces existantes pour les fusionner
    let existing: any[] = [];
    try {
      const rows: any[] = await db.execute(sql`SELECT responsible_photo, attachments FROM zones WHERE id = ${id} LIMIT 1`);
      const row0 = rows?.[0];
      if (row0?.attachments) {
        existing = typeof row0.attachments === 'string' ? JSON.parse(row0.attachments) : row0.attachments;
        if (!Array.isArray(existing)) existing = [];
      }
      // Si aucune nouvelle photo envoyée, garder l'ancienne
      if (!responsiblePhotoUrl && row0?.responsible_photo) {
        responsiblePhotoUrl = row0.responsible_photo as string;
      }
    } catch {}

    // Gestion des pièces jointes
    let finalAttachments: { name: string; url: string; mime?: string }[] = [];

    // Si le frontend envoie explicitement les attachments (pour suppression), les utiliser
    if (attachments !== undefined) {
      try {
        let parsedAttachments: any[] = [];
        if (typeof attachments === 'string') {
          // Gérer les cas où c'est une chaîne vide ou un JSON
          if (attachments.trim() === '' || attachments === '[]') {
            parsedAttachments = []; // Tableau vide explicite
            console.log('📎 Tableau vide explicite reçu du frontend');
          } else {
            parsedAttachments = JSON.parse(attachments);
          }
        } else if (Array.isArray(attachments)) {
          parsedAttachments = attachments;
        }

        if (Array.isArray(parsedAttachments)) {
          finalAttachments = [...parsedAttachments];
          console.log('📎 Utilisation des attachments envoyés par le frontend:', finalAttachments.length);
        } else {
          console.warn('📎 Attachments non-array reçu:', typeof attachments, attachments);
          finalAttachments = Array.isArray(existing) ? [...existing] : [];
        }
      } catch (e) {
        console.error('❌ Erreur parsing attachments:', e, 'Valeur reçue:', attachments);
        // Fallback vers les existants
        finalAttachments = Array.isArray(existing) ? [...existing] : [];
      }
    } else {
      // Sinon, fusionner les existants avec les nouveaux (comportement par défaut)
      if (existing && Array.isArray(existing)) {
        finalAttachments = [...existing];
      }
    }

    // Ajouter les nouvelles pièces jointes uploadées (s'il y en a)
    if (newAttachments && Array.isArray(newAttachments)) {
      for (const newAtt of newAttachments) {
        const exists = finalAttachments.some(existingAtt =>
          existingAtt.name === newAtt.name && existingAtt.url === newAtt.url
        );
        if (!exists) {
          finalAttachments.push(newAtt);
          console.log('📎 Ajout nouvelle pièce jointe:', newAtt.name);
        }
      }
    }

    const result = await db.execute(sql`
      UPDATE zones SET
        name = ${name},
        type = ${type},
        status = ${status || 'active'},
        color = ${color || '#0ea5e9'},
        responsible_name = ${responsible_name || null},
        responsible_phone = ${responsible_phone || null},
        responsible_email = ${responsible_email || null},
        responsible_photo = ${responsiblePhotoUrl || null},
        attachments = ${finalAttachments.length > 0 ? JSON.stringify(finalAttachments) : null},
        notes = ${notes || null},
        guides_count = ${guides_count || null},
        trackers_count = ${trackers_count || null},
        region = ${region || null},
        departement = ${departement || null},
        commune = ${commune || null},
        arrondissement = ${arrondissement || null},
        area_sq_km = ST_Area(Geography(geometry))/1000000.0,
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id;
    `);

    const row = Array.isArray(result) ? result[0] : (result as any)?.rows?.[0] || result;
    if (!row || !row.id) return res.status(404).json({ message: 'Zone introuvable' });

    return res.status(200).json({ success: true, id: row.id });
  } catch (error) {
    console.error('updateZone error', error);
    return res.status(500).json({ message: 'Erreur serveur lors de la mise à jour.' });
  }
};

export const deleteZone = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'id requis' });

    const del = await db.execute(sql`DELETE FROM zones WHERE id = ${id} RETURNING id`);
    const row = Array.isArray(del) ? del[0] : (del as any)?.rows?.[0] || del;
    if (!row || !row.id) return res.status(404).json({ message: 'Zone introuvable' });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('deleteZone error', error);
    return res.status(500).json({ message: 'Erreur serveur lors de la suppression.' });
  }
};

// POST /api/zones/import (multipart form)
// Fields: file (CSV), name, type (zic|amodiee), color, region, departement, commune, arrondissement
// CSV formats supportés:
//  - lat,lon (ou latitude,longitude) en degrés décimaux
//  - coord (string) "lat,lon" par ligne
//  - UTM: easting,northing,zone (ex: 28N) -> conversion en WGS84
export const importZones = async (req: Request, res: Response) => {
  // @ts-ignore multer ajoute file
  const file = (req as any).file as Express.Multer.File | undefined;
  try {
    const {
      name,
      type,
      color = '#0ea5e9',
      status = 'active',
      region,
      departement,
      commune,
      arrondissement,
    } = req.body || {};

    if (!file) return res.status(400).json({ message: 'Fichier CSV manquant' });
    if (!name || !type) return res.status(400).json({ message: 'name et type requis' });

    // Validation périmètre pour agents régionaux et secteur (IMPORT)
    const userRole = (req as any)?.user?.role;
    const userType = (req as any)?.user?.type;
    const userRegion = (req as any)?.user?.region;
    const userDepartement = (req as any)?.user?.departement || (req as any)?.user?.zone;

    const normalizeStr = (s?: string | null) => String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Agent régional: vérifier que la zone est dans sa région
    if (userRole === 'agent' && userType !== 'secteur' && userRegion) {
      const normalizedZoneRegion = normalizeStr(region);
      const normalizedUserRegion = normalizeStr(userRegion);
      if (normalizedZoneRegion && normalizedZoneRegion !== normalizedUserRegion) {
        console.log('[Backend] Agent régional tente d\'importer zone hors région:', { zoneRegion: region, userRegion });
        return res.status(403).json({ 
          message: `Vous n'êtes pas autorisé à importer une zone hors de votre région (${userRegion}).` 
        });
      }
    }

    // Agent secteur: vérifier que la zone est dans son département
    if ((userRole === 'agent' && userType === 'secteur' && userDepartement) || (userRole === 'sub-agent' && userDepartement)) {
      const normalizedZoneDep = normalizeStr(departement);
      const normalizedUserDep = normalizeStr(userDepartement);
      if (normalizedZoneDep && normalizedZoneDep !== normalizedUserDep) {
        console.log('[Backend] Agent secteur tente d\'importer zone hors département:', { zoneDep: departement, userDep: userDepartement });
        return res.status(403).json({ 
          message: `Vous n'êtes pas autorisé à importer une zone hors de votre département (${userDepartement}).` 
        });
      }
    }

    let raw = fs.readFileSync(file.path, 'utf8');
    // Remove potential UTF-8 BOM
    if (raw.charCodeAt(0) === 0xFEFF) {
      raw = raw.slice(1);
    }
    const rows = raw.split(/\r?\n/).filter(l => l && l.trim().length > 0);
    // Detect delimiter from header: prefer ; then , then tab then | if present
    const detectDelimiter = (s: string): RegExp => {
      if (s.includes(';')) return /\s*;\s*/;
      if (s.includes(',')) return /\s*,\s*/;
      if (s.includes('\t')) return /\t/;
      if (s.includes('|')) return /\s*\|\s*/;
      // Fallback: split on any of ; , tab or |
      return /\s*[;,\t|]\s*/;
    };
    if (rows.length < 2) {
      return res.status(400).json({ message: 'CSV vide ou incomplet (moins de 2 lignes trouvées)' });
    }
    const delim = detectDelimiter(rows[0]);
    const headerParts = rows[0].split(delim).map(h => h.trim().toLowerCase());

    // Parser l'en-tête
    const normalize = (s: string) => s.replace(/\uFEFF/g, '').trim().toLowerCase();
    const findIndexByAliases = (aliases: string[]) => headerParts.findIndex(h => aliases.includes(normalize(h)));

    const latAliases = ['lat','latitude','lat_deg','latdd','y'];
    const lonAliases = ['lon','lng','longitude','lon_deg','londd','x'];
    const coordAliases = ['coord','coords','latlon','lat_lon'];
    const eastAliases = ['easting','e','east'];
    const northAliases = ['northing','n','north'];
    const zoneAliases = ['zone','utm_zone','z'];

    const latIdx = findIndexByAliases(latAliases);
    const lonIdx = findIndexByAliases(lonAliases);
    const coordIdx = findIndexByAliases(coordAliases);
    const eastIdx = findIndexByAliases(eastAliases);
    const northIdx = findIndexByAliases(northAliases);
    const zoneIdx = findIndexByAliases(zoneAliases);

    const coords: [number, number][] = [];

    const parseNumber = (v: string) => {
      const t = v.replace(',', '.');
      const n = Number(t);
      return Number.isFinite(n) ? n : NaN;
    };

    // Définir un convertisseur UTM→WGS84 si colonnes UTM présentes
    const utmToWgs84 = (easting: number, northing: number, zone: string): [number, number] => {
      const match = /^(\d{1,2})([nNsS])$/.exec(zone);
      if (!match) throw new Error('Zone UTM invalide: ' + zone);
      const zoneNum = Number(match[1]);
      const hemi = match[2].toUpperCase();
      const proj = `+proj=utm +zone=${zoneNum} +datum=WGS84 +units=m +no_defs ${hemi === 'S' ? '+south' : ''}`.trim();
      const [lon, lat] = proj4(proj, 'WGS84', [easting, northing]);
      return [lat, lon];
    };

    for (let i = 1; i < rows.length; i++) {
      const line = rows[i];
      const parts = line.split(delim).map(s => s.trim());
      if (parts.length === 0) continue;

      if (coordIdx !== -1 && parts[coordIdx]) {
        // Accept both comma/semicolon and space as separator for the coord cell
        const cell = parts[coordIdx].replace(/\s+/g, ' ').trim();
        const pair = cell.split(/[\s]*[,;\s][\s]*/);
        if (pair.length >= 2) {
          const lat = parseNumber(pair[0]);
          const lon = parseNumber(pair[1]);
          if (Number.isFinite(lat) && Number.isFinite(lon)) coords.push([lat, lon]);
        }
      } else if (latIdx !== -1 && lonIdx !== -1) {
        const lat = parseNumber(parts[latIdx] || '');
        const lon = parseNumber(parts[lonIdx] || '');
        if (Number.isFinite(lat) && Number.isFinite(lon)) coords.push([lat, lon]);
      } else if (eastIdx !== -1 && northIdx !== -1 && zoneIdx !== -1) {
        const e = parseNumber(parts[eastIdx] || '');
        const n = parseNumber(parts[northIdx] || '');
        const z = (parts[zoneIdx] || '').toString();
        if (Number.isFinite(e) && Number.isFinite(n) && z) {
          try {
            const [lat, lon] = utmToWgs84(e, n, z);
            coords.push([lat, lon]);
          } catch {}
        }
      }
    }

    try { fs.unlinkSync(file.path); } catch {}

    if (coords.length < 3) {
      return res.status(400).json({
        message: `Nombre de points insuffisant (${coords.length}). Minimum 3.`,
        details: {
          headers: headerParts,
          detected: {
            latIdx, lonIdx, coordIdx, eastIdx, northIdx, zoneIdx
          }
        }
      });
    }

    // Construire un Polygon GeoJSON (lat,lon -> GeoJSON attend [lon, lat])
    const ring = coords.map(([lat, lon]) => [lon, lat]) as [number, number][];
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([first[0], first[1]]);
    }

    const geometryGeoJSON = { type: 'Polygon', coordinates: [ring] };

    const result = await db.execute(sql`
      INSERT INTO zones (
        name, type, status, color,
        geometry, region, departement, commune, arrondissement,
        centroid_lat, centroid_lon, area_sq_km, created_by
      )
      VALUES (
        ${name}, ${type}, ${status}, ${color},
        ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometryGeoJSON)}), 4326), ${region ?? null}, ${departement ?? null}, ${commune ?? null}, ${arrondissement ?? null},
        ST_Y(ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometryGeoJSON)}), 4326))),
        ST_X(ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometryGeoJSON)}), 4326))),
        ST_Area(Geography(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometryGeoJSON)}), 4326)))/1000000.0,
        ${(req as any)?.user?.username || 'system'}
      )
      RETURNING id;
    `);
    const row = Array.isArray(result) ? result[0] : (result as any)?.rows?.[0] || result;

    return res.status(201).json({ id: row?.id, points: coords.length });
  } catch (error) {
    console.error('importZones error', error);
    return res.status(500).json({ message: 'Erreur serveur lors de l\'import CSV.' });
  } finally {
    try {
      // @ts-ignore
      if ((req as any).file?.path && fs.existsSync((req as any).file.path)) fs.unlinkSync((req as any).file.path);
    } catch {}
  }
};
