import { db } from '../server/db.js';
import { users } from '../shared/schema.js';

async function run() {
  try {
    console.log("Querying all users...");
    const allUsers = await db.select({
      id: users.id,
      username: users.username,
      role: users.role,
      isSuperAdmin: users.isSuperAdmin,
    }).from(users);
    console.log("Total users:", allUsers.length);
    console.log("Users:", allUsers);
  } catch (err) {
    console.error("Query failed:", err);
  }
  process.exit(0);
}

run();
