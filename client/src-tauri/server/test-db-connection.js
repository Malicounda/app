import { db } from './db.js';
import prisma from './prismaClient.js';

async function testDatabaseConnection() {
  try {
    console.log('🔍 Test de connexion à la base de données...');
    
    // Test Drizzle
    console.log('\n📊 Test Drizzle (SQLite):');
    const drizzleResult = await db.execute('SELECT name FROM sqlite_master WHERE type="table"');
    console.log('Tables disponibles:', drizzleResult.map(t => t.name));
    
    // Test Prisma
    console.log('\n🔧 Test Prisma:');
    const prismaResult = await prisma.$queryRaw`SELECT name FROM sqlite_master WHERE type="table"`;
    console.log('Tables Prisma:', prismaResult.map(t => t.name));
    
    // Test spécifique taxe_especes
    console.log('\n🐾 Test table taxe_especes:');
    try {
      const speciesResult = await db.execute('SELECT COUNT(*) as count FROM taxe_especes');
      console.log('Espèces trouvées:', speciesResult[0]?.count || 0);
    } catch (err) {
      console.log('❌ Erreur taxe_especes:', err.message);
    }
    
    // Test spécifique hunters
    console.log('\n👤 Test table hunters:');
    try {
      const huntersResult = await prisma.hunters.findMany({ take: 1 });
      console.log('Chasseurs trouvés:', huntersResult.length);
    } catch (err) {
      console.log('❌ Erreur hunters:', err.message);
    }
    
    console.log('\n✅ Test terminé!');
    
  } catch (error) {
    console.error('❌ Erreur lors du test:', error);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

testDatabaseConnection();
