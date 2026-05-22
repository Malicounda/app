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

export type AlertLocationFields = ZoneFields & {
  title?: string | null;
  message?: string | null;
  nature?: string | null;
};

/**
 * Lieu GPS de l'alerte (commune / arrondissement / département / région),
 * résolu côté API via resolveAdministrativeAreas() + tables shapefile.
 */
export function formatAlertLocation(alert?: ZoneFields | null): string {
  if (!alert) return 'Lieu inconnu';
  const parts = [alert.commune, alert.arrondissement, alert.departement, alert.region]
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  const unique = parts.filter((p, i) => parts.indexOf(p) === i);
  return unique.length > 0 ? unique.join(' / ') : 'Lieu inconnu';
}

export function formatAlertTickerTitle(alert?: AlertLocationFields | null): string {
  if (!alert) return 'Alerte';
  const title = String(alert.title || '').trim();
  if (title) return title;
  const nature = String(alert.nature || '').trim();
  if (nature) return `Alerte ${nature.replace(/_/g, ' ')}`;
  const msg = String(alert.message || '').trim();
  return msg || 'Alerte';
}

/** Région ou département résumé (avant le titre dans le ticker). */
export function formatAlertZoneSummary(alert?: ZoneFields | null): string {
  if (!alert) return '';
  return String(alert.region || alert.departement || '').trim();
}

/** Segments pour le bandeau superviseur (format demandé). */
export function buildSupervisorTickerParts(notification: {
  alert?: AlertLocationFields & {
    sender?: { grade?: string | null; first_name?: string | null; last_name?: string | null };
    users?: { grade?: string | null; first_name?: string | null; last_name?: string | null };
  };
  message?: string | null;
}) {
  const alert = notification.alert;
  const sender = alert?.sender ?? alert?.users;
  const grade = String(sender?.grade || '').trim();
  const fullName =
    [sender?.first_name, sender?.last_name].filter(Boolean).join(' ') || 'Agent inconnu';
  const zoneSummary = formatAlertZoneSummary(alert);
  const title = formatAlertTickerTitle(alert ?? { message: notification.message });
  const gpsLocation = formatAlertLocation(alert);
  return { grade, fullName, zoneSummary, title, gpsLocation };
}
