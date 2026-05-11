// Interface pour le type User
export interface User {
  id: number;
  username: string;
  password: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  matricule: string | null;
  serviceLocation: string | null;
  region: string | null;
  departement: string | null;
  role: string;
  hunterId: string | null;
  isActive: boolean;
  isSuspended: boolean;
  lastLogin: Date | null;
  resetToken: string | null;
  resetTokenExpiry: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}
