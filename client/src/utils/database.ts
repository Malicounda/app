// Script d'initialisation de la base de données SQLite pour Android
import { invoke } from '@tauri-apps/api/core';

export async function initializeDatabase() {
  try {
    // Créer la base de données SQLite
    await invoke('plugin:sql|execute', {
      db: 'scodipp.db',
      query: `
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'agent',
          nom TEXT NOT NULL,
          prenom TEXT NOT NULL,
          telephone TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `
    });

    // Créer la table des permis
    await invoke('plugin:sql|execute', {
      db: 'scodipp.db',
      query: `
        CREATE TABLE IF NOT EXISTS permis (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          numero TEXT UNIQUE NOT NULL,
          type TEXT NOT NULL,
          espece TEXT NOT NULL,
          quantite INTEGER NOT NULL,
          zone TEXT NOT NULL,
          date_debut DATE NOT NULL,
          date_fin DATE NOT NULL,
          statut TEXT DEFAULT 'en_attente',
          agent_id INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (agent_id) REFERENCES users (id)
        )
      `
    });

    // Créer la table des zones de chasse
    await invoke('plugin:sql|execute', {
      db: 'scodipp.db',
      query: `
        CREATE TABLE IF NOT EXISTS zones_chasse (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nom TEXT NOT NULL,
          description TEXT,
          superficie REAL,
          coordonnees TEXT,
          statut TEXT DEFAULT 'active',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `
    });

    // Créer la table des espèces
    await invoke('plugin:sql|execute', {
      db: 'scodipp.db',
      query: `
        CREATE TABLE IF NOT EXISTS especes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nom TEXT NOT NULL,
          nom_scientifique TEXT,
          description TEXT,
          statut TEXT DEFAULT 'active',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `
    });

    // Table outbox (synchronisation offline)
    await invoke('plugin:sql|execute', {
      db: 'scodipp.db',
      query: `
        CREATE TABLE IF NOT EXISTS outbox (
          id TEXT PRIMARY KEY,
          created_at INTEGER NOT NULL,
          entity TEXT NOT NULL,
          action TEXT NOT NULL,
          payload TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          last_error TEXT,
          retry_count INTEGER NOT NULL DEFAULT 0,
          next_retry_at INTEGER,
          server_id TEXT
        )
      `
    });

    // Table settings (utilisée par le service de sync)
    await invoke('plugin:sql|execute', {
      db: 'scodipp.db',
      query: `
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `
    });

    // Insérer des données par défaut
    await insertDefaultData();

    console.log('Base de données initialisée avec succès');
    return true;
  } catch (error) {
    console.error('Erreur lors de l\'initialisation de la base de données:', error);
    return false;
  }
}

async function insertDefaultData() {
  // Insérer un utilisateur admin par défaut
  await invoke('plugin:sql|execute', {
    db: 'scodipp.db',
    query: `
      INSERT OR IGNORE INTO users (email, password, role, nom, prenom, telephone)
      VALUES ('admin@scodipp.sn', 'admin123', 'admin', 'Administrateur', 'SCoDiPP', '+221 76 290 88 93')
    `
  });

  // Insérer des espèces par défaut
  const especes = [
    { nom: 'Gazelle', nom_scientifique: 'Gazella dorcas' },
    { nom: 'Phacochère', nom_scientifique: 'Phacochoerus africanus' },
    { nom: 'Buffle', nom_scientifique: 'Syncerus caffer' },
    { nom: 'Éléphant', nom_scientifique: 'Loxodonta africana' },
    { nom: 'Lion', nom_scientifique: 'Panthera leo' }
  ];

  for (const espece of especes) {
    await invoke('plugin:sql|execute', {
      db: 'scodipp.db',
      query: `
        INSERT OR IGNORE INTO especes (nom, nom_scientifique)
        VALUES (?, ?)
      `,
      args: [espece.nom, espece.nom_scientifique]
    });
  }

  // Insérer des zones de chasse par défaut
  const zones = [
    { nom: 'Zone Nord', description: 'Zone de chasse du Nord du Sénégal' },
    { nom: 'Zone Sud', description: 'Zone de chasse du Sud du Sénégal' },
    { nom: 'Zone Est', description: 'Zone de chasse de l\'Est du Sénégal' },
    { nom: 'Zone Ouest', description: 'Zone de chasse de l\'Ouest du Sénégal' }
  ];

  for (const zone of zones) {
    await invoke('plugin:sql|execute', {
      db: 'scodipp.db',
      query: `
        INSERT OR IGNORE INTO zones_chasse (nom, description)
        VALUES (?, ?)
      `,
      args: [zone.nom, zone.description]
    });
  }
}

export async function getDatabaseConnection() {
  return {
    db: 'scodipp.db',
    execute: (query: string, args: any[] = []) =>
      invoke('plugin:sql|execute', { db: 'scodipp.db', query, args }),
    select: (query: string, args: any[] = []) =>
      invoke('plugin:sql|select', { db: 'scodipp.db', query, args })
  };
}
