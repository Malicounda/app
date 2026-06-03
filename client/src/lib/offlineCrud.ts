import { DatabaseManager, storeData, getData, generateUUID } from './pwaUtils';
import type { AlertOffline, AttachmentOffline, SyncTask, SyncAction } from './pwaUtils';
import { logAudit, calculateHash } from './auditLogger';

/**
 * Service gérant le CRUD local (Offline)
 * Construit un DAG de dépendances pour le SyncEngine
 */

export async function createOfflineAlert(payload: any, priority: 0 | 1 | 2 | 3 = 3, attachments: File[] = []): Promise<string> {
  const alertId = generateUUID();
  const attachmentTaskIds: string[] = [];

  // 1. Stocker les pièces jointes d'abord
  for (const file of attachments) {
    const attachId = generateUUID();
    const arrayBuffer = await file.arrayBuffer();
    
    // Calcul du hash SHA-256 pour la vérification d'intégrité
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Stockage local du fichier
    const attachmentRecord: AttachmentOffline = {
      id: attachId,
      version: 1,
      createdAtLocal: Date.now(),
      blob: arrayBuffer,
      alertId,
      fileSize: file.size,
      fileHash,
      status: 'STORED_LOCAL'
    };
    
    await storeData('attachments', attachmentRecord);

    // Mettre la tâche d'upload en file d'attente
    const uploadTaskId = generateUUID();
    const uploadTask: SyncTask = {
      id: uploadTaskId,
      action: 'UPLOAD_ATTACHMENT',
      priority, // Hérite de la priorité de l'alerte
      payload: { attachId, fileName: file.name, type: file.type },
      entityId: attachId,
      createdAt: Date.now(),
      attempts: 0,
      lastAttempt: undefined,
      status: 'PENDING',
      idempotencyKey: attachId
    };
    
    await storeData('pendingSync', uploadTask);
    attachmentTaskIds.push(uploadTaskId);
  }

  // 2. Stocker l'Alerte locale
  const alertRecord: AlertOffline = {
    id: alertId,
    version: 1,
    createdAtLocal: Date.now(),
    payload,
    priority: priority === 0 ? 'EMERGENCY' : priority === 1 ? 'CRITICAL' : priority === 2 ? 'HIGH' : 'NORMAL',
    status: 'DRAFT'
  };

  await storeData('alerts', alertRecord);

  // 3. Mettre l'Alerte en file d'attente (AVEC DÉPENDANCES)
  const alertTaskId = generateUUID();
  const alertTask: SyncTask = {
    id: alertTaskId,
    action: 'CREATE_ALERT',
    priority,
    payload,
    entityId: alertId,
    createdAt: Date.now(),
    attempts: 0,
    lastAttempt: undefined,
    status: 'PENDING',
    dependencies: attachmentTaskIds, // Ne sera traitée qu'une fois ces tâches résolues
    idempotencyKey: `${alertId}-${await calculateHash(JSON.stringify(payload))}`
  };

  await storeData('pendingSync', alertTask);
  await logAudit('CREATE_ALERT', alertId, { priority, attachmentsCount: attachments.length });

  return alertId;
}

export async function updateOfflineAlert(alertId: string, payload: any): Promise<void> {
  const existing = await getData<AlertOffline>('alerts', alertId);
  if (!existing) throw new Error("Alerte introuvable localement");

  const updatedRecord = {
    ...existing,
    version: existing.version + 1,
    payload
  };

  await storeData('alerts', updatedRecord);

  // Mettre à jour la file d'attente
  const updateTask: SyncTask = {
    id: generateUUID(),
    action: 'UPDATE_ALERT',
    priority: 3, // Normal
    payload,
    entityId: alertId,
    createdAt: Date.now(),
    attempts: 0,
    lastAttempt: undefined,
    status: 'PENDING',
    idempotencyKey: `${alertId}-UPDATE-${await calculateHash(JSON.stringify(payload))}`
  };

  await storeData('pendingSync', updateTask);
  await logAudit('UPDATE_ALERT', alertId, { action: 'UPDATE' });
}

export async function deleteOfflineAlert(alertId: string): Promise<void> {
  const existing = await getData<AlertOffline>('alerts', alertId);
  if (!existing) throw new Error("Alerte introuvable localement");

  // Si elle n'était qu'en DRAFT ou PENDING_SYNC, on peut juste la supprimer
  if (existing.status === 'DRAFT' || existing.status === 'PENDING_SYNC') {
    // TODO: Il faudrait aussi nettoyer la pendingSync queue des tâches liées à cet alertId
    // Mais pour l'instant on la supprime juste du store
    await storeData('alerts', { ...existing, status: 'FAILED' }); // Pseudo-suppression logique
    await logAudit('DELETE_ALERT', alertId, { status: 'DRAFT_DELETED' });
    return;
  }

  // Sinon, c'est une suppression d'une alerte déjà envoyée au serveur
  const deleteTask: SyncTask = {
    id: generateUUID(),
    action: 'UPDATE_ALERT', // Ou 'DELETE_ALERT' si l'API le gère
    priority: 3,
    payload: { deleted: true },
    entityId: alertId,
    createdAt: Date.now(),
    attempts: 0,
    lastAttempt: undefined,
    status: 'PENDING',
    idempotencyKey: `${alertId}-DELETE`
  };

  await storeData('pendingSync', deleteTask);
  await storeData('alerts', { ...existing, status: 'FAILED' }); // Marqué supprimé
  await logAudit('DELETE_ALERT', alertId, { status: 'DELETED' });
}

export async function createOfflineMessage(payload: any, attachments: File[] = [], customId?: string | number): Promise<string> {
  const messageId = customId ? String(customId) : generateUUID();
  const attachmentTaskIds: string[] = [];
  let firstAttachId: string | undefined;

  for (const file of attachments) {
    const attachId = generateUUID();
    if (!firstAttachId) firstAttachId = attachId;
    const arrayBuffer = await file.arrayBuffer();
    
    // Calcul du hash SHA-256 pour la vérification d'intégrité
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const attachmentRecord: AttachmentOffline = {
      id: attachId,
      version: 1,
      createdAtLocal: Date.now(),
      blob: arrayBuffer,
      fileSize: file.size,
      fileHash,
      status: 'STORED_LOCAL'
    };
    
    await storeData('attachments', attachmentRecord);

    const uploadTaskId = generateUUID();
    const uploadTask: SyncTask = {
      id: uploadTaskId,
      action: 'UPLOAD_ATTACHMENT',
      priority: 3,
      payload: { attachId, fileName: file.name, type: file.type },
      entityId: attachId,
      createdAt: Date.now(),
      attempts: 0,
      lastAttempt: undefined,
      status: 'PENDING',
      idempotencyKey: attachId
    };
    
    await storeData('pendingSync', uploadTask);
    attachmentTaskIds.push(uploadTaskId);
  }

  // Stocker Message (on simule le store 'messages' qui devra être créé si absent, bien qu'on ait utilisé 'alerts' jusqu'ici)
  const messagePayload = {
    ...payload,
    offlineAttachment: attachments.length > 0 && firstAttachId ? {
      attachId: firstAttachId,
      fileName: attachments[0].name,
      fileSize: attachments[0].size,
      fileMime: attachments[0].type
    } : undefined
  };

  const messageRecord = {
    id: messageId,
    version: 1,
    createdAtLocal: Date.now(),
    payload: messagePayload,
    status: 'DRAFT'
  };

  await storeData('messages', messageRecord);

  const messageTask: SyncTask = {
    id: generateUUID(),
    action: 'CREATE_MESSAGE',
    priority: 3,
    payload: messagePayload,
    entityId: messageId,
    createdAt: Date.now(),
    attempts: 0,
    lastAttempt: undefined,
    status: 'PENDING',
    dependencies: attachmentTaskIds,
    idempotencyKey: `${messageId}-${await calculateHash(JSON.stringify(messagePayload))}`
  };

  await storeData('pendingSync', messageTask);
  await logAudit('SEND_MESSAGE', messageId, { attachmentsCount: attachments.length });

  return messageId;
}

// ── Offline Deletion & Mark-as-Read Queuing ─────────────────────────────────

/**
 * Queue an alert deletion for background sync when offline.
 */
export async function queueOfflineDeleteAlert(alertId: number): Promise<void> {
  const taskId = generateUUID();
  const task: SyncTask = {
    id: taskId,
    action: 'DELETE_ALERT',
    priority: 3,
    payload: { alertId },
    entityId: String(alertId),
    createdAt: Date.now(),
    attempts: 0,
    status: 'PENDING',
    idempotencyKey: `DELETE-ALERT-${alertId}`
  };
  await storeData('pendingSync', task);
  // Fire-and-forget: l'audit ne doit jamais bloquer une opération de queue critique
  logAudit('QUEUE_DELETE_ALERT', String(alertId), { offline: true }).catch((e) => {
    if (import.meta.env.DEV) console.warn('[offlineCrud] logAudit non-bloquant échoué:', e);
  });
}

/**
 * Queue a message deletion for background sync when offline.
 */
export async function queueOfflineDeleteMessage(messageId: number, isGroupMessage: boolean): Promise<void> {
  const taskId = generateUUID();
  const task: SyncTask = {
    id: taskId,
    action: 'DELETE_MESSAGE',
    priority: 3,
    payload: { messageId, isGroupMessage },
    entityId: String(messageId),
    createdAt: Date.now(),
    attempts: 0,
    status: 'PENDING',
    idempotencyKey: `DELETE-MSG-${messageId}`
  };
  await storeData('pendingSync', task);
  // Fire-and-forget: l'audit ne doit jamais bloquer une opération de queue critique
  logAudit('QUEUE_DELETE_MESSAGE', String(messageId), { offline: true, isGroupMessage }).catch((e) => {
    if (import.meta.env.DEV) console.warn('[offlineCrud] logAudit non-bloquant échoué:', e);
  });
}

/**
 * Queue marking an alert as read for background sync when offline.
 */
export async function queueOfflineMarkAlertRead(alertId: number): Promise<void> {
  const taskId = generateUUID();
  const task: SyncTask = {
    id: taskId,
    action: 'MARK_ALERT_READ',
    priority: 3,
    payload: { alertId },
    entityId: String(alertId),
    createdAt: Date.now(),
    attempts: 0,
    status: 'PENDING',
    idempotencyKey: `READ-ALERT-${alertId}`
  };
  await storeData('pendingSync', task);
  // Fire-and-forget: l'audit ne doit jamais bloquer une opération de queue critique
  logAudit('QUEUE_MARK_ALERT_READ', String(alertId), { offline: true }).catch((e) => {
    if (import.meta.env.DEV) console.warn('[offlineCrud] logAudit non-bloquant échoué:', e);
  });
}

/**
 * Queue marking a message as read for background sync when offline.
 */
export async function queueOfflineMarkMessageRead(messageId: number, isGroupMessage: boolean): Promise<void> {
  const taskId = generateUUID();
  const task: SyncTask = {
    id: taskId,
    action: 'MARK_MESSAGE_READ',
    priority: 3,
    payload: { messageId, isGroupMessage },
    entityId: String(messageId),
    createdAt: Date.now(),
    attempts: 0,
    status: 'PENDING',
    idempotencyKey: `READ-MSG-${messageId}`
  };
  await storeData('pendingSync', task);
  // Fire-and-forget: l'audit ne doit jamais bloquer une opération de queue critique
  logAudit('QUEUE_MARK_MESSAGE_READ', String(messageId), { offline: true, isGroupMessage }).catch((e) => {
    if (import.meta.env.DEV) console.warn('[offlineCrud] logAudit non-bloquant échoué:', e);
  });
}

/**
 * Cancel a pending message sync task (and its attachments) if it was deleted before sync occurred.
 * Returns true if the message was a pending offline message and was cancelled successfully.
 */
export async function cancelPendingMessage(messageId: number | string): Promise<boolean> {
  try {
    const db = await DatabaseManager.getDB();
    const idStr = String(messageId);

    return new Promise<boolean>((resolve, reject) => {
      const transaction = db.transaction(['pendingSync', 'messages', 'attachments'], 'readwrite');
      const syncStore = transaction.objectStore('pendingSync');
      const msgStore = transaction.objectStore('messages');
      const attachStore = transaction.objectStore('attachments');

      const request = syncStore.getAll();

      request.onsuccess = () => {
        const tasks: SyncTask[] = request.result || [];
        const createMsgTask = tasks.find(
          (t) => t.action === 'CREATE_MESSAGE' && String(t.entityId) === idStr
        );

        if (createMsgTask) {
          console.log(`[cancelPendingMessage] Found pending CREATE_MESSAGE task for messageId: ${idStr}. Cancelling...`);

          // Delete the CREATE_MESSAGE task itself
          syncStore.delete(createMsgTask.id);

          // Delete any associated attachment upload tasks and local files
          if (createMsgTask.dependencies && createMsgTask.dependencies.length > 0) {
            for (const depId of createMsgTask.dependencies) {
              const depTask = tasks.find((t) => t.id === depId);
              if (depTask) {
                syncStore.delete(depId);
                if (depTask.entityId) {
                  attachStore.delete(depTask.entityId);
                }
              }
            }
          }

          // Delete the message from local 'messages' store
          msgStore.delete(idStr);
          const idNum = Number(idStr);
          if (!isNaN(idNum)) {
            msgStore.delete(idNum);
          }

          resolve(true);
        } else {
          resolve(false);
        }
      };

      request.onerror = (e) => {
        reject(e);
      };
    });
  } catch (err) {
    console.error('[cancelPendingMessage] error:', err);
    return false;
  }
}

/**
 * Cancel a pending alert sync task (and its attachments) if it was deleted before sync occurred.
 * Returns true if the alert was a pending offline alert and was cancelled successfully.
 */
export async function cancelPendingAlert(alertId: string | number): Promise<boolean> {
  try {
    const db = await DatabaseManager.getDB();
    const idStr = String(alertId);

    return new Promise<boolean>((resolve, reject) => {
      const transaction = db.transaction(['pendingSync', 'alerts', 'attachments'], 'readwrite');
      const syncStore = transaction.objectStore('pendingSync');
      const alertStore = transaction.objectStore('alerts');
      const attachStore = transaction.objectStore('attachments');

      const request = syncStore.getAll();

      request.onsuccess = () => {
        const tasks: SyncTask[] = request.result || [];
        const createAlertTask = tasks.find(
          (t) => t.action === 'CREATE_ALERT' && String(t.entityId) === idStr
        );

        if (createAlertTask) {
          console.log(`[cancelPendingAlert] Found pending CREATE_ALERT task for alertId: ${idStr}. Cancelling...`);

          // Delete the CREATE_ALERT task
          syncStore.delete(createAlertTask.id);

          // Delete any associated attachment upload tasks and files
          if (createAlertTask.dependencies && createAlertTask.dependencies.length > 0) {
            for (const depId of createAlertTask.dependencies) {
              const depTask = tasks.find((t) => t.id === depId);
              if (depTask) {
                syncStore.delete(depId);
                if (depTask.entityId) {
                  attachStore.delete(depTask.entityId);
                }
              }
            }
          }

          // Delete the alert from local 'alerts' store
          alertStore.delete(idStr);
          const idNum = Number(idStr);
          if (!isNaN(idNum)) {
            alertStore.delete(idNum);
          }

          resolve(true);
        } else {
          resolve(false);
        }
      };

      request.onerror = (e) => {
        reject(e);
      };
    });
  } catch (err) {
    console.error('[cancelPendingAlert] error:', err);
    return false;
  }
}
