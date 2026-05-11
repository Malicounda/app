// Script pour désactiver temporairement les fonctionnalités PWA problématiques
/*
// Désactiver le service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const registration of registrations) {
      registration.unregister();
      console.log('Service Worker désactivé');
    }
  });
}

// Désactiver le cache
if ('caches' in window) {
  caches.keys().then(cacheNames => {
    cacheNames.forEach(cacheName => {
      caches.delete(cacheName);
      console.log(`Cache ${cacheName} supprimé`);
    });
  });
}

// Désactiver IndexedDB pour le stockage hors ligne
const disableIndexedDB = async () => {
  try {
    const DBDeleteRequest = indexedDB.deleteDatabase('offlineStorage');
    DBDeleteRequest.onsuccess = () => console.log('IndexedDB supprimée');
    DBDeleteRequest.onerror = () => console.error('Erreur lors de la suppression de IndexedDB');
  } catch (error) {
    console.error('Erreur lors de la tentative de suppression de IndexedDB:', error);
  }
};

disableIndexedDB();

console.log('Fonctionnalités PWA temporairement désactivées pour le débogage');
*/
