import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

function generateReferenceNumber(date: Date = new Date()): string {
  const year = date.getFullYear();
  // 7 alphanumeric characters (A-Z, 0-9)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomStr = '';
  for (let i = 0; i < 7; i++) {
    randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `REF${year}-${randomStr}`;
}

async function migrate() {
  console.log("Début de la migration des numéros de référence...");

  try {
    // 1. Ajouter la colonne si elle n'existe pas
    console.log("1. Ajout de la colonne reference_number...");
    await db.execute(sql`
      ALTER TABLE permit_requests 
      ADD COLUMN IF NOT EXISTS reference_number varchar(50);
    `);
    console.log("Colonne ajoutée ou déjà existante.");

    // 2. Récupérer toutes les demandes existantes
    console.log("2. Génération des numéros pour les demandes existantes...");
    const requestsResult = await db.execute(sql`
      SELECT id, created_at FROM permit_requests WHERE reference_number IS NULL OR reference_number = '';
    `);
    
    const requests = Array.isArray(requestsResult) ? requestsResult : (requestsResult as any)?.rows ?? [];
    
    if (requests.length === 0) {
      console.log("Aucune demande nécessitant une mise à jour n'a été trouvée.");
    } else {
      console.log(`${requests.length} demandes trouvées. Mise à jour en cours...`);
      let updatedCount = 0;
      
      for (const req of requests as any[]) {
        const refNumber = generateReferenceNumber(new Date(req.created_at || Date.now()));
        await db.execute(sql`
          UPDATE permit_requests 
          SET reference_number = ${refNumber} 
          WHERE id = ${req.id}
        `);
        updatedCount++;
        if (updatedCount % 10 === 0) {
          console.log(`Progression : ${updatedCount}/${requests.length}`);
        }
      }
      console.log(`Mise à jour terminée ! ${updatedCount} demandes mises à jour.`);
    }

    console.log("Migration terminée avec succès.");
    process.exit(0);
  } catch (error) {
    console.error("Erreur pendant la migration:", error);
    process.exit(1);
  }
}

migrate();
