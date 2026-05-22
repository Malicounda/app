/** Normalisation des libellés géographiques (accents, casse). */
export function normalizeZoneKey(value: string | null | undefined): string {
  if (!value) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

export type AdminZoneScope = 'region' | 'departement' | 'arrondissement' | 'commune';

export type ZoneFields = {
  region?: string | null;
  departement?: string | null;
  commune?: string | null;
  arrondissement?: string | null;
};

/** Niveau le plus fin renseigné sur le profil superviseur. */
export function getAdminZoneScope(profile: ZoneFields): AdminZoneScope | null {
  if (normalizeZoneKey(profile.commune)) return 'commune';
  if (normalizeZoneKey(profile.arrondissement)) return 'arrondissement';
  if (normalizeZoneKey(profile.departement)) return 'departement';
  if (normalizeZoneKey(profile.region)) return 'region';
  return null;
}

/** Vérifie si une alerte appartient à la zone administrative du superviseur. */
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

/** Superviseur destinataire d'une alerte (routage notifications). */
export function supervisorReceivesAlert(
  supervisor: ZoneFields,
  alert: ZoneFields
): boolean {
  return alertMatchesSupervisorZone(alert, supervisor);
}
