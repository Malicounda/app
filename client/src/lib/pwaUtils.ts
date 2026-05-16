// Utilitaires pour la PWA et le mode hors ligne

// Fonction d'initialisation des fonctionnalités PWA
export function initPWA() {
  // Enregistrer le service worker
  registerServiceWorker();
  
  // Configurer le fetch pour le mode hors ligne
  createOfflineFetch();
  
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
        })
        .catch(error => {
          console.error('Erreur lors de l\'enregistrement du Service Worker:', error);
        });
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
const DB_VERSION = 2; // Mise à jour de la version pour résoudre le conflit

// Fonction pour créer un store s'il n'existe pas
async function createStoreIfNotExists(storeName: string, keyPath: string = 'id'): Promise<void> {
  const db = await openDatabase();
  
  return new Promise((resolve, reject) => {
    // Vérifier si le store existe déjà
    if (db.objectStoreNames.contains(storeName)) {
      db.close();
      resolve();
      return;
    }
    
    // Si le store n'existe pas, on doit fermer la connexion actuelle
    // et en ouvrir une nouvelle avec une version supérieure
    db.close();
    
    const newVersion = DB_VERSION + 1; // Incrémenter la version pour déclencher onupgradeneeded
    const request = indexedDB.open(DB_NAME, newVersion);
    
    request.onerror = (event) => {
      console.error(`Erreur lors de la création du store ${storeName}:`, event);
      reject(new Error(`Impossible de créer le store ${storeName}`));
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Créer le store manquant
      if (!db.objectStoreNames.contains(storeName)) {
        const store = db.createObjectStore(storeName, { keyPath });
        console.log(`Store ${storeName} créé avec succès`);
        
        // Ajouter des index si nécessaire
        if (storeName === 'pendingSync') {
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      }
    };
    
    request.onsuccess = () => {
      const db = request.result;
      db.close();
      resolve();
    };
  });
}

// Fonction pour ouvrir la base de données
export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Ouvrir directement avec la version définie dans DB_VERSION
    const openRequest = indexedDB.open(DB_NAME, DB_VERSION);
    
    openRequest.onerror = (event) => {
      console.error('Erreur lors de l\'ouverture de la base de données:', event);
      // En cas d'échec, essayer d'ouvrir en lecture seule
      const readOnlyRequest = indexedDB.open(DB_NAME);
      readOnlyRequest.onsuccess = () => resolve(readOnlyRequest.result);
      readOnlyRequest.onerror = () => reject(new Error('Impossible d\'ouvrir la base de données en lecture seule'));
    };

    openRequest.onsuccess = (event: Event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Sur changement de version (autre onglet), fermer proprement sans forcer un reload
      db.onversionchange = () => {
        try { db.close(); } catch {}
        console.warn('IndexedDB: changement de version détecté (autre onglet). Recharger manuellement si nécessaire.');
      };
      
      resolve(db);
    };

    openRequest.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;
      
      console.log(`Mise à jour de la base de données de la version ${oldVersion} à ${event.newVersion}`);
      
      // Définir la configuration des stores
      const storesConfig = [
        { name: 'permits', keyPath: 'id' },
        { name: 'hunters', keyPath: 'id' },
        { name: 'requests', keyPath: 'id' },
        { name: 'activities', keyPath: 'id' },
        { name: 'alerts', keyPath: 'id' },
        { 
          name: 'pendingSync', 
          options: { keyPath: 'id', autoIncrement: true },
          indexes: [
            { name: 'timestamp', keyPath: 'timestamp', options: { unique: false } }
          ]
        }
      ];
      
      // Créer ou mettre à jour les stores
      for (const storeConfig of storesConfig) {
        if (!db.objectStoreNames.contains(storeConfig.name)) {
          try {
            const storeOptions = storeConfig.options || { keyPath: storeConfig.keyPath };
            const store = db.createObjectStore(storeConfig.name, storeOptions);
            
            if (storeConfig.indexes) {
              for (const index of storeConfig.indexes) {
                try {
                  store.createIndex(index.name, index.keyPath, index.options);
                  console.log(`Index ${index.name} créé pour le store ${storeConfig.name}`);
                } catch (indexError) {
                  console.warn(`Impossible de créer l'index ${index.name} pour ${storeConfig.name}:`, indexError);
                }
              }
            }
            
            console.log(`Store ${storeConfig.name} créé avec succès`);
          } catch (createError) {
            console.error(`Erreur lors de la création du store ${storeConfig.name}:`, createError);
          }
        } else if (oldVersion > 0) {
          // Si le store existe déjà, mettre à jour ses index si nécessaire
          const transaction = (event.target as IDBOpenDBRequest).transaction;
          if (transaction) {
            const store = transaction.objectStore(storeConfig.name);
            
            if (storeConfig.indexes) {
              const existingIndexes = new Set(Array.from(store.indexNames));
              
              for (const index of storeConfig.indexes) {
                if (!existingIndexes.has(index.name)) {
                  try {
                    store.createIndex(index.name, index.keyPath, index.options);
                    console.log(`Index ${index.name} ajouté au store ${storeConfig.name}`);
                  } catch (indexError) {
                    console.warn(`Impossible d'ajouter l'index ${index.name} à ${storeConfig.name}:`, indexError);
                  }
                }
              }
            }
          }
        }
      }
      
      // Supprimer les stores obsolètes
      const storesToKeep = new Set(storesConfig.map(s => s.name));
      for (let i = 0; i < db.objectStoreNames.length; i++) {
        const storeName = db.objectStoreNames[i];
        if (!storesToKeep.has(storeName)) {
          try {
            db.deleteObjectStore(storeName);
            console.log(`Store obsolète ${storeName} supprimé`);
          } catch (deleteError) {
            console.error(`Erreur lors de la suppression du store ${storeName}:`, deleteError);
          }
        }
      }
    };
    
    openRequest.onblocked = (event) => {
      console.warn('La base de données est bloquée par un autre onglet, tentative de réouverture...');
      // Essayer de se reconnecter avec la version actuelle
      const retryRequest = indexedDB.open(DB_NAME, DB_VERSION);
      retryRequest.onsuccess = () => resolve(retryRequest.result);
      retryRequest.onerror = () => {
        console.error('Impossible de rouvrir la base de données après blocage');
        reject(new Error('Base de données bloquée par un autre onglet'));
      };
    };
  });
}

// Fonction pour obtenir la définition d'un store par son nom
function getStoreDefinition(storeName: string) {
  const stores = [
    { name: 'permits', keyPath: 'id' },
    { name: 'hunters', keyPath: 'id' },
    { name: 'requests', keyPath: 'id' },
    { name: 'activities', keyPath: 'id' },
    { name: 'alerts', keyPath: 'id' },  // Ajout du store pour les alertes
    { 
      name: 'pendingSync', 
      options: { keyPath: 'id', autoIncrement: true },
      indexes: [
        { name: 'timestamp', keyPath: 'timestamp', options: { unique: false } }
      ]
    }
  ];
  
  return stores.find(s => s.name === storeName);
}

// Fonction pour s'assurer qu'un store existe
async function ensureStoreExists(storeName: string): Promise<IDBDatabase> {
  try {
    // Vérifier d'abord avec une simple ouverture
    const db = await openDatabase();
    
    // Si le store existe déjà, on le retourne
    if (db.objectStoreNames.contains(storeName)) {
      return db;
    }
    
    // Ne plus monter la version dynamiquement pour éviter les conflits inter-onglets
    console.warn(`Le store ${storeName} n'existe pas dans la version actuelle de la base. Aucune mise à niveau automatique effectuée.`);
    return db;
  } catch (error) {
    console.error(`Erreur lors de la vérification du store ${storeName}:`, error);
    // En cas d'échec, essayer de rouvrir la base en lecture seule
    const db = await openDatabase();
    if (!db.objectStoreNames.contains(storeName)) {
      console.warn(`Le store ${storeName} n'existe toujours pas après tentative de création`);
    }
    return db;
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
export async function syncPendingRequests(maxAttempts = 3): Promise<{success: number; failed: number}> {
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
        try { db.close(); } catch {}
        // La transaction est terminée
      };
      
      transaction.onerror = (event) => {
        console.error('Erreur lors de la transaction de nettoyage:', event);
        resolve();
      };
    } catch (error) {
      console.error('Erreur lors du nettoyage des requêtes:', error);
      try { db.close(); } catch {}
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
  if (url.includes('/settings')) return 'settings';
  if (url.includes('/documents')) return 'documents';
  return 'misc';
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

// Fonction pour créer un wrapper fetch pour le mode hors ligne
export function createOfflineFetch() {
  if (typeof window === 'undefined') return;

  const originalFetch = window.fetch;
  
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      // Essayer d'abord la requête réseau
      return await originalFetch(input, init);
    } catch (error) {
      const url = typeof input === 'string' 
        ? input 
        : input instanceof URL 
          ? input.toString() 
          : (input as Request).url;
      
      const method = init?.method || 'GET';
      
      console.warn(`Erreur réseau sur ${method} ${url}, tentative de récupération en mode hors ligne`);
      
      // Pour les requêtes GET sur l'API, essayer de récupérer depuis le cache
      if (method === 'GET' && url.includes('/api/')) {
        try {
          const cache = await caches.open('api-cache');
          const response = await cache.match(url);
          
          if (response) {
            console.log(`Données récupérées depuis le cache pour ${url}`);
            return response;
          }
          
          // Si pas dans le cache, essayer de récupérer depuis IndexedDB
          try {
            const storeName = getStoreNameFromUrl(url);
            if (storeName) {
              const data = await getAllData(storeName);
              if (data) {
                console.log(`Données récupérées depuis IndexedDB pour ${url}`);
                return new Response(JSON.stringify(data), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' }
                });
              }
            }
          } catch (dbError) {
            console.error('Erreur lors de la récupération depuis IndexedDB:', dbError);
          }
          
          // Si aucune donnée n'a été trouvée
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'X-Cache-Source': 'no-data'
            }
          });
        } catch (cacheError) {
          console.error('Erreur lors de la récupération depuis le cache:', cacheError);
        }
      }
      
      // Pour les requêtes de modification, les enregistrer pour synchronisation ultérieure
      // EXCLUSION : Ne jamais mettre en file d'attente offline les requêtes d'authentification
      const isAuthRequest = url.includes('/auth/login') || url.includes('/auth/logout');
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && url.includes('/api/') && !isAuthRequest) {
        console.log(`Enregistrement de la requête ${method} ${url} pour synchronisation ultérieure`);
        
        let body: Record<string, any> | null = null;
        if (init?.body) {
          if (typeof init.body === 'string') {
            try {
              body = JSON.parse(init.body);
            } catch (e) {
              console.warn('Impossible de parser le corps de la requête JSON', e);
              body = { raw: init.body };
            }
          } else if (init.body instanceof FormData) {
            // Convertir FormData en objet
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
          
          // Retourner une réponse simulée pour indiquer que la requête a été mise en file d'attente
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
          console.error('Erreur lors de la sauvegarde de la requête en attente:', saveError);
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
