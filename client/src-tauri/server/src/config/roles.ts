export const ROLES = {
  ADMIN: 'admin',
  AGENT: 'agent',
  SUB_AGENT: 'sub-agent',
  HUNTER: 'hunter',
  GUEST: 'guest'
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];
