import { db } from '../db.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

async function setupTaxesTable() {
  try {
    console.log('🔧 Configuration de la table taxes...');
    
    // Lire le fichier SQL
    const sqlPath = join(__dirname, 'create-taxes-table.sql');
    const sqlContent = readFileSync(sqlPath, 'utf8');
    
    // Exécuter les commandes SQL
    const commands = sqlContent.split(';').filter(cmd => cmd.trim());
    
    for (const command of commands) {
      if (command.trim()) {
        console.log(`Exécution: ${command.trim().substring(0, 50)}...`);
        await db.execute(command.trim());
      }
    }
    
    console.log('✅ Table taxes configurée avec succès!');
    
    // Vérifier le contenu
    const taxes = await db.execute('SELECT COUNT(*) as count FROM taxes');
    console.log(`📊 ${taxes[0]?.count || 0} taxes trouvées dans la base`);
    
  } catch (error) {
    console.error('❌ Erreur lors de la configuration:', error);
  } finally {
    process.exit(0);
  }
}

setupTaxesTable();
