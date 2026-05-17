import { db } from '../db.js';
import { storage } from '../storage.js';
import { agents, rolesMetier, users } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

async function main() {
  try {
    const identifier = '618834/D';
    const password = '';
    const domain = 'ALERTE';

    console.log('1. Searching user by identifier:', identifier);
    const user = await storage.findUserByIdentifier(identifier);
    console.log('Found user:', JSON.stringify(user, null, 2));

    if (!user) {
      console.log('User not found!');
      return;
    }

    console.log('2. Checking metier roles in agentRows...');
    const agentRows = await db
        .select({
            roleMetierId: agents.roleMetierId,
            roleMetierCode: rolesMetier.code,
            roleMetierLabel: rolesMetier.labelFr,
            roleMetierIsDefault: rolesMetier.isDefault,
            roleMetierIsSupervisor: rolesMetier.isSupervisor,
        })
        .from(agents)
        .leftJoin(rolesMetier, eq(agents.roleMetierId as any, rolesMetier.id as any))
        .where(eq(agents.userId as any, (user as any).id as any))
        .limit(1);

    console.log('agentRows:', JSON.stringify(agentRows, null, 2));

    let userRoleMetierCode: string | null = null;
    let userRoleMetierLabel: string | null = null;
    let isSupervisorRole = false;
    let isDefaultRole = false;
    let skipPassword = false;

    if (agentRows.length > 0) {
        userRoleMetierCode = agentRows[0].roleMetierCode ?? null;
        userRoleMetierLabel = agentRows[0].roleMetierLabel ?? null;
        isDefaultRole = agentRows[0].roleMetierIsDefault ?? false;
        isSupervisorRole = agentRows[0].roleMetierIsSupervisor ?? false;

        const passwordEmpty = !password || String(password).trim() === '';
        const isAlerteLogin = domain.toUpperCase().trim() === 'ALERTE';

        console.log('passwordEmpty:', passwordEmpty);
        console.log('isAlerteLogin:', isAlerteLogin);

        if (passwordEmpty && (isAlerteLogin || isSupervisorRole)) {
            skipPassword = true;
            if (isAlerteLogin && !isSupervisorRole) {
                isDefaultRole = true;
            }
            console.log('skipPassword is set to true!');
        }
    }

    console.log('3. Checking active flags...');
    if ((user as any).active === false || (user as any).isActive === false) {
        console.log('User is inactive! skipPassword:', skipPassword);
    }

    console.log('4. Checking superadmin status...');
    const isSuperAdmin = await storage.isSuperAdmin(user.id);
    console.log('isSuperAdmin:', isSuperAdmin);

    console.log('5. Updating last login...');
    await storage.updateUser(user.id, { lastLogin: new Date() } as any);
    const refreshed = await storage.getUser(user.id);
    console.log('refreshed user lastLogin:', refreshed?.lastLogin);

    console.log('6. Normalizing role...');
    const normalizedRole = String((user as any).role || '')
        .toLowerCase()
        .replace(/_/g, '-');
    console.log('normalizedRole:', normalizedRole);

    console.log('7. Generating token payload...');
    const tokenPayload: any = {
        id: user.id,
        role: String((user as any).role || ''),
        region: (user as any).region,
        isSuperAdmin,
    };
    if ((user as any).hunterId) {
        tokenPayload.hunterId = (user as any).hunterId;
    }

    console.log('8. Generating auth token...');
    const token = storage.generateAuthToken(tokenPayload);
    console.log('Token generated:', token ? 'YES' : 'NO');

    console.log('9. Querying grade and genre...');
    const rows = await db
        .select({
            grade: agents.grade,
            genre: agents.genre,
            roleMetierCode: rolesMetier.code,
            roleMetierLabel: rolesMetier.labelFr,
        })
        .from(agents)
        .leftJoin(rolesMetier, eq(agents.roleMetierId as any, rolesMetier.id as any))
        .where(eq(agents.userId as any, (user as any).id as any))
        .limit(1);

    console.log('Agent extra rows:', JSON.stringify(rows, null, 2));
    console.log('SUCCESS!');
  } catch (err: any) {
    console.error('ERROR OCCURRED:', err);
  }
  process.exit(0);
}

main();
