import { db } from './db.ts';
import { sql } from 'drizzle-orm/sql';
import fs from 'fs';
import path from 'path';

async function cleanZoneAttachments() {
  try {
    console.log('=== NETTOYAGE DES PIÈCES JOINTES ===');

    // Récupérer toutes les zones avec des pièces jointes
    const rows = await db.execute(sql`
      SELECT id, name, attachments, responsible_photo
      FROM zones
      WHERE attachments IS NOT NULL OR responsible_photo IS NOT NULL
    `);

    console.log(`Trouvé ${rows.length} zones à vérifier`);

    const uploadsDir = path.join(process.cwd(), 'uploads', 'documents');
    let cleanedZones = 0;

    for (const row of rows) {
      let needsUpdate = false;
      let newAttachments = null;
      let newResponsiblePhoto = row.responsible_photo;

      // Vérifier la photo du responsable
      if (row.responsible_photo) {
        const fileName = path.basename(row.responsible_photo);
        const filePath = path.join(uploadsDir, fileName);
        const exists = fs.existsSync(filePath);

        if (!exists) {
          console.log(`❌ Photo responsable manquante: ${fileName} (zone ${row.name})`);
          newResponsiblePhoto = null;
          needsUpdate = true;
        }
      }

      // Vérifier les pièces jointes
      if (row.attachments) {
        try {
          const attachments = typeof row.attachments === 'string'
            ? JSON.parse(row.attachments)
            : row.attachments;

          if (Array.isArray(attachments)) {
            const validAttachments = [];

            for (const att of attachments) {
              if (att.url) {
                const fileName = path.basename(att.url);
                const filePath = path.join(uploadsDir, fileName);
                const exists = fs.existsSync(filePath);

                if (exists) {
                  validAttachments.push(att);
                } else {
                  console.log(`❌ Pièce jointe manquante: ${att.name} (${fileName}) (zone ${row.name})`);
                  needsUpdate = true;
                }
              }
            }

            if (validAttachments.length !== attachments.length) {
              newAttachments = JSON.stringify(validAttachments);
              needsUpdate = true;
            }
          }
        } catch (e) {
          console.log(`Erreur parsing attachments pour zone ${row.id}: ${e.message}`);
        }
      }

      // Mettre à jour si nécessaire
      if (needsUpdate) {
        await db.execute(sql`
          UPDATE zones SET
            responsible_photo = ${newResponsiblePhoto},
            attachments = ${newAttachments},
            updated_at = NOW()
          WHERE id = ${row.id}
        `);
        console.log(`✅ Zone ${row.name} nettoyée`);
        cleanedZones++;
      }
    }

    console.log(`\n=== RÉSULTATS ===`);
    console.log(`Zones nettoyées: ${cleanedZones}`);
    console.log(`Script terminé avec succès`);

  } catch (error) {
    console.error('Erreur:', error);
  }
}

cleanZoneAttachments();
