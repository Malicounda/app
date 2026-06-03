import { getData, storeData } from './pwaUtils';
import type { AttachmentOffline } from './pwaUtils';

export const CHUNK_SIZE = 1024 * 1024; // 1 MB

export async function calculateSHA256(blob: Blob | ArrayBuffer): Promise<string> {
  const arrayBuffer = blob instanceof ArrayBuffer ? blob : await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function uploadAttachmentChunked(
  attachId: string, 
  fileName: string, 
  type: string, 
  headers: Record<string, string>,
  onProgress?: (progress: number) => void
): Promise<void> {
  const attachment = await getData<AttachmentOffline>('attachments', attachId);
  if (!attachment || !attachment.blob) {
    throw new Error(`Pièce jointe ${attachId} introuvable ou vide`);
  }

  const fileBlob = new Blob([attachment.blob], { type });
  const totalSize = fileBlob.size;
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
  
  // Reprise d'upload : récupérer les chunks déjà envoyés
  const uploadedChunks = attachment.uploadedChunks || [];
  const uploadId = attachId; // Identifiant unique pour la session d'upload

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    // Si ce chunk a déjà été envoyé, on le passe
    if (uploadedChunks.includes(chunkIndex)) {
      if (onProgress) {
        onProgress(Math.round(((chunkIndex + 1) / totalChunks) * 100));
      }
      continue;
    }

    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalSize);
    const chunk = fileBlob.slice(start, end, type);
    
    const chunkHash = await calculateSHA256(chunk);

    const formData = new FormData();
    formData.append('chunk', chunk, fileName);
    formData.append('uploadId', uploadId);
    formData.append('chunkIndex', chunkIndex.toString());
    formData.append('totalChunks', totalChunks.toString());
    formData.append('chunkHash', chunkHash); // Intégrité cryptographique du chunk

    // Effectuer la requête d'upload pour ce chunk
    const chunkHeaders = { ...headers };
    delete chunkHeaders['Content-Type']; // fetch génère le boundary multipart/form-data

    const apiBaseUrl = (await import('@/utils/environment')).getApiBaseUrl();
    const response = await fetch(`${apiBaseUrl}/api/attachments/chunk`, {
      method: 'POST',
      headers: chunkHeaders,
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Erreur lors de l'upload du chunk ${chunkIndex}: ${response.status}`);
    }

    // Succès du chunk : sauvegarde locale de l'état d'avancement (reprise après coupure)
    uploadedChunks.push(chunkIndex);
    attachment.uploadedChunks = uploadedChunks;
    attachment.status = 'UPLOADING';
    await storeData('attachments', attachment);

    if (onProgress) {
      onProgress(Math.round(((chunkIndex + 1) / totalChunks) * 100));
    }
  }

  // Upload terminé ! Mettre à jour le statut
  attachment.status = 'UPLOADED';
  await storeData('attachments', attachment);
}
