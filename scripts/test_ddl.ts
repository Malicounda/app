import postgres from 'postgres';

const databaseUrl = 'postgresql://postgres.botmsymjatdnizqtneoi:jesuisN0ir%4014@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true';

async function main() {
  console.log('Connecting to database...');
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    console.log('Running ensureUnitsTables DDL...');
    await sql`
      CREATE TABLE IF NOT EXISTS units (
        id SERIAL PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        label TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS code_item_units_config (
        item_id INTEGER PRIMARY KEY REFERENCES code_infraction_items(id) ON DELETE CASCADE,
        mode TEXT NOT NULL CHECK (mode IN ('choices','fixed')),
        allowed TEXT[],
        fixed TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log('ensureUnitsTables DDL done.');

    console.log('Running ensureSaisieTables DDL...');
    await sql`
      CREATE TABLE IF NOT EXISTS saisie_groups (
        id SERIAL PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        label TEXT NOT NULL,
        color TEXT DEFAULT 'red-light',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS saisie_items (
        id SERIAL PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        label TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        quantity_enabled BOOLEAN DEFAULT FALSE,
        unit_mode TEXT NOT NULL DEFAULT 'none' CHECK (unit_mode IN ('none','fixed','choices','free')),
        unit_fixed_key TEXT,
        unit_allowed TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await sql`
      ALTER TABLE saisie_items
      ADD COLUMN IF NOT EXISTS group_key TEXT NULL REFERENCES saisie_groups(key) ON UPDATE CASCADE ON DELETE SET NULL;
    `;
    console.log('ensureSaisieTables DDL done.');

  } catch (err: any) {
    console.error('❌ Error executing DDL:', err);
  }

  await sql.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
});
