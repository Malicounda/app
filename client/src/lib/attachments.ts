import { getApiBaseUrl } from "@/utils/environment";

export function buildAttachmentUrl(fileName: string | null | undefined): string | null {
  if (!fileName) return null;
  const trimmed = fileName.trim();
  if (!trimmed) return null;

  const base = getApiBaseUrl();
  const origin = base ? base.replace(/\/api$/i, "") : "";

  if (trimmed.startsWith("http")) return trimmed;
  if (trimmed.startsWith("/")) return `${origin}${trimmed}`;
  return `${origin}/uploads/${trimmed}`;
}
