// Service d'authentification local pour Android
import { getDatabaseConnection } from '../utils/database';

export interface User {
  id: number;
  email: string;
  role: string;
  nom: string;
  prenom: string;
  telephone?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export class AuthService {
  private static instance: AuthService;
  private currentUser: User | null = null;

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async login(credentials: LoginCredentials): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const db = await getDatabaseConnection();

      // Vérifier les identifiants
      const result = await db.select(
        'SELECT id, email, password, role, nom, prenom, telephone FROM users WHERE email = ?',
        [credentials.email]
      ) as any[];

      if (result.length === 0) {
        return { success: false, error: 'Utilisateur non trouvé' };
      }

      const user = result[0];

      // Vérifier le mot de passe (en production, utiliser bcrypt)
      if (user.password !== credentials.password) {
        return { success: false, error: 'Mot de passe incorrect' };
      }

      // Supprimer le mot de passe de la réponse
      const { password, ...userWithoutPassword } = user;
      this.currentUser = userWithoutPassword as User;

      // Stocker en session locale
      localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
      localStorage.setItem('isAuthenticated', 'true');

      return { success: true, user: this.currentUser };
    } catch (error) {
      console.error('Erreur lors de la connexion:', error);
      return { success: false, error: 'Erreur de connexion à la base de données' };
    }
  }

  async logout(): Promise<void> {
    this.currentUser = null;
    localStorage.removeItem('currentUser');
    localStorage.removeItem('isAuthenticated');
  }

  getCurrentUser(): User | null {
    if (this.currentUser) {
      return this.currentUser;
    }

    // Essayer de récupérer depuis le localStorage
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      this.currentUser = JSON.parse(storedUser);
      return this.currentUser;
    }

    return null;
  }

  isAuthenticated(): boolean {
    const stored = localStorage.getItem('isAuthenticated');
    return stored === 'true' && this.getCurrentUser() !== null;
  }

  async createUser(userData: {
    email: string;
    password: string;
    role: string;
    nom: string;
    prenom: string;
    telephone?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const db = await getDatabaseConnection();

      await db.execute(
        'INSERT INTO users (email, password, role, nom, prenom, telephone) VALUES (?, ?, ?, ?, ?, ?)',
        [userData.email, userData.password, userData.role, userData.nom, userData.prenom, userData.telephone]
      );

      return { success: true };
    } catch (error) {
      console.error('Erreur lors de la création de l\'utilisateur:', error);
      return { success: false, error: 'Erreur lors de la création de l\'utilisateur' };
    }
  }

  async getAllUsers(): Promise<User[]> {
    try {
      const db = await getDatabaseConnection();
      const result = await db.select(
        'SELECT id, email, role, nom, prenom, telephone FROM users ORDER BY nom, prenom'
      ) as User[];
      return result;
    } catch (error) {
      console.error('Erreur lors de la récupération des utilisateurs:', error);
      return [];
    }
  }
}
