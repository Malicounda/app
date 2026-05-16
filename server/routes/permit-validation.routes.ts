import { Router } from 'express';
import { validateHunterForPermitRequest, validatePermitCreation } from '../utils/permitValidation.js';

const router = Router();

import { isAuthenticated } from './middlewares/auth.middleware.js';

// Route pour valider si un chasseur peut créer une demande de permis
router.get('/hunter/:hunterId/validation', isAuthenticated, async (req, res) => {
  try {
    const { hunterId } = req.params;

    if (!hunterId || isNaN(Number(hunterId))) {
      return res.status(400).json({ 
        message: 'ID de chasseur invalide' 
      });
    }

    const validation = await validateHunterForPermitRequest(Number(hunterId));

    res.json({
      success: true,
      validation
    });

  } catch (error) {
    console.error('Erreur lors de la validation du chasseur:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la validation',
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    });
  }
});

// Route pour valider avant la création d'une demande de permis
router.post('/hunter/:hunterId/validate-permit-creation', isAuthenticated, async (req, res) => {
  try {
    const { hunterId } = req.params;

    if (!hunterId || isNaN(Number(hunterId))) {
      return res.status(400).json({ 
        message: 'ID de chasseur invalide' 
      });
    }

    const result = await validatePermitCreation(Number(hunterId));

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Erreur lors de la validation de création de permis:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la validation',
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    });
  }
});

// Route pour obtenir le statut de complétude d'un chasseur
router.get('/hunter/:hunterId/completeness', isAuthenticated, async (req, res) => {
  try {
    const { hunterId } = req.params;

    if (!hunterId || isNaN(Number(hunterId))) {
      return res.status(400).json({ 
        message: 'ID de chasseur invalide' 
      });
    }

    const validation = await validateHunterForPermitRequest(Number(hunterId));

    // Retourner un résumé de la complétude
    res.json({
      hunterId: Number(hunterId),
      canCreatePermit: validation.canCreatePermit,
      completionPercentage: validation.completionPercentage,
      status: validation.canCreatePermit ? 'complete' : 
              validation.completionPercentage >= 70 ? 'incomplete' : 'non-conforme',
      missingDocuments: validation.missingDocuments.length,
      missingPersonalInfo: validation.missingPersonalInfo.length,
      missingWeaponInfo: validation.missingWeaponInfo.length,
      ageValid: validation.ageValid,
      age: validation.age,
      summary: {
        totalMissing: validation.missingItems.length,
        missingItems: validation.missingItems
      }
    });

  } catch (error) {
    console.error('Erreur lors de la vérification de complétude:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la vérification',
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    });
  }
});

export default router;
