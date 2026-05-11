// Service de migration des données pour Android
import { getDatabaseConnection } from '../utils/database';

export interface MigrationData {
  users: any[];
  permis: any[];
  regions: any[];
  zones: any[];
  especes: any[];
  // Ajoutez d'autres tables selon vos besoins
}

export class DataMigrationService {
  async initDatabase() {
    const db = await getDatabaseConnection();

    // Créer toutes les tables nécessaires
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        nom TEXT,
        prenom TEXT,
        telephone TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS permis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        espece TEXT NOT NULL,
        quantite INTEGER NOT NULL,
        zone TEXT NOT NULL,
        date_debut TEXT NOT NULL,
        date_fin TEXT NOT NULL,
        agent_id INTEGER NOT NULL,
        statut TEXT DEFAULT 'en_attente',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS regions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL,
        code TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS zones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL,
        code TEXT NOT NULL UNIQUE,
        region_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (region_id) REFERENCES regions (id)
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS especes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL,
        nom_scientifique TEXT,
        statut TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insérer des données par défaut
    await this.insertDefaultData();
  }

  async insertDefaultData() {
    const db = await getDatabaseConnection();

    // Vérifier si des données existent déjà
    const userCount = await db.select('SELECT COUNT(*) as count FROM users') as any[];
    if (userCount[0].count > 0) {
      console.log('Données déjà présentes, migration ignorée');
      return;
    }

    // Insérer un utilisateur admin par défaut
    await db.execute(
      'INSERT INTO users (email, password, role, nom, prenom, telephone) VALUES (?, ?, ?, ?, ?, ?)',
      ['admin@scodipp.sn', 'admin123', 'admin', 'Administrateur', 'SCoDiPP', '221123456789']
    );

    // Insérer des régions par défaut
    const regions = [
      { nom: 'Dakar', code: 'DK' },
      { nom: 'Thiès', code: 'TH' },
      { nom: 'Diourbel', code: 'DB' },
      { nom: 'Fatick', code: 'FK' },
      { nom: 'Kaolack', code: 'KL' },
      { nom: 'Kolda', code: 'KD' },
      { nom: 'Ziguinchor', code: 'ZG' },
      { nom: 'Louga', code: 'LG' },
      { nom: 'Saint-Louis', code: 'SL' },
      { nom: 'Matam', code: 'MT' },
      { nom: 'Tambacounda', code: 'TC' },
      { nom: 'Kédougou', code: 'KG' },
      { nom: 'Sédhiou', code: 'SE' },
      { nom: 'Kaffrine', code: 'KF' }
    ];

    for (const region of regions) {
      await db.execute(
        'INSERT INTO regions (nom, code) VALUES (?, ?)',
        [region.nom, region.code]
      );
    }

    // Insérer des espèces par défaut
    const especes = [
      { nom: 'Lion', nom_scientifique: 'Panthera leo', statut: 'Vulnérable' },
      { nom: 'Éléphant', nom_scientifique: 'Loxodonta africana', statut: 'En danger' },
      { nom: 'Gazelle', nom_scientifique: 'Gazella dorcas', statut: 'Préoccupation mineure' },
      { nom: 'Phacochère', nom_scientifique: 'Phacochoerus africanus', statut: 'Préoccupation mineure' },
      { nom: 'Buffle', nom_scientifique: 'Syncerus caffer', statut: 'Préoccupation mineure' }
    ];

    for (const espece of especes) {
      await db.execute(
        'INSERT INTO especes (nom, nom_scientifique, statut) VALUES (?, ?, ?)',
        [espece.nom, espece.nom_scientifique, espece.statut]
      );
    }

    console.log('Données par défaut insérées avec succès');
  }

  async migrateFromServer(serverData: MigrationData) {
    const db = await getDatabaseConnection();

    try {
      // Migrer les utilisateurs
      if (serverData.users && serverData.users.length > 0) {
        for (const user of serverData.users) {
          await db.execute(
            'INSERT OR REPLACE INTO users (id, email, password, role, nom, prenom, telephone) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [user.id, user.email, user.password || 'password', user.role, user.nom, user.prenom, user.telephone]
          );
        }
      }

      // Migrer les permis
      if (serverData.permis && serverData.permis.length > 0) {
        for (const permis of serverData.permis) {
          await db.execute(
            'INSERT OR REPLACE INTO permis (id, numero, type, espece, quantite, zone, date_debut, date_fin, agent_id, statut) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [permis.id, permis.numero, permis.type, permis.espece, permis.quantite, permis.zone, permis.date_debut, permis.date_fin, permis.agent_id, permis.statut || 'en_attente']
          );
        }
      }

      // Migrer les régions
      if (serverData.regions && serverData.regions.length > 0) {
        for (const region of serverData.regions) {
          await db.execute(
            'INSERT OR REPLACE INTO regions (id, nom, code) VALUES (?, ?, ?)',
            [region.id, region.nom, region.code]
          );
        }
      }

      // Migrer les zones
      if (serverData.zones && serverData.zones.length > 0) {
        for (const zone of serverData.zones) {
          await db.execute(
            'INSERT OR REPLACE INTO zones (id, nom, code, region_id) VALUES (?, ?, ?, ?)',
            [zone.id, zone.nom, zone.code, zone.region_id]
          );
        }
      }

      // Migrer les espèces
      if (serverData.especes && serverData.especes.length > 0) {
        for (const espece of serverData.especes) {
          await db.execute(
            'INSERT OR REPLACE INTO especes (id, nom, nom_scientifique, statut) VALUES (?, ?, ?, ?)',
            [espece.id, espece.nom, espece.nom_scientifique, espece.statut]
          );
        }
      }

      console.log('Migration des données terminée avec succès');
      return { success: true };
    } catch (error) {
      console.error('Erreur lors de la migration:', error);
      return { success: false, error: 'Erreur lors de la migration des données' };
    }
  }

  async exportData(): Promise<MigrationData> {
    const db = await getDatabaseConnection();

    try {
      const users = await db.select('SELECT * FROM users') as any[];
      const permis = await db.select('SELECT * FROM permis') as any[];
      const regions = await db.select('SELECT * FROM regions') as any[];
      const zones = await db.select('SELECT * FROM zones') as any[];
      const especes = await db.select('SELECT * FROM especes') as any[];

      return {
        users,
        permis,
        regions,
        zones,
        especes
      };
    } catch (error) {
      console.error('Erreur lors de l\'export des données:', error);
      throw error;
    }
  }
}
