import { resolveApiUrl } from '@/utils/environment';

/** URL API authentifiée pour télécharger / prévisualiser une pièce jointe message. */
export function buildMessageAttachmentUrl(
  messageId: number,
  options?: { isGroup?: boolean; download?: boolean }
): string {
  const segment = options?.isGroup
    ? `/api/messages/group/${messageId}/attachment`
    : `/api/messages/${messageId}/attachment`;
  let url = resolveApiUrl(segment);
  if (options?.download) {
    url += url.includes('?') ? '&download=1' : '?download=1';
  }
  return url;
}
