// Utilitaires pour la PWA et le mode hors ligne

// Fonction d'initialisation des fonctionnalités PWA
export function initPWA() {
  // Enregistrer le service worker
  registerServiceWorker();

  // Configurer le fetch pour le mode hors ligne
  createOfflineFetch();

  // Vérifier/créer les stores IndexedDB manquants au démarrage
  DatabaseManager.getDB()
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
const DB_VERSION = 6; // v6: Ajout store conflicts pour gestion des rejets serveur (CQRS)

// Durée maximale de validité du cache (24 heures)
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Configuration centralisée de tous les stores
const STORES_CONFIG = [
  { name: 'permits', keyPath: 'id' },
  { name: 'hunters', keyPath: 'id' },
  { name: 'requests', keyPath: 'id' },
  { name: 'activities', keyPath: 'id' },
  {
    name: 'alerts',
    keyPath: 'id',
    indexes: [
      { name: 'status', keyPath: 'status', options: { unique: false } },
      { name: 'version', keyPath: 'version', options: { unique: false } }
    ]
  },
  {
    name: 'messages',
    keyPath: 'id',
    indexes: [
      { name: 'conversationId', keyPath: 'conversationId', options: { unique: false } },
      { name: 'createdAtLocal', keyPath: 'createdAtLocal', options: { unique: false } },
      { name: 'status', keyPath: 'status', options: { unique: false } }
    ]
  },
  {
    name: 'attachments',
    keyPath: 'id',
    indexes: [
      { name: 'status', keyPath: 'status', options: { unique: false } },
      { name: 'alertId', keyPath: 'alertId', options: { unique: false } }
    ]
  },
  { name: 'domaines', keyPath: 'id' },
  { name: 'users', keyPath: 'id' },
  {
    name: 'auditLogs',
    keyPath: 'id',
    indexes: [
      { name: 'sequenceNumber', keyPath: 'sequenceNumber', options: { unique: true } }
    ]
  },
  { name: 'metadata', keyPath: 'id' },
  { name: 'syncLocks', keyPath: 'id' },
  {
    name: 'deadLetters',
    keyPath: 'id',
    indexes: [
      { name: 'action', keyPath: 'action', options: { unique: false } },
      { name: 'status', keyPath: 'status', options: { unique: false } },
      { name: 'failedAt', keyPath: 'failedAt', options: { unique: false } }
    ]
  },
  {
    name: 'conflicts',
    keyPath: 'id',
    indexes: [
      { name: 'action', keyPath: 'action', options: { unique: false } },
      { name: 'status', keyPath: 'status', options: { unique: false } },
      { name: 'conflictAt', keyPath: 'conflictAt', options: { unique: false } }
    ]
  },
  {
    name: 'apiCache',
    keyPath: 'url',
    indexes: [
      { name: 'cachedAt', keyPath: 'cachedAt', options: { unique: false } }
    ]
  },
  {
    name: 'pendingSync',
    options: { keyPath: 'id', autoIncrement: false }, // Changé en UUID explicite
    indexes: [
      { name: 'timestamp', keyPath: 'createdAt', options: { unique: false } },
      { name: 'priority', keyPath: 'priority', options: { unique: false } },
      { name: 'status', keyPath: 'status', options: { unique: false } }
    ]
  }
] as const;

// --- V1 Offline-First Types ---

export interface OfflineEntity {
  id: string;                 // UUID v4 local
  version: number;            // Auto-incrémenté à chaque modif
  createdAtLocal: number;     // Heure de l'appareil
  createdAtServer?: number;   // Heure réelle (injectée par l'API)
}

export type AlertPriority = 'NORMAL' | 'HIGH' | 'CRITICAL' | 'EMERGENCY';
export type AlertStatus = 'DRAFT' | 'PENDING_SYNC' | 'SENT' | 'CONFIRMED' | 'FAILED';

export interface AlertOffline extends OfflineEntity {
  payload: any;
  priority: AlertPriority;
  status: AlertStatus;
}

export type AttachmentStatus = 'STORED_LOCAL' | 'UPLOAD_PENDING' | 'UPLOADING' | 'UPLOADED' | 'FAILED';

export interface AttachmentOffline extends OfflineEntity {
  blob: Blob | ArrayBuffer;
  alertId?: string;           // ID de l'alerte parente
  fileSize: number;           // Taille exacte
  fileHash: string;           // SHA-256 pour vérification
  status: AttachmentStatus;
  uploadedChunks?: number[];
}

export type SyncAction = 'UPLOAD_ATTACHMENT' | 'CREATE_ALERT' | 'UPDATE_ALERT' | 'DELETE_ALERT' | 'CREATE_MESSAGE' | 'DELETE_MESSAGE' | 'MARK_ALERT_READ' | 'MARK_MESSAGE_READ' | 'UPDATE_PERMIT_STATUS' | 'GENERIC_POST' | 'GENERIC_PUT' | 'GENERIC_DELETE';
export type SyncQueueStatus = 'PENDING' | 'IN_PROGRESS' | 'RETRY_WAIT';

export interface SyncTask {
  id: string;
  action: SyncAction;
  priority: 0 | 1 | 2 | 3; // 0: Emergency, 1: High, 2: Normal, 3: Low
  payload: any;
  entityId: string;
  createdAt: number;

  status: SyncQueueStatus;
  attempts: number;
  lastAttempt?: number;
  errorLog?: string;

  idempotencyKey?: string;
  dependencies?: string[]; // IDs des requêtes parentes

  // Backward compatibility / Dynamic properties used in syncEngine
  timestamp?: number;
  req?: any;
  reason?: string;
  url?: string;
  method?: string;
  body?: any;
  headers?: any;
}

export type ConflictStatus = 'PENDING_RESOLUTION' | 'RESOLVED_LOCAL' | 'RESOLVED_SERVER';

export interface ConflictRecord extends SyncTask {
  serverPayload?: any;
  conflictAt: number;
  conflictStatus: ConflictStatus;
}

export interface SyncHealth {
  id: 'HEALTH_CHECK';
  queueDepth: number;
  oldestPendingItem: number;
  retryCount: number;
  lastSuccess: number | null;
}

export interface SyncLock {
  id: 'GLOBAL_SYNC_LOCK';
  lockedAt: number;
}

export interface AuditLogEntry {
  id: string;
  sequenceNumber: number;
  timestamp: number;
  action: string;
  entityId: string;
  details: any;
  previousHash: string;
  hash: string;
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
            } else {
              // Vérifier si le keyPath a changé (ex: timestamp -> createdAt)
              const existingIndex = store.index(index.name);
              const isKeyPathDifferent = Array.isArray(existingIndex.keyPath)
                ? JSON.stringify(existingIndex.keyPath) !== JSON.stringify(index.keyPath)
                : existingIndex.keyPath !== index.keyPath;

              if (isKeyPathDifferent) {
                console.log(`[IndexedDB] Modification du keyPath pour l'index ${index.name} de ${storeConfig.name}`);
                store.deleteIndex(index.name);
                store.createIndex(index.name, index.keyPath, index.options);
              }
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
  const existingStores = Array.from(db.objectStoreNames);
  for (const storeName of existingStores) {
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

export class DatabaseManager {
  private static dbPromise: Promise<IDBDatabase> | null = null;
  private static dbInstance: IDBDatabase | null = null;

  static getDB(): Promise<IDBDatabase> {
    // Si on a une instance en cache, vérifier qu'elle est encore ouverte
    if (this.dbInstance) {
      try {
        // Tester si la connexion est encore vivante en accédant à une propriété
        // Si la DB est fermée, objectStoreNames lèvera une exception
        void this.dbInstance.objectStoreNames;
        return Promise.resolve(this.dbInstance);
      } catch (_) {
        // La connexion est morte, on doit en ouvrir une nouvelle
        console.warn('[DatabaseManager] Connexion IDB fermée détectée, réouverture...');
        this.dbPromise = null;
        this.dbInstance = null;
      }
    }
    if (!this.dbPromise) {
      console.log("[DB OPEN]");
      this.dbPromise = openDatabase().then(db => {
        this.dbInstance = db;
        // Si la connexion se ferme de manière inattendue, réinitialiser le cache
        db.onclose = () => {
          console.warn('[DatabaseManager] Connexion IDB fermée de manière inattendue');
          this.dbPromise = null;
          this.dbInstance = null;
        };
        return db;
      });
    }
    return this.dbPromise;
  }

  /** Permet de réinitialiser manuellement la connexion si nécessaire */
  static resetConnection(): void {
    this.dbPromise = null;
    this.dbInstance = null;
  }
}

// Fonction pour ouvrir la base de données
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Unique point d'ouverture de toute l'application
    const openRequest = indexedDB.open(DB_NAME, DB_VERSION);

    openRequest.onerror = (event) => {
      console.error("[DB ERROR]", openRequest.error);
      console.warn('[IndexedDB] Base corrompue ou incompatible → reset automatique');
      
      try {
        // Tenter de supprimer la base pour repartir à zéro
        const deleteReq = indexedDB.deleteDatabase(DB_NAME);
        deleteReq.onsuccess = () => {
          console.log('[IndexedDB] Base supprimée, rechargement de la page...');
          setTimeout(() => window.location.reload(), 500);
        };
        deleteReq.onerror = () => {
          reject(new Error('IndexedDB corrompue et impossible à supprimer'));
        };
      } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
        reject(new Error('IndexedDB corrompue, erreur de suppression'));
       }
    };

    openRequest.onsuccess = (event: Event) => {
      console.log("[DB SUCCESS]");
      const db = (event.target as IDBOpenDBRequest).result;

      db.onversionchange = () => {
        try { db.close(); } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);   }
        console.warn('[IndexedDB] Changement de version détecté (autre onglet)');
      };

      resolve(db);
    };

    openRequest.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      console.log("[DB UPGRADE]");
      const db = (event.target as IDBOpenDBRequest).result;
      // Utiliser la migration idempotente centralisée
      applyIdempotentMigration(db, event);
    };

    openRequest.onblocked = () => {
      console.warn("[DB BLOCKED]");
      reject(new Error('IndexedDB bloquée par un autre onglet'));
    };
  });
}

// Fonction pour s'assurer qu'un store existe
async function ensureStoreExists(storeName: string): Promise<IDBDatabase> {
  try {
    const db = await DatabaseManager.getDB();

    if (db.objectStoreNames.contains(storeName)) {
      return db;
    }

    console.warn(`[IndexedDB] Store ${storeName} absent après migration`);
    return db;
  } catch (error) {
    console.error(`[IndexedDB] Erreur ensureStoreExists(${storeName}):`, error);
    return await DatabaseManager.getDB();
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
          // Ne PAS fermer la connexion ici : c'est un singleton partagé
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
          // Ne PAS fermer la connexion ici : c'est un singleton partagé
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
          // Ne PAS fermer : connexion singleton partagée
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
    lastAttempt: undefined,
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

// === CONCURRENCE : SYNC LOCK ===

const LOCK_TTL_MS = 60_000; // 60 secondes

async function acquireSyncLock(): Promise<boolean> {
  try {
    const db = await DatabaseManager.getDB();
    if (!db.objectStoreNames.contains('syncLocks')) return true;

    return new Promise<boolean>((resolve) => {
      const tx = db.transaction('syncLocks', 'readwrite');
      const store = tx.objectStore('syncLocks');
      const getReq = store.get('GLOBAL_SYNC_LOCK');

      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (existing && (Date.now() - existing.lockedAt) < LOCK_TTL_MS) {
          resolve(false); // Lock still active
        } else {
          store.put({ id: 'GLOBAL_SYNC_LOCK', lockedAt: Date.now() });
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        }
      };
      getReq.onerror = () => resolve(false);
    });
  } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  return true;  }
}

async function releaseSyncLock(): Promise<void> {
  try {
    const db = await DatabaseManager.getDB();
    if (!db.objectStoreNames.contains('syncLocks')) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction('syncLocks', 'readwrite');
      tx.objectStore('syncLocks').delete('GLOBAL_SYNC_LOCK');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  /* silent */  }
}

async function refreshSyncLock(): Promise<void> {
  try {
    const db = await DatabaseManager.getDB();
    if (!db.objectStoreNames.contains('syncLocks')) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction('syncLocks', 'readwrite');
      tx.objectStore('syncLocks').put({ id: 'GLOBAL_SYNC_LOCK', lockedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  /* silent */  }
}

// === RETENTION STRATEGY ===

const RETENTION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 jours
const RETENTION_MAX_ENTRIES = 5000;

async function applyRetentionPolicy(storeName: string, dateField: string): Promise<void> {
  try {
    const db = await DatabaseManager.getDB().catch(() => null);
    if (!db || !db.objectStoreNames.contains(storeName)) return;

    await new Promise<void>((resolve) => {
      let settled = false;
      function safeResolve() {
        if (settled) return;
        settled = true;
        resolve();
      }

      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.getAll();

        req.onsuccess = () => {
          try {
            const items = req.result || [];
            const now = Date.now();
            const toDelete: string[] = [];

            // Trier du plus récent au plus ancien
            items.sort((a, b) => (b[dateField] || 0) - (a[dateField] || 0));

            items.forEach((item, index) => {
              const age = now - (item[dateField] || 0);
              if (age > RETENTION_MAX_AGE_MS || index >= RETENTION_MAX_ENTRIES) {
                toDelete.push(item.id);
              }
            });

            if (toDelete.length === 0) {
              safeResolve();
              return;
            }

            let deletedCount = 0;
            for (const id of toDelete) {
              const delReq = store.delete(id);
              delReq.onsuccess = () => {
                deletedCount++;
                if (deletedCount === toDelete.length) safeResolve();
              };
              delReq.onerror = () => {
                deletedCount++;
                if (deletedCount === toDelete.length) safeResolve();
              };
            }
          } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
            safeResolve();
           }
        };
        req.onerror = () => safeResolve();
        tx.oncomplete = () => safeResolve();
        tx.onerror = () => safeResolve();
        tx.onabort = () => safeResolve();
      } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  safeResolve();  }
    });
  } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  /* silent */  }
}

// === DEAD LETTER QUEUE ===

async function moveToDeadLetters(db: IDBDatabase, task: SyncTask, reason: string): Promise<void> {
  if (!db.objectStoreNames.contains('deadLetters')) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(['pendingSync', 'deadLetters'], 'readwrite');
      tx.objectStore('deadLetters').put({ ...task, failedAt: Date.now(), reason, status: 'DEAD' });
      tx.objectStore('pendingSync').delete(task.id);
      tx.oncomplete = () => {
        console.error(`[DeadLetter] ${task.id?.substring(0, 8)} → ${reason}`);
        resolve();
      };
      tx.onerror = () => resolve();
    } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  resolve();  }
  });
}

// === CONFLICT STORE ===

async function moveToConflicts(db: IDBDatabase, task: SyncTask, serverPayload: unknown): Promise<void> {
  if (!db.objectStoreNames.contains('conflicts')) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(['pendingSync', 'conflicts'], 'readwrite');
      tx.objectStore('conflicts').put({
        ...task,
        serverPayload,
        conflictAt: Date.now(),
        conflictStatus: 'PENDING_RESOLUTION',
        status: 'CONFLICT'
      });
      tx.objectStore('pendingSync').delete(task.id);
      tx.oncomplete = () => {
        console.warn(`[Conflict] ${task.id?.substring(0, 8)} → 409 Conflit serveur`);
        resolve();
      };
      tx.onerror = () => resolve();
    } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  resolve();  }
  });
}

// === CRASH RECOVERY ===

async function recoverStaleTasks(): Promise<number> {
  try {
    const db = await DatabaseManager.getDB();
    if (!db.objectStoreNames.contains('pendingSync')) return 0;

    const allTasks = await new Promise<SyncTask[]>((resolve) => {
      const tx = db.transaction('pendingSync', 'readonly');
      const req = tx.objectStore('pendingSync').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    const staleTasks = allTasks.filter(t => t.status === 'IN_PROGRESS');
    if (staleTasks.length === 0) return 0;

    await new Promise<void>((resolve) => {
      const tx = db.transaction('pendingSync', 'readwrite');
      const store = tx.objectStore('pendingSync');
      for (const task of staleTasks) {
        store.put({ ...task, status: 'RETRY_WAIT' });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });

    return staleTasks.length;
  } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  return 0;  }
}

// Fonction pour synchroniser les requêtes en attente (Event-Driven Scheduler)
export async function syncPendingRequests(maxAttempts = 3): Promise<{ success: number; failed: number }> {
  if (!navigator.onLine) {
    console.log('[SyncEngine] Hors ligne, synchronisation impossible');
    return { success: 0, failed: 0 };
  }

  // === BATTERY THROTTLING ===
  let emergencyOnly = false;
  try {
    const nav = navigator as any;
    if (nav.getBattery) {
      const battery = await nav.getBattery();
      if (!battery.charging && battery.level < 0.15) {
        emergencyOnly = true;
        console.warn(`[SyncEngine] ⚡ Batterie critique (${Math.round(battery.level * 100)}%) — mode Emergency Only`);
      }
    }
  } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
    // API Battery non disponible, on continue normalement
   }

  // === VERROU DE CONCURRENCE ===
  const lockAcquired = await acquireSyncLock();
  if (!lockAcquired) {
    console.log('[SyncEngine] Synchronisation déjà en cours, abandon');
    return { success: 0, failed: 0 };
  }

  let db: IDBDatabase;
  try {
    db = await DatabaseManager.getDB();
  } catch (error) {
    await releaseSyncLock();
    console.error('[SyncEngine] Erreur ouverture DB:', error);
    return { success: 0, failed: 0 };
  }

  let globalSuccessCount = 0;
  let globalFailedCount = 0;

  try {
    let hasMoreToProcess = true;

    while (hasMoreToProcess) {
      hasMoreToProcess = false;
      let passSuccessCount = 0;
      let passFailedCount = 0;

      // Récupérer toutes les requêtes en attente
      const pendingRequests = await new Promise<SyncTask[]>((resolve, reject) => {
        const transaction = db.transaction('pendingSync', 'readonly');
        const store = transaction.objectStore('pendingSync');
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = (event) => {
          console.error('[SyncEngine] Erreur récupération queue:', event);
          reject(new Error('Impossible de récupérer les requêtes en attente'));
        };
      });

      if (pendingRequests.length === 0) {
        console.log('[SyncEngine] Queue vide');
        break;
      }

      console.log(`[SyncEngine] ${pendingRequests.length} requête(s) en attente`);

      // Trier par priorité puis par date
      pendingRequests.sort((a, b) => {
        const prioA = a.priority ?? 3;
        const prioB = b.priority ?? 3;
        if (prioA !== prioB) return prioA - prioB;
        return (a.timestamp || a.createdAt || 0) - (b.timestamp || b.createdAt || 0);
      });

      const pendingIds = new Set(pendingRequests.map(r => r.id));

      const deadIds = await new Promise<Set<string>>((resolve) => {
        const tx = db.transaction('deadLetters', 'readonly');
        const req = tx.objectStore('deadLetters').getAllKeys();
        req.onsuccess = () => resolve(new Set(req.result as string[]));
        req.onerror = () => resolve(new Set());
      });

      const conflictIds = await new Promise<Set<string>>((resolve) => {
        const tx = db.transaction('conflicts', 'readonly');
        const req = tx.objectStore('conflicts').getAllKeys();
        req.onsuccess = () => resolve(new Set(req.result as string[]));
        req.onerror = () => resolve(new Set());
      });

      const tasksToFail: { req: SyncTask; reason: string }[] = [];

      const requestsToProcess = pendingRequests.filter(req => {
        const attempts = req.attempts || 0;
        if (attempts >= maxAttempts) return false;

        if (emergencyOnly && (req.priority ?? 3) > 1) {
          return false;
        }

        if (req.dependencies && Array.isArray(req.dependencies)) {
          for (const depId of req.dependencies) {
            if (pendingIds.has(depId)) {
              return false;
            }
            if (deadIds.has(depId) || conflictIds.has(depId)) {
              tasksToFail.push({ req, reason: `Dépendance ${depId} en échec ou conflit` });
              return false;
            }
          }
        }
        return true;
      });

      for (const failItem of tasksToFail) {
        await moveToDeadLetters(db, failItem.req, failItem.reason);
      }

      if (requestsToProcess.length === 0) {
        console.log('[SyncEngine] Toutes les requêtes sont bloquées ou ont dépassé maxAttempts');
        for (const req of pendingRequests) {
          if ((req.attempts || 0) >= maxAttempts) {
            await moveToDeadLetters(db, req, `Max tentatives atteint (${req.attempts})`);
          }
        }
        break;
      }

      const nonRetryableStatuses = new Set([400, 404, 405, 422]);

      for (const request of requestsToProcess) {
        const requestId = request.id?.substring(0, 8) || 'unknown';
        const requestMethod = request.method || 'GET';
        const requestPath = (() => {
          try { return new URL(request.url || '').pathname; } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  return request.url || '';  }
        })();

        try {
          await refreshSyncLock();

          const updatedRequest = {
            ...request,
            attempts: (request.attempts || 0) + 1,
            lastAttempt: Date.now(),
            status: 'IN_PROGRESS' as SyncQueueStatus
          };

          await new Promise<void>((resolve, reject) => {
            try {
              const updateTransaction = db.transaction('pendingSync', 'readwrite');
              updateTransaction.oncomplete = () => resolve();
              updateTransaction.onerror = () => reject(new Error('Erreur update'));
              updateTransaction.objectStore('pendingSync').put(updatedRequest);
            } catch (error) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', error);  reject(error);  }
          });

          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          const token = localStorage.getItem('token');
          if (token) headers['Authorization'] = `Bearer ${token}`;
          // === IDEMPOTENCY KEY (ACK Safety) ===
          headers['X-Idempotency-Key'] = request.idempotencyKey || request.id;

          let response: Response;
          console.log(`[${requestId}] Action: ${request.action || 'LEGACY_FETCH'} → ${request.entityId || requestPath}`);

          const { resolveApiUrl } = await import('../utils/environment');
          if (request.action === 'UPLOAD_ATTACHMENT') {
            const { uploadAttachmentChunked } = await import('./chunkedUpload');

            // Heartbeat Guard pour maintenir le lock vivant même si un chunk est très lent (> 60s)
            const heartbeat = setInterval(
              () => refreshSyncLock().catch(() => {}),
              LOCK_TTL_MS / 3 // ex: 60s / 3 = 20s
            );

            try {
              await uploadAttachmentChunked(
                request.payload.attachId,
                request.payload.fileName,
                request.payload.type,
                headers
              );
            } finally {
              clearInterval(heartbeat);
            }
            response = new Response(null, { status: 200, statusText: 'OK' });
          } else if (request.action === 'CREATE_ALERT') {
            response = await fetch(resolveApiUrl('/api/alerts'), { method: 'POST', headers, body: JSON.stringify(request.payload), credentials: 'include' });
          } else if (request.action === 'UPDATE_ALERT') {
            response = await fetch(resolveApiUrl(`/api/alerts/${request.entityId}`), { method: 'PUT', headers, body: JSON.stringify(request.payload), credentials: 'include' });
          } else if (request.action === 'DELETE_ALERT') {
            response = await fetch(resolveApiUrl(`/api/alerts/${request.payload.alertId}`), { method: 'DELETE', headers, credentials: 'include' });
          } else if (request.action === 'MARK_ALERT_READ') {
            response = await fetch(resolveApiUrl(`/api/alerts/${request.payload.alertId}/read`), { method: 'PATCH', headers, body: JSON.stringify({ isRead: true }), credentials: 'include' });
          } else if (request.action === 'CREATE_MESSAGE') {
            const endpoint = resolveApiUrl(request.payload.isGroupMessage ? '/api/messages/group' : '/api/messages');
            
            if (request.payload.offlineAttachment && request.payload.offlineAttachment.attachId) {
              // Mode Multipart avec pièce jointe
              const attachInfo = request.payload.offlineAttachment;
              
              // Récupérer le blob depuis IndexedDB
              const attachmentRecord = await getData<AttachmentOffline>('attachments', attachInfo.attachId);
              if (attachmentRecord && attachmentRecord.blob) {
                const formData = new FormData();
                
                // Champs texte
                formData.append('subject', request.payload.subject || 'Message');
                formData.append('content', request.payload.content || '');
                if (request.payload.isGroupMessage) {
                  if (request.payload.targetRole) formData.append('targetRole', request.payload.targetRole);
                  if (request.payload.targetRegion) formData.append('targetRegion', request.payload.targetRegion);
                } else {
                  if (request.payload.recipient) formData.append('recipient', request.payload.recipient);
                }
                if (request.payload.domaineId) {
                  formData.append('domaineId', String(request.payload.domaineId));
                }

                const blob = new Blob([attachmentRecord.blob], { type: attachInfo.fileMime });
                formData.append('attachment', blob, attachInfo.fileName);

                // Retirer le header Content-Type pour que fetch le génère correctement avec le boundary
                const multipartHeaders = new Headers(headers);
                multipartHeaders.delete('Content-Type');

                response = await fetch(endpoint, { method: 'POST', headers: multipartHeaders, body: formData, credentials: 'include' });
              } else {
                // Le blob n'est plus là, ce qui veut dire que UPLOAD_ATTACHMENT a déjà envoyé et nettoyé le fichier.
                // On envoie en JSON classique pour que le serveur récupère la pièce jointe déjà présente grâce à l'attachId.
                response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(request.payload), credentials: 'include' });
              }
            } else {
              // Mode JSON classique
              response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(request.payload), credentials: 'include' });
            }
          } else if (request.action === 'DELETE_MESSAGE') {
            const isGroup = request.payload.isGroupMessage;
            const msgId = request.payload.messageId;
            const endpoint = isGroup ? `/api/messages/group/${msgId}/delete` : `/api/messages/${msgId}`;
            const method = isGroup ? 'PATCH' : 'DELETE';
            response = await fetch(resolveApiUrl(endpoint), { method, headers, credentials: 'include' });
          } else if (request.action === 'MARK_MESSAGE_READ') {
            const isGroup = request.payload.isGroupMessage;
            const msgId = request.payload.messageId;
            const endpoint = isGroup ? `/api/messages/group/${msgId}/read` : `/api/messages/${msgId}/read`;
            response = await fetch(resolveApiUrl(endpoint), { method: 'PATCH', headers, credentials: 'include' });
          } else {
            // Fallback legacy
            response = await fetch(resolveApiUrl(request.url || ''), { method: requestMethod, headers, body: request.body, credentials: 'include' });
          }

          if (response.ok) {
            // === ACK SAFETY : Purge APRÈS log d'audit ===
            // On log le succès AVANT de purger pour garantir la traçabilité
            // même si le serveur crash juste après commit.
            const { logAudit } = await import('./auditLogger');
            await logAudit('SYNC_SUCCESS', request.id, {
              action: request.action,
              entityId: request.entityId,
              serverAckAt: Date.now()
            });

            // Maintenant on peut purger la queue en toute sécurité
            await new Promise<void>((resolve) => {
              try {
                const deleteTransaction = db.transaction('pendingSync', 'readwrite');
                deleteTransaction.oncomplete = () => {
                  console.log(`[${requestId}] ✓ Synchronisé`);
                  passSuccessCount++;
                  resolve();
                };
                deleteTransaction.onerror = () => { passSuccessCount++; resolve(); };
                deleteTransaction.objectStore('pendingSync').delete(request.id);
              } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  passSuccessCount++; resolve();  }
            });

            // Cleanup local messages and attachments to remove them from UI
            if (request.action === 'CREATE_MESSAGE' && request.entityId) {
              try {
                const cleanupTx = db.transaction('messages', 'readwrite');
                const store = cleanupTx.objectStore('messages');
                store.delete(request.entityId);
                if (!isNaN(Number(request.entityId))) {
                  store.delete(Number(request.entityId));
                }
                store.delete(String(request.entityId));
              } catch (e) { }
            } else if (request.action === 'UPLOAD_ATTACHMENT' && request.payload?.attachId) {
              try {
                const cleanupTx = db.transaction('attachments', 'readwrite');
                const store = cleanupTx.objectStore('attachments');
                store.delete(request.payload.attachId);
                if (!isNaN(Number(request.payload.attachId))) {
                  store.delete(Number(request.payload.attachId));
                }
                store.delete(String(request.payload.attachId));
              } catch (e) { }
            } else if (request.action === 'DELETE_MESSAGE' && request.payload?.messageId) {
              try {
                const cleanupTx = db.transaction('messages', 'readwrite');
                const store = cleanupTx.objectStore('messages');
                store.delete(request.payload.messageId);
                if (!isNaN(Number(request.payload.messageId))) {
                  store.delete(Number(request.payload.messageId));
                }
                store.delete(String(request.payload.messageId));
              } catch (e) { }
            }


          } else {
            console.error(`[${requestId}] Erreur HTTP ${response.status}: ${response.statusText}`);

            if (response.status === 401 || response.status === 403) {
              console.warn(`[SyncEngine] Auth error ${response.status} on task ${request.id}. Resetting and stopping sync.`);
              const resetRequest = {
                ...request,
                status: 'PENDING' as SyncQueueStatus,
                attempts: request.attempts
              };
              await new Promise<void>((resolve) => {
                try {
                  const tx = db.transaction('pendingSync', 'readwrite');
                  tx.objectStore('pendingSync').put(resetRequest);
                  tx.oncomplete = () => resolve();
                  tx.onerror = () => resolve();
                } catch (e) { resolve(); }
              });
              hasMoreToProcess = false;
              break;
            }

            // === 409 CONFLIT → CONFLICT STORE ===
            if (response.status === 409) {
              let serverPayload: any = null;
              try { serverPayload = await response.json(); } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);   }
              
              if (request.action === 'CREATE_ALERT' && serverPayload?.self === true) {
                console.log(`[${requestId}] ✓ Already exists on server (409 self conflict), treating as success`);
                const { logAudit } = await import('./auditLogger');
                await logAudit('SYNC_SUCCESS', request.id, {
                  action: request.action,
                  entityId: request.entityId,
                  serverAckAt: Date.now(),
                  duplicateSelf: true
                });
                
                await new Promise<void>((resolve) => {
                  try {
                    const deleteTransaction = db.transaction('pendingSync', 'readwrite');
                    deleteTransaction.oncomplete = () => {
                      passSuccessCount++;
                      resolve();
                    };
                    deleteTransaction.onerror = () => { passSuccessCount++; resolve(); };
                    deleteTransaction.objectStore('pendingSync').delete(request.id);
                  } catch (e) { passSuccessCount++; resolve(); }
                });
                continue;
              }

              await moveToConflicts(db, updatedRequest, serverPayload);
              passFailedCount++;
              continue;
            }

            if (nonRetryableStatuses.has(response.status)) {
              await moveToDeadLetters(db, updatedRequest, `HTTP ${response.status}`);
              passFailedCount++;
              continue;
            }

            if (updatedRequest.attempts >= maxAttempts) {
              await moveToDeadLetters(db, updatedRequest, `Max tentatives`);
              passFailedCount++;
              continue;
            }

            updatedRequest.status = 'RETRY_WAIT';
            await new Promise<void>((resolve) => {
              try {
                const retryTx = db.transaction('pendingSync', 'readwrite');
                retryTx.objectStore('pendingSync').put(updatedRequest);
                retryTx.oncomplete = () => resolve();
                retryTx.onerror = () => resolve();
              } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  resolve();  }
            });

            passFailedCount++;
          }
        } catch (error) {
          console.error(`[${requestId}] Erreur réseau:`, error);
          passFailedCount++;
        }

        // Rate limiting adaptatif
        const baseDelay = emergencyOnly ? 2000 : 500;
        const backoffMs = Math.min(baseDelay * Math.pow(1.5, request.attempts || 0), 10000);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }

      globalSuccessCount += passSuccessCount;
      globalFailedCount += passFailedCount;

      // === EVENT-DRIVEN : Si succès, réévaluer les enfants débloqués ===
      if (passSuccessCount > 0) {
        console.log('[SyncEngine] Passe réussie, réévaluation des dépendances enfants...');
        hasMoreToProcess = true;
      }
    } // End While Loop

    if (globalSuccessCount > 0 || globalFailedCount > 0) {
      const message = `Synchronisation: ${globalSuccessCount} réussie(s), ${globalFailedCount} échouée(s)`;
      console.log(`[SyncEngine] ${message}`);
      showNotification('Synchronisation terminée', message, globalFailedCount === 0 ? 'success' : 'error');
    }

    return { success: globalSuccessCount, failed: globalFailedCount };

  } catch (error) {
    console.error('[SyncEngine] Erreur critique:', error);
    return { success: globalSuccessCount, failed: globalFailedCount };

  } finally {
    // === TOUJOURS libérer le verrou ===
    await releaseSyncLock();
    try {
      window.dispatchEvent(new CustomEvent('sync-finished', {
        detail: { success: globalSuccessCount, failed: globalFailedCount }
      }));
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Failed to dispatch sync-finished', e);
    }
  }
}

// Fonction pour nettoyer les requêtes en double ou obsolètes
async function cleanUpPendingRequests(): Promise<void> {
  // Ouvrir une nouvelle connexion pour éviter "The database connection is closing"
  const db = await DatabaseManager.getDB().catch(() => null);
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
        // Ne PAS fermer : connexion singleton partagée
      };

      transaction.onerror = (event) => {
        console.error('Erreur lors de la transaction de nettoyage:', event);
        resolve();
      };
    } catch (error) {
      console.error('Erreur lors du nettoyage des requêtes:', error);
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
          resolve();
        };
        transaction.onerror = () => {
          resolve();
        };
      } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
        resolve();
       }
    });
  } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
    // Silencieux : le cache est un bonus, pas critique
   }
}

// Récupérer une réponse API depuis le cache IndexedDB (avec vérification d'expiration)
async function getCachedApiResponse(url: string): Promise<any | null> {
  try {
    const db = await ensureStoreExists('apiCache');
    if (!db.objectStoreNames.contains('apiCache')) {
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
              delTx.oncomplete = () => { /* singleton */ };
            } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  }
            resolve(null);
            return;
          }

          resolve(result.data);
        };

        request.onerror = () => resolve(null);
        transaction.oncomplete = () => { /* singleton */ };
      } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
        resolve(null);
       }
    });
  } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
    return null;
   }
}

// Nettoyer les entrées expirées du cache
async function cleanExpiredCache(): Promise<void> {
  try {
    const db = await DatabaseManager.getDB();
    if (!db.objectStoreNames.contains('apiCache')) {
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
          resolve();
        };
        transaction.onerror = () => {
          resolve();
        };
      } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
        resolve();
       }
    });
  } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
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

// Timeout pour les requêtes API (60 secondes) - adapté pour Render qui peut être en sleep
const API_TIMEOUT_MS = 60_000;

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
        } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
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
        } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
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
        } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
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
        } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
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
            } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
              body = { raw: init.body  };
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

// === BOOT SEQUENCE OBLIGATOIRE ===

let bootInProgress = false;
let isBooted = false;

export async function bootSCoDiCore(): Promise<void> {
  if (bootInProgress || isBooted) {
    return;
  }
  bootInProgress = true;

  try {
    const BOOT_STATE_KEY = 'scodi_boot_state';
    const bootAttempts = parseInt(sessionStorage.getItem(BOOT_STATE_KEY) || '0', 10);

    // === BOOT STATE MACHINE : Crash Loop Detector ===
    if (bootAttempts > 2) {
      console.error('[SCoDi Boot] 🚨 CRASH LOOP DÉTECTÉE. Boot annulé (Safe Mode).');
      // Signal FORT pour éviter la dégradation silencieuse :
      showNotification(
        '⚠️ MODE DÉGRADÉ',
        'Le démarrage sécurisé a échoué 3 fois. La synchronisation est désactivée. Contactez le support.',
        'error'
      );
      return;
    }

    // Marquer le début du boot (sera nettoyé en cas de succès)
    sessionStorage.setItem(BOOT_STATE_KEY, (bootAttempts + 1).toString());

    console.log('🚀 [SCoDi Boot] Démarrage de la séquence d\'initialisation...');
    try {
      const db = await DatabaseManager.getDB();

      // 1. Libérer les éventuels verrous morts (stale syncLocks)
      if (db.objectStoreNames.contains('syncLocks')) {
        await new Promise<void>((resolve) => {
          try {
            const tx = db.transaction('syncLocks', 'readwrite');
            const store = tx.objectStore('syncLocks');
            const getReq = store.get('GLOBAL_SYNC_LOCK');

            getReq.onsuccess = () => {
              const existing = getReq.result;
              if (existing && (Date.now() - existing.lockedAt) >= LOCK_TTL_MS) {
                store.delete('GLOBAL_SYNC_LOCK');
                console.log('[SCoDi Boot] Verrous de synchronisation stale purgés.');
              }
            };

            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  resolve();  }
        });
      }

      // 2. Vérification de la chaîne d'audit (Anti-falsification)
      try {
        const { verifyAuditChainIntegrity } = await import('./auditLogger');
        const auditResult = await verifyAuditChainIntegrity();
        if (!auditResult.valid) {
          console.error('[SCoDi Boot] 🚨 CORRUPTION AUDIT DÉTECTÉE 🚨', auditResult);
          showNotification(
            '⚠️ Intégrité Audit',
            'Une corruption de la chaîne d\'audit a été détectée. Les données sont intactes mais la traçabilité est compromise.',
            'error'
          );
        }
      } catch (auditErr) {
        console.warn('[SCoDi Boot] Audit check skipped:', auditErr);
      }

      // 3. Récupérer les tâches IN_PROGRESS bloquées par un crash
      const recoveredCount = await recoverStaleTasks();
      if (recoveredCount > 0) {
        console.log(`[SCoDi Boot] ${recoveredCount} tâche(s) zombie(s) récupérée(s) (Crash Recovery).`);
      }

      // 4. Lancer une synchronisation initiale si en ligne
      if (navigator.onLine) {
        console.log('[SCoDi Boot] Connexion détectée, lancement de la synchronisation de fond...');
        syncPendingRequests().catch(e => console.error('[SCoDi Boot] Erreur sync initiale:', e));
      }

      // 5. Appliquer les politiques de rétention (en arrière-plan)
      Promise.all([
        applyRetentionPolicy('deadLetters', 'failedAt'),
        applyRetentionPolicy('conflicts', 'conflictAt')
      ]).catch(e => console.warn('[SCoDi Boot] Erreur rétention:', e));

      // Succès : nettoyer le compteur de crash
      sessionStorage.removeItem(BOOT_STATE_KEY);
      isBooted = true;
      console.log('✅ [SCoDi Boot] Séquence terminée. Système prêt.');
    } catch (error) {
      console.error('[SCoDi Boot] Échec de la séquence d\'initialisation:', error);
      // Le flag sessionStorage reste, incrémentera au prochain reload
    }
  } finally {
    bootInProgress = false;
  }
}

// Auto-démarrage au chargement de la fenêtre (sauf SSR)
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    bootSCoDiCore();
  });
}
