import { db } from '../server/db.js';
import { permitCategories } from '../shared/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
  console.log('Inserting certificates...');
  try {
    const certs = [
      {
        key: 'CERTIFICAT_EXPORT',
        labelFr: "Certificat d'Origine / d'Exportation",
        groupe: 'autre',
        genre: 'autre',
        isActive: true,
      },
      {
        key: 'CERTIFICAT_DETENTION',
        labelFr: "Certificat de Détention d'espèces sauvages",
        groupe: 'autre',
        genre: 'autre',
        isActive: true,
      },
      {
        key: 'AUTRE_DOCUMENT',
        labelFr: "Autre document de transport / d'exploitation",
        groupe: 'autre',
        genre: 'autre',
        isActive: true,
      }
    ];

    for (const cert of certs) {
      const existing = await db.select().from(permitCategories).where(eq(permitCategories.key, cert.key)).limit(1);
      if (existing.length === 0) {
        await db.insert(permitCategories).values(cert as any);
        console.log(`✓ Inserted ${cert.key}`);
      } else {
        console.log(`- ${cert.key} already exists`);
      }
    }
  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main().catch(console.error);
