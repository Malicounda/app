import { and, eq, sql } from 'drizzle-orm';
import { NextFunction, Request, Response } from 'express';
import { agents, alerts, notifications, rolesMetier, users } from '../../shared/schema.js';
import { db } from '../db.js';
import { resolveAdministrativeAreas } from '../lib/resolveAdminAreas.js';
const DEBUG_LOGS = process.env.DEBUG_GEO === '1';

// Enum pour les rôles utilisateur (équivalent Prisma)
enum user_role {
  admin = 'admin',
  hunter = 'hunter',
  agent = 'agent',
  sub_agent = 'sub-agent',
  hunting_guide = 'hunting-guide'
}

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
  if (DEBUG_LOGS) console.debug(`[resolveRegionDeptFromCoords] Résolution pour lat=${lat}, lon=${lon}`);
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
        if (DEBUG_LOGS) console.debug(`[resolveRegionDeptFromCoords] Dép./Rég. (lon,lat): dep=${depJoinRows[0]?.departement ?? 'AUCUN'}, reg=${depJoinRows[0]?.region ?? 'AUCUNE'}`);

        // 2) Fallback inversion lat/lon si non trouvé
        if (depJoinRows.length === 0) {
            if (DEBUG_LOGS) console.debug(`[resolveRegionDeptFromCoords] Tentative inversion lat/lon pour dép./rég.`);
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
                if (DEBUG_LOGS) console.debug(`[resolveRegionDeptFromCoords] Dép./Rég. après inversion: dep=${arr[0]?.departement}, reg=${arr[0]?.region}`);
            }
        }

        const departement = depJoinRows[0]?.departement ?? null;
        const region = depJoinRows[0]?.region ?? null;
        if (DEBUG_LOGS) console.log(`[resolveRegionDeptFromCoords] RÉSULTAT FINAL: département="${departement}", région="${region}"`);
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

        // Normaliser le rôle
        const rawRole = (authenticatedUser as any)?.role;
        const roleStr = typeof rawRole === 'string' ? rawRole.toLowerCase() : String(rawRole).toLowerCase();
        const normalizedRole = roleStr.replace(/-/g, '_');

        // Construire WHERE avec SQL brut (évite incompatibilités Drizzle)
        const conditions: any[] = [];

        // Base: alertes géolocalisées
        conditions.push(sql`((a.lat IS NOT NULL AND a.lon IS NOT NULL) OR (a.zone IS NOT NULL))`);

        // Règles d'accès: chasseurs/guides voient seulement leurs propres alertes
        if (normalizedRole === 'hunter' || normalizedRole === 'hunting_guide') {
            conditions.push(sql`a.sender_id = ${authenticatedUser.id}`);
        }

        // Filtre nature optionnel
        if (nature && typeof nature === 'string') {
            conditions.push(sql`a.nature = ${nature}`);
        }

        // Filtres de date optionnels
        if (from) {
            const fromIso = new Date(from).toISOString();
            conditions.push(sql`a.created_at >= ${fromIso}`);
        }
        if (to) {
            const toIso = new Date(to).toISOString();
            conditions.push(sql`a.created_at <= ${toIso}`);
        }

        const whereClause = conditions.length > 0 ? sql.join(conditions, sql` AND `) : sql`TRUE`;

        const alertColumns = {
          id: alerts.id as any,
          title: alerts.title as any,
          message: alerts.message as any,
          nature: alerts.nature as any,
          region: alerts.region as any,
          zone: alerts.zone as any,
          lat: alerts.lat as any,
          lon: alerts.lon as any,
          departement: alerts.departement as any,
          senderId: alerts.senderId as any,
          isRead: alerts.isRead as any,
          createdAt: alerts.createdAt as any,
          updatedAt: alerts.updatedAt as any
        };

        // Utiliser SQL brut directement (plus fiable avec Drizzle 0.33.0)
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
              a.arrondissement,
              a.commune,
              a.created_at,
              a.sender_id,
              u.first_name, u.last_name, u.phone, u.role, u.region AS user_region, u.departement AS user_departement
            FROM alerts a
            LEFT JOIN users u ON u.id = a.sender_id
            WHERE ${whereClause}
            ORDER BY a.created_at DESC, a.id DESC
        ` as any);

        console.log(`[getMapAlerts] SQL returned ${rows.length} alerts before mapping`);

        const items: any[] = (rows || [])
            .map((a: any) => {
                // Priorité: nouvelles colonnes lat/lon
                let latVal: number | null = a.lat ?? null;
                let lonVal: number | null = a.lon ?? null;
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
                    departement: a.departement ?? null,
                    arrondissement: a.arrondissement ?? null,
                    commune: a.commune ?? null,
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

        console.log(`[getMapAlerts] After mapping/filtering: ${items.length} alerts with valid coords`);

        console.log(`[getMapAlerts] Final response: ${items.length} alerts for user ${authenticatedUser.id} (${normalizedRole})`);
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

// PrismaClient supprimé - utilisation de Drizzle ORM

// Types simplifiés pour les réponses
interface UserBasicInfo {
    id: number;
    username: string;
    first_name: string | null;
    last_name: string | null;
    role: user_role;
    region: string | null;
    departement: string | null;
    grade?: string | null;
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

        const rawTitle = typeof title === 'string' ? title.trim() : '';

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


        // Normaliser le rôle (uniformiser les comparaisons)
        const rawRole = (authenticatedUser as any)?.role;
        const roleStr = typeof rawRole === 'string' ? rawRole.toLowerCase() : String(rawRole).toLowerCase();
        const normalizedRole = roleStr.replace(/-/g, '_'); // 'sub-agent' -> 'sub_agent'

        // Vérifier si l'utilisateur a le droit d'envoyer des alertes
        // Utiliser des rôles NORMALISÉS pour éviter les mismatchs ('sub-agent' vs 'sub_agent')
        const allowedSenderRoles = new Set<string>(['admin', 'agent', 'sub_agent', 'hunter', 'hunting_guide']);

        // Vérifier les rôles autorisés (comparaison sur la version normalisée)
        if (!allowedSenderRoles.has(normalizedRole)) {
            console.warn('[Alerts Controller] createAlert denied due to role:', { rawRole, normalizedRole, userId: authenticatedUser.id });
            return res.status(403).json({ message: "Vous n'êtes pas autorisé à créer des alertes." });
        }

        // Restriction: chasseurs et guides ne peuvent envoyer que des messages de nature 'autre'.
        const natureToPersist = (normalizedRole === 'hunter' || normalizedRole === 'hunting_guide')
            ? 'autre'
            : nature;

        const titleToPersist = rawTitle !== '' ? rawTitle : `Alerte: ${natureToPersist}`;

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

        // Vérification de doublon: même nature, même titre et position (rayon variable selon nature),
        // même si l'expéditeur est différent. Retourner des détails utiles au frontend.
        if (lat !== null && lon !== null) {
            try {
                // Rayon par nature
                let radiusMeters = 5; // par défaut pour 'autre' / information
                switch ((natureToPersist || '').toLowerCase()) {
                    case 'trafic-bois':
                        radiusMeters = 20; break;
                    case 'feux_de_brousse':
                        radiusMeters = 500; break;
                    case 'braconnage':
                        radiusMeters = 10; break;
                    default:
                        radiusMeters = 5; break;
                }
                const existingRows = await db.execute(sql`
                    SELECT a.id, a.sender_id, a.created_at, a.region AS alert_region, a.departement AS alert_departement
                    FROM alerts a
                    WHERE a.nature = ${natureToPersist}
                      AND a.title = ${titleToPersist}
                      AND ST_DWithin(
                            ST_SetSRID(ST_MakePoint(a.lon, a.lat), 4326)::geography,
                            ST_SetSRID(ST_MakePoint(${lon!}, ${lat!}), 4326)::geography,
                            ${radiusMeters}
                        )
                    ORDER BY a.created_at DESC
                    LIMIT 1
                `);

                if (Array.isArray(existingRows) && existingRows.length > 0) {
                    const existing = existingRows[0] as { id?: number; sender_id?: number; created_at?: Date };
                    const isSelf = Number(existing?.sender_id) === Number(authenticatedUser.id);
                    let senderDetail: any = null;
                    if (existing?.sender_id) {
                        try {
                            const senderRows = await db.execute(sql`
                                SELECT u.id, u.username, u.first_name, u.last_name, u.role, u.region, u.departement
                                FROM users u
                                WHERE u.id = ${existing.sender_id}
                                LIMIT 1
                            `);
                            senderDetail = Array.isArray(senderRows) && senderRows[0] ? senderRows[0] : null;
                        } catch {}
                    }
                    return res.status(409).json({
                        message: `Une alerte identique a déjà été enregistrée dans un rayon de ${radiusMeters} mètres.`,
                        code: isSelf ? "ALERT_DUPLICATE_SELF" : "ALERT_DUPLICATE",
                        alertId: existing?.id ?? null,
                        createdAt: existing?.created_at ?? null,
                        self: isSelf,
                        sender: senderDetail,
                        alertRegion: (existing as any)?.alert_region ?? null,
                        alertDepartement: (existing as any)?.alert_departement ?? null,
                        radiusMeters
                    });
                }
            } catch (e) {
                console.warn('[Alerts Controller] Échec de la vérification de doublon d\'alerte:', e);
            }
        }

        let alertArrondissement: string | null = null;
        let alertCommune: string | null = null;
        try {
            if (lat !== null && lon !== null) {
                const areas = await resolveAdministrativeAreas(lat, lon);
                console.log('[createAlert] Administrative areas resolved', { lat, lon, areas });
                alertArrondissement = areas.arrondissement ?? null;
                alertCommune = areas.commune ?? null;
                if (!alertDepartement && areas.departement) {
                    alertDepartement = areas.departement;
                }
                if (!regionName && areas.region) {
                    regionName = areas.region;
                }
            }
        } catch (err) {
            console.error('[createAlert] resolveAdministrativeAreas failed', { lat, lon, err });
        }

        // Créer l'alerte dans la base de données: conserver la région telle quelle (avec accents/casse) pour l'affichage.
        const [newAlert] = await db.insert(alerts as any).values({
            title: titleToPersist,
            message: message,
            nature: natureToPersist,
            senderId: authenticatedUser.id,
            region: regionName || alertRegion,
            arrondissement: alertArrondissement,
            commune: alertCommune,
            departement: alertDepartement || null,
            zone: zoneFromCoords,
            lat: lat!,
            lon: lon!,
            isRead: false,
            createdAt: new Date(),
            updatedAt: new Date()
        }).returning();

        // Récupérer les informations de l'utilisateur créateur
        const senderUserColumns = {
          id: users.id as any,
          username: users.username as any,
          firstName: users.firstName as any,
          lastName: users.lastName as any,
          role: users.role as any,
          region: users.region as any,
          departement: users.departement as any
        };

        const [senderUser] = await db.select(senderUserColumns as any).from(users as any).where(eq(users.id as any, authenticatedUser.id)).limit(1);

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
            const candidates = await db.select({ id: users.id as any, region: users.region as any })
                .from(users as any)
                .where(eq(users.role as any, 'agent'));
            regionalAgents = candidates.filter(u => normalize(u.region) === normEffectiveRegion)
                                       .map(u => ({ id: u.id }));
        }

        // 2) Agents de secteur du département de l'alerte (si dispo)
        let sectorAgents: { id: number }[] = [];
        if (normAlertDepartement) {
            const candidates = await db.select({ id: users.id as any, departement: users.departement as any })
                .from(users as any)
                .where(eq(users.role as any, 'sub-agent'));
            sectorAgents = candidates.filter(u => normalize(u.departement) === normAlertDepartement)
                                     .map(u => ({ id: u.id }));
        }

        // 2bis) Rôles métier superviseur: recevoir les alertes de leur zone (région + département)
        let supervisorUsers: { id: number }[] = [];
        if (normEffectiveRegion || normAlertDepartement) {
            const candidates = await db
                .select({
                    id: users.id as any,
                    region: users.region as any,
                    departement: users.departement as any,
                })
                .from(users as any)
                .innerJoin(agents as any, eq(agents.userId as any, users.id as any))
                .innerJoin(rolesMetier as any, eq(rolesMetier.id as any, agents.roleMetierId as any))
                .where(and(eq((rolesMetier as any).isSupervisor as any, true as any), eq(users.isActive as any, true as any)) as any);

            supervisorUsers = candidates
                .filter((u: any) => {
                    const okRegion = normEffectiveRegion ? normalize(u.region) === normEffectiveRegion : false;
                    const okDept = normAlertDepartement ? normalize(u.departement) === normAlertDepartement : false;
                    return okRegion || okDept;
                })
                .map((u: any) => ({ id: u.id }));
        }

        // 2ter) Roles metier par defaut (isDefaultRole): recevoir les alertes de leur zone
        let defaultRoleUsers: { id: number }[] = [];
        if (normEffectiveRegion || normAlertDepartement) {
            const candidates = await db
                .select({
                    id: users.id as any,
                    region: users.region as any,
                    departement: users.departement as any,
                })
                .from(users as any)
                .innerJoin(agents as any, eq(agents.userId as any, users.id as any))
                .innerJoin(rolesMetier as any, eq(rolesMetier.id as any, agents.roleMetierId as any))
                .where(and(eq((rolesMetier as any).isDefault as any, true as any), eq(users.isActive as any, true as any)) as any);

            defaultRoleUsers = candidates
                .filter((u: any) => {
                    const okRegion = normEffectiveRegion ? normalize(u.region) === normEffectiveRegion : false;
                    const okDept = normAlertDepartement ? normalize(u.departement) === normAlertDepartement : false;
                    return okRegion || okDept;
                })
                .map((u: any) => ({ id: u.id }));
        }

        // 3) Admins: toujours inclus comme destinataires
        let admins: { id: number }[] = [];
        admins = await db.select({ id: users.id as any })
            .from(users as any)
            .where(eq(users.role as any, 'admin'));

        // Fusionner, dedupliquer, et exclure l'emetteur
        const recipientMap = new Map<number, true>();
        for (const r of [...regionalAgents, ...sectorAgents, ...supervisorUsers, ...defaultRoleUsers, ...admins]) {
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
                supervisorUsers: supervisorUsers.length,
                defaultRoleUsers: defaultRoleUsers.length,
                admins: admins.length,
                totalUnique: recipients.length,
            }
        });

        if (recipients.length > 0) {
            const alertTitle = String(newAlert.title || 'Sans titre');
            const notificationMessage = `Nouvelle alerte "${alertTitle.substring(0, 50)}${alertTitle.length > 50 ? '...' : ''}" dans la région ${newAlert.region || 'N/A'}.`;

            // Création des notifications une par une pour une meilleure gestion des erreurs
            for (const recipient of recipients) {
                try {
                    await db.insert(notifications as any).values({
                        userId: recipient.id,
                        alertId: newAlert.id,
                        message: notificationMessage,
                        isRead: false,
                        type: 'ALERT',
                        status: 'NON_LU',
                        createdAt: new Date(),
                        updatedAt: new Date()
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
            id: newAlert.id as number,
            title: (newAlert.title as string) || '',
            message: (newAlert.message as string) || '',
            nature: (newAlert.nature as string) || '',
            region: newAlert.region,
            zone: newAlert.zone,
            departement: newAlert.departement ?? null,
            is_read: newAlert.isRead ?? false,
            created_at: newAlert.createdAt,
            updated_at: newAlert.updatedAt,
            sender_id: newAlert.senderId,
            type: 'info', // Type par défaut pour une nouvelle alerte, le client peut l'interpréter
            sender: senderUser ? {
                id: senderUser.id,
                username: senderUser.username,
                first_name: senderUser.firstName || null,
                last_name: senderUser.lastName || null,
                role: senderUser.role as user_role,
                region: senderUser.region,
                departement: senderUser.departement
            } : {
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
        console.error("[Alerts Controller] Erreur dans deleteAlert:", error);
        next(error);
    }
};

// Récupérer les destinataires (notifications) d'une alerte spécifique
export const getAlertRecipients = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authenticatedUser = req.user as unknown as AuthenticatedUser;
        if (!authenticatedUser || !authenticatedUser.id) {
            return res.status(403).json({ message: "Utilisateur non authentifié." });
        }
        const rawRoleVal = (authenticatedUser as any).role;
        const roleNormalized = typeof rawRoleVal === 'string' ? rawRoleVal.toLowerCase().replace(/-/g, '_') : String(rawRoleVal).toLowerCase().replace(/-/g, '_');
        // Restreindre l'accès aux profils de supervision
        if (!['admin','agent','sub_agent'].includes(roleNormalized)) {
            return res.status(403).json({ message: "Accès refusé." });
        }

        const { alertId } = req.params;
        if (!alertId || isNaN(parseInt(alertId))) {
            return res.status(400).json({ message: "alertId invalide" });
        }
        const aid = parseInt(alertId);

        const rows: any[] = await db.execute(sql`
            SELECT n.id, n.user_id, n.alert_id, n.is_read, n.created_at,
                   u.first_name, u.last_name, u.role, u.region, u.departement
            FROM notifications n
            JOIN users u ON u.id = n.user_id
            WHERE n.alert_id = ${aid}
            ORDER BY u.role, u.region, u.departement, u.last_name, u.first_name
        ` as any);

        const recipients = (rows || []).map(r => ({
            id: r.id,
            is_read: !!r.is_read,
            created_at: r.created_at,
            user: {
                id: r.user_id,
                first_name: r.first_name ?? null,
                last_name: r.last_name ?? null,
                role: r.role ?? null,
                region: r.region ?? null,
                departement: r.departement ?? null,
            }
        }));

        res.status(200).json(recipients);
    } catch (error) {
        console.error('[Alerts Controller] Erreur dans getAlertRecipients:', error);
        next(error);
    }
};

// Récupérer les destinataires sur une période, groupé par alerte
export const getRecipients = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authenticatedUser = req.user as unknown as AuthenticatedUser;
        if (!authenticatedUser || !authenticatedUser.id) {
            return res.status(403).json({ message: "Utilisateur non authentifié." });
        }
        const rawRoleVal = (authenticatedUser as any).role;
        const roleNormalized = typeof rawRoleVal === 'string' ? rawRoleVal.toLowerCase().replace(/-/g, '_') : String(rawRoleVal).toLowerCase().replace(/-/g, '_');
        if (!['admin','agent','sub_agent'].includes(roleNormalized)) {
            return res.status(403).json({ message: "Accès refusé." });
        }

        const { from, to, nature } = req.query as { from?: string; to?: string; nature?: string };
        const conditions: any[] = [];
        if (from) conditions.push(sql`a.created_at >= ${new Date(from)}`);
        if (to) conditions.push(sql`a.created_at <= ${new Date(to)}`);
        if (nature && typeof nature === 'string' && nature.trim() !== '') {
            conditions.push(sql`a.nature = ${nature}`);
        }
        const whereClause = conditions.length ? sql.join(conditions, sql` AND `) : sql`TRUE`;

        const rows: any[] = await db.execute(sql`
            SELECT a.id AS alert_id, a.nature, a.region, a.departement, a.created_at AS alert_created_at,
                   n.id AS notif_id, n.is_read, n.created_at AS notif_created_at,
                   u.id AS user_id, u.first_name, u.last_name, u.role, u.region AS user_region, u.departement AS user_departement
            FROM alerts a
            JOIN notifications n ON n.alert_id = a.id
            JOIN users u ON u.id = n.user_id
            WHERE ${whereClause}
            ORDER BY a.created_at DESC, a.id DESC, u.role, u.region, u.departement
        ` as any);

        const byAlert = new Map<number, any>();
        for (const r of (rows || [])) {
            const key = Number(r.alert_id);
            if (!byAlert.has(key)) {
                byAlert.set(key, {
                    alert_id: key,
                    nature: r.nature ?? null,
                    region: r.region ?? null,
                    departement: r.departement ?? null,
                    created_at: r.alert_created_at ?? null,
                    recipients: [] as any[]
                });
            }
            byAlert.get(key).recipients.push({
                id: r.notif_id,
                is_read: !!r.is_read,
                created_at: r.notif_created_at,
                user: {
                    id: r.user_id,
                    first_name: r.first_name ?? null,
                    last_name: r.last_name ?? null,
                    role: r.role ?? null,
                    region: r.user_region ?? null,
                    departement: r.user_departement ?? null,
                }
            });
        }
        res.status(200).json(Array.from(byAlert.values()));
    } catch (error) {
        console.error('[Alerts Controller] Erreur dans getRecipients:', error);
        next(error);
    }
};

export const getReceivedAlerts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authenticatedUser = req.user as AuthenticatedUser;
        if (!authenticatedUser || !authenticatedUser.id) {
            return res.status(403).json({ message: "Utilisateur non authentifié." });
        // ... (rest of the code remains the same)
        }

        // On s'appuie uniquement sur les notifications créées côté création d'alerte.
        // Aucune restriction supplémentaire par rôle ici: l'inbox reflète exactement les notifications.

        // Toujours restreindre aux notifications de l'utilisateur authentifié
        const notificationsWhere = {
            user_id: authenticatedUser.id,
        } as any;

        // Utiliser SQL brut pour les jointures complexes
        const notificationsFromDb: any[] = await db.execute(sql`
            SELECT
                n.id, n.user_id, n.alert_id, n.message, n.type, n.status, n.is_read, n.created_at,
                a.id as alert_id_full, a.title, a.message as alert_message, a.nature, a.region, a.zone,
                a.lat, a.lon, a.departement, a.sender_id, a.created_at as alert_created_at, a.updated_at as alert_updated_at,
                u.id as sender_id_full, u.username, u.first_name, u.last_name, u.role, u.region as sender_region, u.departement as sender_departement,
                ag.grade as sender_grade
            FROM notifications n
            LEFT JOIN alerts a ON n.alert_id = a.id
            LEFT JOIN users u ON a.sender_id = u.id
            LEFT JOIN agents ag ON ag.user_id = u.id
            WHERE n.user_id = ${authenticatedUser.id}
            ORDER BY n.created_at DESC
        ` as any);

        // Restructurer les données SQL en objets imbriqués
        const notificationsWithAlerts = notificationsFromDb.map(n => ({
            id: n.id,
            user_id: n.user_id,
            alert_id: n.alert_id,
            message: n.message,
            type: n.type,
            status: n.status,
            is_read: n.is_read,
            created_at: n.created_at,
            // updated_at non sélectionné dans la requête SQL, on laisse à null
            updated_at: null,
            alert: n.alert_id_full ? {
                id: n.alert_id_full,
                title: n.title,
                message: n.alert_message,
                nature: n.nature,
                region: n.region,
                zone: n.zone,
                lat: n.lat,
                lon: n.lon,
                departement: n.departement,
                sender_id: n.sender_id,
                created_at: n.alert_created_at,
                updated_at: n.alert_updated_at,
                users: n.sender_id_full ? {
                    id: n.sender_id_full,
                    username: n.username,
                    first_name: n.first_name,
                    last_name: n.last_name,
                    role: n.role,
                    region: n.sender_region,
                    departement: n.sender_departement,
                    grade: n.sender_grade
                } : null
            } : null
        }));

        // Filtrer les notifications pour ne garder que celles avec une alerte associée non nulle
        const validNotifications = notificationsWithAlerts.filter(notif => {
            return notif.alert !== null && notif.alert !== undefined;
        });

        const responseNotifications: NotificationResponse[] = await Promise.all(validNotifications.map(async (notif) => {
            let alertResponse: AlertResponse | undefined = undefined;
            if (notif.alert) {
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

                // Recalcul depuis coordonnées
                if (latNum != null && lonNum != null) {
                    const resolved = await resolveRegionDeptFromCoords(latNum, lonNum);
                    computedRegion = resolved.region;
                    computedDept = resolved.departement;
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
                        grade: ((notif.alert as any).users as any).grade || null,
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

        // Construire la requête avec jointure si nécessaire
        let sentAlertsFromDb: any[];

        if (authenticatedUser.role === user_role.admin) {
            // Pour les admins, joindre avec users et filtrer par rôle agent
            sentAlertsFromDb = await db.execute(sql`
                SELECT a.id, a.title, a.message, a.nature, a.region, a.zone,
                       a.lat, a.lon, a.departement, a.sender_id, a.is_read,
                       a.created_at, a.updated_at,
                       u.username, u.first_name, u.last_name, u.role,
                       u.region as user_region, u.departement as user_departement
                FROM alerts a
                LEFT JOIN users u ON a.sender_id = u.id
                WHERE u.role = 'agent'
                ORDER BY a.created_at DESC
                LIMIT 100
            ` as any);
        } else {
            // Pour les autres utilisateurs, filtrer par sender_id
            sentAlertsFromDb = await db.execute(sql`
                SELECT a.id, a.title, a.message, a.nature, a.region, a.zone,
                       a.lat, a.lon, a.departement, a.sender_id, a.is_read,
                       a.created_at, a.updated_at,
                       u.username, u.first_name, u.last_name, u.role,
                       u.region as user_region, u.departement as user_departement
                FROM alerts a
                LEFT JOIN users u ON a.sender_id = u.id
                WHERE a.sender_id = ${authenticatedUser.id}
                ORDER BY a.created_at DESC
                LIMIT 100
            ` as any);
        }

        // Restructurer les données SQL en objets imbriqués
        const alertsWithUsers = sentAlertsFromDb.map(a => ({
            id: a.id,
            title: a.title,
            message: a.message,
            nature: a.nature,
            region: a.region,
            zone: a.zone,
            lat: a.lat,
            lon: a.lon,
            departement: a.departement,
            sender_id: a.sender_id,
            created_at: a.created_at,
            updated_at: a.updated_at,
            users: a.sender_id ? {
                id: a.sender_id,
                username: a.username,
                first_name: a.first_name,
                last_name: a.last_name,
                role: a.role,
                region: a.user_region,
                departement: a.user_departement
            } : null
        }));

        const responseAlerts: AlertResponse[] = await Promise.all(alertsWithUsers.map(async (alert) => {
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

            // Recalcul depuis coordonnées
            if (latNum != null && lonNum != null) {
                const resolved = await resolveRegionDeptFromCoords(latNum, lonNum);
                computedRegion = resolved.region;
                computedDept = resolved.departement;
            }

            // Lire les accusés de lecture (notifications lues) pour cette alerte
            let readByRoles: string[] = [];
            try {
                const readers: any[] = await db.execute(sql`
                    SELECT u.role
                    FROM notifications n
                    JOIN users u ON n.user_id = u.id
                    WHERE n.alert_id = ${alertData.id} AND n.is_read = true
                ` as any);
                const roleSet = new Set<string>();
                for (const r of readers) {
                    const raw = (r as any)?.role;
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

        // Trouver et mettre à jour la notification en une seule requête
        const updatedNotifications = await db.update(notifications as any)
            .set({ isRead: true, status: 'READ', updatedAt: new Date() })
            .where(and(
                eq(notifications.alertId as any, parseInt(alertId)),
                eq(notifications.userId as any, authenticatedUser.id)
            ))
            .returning();

        if (!updatedNotifications || updatedNotifications.length === 0) {
            console.log(`[Alerts Controller] markAsRead: Notification non trouvée pour alertId: ${alertId}, userId: ${authenticatedUser.id}`);
            return res.status(404).json({ message: "Notification non trouvée pour cette alerte et cet utilisateur." });
        }

        const updatedNotification = updatedNotifications[0];

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
        // Gestion d'erreur générique (Prisma remplacé par Drizzle)
        next(error);
    }
};

export const markAllAsRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authenticatedUser = req.user as unknown as AuthenticatedUser;

        await db.update(notifications as any)
            .set({ isRead: true, status: 'READ', updatedAt: new Date() })
            .where(and(
                eq(notifications.userId as any, authenticatedUser.id),
                eq(notifications.isRead as any, false)
            ));

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

        const alertColumnsForDelete = {
          id: alerts.id as any,
          senderId: alerts.senderId as any
        };

        const alertResults = await db.select(alertColumnsForDelete as any).from(alerts as any).where(eq(alerts.id as any, numericAlertId)).limit(1);
        const alert = alertResults[0];

        if (!alert) {
            console.log(`[Alerts Controller] deleteAlert: Alerte non trouvée avec ID: ${numericAlertId}`);
            return res.status(404).json({ message: "Alerte non trouvée." });
        }

        // Comportement:
    // - Si l'utilisateur est l'émetteur de l'alerte ou admin: suppression globale de l'alerte + notifications
    // - Sinon (ex: agent régional/secteur, chasseur/guide destinataire): suppression seulement de SA notification liée à cette alerte
    const senderId = Number((alert as any).senderId ?? (alert as any).sender_id);
    const userId = Number((authenticatedUser as any).id);
    const isSender = Number.isFinite(senderId) && Number.isFinite(userId) && senderId === userId;
    // Normaliser le rôle pour comparer proprement (enum ou string possible)
    const rawRoleVal = (authenticatedUser as any).role;
    const roleNormalized = typeof rawRoleVal === 'string'
      ? rawRoleVal.toLowerCase().replace(/-/g, '_')
      : String(rawRoleVal).toLowerCase().replace(/-/g, '_');
    const isAdmin = roleNormalized === 'admin';

    // Logs détaillés pour diagnostic
    console.log(`[Alerts Controller] deleteAlert DEBUG:`, {
        alertId: numericAlertId,
        alertSenderId: senderId,
        currentUserId: userId,
        currentUserRole: roleNormalized,
        isSender,
        isAdmin,
        willDoGlobalDelete: isSender || isAdmin,
        alertObject: alert
    });

    if (isSender || isAdmin) {
        console.log(`[Alerts Controller] deleteAlert: Suppression globale par user ${authenticatedUser.id} (sender/admin) pour alerte ${numericAlertId}`);
        await db.delete(notifications as any).where(eq(notifications.alertId as any, numericAlertId));
        await db.delete(alerts as any).where(eq(alerts.id as any, numericAlertId));
        return res.status(200).json({ message: "Alerte et notifications associées supprimées avec succès." });
    }

    // Suppression locale: retirer uniquement la notification de l'utilisateur courant
    console.log(`[Alerts Controller] deleteAlert: Suppression locale de la notification pour user ${authenticatedUser.id} et alerte ${numericAlertId}`);
    const deleted = await db
        .delete(notifications as any)
        .where(and(
            eq(notifications.alertId as any, numericAlertId),
            eq(notifications.userId as any, authenticatedUser.id)
        ))
        .returning({ id: notifications.id as any });

    // Si aucune notification supprimée, retourner 404 pour clarté
    if (!deleted || deleted.length === 0) {
        return res.status(404).json({ message: "Notification non trouvée pour cet utilisateur et cette alerte." });
    }
    return res.status(200).json({ message: "Notification supprimée pour cet utilisateur." });
  } catch (error) {
    console.error("[Alerts Controller] Erreur dans deleteAlert:", error);
    next(error);
  }
};
