// Script pour exporter les données de la base de données principale vers un format compatible Android
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Configuration de la base de données (ajustez selon votre configuration)
const dbConfig = {
  user: 'postgres',
  host: 'localhost',
  database: 'scodipp',
  password: 'your_password', // Remplacez par votre mot de passe
  port: 5432,
};

const pool = new Pool(dbConfig);

async function exportData() {
  try {
    console.log('🔄 Connexion à la base de données...');

    // Récupérer les utilisateurs
    console.log('📊 Export des utilisateurs...');
    const usersResult = await pool.query(`
      SELECT id, email, password, role, nom, prenom, telephone, created_at
      FROM users
      ORDER BY id
    `);

    // Récupérer les permis
    console.log('📊 Export des permis...');
    const permisResult = await pool.query(`
      SELECT id, numero, type, espece, quantite, zone, date_debut, date_fin, agent_id, statut, created_at
      FROM permis
      ORDER BY id
    `);

    // Récupérer les régions
    console.log('📊 Export des régions...');
    const regionsResult = await pool.query(`
      SELECT id, nom, code, created_at
      FROM regions
      ORDER BY id
    `);

    // Récupérer les zones
    console.log('📊 Export des zones...');
    const zonesResult = await pool.query(`
      SELECT id, nom, code, region_id, created_at
      FROM zones
      ORDER BY id
    `);

    // Récupérer les espèces
    console.log('📊 Export des espèces...');
    const especesResult = await pool.query(`
      SELECT id, nom, nom_scientifique, statut, created_at
      FROM especes
      ORDER BY id
    `);

    // Récupérer les infractions
    console.log('📊 Export des infractions...');
    const infractionsResult = await pool.query(`
      SELECT id, nom, description, transaction, created_at
      FROM infractions
      ORDER BY id
    `);

    // Récupérer les taxes
    console.log('📊 Export des taxes...');
    const taxesResult = await pool.query(`
      SELECT id, nom, montant, type, created_at
      FROM taxes
      ORDER BY id
    `);

    // Récupérer les demandes de permis
    console.log('📊 Export des demandes de permis...');
    const demandesResult = await pool.query(`
      SELECT id, numero, type, espece, quantite, zone, date_debut, date_fin,
             hunter_id, statut, created_at, updated_at
      FROM demandes_permis
      ORDER BY id
    `);

    // Récupérer les déclarations de chasse
    console.log('📊 Export des déclarations de chasse...');
    const declarationsResult = await pool.query(`
      SELECT id, numero, date_chasse, zone, espece, quantite,
             hunter_id, statut, created_at, updated_at
      FROM declarations_chasse
      ORDER BY id
    `);

    // Récupérer les rapports de chasse
    console.log('📊 Export des rapports de chasse...');
    const rapportsResult = await pool.query(`
      SELECT id, numero, date_rapport, zone, observations,
             hunter_id, created_at, updated_at
      FROM rapports_chasse
      ORDER BY id
    `);

    // Récupérer les activités de chasse
    console.log('📊 Export des activités de chasse...');
    const activitesResult = await pool.query(`
      SELECT id, nom, description, type, created_at
      FROM activites_chasse
      ORDER BY id
    `);

    // Récupérer les guides
    console.log('📊 Export des guides...');
    const guidesResult = await pool.query(`
      SELECT id, nom, prenom, telephone, email, zone, statut, created_at
      FROM guides
      ORDER BY id
    `);

    // Récupérer les chasseurs
    console.log('📊 Export des chasseurs...');
    const chasseursResult = await pool.query(`
      SELECT id, nom, prenom, telephone, email, zone, statut, created_at
      FROM chasseurs
      ORDER BY id
    `);

    // Récupérer les agents
    console.log('📊 Export des agents...');
    const agentsResult = await pool.query(`
      SELECT id, nom, prenom, telephone, email, role, zone, statut, created_at
      FROM agents
      ORDER BY id
    `);

    // Récupérer les messages SMS
    console.log('📊 Export des messages SMS...');
    const smsResult = await pool.query(`
      SELECT id, numero, message, statut, created_at, sent_at
      FROM sms
      ORDER BY id
    `);

    // Récupérer les alertes
    console.log('📊 Export des alertes...');
    const alertesResult = await pool.query(`
      SELECT id, titre, message, type, statut, created_at, updated_at
      FROM alertes
      ORDER BY id
    `);

    // Récupérer les produits forestiers
    console.log('📊 Export des produits forestiers...');
    const produitsResult = await pool.query(`
      SELECT id, nom, description, prix, unite, created_at
      FROM produits_forestiers
      ORDER BY id
    `);

    // Récupérer les pépinières
    console.log('📊 Export des pépinières...');
    const pepinieresResult = await pool.query(`
      SELECT id, nom, adresse, telephone, email, zone, created_at
      FROM pepinieres
      ORDER BY id
    `);

    // Récupérer les reboisements
    console.log('📊 Export des reboisements...');
    const reboisementsResult = await pool.query(`
      SELECT id, zone, espece, quantite, date_plantation,
             responsable_id, statut, created_at
      FROM reboisements
      ORDER BY id
    `);

    // Compiler toutes les données
    const exportData = {
      users: usersResult.rows,
      permis: permisResult.rows,
      regions: regionsResult.rows,
      zones: zonesResult.rows,
      especes: especesResult.rows,
      infractions: infractionsResult.rows,
      taxes: taxesResult.rows,
      demandes_permis: demandesResult.rows,
      declarations_chasse: declarationsResult.rows,
      rapports_chasse: rapportsResult.rows,
      activites_chasse: activitesResult.rows,
      guides: guidesResult.rows,
      chasseurs: chasseursResult.rows,
      agents: agentsResult.rows,
      sms: smsResult.rows,
      alertes: alertesResult.rows,
      produits_forestiers: produitsResult.rows,
      pepinieres: pepinieresResult.rows,
      reboisements: reboisementsResult.rows,
      export_date: new Date().toISOString(),
      version: '1.0.0'
    };

    // Créer le répertoire de sortie s'il n'existe pas
    const outputDir = path.join(__dirname, '..', 'android-data');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Sauvegarder les données
    const outputFile = path.join(outputDir, `scodipp-data-${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(outputFile, JSON.stringify(exportData, null, 2));

    console.log('✅ Export terminé avec succès !');
    console.log(`📁 Fichier créé : ${outputFile}`);
    console.log(`📊 Statistiques :`);
    console.log(`   - Utilisateurs : ${usersResult.rows.length}`);
    console.log(`   - Permis : ${permisResult.rows.length}`);
    console.log(`   - Régions : ${regionsResult.rows.length}`);
    console.log(`   - Zones : ${zonesResult.rows.length}`);
    console.log(`   - Espèces : ${especesResult.rows.length}`);
    console.log(`   - Infractions : ${infractionsResult.rows.length}`);
    console.log(`   - Taxes : ${taxesResult.rows.length}`);
    console.log(`   - Demandes de permis : ${demandesResult.rows.length}`);
    console.log(`   - Déclarations de chasse : ${declarationsResult.rows.length}`);
    console.log(`   - Rapports de chasse : ${rapportsResult.rows.length}`);
    console.log(`   - Activités de chasse : ${activitesResult.rows.length}`);
    console.log(`   - Guides : ${guidesResult.rows.length}`);
    console.log(`   - Chasseurs : ${chasseursResult.rows.length}`);
    console.log(`   - Agents : ${agentsResult.rows.length}`);
    console.log(`   - Messages SMS : ${smsResult.rows.length}`);
    console.log(`   - Alertes : ${alertesResult.rows.length}`);
    console.log(`   - Produits forestiers : ${produitsResult.rows.length}`);
    console.log(`   - Pépinières : ${pepinieresResult.rows.length}`);
    console.log(`   - Reboisements : ${reboisementsResult.rows.length}`);

  } catch (error) {
    console.error('❌ Erreur lors de l\'export :', error);
  } finally {
    await pool.end();
  }
}

// Exécuter l'export
exportData();
