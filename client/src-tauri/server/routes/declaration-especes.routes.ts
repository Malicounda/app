import { sql } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db.js';
import { isAuthenticated } from './middlewares/auth.middleware.js';

// Fonction pour générer un numéro d'activité unique
async function generateActivityNumber(hunterId: number): Promise<string> {
  const year = new Date().getFullYear();

  // Compter les activités existantes pour ce chasseur cette année
  const countResult = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM hunting_activities
    WHERE hunter_id = ${hunterId}
      AND EXTRACT(YEAR FROM created_at) = ${year}
  `);

  const countRow = Array.isArray(countResult) ? countResult[0] : countResult;
  const count = Number(countRow?.count || 0);
  const nextNumber = count + 1;

  // Format: H{hunterId}-{year}-{number} (ex: H14-2025-001)
  return `H${hunterId}-${year}-${nextNumber.toString().padStart(3, '0')}`;
}

const router = Router();

// Récupérer les déclarations d'espèces faites par des guides pour un chasseur spécifique
router.get('/guide-declarations/:hunterId', isAuthenticated, async (req, res) => {
  try {
    const hunterId = Number(req.params.hunterId);

    if (Number.isNaN(hunterId)) {
      return res.status(400).json({ message: 'ID de chasseur invalide' });
    }

    console.log(`🔍 Recherche des déclarations pour chasseur ID: ${hunterId}`);

    // D'abord, vérifier s'il y a des déclarations avec guide_id pour ce chasseur
    const checkResult = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM declaration_especes
      WHERE hunter_id = ${hunterId} AND guide_id IS NOT NULL
    `);

    const checkRow = Array.isArray(checkResult) ? checkResult[0] : checkResult;
    console.log(`📊 Nombre de déclarations avec guide_id: ${checkRow?.count || 0}`);

    // Requête SQL: ne retourner que les déclarations en attente (status NULL ou 'pending') faites par un guide
    const result = await db.execute(sql`
      SELECT
        de.id,
        de.user_id,
        de.hunter_id,
        de.guide_id,
        de.permit_id,
        de.permit_number,
        de.category,
        de.espece_id,
        de.nom_espece,
        de.nom_scientifique,
        de.sexe,
        de.quantity,
        de.lat,
        de.lon,
        de.location,
        de.photo_data,
        de.photo_mime,
        de.photo_name,
        COALESCE(de.status, 'pending') as status,
        de.reviewed_at,
        de.review_notes,
        de.created_at,
        'Guide' as guideName
      FROM declaration_especes de
      WHERE de.hunter_id = ${hunterId}
        AND de.guide_id IS NOT NULL
        AND (de.status IS NULL OR de.status = 'pending')
      ORDER BY de.created_at DESC
    `);

    // Convertir le résultat en format attendu par le frontend
    const resultRows = Array.isArray(result) ? result : [];
    const declarations = resultRows.map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      hunter_id: row.hunter_id,
      guide_id: row.guide_id,
      guideName: row.guidename,
      permit_id: row.permit_id,
      permit_number: row.permit_number,
      category: row.category,
      espece_id: row.espece_id,
      nom_espece: row.nom_espece,
      nom_scientifique: row.nom_scientifique,
      sexe: row.sexe,
      quantity: row.quantity,
      lat: row.lat ? parseFloat(row.lat) : null,
      lon: row.lon ? parseFloat(row.lon) : null,
      location: row.location,
      photo_data: row.photo_data ? Buffer.from(row.photo_data).toString('base64') : null,
      photo_mime: row.photo_mime,
      photo_name: row.photo_name,
      status: row.status || 'pending',
      reviewed_at: row.reviewed_at,
      review_notes: row.review_notes,
      created_at: row.created_at,
    }));

    console.log(`✅ Retour de ${declarations.length} déclarations`);
    res.json(declarations);
  } catch (error: any) {
    console.error('❌ Erreur lors de la récupération des déclarations du guide:', error);
    console.error('Stack trace:', error?.stack);
    res.status(500).json({
      message: 'Échec de la récupération des déclarations',
      error: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
  }
});

// Approuver ou rejeter une déclaration d'espèce faite par un guide
router.post('/:declarationId/review', isAuthenticated, async (req, res) => {
  try {
    const declarationId = Number(req.params.declarationId);
    const { action, notes } = req.body;

    if (Number.isNaN(declarationId)) {
      return res.status(400).json({ message: 'ID de déclaration invalide' });
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Action invalide. Utilisez "approve" ou "reject"' });
    }

    // Vérifier que la déclaration existe et que l'utilisateur a les droits
    const [existingDeclaration] = await db.execute(sql`
      SELECT hunter_id, status FROM declaration_especes
      WHERE id = ${declarationId}
    `);

    if (!existingDeclaration) {
      return res.status(404).json({ message: 'Déclaration non trouvée' });
    }

    if (existingDeclaration.status !== 'pending') {
      return res.status(400).json({ message: 'Cette déclaration a déjà été traitée' });
    }

    // Vérifier les permissions (chasseur concerné ou admin)
    if (req.user?.role !== 'admin' && req.user?.hunterId !== existingDeclaration.hunter_id) {
      return res.status(403).json({ message: 'Non autorisé à traiter cette déclaration' });
    }

    // Mettre à jour le statut de la déclaration avec toutes les colonnes nécessaires
    const result = await db.execute(sql`
      UPDATE declaration_especes
      SET status = ${action === 'approve' ? 'approved' : 'rejected'},
          reviewed_at = NOW(),
          review_notes = ${notes || ''}
      WHERE id = ${declarationId}
      RETURNING
        id, hunter_id, guide_id, permit_id, permit_number,
        espece_id, nom_espece, nom_scientifique, sexe, quantity,
        location, lat, lon, photo_data, photo_mime, photo_name, created_at
    `);

    // Si approuvée, ajouter automatiquement aux activités de chasse du chasseur
    if (action === 'approve') {
      const declaration = Array.isArray(result) ? result[0] : result;
      console.log(`🎯 Déclaration approuvée, création de l'activité...`);
      console.log(`📋 Données de la déclaration:`, declaration);

      if (declaration) {
        // Générer un numéro d'activité unique
        const activityNumber = await generateActivityNumber(Number(declaration.hunter_id));
        console.log(`🔢 Numéro d'activité généré: ${activityNumber}`);

        const insertResult = await db.execute(sql`
          INSERT INTO hunting_activities (
            activity_number, hunter_id, permit_id, permit_number, species_id, species_name,
            scientific_name, sex, quantity, location, lat, lon,
            hunting_date, photo_data, photo_mime, photo_name,
            source_type, source_id, created_at
          ) VALUES (
            ${activityNumber}, ${declaration.hunter_id}, ${declaration.permit_id}, ${declaration.permit_number},
            ${declaration.espece_id}, ${declaration.nom_espece}, ${declaration.nom_scientifique},
            ${declaration.sexe}, ${declaration.quantity || 1}, ${declaration.location},
            ${declaration.lat}, ${declaration.lon}, ${declaration.created_at},
            ${declaration.photo_data}, ${declaration.photo_mime}, ${declaration.photo_name},
            'guide_declaration', ${declarationId}, NOW()
          )
        `);

        const insertedActivity = Array.isArray(insertResult) ? insertResult[0] : insertResult;
        console.log(`✅ Déclaration #${declarationId} approuvée et ajoutée aux activités avec numéro ${activityNumber}`);
        console.log(`📝 Activité créée:`, insertedActivity);
      }
    }

    const resultArray = Array.isArray(result) ? result : [];
    if (resultArray.length === 0) {
      return res.status(404).json({ message: 'Déclaration non trouvée' });
    }

    res.json({
      message: `Déclaration ${action === 'approve' ? 'approuvée' : 'rejetée'} avec succès`,
      action,
      notes
    });
  } catch (error: any) {
    console.error('Erreur lors de la révision de la déclaration:', error);
    res.status(500).json({ message: 'Échec de la révision de la déclaration' });
  }
});

// Supprimer une déclaration d'espèce
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    const declarationId = Number(req.params.id);

    if (Number.isNaN(declarationId)) {
      return res.status(400).json({ message: 'ID de déclaration invalide' });
    }

    // Vérifier que la déclaration existe
    const [existingDeclaration] = await db.execute(sql`
      SELECT hunter_id, guide_id, user_id FROM declaration_especes
      WHERE id = ${declarationId}
    `);

    if (!existingDeclaration) {
      return res.status(404).json({ message: 'Déclaration non trouvée' });
    }

    // Vérifier les permissions (chasseur concerné, guide concerné ou admin)
    const isOwner = req.user?.hunterId === existingDeclaration.hunter_id;
    const isGuide = req.user?.id === existingDeclaration.user_id;
    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'regional_agent' || req.user?.role === 'sector_agent';

    if (!isOwner && !isGuide && !isAdmin) {
      return res.status(403).json({ message: 'Non autorisé à supprimer cette déclaration' });
    }

    // Supprimer la déclaration
    await db.execute(sql`
      DELETE FROM declaration_especes
      WHERE id = ${declarationId}
    `);

    console.log(`✅ Déclaration #${declarationId} supprimée avec succès`);

    res.json({
      message: 'Déclaration supprimée avec succès'
    });
  } catch (error: any) {
    console.error('❌ Erreur lors de la suppression de la déclaration:', error);
    res.status(500).json({ 
      message: 'Échec de la suppression de la déclaration',
      error: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
  }
});

export default router;
