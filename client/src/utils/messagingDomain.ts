/** Paramètre domaineId pour l'API messagerie (null = domaine Alerte). */
export function getMessagingDomaineQueryParam(): string {
  const domain = (typeof window !== 'undefined' ? localStorage.getItem('domain') || '' : '').toUpperCase();
  if (domain === 'CHASSE') return 'domaineId=1';
  if (domain === 'REBOISEMENT') return 'domaineId=33';
  return 'domaineId=null';
}

export function getMessagingDomaineIdForHook(): number | "null" {
  const domain = (typeof window !== 'undefined' ? localStorage.getItem('domain') || '' : '').toUpperCase();
  if (domain === 'CHASSE') return 1;
  if (domain === 'REBOISEMENT') return 33;
  return "null";
}
