import { initDatabase, migrateDatabase } from './db-sqlite.js';
import bcrypt from 'bcryptjs';

async function createAdminUser() {
  try {
    console.log('Initialisation de l\'application SCoDiPP...');

    // Initialiser la base de donnÃ©es
    const db = await initDatabase();
    await migrateDatabase();

    // VÃ©rifier si l'admin existe dÃ©jÃ 
    const existingAdmin = await db.select().from(db.users).where(db.users.username.eq('admin')).first();

    if (existingAdmin) {
      console.log('Utilisateur admin existe deja');
      return existingAdmin;
    }

    // Hacher le mot de passe
    const hashedPassword = await bcrypt.hash('password22', 10);

    // CrÃ©er l'utilisateur admin
    const adminUser = await db.insert(db.users).values({
      username: 'admin',
      password: hashedPassword,
      email: 'admin@scodipp.sn',
      firstName: 'Administrateur',
      lastName: 'SCoDiPP',
      phone: '+221 76 290 88 93',
      matricule: 'ADMIN001',
      serviceLocation: 'Direction GÃ©nÃ©rale',
      region: 'Dakar',
      departement: 'Dakar',
      role: 'admin',
      isActive: true,
      isSuspended: false
    }).returning();

    console.log('Utilisateur admin cree avec succes');
    console.log('Username: admin');
    console.log('Password: password22');
    console.log('Email: admin@scodipp.sn');

    return adminUser[0];
  } catch (error) {
    console.error('Erreur lors de la creation de l\'admin:', error);
    throw error;
  }
}

// ExÃ©cuter l'initialisation
createAdminUser()
  .then(() => {
    console.log('Initialisation terminee avec succes!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Erreur lors de l\'initialisation:', error);
    process.exit(1);
  });
