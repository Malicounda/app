import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

// Chemin du fichier de configuration
const getConfigPath = (): string => {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    // En développement, utiliser le fichier à la racine du projet
    return path.join(process.cwd(), 'db-config.json');
  }

  // En production, utiliser AppData
  const appData = process.env.APPDATA || process.env.HOME || process.cwd();
  const configDir = path.join(appData, 'SCoDiPP');

  // Créer le dossier si nécessaire
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
    console.log(`✓ Dossier de configuration créé : ${configDir}`);
  }

  return path.join(configDir, 'db-config.json');
};

// Configuration par défaut
const defaultConfig: DatabaseConfig = {
  host: 'localhost',
  port: 5432,
  database: 'scodipp_db',
  user: 'admin',
  password: 'password'
};

// Charger ou créer la configuration
export const loadDatabaseConfig = (): DatabaseConfig => {
  const configPath = getConfigPath();

  try {
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configData);
      console.log(`✓ Configuration chargée depuis : ${configPath}`);
      return config;
    } else {
      // Créer le fichier avec la config par défaut
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
      console.log(`✓ Configuration par défaut créée : ${configPath}`);
      console.log(`⚠️  Veuillez modifier ce fichier avec vos paramètres PostgreSQL`);
      return defaultConfig;
    }
  } catch (error) {
    console.error('❌ Erreur lors du chargement de la configuration:', error);
    console.log('📍 Utilisation de la configuration par défaut');
    return defaultConfig;
  }
};

// Sauvegarder la configuration
export const saveDatabaseConfig = (config: DatabaseConfig): void => {
  const configPath = getConfigPath();
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`✓ Configuration sauvegardée : ${configPath}`);
  } catch (error) {
    console.error('❌ Erreur lors de la sauvegarde de la configuration:', error);
    throw error;
  }
};

// Obtenir l'URL de connexion PostgreSQL
// PRIORITÉ : DATABASE_URL (variable d'environnement) > db-config.json (fichier local)
export const getDatabaseUrl = (): string => {
  // 1. Priorité absolue : variable d'environnement DATABASE_URL (Render, Supabase, etc.)
  if (process.env.DATABASE_URL) {
    console.log(`✅ Connexion PostgreSQL via DATABASE_URL (variable d'environnement)`);
    return process.env.DATABASE_URL;
  }

  // 2. Fallback : fichier de configuration local (développement / app bureau)
  const config = loadDatabaseConfig();

  // Encoder le mot de passe pour gérer les caractères spéciaux
  const encodedPassword = encodeURIComponent(config.password);

  const url = `postgresql://${config.user}:${encodedPassword}@${config.host}:${config.port}/${config.database}`;

  // Afficher l'info de connexion (sans le mot de passe)
  console.log(`📍 Connexion PostgreSQL : ${config.user}@${config.host}:${config.port}/${config.database}`);

  return url;
};

// Obtenir le chemin du fichier de configuration (pour l'afficher à l'utilisateur)
export const getConfigFilePath = (): string => {
  return getConfigPath();
};

// Vérifier si la configuration existe
export const configExists = (): boolean => {
  return fs.existsSync(getConfigPath());
};
