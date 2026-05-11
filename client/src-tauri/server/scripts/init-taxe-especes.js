import { db } from '../db.js';
import { taxeEspeces } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function initTaxeEspeces() {
  try {
    console.log('🐾 Initialisation de la table taxe_especes...');
    
    // Données des espèces par défaut
    const defaultSpecies = [
      { speciesId: 'PHA1', name: 'Phacochère (1)', price: 15000, code: 'PHA1' },
      { speciesId: 'CEPH', name: 'Céphalophe', price: 40000, code: 'CEPH' },
      { speciesId: 'PHA2', name: 'Phacochère (2)', price: 20000, code: 'PHA2' },
      { speciesId: 'PHA3', name: 'Phacochère (3)', price: 25000, code: 'PHA3' },
      { speciesId: 'GFR', name: 'Gazelle front roux', price: 50000, code: 'GFR' },
      { speciesId: 'BUF', name: 'Buffle', price: 200000, code: 'BUF' },
      { speciesId: 'COB', name: 'Cobe de Buffon', price: 100000, code: 'COB' },
      { speciesId: 'OUR', name: 'Ourébi', price: 40001, code: 'OUR' },
      { speciesId: 'GUH', name: 'Guib harnaché', price: 60000, code: 'GUH' },
      { speciesId: 'HIP', name: 'Hippotrague', price: 200000, code: 'HIP' },
      { speciesId: 'BUB', name: 'Bubale', price: 100000, code: 'BUB' }
    ];
    
    // Vérifier si la table existe et contient des données
    try {
      const existingSpecies = await db.select().from(taxeEspeces).limit(1);
      
      if (existingSpecies.length === 0) {
        console.log('📝 Insertion des espèces par défaut...');
        
        // Insérer les espèces par défaut
        for (const species of defaultSpecies) {
          await db.insert(taxeEspeces).values({
            ...species,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          console.log(`✅ ${species.name} ajouté`);
        }
        
        console.log('✅ Toutes les espèces par défaut ont été ajoutées!');
      } else {
        console.log('ℹ️ La table contient déjà des données, aucune insertion nécessaire');
      }
    } catch (tableError) {
      console.log('❌ Table taxe_especes non trouvée. Veuillez d\'abord créer la table.');
      console.log('💡 Utilisez le script SQL: init-taxe-especes.sql');
      return;
    }
    
    // Vérifier le contenu final
    const species = await db.select({ count: taxeEspeces.id }).from(taxeEspeces).where(eq(taxeEspeces.isActive, true));
    console.log(`📊 ${species.length} espèces actives trouvées dans la base`);
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation:', error);
  } finally {
    process.exit(0);
  }
}

initTaxeEspeces();
