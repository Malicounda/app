const { storage } = require('../storage');
const bcrypt = require('bcryptjs');

async function main() {
  const username = 'sal';
  const password = 'decoder22';
  const email = 'sal@demo.com'; // Email fictif, à modifier si besoin
  const role = 'hunting-guide';

  // Hash du mot de passe
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const user = await storage.createUser({
      username,
      password: hashedPassword,
      email,
      role,
      isActive: true,
      isSuspended: false,
    });
    console.log('Utilisateur Guide de chasse créé :', user);
  } catch (err) {
    console.error('Erreur lors de la création du compte :', err);
  }
}

main().then(() => process.exit());
