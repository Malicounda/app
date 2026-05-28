import postgres from "postgres";

const getDatabaseUrl = () => {
  const host = process.env.PGHOST || "localhost";
  const port = process.env.PGPORT || "5432";
  const user = process.env.PGUSER || "admin";
  const password = process.env.PGPASSWORD || "password";
  const database = process.env.PGDATABASE || "scodipp_db";
  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
};

async function debugMessageCounts() {
  const sql = postgres(getDatabaseUrl());

  try {
    console.log("🔍 DEBUG: Comptage des messages non lus\n");

    // 1. Tous les messages individuels
    const allIndividual = await sql`
      SELECT COUNT(*) as total FROM messages
    `;
    console.log("1️⃣ TOUS les messages individuels:", allIndividual[0].total);

    // 2. Messages individuels NON lus
    const unreadIndividual = await sql`
      SELECT COUNT(*) as total FROM messages
      WHERE is_read = false AND deleted_at IS NULL
    `;
    console.log("2️⃣ Messages individuels NON lus (is_read=false, deleted_at=NULL):", unreadIndividual[0].total);

    // 3. Messages individuels lus
    const readIndividual = await sql`
      SELECT COUNT(*) as total FROM messages
      WHERE is_read = true AND deleted_at IS NULL
    `;
    console.log("3️⃣ Messages individuels LUS (is_read=true, deleted_at=NULL):", readIndividual[0].total);

    // 4. Messages individuels supprimés
    const deletedIndividual = await sql`
      SELECT COUNT(*) as total FROM messages
      WHERE deleted_at IS NOT NULL
    `;
    console.log("4️⃣ Messages individuels SUPPRIMÉS (deleted_at NOT NULL):", deletedIndividual[0].total);

    // 5. Détail par utilisateur
    console.log("\n📊 Détail par USER (recipient):");
    const byUser = await sql`
      SELECT
        recipient_id,
        COUNT(*) as total,
        SUM(CASE WHEN is_read = false THEN 1 ELSE 0 END) as unread,
        SUM(CASE WHEN is_read = true THEN 1 ELSE 0 END) as read_count,
        SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) as deleted
      FROM messages
      GROUP BY recipient_id
      ORDER BY total DESC
      LIMIT 20
    `;

    byUser.forEach((row, idx) => {
      console.log(`  User ${row.recipient_id}: ${row.total} total | ${row.unread} unread | ${row.read_count} lus | ${row.deleted} supprimés`);
    });

    // 6. Messages de groupe
    console.log("\n📋 Messages de groupe:");
    const groupCount = await sql`
      SELECT COUNT(*) as total FROM group_messages
    `;
    console.log("Total des messages de groupe:", groupCount[0].total);

    // 7. Vérifier la table group_message_reads
    const groupReads = await sql`
      SELECT COUNT(*) as total FROM group_message_reads
    `;
    console.log("Lectures de groupe enregistrées:", groupReads[0].total);

    // 8. Messages de groupe non lus par user
    console.log("\n📖 Messages de groupe non lus par user:");
    const unreadGroups = await sql`
      SELECT
        gm.id,
        gm.title,
        COUNT(DISTINCT CASE WHEN gmr.user_id IS NULL THEN 1 END) as unread_count
      FROM group_messages gm
      LEFT JOIN group_message_reads gmr ON gm.id = gmr.message_id
      GROUP BY gm.id, gm.title
      HAVING COUNT(DISTINCT CASE WHEN gmr.user_id IS NULL THEN 1 END) > 0
      LIMIT 10
    `;

    if (unreadGroups.length > 0) {
      unreadGroups.forEach(row => {
        console.log(`  Groupe "${row.title}": ${row.unread_count} non lus`);
      });
    } else {
      console.log("  Aucun message de groupe non lu");
    }

    console.log("\n✅ Analyse complète!");

  } catch (error: any) {
    console.error("❌ Erreur:", error.message);
  } finally {
    await sql.end();
  }
}

debugMessageCounts();
