// Utilitaires pour la PWA et le mode hors ligne

// Fonction d'initialisation des fonctionnalités PWA
export function initPWA() {
  // Enregistrer le service worker
  registerServiceWorker();

  // Configurer le fetch pour le mode hors ligne
  createOfflineFetch();

  // Vérifier/créer les stores IndexedDB manquants au démarrage
  forceCreateMissingStores()
    .then(() => {
      console.log('[PWA] Stores IndexedDB vérifiés');
      // Nettoyer les entrées de cache expirées
      return cleanExpiredCache();
    })
    .catch((err) => {
      console.warn('[PWA] Erreur initialisation IndexedDB:', err);
    });

  // Configurer les écouteurs de connectivité
  setupConnectivityListeners(
    () => {
      console.log('Application en ligne');
      // Tenter de synchroniser les requêtes en attente
      syncPendingRequests().then(({ success, failed }) => {
        if (success > 0 || failed > 0) {
          console.log(`Synchronisation terminée: ${success} requêtes synchronisées, ${failed} échecs`);
        }
      }).catch(console.error);
    },
    () => console.warn('Application hors ligne')
  );
}

// Détection d'exécution dans Electron (processus renderer)
const isElectron = typeof window !== 'undefined' && (
  // variable exposée par preload si nécessaire
  (window as any).isElectron === true ||
  // détection par userAgent
  navigator.userAgent.toLowerCase().includes('electron') ||
  // détection par présence de versions Electron (si exposé)
  (typeof process !== 'undefined' && (process as any).versions && (process as any).versions.electron)
);

// Fonction pour enregistrer le service worker
export function registerServiceWorker() {
  // En environnement Electron (file://), ne pas enregistrer de service worker
  if (isElectron) {
    console.log('PWA: exécution Electron détectée, pas d\'enregistrement de Service Worker');
    return;
  }

  if ('serviceWorker' in navigator) {
    // N'enregistrer le SW qu'en production et en contexte sécurisé (https ou localhost)
    // Vite fournit import.meta.env.PROD côté client
    const isProd = ((import.meta as any).env?.PROD) === true;
    const isSecureContext = location.protocol === 'https:' || location.hostname === 'localhost';
    if (!isProd) {
      console.log('PWA: Service Worker désactivé en mode développement');
      return;
    }
    if (!isSecureContext) {
      console.log('PWA: Contexte non sécurisé, Service Worker non enregistré');
      return;
    }

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then(registration => {
          console.log('Service Worker enregistré avec succès:', registration.scope);

          // Vérifier régulièrement les mises à jour (optionnel, mais utile pour les PWA ouvertes longtemps)
          setInterval(() => {
            registration.update();
          }, 1000 * 60 * 60); // Toutes les heures

          // Écouter l'arrivée d'un nouveau Service Worker
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                // Si le nouveau SW est installé et qu'un ancien contrôle déjà la page
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('Nouvelle version disponible !');
                  // Déclencher un événement personnalisé que React pourra écouter
                  window.dispatchEvent(new CustomEvent('pwa-update-available', { detail: newWorker }));
                }
              });
            }
          });
        })
        .catch(error => {
          console.error('Erreur lors de l\'enregistrement du Service Worker:', error);
        });
    });

    // Recharger la page dès que le nouveau Service Worker prend le contrôle
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }
}

// Gestionnaire d'état de connexion
export function setupConnectivityListeners(onlineCallback: () => void, offlineCallback: () => void) {
  // Vérifier l'état initial
  if (navigator.onLine) {
    onlineCallback();
  } else {
    offlineCallback();
  }

  // Ajouter des écouteurs pour les changements d'état
  window.addEventListener('online', () => {
    onlineCallback();
    // Informer le service worker du changement d'état
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'ONLINE_STATUS_CHANGE',
        online: true
      });
    }
  });

  window.addEventListener('offline', offlineCallback);
}

// Base de données IndexedDB pour le stockage local
const DB_NAME = 'permis-chasse-offline-db';
const DB_VERSION = 4; // v4: ajout apiCache, domaines, users + migration défensive

// Durée maximale de validité du cache (24 heures)
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

// Configuration centralisée de tous les stores
const STORES_CONFIG = [
  { name: 'permits', keyPath: 'id' },
  { name: 'hunters', keyPath: 'id' },
  { name: 'requests', keyPath: 'id' },
  { name: 'activities', keyPath: 'id' },
  { name: 'alerts', keyPath: 'id' },
  { name: 'domaines', keyPath: 'id' },
  { name: 'users', keyPath: 'id' },
  {
    name: 'apiCache',
    keyPath: 'url',
    indexes: [
      { name: 'cachedAt', keyPath: 'cachedAt', options: { unique: false } }
    ]
  },
  {
    name: 'pendingSync',
    options: { keyPath: 'id', autoIncrement: true },
    indexes: [
      { name: 'timestamp', keyPath: 'timestamp', options: { unique: false } }
    ]
  }
] as const;

// Fonction défensive pour s'assurer que tous les stores requis existent
// Si un store manque, on force une migration en incrémentant la version
async function forceCreateMissingStores(): Promise<void> {
  return new Promise((resolve, reject) => {
    // D'abord vérifier l'état actuel
    const checkRequest = indexedDB.open(DB_NAME);

    checkRequest.onsuccess = () => {
      const db = checkRequest.result;
      const missingStores = STORES_CONFIG.filter(
        s => !db.objectStoreNames.contains(s.name)
      );
      const currentVersion = db.version;
      db.close();

      if (missingStores.length === 0) {
        resolve();
        return;
      }

      console.log(`[IndexedDB] ${missingStores.length} store(s) manquant(s), migration forcée...`);

      // Ouvrir avec une version supérieure pour déclencher onupgradeneeded
      const newVersion = Math.max(currentVersion, DB_VERSION) + 1;
      const upgradeRequest = indexedDB.open(DB_NAME, newVersion);

      upgradeRequest.onupgradeneeded = (event) => {
        const upgradedDb = (event.target as IDBOpenDBRequest).result;
        applyIdempotentMigration(upgradedDb, event);
      };

      upgradeRequest.onsuccess = () => {
        upgradeRequest.result.close();
        console.log('[IndexedDB] Migration forcée terminée');
        resolve();
      };

      upgradeRequest.onerror = (event) => {
        console.error('[IndexedDB] Erreur migration forcée:', event);
        reject(new Error('Migration forcée échouée'));
      };

      upgradeRequest.onblocked = () => {
        console.warn('[IndexedDB] Migration bloquée par un autre onglet');
        resolve(); // Ne pas bloquer l'app
      };
    };

    checkRequest.onerror = () => {
      console.error('[IndexedDB] Erreur vérification stores');
      resolve(); // Ne pas bloquer l'app
    };
  });
}

// Migration idempotente : crée tous les stores manquants sans toucher aux existants
function applyIdempotentMigration(db: IDBDatabase, event: IDBVersionChangeEvent) {
  const oldVersion = event.oldVersion;
  console.log(`[IndexedDB] Migration v${oldVersion} → v${event.newVersion}`);

  for (const storeConfig of STORES_CONFIG) {
    if (!db.objectStoreNames.contains(storeConfig.name)) {
      try {
        const storeOptions = ('options' in storeConfig && storeConfig.options)
          ? storeConfig.options
          : { keyPath: ('keyPath' in storeConfig ? storeConfig.keyPath : 'id') };
        const store = db.createObjectStore(storeConfig.name, storeOptions as IDBObjectStoreParameters);

        if ('indexes' in storeConfig && storeConfig.indexes) {
          for (const index of storeConfig.indexes) {
            try {
              store.createIndex(index.name, index.keyPath, index.options);
            } catch (indexError) {
              console.warn(`[IndexedDB] Index ${index.name} pour ${storeConfig.name}:`, indexError);
            }
          }
        }
        console.log(`[IndexedDB] Store ${storeConfig.name} créé`);
      } catch (createError) {
        console.error(`[IndexedDB] Erreur création store ${storeConfig.name}:`, createError);
      }
    } else if (oldVersion > 0 && 'indexes' in storeConfig && storeConfig.indexes) {
      // Mettre à jour les index sur les stores existants
      const transaction = (event.target as IDBOpenDBRequest).transaction;
      if (transaction) {
        try {
          const store = transaction.objectStore(storeConfig.name);
          const existingIndexes = new Set(Array.from(store.indexNames));
          for (const index of storeConfig.indexes) {
            if (!existingIndexes.has(index.name)) {
              store.createIndex(index.name, index.keyPath, index.options);
              console.log(`[IndexedDB] Index ${index.name} ajouté à ${storeConfig.name}`);
            }
          }
        } catch (e) {
          console.warn(`[IndexedDB] Mise à jour index ${storeConfig.name}:`, e);
        }
      }
    }
  }

  // Supprimer les stores obsolètes (dont 'misc' qui est remplacé par 'apiCache')
  const storesToKeep = new Set<string>(STORES_CONFIG.map(s => s.name));
  for (let i = 0; i < db.objectStoreNames.length; i++) {
    const storeName = db.objectStoreNames[i];
    if (!storesToKeep.has(storeName)) {
      try {
        db.deleteObjectStore(storeName);
        console.log(`[IndexedDB] Store obsolète ${storeName} supprimé`);
      } catch (deleteError) {
        console.warn(`[IndexedDB] Suppression store ${storeName}:`, deleteError);
      }
    }
  }
}

// Fonction pour ouvrir la base de données
export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const openRequest = indexedDB.open(DB_NAME, DB_VERSION);

    openRequest.onerror = (event) => {
      console.error('[IndexedDB] Erreur ouverture:', event);
      // Fallback : ouvrir sans version spécifique
      const readOnlyRequest = indexedDB.open(DB_NAME);
      readOnlyRequest.onsuccess = () => resolve(readOnlyRequest.result);
      readOnlyRequest.onerror = () => reject(new Error('Impossible d\'ouvrir IndexedDB'));
    };

    openRequest.onsuccess = (event: Event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      db.onversionchange = () => {
        try { db.close(); } catch { }
        console.warn('[IndexedDB] Changement de version détecté (autre onglet)');
      };

      resolve(db);
    };

    openRequest.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      // Utiliser la migration idempotente centralisée
      applyIdempotentMigration(db, event);
    };

    openRequest.onblocked = () => {
      console.warn('[IndexedDB] DB bloquée par un autre onglet, tentative de réouverture...');
      const retryRequest = indexedDB.open(DB_NAME, DB_VERSION);
      retryRequest.onsuccess = () => resolve(retryRequest.result);
      retryRequest.onerror = () => {
        reject(new Error('IndexedDB bloquée par un autre onglet'));
      };
    };
  });
}

// Fonction pour s'assurer qu'un store existe, avec migration forcée si nécessaire
async function ensureStoreExists(storeName: string): Promise<IDBDatabase> {
  try {
    let db = await openDatabase();

    if (db.objectStoreNames.contains(storeName)) {
      return db;
    }

    // Le store manque → forcer la migration
    console.log(`[IndexedDB] Store ${storeName} manquant, migration forcée...`);
    db.close();

    try {
      await forceCreateMissingStores();
    } catch (migrationError) {
      console.warn('[IndexedDB] Migration forcée échouée:', migrationError);
    }

    // Réouvrir après migration
    db = await openDatabase();

    if (!db.objectStoreNames.contains(storeName)) {
      console.warn(`[IndexedDB] Store ${storeName} toujours absent après migration`);
    }

    return db;
  } catch (error) {
    console.error(`[IndexedDB] Erreur ensureStoreExists(${storeName}):`, error);
    return await openDatabase();
  }
}

// Fonction générique pour stocker des données
export async function storeData<T>(storeName: string, data: T): Promise<void> {
  try {
    const db = await ensureStoreExists(storeName);

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);

        const request = store.put(data);

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = (event) => {
          console.error(`Erreur lors du stockage des données dans ${storeName}:`, event);
          reject(new Error(`Impossible de stocker les données dans ${storeName}`));
        };

        transaction.oncomplete = () => {
          db.close();
        };

        transaction.onerror = (event) => {
          console.error(`Erreur de transaction pour le store ${storeName}:`, event);
          reject(new Error(`Erreur de transaction pour le store ${storeName}`));
        };
      } catch (error) {
        const err = error as Error;
        console.error(`Erreur lors de l'accès au store ${storeName}:`, err);
        reject(new Error(`Impossible d'accéder au store ${storeName}: ${err.message || 'Erreur inconnue'}`));
      }
    });
  } catch (error) {
    const err = error as Error;
    console.error(`Erreur lors de l'ouverture de la base de données pour le store ${storeName}:`, err);
    throw new Error(`Impossible d'ouvrir la base de données: ${err.message || 'Erreur inconnue'}`);
  }
}

// Fonction générique pour récupérer des données
export async function getData<T>(storeName: string, id: string | number): Promise<T | null> {
  try {
    const db = await ensureStoreExists(storeName);

    // Si le store n'existe pas, retourner null au lieu de générer une erreur
    if (!db.objectStoreNames.contains(storeName)) {
      console.warn(`Le store ${storeName} n'existe pas.`);
      db.close();
      return null;
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);

        const request = store.get(id);

        request.onsuccess = () => {
          resolve(request.result || null);
        };

        request.onerror = (event) => {
          console.error(`Erreur lors de la récupération des données depuis ${storeName}:`, event);
          reject(new Error(`Impossible de récupérer les données depuis ${storeName}`));
        };

        transaction.oncomplete = () => {
          db.close();
        };

        transaction.onerror = (event) => {
          console.error(`Erreur de transaction pour le store ${storeName}:`, event);
          reject(new Error(`Erreur de transaction pour le store ${storeName}`));
        };
      } catch (error) {
        const err = error as Error;
        console.error(`Erreur lors de l'accès au store ${storeName}:`, err);
        reject(new Error(`Impossible d'accéder au store ${storeName}: ${err.message || 'Erreur inconnue'}`));
      }
    });
  } catch (error) {
    const err = error as Error;
    console.error(`Erreur lors de l'ouverture de la base de données pour le store ${storeName}:`, err);
    throw new Error(`Impossible d'ouvrir la base de données: ${err.message || 'Erreur inconnue'}`);
  }
}

// Fonction générique pour récupérer toutes les données
export async function getAllData<T>(storeName: string): Promise<T[]> {
  try {
    const db = await ensureStoreExists(storeName);

    // Si le store n'existe pas, retourner un tableau vide au lieu de générer une erreur
    if (!db.objectStoreNames.contains(storeName)) {
      console.warn(`Le store ${storeName} n'existe pas.`);
      db.close();
      return [];
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);

        const request = store.getAll();

        request.onsuccess = () => {
          resolve(request.result || []);
        };

        request.onerror = (event) => {
          console.error(`Erreur lors de la récupération de toutes les données depuis ${storeName}:`, event);
          reject(new Error(`Impossible de récupérer toutes les données depuis ${storeName}`));
        };

        transaction.oncomplete = () => {
          db.close();
        };

        transaction.onerror = (event) => {
          console.error(`Erreur de transaction pour le store ${storeName}:`, event);
          reject(new Error(`Erreur de transaction pour le store ${storeName}`));
        };
      } catch (error) {
        const err = error as Error;
        console.error(`Erreur lors de l'accès au store ${storeName}:`, err);
        reject(new Error(`Impossible d'accéder au store ${storeName}: ${err.message || 'Erreur inconnue'}`));
      }
    });
  } catch (error) {
    console.error(`Erreur lors de l'ouverture de la base de données pour le store ${storeName}:`, error);
    // En cas d'erreur, retourner un tableau vide pour éviter de bloquer l'application
    return [];
  }
}

// Fonction pour enregistrer une requête pour synchronisation ultérieure
export async function savePendingRequest(url: string, method: string, body: any): Promise<void> {
  if (!url || !method) {
    console.error('URL et méthode requises pour enregistrer une requête en attente');
    return;
  }

  const pendingRequest = {
    id: Date.now().toString(),
    url,
    method,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    timestamp: Date.now(),
    attempts: 0,
    lastAttempt: null,
    status: 'pending'
  };

  console.log(`Enregistrement de la requête ${method} ${url} pour synchronisation ultérieure`);

  try {
    await storeData('pendingSync', pendingRequest);

    // Tenter de synchroniser immédiatement si en ligne
    if (navigator.onLine) {
      console.log('Tentative de synchronisation immédiate...');
      await syncPendingRequests().catch(error => {
        console.error('Erreur lors de la synchronisation immédiate:', error);
      });
    }
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement de la requête en attente:', error);
    throw error; // Propager l'erreur pour permettre une gestion par l'appelant
  }
}

// Fonction pour afficher une notification
function showNotification(title: string, message: string, type: 'success' | 'error' | 'info' = 'info') {
  // Vérifier si l'API de notification est disponible
  if (!('Notification' in window)) {
    console.log('Les notifications du navigateur ne sont pas supportées.');
    return;
  }

  // Vérifier si les notifications sont autorisées
  if (Notification.permission === 'granted') {
    // Créer une notification
    const notification = new Notification(title, {
      body: message,
      icon: '/logo_forets.png',
      tag: 'sync-notification'
    });

    // Fermer la notification après 5 secondes
    setTimeout(() => notification.close(), 5000);
  } else if (Notification.permission !== 'denied') {
    // Demander la permission si elle n'a pas encore été demandée
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        showNotification(title, message, type);
      }
    });
  }
}

// Fonction pour synchroniser les requêtes en attente
export async function syncPendingRequests(maxAttempts = 3): Promise<{ success: number; failed: number }> {
  if (!navigator.onLine) {
    const message = 'Hors ligne, impossible de synchroniser les requêtes en attente';
    console.log(message);
    showNotification('Synchronisation échouée', message, 'error');
    return { success: 0, failed: 0 };
  }

  let db: IDBDatabase;
  try {
    db = await openDatabase();
  } catch (error) {
    const message = 'Erreur lors de l\'ouverture de la base de données';
    console.error(message, error);
    showNotification('Erreur de synchronisation', message, 'error');
    return { success: 0, failed: 0 };
  }

  // Afficher une notification de début de synchronisation
  showNotification('Synchronisation', 'Début de la synchronisation des données...', 'info');

  let successCount = 0;
  let failedCount = 0;

  try {
    // Récupérer toutes les requêtes en attente dans une transaction en lecture seule
    const pendingRequests = await new Promise<any[]>((resolve, reject) => {
      const transaction = db.transaction('pendingSync', 'readonly');
      const store = transaction.objectStore('pendingSync');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (event) => {
        console.error('Erreur lors de la récupération des requêtes en attente:', event);
        reject(new Error('Impossible de récupérer les requêtes en attente'));
      };
    });

    if (pendingRequests.length === 0) {
      console.log('Aucune requête en attente à synchroniser');
      db.close();
      return { success: 0, failed: 0 };
    }

    console.log(`Tentative de synchronisation de ${pendingRequests.length} requêtes en attente`);

    // Trier les requêtes par ordre chronologique (les plus anciennes d'abord)
    pendingRequests.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    // Limiter le nombre de tentatives de synchronisation
    const requestsToProcess = pendingRequests.filter(req => {
      const attempts = req.attempts || 0;
      return attempts < maxAttempts;
    });

    if (requestsToProcess.length === 0) {
      const message = 'Toutes les requêtes ont dépassé le nombre maximum de tentatives';
      console.log(message);
      showNotification('Synchronisation échouée', message, 'error');
      return { success: 0, failed: pendingRequests.length };
    }

    console.log(`Traitement de ${requestsToProcess.length} requêtes sur ${pendingRequests.length}`);

    // Statuts HTTP considérés comme non-réessayables (erreurs côté client, conflit, validation, etc.)
    const nonRetryableStatuses = new Set([400, 404, 405, 409, 422]);

    // Traiter les requêtes une par une avec des transactions séparées
    for (const request of requestsToProcess) {
      const requestId = request.id?.substring(0, 8) || 'unknown'; // ID court pour les logs
      const requestMethod = request.method || 'GET';
      const requestPath = (() => {
        try {
          return new URL(request.url).pathname;
        } catch {
          return request.url;
        }
      })();

      try {
        // Mettre à jour le nombre de tentatives
        const updatedRequest = {
          ...request,
          attempts: (request.attempts || 0) + 1,
          lastAttempt: new Date().toISOString()
        };

        // Mettre à jour la requête dans la base de données avec une transaction dédiée
        await new Promise<void>((resolve, reject) => {
          try {
            const updateTransaction = db.transaction('pendingSync', 'readwrite');

            updateTransaction.oncomplete = () => resolve();
            updateTransaction.onerror = (event) => {
              console.error(`[${requestId}] Erreur de transaction:`, event);
              reject(new Error('Erreur de transaction'));
            };

            const updateStore = updateTransaction.objectStore('pendingSync');
            const updateRequest = updateStore.put(updatedRequest);

            updateRequest.onsuccess = () => {
              // Ne pas fermer la connexion ici, la transaction se fermera automatiquement
              // avec oncomplete
            };

            updateRequest.onerror = (event) => {
              console.error(`[${requestId}] Erreur lors de la mise à jour:`, event);
              reject(new Error('Mise à jour échouée'));
            };
          } catch (error) {
            console.error(`[${requestId}] Erreur lors de la création de la transaction:`, error);
            reject(error);
          }
        });

        // Préparer les en-têtes
        const headers: HeadersInit = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('token');
        if (token) headers['Authorization'] = `Bearer ${token}`;

        // Exécuter la requête
        console.log(`[${requestId}] Envoi de la requête vers ${request.url}`);
        const response = await fetch(request.url, {
          method: requestMethod,
          headers,
          body: request.body,
          credentials: 'include'
        });

        if (response.ok) {
          // Supprimer la requête synchronisée avec une transaction dédiée
          await new Promise<void>((resolve, reject) => {
            try {
              const deleteTransaction = db.transaction('pendingSync', 'readwrite');

              deleteTransaction.oncomplete = () => {
                console.log(`[${requestId}] Requête synchronisée et supprimée`);
                successCount++;
                showNotification(
                  'Synchronisation réussie',
                  `Requête ${requestMethod} vers ${requestPath} traitée avec succès`,
                  'success'
                );
                resolve();
              };

              deleteTransaction.onerror = (event) => {
                console.error(`[${requestId}] Erreur de transaction lors de la suppression:`, event);
                // On considère quand même la synchronisation comme réussie
                successCount++;
                resolve();
              };

              const deleteStore = deleteTransaction.objectStore('pendingSync');
              const deleteRequest = deleteStore.delete(request.id);

              deleteRequest.onsuccess = () => {
                // La suppression sera confirmée par oncomplete de la transaction
              };

              deleteRequest.onerror = (event) => {
                console.error(`[${requestId}] Erreur lors de la suppression:`, event);
                // On considère quand même la synchronisation comme réussie
                successCount++;
                resolve();
              };
            } catch (error) {
              console.error(`[${requestId}] Erreur lors de la création de la transaction de suppression:`, error);
              // On considère quand même la synchronisation comme réussie
              successCount++;
              resolve();
            }
          });
        } else {
          console.error(`[${requestId}] Erreur HTTP ${response.status}: ${response.statusText}`);

          // Si erreur d'authentification, supprimer la requête
          if (response.status === 401 || response.status === 403) {
            console.log(`[${requestId}] Suppression en raison d'une erreur d'authentification (${response.status})`);
            await new Promise<void>((resolve) => {
              try {
                const deleteTransaction = db.transaction('pendingSync', 'readwrite');

                deleteTransaction.oncomplete = () => {
                  console.log(`[${requestId}] Requête supprimée après erreur d'authentification`);
                  resolve();
                };

                deleteTransaction.onerror = (event) => {
                  console.error(`[${requestId}] Erreur lors de la suppression après 401:`, event);
                  resolve();
                };

                const deleteStore = deleteTransaction.objectStore('pendingSync');
                const deleteRequest = deleteStore.delete(request.id);

                deleteRequest.onsuccess = () => {
                  // La suppression sera confirmée par oncomplete
                };

                deleteRequest.onerror = (event) => {
                  console.error(`[${requestId}] Erreur lors de la suppression après 401:`, event);
                  resolve();
                };
              } catch (error) {
                console.error(`[${requestId}] Erreur lors de la suppression après 401:`, error);
                resolve();
              }
            });

            // Ne pas compter comme un échec pour ne pas bloquer les autres requêtes
            continue;
          }

          const attemptsSoFar = updatedRequest.attempts ?? 0;
          const shouldDiscardStatus = nonRetryableStatuses.has(response.status);
          const reachedAttemptLimit = attemptsSoFar >= maxAttempts;

          if (shouldDiscardStatus || reachedAttemptLimit) {
            await new Promise<void>((resolve) => {
              try {
                const deleteTransaction = db.transaction('pendingSync', 'readwrite');

                deleteTransaction.oncomplete = () => {
                  console.log(`[${requestId}] Requête supprimée après ${shouldDiscardStatus ? `statut ${response.status}` : `${attemptsSoFar} tentative(s)`}`);
                  resolve();
                };

                deleteTransaction.onerror = (event) => {
                  console.error(`[${requestId}] Erreur lors de la suppression après abandon:`, event);
                  resolve();
                };

                const deleteStore = deleteTransaction.objectStore('pendingSync');
                const deleteRequest = deleteStore.delete(request.id);

                deleteRequest.onsuccess = () => {
                  // La suppression sera confirmée par oncomplete
                };

                deleteRequest.onerror = (event) => {
                  console.error(`[${requestId}] Erreur lors de la suppression après abandon:`, event);
                  resolve();
                };
              } catch (error) {
                console.error(`[${requestId}] Erreur lors de la suppression après abandon:`, error);
                resolve();
              }
            });

            failedCount++;
            const message = shouldDiscardStatus
              ? `Requête ${requestMethod} vers ${requestPath} ignorée (${response.status} ${response.statusText})`
              : `Requête ${requestMethod} vers ${requestPath} abandonnée après ${attemptsSoFar} tentative(s)`;
            showNotification(
              'Synchronisation abandonnée',
              message,
              shouldDiscardStatus ? 'info' : 'error'
            );
            continue;
          }

          failedCount++;
          showNotification(
            'Erreur de synchronisation',
            `Échec de la requête ${requestMethod} (${response.status} ${response.statusText})`,
            'error'
          );
        }
      } catch (error) {
        console.error(`[${requestId}] Erreur lors du traitement:`, error);
        failedCount++;

        if (error instanceof Error) {
          showNotification(
            'Erreur de synchronisation',
            `Erreur lors du traitement d'une requête: ${error.message}`,
            'error'
          );
        }
      }

      // Petite pause entre les requêtes pour éviter de surcharger le serveur
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Afficher un résumé de la synchronisation
    if (successCount > 0 || failedCount > 0) {
      const message = `Synchronisation terminée: ${successCount} réussie(s), ${failedCount} échouée(s)`;
      console.log(message);
      showNotification(
        'Synchronisation terminée',
        message,
        failedCount === 0 ? 'success' : 'error'
      );
    }

    return { success: successCount, failed: failedCount };

  } catch (error) {
    const message = 'Erreur critique lors de la synchronisation';
    console.error(message, error);
    showNotification('Erreur critique', message, 'error');
    return { success: successCount, failed: failedCount };

  } finally {
    if (db) {
      try {
        // Nettoyer les requêtes obsolètes ou en double avec une nouvelle connexion
        await cleanUpPendingRequests();
      } catch (error) {
        console.error('Erreur lors du nettoyage des requêtes:', error);
      } finally {
        db.close();
      }
    }
  }
}

// Fonction pour nettoyer les requêtes en double ou obsolètes
async function cleanUpPendingRequests(): Promise<void> {
  // Ouvrir une nouvelle connexion pour éviter "The database connection is closing"
  const db = await openDatabase().catch(() => null);
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction('pendingSync', 'readwrite');
      const store = transaction.objectStore('pendingSync');
      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = () => {
        const requests = getAllRequest.result || [];
        const seen = new Map();
        const now = Date.now();
        const ONE_DAY = 24 * 60 * 60 * 1000; // 1 jour en millisecondes

        // Parcourir les requêtes et identifier les doublons et les requêtes trop anciennes
        const toDelete = [];

        for (const request of requests) {
          const key = `${request.method}:${request.url}:${JSON.stringify(request.body)}`;
          const existing = seen.get(key);

          // Vérifier si la requête est trop ancienne (plus de 7 jours)
          const requestDate = request.timestamp ? new Date(request.timestamp).getTime() : 0;
          if (now - requestDate > 7 * ONE_DAY) {
            toDelete.push(request.id);
            continue;
          }

          // Si on a déjà vu une requête identique, on garde la plus récente
          if (existing) {
            const existingDate = existing.timestamp ? new Date(existing.timestamp).getTime() : 0;
            if (requestDate > existingDate) {
              toDelete.push(existing.id);
              seen.set(key, request);
            } else {
              toDelete.push(request.id);
            }
          } else {
            seen.set(key, request);
          }
        }

        // Supprimer les requêtes identifiées
        if (toDelete.length === 0) {
          resolve();
          return;
        }

        let completed = 0;
        const onComplete = () => {
          completed++;
          if (completed === toDelete.length) {
            console.log(`Nettoyage terminé: ${toDelete.length} requêtes supprimées`);
            resolve();
          }
        };

        for (const id of toDelete) {
          const deleteRequest = store.delete(id);
          deleteRequest.onsuccess = onComplete;
          deleteRequest.onerror = (event) => {
            console.error('Erreur lors de la suppression d\'une requête obsolète:', event);
            onComplete();
          };
        }
      };

      getAllRequest.onerror = (event) => {
        console.error('Erreur lors de la récupération des requêtes pour le nettoyage:', event);
        resolve();
      };

      transaction.oncomplete = () => {
        try { db.close(); } catch { }
        // La transaction est terminée
      };

      transaction.onerror = (event) => {
        console.error('Erreur lors de la transaction de nettoyage:', event);
        resolve();
      };
    } catch (error) {
      console.error('Erreur lors du nettoyage des requêtes:', error);
      try { db.close(); } catch { }
      resolve();
    }
  });
}

// Fonction utilitaire pour obtenir le nom du store à partir d'une URL
function getStoreNameFromUrl(url: string): string {
  if (url.includes('/hunters')) return 'hunters';
  if (url.includes('/alerts')) return 'alerts';
  if (url.includes('/permits')) return 'permits';
  if (url.includes('/requests')) return 'requests';
  if (url.includes('/activities')) return 'activities';
  if (url.includes('/users')) return 'users';
  if (url.includes('/domaines')) return 'domaines';
  // Tous les endpoints non mappés → apiCache (évite le fourre-tout misc)
  return 'apiCache';
}

// === Cache API dans IndexedDB ===

// Stocker une réponse API dans le cache IndexedDB avec expiration
async function cacheApiResponse(url: string, data: any): Promise<void> {
  try {
    const db = await ensureStoreExists('apiCache');
    if (!db.objectStoreNames.contains('apiCache')) {
      db.close();
      return;
    }

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction('apiCache', 'readwrite');
        const store = transaction.objectStore('apiCache');
        store.put({
          url,
          data,
          cachedAt: Date.now()
        });
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          resolve();
        };
      } catch {
        db.close();
        resolve();
      }
    });
  } catch {
    // Silencieux : le cache est un bonus, pas critique
  }
}

// Récupérer une réponse API depuis le cache IndexedDB (avec vérification d'expiration)
async function getCachedApiResponse(url: string): Promise<any | null> {
  try {
    const db = await ensureStoreExists('apiCache');
    if (!db.objectStoreNames.contains('apiCache')) {
      db.close();
      return null;
    }

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction('apiCache', 'readonly');
        const store = transaction.objectStore('apiCache');
        const request = store.get(url);

        request.onsuccess = () => {
          const result = request.result;
          if (!result) {
            resolve(null);
            return;
          }

          // Vérifier l'expiration (24h)
          const age = Date.now() - (result.cachedAt || 0);
          if (age > CACHE_MAX_AGE) {
            // Données expirées, les supprimer
            try {
              const delTx = db.transaction('apiCache', 'readwrite');
              delTx.objectStore('apiCache').delete(url);
              delTx.oncomplete = () => db.close();
            } catch { db.close(); }
            resolve(null);
            return;
          }

          resolve(result.data);
        };

        request.onerror = () => resolve(null);
        transaction.oncomplete = () => db.close();
      } catch {
        db.close();
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

// Nettoyer les entrées expirées du cache
async function cleanExpiredCache(): Promise<void> {
  try {
    const db = await openDatabase();
    if (!db.objectStoreNames.contains('apiCache')) {
      db.close();
      return;
    }

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction('apiCache', 'readwrite');
        const store = transaction.objectStore('apiCache');
        const request = store.getAll();

        request.onsuccess = () => {
          const entries = request.result || [];
          const now = Date.now();
          let cleaned = 0;

          for (const entry of entries) {
            if (now - (entry.cachedAt || 0) > CACHE_MAX_AGE) {
              store.delete(entry.url);
              cleaned++;
            }
          }

          if (cleaned > 0) {
            console.log(`[IndexedDB] ${cleaned} entrée(s) de cache expirée(s) supprimée(s)`);
          }
        };

        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          resolve();
        };
      } catch {
        db.close();
        resolve();
      }
    });
  } catch {
    // Silencieux
  }
}

// Gestionnaire d'erreur générique pour les appels API
function handleApiError(error: unknown, url: string, method: string): never {
  const errorMessage = 'Impossible de se connecter au serveur et aucune donnée en cache disponible';
  const errorDetails = {
    url,
    method,
    error: error instanceof Error ? error.message : 'Erreur inconnue'
  };

  console.error(errorMessage, errorDetails);
  throw new Error(errorMessage);
}

// Fonction pour gérer la récupération des données hors ligne
async function handleOfflineData(url: string): Promise<Response> {
  console.log(`Récupération des données hors ligne pour ${url}`);

  // Déterminer le store approprié et l'ID en fonction de l'URL
  let storeName = 'misc';
  let id: string | null = null;

  // Analyser l'URL pour déterminer le store et l'ID
  if (url.includes('/hunters')) {
    storeName = 'hunters';
    // Extraire l'ID de l'URL si présent (ex: /api/hunters/123)
    const match = url.match(/\/hunters\/(\d+)/);
    id = match ? match[1] : null;
  } else if (url.includes('/permits')) {
    storeName = 'permits';
    const match = url.match(/\/permits\/(\d+)/);
    id = match ? match[1] : null;
  } else if (url.includes('/requests')) {
    storeName = 'requests';
    const match = url.match(/\/requests\/(\d+)/);
    id = match ? match[1] : null;
  } else if (url.includes('/activities')) {
    storeName = 'activities';
    const match = url.match(/\/activities\/(\d+)/);
    id = match ? match[1] : null;
  } else if (url.includes('/alerts')) {
    storeName = 'alerts';
    const match = url.match(/\/alerts\/(\d+)/);
    id = match ? match[1] : null;
  }

  try {
    let data;
    if (id) {
      // Si un ID a été extrait, récupérer cet élément spécifique
      data = await getData(storeName, id);
    } else {
      // Sinon, récupérer tous les éléments du store
      data = await getAllData(storeName);
    }

    if (data) {
      // Créer une réponse simulée avec les données du cache
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Cache-Source': 'indexed-db'
        }
      });
    }
  } catch (error) {
    const dbError = error as Error;
    console.error('Erreur lors de la récupération des données depuis IndexedDB:', dbError);
    // Si le store n'existe pas, retourner un tableau vide au lieu d'échouer
    if (dbError.name === 'NotFoundError' || (dbError.message && dbError.message.includes('not found'))) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Cache-Source': 'indexed-db-fallback'
        }
      });
    }
    throw error; // Propager les autres erreurs
  }

  // Si aucune donnée n'a été trouvée
  return new Response(JSON.stringify([]), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Cache-Source': 'no-data'
    }
  });
}

// Fonction pour réinitialiser complètement la base de données IndexedDB
export async function resetDatabase(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!window.indexedDB) {
      console.error('IndexedDB n\'est pas supporté par ce navigateur');
      resolve(false);
      return;
    }

    const request = window.indexedDB.deleteDatabase(DB_NAME);

    request.onsuccess = () => {
      console.log('Base de données supprimée avec succès');
      // Forcer le rechargement de la page pour réinitialiser l'application
      window.location.reload();
      resolve(true);
    };

    request.onerror = (event) => {
      console.error('Erreur lors de la suppression de la base de données:', event);
      resolve(false);
    };

    request.onblocked = () => {
      console.error('Impossible de supprimer la base de données: elle est utilisée par un autre onglet');
      resolve(false);
    };
  });
}

// Timeout pour les requêtes API (10 secondes) - adapté pour Render qui peut être en sleep
const API_TIMEOUT_MS = 10_000;

// Fonction pour créer un wrapper fetch pour le mode hors ligne
export function createOfflineFetch() {
  if (typeof window === 'undefined') return;

  const originalFetch = window.fetch;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;

    const method = init?.method || 'GET';
    const isApiRequest = url.includes('/api/');

    try {
      // Ajouter un timeout pour les requêtes API (évite l'attente infinie quand Render est en sleep)
      let response: Response;
      if (isApiRequest && !init?.signal) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

        try {
          response = await originalFetch(input, {
            ...init,
            signal: controller.signal
          });
        } finally {
          clearTimeout(timeoutId);
        }
      } else {
        response = await originalFetch(input, init);
      }

      // Cache automatique des réponses GET API réussies dans IndexedDB
      if (method === 'GET' && isApiRequest && response.ok) {
        try {
          const responseClone = response.clone();
          const data = await responseClone.json();
          // Cacher en arrière-plan (non bloquant)
          cacheApiResponse(url, data).catch(() => {});
        } catch {
          // Silencieux : le cache est un bonus
        }
      }

      return response;
    } catch (error) {
      // === MODE OFFLINE / TIMEOUT ===

      // Pour les requêtes GET sur l'API, fallback silencieux multi-couches
      if (method === 'GET' && isApiRequest) {
        console.log(`[Offline] Récupération cache pour ${url}`);

        // 1. Essayer le Cache API du Service Worker
        try {
          const cache = await caches.open('api-cache');
          const cachedResponse = await cache.match(url);
          if (cachedResponse) {
            console.log(`[Offline] ✓ Cache API pour ${url}`);
            return cachedResponse;
          }
        } catch {
          // Silencieux
        }

        // 2. Essayer le cache IndexedDB (apiCache avec expiration)
        try {
          const cachedData = await getCachedApiResponse(url);
          if (cachedData !== null && cachedData !== undefined) {
            console.log(`[Offline] ✓ IndexedDB apiCache pour ${url}`);
            return new Response(JSON.stringify(cachedData), {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'X-Cache-Source': 'indexeddb-api-cache'
              }
            });
          }
        } catch {
          // Silencieux
        }

        // 3. Essayer les stores spécifiques IndexedDB
        try {
          const storeName = getStoreNameFromUrl(url);
          if (storeName && storeName !== 'apiCache') {
            const data = await getAllData(storeName);
            if (data && (Array.isArray(data) ? data.length > 0 : true)) {
              console.log(`[Offline] ✓ IndexedDB store '${storeName}' pour ${url}`);
              return new Response(JSON.stringify(data), {
                status: 200,
                headers: {
                  'Content-Type': 'application/json',
                  'X-Cache-Source': `indexeddb-${storeName}`
                }
              });
            }
          }
        } catch {
          // Silencieux
        }

        // 4. Retourner un tableau vide (aucune erreur visible utilisateur)
        console.log(`[Offline] Aucune donnée en cache pour ${url}, retour []`);
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Cache-Source': 'no-data'
          }
        });
      }

      // Pour les requêtes de modification, les enregistrer pour synchronisation ultérieure
      // EXCLUSION : Ne jamais mettre en file d'attente offline les requêtes d'authentification
      const isAuthRequest = url.includes('/auth/login') || url.includes('/auth/logout');
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && isApiRequest && !isAuthRequest) {
        console.log(`[Offline] Mise en queue: ${method} ${url}`);

        let body: Record<string, any> | null = null;
        if (init?.body) {
          if (typeof init.body === 'string') {
            try {
              body = JSON.parse(init.body);
            } catch {
              body = { raw: init.body };
            }
          } else if (init.body instanceof FormData) {
            const formData = init.body;
            const obj: Record<string, any> = {};
            formData.forEach((value: FormDataEntryValue, key: string) => {
              obj[key] = value;
            });
            body = obj;
          }
        }

        try {
          await savePendingRequest(url, method, body);

          return new Response(JSON.stringify({
            success: true,
            message: 'Requête mise en file d\'attente pour synchronisation ultérieure',
            offlineQueued: true
          }), {
            status: 202,
            headers: {
              'Content-Type': 'application/json',
              'X-Offline-Queued': 'true'
            }
          });
        } catch (saveError) {
          console.error('[Offline] Échec sauvegarde requête:', saveError);
          throw new Error('Impossible de sauvegarder la requête pour synchronisation ultérieure');
        }
      }

      // Si tout échoue, propager l'erreur
      throw error;
    }
  };
}

// Utilitaire: désinscrire les Service Workers et vider les caches/IndexedDB de l'application
// A appeler une fois depuis la console du navigateur si un ancien SW cause des erreurs.
// Exemple: await unregisterAndClearPWA()
export async function unregisterAndClearPWA(): Promise<void> {
  try {
    // 1) Désinscrire tous les Service Workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        try {
          await reg.unregister();
          console.log('Service Worker désinscrit:', reg.scope);
        } catch (e) {
          console.warn('Échec de désinscription SW:', e);
        }
      }
    }

    // 2) Supprimer tous les caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        try {
          await caches.delete(name);
          console.log('Cache supprimé:', name);
        } catch (e) {
          console.warn('Échec de suppression cache', name, e);
        }
      }
    }

    // 3) Supprimer la base IndexedDB de l'app
    await new Promise<void>((resolve) => {
      try {
        const req = indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess = () => {
          console.log('IndexedDB supprimée:', DB_NAME);
          resolve();
        };
        req.onerror = () => {
          console.warn('Échec suppression IndexedDB:', DB_NAME);
          resolve();
        };
        req.onblocked = () => {
          console.warn('Suppression IndexedDB bloquée (onglet ouvert). Fermez les autres onglets puis réessayez.');
          resolve();
        };
      } catch (e) {
        console.warn('Erreur lors de la suppression IndexedDB:', e);
        resolve();
      }
    });

    console.log('Nettoyage PWA terminé. Rechargez la page.');
  } catch (e) {
    console.error('Erreur lors du nettoyage PWA:', e);
  }
}
