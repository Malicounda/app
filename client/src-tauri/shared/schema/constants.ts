// Constantes partagées entre le client et le serveur

export const USER_ROLES = {
  ADMIN: 'admin',
  REGIONAL_AGENT: 'regional_agent',
  SECTOR_AGENT: 'sector_agent',
  HUNTER: 'hunter',
  GUIDE: 'guide',
  OBSERVER: 'observer',
} as const;

export const PERMIT_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended',
  EXPIRED: 'expired',
} as const;

export const REPORT_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  VALIDATED: 'validated',
  REJECTED: 'rejected',
} as const;

export const DEFAULT_PAGINATION = {
  PAGE: 1,
  LIMIT: 10,
  SORT_BY: 'createdAt',
  SORT_ORDER: 'desc' as const,
};

export const GEO_JSON_TYPES = [
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
  'GeometryCollection',
  'Feature',
  'FeatureCollection',
] as const;
