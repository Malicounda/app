import type { Hunter } from '../db/schema.js';

export interface DocumentStatus {
  idCardDocument: boolean;
  weaponPermit: boolean;
  hunterPhoto: boolean;
  treasuryStamp: boolean;
  weaponReceipt: boolean;
  insurance: boolean;
  moralCertificate: boolean;
  [key: string]: boolean;
}

export interface PermitValidationResult {
  canCreatePermit: boolean;
  missingItems: string[];
  missingDocuments: string[];
  missingPersonalInfo: string[];
  missingWeaponInfo: string[];
  completionPercentage: number;
  ageValid: boolean;
  age: number;
  hunterData: Pick<Hunter, 'id' | 'firstName' | 'lastName' | 'phone' | 'region'>;
  documentStatus?: DocumentStatus;
}

export function validateHunterForPermitRequest(hunterId: number): Promise<PermitValidationResult>;

export function validatePermitCreation(hunterId: number): Promise<{
  success: boolean;
  message: string;
  validation?: PermitValidationResult;
  missingItems?: string[];
  ageValid?: boolean;
  age?: number;
  documentStatus?: DocumentStatus;
}>;
