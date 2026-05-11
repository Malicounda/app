import { Router } from 'express';
import { isAuthenticated } from './middlewares/auth.middleware.js';
import { db } from '../db.js';
import { eq, and } from 'drizzle-orm';
import { guideHunterAssociations, huntingGuides, hunters, users } from '../../shared/dist/schema.js';

const router = Router();

// Récupérer l'association active d'un chasseur avec un guide
router.get('/hunter/:hunterId', isAuthenticated, async (req, res) => {
  try {
    const hunterId = Number(req.params.hunterId);
    
    if (Number.isNaN(hunterId)) {
      return res.status(400).json({ message: 'ID de chasseur invalide' });
    }

    // Récupérer l'association active avec les informations du guide
    const result = await db.select({
      associationId: guideHunterAssociations.id,
      guideId: guideHunterAssociations.guideId,
      hunterId: guideHunterAssociations.hunterId,
      associatedAt: guideHunterAssociations.associatedAt,
      guideFirstName: huntingGuides.firstName,
      guideLastName: huntingGuides.lastName,
      guidePhone: huntingGuides.phone,
      guideIdNumber: huntingGuides.idNumber,
      guideDepartement: huntingGuides.departement,
      guideRegion: huntingGuides.region,
    })
    .from(guideHunterAssociations)
    .innerJoin(huntingGuides, eq(guideHunterAssociations.guideId, huntingGuides.id))
    .where(and(
      eq(guideHunterAssociations.hunterId, hunterId), 
      eq(guideHunterAssociations.isActive, true)
    ))
    .limit(1);

    if (result.length === 0) {
      return res.json(null); // Pas d'association active
    }

    const association = result[0];
    
    // Formater la réponse
    const response = {
      associationId: association.associationId,
      guide: {
        id: association.guideId,
        firstName: association.guideFirstName,
        lastName: association.guideLastName,
        phone: association.guidePhone,
        idNumber: association.guideIdNumber,
        departement: association.guideDepartement,
        region: association.guideRegion,
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'association chasseur-guide:', error);
    res.status(500).json({ message: 'Échec de la récupération de l\'association' });
  }
});

// Supprimer une association (marquer comme inactive)
router.delete('/:associationId', isAuthenticated, async (req, res) => {
  try {
    const associationId = Number(req.params.associationId);
    
    if (Number.isNaN(associationId)) {
      return res.status(400).json({ message: 'ID d\'association invalide' });
    }

    // Marquer l'association comme inactive
    const [updatedAssociation] = await db.update(guideHunterAssociations)
      .set({ 
        isActive: false,
        dissociatedAt: new Date()
      })
      .where(eq(guideHunterAssociations.id, associationId))
      .returning();

    if (!updatedAssociation) {
      return res.status(404).json({ message: 'Association non trouvée' });
    }

    res.json({ 
      message: 'Association supprimée avec succès',
      association: updatedAssociation
    });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'association:', error);
    res.status(500).json({ message: 'Échec de la suppression de l\'association' });
  }
});

export default router;
