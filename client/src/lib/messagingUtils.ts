/** Identifiant API pour DELETE /api/messages/conversation/:identifier */
export function resolveConversationDeleteIdentifier(
  contactKey: string,
  contactIdentifier?: string
): string {
  if (contactIdentifier?.trim()) return contactIdentifier.trim();
  if (contactKey.startsWith('direct_')) return contactKey.slice('direct_'.length);
  if (contactKey.startsWith('group_')) return contactKey;
  return contactKey;
}

export function isGroupConversationKey(contactKey: string): boolean {
  return contactKey.startsWith('group_') || contactKey === 'deleted';
}
