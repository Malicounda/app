type AnyFC = GeoJSON.FeatureCollection | null;

export type MapCacheData = {
  regions: AnyFC;
  departements: AnyFC;
  communes: AnyFC;
  arrondissements: AnyFC;
  ecoZones: AnyFC;
  zics: AnyFC;
  amodiees: AnyFC;
  parcVisite: AnyFC;
  regulation: AnyFC;
  protectedZones: AnyFC;
  foretClassee: AnyFC;
  reserve: AnyFC;
  parcNational: AnyFC;
  aireCommunautaire: AnyFC;
  zoneTampon: AnyFC;
  amp: AnyFC;
  empietement: AnyFC;
  feuxBrousse: AnyFC;
  carriere: AnyFC;
  concessionMiniere: AnyFC;
  autre: AnyFC;
  exploitationForestiere: AnyFC;
  alerts: Array<any> | null;
  zonesCounts: { zic: number; amodiee: number; parc_visite: number; regulation: number } | null;
  protectedCounts: Record<string, number> | null;
  agents: Array<any> | null;
  infractions: Array<any> | null;
  infractionsFetchedAt: number | null;
  updatedAt: number | null;
};

const initial: MapCacheData = {
  regions: null,
  departements: null,
  communes: null,
  arrondissements: null,
  ecoZones: null,
  zics: null,
  amodiees: null,
  parcVisite: null,
  regulation: null,
  protectedZones: null,
  foretClassee: null,
  reserve: null,
  parcNational: null,
  aireCommunautaire: null,
  zoneTampon: null,
  amp: null,
  empietement: null,
  feuxBrousse: null,
  carriere: null,
  concessionMiniere: null,
  autre: null,
  exploitationForestiere: null,
  alerts: null,
  zonesCounts: null,
  protectedCounts: null,
  agents: null,
  infractions: null,
  infractionsFetchedAt: null,
  updatedAt: null,
};

class MapCacheStore {
  private data: MapCacheData = { ...initial };

  get(): MapCacheData {
    return this.data;
  }

  set(partial: Partial<MapCacheData>) {
    this.data = { ...this.data, ...partial, updatedAt: Date.now() };
  }

  clear() {
    this.data = { ...initial };
  }
}

export const mapCache = new MapCacheStore();
