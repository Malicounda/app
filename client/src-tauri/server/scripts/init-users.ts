import { db } from '../db.js';
import { users } from '../../shared/dist/schema.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const createDefaultUsers = async () => {
  try {
    // Hash des mots de passe
    const hashDiop = await bcrypt.hash('decoder22', 10);
    const hashAdmin = await bcrypt.hash('password', 10);

    // Créer les utilisateurs par défaut
    await db.insert(users).values([
      {
        username: 'diop',
        password: hashDiop,
        email: 'diop@example.com',
        role: 'hunter',
        firstName: 'Diop',
        lastName: 'Chasseur',
        phone: '1234567890',
        region: 'Région 1',
        departement: 'Zone 1'
      },
      {
        username: 'admin',
        password: hashAdmin,
        email: 'admin@example.com',
        role: 'admin',
        firstName: 'Admin',
        lastName: 'Admin',
        phone: '0987654321',
        region: 'Région Admin',
        departement: 'Zone Admin'
      }
    ]);

    console.log('Utilisateurs créés avec succès !');
  } catch (error) {
    console.error('Erreur lors de la création des utilisateurs:', error);
  }
};

// Exécuter la fonction
createDefaultUsers();
