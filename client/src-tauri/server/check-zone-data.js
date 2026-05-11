import { db } from './db.ts';
import { sql } from 'drizzle-orm/sql';
import fs from 'fs';
import path from 'path';

async function checkZoneAttachments() {
  try {
    // Vérifier les données dans la table zones
    const rows = await db.execute(sql`
      SELECT id, name, attachments, responsible_photo
      FROM zones
      WHERE attachments IS NOT NULL OR responsible_photo IS NOT NULL
      LIMIT 10
    `);

    console.log('=== DONNÉES ZONES ===');
    for (const row of rows) {
      console.log(`Zone ID: ${row.id}, Name: ${row.name}`);

      // Vérifier les attachments
      if (row.attachments) {
        try {
          const attachments = typeof row.attachments === 'string'
            ? JSON.parse(row.attachments)
            : row.attachments;

          if (Array.isArray(attachments)) {
            console.log('  Attachments:');
            for (let i = 0; i < attachments.length; i++) {
              const att = attachments[i];
              console.log(`    ${i}: name="${att.name}", url="${att.url}"`);

              // Vérifier si le fichier existe
              if (att.url) {
                const fileName = path.basename(att.url);
                const filePath = path.join(process.cwd(), 'uploads', 'documents', fileName);
                const exists = fs.existsSync(filePath);
                console.log(`       File exists: ${exists} (path: ${filePath})`);

                if (exists) {
                  const stats = fs.statSync(filePath);
                  console.log(`       File size: ${stats.size} bytes`);
                }
              }
            }
          } else {
            console.log('  Attachments: Not an array');
          }
        } catch (e) {
          console.log('  Attachments: Parse error', e.message);
        }
      }

      // Vérifier la photo du responsable
      if (row.responsible_photo) {
        console.log(`  Responsible photo: "${row.responsible_photo}"`);
        const fileName = path.basename(row.responsible_photo);
        const filePath = path.join(process.cwd(), 'uploads', 'documents', fileName);
        const exists = fs.existsSync(filePath);
        console.log(`    File exists: ${exists} (path: ${filePath})`);

        if (exists) {
          const stats = fs.statSync(filePath);
          console.log(`    File size: ${stats.size} bytes`);
        }
      }
      console.log('---');
    }

    // Lister les fichiers disponibles avec le bon chemin
    console.log('\n=== FICHIERS DISPONIBLES ===');
    const correctUploadsDir = path.join(process.cwd(), 'uploads', 'documents');
    console.log(`Chemin utilisé: ${correctUploadsDir}`);

    try {
      const files = fs.readdirSync(correctUploadsDir);
      files.forEach(file => {
        console.log(`- ${file}`);
      });
    } catch (error) {
      console.log(`❌ Erreur de lecture du dossier: ${error.message}`);
    }

    // Vérifier la correspondance entre URLs et fichiers
    console.log('\n=== CORRESPONDANCE URLS/FICHIERS (chemin corrigé) ===');
    const uploadsDir = path.join(process.cwd(), 'uploads', 'documents');
    const availableFiles = fs.readdirSync(uploadsDir);
    const usedUrls = new Set();

    // Collecter toutes les URLs utilisées
    for (const row of rows) {
      if (row.responsible_photo) {
        usedUrls.add(path.basename(row.responsible_photo));
      }
      if (row.attachments) {
        try {
          const attachments = typeof row.attachments === 'string'
            ? JSON.parse(row.attachments)
            : row.attachments;
          if (Array.isArray(attachments)) {
            for (const att of attachments) {
              if (att.url) {
                usedUrls.add(path.basename(att.url));
              }
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }

    try {
      const availableFiles = fs.readdirSync(correctUploadsDir);

      console.log('URLs utilisées dans la DB:');
      for (const url of usedUrls) {
        const exists = availableFiles.includes(url);
        console.log(`- ${url}: ${exists ? '✅' : '❌'}`);
      }

      console.log('\nFichiers disponibles non utilisés:');
      for (const file of availableFiles) {
        if (!usedUrls.has(file)) {
          console.log(`- ${file}`);
        }
      }
    } catch (error) {
      console.log(`❌ Erreur de lecture du dossier: ${error.message}`);
    }

    // Tester l'accès aux fichiers
    console.log('\n=== TEST ACCÈS FICHIERS ===');
    const testUploadsDir = path.join(process.cwd(), 'uploads', 'documents');

    try {
      const files = fs.readdirSync(testUploadsDir);
      console.log(`✅ Dossier accessible: ${testUploadsDir}`);
      console.log(`📁 Nombre de fichiers: ${files.length}`);

      // Tester la lecture du premier fichier
      if (files.length > 0) {
        const testFile = path.join(testUploadsDir, files[0]);
        const stats = fs.statSync(testFile);
        console.log(`✅ Premier fichier accessible: ${files[0]} (${stats.size} bytes)`);

        // Tester la lecture
        const content = fs.readFileSync(testFile);
        console.log(`✅ Lecture possible: ${content.length} bytes lus`);
      }
    } catch (error) {
      console.log(`❌ Erreur d'accès: ${error.message}`);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkZoneAttachments();
