import { db } from './db.ts';
import { sql } from 'drizzle-orm/sql';
import fs from 'fs';
import path from 'path';

async function checkZoneAttachments() {
  try {
    console.log('=== DIAGNOSTIC DES PIÈCES JOINTES ===');

    // Vérifier les données dans la table zones
    const rows = await db.execute(sql`
      SELECT id, name, attachments, responsible_photo
      FROM zones
      WHERE attachments IS NOT NULL OR responsible_photo IS NOT NULL
      LIMIT 5
    `);

    console.log(`\nTrouvé ${rows.length} zones avec des pièces jointes/photos`);

    // Vérifier le dossier uploads
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const documentsDir = path.join(uploadsDir, 'documents');

    console.log(`\nDossier uploads: ${uploadsDir}`);
    console.log(`Dossier documents: ${documentsDir}`);

    if (fs.existsSync(uploadsDir)) {
      console.log('✅ Dossier uploads existe');

      if (fs.existsSync(documentsDir)) {
        console.log('✅ Dossier documents existe');

        const files = fs.readdirSync(documentsDir);
        console.log(`📁 Fichiers trouvés: ${files.length}`);
        files.forEach(file => console.log(`  - ${file}`));
      } else {
        console.log('❌ Dossier documents n\'existe pas');
      }
    } else {
      console.log('❌ Dossier uploads n\'existe pas');
    }

    // Analyser les données
    console.log('\n=== ANALYSE DES DONNÉES ===');
    for (const row of rows) {
      console.log(`\nZone: ${row.name}`);

      if (row.responsible_photo) {
        const fileName = path.basename(row.responsible_photo);
        const filePath = path.join(documentsDir, fileName);
        const exists = fs.existsSync(filePath);
        console.log(`  Photo responsable: ${fileName} - ${exists ? '✅' : '❌'}`);
      }

      if (row.attachments) {
        try {
          const attachments = typeof row.attachments === 'string'
            ? JSON.parse(row.attachments)
            : row.attachments;

          if (Array.isArray(attachments)) {
            console.log(`  Pièces jointes: ${attachments.length}`);
            attachments.forEach((att, i) => {
              if (att.url) {
                const fileName = path.basename(att.url);
                const filePath = path.join(documentsDir, fileName);
                const exists = fs.existsSync(filePath);
                console.log(`    ${i+1}. ${att.name} (${fileName}) - ${exists ? '✅' : '❌'}`);
              }
            });
          }
        } catch (e) {
          console.log(`  Erreur parsing attachments: ${e.message}`);
        }
      }
    }

  } catch (error) {
    console.error('Erreur:', error);
  }
}

checkZoneAttachments();
