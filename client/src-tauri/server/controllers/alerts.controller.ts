import { Prisma, PrismaClient, user_role } from '@prisma/client';
import { sql } from 'drizzle-orm';
import { NextFunction, Request, Response } from 'express';
import { db } from '../db.js';

// Type pour l'utilisateur authentifié
interface AuthenticatedUser {
    id: number;
    username: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    role: user_role;
    region: string | null;
    departement: string | null;
};

// Helper: déduire Région et Département strictement depuis les coordonnées (PostGIS)
async function resolveRegionDeptFromCoords(lat: number, lon: number): Promise<{ region: string | null; departement: string | null }> {
  console.log(`[resolveRegionDeptFromCoords] Résolution pour lat=${lat}, lon=${lon}`);
  try {
        // 1) Résoudre d'abord le département ET sa région en une requête
        let depJoinRows: any[] = await db.execute(sql`
            SELECT d.nom AS departement, r.nom AS region
            FROM departements d
            JOIN regions r ON r.id = d.region_id
            WHERE d.geom IS NOT NULL AND ST_Intersects(
                d.geom,
                ST_Transform(ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326), ST_SRID(d.geom))
            )
            ORDER BY ST_Area(d.geom) ASC
            LIMIT 1
        ` as any);
        if (!Array.isArray(depJoinRows)) depJoinRows = [];
        console.log(`[resolveRegionDeptFromCoords] Dép./Rég. (lon,lat): dep=${depJoinRows[0]?.departement ?? 'AUCUN'}, reg=${depJoinRows[0]?.region ?? 'AUCUNE'}`);

        // 2) Fallback inversion lat/lon si non trouvé
        if (depJoinRows.length === 0) {
            console.log(`[resolveRegionDeptFromCoords] Tentative inversion lat/lon pour dép./rég.`);
            const swappedDepJoin = await db.execute(sql`
                SELECT d.nom AS departement, r.nom AS region
                FROM departements d
                JOIN regions r ON r.id = d.region_id
                WHERE d.geom IS NOT NULL AND ST_Intersects(
                    d.geom,
                    ST_Transform(ST_SetSRID(ST_MakePoint(${lat}, ${lon}), 4326), ST_SRID(d.geom))
                )
                ORDER BY ST_Area(d.geom) ASC
                LIMIT 1
            ` as any);
            const arr = Array.isArray(swappedDepJoin) ? swappedDepJoin : [];
            if (arr.length > 0) {
                depJoinRows = arr;
                console.log(`[resolveRegionDeptFromCoords] Dép./Rég. après inversion: dep=${arr[0]?.departement}, reg=${arr[0]?.region}`);
            }
        }

        const departement = depJoinRows[0]?.departement ?? null;
        const region = depJoinRows[0]?.region ?? null;
        console.log(`[resolveRegionDeptFromCoords] RÉSULTAT FINAL: département="${departement}", région="${region}"`);
        return { region, departement };
  } catch (e) {
      console.warn('[resolveRegionDeptFromCoords] échec résolution via PostGIS:', e);
      return { region: null, departement: null };
  }
}

// Compte des notifications non lues pour l'utilisateur authentifié
export const getUnreadAlertsCount = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authenticatedUser = req.user as unknown as AuthenticatedUser;
        if (!authenticatedUser || !authenticatedUser.id) {
            return res.status(403).json({ message: "Utilisateur non authentifié." });
        }

        // Utiliser Drizzle (db) pour compter, afin d'éviter des erreurs Prisma en dev si DATABASE_URL n'est pas alignée
        const rows: any[] = await db.execute(sql`
            SELECT COUNT(*)::int AS count
            FROM notifications
            WHERE user_id = ${authenticatedUser.id}
              AND (is_read IS NOT TRUE)
        `);
        const count = Array.isArray(rows) && rows[0] && typeof rows[0].count !== 'undefined' ? Number(rows[0].count) : 0;
        res.status(200).json({ count });
    } catch (error) {
        console.error("[Alerts Controller] Erreur dans getUnreadAlertsCount:", error);
        next(error);
    }
};

// Récupérer les alertes avec coordonnées pour affichage sur la carte
export const getMapAlerts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authenticatedUser = req.user as AuthenticatedUser;
        if (!authenticatedUser) {
            return res.status(403).json({ message: "Accès non autorisé" });
        }

        // Optionnel: filtres simples (nature, date min/max)
        const { nature, from, to } = req.query as { nature?: string; from?: string; to?: string };

        // Base: ne retourner que les alertes géolocalisées (nouveau: lat/lon; legacy: zone)
        const whereClause: any = {
            AND: [
                {
                    OR: [
                        { AND: [{ NOT: { lat: null } }, { NOT: { lon: null } }] },
                        { NOT: { zone: null } }
                    ]
                }
            ]
        };

        // Règles d'accès pour la carte:
        // - admin, agent régional, agent de secteur: voient TOUTES les alertes matérialisées sur la carte
        // - chasseur et guide: voient uniquement leurs propres alertes
        // Normaliser le rôle car la session peut contenir des variantes ('hunting-guide', 'sub-agent', etc.)
        const rawRole = (authenticatedUser as any)?.role;
        const roleStr = typeof rawRole === 'string' ? rawRole.toLowerCase() : String(rawRole).toLowerCase();
        const normalizedRole = roleStr.replace(/-/g, '_');
        if (normalizedRole === 'hunter' || normalizedRole === 'hunting_guide') {
            whereClause.AND.push({ sender_id: authenticatedUser.id });
        }

        if (nature && typeof nature === 'string') {
            whereClause.nature = nature;
        }
        // Si aucun filtre nature fourni, par défaut on limite aux natures clés pour l'affichage carte
        if (!nature) {
            whereClause.nature = { in: ['feux_de_brousse', 'braconnage', 'trafic_bois', 'trafic-bois'] };
        }
        if (from) {
            whereClause.created_at = { gte: new Date(from) };
        }
        if (to) {
            whereClause.created_at = { ...(whereClause.created_at || {}), lte: new Date(to) };
        }

        let items: any[] = [];
        try {
            // Cast to any to bypass TS schema mismatch until Prisma client is regenerated
            const alerts = await (prisma as any).alerts.findMany({
                where: whereClause,
                orderBy: { created_at: 'desc' },
                select: ({
                    id: true,
                    title: true,
                    message: true,
                    nature: true,
                    region: true,
                    zone: true,
                    lat: true,
                    lon: true,
                    departement: true,
                    created_at: true,
                    sender_id: true,
                    users: {
                        select: {
                            first_name: true,
                            last_name: true,
                            phone: true,
                            role: true,
                            region: true,
                            departement: true,
                        }
                    }
                } as any)
            });

            items = alerts
            .map((a: any) => {
                // Priorité: nouvelles colonnes lat/lon
                let latVal: number | null = (a as any).lat ?? null;
                let lonVal: number | null = (a as any).lon ?? null;
                if (!(isFinite(latVal as number) && isFinite(lonVal as number))) {
                    // Fallback legacy: parser zone "lat,lon"
                    const z = (a.zone || '').trim();
                    const parts = z.split(',');
                    if (parts.length === 2) {
                        const latParsed = parseFloat(parts[0]);
                        const lonParsed = parseFloat(parts[1]);
                        if (isFinite(latParsed) && isFinite(lonParsed)) {
                            latVal = latParsed;
                            lonVal = lonParsed;
                        }
                    }
                }
                if (!(isFinite(latVal as number) && isFinite(lonVal as number))) return null;
                return {
                    id: a.id,
                    title: a.title,
                    message: a.message,
                    nature: a.nature,
                    region: a.region,
                    departement: (a as any).departement ?? null,
                    lat: latVal as number,
                    lon: lonVal as number,
                    created_at: a.created_at,
                    sender: a.users ? {
                        first_name: a.users.first_name,
                        last_name: a.users.last_name,
                        phone: (a.users as any).phone || null,
                        role: (a.users as any).role || null,
                        region: (a.users as any).region || null,
                        departement: (a.users as any).departement || null,
                    } : undefined,
                };
            })
            .filter(Boolean) as any[];
        } catch (e) {
            console.warn('[Alerts Controller] Prisma failed in getMapAlerts, falling back to SQL:', e);
            // Fallback SQL (Drizzle) pour garantir la disponibilité
            // Construire dynamiquement le WHERE équivalent minimal
            const andConds: any[] = [];
            // coords or legacy zone present
            andConds.push(sql`((lat IS NOT NULL AND lon IS NOT NULL) OR (zone IS NOT NULL))` as any);
            // hunters/guides restriction
            const rawRole = (authenticatedUser as any)?.role;
            const roleStr = typeof rawRole === 'string' ? rawRole.toLowerCase() : String(rawRole).toLowerCase();
            const normalizedRole = roleStr.replace(/-/g, '_');
            if (normalizedRole === 'hunter' || normalizedRole === 'hunting_guide') {
                andConds.push(sql`sender_id = ${authenticatedUser.id}` as any);
            }
            // nature filter
            if (nature && typeof nature === 'string') {
                andConds.push(sql`nature = ${nature}` as any);
            } else {
                andConds.push(sql`nature IN ('feux_de_brousse','braconnage','trafic_bois','trafic-bois')` as any);
            }
            // date range
            if (from) andConds.push(sql`created_at >= ${new Date(from)}` as any);
            if (to) andConds.push(sql`created_at <= ${new Date(to)}` as any);

            const whereSql = andConds.length ? sql.join(andConds, sql` AND `) : sql`TRUE`;

            const rows: any[] = await db.execute(sql`
                SELECT
                  a.id,
                  a.title,
                  a.message,
                  a.nature,
                  a.region,
                  a.zone,
                  a.lat,
                  a.lon,
                  a.departement,
                  a.created_at,
                  a.sender_id,
                  u.first_name, u.last_name, u.phone, u.role, u.region AS user_region, u.departement AS user_departement
                FROM alerts a
                LEFT JOIN users u ON u.id = a.sender_id
                WHERE ${whereSql}
                ORDER BY a.created_at DESC, a.id DESC
            ` as any);

            items = (rows || [])
              .map((a: any) => {
                let latVal: number | null = a.lat ?? null;
                let lonVal: number | null = a.lon ?? null;
                if (!(isFinite(latVal as number) && isFinite(lonVal as number))) {
                    const z = (a.zone || '').trim();
                    const parts = z.split(',');
                    if (parts.length === 2) {
                        const latParsed = parseFloat(parts[0]);
                        const lonParsed = parseFloat(parts[1]);
                        if (isFinite(latParsed) && isFinite(lonParsed)) {
                            latVal = latParsed;
                            lonVal = lonParsed;
                        }
                    }
                }
                if (!(isFinite(latVal as number) && isFinite(lonVal as number))) return null;
                return {
                    id: a.id,
                    title: a.title,
                    message: a.message,
                    nature: a.nature,
                    region: a.region,
                    departement: a.departement ?? null,
                    lat: latVal as number,
                    lon: lonVal as number,
                    created_at: a.created_at,
                    sender: {
                        first_name: a.first_name ?? null,
                        last_name: a.last_name ?? null,
                        phone: a.phone ?? null,
                        role: a.role ?? null,
                        region: a.user_region ?? null,
                        departement: a.user_departement ?? null,
                    }
                };
              })
              .filter(Boolean) as any[];
        }

        res.status(200).json(items);
    } catch (error) {
        console.error('[Alerts Controller] Erreur dans getMapAlerts:', error);
        next(error);
    }
};

// Interface pour les coordonnées
interface Coordinates {
    latitude?: number | null;
    longitude?: number | null;
}

// Interface pour les destinataires de notification
interface NotificationRecipient {
    id: number;
}

const prisma = new PrismaClient();

// Types simplifiés pour les réponses
interface UserBasicInfo {
    id: number;
    username: string;
    first_name: string | null;
    last_name: string | null;
    role: user_role;
    region: string | null;
    departement: string | null;
}

export interface AlertResponse {
    id: number;
    title: string;
    message: string;
    type: string; // Pour le style du badge côté client (info, warning, error)
    nature: string; // braconnage, trafic-bois, etc.
    region: string | null;
    zone: string | null;
    departement: string | null;
    is_read: boolean | null; // Pertinent surtout pour les notifications d'alertes reçues
    created_at: Date | null;
    updated_at: Date | null;
    sender_id: number;
    sender?: UserBasicInfo; // Informations sur l'expéditeur
    read_by_roles?: string[]; // Accusés de lecture (rôles) pour les messages envoyés
}

// Interface pour la réponse de notification
interface NotificationResponse {
    id: number;
    user_id: number;
    alert_id: number | null;
    message: string;
    type: string;
    status: string;
    is_read: boolean;
    created_at: Date | null;
    updated_at: Date | null;
    alert?: AlertResponse;
}

// Fonction utilitaire pour formater les coordonnées
const formatCoordinate = (coord: any): string | null => {
    if (coord === null || coord === undefined) return null;
    return String(coord);
};

// Fonction utilitaire pour formater les coordonnées (si vous l'utilisez ailleurs, sinon elle peut être locale ou supprimée si non utilisée)
// const formatCoordinate = (coord: any): string | null => {
//     if (coord === null || coord === undefined) return null;
//     return String(coord);
// };

export const createAlert = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { title, message, nature, location, region, zone, latitude, longitude } = req.body as {
            title: string,
            message: string,
            nature: string,
            location?: any,
            region?: string,
            zone?: string,
            latitude?: number,
            longitude?: number
        };

        const authenticatedUser = req.user as unknown as AuthenticatedUser;

        if (!authenticatedUser || !authenticatedUser.id) {
            return res.status(403).json({ message: "Utilisateur non authentifié ou ID manquant." });
        }

        // Vérification des champs obligatoires
        // Vérification du type d'alerte obligatoire
        if (!nature) {
            return res.status(400).json({ message: "Le type d'alerte est requis." });
        }

        // Définir les messages par défaut pour les types d'alerte spécifiques
        const defaultMessages: Record<string, string> = {
            'feux_de_brousse': 'Alerte feux de brousse détectée dans la zone',
            'braconnage': 'Activité de braconnage suspectée dans la zone',
            'trafic_bois': 'Trafic de bois illégal détecté dans la zone'
        };

        // Déclarer la variable avec let pour permettre la réassignation
        let finalMessage = message;

        // Utiliser le message par défaut si aucun message n'est fourni
        if (!finalMessage && defaultMessages[nature]) {
            finalMessage = defaultMessages[nature];
        }

        // Vérification des coordonnées GPS obligatoires
        let lat: number | null = null;
        let lon: number | null = null;

        // Fonction pour convertir une valeur en nombre si possible
        const toNumber = (value: any): number | null => {
            if (value === null || value === undefined) return null;
            const num = parseFloat(value);
            return isNaN(num) ? null : num;
        };

        // Essayer de récupérer les coordonnées depuis la zone (format 'lat,lon')
        if (zone && typeof zone === 'string') {
            const coords = zone.split(',');
            if (coords.length === 2) {
                lat = toNumber(coords[0]);
                lon = toNumber(coords[1]);
            }
        }

        // Si les coordonnées ne sont pas dans zone, essayer depuis latitude/longitude
        if ((!lat || !lon) && (latitude !== undefined || longitude !== undefined)) {
            const latNum = toNumber(latitude);
            const lonNum = toNumber(longitude);
            if (latNum !== null && lonNum !== null) {
                lat = latNum;
                lon = lonNum;
            }
        }

        // Vérifier la validité des coordonnées
        const hasValidCoords = (lat !== null && lon !== null &&
                              Math.abs(lat) <= 90 && Math.abs(lon) <= 180);

        if (!hasValidCoords) {
            console.error('Coordonnées GPS invalides:', { zone, latitude, longitude });
            return res.status(400).json({
                message: "Des coordonnées GPS valides sont obligatoires pour toutes les alertes.",
                code: "GPS_REQUIRED"
            });
        }

        // Vérifier que les coordonnées sont au Sénégal en utilisant la table regions
        let alertRegion = region || null;
        let alertDepartement: string | null = null;
        try {
            // Vérifier d'abord si le point est dans une région (utiliser ST_Intersects pour inclure les bords)
            let regionResult = await db.execute(sql`
                SELECT id, nom, code
                FROM regions
                WHERE ST_Intersects(
                    geom,
                    ST_Transform(
                        ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326),
                        ST_SRID(geom)
                    )
                )
                LIMIT 1
            `);

            let regionRows = Array.isArray(regionResult) ? regionResult : [];

            // Si aucune région trouvée, tenter en inversant lat/lon (erreur fréquente d'inversion)
            let usedSwapped = false;
            if (regionRows.length === 0) {
                const swapped = await db.execute(sql`
                    SELECT id, nom, code
                    FROM regions
                    WHERE ST_Intersects(
                        geom,
                        ST_Transform(
                            ST_SetSRID(ST_MakePoint(${lat}, ${lon}), 4326),
                            ST_SRID(geom)
                        )
                    )
                    LIMIT 1
                `);
                const swappedRows = Array.isArray(swapped) ? swapped : [];
                if (swappedRows.length > 0) {
                    regionRows = swappedRows;
                    usedSwapped = true;
                }
            }

            if (regionRows.length === 0) {
                return res.status(400).json({
                    message: "Les coordonnées GPS doivent être situées dans une région du Sénégal pour envoyer une alerte.",
                    code: "LOCATION_OUTSIDE_SENEGAL"
                });
            }

            const foundRegion = regionRows[0] as { nom?: string } | undefined;
            if (foundRegion?.nom) {
                alertRegion = foundRegion.nom;
            }

            // Si l'inversion a permis de trouver une région, corriger lat/lon pour la persistance
            if (usedSwapped) {
                const tmpLat = lat;
                lat = lon;
                lon = tmpLat;
            }

            // Tenter aussi de déduire le département par géométrie (même logique d'intersection)
            try {
                let depResult = await db.execute(sql`
                    SELECT nom
                    FROM departements
                    WHERE ST_Intersects(
                        geom,
                        ST_Transform(
                            ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326),
                            ST_SRID(geom)
                        )
                    )
                    LIMIT 1
                `);
                let depRows = Array.isArray(depResult) ? depResult : [];

                if (depRows.length === 0 && usedSwapped) {
                    const swappedDep = await db.execute(sql`
                        SELECT nom
                        FROM departements
                        WHERE ST_Intersects(
                            geom,
                            ST_Transform(
                                ST_SetSRID(ST_MakePoint(${lat}, ${lon}), 4326),
                                ST_SRID(geom)
                            )
                        )
                        LIMIT 1
                    `);
                    depRows = Array.isArray(swappedDep) ? swappedDep : [];
                }

                const foundDep = depRows[0] as { nom?: string } | undefined;
                if (foundDep?.nom) alertDepartement = foundDep.nom;
            } catch (e) {
                console.warn('[Alerts Controller] Échec déduction département par coordonnées:', e);
            }
        } catch (error) {
            console.error("Erreur lors de la vérification de la localisation au Sénégal:", error);
            return res.status(500).json({
                message: "Erreur lors de la vérification de la localisation.",
                code: "LOCATION_VALIDATION_ERROR"
            });
        }

        // Fallback: si le département n'a pas pu être déduit par les coordonnées,
        // utiliser le département de l'utilisateur émetteur s'il est disponible.
        if (!alertDepartement && authenticatedUser?.departement) {
            const userDep = authenticatedUser.departement?.trim();
            if (userDep) {
                alertDepartement = userDep;
            }
        }


        // Normaliser le rôle car la session peut stocker des strings ('sub-agent') tandis que Prisma utilise 'sub_agent'
        const rawRole = (authenticatedUser as any)?.role;
        const roleStr = typeof rawRole === 'string' ? rawRole.toLowerCase() : String(rawRole).toLowerCase();
        const normalizedRole = roleStr.replace(/-/g, '_'); // 'sub-agent' -> 'sub_agent'

        // Vérifier si l'utilisateur a le droit d'envoyer des alertes
        const allowedSenderRoles = new Set<user_role>([user_role.admin, user_role.agent, user_role.sub_agent, user_role.hunter, user_role.hunting_guide]);

        // Vérifier les rôles autorisés
        if (!allowedSenderRoles.has(normalizedRole as user_role)) {
            console.warn('[Alerts Controller] createAlert denied due to role:', { rawRole, normalizedRole, userId: authenticatedUser.id });
            return res.status(403).json({ message: "Vous n'êtes pas autorisé à créer des alertes." });
        }

        // Restriction: chasseurs et guides ne peuvent envoyer que des messages de nature 'autre'.
        const natureToPersist = (normalizedRole === 'hunter' || normalizedRole === 'hunting_guide')
            ? 'autre'
            : nature;

        // Préparer la zone avec les coordonnées GPS
        // À ce stade, on est sûr que latitude et longitude sont des nombres valides
        const zoneFromCoords = (lat !== null && lon !== null) ? `${lat},${lon}` : (zone || null);
        // Déduire la région automatiquement via PostGIS si lat/lon fournis
        let regionFromPoint: string | null = null;
        try {
            if (lat !== null && lon !== null) {
                const rows = await db.execute(sql`
                    SELECT nom FROM regions
                    WHERE ST_Intersects(
                        geom,
                        ST_Transform(
                            ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326),
                            ST_SRID(geom)
                        )
                    )
                    LIMIT 1
                ` as any);
                const first = Array.isArray(rows) ? rows[0] : (rows as any)[0];
                regionFromPoint = first?.nom ?? null;
            }
        } catch (e) {
            console.error('[Alerts Controller] Échec déduction région par coordonnées:', e);
        }
        let regionName: string | null = (region && region.trim() !== '')
            ? region
            : (regionFromPoint || authenticatedUser.region || null);

        // Si on n'a pas encore de région, tenter de la déduire via le département de l'émetteur (quel que soit le rôle)
        if (!regionName) {
            const depName = authenticatedUser.departement?.trim();
            if (depName) {
                try {
                    // Nouvelle logique: jointure via region_id -> regions.id pour récupérer le nom de région
                    const rows = await db.execute(sql`
                        SELECT r.nom AS region_nom
                        FROM departements d
                        JOIN regions r ON r.id = d.region_id
                        WHERE d.nom ILIKE ${depName}
                        LIMIT 1
                    `);
                    const first = Array.isArray(rows) ? rows[0] : (rows as any)[0];
                    if (first?.region_nom) {
                        regionName = first.region_nom as string;
                    }
                } catch (e) {
                    console.warn('[Alerts Controller] Impossible de déduire la région via le département:', depName, e);
                }
            }
        }

        // Fallback additionnel: si la région n'est toujours pas définie mais qu'on a un département d'alerte,
        // déduire la région via la table departements.
        if (!regionName && alertDepartement) {
            const depName = alertDepartement.trim();
            if (depName) {
                try {
                    // Nouvelle logique: jointure via region_id -> regions.id pour récupérer le nom de région
                    const rows = await db.execute(sql`
                        SELECT r.nom AS region_nom
                        FROM departements d
                        JOIN regions r ON r.id = d.region_id
                        WHERE d.nom ILIKE ${depName}
                        LIMIT 1
                    `);
                    const first = Array.isArray(rows) ? rows[0] : (rows as any)[0];
                    if (first?.region_nom) {
                        regionName = first.region_nom as string;
                    }
                } catch (e) {
                    console.warn('[Alerts Controller] Impossible de déduire la région via alertDepartement:', depName, e);
                }
            }
        }

        // Si un département a été déterminé, aligner la région sur celle du département
        if (alertDepartement && alertDepartement.trim()) {
            try {
                const rows = await db.execute(sql`
                    SELECT r.nom AS region_nom
                    FROM departements d
                    JOIN regions r ON r.id = d.region_id
                    WHERE d.nom ILIKE ${alertDepartement}
                    LIMIT 1
                `);
                const first = Array.isArray(rows) ? rows[0] : (rows as any)[0];
                if (first?.region_nom) {
                    regionName = first.region_nom as string;
                }
            } catch (e) {
                console.warn('[Alerts Controller] Impossible d\'aligner la région via le département déjà déterminé:', alertDepartement, e);
            }
        }

        // Créer l'alerte dans la base de données: conserver la région telle quelle (avec accents/casse) pour l'affichage.
        const newAlert = await prisma.alerts.create({
            data: {
                title: title || `Alerte: ${nature}`,
                message: message,
                nature: natureToPersist,
                sender_id: authenticatedUser.id,
                // Utiliser la région alignée au département si disponible
                region: regionName || alertRegion,
                // Stocker également departement si détecté
                departement: alertDepartement || null,
                // NOTE: La colonne alerts.zone stocke les coordonnées sous forme "lat,lon" (ex: "14.7935,-16.9257").
                // Ce n'est PAS une colonne sur la table users. Aucune dépendance à users.zone.
                // Si latitude/longitude fournis, stocker dans zone sous forme "lat,lon"; sinon fallback zone fourni ou null
                zone: zoneFromCoords,
                // Nouvelles colonnes GPS dédiées
                lat: lat!,
                lon: lon!,
                // La propriété location n'est pas incluse car elle n'existe pas dans le schéma
                is_read: false,
                created_at: new Date(),
                updated_at: new Date()
            },
            include: {
                users: {
                    select: {
                        id: true,
                        username: true,
                        first_name: true,
                        last_name: true,
                        role: true,
                        region: true,
                        departement: true,
                    }
                }
            }
        });

        // Récupérer les destinataires (hors émetteur):
        // Règles demandées:
        // - L'agent régional (role=agent) reçoit toutes les alertes émises depuis sa région
        // - L'agent de secteur (role=sub_agent) reçoit l'alerte si elle est émise depuis son département
        // - Les administrateurs ne reçoivent pas les alertes des chasseurs/guides

        // Helper: normaliser les chaînes (retirer accents, majuscules, trim)
        const normalize = (s: string | null | undefined): string => {
            if (!s) return '';
            return s
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toUpperCase()
                .trim();
        };

        const effectiveRegion = alertRegion || regionName || null;
        const normEffectiveRegion = normalize(effectiveRegion);
        const normAlertDepartement = normalize(alertDepartement);

        // 1) Agents régionaux: filtrage côté JS pour être insensible aux accents/majuscules
        let regionalAgents: { id: number }[] = [];
        if (normEffectiveRegion) {
            const candidates = await prisma.users.findMany({
                where: { role: 'agent' },
                select: { id: true, region: true }
            });
            regionalAgents = candidates.filter(u => normalize((u as any).region) === normEffectiveRegion)
                                       .map(u => ({ id: u.id }));
        }

        // 2) Agents de secteur du département de l'alerte (si dispo)
        let sectorAgents: { id: number }[] = [];
        if (normAlertDepartement) {
            const candidates = await prisma.users.findMany({
                where: { role: 'sub_agent' },
                select: { id: true, departement: true }
            });
            sectorAgents = candidates.filter(u => normalize((u as any).departement) === normAlertDepartement)
                                     .map(u => ({ id: u.id }));
        }

        // 3) Admins (inclus seulement si l'émetteur n'est pas chasseur/guide)
        let admins: { id: number }[] = [];
        if (!(normalizedRole === 'hunter' || normalizedRole === 'hunting_guide')) {
            admins = await prisma.users.findMany({
                where: { role: 'admin' },
                select: { id: true }
            });
        }

        // Fusionner, dédupliquer, et exclure l'émetteur
        const recipientMap = new Map<number, true>();
        for (const r of [...regionalAgents, ...sectorAgents, ...admins]) {
            if (r.id !== authenticatedUser.id) recipientMap.set(r.id, true);
        }
        const recipients = Array.from(recipientMap.keys()).map(id => ({ id }));

        console.log('[Alerts Controller] Destinataires calculés:', {
            senderId: authenticatedUser.id,
            senderRole: authenticatedUser.role,
            resolvedRegion: effectiveRegion,
            resolvedDepartement: alertDepartement,
            counts: {
                regionalAgents: regionalAgents.length,
                sectorAgents: sectorAgents.length,
                admins: admins.length,
                totalUnique: recipients.length,
            }
        });

        if (recipients.length > 0) {
            const notificationMessage = `Nouvelle alerte "${(newAlert.title || 'Sans titre').substring(0, 50)}${(newAlert.title && newAlert.title.length > 50) ? '...' : ''}" dans la région ${newAlert.region || 'N/A'}.`;

            // Création des notifications une par une pour une meilleure gestion des erreurs
            for (const recipient of recipients) {
                try {
                    await prisma.notifications.create({
                        data: {
                            user_id: recipient.id,
                            alert_id: newAlert.id,
                            message: notificationMessage,
                            is_read: false,
                            type: 'ALERT',
                            status: 'NON_LU',
                            created_at: new Date(),
                            // updated_at: new Date(), // Retiré car géré par Prisma (@updatedAt)
                        }
                    });
                } catch (error) {
                    console.error(`Erreur lors de la création de la notification pour l'utilisateur ${recipient.id}:`, error);
                    // Continuer avec les autres notifications même en cas d'erreur
                }
            }

            console.log(`[Alerts Controller] Notifications créées pour ${recipients.length} utilisateur(s) pour l'alerte ID: ${newAlert.id}.`);
        }

        console.log(`[Alerts Controller] Alerte créée ID: ${newAlert.id} par utilisateur ID: ${authenticatedUser.id}`);

        // Préparer la réponse avec les informations de l'utilisateur créateur
        const responseAlert: AlertResponse = {
            id: newAlert.id,
            title: newAlert.title,
            message: newAlert.message,
            nature: newAlert.nature,
            region: newAlert.region,
            zone: newAlert.zone,
            departement: (newAlert as any).departement ?? null,
            is_read: newAlert.is_read,
            created_at: newAlert.created_at,
            updated_at: newAlert.updated_at,
            sender_id: newAlert.sender_id,
            type: 'info', // Type par défaut pour une nouvelle alerte, le client peut l'interpréter
            sender: {
                id: authenticatedUser.id,
                username: authenticatedUser.username,
                first_name: authenticatedUser.first_name || null,
                last_name: authenticatedUser.last_name || null,
                role: authenticatedUser.role,
                region: authenticatedUser.region,
                departement: authenticatedUser.departement
            }
        };

        res.status(201).json({
            message: 'Alerte créée avec succès',
            alert: responseAlert
        });
    } catch (error) {
        console.error("[Alerts Controller] Erreur dans createAlert:", error);
        next(error);
    }
};

export const getReceivedAlerts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authenticatedUser = req.user as AuthenticatedUser;
        if (!authenticatedUser || !authenticatedUser.id) {
            return res.status(403).json({ message: "Utilisateur non authentifié." });
        }

        // On s'appuie uniquement sur les notifications créées côté création d'alerte.
        // Aucune restriction supplémentaire par rôle ici: l'inbox reflète exactement les notifications.

        console.log(`[DEBUG] getReceivedAlerts - Fetching notifications for user ID: ${authenticatedUser.id}`);
        // Toujours restreindre aux notifications de l'utilisateur authentifié
        const notificationsWhere = {
            user_id: authenticatedUser.id,
        } as any;

        const notificationsFromDb = await prisma.notifications.findMany({
            where: notificationsWhere,
            include: {
                alert: {
                    include: {
                        users: true // 'users' est le nom de la relation dans Prisma pour l'expéditeur de l'alerte
                    }
                }
            },
            orderBy: { created_at: 'desc' }
        });

        console.log(`[DEBUG] getReceivedAlerts - notificationsFromDb count: ${notificationsFromDb.length}`);
        notificationsFromDb.forEach((n, index) => {
            console.log(`[DEBUG] getReceivedAlerts - notificationsFromDb[${index}] ID: ${n.id}, alert_id: ${n.alert_id}, .alert object present: ${!!n.alert}`);
            if (n.alert === null) {
                console.log(`[DEBUG] getReceivedAlerts - notificationsFromDb[${index}] ID: ${n.id} has n.alert === null`);
            }
        });

        // Filtrer les notifications pour ne garder que celles avec une alerte associée non nulle
        const validNotifications = notificationsFromDb.filter(notif => {
            const isAlertPresent = notif.alert !== null && notif.alert !== undefined;
            if (!isAlertPresent) {
                console.log(`[DEBUG] getReceivedAlerts - Filtering out notification ID ${notif.id} because notif.alert is null or undefined. Value:`, notif.alert);
            }
            return isAlertPresent;
        });
        console.log(`[DEBUG] getReceivedAlerts - validNotifications count: ${validNotifications.length}`);

        const responseNotifications: NotificationResponse[] = await Promise.all(validNotifications.map(async (notif) => {
            console.log(`[DEBUG] getReceivedAlerts - Mapping validNotification ID ${notif.id}. Alert object present: ${!!notif.alert}, Alert ID: ${notif.alert?.id}, Alert Type: ${(notif.alert as unknown as { type: string })?.type}`);
            let alertResponse: AlertResponse | undefined = undefined;
            if (notif.alert) {
                console.log(`[DEBUG] getReceivedAlerts - Condition 'if (notif.alert)' is TRUE for notification ID ${notif.id}`);
                // TOUJOURS recalculer Région/Département strictement depuis les coordonnées (ignorer valeurs stockées)
                let computedRegion: string | null = null;
                let computedDept: string | null = null;
                const latVal = (notif.alert as any).lat as number | null | undefined;
                const lonVal = (notif.alert as any).lon as number | null | undefined;
                let latNum: number | null = (typeof latVal === 'number' && isFinite(latVal)) ? latVal : null;
                let lonNum: number | null = (typeof lonVal === 'number' && isFinite(lonVal)) ? lonVal : null;

                // Fallback: parser depuis zone si lat/lon manquants
                if (latNum == null || lonNum == null) {
                    const zoneStr = String((notif.alert as any).zone || '').trim();
                    const parts = zoneStr.split(',');
                    if (parts.length === 2) {
                        const pLat = parseFloat(parts[0]);
                        const pLon = parseFloat(parts[1]);
                        if (isFinite(pLat) && isFinite(pLon)) { latNum = pLat; lonNum = pLon; }
                    }
                }

                // Recalcul OBLIGATOIRE depuis coordonnées
                if (latNum != null && lonNum != null) {
                    console.log(`[DEBUG] getReceivedAlerts - Recalcul région/dept pour alerte ${notif.alert_id} avec coords: ${latNum}, ${lonNum}`);
                    const resolved = await resolveRegionDeptFromCoords(latNum, lonNum);
                    computedRegion = resolved.region;
                    computedDept = resolved.departement;
                    console.log(`[DEBUG] getReceivedAlerts - Résultat recalcul: région="${computedRegion}", dept="${computedDept}"`);
                } else {
                    console.warn(`[DEBUG] getReceivedAlerts - AUCUNE coordonnée disponible pour alerte ${notif.alert_id}`);
                }

                alertResponse = {
                    id: (notif.alert as any).id,
                    title: (notif.alert as any).title,
                    message: (notif.alert as any).message,
                    type: ((notif.alert as any).type || 'info'),
                    nature: (notif.alert as any).nature,
                    region: computedRegion,
                    zone: (notif.alert as any).zone,
                    departement: computedDept,
                    is_read: !!notif.is_read,
                    created_at: (notif.alert as any).created_at,
                    updated_at: (notif.alert as any).updated_at,
                    sender_id: (notif.alert as any).sender_id,
                    sender: (notif.alert as any).users ? {
                        id: (notif.alert as any).users.id,
                        username: (notif.alert as any).users.username,
                        first_name: (notif.alert as any).users.first_name,
                        last_name: (notif.alert as any).users.last_name,
                        role: (notif.alert as any).users.role,
                        region: (notif.alert as any).users.region,
                        departement: ((notif.alert as any).users as any).departement,
                    } : undefined
                };
            }
            return {
                id: notif.id,
                user_id: notif.user_id,
                alert_id: notif.alert_id,
                message: notif.message,
                type: notif.type,
                status: (notif.status || 'UNKNOWN_STATUS') as string,
                is_read: !!notif.is_read,
                created_at: notif.created_at,
                updated_at: (notif as any).updated_at || null,
                alert: alertResponse
            };
        }));

        console.log('[DEBUG] Final responseNotifications being sent to frontend:', JSON.stringify(responseNotifications, null, 2));
        res.status(200).json(responseNotifications);
    } catch (error) {
        console.error('[ERROR] In getReceivedAlerts:', error);
        res.status(500).json({ message: 'Erreur interne du serveur' });
    }
};

export const getSentAlerts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authenticatedUser = req.user as unknown as AuthenticatedUser;
        if (!authenticatedUser || !authenticatedUser.id) {
            return res.status(403).json({ message: "Utilisateur non authentifié." });
        }

        // Construction de la requête de base
        const whereClause: any = {};

        // Pour les administrateurs, on filtre pour ne voir que les alertes des agents
        if (authenticatedUser.role === user_role.admin) {
            whereClause.users = {
                role: user_role.agent
            };
        } else {
            // Pour les autres utilisateurs, on filtre par expéditeur
            whereClause.sender_id = authenticatedUser.id;
        }

        // NOTE: Ancienne logique supprimée car elle empêchait les agents de voir leurs propres alertes envoyées.
        // Pour tous les utilisateurs non-admin, on retourne simplement les alertes dont ils sont l'expéditeur.

        const sentAlertsFromDb = await prisma.alerts.findMany({
            where: whereClause,
            include: {
                users: true // L'expéditeur (l'utilisateur authentifié lui-même)
            },
            orderBy: { created_at: 'desc' }
        });

        const responseAlerts: AlertResponse[] = await Promise.all(sentAlertsFromDb.map(async (alert) => {
            const alertData = alert as any;
            // TOUJOURS recalculer depuis coords (ignorer valeurs stockées)
            let computedRegion: string | null = null;
            let computedDept: string | null = null;
            let latNum: number | null = (typeof alertData.lat === 'number' && isFinite(alertData.lat)) ? alertData.lat : null;
            let lonNum: number | null = (typeof alertData.lon === 'number' && isFinite(alertData.lon)) ? alertData.lon : null;

            // Fallback: parser depuis zone si lat/lon manquants
            if (latNum == null || lonNum == null) {
                const zoneStr = String(alertData.zone || '').trim();
                const parts = zoneStr.split(',');
                if (parts.length === 2) {
                    const pLat = parseFloat(parts[0]);
                    const pLon = parseFloat(parts[1]);
                    if (isFinite(pLat) && isFinite(pLon)) { latNum = pLat; lonNum = pLon; }
                }
            }

            // Recalcul OBLIGATOIRE depuis coordonnées
            if (latNum != null && lonNum != null) {
                console.log(`[DEBUG] getSentAlerts - Recalcul région/dept pour alerte ${alertData.id} avec coords: ${latNum}, ${lonNum}`);
                const resolved = await resolveRegionDeptFromCoords(latNum, lonNum);
                computedRegion = resolved.region;
                computedDept = resolved.departement;
                console.log(`[DEBUG] getSentAlerts - Résultat recalcul: région="${computedRegion}", dept="${computedDept}"`);
            } else {
                console.warn(`[DEBUG] getSentAlerts - AUCUNE coordonnée disponible pour alerte ${alertData.id}`);
            }

            // Lire les accusés de lecture (notifications lues) pour cette alerte
            let readByRoles: string[] = [];
            try {
                const readers = await prisma.notifications.findMany({
                    where: { alert_id: alertData.id, is_read: true },
                    include: { users: { select: { role: true } } }
                });
                const roleSet = new Set<string>();
                for (const r of readers) {
                    const raw = (r.users as any)?.role;
                    const norm = typeof raw === 'string' ? raw.toLowerCase().replace(/-/g, '_') : String(raw).toLowerCase().replace(/-/g, '_');
                    if (norm === 'agent') roleSet.add('IREF');
                    else if (norm === 'sub_agent') roleSet.add('Secteur');
                    else if (norm === 'admin') roleSet.add('Admin');
                }
                // Ordonner: IREF, Secteur, Admin
                const order = ['IREF', 'Secteur', 'Admin'];
                readByRoles = Array.from(roleSet).sort((a,b)=> order.indexOf(a)-order.indexOf(b));
            } catch (e) {
                console.warn('[getSentAlerts] Impossible de récupérer les lecteurs pour alerte', alertData.id, e);
            }

            return {
                id: alertData.id,
                title: alertData.title,
                message: alertData.message,
                type: alertData.type || 'info',
                nature: alertData.nature,
                region: computedRegion,
                zone: alertData.zone,
                departement: computedDept,
                is_read: true,
                created_at: alertData.created_at,
                updated_at: alertData.updated_at,
                sender_id: alertData.sender_id,
                read_by_roles: readByRoles,
                sender: alertData.users ? {
                    id: alertData.users.id,
                    username: alertData.users.username,
                    first_name: alertData.users.first_name,
                    last_name: alertData.users.last_name,
                    role: alertData.users.role,
                    region: alertData.users.region,
                    departement: (alertData.users as any).departement,
                } : undefined
            };
        }));

        res.status(200).json(responseAlerts);
    } catch (error) {
        console.error("[Alerts Controller] Erreur dans getSentAlerts:", error);
        next(error);
    }
};

export const markAsRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { alertId } = req.params; // Changé de notificationId à alertId
        const authenticatedUser = req.user as unknown as AuthenticatedUser;

        if (!authenticatedUser || !authenticatedUser.id) {
            return res.status(403).json({ message: "Utilisateur non authentifié." });
        }

        if (!alertId) {
            return res.status(400).json({ message: "L'ID de l'alerte est requis." });
        }

        // Trouver la notification spécifique pour cet utilisateur et cette alerte
        const notificationToUpdate = await prisma.notifications.findFirst({
            where: {
                alert_id: parseInt(alertId), // Assurez-vous que alertId est un nombre valide
                user_id: authenticatedUser.id
            }
        });

        if (!notificationToUpdate) {
            console.log(`[Alerts Controller] markAsRead: Notification non trouvée pour alertId: ${alertId}, userId: ${authenticatedUser.id}`);
            return res.status(404).json({ message: "Notification non trouvée pour cette alerte et cet utilisateur." });
        }

        // Marquer la notification trouvée comme lue
        const updatedNotification = await prisma.notifications.update({
            where: {
                id: notificationToUpdate.id // Utiliser l'ID de la notification trouvée
            },
            data: {
                is_read: true,
                status: 'READ' // TODO: Verify 'READ' is a valid NotificationStatus enum value in schema
            }
        });

        console.log(`[Alerts Controller] Notification ID: ${updatedNotification.id} marquée comme lue pour user ID: ${authenticatedUser.id}, alerte ID: ${alertId}`);
        // Renvoyer la notification mise à jour, qui inclut maintenant l'alerte avec les détails de l'expéditeur
        // Pour cela, nous devons refaire un fetch ou reconstruire la réponse avec l'alerte incluse.
        // Option simple : renvoyer juste un message de succès ou la notification simple.
        // Option complète : refetch la notification avec l'alerte et son sender.

        // Pour la simplicité, renvoyons la notification mise à jour. Le client devra peut-être rafraîchir.
        res.status(200).json({
            message: 'Notification marquée comme lue.',
            notification: updatedNotification // Contient les champs de la notification, mais pas l'objet 'alert' imbriqué avec 'sender'
                                        // Pour une meilleure UX, le client devrait mettre à jour son état local.
        });

    } catch (error) {
        console.error("[Alerts Controller] Erreur dans markAsRead:", error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2025') {
                 return res.status(404).json({ message: "Notification non trouvée pour être mise à jour." });
            }
            // Gérer d'autres erreurs Prisma spécifiques si nécessaire
        }
        next(error);
    }
};

export const markAllAsRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authenticatedUser = req.user as unknown as AuthenticatedUser;

        await prisma.notifications.updateMany({
            where: {
                user_id: authenticatedUser.id,
                is_read: false
            },
            data: {
                is_read: true,
                status: 'READ' // TODO: Verify 'READ' is a valid NotificationStatus enum value in schema
            }
        });

        res.status(200).json({ message: "Toutes les notifications ont été marquées comme lues." });
    } catch (error) {
        console.error("[Alerts Controller] Erreur dans markAllAsRead:", error);
        next(error);
    }
};

export const deleteAlert = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { alertId } = req.params;
    const authenticatedUser = req.user as unknown as AuthenticatedUser;

        // Ajout d'une vérification pour alertId
        if (!alertId || isNaN(parseInt(alertId))) {
            console.log(`[Alerts Controller] deleteAlert: Tentative de suppression avec alertId invalide: ${alertId}`);
            return res.status(400).json({ message: "L'ID de l'alerte est requis et doit être un nombre valide." });
        }
        const numericAlertId = parseInt(alertId);

        const alert = await prisma.alerts.findUnique({
        where: { id: numericAlertId } // Utiliser numericAlertId
    });

        if (!alert) {
            console.log(`[Alerts Controller] deleteAlert: Alerte non trouvée avec ID: ${numericAlertId}`);
            return res.status(404).json({ message: "Alerte non trouvée." });
        }

        // Comportement:
    // - Si l'utilisateur est l'émetteur de l'alerte ou admin: suppression globale de l'alerte + notifications
    // - Sinon (ex: agent régional/secteur, chasseur/guide destinataire): suppression seulement de SA notification liée à cette alerte
    const isSender = alert.sender_id === authenticatedUser.id;
    // Normaliser le rôle pour comparer proprement (enum ou string possible)
    const rawRoleVal = (authenticatedUser as any).role;
    const roleNormalized = typeof rawRoleVal === 'string'
      ? rawRoleVal.toLowerCase().replace(/-/g, '_')
      : String(rawRoleVal).toLowerCase().replace(/-/g, '_');
    const isAdmin = roleNormalized === 'admin';

    if (isSender || isAdmin) {
        console.log(`[Alerts Controller] deleteAlert: Suppression globale par user ${authenticatedUser.id} (sender/admin) pour alerte ${numericAlertId}`);
        await prisma.notifications.deleteMany({ where: { alert_id: numericAlertId } });
        await prisma.alerts.delete({ where: { id: numericAlertId } });
        return res.status(200).json({ message: "Alerte et notifications associées supprimées avec succès." });
    }

    // Suppression locale: retirer uniquement la notification de l'utilisateur courant
    console.log(`[Alerts Controller] deleteAlert: Suppression locale de la notification pour user ${authenticatedUser.id} et alerte ${numericAlertId}`);
    const deleted = await prisma.notifications.deleteMany({
        where: { alert_id: numericAlertId, user_id: authenticatedUser.id }
    });

    // Si aucune notification supprimée, retourner 404 pour clarté
    if ((deleted as any).count === 0) {
        return res.status(404).json({ message: "Notification non trouvée pour cet utilisateur et cette alerte." });
    }
    return res.status(200).json({ message: "Notification supprimée pour cet utilisateur." });
  } catch (error) {
    console.error("[Alerts Controller] Erreur dans deleteAlert:", error);
    next(error);
  }
};
