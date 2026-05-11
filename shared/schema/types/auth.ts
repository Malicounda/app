import { BaseEntity } from './common.js';

export interface UserRole {
  id: number;
  name: string;
  description?: string;
  permissions: string[];
}

export interface User extends BaseEntity {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  isActive: boolean;
  lastLogin?: Date | null;
  role: UserRole;
  regionId?: number;
  zoneId?: number;
  hunterId?: number;
  guideId?: number;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ResetPasswordRequest {
  email: string;
  token: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ForgotPasswordRequest {
  email: string;
}
