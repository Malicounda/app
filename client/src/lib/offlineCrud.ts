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

export async function createOfflineMessage(payload: any, attachments: File[] = []): Promise<string> {
  const messageId = generateUUID();
  const attachmentTaskIds: string[] = [];

  for (const file of attachments) {
    const attachId = generateUUID();
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
  const messageRecord = {
    id: messageId,
    version: 1,
    createdAtLocal: Date.now(),
    payload,
    status: 'DRAFT'
  };

  await storeData('messages', messageRecord);

  const messageTask: SyncTask = {
    id: generateUUID(),
    action: 'CREATE_MESSAGE',
    priority: 3,
    payload,
    entityId: messageId,
    createdAt: Date.now(),
    attempts: 0,
    lastAttempt: undefined,
    status: 'PENDING',
    dependencies: attachmentTaskIds,
    idempotencyKey: `${messageId}-${await calculateHash(JSON.stringify(payload))}`
  };

  await storeData('pendingSync', messageTask);
  await logAudit('SEND_MESSAGE', messageId, { attachmentsCount: attachments.length });

  return messageId;
}
