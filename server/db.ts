import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../shared/schema.js";
import { getDatabaseUrl, getConfigFilePath } from './config.js';

console.log("🔌 Initialisation de la connexion PostgreSQL...");

// Obtenir l'URL depuis le fichier de configuration
let connectionString: string;
try {
  connectionString = getDatabaseUrl();
  console.log(`📁 Fichier de configuration : ${getConfigFilePath()}`);
} catch (error) {
  console.error("❌ Erreur lors du chargement de la configuration:", error);
  throw new Error(
    "Impossible de charger la configuration de la base de données. " +
    "Vérifiez le fichier db-config.json"
  );
}

// Créer la connexion avec gestion d'erreur améliorée
const client = postgres(connectionString, { 
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {}, // Ignorer les notices PostgreSQL
  prepare: false, // Désactiver les prepared statements pour éviter les problèmes d'encodage
  transform: {
    undefined: null, // Convertir undefined en null
  },
});

// Tester la connexion au démarrage
(async () => {
  try {
    await client`SELECT 1 as test`;
    console.log("✅ Connexion PostgreSQL établie avec succès");
  } catch (error: any) {
    console.error("❌ Erreur de connexion PostgreSQL:", error.message);
    console.error("\n⚠️  Vérifiez que :");
    console.error("   1. PostgreSQL est démarré");
    console.error("   2. Les paramètres dans db-config.json sont corrects");
    console.error(`   3. La base de données existe : ${connectionString.split('/').pop()?.split('?')[0]}`);
    console.error(`\n📁 Fichier de configuration : ${getConfigFilePath()}`);
  }
})();

// Drizzle ORM instance (utilisé ailleurs dans le projet)
export const db = drizzle(client, { schema });

// Interface de compatibilité de type "pg.Pool" pour les contrôleurs existants qui appellent db.query(sql, params)
export const pg = {
  query: async (text: string, params?: any[]) => {
    // La lib 'postgres' accepte un SQL + tableau de paramètres via .unsafe
    const rows = await client.unsafe(text, params as any);
    return { rows } as { rows: any[] };
  },
};