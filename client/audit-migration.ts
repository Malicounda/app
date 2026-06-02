import 'fake-indexeddb/auto';
import { DatabaseManager } from './src/lib/pwaUtils';

async function setupOldVersion(version: number) {
  return new Promise<void>((resolve, reject) => {
    // Supprimer la base de données existante pour repartir de zéro
    const delReq = indexedDB.deleteDatabase('permis-chasse-offline-db');
    delReq.onsuccess = () => {
      // Simuler la création de l'ancienne version
      const openReq = indexedDB.open('permis-chasse-offline-db', version);
      
      openReq.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        
        // Simuler le schéma des anciennes versions
        if (version >= 1) {
          db.createObjectStore('permits', { keyPath: 'id' });
          db.createObjectStore('hunters', { keyPath: 'id' });
          db.createObjectStore('requests', { keyPath: 'id' });
          db.createObjectStore('misc', { keyPath: 'id' }); // L'obsolète misc
          
          const pendingSync = db.createObjectStore('pendingSync', { keyPath: 'id', autoIncrement: true });
          pendingSync.createIndex('timestamp', 'timestamp', { unique: false });
        }
        if (version >= 2) {
          db.createObjectStore('activities', { keyPath: 'id' });
        }
        if (version >= 3) {
          db.createObjectStore('alerts', { keyPath: 'id' });
        }
        if (version >= 4) {
          db.createObjectStore('domaines', { keyPath: 'id' });
        }
        if (version >= 5) {
          db.createObjectStore('users', { keyPath: 'id' });
        }
      };
      
      openReq.onsuccess = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        db.close();
        resolve();
      };
      openReq.onerror = () => reject(openReq.error);
    };
    delReq.onerror = () => reject(delReq.error);
  });
}

async function testMigration(version: number) {
  console.log(`\n=== Test de Migration v${version} -> v6 ===`);
  
  // Reset dbPromise pour forcer la réouverture
  (DatabaseManager as any).dbPromise = null;
  
  await setupOldVersion(version);
  
  // Déclencher la migration vers v6
  const db = await DatabaseManager.getDB();
  
  // Vérifications
  const storeNames = Array.from(db.objectStoreNames);
  console.log(`Stores présents (${storeNames.length}):`, storeNames.join(', '));
  
  // 1. Vérifier si 'misc' a été supprimé
  const miscExists = storeNames.includes('misc');
  console.log(`Vérification 'misc' supprimé: ${!miscExists ? '✅' : '❌'}`);
  if (miscExists) throw new Error("Le store 'misc' n'a pas été supprimé");
  
  // 2. Vérifier si 'deadLetters' et 'conflicts' ont été ajoutés
  const hasDeadLetters = storeNames.includes('deadLetters');
  const hasConflicts = storeNames.includes('conflicts');
  console.log(`Vérification 'deadLetters' ajouté: ${hasDeadLetters ? '✅' : '❌'}`);
  console.log(`Vérification 'conflicts' ajouté: ${hasConflicts ? '✅' : '❌'}`);
  if (!hasDeadLetters || !hasConflicts) throw new Error("Les nouveaux stores n'ont pas été ajoutés");
  
  // 3. Vérifier l'index 'timestamp' de 'pendingSync'
  const tx = db.transaction('pendingSync', 'readonly');
  const store = tx.objectStore('pendingSync');
  const indexNames = Array.from(store.indexNames);
  
  const hasTimestamp = indexNames.includes('timestamp');
  console.log(`Index 'timestamp' présent: ${hasTimestamp ? '✅' : '❌'}`);
  
  if (hasTimestamp) {
    const index = store.index('timestamp');
    console.log(`keyPath de l'index 'timestamp': ${index.keyPath}`);
    if (index.keyPath !== 'createdAt') {
      console.log(`Vérification keyPath 'createdAt': ❌`);
      throw new Error(`L'index timestamp n'a pas le bon keyPath (attendu: createdAt, reçu: ${index.keyPath})`);
    } else {
      console.log(`Vérification keyPath 'createdAt': ✅`);
    }
  } else {
    throw new Error("L'index timestamp est absent");
  }
  
  // Optionnel: vérifier priority et status
  const hasPriority = indexNames.includes('priority');
  const hasStatus = indexNames.includes('status');
  console.log(`Index 'priority' et 'status' présents: ${hasPriority && hasStatus ? '✅' : '❌'}`);
  
  db.close();
  console.log(`Migration v${version} -> v6 REUSSIE ✅\n`);
}

async function runAllTests() {
  try {
    for (let v = 1; v <= 5; v++) {
      await testMigration(v);
    }
    console.log("=== TOUS LES TESTS DE MIGRATION ONT RÉUSSI ===");
  } catch (err) {
    console.error("ÉCHEC du test:", err);
    // @ts-ignore
    process.exit(1);
  }
}

runAllTests();
