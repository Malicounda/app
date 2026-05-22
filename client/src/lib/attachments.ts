import { getApiBaseUrl, resolveApiUrl } from "@/utils/environment";

/** URL statique /uploads/{filename} — préférer buildMessageAttachmentUrl pour la messagerie. */
export function buildAttachmentUrl(fileName: string | null | undefined): string | null {
  if (!fileName) return null;
  const trimmed = fileName.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("http")) return trimmed;
  if (trimmed.startsWith("/api/")) return resolveApiUrl(trimmed);

  const origin = getApiBaseUrl().replace(/\/api\/?$/i, "");
  if (trimmed.startsWith("/uploads/")) return `${origin}${trimmed}`;
  if (trimmed.startsWith("/")) return `${origin}${trimmed}`;
  return `${origin}/uploads/${trimmed}`;
}
