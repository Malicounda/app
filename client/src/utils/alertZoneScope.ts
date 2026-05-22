export type ZoneFields = {
  region?: string | null;
  departement?: string | null;
  commune?: string | null;
  arrondissement?: string | null;
};

const normalizeZoneKey = (value: string | null | undefined): string => {
  if (!value) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
};

type AdminZoneScope = 'region' | 'departement' | 'arrondissement' | 'commune';

const getAdminZoneScope = (profile: ZoneFields): AdminZoneScope | null => {
  if (normalizeZoneKey(profile.commune)) return 'commune';
  if (normalizeZoneKey(profile.arrondissement)) return 'arrondissement';
  if (normalizeZoneKey(profile.departement)) return 'departement';
  if (normalizeZoneKey(profile.region)) return 'region';
  return null;
};

/** Filtre carte : alertes visibles pour un superviseur selon sa zone. */
export function alertMatchesSupervisorZone(alert: ZoneFields, supervisor: ZoneFields): boolean {
  const scope = getAdminZoneScope(supervisor);
  if (!scope) return false;

  const aReg = normalizeZoneKey(alert.region);
  const aDep = normalizeZoneKey(alert.departement);
  const aCom = normalizeZoneKey(alert.commune);
  const aArr = normalizeZoneKey(alert.arrondissement);

  const uReg = normalizeZoneKey(supervisor.region);
  const uDep = normalizeZoneKey(supervisor.departement);
  const uCom = normalizeZoneKey(supervisor.commune);
  const uArr = normalizeZoneKey(supervisor.arrondissement);

  switch (scope) {
    case 'commune':
      return !!uCom && !!aCom && uCom === aCom;
    case 'arrondissement':
      return !!uArr && !!aArr && uArr === aArr;
    case 'departement':
      return !!uDep && !!aDep && uDep === aDep;
    case 'region':
      return !!uReg && !!aReg && uReg === aReg;
    default:
      return false;
  }
}

export function filterAlertsForSupervisor<T extends ZoneFields>(
  alerts: T[],
  supervisor: ZoneFields
): T[] {
  return alerts.filter((a) => alertMatchesSupervisorZone(a, supervisor));
}

/** Libellé lieu d'une alerte pour affichage (ticker, listes). */
export function formatAlertLocation(alert?: {
  commune?: string | null;
  arrondissement?: string | null;
  departement?: string | null;
  region?: string | null;
} | null): string {
  if (!alert) return 'Lieu inconnu';
  const parts = [alert.commune, alert.arrondissement, alert.departement, alert.region]
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  const unique = parts.filter((p, i) => parts.indexOf(p) === i);
  return unique.length > 0 ? unique.join(' / ') : 'Lieu inconnu';
}
