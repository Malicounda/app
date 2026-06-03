/**
 * SuperAdmin Communications Routes
 * Provides full access to all alerts and messages across the system.
 */
import { Router, Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { isAuthenticated } from './middlewares/auth.middleware.js';
import { db } from '../db.js';
import { alerts, messages, notifications, users, agents, rolesMetier, superAdmins } from '../../shared/schema.js';

const router = Router();

// Guard: only super admins
async function requireSuperAdmin(req: Request, res: Response): Promise<boolean> {
  const user = (req as any).user;
  if (!user?.id) {
    res.status(401).json({ message: 'Non authentifié' });
    return false;
  }
  const rows = await db
    .select({ id: superAdmins.userId })
    .from(superAdmins)
    .where(eq(superAdmins.userId, user.id))
    .limit(1);
  if (!rows.length) {
    res.status(403).json({ message: 'Accès réservé au Super Admin' });
    return false;
  }
  return true;
}

// ─── GET /api/superadmin/comms/alerts ─────────────────────────────────────
// Returns ALL alerts with sender info, agent grade, role métier, service location
router.get('/alerts', isAuthenticated, async (req: Request, res: Response) => {
  try {
    if (!(await requireSuperAdmin(req, res))) return;

    const rows: any[] = await db.execute(sql`
      SELECT
        a.id,
        a.title,
        a.message,
        a.nature,
        a.region,
        a.departement,
        a.arrondissement,
        a.commune,
        a.zone,
        a.lat,
        a.lon,
        a.is_read,
        a.created_at,
        a.updated_at,
        a.sender_id,
        u.username        AS sender_username,
        u.first_name      AS sender_first_name,
        u.last_name       AS sender_last_name,
        u.email           AS sender_email,
        u.phone           AS sender_phone,
        u.role            AS sender_role,
        u.region          AS sender_region,
        u.departement     AS sender_departement,
        u.commune         AS sender_commune,
        u.arrondissement  AS sender_arrondissement,
        u.matricule       AS sender_matricule,
        u.service_location AS sender_service_location,
        ag.grade          AS sender_grade,
        ag.genre          AS sender_genre,
        rm.label_fr       AS sender_role_metier,
        rm.code           AS sender_role_metier_code
      FROM alerts a
      LEFT JOIN users u ON u.id = a.sender_id
      LEFT JOIN agents ag ON ag.user_id = u.id
      LEFT JOIN roles_metier rm ON rm.id = ag.role_metier_id
      ORDER BY a.created_at DESC
      LIMIT 2000
    ` as any);

    const result = (rows || []).map((r: any) => ({
      id: r.id,
      title: r.title,
      message: r.message,
      nature: r.nature,
      region: r.region,
      departement: r.departement,
      arrondissement: r.arrondissement,
      commune: r.commune,
      zone: r.zone,
      lat: r.lat,
      lon: r.lon,
      isRead: r.is_read,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      senderId: r.sender_id,
      sender: {
        username: r.sender_username,
        firstName: r.sender_first_name,
        lastName: r.sender_last_name,
        email: r.sender_email,
        phone: r.sender_phone,
        role: r.sender_role,
        region: r.sender_region,
        departement: r.sender_departement,
        commune: r.sender_commune,
        arrondissement: r.sender_arrondissement,
        matricule: r.sender_matricule,
        serviceLocation: r.sender_service_location,
        grade: r.sender_grade,
        genre: r.sender_genre,
        roleMetier: r.sender_role_metier,
        roleMetierCode: r.sender_role_metier_code,
      },
    }));

    res.json(result);
  } catch (error) {
    console.error('[SuperAdmin Comms] Erreur dans GET /alerts:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── DELETE /api/superadmin/comms/alerts/:id ──────────────────────────────
// Hard delete an alert and all its notifications
router.delete('/alerts/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    if (!(await requireSuperAdmin(req, res))) return;

    const alertId = Number(req.params.id);
    if (!Number.isFinite(alertId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    // Delete notifications first (FK)
    await db.delete(notifications as any).where(eq(notifications.alertId as any, alertId));
    // Delete the alert
    await db.delete(alerts as any).where(eq(alerts.id as any, alertId));

    res.json({ message: 'Alerte supprimée définitivement' });
  } catch (error) {
    console.error('[SuperAdmin Comms] Erreur dans DELETE /alerts/:id:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── GET /api/superadmin/comms/messages ───────────────────────────────────
// Returns ALL messages with sender & recipient info, agent details
router.get('/messages', isAuthenticated, async (req: Request, res: Response) => {
  try {
    if (!(await requireSuperAdmin(req, res))) return;

    const rows: any[] = await db.execute(sql`
      SELECT
        m.id,
        m.subject,
        m.content,
        m.type,
        m.is_read,
        m.read_at,
        m.created_at,
        m.updated_at,
        m.parent_message_id,
        m.attachment_path,
        m.attachment_name,
        m.attachment_mime,
        m.attachment_size,
        m.sender_id,
        m.recipient_id,
        -- Sender info
        su.username        AS sender_username,
        su.first_name      AS sender_first_name,
        su.last_name       AS sender_last_name,
        su.role            AS sender_role,
        su.region          AS sender_region,
        su.departement     AS sender_departement,
        su.matricule       AS sender_matricule,
        su.service_location AS sender_service_location,
        sa.grade           AS sender_grade,
        srm.label_fr       AS sender_role_metier,
        -- Recipient info
        ru.username        AS recipient_username,
        ru.first_name      AS recipient_first_name,
        ru.last_name       AS recipient_last_name,
        ru.role            AS recipient_role,
        ru.region          AS recipient_region,
        ru.departement     AS recipient_departement,
        ru.matricule       AS recipient_matricule,
        ru.service_location AS recipient_service_location,
        ra.grade           AS recipient_grade,
        rrm.label_fr       AS recipient_role_metier
      FROM messages m
      LEFT JOIN users su ON su.id = m.sender_id
      LEFT JOIN agents sa ON sa.user_id = su.id
      LEFT JOIN roles_metier srm ON srm.id = sa.role_metier_id
      LEFT JOIN users ru ON ru.id = m.recipient_id
      LEFT JOIN agents ra ON ra.user_id = ru.id
      LEFT JOIN roles_metier rrm ON rrm.id = ra.role_metier_id
      WHERE m.deleted_at IS NULL AND m.deleted_at_sender IS NULL
      ORDER BY m.created_at DESC
      LIMIT 2000
    ` as any);

    const result = (rows || []).map((r: any) => ({
      id: r.id,
      subject: r.subject,
      content: r.content,
      type: r.type,
      isRead: r.is_read,
      readAt: r.read_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      parentMessageId: r.parent_message_id,
      attachment: r.attachment_path ? {
        path: r.attachment_path,
        name: r.attachment_name,
        mime: r.attachment_mime,
        size: r.attachment_size,
      } : null,
      sender: {
        id: r.sender_id,
        username: r.sender_username,
        firstName: r.sender_first_name,
        lastName: r.sender_last_name,
        role: r.sender_role,
        region: r.sender_region,
        departement: r.sender_departement,
        matricule: r.sender_matricule,
        serviceLocation: r.sender_service_location,
        grade: r.sender_grade,
        roleMetier: r.sender_role_metier,
      },
      recipient: {
        id: r.recipient_id,
        username: r.recipient_username,
        firstName: r.recipient_first_name,
        lastName: r.recipient_last_name,
        role: r.recipient_role,
        region: r.recipient_region,
        departement: r.recipient_departement,
        matricule: r.recipient_matricule,
        serviceLocation: r.recipient_service_location,
        grade: r.recipient_grade,
        roleMetier: r.recipient_role_metier,
      },
    }));

    res.json(result);
  } catch (error) {
    console.error('[SuperAdmin Comms] Erreur dans GET /messages:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── DELETE /api/superadmin/comms/messages/:id ────────────────────────────
// Hard delete a message from the database
router.delete('/messages/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    if (!(await requireSuperAdmin(req, res))) return;

    const messageId = Number(req.params.id);
    if (!Number.isFinite(messageId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    await db.delete(messages as any).where(eq(messages.id as any, messageId));

    res.json({ message: 'Message supprimé définitivement' });
  } catch (error) {
    console.error('[SuperAdmin Comms] Erreur dans DELETE /messages/:id:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

export default router;
