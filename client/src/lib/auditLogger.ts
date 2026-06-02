import { DatabaseManager, generateUUID, storeData } from './pwaUtils';
import type { AuditLogEntry } from './pwaUtils';

/**
 * AuditLogger - Service d'audit traçable et inviolable.
 * Implémente une chaîne de hachage (Blockchain-like) où chaque log
 * contient le hash du précédent.
 */

export async function calculateHash(data: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

let logQueuePromise: Promise<void> = Promise.resolve();

export async function logAudit(action: string, entityId: string, details: any = {}): Promise<void> {
  const run = async () => {
    try {
      const db = await DatabaseManager.getDB();
      if (!db.objectStoreNames.contains('auditLogs')) return;

      // 1. Récupérer le dernier log pour obtenir son hash (previousHash) et sequenceNumber
      const lastLog = await new Promise<{hash: string, seq: number}>((resolve) => {
        const tx = db.transaction('auditLogs', 'readonly');
        const store = tx.objectStore('auditLogs');
        
        const request = store.openCursor(null, 'prev');
        
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            resolve({ hash: cursor.value.hash, seq: cursor.value.sequenceNumber });
          } else {
            resolve({ hash: 'GENESIS', seq: 0 }); // Premier log
          }
        };
        
        request.onerror = () => resolve({ hash: 'ERROR', seq: 0 });
      });

      // 2. Construire le nouveau log
      const timestamp = Date.now();
      const id = generateUUID();
      const sequenceNumber = lastLog.seq + 1;
      const previousHash = lastLog.hash;
      
      const logDataToHash = JSON.stringify({
        id,
        sequenceNumber,
        timestamp,
        action,
        entityId,
        details,
        previousHash
      });

      const hash = await calculateHash(logDataToHash);

      const logEntry: AuditLogEntry = {
        id,
        sequenceNumber,
        timestamp,
        action,
        entityId,
        details,
        previousHash,
        hash
      };

      // 3. Sauvegarder
      await storeData('auditLogs', logEntry);
      console.log(`[Audit] ${action} sur ${entityId} (Hash: ${hash.substring(0, 8)}...)`);

    } catch (error) {
      console.error('[Audit] Échec de la journalisation:', error);
    }
  };

  logQueuePromise = logQueuePromise.then(run).catch((err) => {
    console.error('[Audit Queue] Critical execution failure:', err);
  });

  return logQueuePromise;
}

/**
 * Vérification d'intégrité de la chaîne d'audit au démarrage.
 * Parcourt TOUS les logs et re-calcule chaque hash pour détecter
 * toute falsification ou corruption du stockage local.
 */
export interface AuditVerificationResult {
  valid: boolean;
  totalEntries: number;
  corruptedAt?: number;       // Index du premier maillon corrompu
  corruptedEntryId?: string;  // ID de l'entrée corrompue
  error?: string;
}

export async function verifyAuditChainIntegrity(): Promise<AuditVerificationResult> {
  try {
    const db = await DatabaseManager.getDB();
    if (!db.objectStoreNames.contains('auditLogs')) {
      return { valid: true, totalEntries: 0 };
    }

    // Récupérer tous les logs triés par timestamp
    const allLogs = await new Promise<AuditLogEntry[]>((resolve) => {
      const tx = db.transaction('auditLogs', 'readonly');
      const store = tx.objectStore('auditLogs');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    if (allLogs.length === 0) {
      return { valid: true, totalEntries: 0 };
    }

    // Trier par timestamp croissant pour parcourir dans l'ordre d'insertion
    allLogs.sort((a, b) => a.timestamp - b.timestamp);

    let expectedPreviousHash = 'GENESIS';

    for (let i = 0; i < allLogs.length; i++) {
      const entry = allLogs[i];

      // 1. Vérifier que le previousHash correspond au hash du log précédent
      if (entry.previousHash !== expectedPreviousHash) {
        console.error(
          `[Audit] ❌ CHAÎNE CASSÉE à l'index ${i} (ID: ${entry.id.substring(0, 8)})`,
          `Attendu previousHash=${expectedPreviousHash.substring(0, 8)}, ` +
          `trouvé=${entry.previousHash.substring(0, 8)}`
        );
        return {
          valid: false,
          totalEntries: allLogs.length,
          corruptedAt: i,
          corruptedEntryId: entry.id,
          error: `previousHash mismatch at index ${i}`
        };
      }

      // 2. Re-calculer le hash du contenu pour détecter une modification
      const logDataToHash = JSON.stringify({
        id: entry.id,
        sequenceNumber: entry.sequenceNumber,
        timestamp: entry.timestamp,
        action: entry.action,
        entityId: entry.entityId,
        details: entry.details,
        previousHash: entry.previousHash
      });

      const recomputedHash = await calculateHash(logDataToHash);

      if (recomputedHash !== entry.hash) {
        console.error(
          `[Audit] ❌ HASH CORROMPU à l'index ${i} (ID: ${entry.id.substring(0, 8)})`,
          `Calculé=${recomputedHash.substring(0, 8)}, ` +
          `stocké=${entry.hash.substring(0, 8)}`
        );
        return {
          valid: false,
          totalEntries: allLogs.length,
          corruptedAt: i,
          corruptedEntryId: entry.id,
          error: `Hash mismatch at index ${i}: data tampered`
        };
      }

      expectedPreviousHash = entry.hash;
    }

    console.log(`[Audit] ✓ Chaîne d'audit intègre (${allLogs.length} entrées vérifiées)`);
    return { valid: true, totalEntries: allLogs.length };

  } catch (error) {
    console.error('[Audit] Erreur vérification intégrité:', error);
    return {
      valid: false,
      totalEntries: 0,
      error: `Exception: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
