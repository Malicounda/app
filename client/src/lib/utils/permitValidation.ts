export const isHunterDossierComplete = (hunter: any): boolean => {
  // Vérifier l'âge minimum (7 ans)
  const ageValid = hunter?.dateOfBirth
    ? Math.floor((new Date().getTime() - new Date(hunter.dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 365)) >= 7
    : false;

  // Vérifier les informations sur l'arme
  const weaponInfoComplete = Boolean(
    hunter?.weaponType &&
    hunter?.weaponBrand &&
    hunter?.weaponCaliber
  );

  // Helper pour vérifier l'expiration
  const isExpired = (dateString?: string) => {
    if (!dateString) return false;
    const d = new Date(dateString);
    return !isNaN(d.getTime()) && d < new Date();
  };

  // Vérifier les documents obligatoires (présence seulement, ignorer l'expiration)
  const requiredDocsValid = [
    { present: !!hunter?.idCardDocument, notExpired: true }, // Ignorer l'expiration
    { present: !!hunter?.weaponPermit, notExpired: true }, // Ignorer l'expiration
    { present: !!hunter?.hunterPhoto, notExpired: true }, // Photo n'a pas d'expiration
    { present: !!hunter?.treasuryStamp, notExpired: true }, // Ignorer l'expiration
    { present: !!hunter?.weaponReceipt, notExpired: true }, // Ignorer l'expiration
    { present: !!hunter?.insurance, notExpired: true }, // Ignorer l'expiration
  ];

  const allDocsOk = requiredDocsValid.every(d => d.present && d.notExpired);

  // Le dossier est complet si toutes les conditions sont remplies
  return ageValid && weaponInfoComplete && allDocsOk;
};

export const getHunterDossierStatus = (hunter: any) => {
  const isComplete = isHunterDossierComplete(hunter);
  

  // Vérifier l'âge
  const ageValid = hunter?.dateOfBirth
    ? Math.floor((new Date().getTime() - new Date(hunter.dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 365)) >= 7
    : false;

  // Vérifier les informations sur l'arme
  const weaponInfoComplete = Boolean(
    hunter?.weaponType &&
    hunter?.weaponBrand &&
    hunter?.weaponCaliber
  );

  // Helper expiration
  const isExpired = (dateString?: string) => {
    if (!dateString) return false;
    const d = new Date(dateString);
    return !isNaN(d.getTime()) && d < new Date();
  };

  // Vérifier les documents obligatoires (ignorer l'expiration pour le statut global)
  const requiredDocs = [
    { name: "Pièce d'identité", value: hunter?.idCardDocument, expired: false }, // Ignorer l'expiration
    { name: "Permis de port d'arme", value: hunter?.weaponPermit, expired: false }, // Ignorer l'expiration
    { name: 'Photo du chasseur', value: hunter?.hunterPhoto, expired: false }, // Photo n'expire pas
    { name: 'Timbre impôt', value: hunter?.treasuryStamp, expired: false }, // Ignorer l'expiration
    { name: "Quittance de l'arme par le trésor", value: hunter?.weaponReceipt, expired: false }, // Ignorer l'expiration
    { name: 'Assurance', value: hunter?.insurance, expired: false }, // Ignorer l'expiration
  ];

  const missingItems: string[] = [];

  if (!ageValid) {
    missingItems.push('Âge minimum de 7 ans non atteint');
  }

  if (!weaponInfoComplete) {
    missingItems.push("Informations sur l'arme incomplètes");
  }

  requiredDocs.forEach(doc => {
    if (!doc.value) {
      missingItems.push(`${doc.name} manquant`);
    } else if (doc.expired) {
      missingItems.push(`${doc.name} expiré`);
    }
  });

  return {
    isComplete,
    ageValid,
    weaponInfoComplete,
    requiredDocs,
    missingItems,
    status: isComplete
      ? 'complete'
      : (ageValid && weaponInfoComplete ? 'incomplete' : 'non-conforme'),
  };
};
