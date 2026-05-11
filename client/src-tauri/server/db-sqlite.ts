import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'fs';
import path from 'path';
import * as schema from '../shared/dist/schema.js';

let db: any = null;

export async function initDatabase() {
  try {
    // Chemin vers la base de données dans le répertoire de l'app
    const dbDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbPath = path.join(dbDir, 'scodipp.db');

    const sqlite = new Database(dbPath);
    db = drizzle(sqlite, { schema });

    console.log('✅ Base de données SQLite initialisée:', dbPath);
    return db;
  } catch (error) {
    console.error('❌ Erreur initialisation SQLite:', error);
    throw error;
  }
}

export function getDatabase() {
  if (!db) {
    throw new Error('Base de données non initialisée');
  }
  return db;
}

// Migration automatique des tables
export async function migrateDatabase() {
  if (!db) return;

  // Créer les tables si elles n'existent pas
  const createTables = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      matricule TEXT,
      service_location TEXT,
      region TEXT,
      departement TEXT,
      agent_lat REAL,
      agent_lon REAL,
      role TEXT DEFAULT 'user',
      hunter_id INTEGER,
      is_active BOOLEAN DEFAULT 1,
      is_suspended BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS hunters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      date_of_birth DATE,
      id_number TEXT UNIQUE NOT NULL,
      phone TEXT,
      address TEXT,
      experience TEXT,
      profession TEXT,
      category TEXT,
      pays TEXT,
      nationality TEXT,
      region TEXT,
      departement TEXT,
      weapon_type TEXT,
      weapon_brand TEXT,
      weapon_reference TEXT,
      weapon_caliber TEXT,
      weapon_other_details TEXT,
      is_active BOOLEAN DEFAULT 1,
      is_minor BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Ajouter d'autres tables selon vos besoins
  `;

  db.exec(createTables);
  console.log('✅ Migration de la base de données terminée');
}
