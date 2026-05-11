import { BaseEntity } from './common.js';

export interface HuntingZone extends BaseEntity {
  name: string;
  description?: string;
  regionId: number;
  area: number; // en hectares
  coordinates: GeoJSON.Polygon;
  isActive: boolean;
}

export interface HuntingPermit extends BaseEntity {
  permitNumber: string;
  hunterId: number;
  zoneId: number;
  startDate: Date;
  endDate: Date;
  status: 'pending' | 'approved' | 'rejected' | 'suspended' | 'expired';
  totalQuota: number;
  usedQuota: number;
  notes?: string;
}

export interface HuntingQuota extends BaseEntity {
  permitId: number;
  speciesId: number;
  maxQuota: number;
  usedQuota: number;
}

export interface HuntingReport extends BaseEntity {
  permitId: number;
  hunterId: number;
  zoneId: number;
  reportDate: Date;
  speciesId: number;
  quantity: number;
  location: GeoJSON.Point;
  notes?: string;
  status: 'draft' | 'submitted' | 'validated' | 'rejected';
}

export interface Species extends BaseEntity {
  name: string;
  scientificName: string;
  description?: string;
  isProtected: boolean;
  protectionStatus?: string;
  imageUrl?: string;
}
