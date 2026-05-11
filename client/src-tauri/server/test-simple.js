import { db } from './db.js';

async function testSimple() {
  try {
    console.log('🔍 Test simple de connexion...');
    
    // Test basique
    const result = await db.execute('SELECT 1 as test');
    console.log('✅ Connexion réussie:', result);
    
    // Lister les tables
    const tables = await db.execute("SELECT name FROM sqlite_master WHERE type='table'");
    console.log('📊 Tables disponibles:', tables.map(t => t.name));
    
  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    process.exit(0);
  }
}

testSimple();
