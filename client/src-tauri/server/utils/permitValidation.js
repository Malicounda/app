import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/**
 * Valide si un chasseur peut créer une demande de permis
 * @param {number} hunterId - ID du chasseur
 * @returns {Promise<{canCreatePermit: boolean, missingDocuments: string[], completionPercentage: number}>}
 */
export async function validateHunterForPermitRequest(hunterId) {
  try {
    // Récupérer les informations du chasseur
    const hunter = await db.execute(sql`
      SELECT 
        id, first_name, last_name, date_of_birth, phone, region,
        weapon_type, weapon_brand, weapon_caliber,
        id_card_document, weapon_permit, hunter_photo, 
        treasury_stamp, weapon_receipt, insurance, moral_certificate
      FROM hunters 
      WHERE id = ${hunterId}
    `);

    if (hunter.length === 0) {
      throw new Error('Chasseur non trouvé');
    }

    const hunterData = hunter[0];

    // Documents obligatoires requis
    const requiredDocuments = [
      { field: 'id_card_document', name: 'Pièce d\'identité' },
      { field: 'weapon_permit', name: 'Permis de port d\'arme' },
      { field: 'hunter_photo', name: 'Photo du chasseur' },
      { field: 'treasury_stamp', name: 'Timbre impôt' },
      { field: 'weapon_receipt', name: 'Quittance de l\'arme par le trésor' },
      { field: 'insurance', name: 'Assurance' }
    ];

    // Informations personnelles obligatoires
    const requiredPersonalInfo = [
      { field: 'first_name', name: 'Prénom' },
      { field: 'last_name', name: 'Nom' },
      { field: 'date_of_birth', name: 'Date de naissance' },
      { field: 'phone', name: 'Téléphone' },
      { field: 'region', name: 'Région' }
    ];

    // Informations d'arme obligatoires
    const requiredWeaponInfo = [
      { field: 'weapon_type', name: 'Type d\'arme' },
      { field: 'weapon_brand', name: 'Marque d\'arme' },
      { field: 'weapon_caliber', name: 'Calibre d\'arme' }
    ];

    // Vérifier les informations personnelles manquantes
    const missingPersonalInfo = requiredPersonalInfo.filter(info => 
      !hunterData[info.field] || hunterData[info.field].trim() === ''
    );

    // Vérifier les informations d'arme manquantes
    const missingWeaponInfo = requiredWeaponInfo.filter(info => 
      !hunterData[info.field] || hunterData[info.field].trim() === ''
    );

    // Vérifier les documents manquants
    const missingDocuments = requiredDocuments.filter(doc => 
      !hunterData[doc.field] || hunterData[doc.field].trim() === ''
    );

    // Vérifier l'âge minimum (7 ans)
    const birthDate = new Date(hunterData.date_of_birth);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    const ageValid = age >= 7;

    // Calculer le pourcentage de completion
    const totalRequirements = requiredPersonalInfo.length + requiredWeaponInfo.length + requiredDocuments.length;
    const completedRequirements = totalRequirements - (missingPersonalInfo.length + missingWeaponInfo.length + missingDocuments.length);
    const completionPercentage = (completedRequirements / totalRequirements) * 100;

    // Compiler toutes les informations manquantes
    const allMissingItems = [
      ...missingPersonalInfo.map(item => item.name),
      ...missingWeaponInfo.map(item => item.name),
      ...missingDocuments.map(item => item.name)
    ];

    if (!ageValid) {
      allMissingItems.push('Âge minimum requis (7 ans)');
    }

    // Un chasseur peut créer une demande de permis seulement si :
    // 1. Toutes les informations personnelles sont complètes
    // 2. Toutes les informations d'arme sont complètes  
    // 3. Tous les documents obligatoires sont fournis
    // 4. L'âge minimum est respecté
    const canCreatePermit = allMissingItems.length === 0 && ageValid;

    return {
      canCreatePermit,
      missingItems: allMissingItems,
      missingDocuments: missingDocuments.map(doc => doc.name),
      missingPersonalInfo: missingPersonalInfo.map(info => info.name),
      missingWeaponInfo: missingWeaponInfo.map(info => info.name),
      completionPercentage: Math.round(completionPercentage),
      ageValid,
      age,
      hunterData: {
        id: hunterData.id,
        firstName: hunterData.first_name,
        lastName: hunterData.last_name,
        phone: hunterData.phone,
        region: hunterData.region
      }
    };

  } catch (error) {
    console.error('Erreur lors de la validation du chasseur:', error);
    throw error;
  }
}

/**
 * Valide une demande de création de permis
 * @param {number} hunterId - ID du chasseur
 * @returns {Promise<{success: boolean, message: string, validation: object}>}
 */
export async function validatePermitCreation(hunterId) {
  try {
    const validation = await validateHunterForPermitRequest(hunterId);

    if (!validation.canCreatePermit) {
      return {
        success: false,
        message: `Impossible de créer une demande de permis. Éléments manquants: ${validation.missingItems.join(', ')}`,
        validation
      };
    }

    return {
      success: true,
      message: 'Le chasseur peut créer une demande de permis',
      validation
    };

  } catch (error) {
    return {
      success: false,
      message: `Erreur lors de la validation: ${error.message}`,
      validation: null
    };
  }
}
