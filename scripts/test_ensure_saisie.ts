import { pg as db } from '../server/db.js';

const ensureUnitsTables = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS units (
      id SERIAL PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      label TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
};

const ensureSaisieTables = async () => {
  console.log('Ensuring units tables...');
  await ensureUnitsTables();
  console.log('Ensuring saisie_groups table...');
  await db.query(`
    CREATE TABLE IF NOT EXISTS saisie_groups (
      id SERIAL PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      label TEXT NOT NULL,
      color TEXT DEFAULT 'red-light',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('Ensuring saisie_items table...');
  await db.query(`
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
  `);
  console.log('Altering saisie_items table...');
  await db.query(`
    ALTER TABLE saisie_items
    ADD COLUMN IF NOT EXISTS group_key TEXT NULL REFERENCES saisie_groups(key) ON UPDATE CASCADE ON DELETE SET NULL;
  `);
};

async function main() {
  console.log('Starting ensureSaisieTables test...');
  try {
    await ensureSaisieTables();
    console.log('✅ Success! DDL executed fine.');
  } catch (err: any) {
    console.error('❌ DDL failed:', err);
  }
}

main().catch(console.error);
