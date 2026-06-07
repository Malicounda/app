import { db } from '../server/db.js';
import { eq } from 'drizzle-orm';
import { messages, users, superAdmins } from '../shared/schema.js';

async function run() {
  try {
    console.log("Querying message 129...");
    const [msg] = await db.select().from(messages).where(eq(messages.id, 129));
    if (!msg) {
      console.log("Message 129 not found in DB!");
    } else {
      console.log("Message 129 found:", {
        id: msg.id,
        senderId: msg.senderId,
        recipientId: msg.recipientId,
        domaineId: msg.domaineId,
        content: msg.content ? msg.content.substring(0, 50) : null,
        attachmentName: msg.attachmentName,
        attachmentMime: msg.attachmentMime,
      });
    }

    console.log("\nQuerying all superadmins in DB...");
    const sas = await db.select().from(superAdmins);
    console.log("Superadmins table content:", sas);

    console.log("\nQuerying users with isSuperAdmin = true or superadmin role...");
    const adminUsers = await db.select({
      id: users.id,
      username: users.username,
      role: users.role,
      isSuperAdmin: users.isSuperAdmin,
    }).from(users).where(eq(users.isSuperAdmin, true));
    console.log("Users with isSuperAdmin = true:", adminUsers);

    const roleAdminUsers = await db.select({
      id: users.id,
      username: users.username,
      role: users.role,
      isSuperAdmin: users.isSuperAdmin,
    }).from(users).where(eq(users.role, 'superadmin'));
    console.log("Users with role = superadmin:", roleAdminUsers);

  } catch (err) {
    console.error("Query failed:", err);
  }
  process.exit(0);
}

run();
