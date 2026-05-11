// Service des permis pour Android
import { getDatabaseConnection } from '../utils/database';

export interface Permis {
  id: number;
  numero: string;
  type: string;
  espece: string;
  quantite: number;
  zone: string;
  date_debut: string;
  date_fin: string;
  statut: string;
  agent_id?: number;
  created_at: string;
}

export interface PermisData {
  numero: string;
  type: string;
  espece: string;
  quantite: number;
  zone: string;
  date_debut: string;
  date_fin: string;
  agent_id?: number;
}

export class PermisService {
  private static instance: PermisService;

  static getInstance(): PermisService {
    if (!PermisService.instance) {
      PermisService.instance = new PermisService();
    }
    return PermisService.instance;
  }

  async createPermis(permisData: PermisData): Promise<{ success: boolean; error?: string; permis?: Permis }> {
    try {
      const db = await getDatabaseConnection();

      // Vérifier si le numéro existe déjà
      const existing = await db.select(
        'SELECT id FROM permis WHERE numero = ?',
        [permisData.numero]
      ) as any[];

      if (existing.length > 0) {
        return { success: false, error: 'Un permis avec ce numéro existe déjà' };
      }

      // Insérer le nouveau permis
      await db.execute(
        `INSERT INTO permis (numero, type, espece, quantite, zone, date_debut, date_fin, agent_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          permisData.numero,
          permisData.type,
          permisData.espece,
          permisData.quantite,
          permisData.zone,
          permisData.date_debut,
          permisData.date_fin,
          permisData.agent_id
        ]
      );

      // Récupérer le permis créé
      const result = await db.select(
        'SELECT * FROM permis WHERE numero = ?',
        [permisData.numero]
      ) as Permis[];

      return { success: true, permis: result[0] };
    } catch (error) {
      console.error('Erreur lors de la création du permis:', error);
      return { success: false, error: 'Erreur lors de la création du permis' };
    }
  }

  async getAllPermis(): Promise<Permis[]> {
    try {
      const db = await getDatabaseConnection();
      const result = await db.select(
        `SELECT p.*, u.nom as agent_nom, u.prenom as agent_prenom
         FROM permis p
         LEFT JOIN users u ON p.agent_id = u.id
         ORDER BY p.created_at DESC`
      ) as Permis[];
      return result;
    } catch (error) {
      console.error('Erreur lors de la récupération des permis:', error);
      return [];
    }
  }

  async getPermisById(id: number): Promise<Permis | null> {
    try {
      const db = await getDatabaseConnection();
      const result = await db.select(
        `SELECT p.*, u.nom as agent_nom, u.prenom as agent_prenom
         FROM permis p
         LEFT JOIN users u ON p.agent_id = u.id
         WHERE p.id = ?`,
        [id]
      ) as Permis[];
      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error('Erreur lors de la récupération du permis:', error);
      return null;
    }
  }

  async updatePermisStatus(id: number, statut: string): Promise<{ success: boolean; error?: string }> {
    try {
      const db = await getDatabaseConnection();

      await db.execute(
        'UPDATE permis SET statut = ? WHERE id = ?',
        [statut, id]
      );

      return { success: true };
    } catch (error) {
      console.error('Erreur lors de la mise à jour du permis:', error);
      return { success: false, error: 'Erreur lors de la mise à jour du permis' };
    }
  }

  async deletePermis(id: number): Promise<{ success: boolean; error?: string }> {
    try {
      const db = await getDatabaseConnection();

      await db.execute('DELETE FROM permis WHERE id = ?', [id]);

      return { success: true };
    } catch (error) {
      console.error('Erreur lors de la suppression du permis:', error);
      return { success: false, error: 'Erreur lors de la suppression du permis' };
    }
  }

  async getPermisByAgent(agentId: number): Promise<Permis[]> {
    try {
      const db = await getDatabaseConnection();
      const result = await db.select(
        'SELECT * FROM permis WHERE agent_id = ? ORDER BY created_at DESC',
        [agentId]
      ) as Permis[];
      return result;
    } catch (error) {
      console.error('Erreur lors de la récupération des permis de l\'agent:', error);
      return [];
    }
  }

  async getPermisStats(): Promise<{
    total: number;
    en_attente: number;
    approuves: number;
    rejetes: number;
  }> {
    try {
      const db = await getDatabaseConnection();

      const total = await db.select('SELECT COUNT(*) as count FROM permis') as any[];
      const en_attente = await db.select('SELECT COUNT(*) as count FROM permis WHERE statut = "en_attente"') as any[];
      const approuves = await db.select('SELECT COUNT(*) as count FROM permis WHERE statut = "approuve"') as any[];
      const rejetes = await db.select('SELECT COUNT(*) as count FROM permis WHERE statut = "rejete"') as any[];

      return {
        total: total[0].count,
        en_attente: en_attente[0].count,
        approuves: approuves[0].count,
        rejetes: rejetes[0].count
      };
    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques:', error);
      return { total: 0, en_attente: 0, approuves: 0, rejetes: 0 };
    }
  }
}
