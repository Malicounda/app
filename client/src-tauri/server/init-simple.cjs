const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// Créer le dossier data s'il n'existe pas
const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'scodipp.db');
const db = new Database(dbPath);

console.log('🚀 Initialisation de l\'application SCoDiPP...');
console.log('📁 Base de données:', dbPath);

// Créer les tables
console.log('📋 Création des tables...');

// Table users
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    matricule TEXT,
    service_location TEXT,
    region TEXT,
    departement TEXT,
    agent_lat REAL,
    agent_lon REAL,
    role TEXT DEFAULT 'user',
    hunter_id INTEGER,
    is_active BOOLEAN DEFAULT 1,
    is_suspended BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Table hunters
db.exec(`
  CREATE TABLE IF NOT EXISTS hunters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    date_of_birth DATE,
    id_number TEXT UNIQUE NOT NULL,
    phone TEXT,
    address TEXT,
    experience TEXT,
    profession TEXT,
    category TEXT,
    pays TEXT,
    nationality TEXT,
    region TEXT,
    departement TEXT,
    weapon_type TEXT,
    weapon_brand TEXT,
    weapon_reference TEXT,
    weapon_caliber TEXT,
    weapon_other_details TEXT,
    is_active BOOLEAN DEFAULT 1,
    is_minor BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Table permits
db.exec(`
  CREATE TABLE IF NOT EXISTS permits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hunter_id INTEGER NOT NULL,
    permit_number TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL,
    area TEXT,
    issue_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    price TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hunter_id) REFERENCES hunters (id)
  );
`);

// Table taxes
db.exec(`
  CREATE TABLE IF NOT EXISTS taxes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hunter_id INTEGER,
    permit_id INTEGER,
    external_hunter_name TEXT,
    species TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    amount TEXT NOT NULL,
    issue_date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hunter_id) REFERENCES hunters (id),
    FOREIGN KEY (permit_id) REFERENCES permits (id)
  );
`);

// Table hunting_reports
db.exec(`
  CREATE TABLE IF NOT EXISTS hunting_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hunter_id INTEGER NOT NULL,
    user_id INTEGER,
    permit_id INTEGER,
    location TEXT,
    report_date DATE NOT NULL,
    latitude TEXT,
    longitude TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hunter_id) REFERENCES hunters (id),
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (permit_id) REFERENCES permits (id)
  );
`);

// Table hunted_species
db.exec(`
  CREATE TABLE IF NOT EXISTS hunted_species (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    species_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (report_id) REFERENCES hunting_reports (id)
  );
`);

console.log('✅ Tables créées avec succès');

// Vérifier si l'admin existe déjà
const existingAdmin = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');

if (existingAdmin) {
  console.log('✅ Utilisateur admin existe déjà');
} else {
  console.log('👤 Création de l\'utilisateur admin...');

  // Hacher le mot de passe
  const hashedPassword = bcrypt.hashSync('password22', 10);

  // Créer l'utilisateur admin
  const stmt = db.prepare(`
    INSERT INTO users (
      username, password, email, first_name, last_name, phone,
      matricule, service_location, region, departement, role,
      is_active, is_suspended
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    'admin',
    hashedPassword,
    'admin@scodipp.sn',
    'Administrateur',
    'SCoDiPP',
    '+221 76 290 88 93',
    'ADMIN001',
    'Direction Générale',
    'Dakar',
    'Dakar',
    'admin',
    1,
    0
  );

  console.log('✅ Utilisateur admin créé avec succès');
}

// Créer quelques données de test
console.log('📊 Création des données de test...');

// Vérifier si des chasseurs existent déjà
const existingHunters = db.prepare('SELECT COUNT(*) as count FROM hunters').get();

if (existingHunters.count === 0) {
  // Créer des chasseurs de test
  const hunterStmt = db.prepare(`
    INSERT INTO hunters (
      first_name, last_name, id_number, phone, address,
      region, departement, category, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const hunters = [
    ['Moussa', 'Diop', 'SN123456789', '+221 77 123 45 67', 'Parcelles Assainies, Dakar', 'Dakar', 'Dakar', 'Resident', 1],
    ['Aminata', 'Fall', 'SN987654321', '+221 78 987 65 43', 'Thiès, Sénégal', 'Thiès', 'Thiès', 'Resident', 1],
    ['Ibrahima', 'Sarr', 'SN456789123', '+221 76 456 78 90', 'Saint-Louis, Sénégal', 'Saint-Louis', 'Saint-Louis', 'Resident', 1]
  ];

  hunters.forEach(hunter => {
    hunterStmt.run(...hunter);
  });

  console.log(`✅ ${hunters.length} chasseurs de test créés`);

  // Créer des permis de test
  const permitStmt = db.prepare(`
    INSERT INTO permits (
      hunter_id, permit_number, type, area, issue_date,
      expiry_date, price, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const today = new Date().toISOString().split('T')[0];
  const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const permits = [
    [1, 'PERM-2025-001', 'Permis de chasse', 'Dakar', today, nextYear, '50000', 'active'],
    [2, 'PERM-2025-002', 'Permis de chasse', 'Thiès', today, nextYear, '50000', 'active'],
    [3, 'PERM-2025-003', 'Permis de chasse', 'Saint-Louis', today, nextYear, '50000', 'active']
  ];

  permits.forEach(permit => {
    permitStmt.run(...permit);
  });

  console.log(`✅ ${permits.length} permis de test créés`);
}

console.log('');
console.log('🎉 Initialisation terminée avec succès!');
console.log('');
console.log('📱 Informations de connexion:');
console.log('   👤 Username: admin');
console.log('   🔑 Password: password22');
console.log('   📧 Email: admin@scodipp.sn');
console.log('');
console.log('📊 Données de test créées:');
console.log('   - 3 chasseurs de test');
console.log('   - 3 permis de test');
console.log('   - Base de données SQLite locale');
console.log('');

db.close();
