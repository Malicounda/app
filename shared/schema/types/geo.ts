import { BaseEntity } from './common.js';

// Déclaration des types GeoJSON pour TypeScript
export declare namespace GeoJSON {
  type Position = number[]; // [longitude, latitude] pour les points
  
  interface Geometry<T extends string, C> {
    type: T;
    coordinates: C;
    crs?: {
      type: string;
      properties: Record<string, unknown>;
    };
  }

  interface Point extends Geometry<'Point', Position> {}
  
  interface MultiPoint extends Geometry<'MultiPoint', Position[]> {}
  
  interface LineString extends Geometry<'LineString', Position[]> {}
  
  interface MultiLineString extends Geometry<'MultiLineString', Position[][]> {}
  
  interface Polygon extends Geometry<'Polygon', Position[][]> {}
  
  interface MultiPolygon extends Geometry<'MultiPolygon', Position[][][]> {}
  
  type GeometryCollection = {
    type: 'GeometryCollection';
    geometries: Array<Point | MultiPoint | LineString | MultiLineString | Polygon | MultiPolygon>;
  };
  
  type GeometryObject = Point | MultiPoint | LineString | MultiLineString | Polygon | MultiPolygon | GeometryCollection;
  
  interface GeoJsonProperties {
    [key: string]: unknown;
  }
  
  interface Feature<G extends GeometryObject = GeometryObject, P = GeoJsonProperties> {
    type: 'Feature';
    geometry: G;
    properties: P | null;
    id?: string | number;
  }
  
  interface FeatureCollection<G extends GeometryObject = GeometryObject, P = GeoJsonProperties> {
    type: 'FeatureCollection';
    features: Array<Feature<G, P>>;
  }
}

// Types pour les entités géographiques
export interface Region extends BaseEntity {
  name: string;
  code: string;
  description?: string;
  boundary: GeoJSON.Polygon;
  area: number; // en km²
  population?: number;
  isActive: boolean;
}

export interface Zone extends BaseEntity {
  name: string;
  code: string;
  regionId: number;
  description?: string;
  boundary: GeoJSON.Polygon;
  area: number; // en km²
  isActive: boolean;
  region?: Region;
}

export interface Sector extends BaseEntity {
  name: string;
  code: string;
  zoneId: number;
  regionId: number;
  description?: string;
  boundary: GeoJSON.Polygon;
  area: number; // en km²
  isActive: boolean;
  zone?: Zone;
  region?: Region;
}

// Types pour les recherches géographiques
export interface GeoSearchParams {
  coordinates: [number, number]; // [longitude, latitude]
  radius?: number; // en mètres
  limit?: number;
}

export interface ReverseGeocodeResult {
  region?: Region;
  zone?: Zone;
  sector?: Sector;
  address?: {
    street?: string;
    city?: string;
    country?: string;
    formatted: string;
  };
}
