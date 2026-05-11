export function buildAttachmentUrl(fileName: string | null | undefined): string | null {
  if (!fileName) return null;
  const trimmed = fileName.trim();
  if (!trimmed) return null;

  const base = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || "";
  const origin = base ? base.replace(/\/api$/i, "") : "";

  if (trimmed.startsWith("http")) return trimmed;
  if (trimmed.startsWith("/")) return `${origin}${trimmed}`;
  return `${origin}/uploads/${trimmed}`;
}
