export interface HunterProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  birthDate?: string;
  licenseNumber?: string;
  licenseIssueDate?: string;
  licenseExpiryDate?: string;
  status: 'active' | 'expired' | 'suspended' | 'pending';
  photoUrl?: string;
  createdAt: string;
  updatedAt: string;
  documents?: Array<{
    id: string;
    type: string;
    url: string;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: string;
    updatedAt: string;
  }>;
}
