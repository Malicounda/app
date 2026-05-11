import bcrypt from 'bcryptjs';
import { initDatabase, migrateDatabase } from './db-sqlite.js';

export async function createAdminUser() {
  try {
    // Initialiser la base de données
    const db = await initDatabase();
    await migrateDatabase();

    // Vérifier si l'admin existe déjà
    const existingAdmin = await db.select().from(db.users).where(db.users.username.eq('admin')).first();

    if (existingAdmin) {
      console.log('✅ Utilisateur admin existe déjà');
      return existingAdmin;
    }

    // Hacher le mot de passe
    const hashedPassword = await bcrypt.hash('password22', 10);

    // Créer l'utilisateur admin
    const adminUser = await db.insert(db.users).values({
      username: 'admin',
      password: hashedPassword,
      email: 'admin@scodipp.sn',
      firstName: 'Administrateur',
      lastName: 'SCoDiPP',
      phone: '+221 76 290 88 93',
      matricule: 'ADMIN001',
      serviceLocation: 'Direction Générale',
      region: 'Dakar',
      departement: 'Dakar',
      role: 'admin',
      isActive: true,
      isSuspended: false
    }).returning();

    console.log('✅ Utilisateur admin créé avec succès');
    console.log('👤 Username: admin');
    console.log('🔑 Password: password22');
    console.log('📧 Email: admin@scodipp.sn');

    return adminUser[0];
  } catch (error) {
    console.error('❌ Erreur lors de la création de l\'admin:', error);
    throw error;
  }
}

// Fonction pour créer des données de test
export async function createTestData() {
  try {
    const db = await initDatabase();

    // Créer quelques chasseurs de test
    const hunters = await db.insert(db.hunters).values([
      {
        firstName: 'Moussa',
        lastName: 'Diop',
        idNumber: 'SN123456789',
        phone: '+221 77 123 45 67',
        address: 'Parcelles Assainies, Dakar',
        region: 'Dakar',
        departement: 'Dakar',
        category: 'Resident',
        isActive: true
      },
      {
        firstName: 'Aminata',
        lastName: 'Fall',
        idNumber: 'SN987654321',
        phone: '+221 78 987 65 43',
        address: 'Thiès, Sénégal',
        region: 'Thiès',
        departement: 'Thiès',
        category: 'Resident',
        isActive: true
      }
    ]).returning();

    console.log(`✅ ${hunters.length} chasseurs de test créés`);

    // Créer quelques permis de test
    const permits = await db.insert(db.permits).values([
      {
        hunterId: hunters[0].id,
        permitNumber: 'PERM-2025-001',
        type: 'Permis de chasse',
        area: 'Dakar',
        issueDate: new Date().toISOString().split('T')[0],
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        price: '50000',
        status: 'active'
      },
      {
        hunterId: hunters[1].id,
        permitNumber: 'PERM-2025-002',
        type: 'Permis de chasse',
        area: 'Thiès',
        issueDate: new Date().toISOString().split('T')[0],
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        price: '50000',
        status: 'active'
      }
    ]).returning();

    console.log(`✅ ${permits.length} permis de test créés`);

    return { hunters, permits };
  } catch (error) {
    console.error('❌ Erreur lors de la création des données de test:', error);
    throw error;
  }
}

// Fonction principale d'initialisation
export async function initializeApp() {
  try {
    console.log('🚀 Initialisation de l\'application SCoDiPP...');

    // Créer l'admin
    await createAdminUser();

    // Créer des données de test
    await createTestData();

    console.log('🎉 Initialisation terminée avec succès!');
    console.log('');
    console.log('📱 Vous pouvez maintenant utiliser l\'application avec:');
    console.log('   Username: admin');
    console.log('   Password: password22');
    console.log('');

  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation:', error);
    throw error;
  }
}
