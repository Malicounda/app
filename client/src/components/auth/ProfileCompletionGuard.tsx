import React from 'react';

/**
 * Ce composant ne gère plus les redirections pour le choix de profil.
 * Il est conservé pour des raisons de compatibilité mais ne fait que rendre ses enfants.
 */
const ProfileCompletionGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Ne plus effectuer de redirections automatiques
    // Les nouveaux utilisateurs devront être redirigés manuellement depuis le flux d'inscription
    
    return <>{children}</>;
};

export default ProfileCompletionGuard;