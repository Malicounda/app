// Types partagés entre le client et le serveur
export interface HuntingGuide {
  id: string;
  name: string;
  // Ajoutez d'autres champs selon vos besoins
}

export interface HuntingPermit {
  id: string;
  // Ajoutez d'autres champs selon vos besoins
}

export type RegionStatus = 'open' | 'partial' | 'closed' | 'unknown';

export interface RegionStatusInfo {
  status: RegionStatus;
  color: string;
}

export interface RegionStatusMap {
  [regionName: string]: RegionStatusInfo;
}
