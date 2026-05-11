export interface Permit {
  id: number;
  hunterId: number;
  permitNumber: string;
  type: string;
  status: string;
  issueDate: string;
  expiryDate: string;
  area: string;
  categoryId?: string;
  receiptNumber?: string;
  weapons?: string;
  metadata?: any;
  price: string;
  suspensionReason?: string;
  qrCode?: string;
  createdAt: string;
  updatedAt?: string;
  // Backend additions for access control and display
  createdBy?: number | null;
  // Issuer info (joined from users table)
  issuerId?: number | null;
  issuerRole?: string | null;
  issuerRegion?: string | null;
  issuerZone?: string | null;
  issuerUsername?: string | null;
  issuerFirstName?: string | null;
  issuerLastName?: string | null;
}

export interface PermitWithHunterInfo extends Permit {
  hunterFirstName?: string | null;
  hunterLastName?: string | null;
  hunterIdNumber?: string;
  hunterRegion?: string | null;
  hunterZone?: string | null;
}
