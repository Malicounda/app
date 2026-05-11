/**
 * Backfill script: Create missing notifications for supervisors and default-role users
 * for all existing alerts that match their zone (region/departement).
 *
 * Run: npx tsx server/scripts/backfill-notifications.ts
 */
import { eq } from 'drizzle-orm';
import { agents, alerts, notifications, rolesMetier, users } from '../../shared/schema.js';
import { db } from '../db.js';

const normalize = (s: string | null | undefined): string => {
  if (!s) return '';
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
};

async function main() {
  console.log('[backfill] Starting...');

  // 1. Get all supervisor + default-role users with their zone info
  const metierUsers = await db
    .select({
      id: users.id,
      region: users.region,
      departement: users.departement,
      isSupervisor: (rolesMetier as any).isSupervisor,
      isDefault: (rolesMetier as any).isDefault,
    })
    .from(users)
    .innerJoin(agents, eq(agents.userId as any, users.id as any))
    .innerJoin(rolesMetier, eq(rolesMetier.id as any, agents.roleMetierId as any))
    .where(eq(users.isActive as any, true as any) as any);

  const supervisors = metierUsers.filter((u: any) => u.isSupervisor);
  const defaultRoles = metierUsers.filter((u: any) => u.isDefault);
  console.log(`[backfill] Found ${supervisors.length} supervisors, ${defaultRoles.length} default-role users`);

  // 2. Get all alerts with region/departement
  const allAlerts = await db
    .select({ id: alerts.id, region: alerts.region, departement: alerts.departement })
    .from(alerts);

  console.log(`[backfill] Found ${allAlerts.length} alerts to process`);
  allAlerts.forEach(a => console.log(`  alert id=${a.id} region="${a.region}" dept="${a.departement}"`));
  supervisors.forEach((s: any) => console.log(`  supervisor id=${s.id} region="${s.region}" dept="${s.departement}"`));
  defaultRoles.forEach((d: any) => console.log(`  defaultRole id=${d.id} region="${d.region}" dept="${d.departement}"`));

  // 3. Get existing notifications to avoid duplicates
  const existingNotifs = await db
    .select({ userId: notifications.userId, alertId: notifications.alertId })
    .from(notifications);
  const existingSet = new Set(existingNotifs.map((n: any) => `${n.userId}-${n.alertId}`));

  // 4. For each alert, find matching supervisors/default-role users and create missing notifications
  let created = 0;
  for (const alert of allAlerts) {
    const normRegion = normalize(alert.region);
    const normDept = normalize(alert.departement);

    const targetUsers = [...supervisors, ...defaultRoles].filter((u: any) => {
      const okRegion = normRegion ? normalize(u.region) === normRegion : false;
      const okDept = normDept ? normalize(u.departement) === normDept : false;
      return okRegion || okDept;
    });

    for (const u of targetUsers) {
      const key = `${u.id}-${alert.id}`;
      if (existingSet.has(key)) continue;

      try {
        await db.insert(notifications as any).values({
          userId: u.id,
          alertId: alert.id,
          message: `Alerte dans la région ${alert.region || 'N/A'}.`,
          isRead: false,
          type: 'ALERT',
          status: 'NON_LU',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        existingSet.add(key);
        created++;
      } catch (err: any) {
        // Ignore duplicate key errors
        if (!String(err?.message || '').includes('duplicate') && !String(err?.code || '').includes('23505')) {
          console.error(`[backfill] Error creating notif for user ${u.id}, alert ${alert.id}:`, err?.message);
        }
      }
    }
  }

  console.log(`[backfill] Done. Created ${created} missing notifications.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[backfill] Fatal error:', err);
  process.exit(1);
});
