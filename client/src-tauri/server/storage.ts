import bcrypt from "bcryptjs";
import { and, count, desc, eq, getTableColumns, gte, inArray, lt, or, sql } from "drizzle-orm";
import { sql as sqlRaw } from 'drizzle-orm/sql';
import jwt from "jsonwebtoken";
import {
    groupMessageReads,
    groupMessages,
    guideHunterAssociations,
    history,
    huntedSpecies,
    hunters,
    huntingCampaigns,
    huntingGuides,
    huntingReports,
    messages,
    permitRequests,
    permits,
    taxes,
    users,
    type GroupMessage,
    type GroupMessageRead,
    type GroupMessageWithSender,
    type Guardian,
    type GuideHunterAssociation,
    type History,
    type HuntedSpecies,
    type Hunter,
    type HuntingGuide,
    type HuntingReport,
    type InsertGroupMessage,
    type InsertGuardian,
    type InsertHistory,
    type InsertHuntedSpecies,
    type InsertHunter,
    type InsertHuntingGuide,
    type InsertHuntingReport,
    type InsertMessage,
    type InsertPermit,
    type InsertPermitRequest,
    type InsertTax,
    type InsertUser,
    type Message,
    type MessageWithSender,
    type Permit,
    type PermitRequest,
    type Tax,
    type User
} from "../shared/schema.js";
import { db } from "./db.js";

  // Type guard pour vérifier si une valeur est un objet Date
  function isDateObject(value: any): value is Date {
    return value instanceof Date;
  }

  // Date du jour au format YYYY-MM-DD
  function todayDateStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  // --- Password hashing helpers (bcrypt) ---
  async function hashPassword(plain: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(plain, salt);
  }

  function isBcryptHash(value: string | null | undefined): boolean {
    if (!value) return false;
    // Bcrypt hashes usually start with $2a$, $2b$, or $2y$ and have length ~60
    return (/^\$2[aby]\$/.test(value) && value.length >= 59 && value.length <= 64);
  }

  // Helper pour formater une date en YYYY-MM-DD (compatible colonnes DATE)
  function formatDateForDB(value: string | Date | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    if (isDateObject(value)) {
      return (value as Date).toISOString().split('T')[0];
    }
    if (typeof value === 'string') {
      // Si la chaîne contient une partie temps, ne garder que la date
      if (value.includes('T') || value.includes(' ')) {
        return value.split('T')[0].split(' ')[0];
      }
      return value;
    }
    console.error(`formatDateForDB received unexpected type: ${typeof value} for value:`, value);
    return null;
  }

  // Interface for storage operations
  export interface IStorage {
    // User operations
    getUser(id: number): Promise<User | undefined>;
    getUserByUsername(username: string): Promise<User | undefined>;
    getUserByEmail(email: string): Promise<User | undefined>;
    getUserByMatricule(matricule: string): Promise<User | undefined>;
    findUserByIdentifier(identifier: string): Promise<User | undefined>;
    getAllUsers(): Promise<User[]>;
    createUser(user: InsertUser): Promise<User>;
    updateUser(id: number, userData: Partial<InsertUser>): Promise<User | undefined>;
    deleteUser(id: number): Promise<boolean>;
    getUsersByRole(role: string): Promise<User[]>;
    getUsersWithoutHunterProfile(): Promise<User[]>;

    // Hunter operations
    getHunter(id: number): Promise<Hunter | undefined>;
    getHunterByIdNumber(idNumber: string): Promise<Hunter | undefined>;
    getHunterByPhone(phone: string): Promise<Hunter | undefined>;
    getAllHunters(): Promise<Hunter[]>;
    createHunter(hunter: InsertHunter): Promise<Hunter>;
    updateHunter(id: number, hunter: Partial<InsertHunter>): Promise<Hunter | undefined>;
    activateHunterProfile(id: number): Promise<Hunter | undefined>;
    deleteHunter(id: number, force?: boolean): Promise<boolean>;

    // Hunting Guide operations
    getHuntingGuide(id: number): Promise<HuntingGuide | undefined>;
    getHuntingGuideByIdNumber(idNumber: string): Promise<HuntingGuide | undefined>;
    getAllHuntingGuides(): Promise<HuntingGuide[]>;
    getHuntingGuidesByRegion(region: string): Promise<HuntingGuide[]>;
    getHuntingGuidesByZone(zone: string): Promise<HuntingGuide[]>;
    createHuntingGuide(guide: InsertHuntingGuide): Promise<HuntingGuide>;
    updateHuntingGuide(id: number, guide: Partial<InsertHuntingGuide>): Promise<HuntingGuide | undefined>;
    deleteHuntingGuide(id: number): Promise<boolean>;

    // Guide-Hunter Association operations
    getGuideHunterAssociations(guideId: number): Promise<GuideHunterAssociation[]>;
    getGuidesByHunter(hunterId: number): Promise<HuntingGuide[]>;
    associateHunterToGuide(guideId: number, hunterId: number): Promise<GuideHunterAssociation>;
    removeHunterAssociation(guideId: number, hunterId: number): Promise<boolean>;

    // Permit operations
    getPermit(id: number): Promise<Permit | undefined>;
    getPermitByNumber(permitNumber: string): Promise<Permit | undefined>;
    getPermitsByHunterId(hunterId: number): Promise<Permit[]>;
    getAllPermits(): Promise<PermitWithHunterInfo[]>;
    getActivePermitsByHunterId(hunterId: number): Promise<Permit[]>;
    getExpiredPermitsByHunterId(hunterId: number): Promise<Permit[]>;
    createPermit(permit: InsertPermit): Promise<Permit>;
    updatePermit(id: number, permit: Partial<InsertPermit>): Promise<Permit | undefined>;
    renewPermit(id: number, expiryDate: Date): Promise<Permit | undefined>;
    suspendPermit(id: number): Promise<Permit | undefined>;
    deletePermit(id: number): Promise<boolean>;

    // Tax operations
    getTax(id: number): Promise<Tax | undefined>;
    getTaxesByHunterId(hunterId: number): Promise<Tax[]>;
    getTaxesByPermitId(permitId: number): Promise<Tax[]>;
    getAllTaxes(): Promise<Tax[]>;
    createTax(tax: InsertTax): Promise<Tax>;
    updateTax(id: number, tax: Partial<InsertTax>): Promise<Tax | undefined>;

    // Permit request operations
    getPermitRequest(id: number): Promise<PermitRequest | undefined>;
    getPermitRequestsByUserId(userId: number): Promise<PermitRequest[]>;
    getPermitRequestsByHunterId(hunterId: number): Promise<PermitRequest[]>;
    getAllPermitRequests(): Promise<PermitRequest[]>;
    getPendingPermitRequests(): Promise<PermitRequest[]>;
    createPermitRequest(permitRequest: InsertPermitRequest): Promise<PermitRequest>;
    updatePermitRequest(id: number, permitRequest: Partial<InsertPermitRequest>): Promise<PermitRequest | undefined>;
    approvePermitRequest(id: number, notes?: string): Promise<PermitRequest | undefined>;
    rejectPermitRequest(id: number, notes?: string): Promise<PermitRequest | undefined>;
    deletePermitRequest(id: number): Promise<boolean>;

    // Hunting report operations
    getHuntingReport(id: number): Promise<HuntingReport | undefined>;
    getHuntingReportsByUserId(userId: number): Promise<HuntingReport[]>;
    getHuntingReportsByHunterId(hunterId: number): Promise<HuntingReport[]>;
    getHuntingReportsByPermitId(permitId: number): Promise<HuntingReport[]>;
    getAllHuntingReports(): Promise<HuntingReport[]>;
    createHuntingReport(huntingReport: InsertHuntingReport): Promise<HuntingReport>;
    updateHuntingReport(id: number, huntingReport: Partial<InsertHuntingReport>): Promise<HuntingReport | undefined>;
    deleteHuntingReport(id: number): Promise<boolean>;

    // Hunted species operations
    getHuntedSpecies(id: number): Promise<HuntedSpecies | undefined>;
    getHuntedSpeciesByReportId(reportId: number): Promise<HuntedSpecies[]>;
    getAllHuntedSpecies(): Promise<HuntedSpecies[]>;
    createHuntedSpecies(huntedSpecies: InsertHuntedSpecies): Promise<HuntedSpecies>;
    updateHuntedSpecies(id: number, huntedSpecies: Partial<InsertHuntedSpecies>): Promise<HuntedSpecies | undefined>;
    deleteHuntedSpecies(id: number): Promise<boolean>;

    // Weapon operations
    getWeaponTypes(): Promise<{ id: number; name: string }[]>;
    getWeaponBrands(): Promise<string[]>;
    getWeaponCalibers(): Promise<string[]>;

    // History operations
    getHistory(id: number): Promise<History | undefined>;
    getHistoryByEntityId(entityId: number, entityType: string): Promise<History[]>;
    getAllHistory(): Promise<History[]>;
    createHistory(history: InsertHistory): Promise<History>;
    clearHistory(): Promise<void>;
    clearRevenues(): Promise<void>;

    // Settings operations
    getHuntingCampaignSettings(): Promise<{
      startDate: string;
      endDate: string;
      year: string;
      isActive?: boolean;
    } | undefined>;

    saveHuntingCampaignSettings(settings: {
      startDate: string;
      endDate: string;
      year: string;
      isActive?: boolean;
    }): Promise<{
      startDate: string;
      endDate: string;
      year: string;
      isActive?: boolean;
    }>;

    // Stats operations
    getStats(): Promise<{
      hunterCount: number;
      activePermitCount: number;
      expiredPermitCount: number;
      taxCount: number;
      revenue: number;
    }>;

    // Graphique statistics
    getPermitsByMonth(): Promise<{
      month: string;
      count: number;
    }[]>;

    getRevenueByType(): Promise<{
      name: string;
      value: number;
    }[]>;

    getTaxDistribution(): Promise<{
      name: string;
      count: number;
      amount: number;
    }[]>;

    // Méthodes pour l'ID sequencing (numérotation sans sauts)
    getNextAvailableId(table: string): Promise<number>;
    resequenceIds(table: string): Promise<void>;

    // Méthodes pour les messages
    getMessage(id: number): Promise<Message | undefined>;
    getMessageWithSender(id: number): Promise<MessageWithSender | undefined>;
    getMessagesBySender(senderId: number): Promise<Message[]>;
    getMessagesByRecipient(recipientId: number): Promise<Message[]>;
    getMessageThreads(userId: number): Promise<MessageWithSender[]>;
    getMessageThread(parentMessageId: number): Promise<MessageWithSender[]>;
    createMessage(data: InsertMessage): Promise<Message>;
    addMessageRecipients(messageId: number, recipientIds: number[]): Promise<Message[]>;
    markMessageAsRead(id: number): Promise<Message | undefined>;
    markMessageAsDeleted(id: number, bySender: boolean): Promise<Message | undefined>;
    deleteMessage(id: number): Promise<boolean>;

    // Méthodes pour les messages groupés
    getGroupMessage(id: number): Promise<GroupMessage | undefined>;
    getGroupMessageWithSender(id: number): Promise<GroupMessageWithSender | undefined>;
    getGroupMessagesByRole(role: string, region?: string): Promise<GroupMessageWithSender[]>;
    getGroupMessagesByUser(userId: number): Promise<GroupMessageWithSender[]>;
    createGroupMessage(message: InsertGroupMessage): Promise<GroupMessage>;
    markGroupMessageAsRead(messageId: number, userId: number): Promise<GroupMessageRead>;
    markGroupMessageAsDeleted(messageId: number, userId: number): Promise<GroupMessageRead>;
  }

  // Définition du type pour le retour de getAllPermits avec les infos du chasseur
  export interface PermitWithHunterInfo extends Permit {
    hunterFirstName?: string | null;
    hunterLastName?: string | null;
  }

  // Implementation using database
  export class DatabaseStorage implements IStorage {
    // Auth token generation
    generateAuthToken(payload: { id: number; role: string; region?: string; hunterId?: number }): string {
      const secret = process.env.JWT_SECRET || "dev_secret_change_me";
      // 7 jours par défaut
      return jwt.sign(payload, secret, { expiresIn: "7d" });
    }

    // User operations
    async getUser(id: number): Promise<User | undefined> {
      const result = await db.select().from(users).where(eq(users.id, id));
      return result[0];
    }

    async getUserByUsername(username: string): Promise<User | undefined> {
      try {
        // Sélection complète pour éviter le chemin custom-select qui provoque une erreur Drizzle
        const result = await db
          .select()
          .from(users)
          .where(eq(users.username, username));
        return result[0];
      } catch (err) {
        console.error('[storage.getUserByUsername] select() failed, falling back to explicit columns', err);
        try {
          // Diagnostic sur le schéma importé
          const colKeys = users && (users as any)._ && (users as any)._.columns
            ? Object.keys((users as any)._.columns)
            : [];
          console.error('[storage.getUserByUsername] users columns detected:', colKeys);

          // Fallback en sélectionnant les colonnes explicitement
          const cols = getTableColumns(users);
          const result = await db
            .select(cols)
            .from(users)
            .where(eq(users.username, username));
          return result[0] as unknown as User | undefined;
        } catch (err2) {
          console.error('[storage.getUserByUsername] fallback select(getTableColumns) also failed', err2);
          throw err2;
        }
      }
    }

    async getUserByHunterId(hunterId: number): Promise<User | undefined> {
      const result = await db.select().from(users).where(eq(users.hunterId, hunterId));
      return result[0];
    }

    async getUserByEmail(email: string): Promise<User | undefined> {
      try {
        const result = await db.select().from(users).where(eq(users.email, email));
        return result[0];
      } catch (err) {
        console.error('[storage.getUserByEmail] select() failed, falling back to explicit columns', err);
        try {
          const cols = getTableColumns(users);
          const result = await db
            .select(cols)
            .from(users)
            .where(eq(users.email, email));
          return result[0] as unknown as User | undefined;
        } catch (err2) {
          console.error('[storage.getUserByEmail] fallback select(getTableColumns) also failed', err2);
          throw err2;
        }
      }
    }

    async getAllUsers(): Promise<User[]> {
      try {
        console.log("Récupération de tous les utilisateurs");
        const results = await db.select().from(users);
        console.log(`${results.length} utilisateurs récupérés`);
        return results;
      } catch (error) {
        console.error("Erreur lors de la récupération de tous les utilisateurs:", error);
        return [];
      }
    }

    async createUser(insertUser: InsertUser): Promise<User> {
      // Copier les valeurs et mapper 'zone' -> 'departement' si accidentellement fourni
      const values: any = { ...insertUser } as any;
      if (values.zone && !values.departement) {
        values.departement = values.zone;
      }
      delete values.zone; // s'assurer qu'on n'insère jamais 'zone' dans users

      // Hacher le mot de passe si nécessaire
      if (values.password && !isBcryptHash(values.password as any)) {
        values.password = await hashPassword(values.password as any) as any;
      }

      // Ne conserver que les colonnes existantes de la table users
      let userColumns: string[];
      try {
        const cols = getTableColumns(users);
        userColumns = Object.keys(cols);
      } catch (err) {
        console.warn('[storage.createUser] getTableColumns failed, using fallback columns list', err);
        // Fallback avec les colonnes connues du schéma
        userColumns = [
          'id', 'username', 'password', 'email', 'firstName', 'lastName',
          'phone', 'matricule', 'serviceLocation', 'region', 'departement',
          'agentLat', 'agentLon', 'role', 'hunterId', 'isActive', 'isSuspended',
          'createdAt', 'lastLogin', 'updatedAt'
        ];
      }

      const insertData: any = {};
      for (const key of userColumns) {
        if (values[key] !== undefined) insertData[key] = values[key];
      }

      const result = await db.insert(users).values(insertData).returning();
      return result[0];
    }

    async updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
      const { password, ...restOfData } = data as any;
      const updateData: Partial<InsertUser> = { ...restOfData };


      if (password) {
        updateData.password = await hashPassword(password);
      }

      const allowedUpdates: Partial<InsertUser> = {};
      const nonUserUpdatableFields: Array<keyof InsertUser> = [
        'username', // souvent non modifié; ajustez si vous souhaitez l'autoriser
      ];

      try {
        // Préférence: introspection sûre via getTableColumns(users)
        const cols = getTableColumns(users);
        const userSchemaKeys = Object.keys(cols) as Array<keyof InsertUser>;
        for (const key of userSchemaKeys) {
          if ((updateData as any)[key] !== undefined && !nonUserUpdatableFields.includes(key)) {
            (allowedUpdates as any)[key] = (updateData as any)[key];
          }
        }
      } catch (e) {
        // Fallback: si introspection échoue, filtrer minimalement en excluant les champs interdits
        console.warn('[storage.updateUser] getTableColumns fallback due to schema introspection error:', e);
        for (const key of Object.keys(updateData) as Array<keyof InsertUser>) {
          if (!nonUserUpdatableFields.includes(key) && (updateData as any)[key] !== undefined) {
            (allowedUpdates as any)[key] = (updateData as any)[key];
          }
        }
      }

      const result = await db
        .update(users)
        .set(allowedUpdates as any)
        .where(eq(users.id, id))
        .returning();
      return result[0];
    }

    async assignHunterToUser(userId: number, hunterId: number): Promise<User | null> {
      try {
        const result = await db
          .update(users)
          .set({ hunterId: hunterId })
          .where(eq(users.id, userId))
          .returning();

        if (result.length > 0) {
          console.log(`Successfully assigned hunter ${hunterId} to user ${userId}`);
          return result[0];
        }
        console.warn(`User ${userId} not found or no update occurred when assigning hunter ${hunterId}`);
        return null;
      } catch (error) {
        console.error(`Error assigning hunter ${hunterId} to user ${userId}:`, error);
        throw new Error("Failed to assign hunter to user");
      }
    }

    async getUserByMatricule(matricule: string): Promise<User | undefined> {
      const normalized = String(matricule || '').trim();
      if (!normalized) return undefined;
      try {
        const upper = normalized.toUpperCase();
        const upperNoSpaces = upper.replace(/\s+/g, '');

        // 1) users.matricule direct
        const primary = await db
          .select()
          .from(users)
          .where(or(eq(users.matricule, upper), eq(users.matricule, normalized)))
          .limit(1);
        if (primary[0]) return primary[0];

        // 2) users.matricule normalized (ignore spaces)
        if (upperNoSpaces) {
          const byUserMatriculeNormalized = await db.execute(sqlRaw`
            SELECT *
            FROM users
            WHERE replace(upper(coalesce(matricule, '')), ' ', '') = ${upperNoSpaces}
            LIMIT 1;
          `);
          const row = Array.isArray(byUserMatriculeNormalized) ? (byUserMatriculeNormalized as any[])[0] : undefined;
          if (row) return row as unknown as User;
        }

        // 3) agents.matricule_sol -> users
        if (upperNoSpaces) {
          const agentRows = await db.execute(sqlRaw`
            SELECT user_id
            FROM agents
            WHERE replace(upper(coalesce(matricule_sol, '')), ' ', '') = ${upperNoSpaces}
            LIMIT 1;
          `);
          const agentRow = Array.isArray(agentRows) ? (agentRows as any[])[0] : undefined;
          const userId = agentRow?.user_id;
          if (userId) {
            const byId = await this.getUser(Number(userId));
            if (byId) return byId;
          }
        }

        return undefined;
      } catch (err) {
        console.error('[storage.getUserByMatricule] query failed', err);
        return undefined;
      }
    }

    async findUserByIdentifier(identifier: string): Promise<User | undefined> {
      const value = String(identifier || '').trim();
      if (!value) return undefined;

      // 1. Numeric -> try direct user ID
      if (/^\d+$/.test(value)) {
        const id = Number(value);
        if (Number.isFinite(id) && id > 0) {
          const byId = await this.getUser(id);
          if (byId) return byId;
        }
      }

      // 2. Email address
      if (value.includes('@')) {
        const byEmail = await this.getUserByEmail(value);
        if (byEmail) return byEmail;
      }

      // 2b. Phone number (users.phone exact match)
      if (/^[+]?\d[\d\s-]{5,}$/.test(value)) {
        try {
          const results = await db.select().from(users).where(eq(users.phone, value));
          if (Array.isArray(results) && results[0]) return results[0] as unknown as User;
        } catch (err) {
          console.warn('[storage.findUserByIdentifier] phone lookup failed, continuing', err);
        }
        const hunter = await this.getHunterByPhone(value);
        if ((hunter as any)?.id) {
          const hunterUser = await this.getUserByHunterId((hunter as any).id);
          if (hunterUser) return hunterUser;
        }
      }

      // 3. Matricule (users.matricule or agents.matricule_sol)
      const byMatricule = await this.getUserByMatricule(value);
      if (byMatricule) return byMatricule;

      // 4. Username fallback
      const byUsername = await this.getUserByUsername(value);
      if (byUsername) return byUsername;

      // 5. Hunter ID number
      const hunter = await this.getHunterByIdNumber(value);
      if ((hunter as any)?.id) {
        const hunterUser = await this.getUserByHunterId((hunter as any).id);
        if (hunterUser) return hunterUser;
      }

      return undefined;
    }

    async deleteUser(id: number): Promise<boolean> {
      try {
        console.log(`Tentative de suppression de l'utilisateur ${id}`);

        // Vérifier si l'utilisateur existe
        const user = await this.getUser(id);
        if (!user) {
          console.error(`L'utilisateur ${id} n'existe pas ou a déjà été supprimé`);
          return false;
        }

        // Si l'utilisateur est associé à un chasseur, détacher le chasseur au lieu de refuser
        if (user.hunterId) {
          console.log(`L'utilisateur ${id} est associé au chasseur ${user.hunterId}, détachement...`);
          // Mettre à jour l'utilisateur pour supprimer la référence au chasseur
          await db.update(users)
            .set({ hunterId: null })
            .where(eq(users.id, id))
            .returning();
        }

        // Supprimer toutes les demandes de permis créées par cet utilisateur
        try {
          console.log(`Suppression des demandes de permis associées à l'utilisateur ${id}`);
          await db.delete(permitRequests)
            .where(eq(permitRequests.userId, id));
        } catch (err) {
          console.log(`Erreur lors de la suppression des demandes de permis:`, err);
          // On continue malgré l'erreur
        }

        // Finalement supprimer l'utilisateur
        console.log(`Suppression de l'utilisateur ${id}`);
        const result = await db.delete(users).where(eq(users.id, id)).returning();

        const success = result.length > 0;
        console.log(`Résultat de la suppression de l'utilisateur ${id}:`, success ? "Succès" : "Échec");

        return success;
      } catch (error) {
        console.error(`Erreur lors de la suppression de l'utilisateur ${id}:`, error);
        return false;
      }
    }

    async getUsersByRole(role: string): Promise<User[]> {
      try {
        const results = await db.select().from(users).where(sql`${users.role} = ${role}`);
        return results;
      } catch (error) {
        console.error(`Erreur lors de la récupération des utilisateurs avec le rôle ${role}:`, error);
        return [];
      }
    }

    async getUsersWithoutHunterProfile(): Promise<User[]> {
      try {
        const result = await db
          .select()
          .from(users)
          .where(sql`${users.hunterId} IS NULL OR ${users.hunterId} = 0`)
          .orderBy(desc(users.createdAt)); // Optionnel: ordonner pour la cohérence
        return result;
      } catch (error) {
        console.error("Error fetching users without hunter profile:", error);
        throw new Error("Failed to fetch users without hunter profile");
      }
    }

    // Méthodes stub pour les tuteurs (Guardians) - anciennes fonctionnalités supprimées
    async getGuardian(id: number): Promise<Guardian | undefined> {
      console.log('getGuardian est désactivé');
      return undefined;
    }

    async getGuardianByIdNumber(idNumber: string): Promise<Guardian | undefined> {
      console.log('getGuardianByIdNumber est désactivé');
      return undefined;
    }

    async getAllGuardians(): Promise<Guardian[]> {
      console.log('getAllGuardians est désactivé');
      return [];
    }

    async getGuardiansByHunter(hunterId: number): Promise<Guardian[]> {
      console.log('getGuardiansByHunter est désactivé');
      return [];
    }

    async createGuardian(guardian: InsertGuardian): Promise<Guardian> {
      console.log('createGuardian est désactivé');
      throw new Error('La fonctionnalité de création de tuteurs a été désactivée');
    }

    async updateGuardian(id: number, guardian: Partial<InsertGuardian>): Promise<Guardian | undefined> {
      console.log('updateGuardian est désactivé');
      return undefined;
    }

    async deleteGuardian(id: number): Promise<boolean> {
      console.log('deleteGuardian est désactivé');
      return false;
    }

    // Hunter operations
    async getHunter(id: number): Promise<Hunter | undefined> {
      // Aligner avec la logique de getAllHunters(): gérer dynamiquement departement vs zone
      try {
        const existsDepartement = await db.execute(sqlRaw`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'hunters' AND column_name = 'departement'
          ) AS exists;
        `);
        const hasDepartement = Array.isArray(existsDepartement) && (existsDepartement as any)[0]?.exists === true;
        const zoneColumn = hasDepartement ? 'departement' : 'zone';

        const rows = await db.execute(sqlRaw`
          SELECT
            id,
            first_name AS "firstName",
            last_name AS "lastName",
            date_of_birth AS "dateOfBirth",
            id_number AS "idNumber",
            phone,
            address,
            experience,
            profession,
            category,
            pays,
            nationality,
            region,
            ${sqlRaw.raw(zoneColumn)} AS "departement",
            weapon_type AS "weaponType",
            weapon_brand AS "weaponBrand",
            weapon_reference AS "weaponReference",
            weapon_caliber AS "weaponCaliber",
            weapon_other_details AS "weaponOtherDetails",
            is_active AS "isActive",
            is_minor AS "isMinor",
            created_at AS "createdAt"
          FROM hunters
          WHERE id = ${id}
          LIMIT 1
        `);

        const row = Array.isArray(rows) ? (rows as any[])[0] : undefined;
        return row as unknown as Hunter | undefined;
      } catch (err) {
        console.error('[storage.getHunter] erreur lors de la sélection du chasseur:', err);
        return undefined;
      }
    }

    async getHunterByIdNumber(idNumber: string): Promise<Hunter | undefined> {
      const result = await db.select().from(hunters).where(eq(hunters.idNumber, idNumber));
      return result[0];
    }

    async getHunterByPhone(phone: string): Promise<Hunter | undefined> {
      const result = await db.select().from(hunters).where(eq(hunters.phone, phone));
      return result[0];
    }

    async getAllHunters(): Promise<Hunter[]> {
      console.log("Tentative de récupération de tous les chasseurs");
      // Certains environnements peuvent encore avoir la colonne 'zone' au lieu de 'departement'.
      // On détecte dynamiquement la colonne disponible et on sélectionne en conséquence pour éviter un 500.
      try {
        // Vérifier si la colonne 'departement' existe dans la table hunters
        const existsDepartement = await db.execute(sqlRaw`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'hunters' AND column_name = 'departement'
          ) AS exists;
        `);
        const hasDepartement = Array.isArray(existsDepartement) && (existsDepartement as any)[0]?.exists === true;
        const zoneColumn = hasDepartement ? 'departement' : 'zone';

        const rows = await db.execute(sqlRaw.raw(`
          SELECT
            id,
            first_name AS "firstName",
            last_name AS "lastName",
            category,
            id_number AS "idNumber",
            phone,
            region,
            ${zoneColumn} AS "zone",
            is_active AS "isActive",
            is_minor AS "isMinor",
            created_at AS "createdAt"
          FROM hunters
          ORDER BY created_at DESC
        `));

        console.log(`${Array.isArray(rows) ? (rows as any[]).length : 0} chasseurs trouvés`);
        return rows as unknown as Hunter[];
      } catch (err) {
        console.error('[storage.getAllHunters] erreur lors de la sélection des chasseurs:', err);
        return [];
      }
    }

    async getHuntersByRegion(region: string): Promise<Hunter[]> {
      return await db.select().from(hunters).where(eq(hunters.region, region));
    }

    async getHuntersByDepartement(departement: string): Promise<Hunter[]> {
      // Cette méthode récupère les chasseurs qui ont un département spécifié correspondant au département donné
      // Nous incluons également les chasseurs qui ont des permis actifs dans ce département

      // 1. D'abord récupérer tous les chasseurs explicitement assignés à ce département
      const huntersInDepartement = await db.select()
        .from(hunters)
        .where(eq(hunters.departement, departement));

      // 2. Récupérer les IDs de ces chasseurs pour les exclure plus tard
      const hunterIdsInDepartement = huntersInDepartement.map(h => h.id);

      // 3. Récupérer les permis délivrés pour ce département
      const permitsInDepartement = await db.select()
        .from(permits)
        .where(eq(permits.area, departement));

      // 4. Extraire les hunterId uniques de ces permis
      const hunterIdsWithPermits = Array.from(new Set(permitsInDepartement.map(p => p.hunterId)));

      // 5. Filtrer pour exclure les chasseurs déjà présents dans huntersInDepartement
      const additionalHunterIds = hunterIdsWithPermits.filter(id => !hunterIdsInDepartement.includes(id));

      if (additionalHunterIds.length === 0) {
        // Si aucun chasseur supplémentaire trouvé, retourner simplement les premiers résultats
        return huntersInDepartement;
      }

      // 6. Récupérer les chasseurs supplémentaires
      const additionalHunters = await db.select()
        .from(hunters)
        .where(additionalHunterIds.length > 0 ?
          or(...additionalHunterIds.map((id: number) => eq(hunters.id, id))) :
          sql`false`);

      // 7. Combiner les deux ensembles de résultats
      return [...huntersInDepartement, ...additionalHunters];
    }

    async createHunter(insertHunter: InsertHunter): Promise<Hunter> {
      try {
        // Convertir la date en chaîne de caractères au format ISO pour éviter l'erreur de type Date
        // Le problème vient du fait que PostgreSQL attend une chaîne de caractères et non un objet Date

        // On prépare une copie des données pour ne pas modifier l'original
        const hunterData = {
          ...insertHunter,
          // Assurons-nous que la date est au format YYYY-MM-DD (chaîne de caractères)
          // pour éviter les erreurs de type Date
          dateOfBirth: typeof insertHunter.dateOfBirth === 'string'
            ? insertHunter.dateOfBirth
            : (isDateObject(insertHunter.dateOfBirth)
                ? (insertHunter.dateOfBirth as Date).toISOString().split('T')[0]
                : String(insertHunter.dateOfBirth)),
        };

        console.log("Données du chasseur formatées:", hunterData); // Log de débogage

        const result = await db.insert(hunters).values(hunterData).returning();

        console.log("Hunter créé avec succès:", result[0]); // Log de débogage
        return result[0];
      } catch (error) {
        console.error("Erreur lors de la création du chasseur dans le stockage:", error);
        throw error; // Propager l'erreur pour un meilleur débogage
      }
    }

    async updateHunter(id: number, hunterData: Partial<InsertHunter>): Promise<Hunter | undefined> {
      const result = await db.update(hunters)
        .set(hunterData)
        .where(eq(hunters.id, id))
        .returning();
      return result[0];
    }

    async activateHunterProfile(id: number): Promise<Hunter | undefined> {
      const result = await db.update(hunters)
        .set({ isActive: true })
        .where(eq(hunters.id, id))
        .returning();
      return result[0];
    }

    async suspendHunter(id: number): Promise<Hunter | undefined> {
      try {
        console.log(`🔒 Tentative de suspension du chasseur ${id}`);

        // 1. Vérifier si le chasseur existe
        const hunter = await this.getHunter(id);
        if (!hunter) {
          console.error(`❌ Le chasseur ${id} n'existe pas`);
          return undefined;
        }

        // 2. Suspendre tous les permis associés au chasseur
        const hunterPermits = await this.getPermitsByHunterId(id);
        console.log(`🔍 Le chasseur ${id} possède ${hunterPermits.length} permis`);

        if (hunterPermits.length > 0) {
          for (const permit of hunterPermits) {
            if (permit.status === 'active') {
              console.log(`🔄 Suspension du permis ${permit.id} (${permit.permitNumber})`);

              // Mettre à jour le statut des permis en "suspended"
              await db.update(permits)
                .set({ status: 'suspended' })
                .where(eq(permits.id, permit.id));
            }
          }
        }

        // 3. Suspendre le chasseur en désactivant son statut
        console.log(`🔒 Suspension du chasseur ${id}`);
        const result = await db.update(hunters)
          .set({ isActive: false })
          .where(eq(hunters.id, id))
          .returning();

        // 4. Suspendre également le compte utilisateur associé
        try {
          const user = await db.select().from(users).where(eq(users.hunterId, id));
          if (user.length > 0) {
            console.log(`🔒 Suspension de l'utilisateur associé ${user[0].id} (${user[0].username})`);
            await db.update(users)
              .set({ isSuspended: true })
              .where(eq(users.hunterId, id));
          }
        } catch (userError) {
          console.error("❗️ Erreur lors de la suspension de l'utilisateur:", userError);
        }

        return result[0];
      } catch (error) {
        console.error("Erreur lors de la suspension du chasseur:", error);
        return undefined;
      }
    }

    async deleteHunter(id: number, force: boolean = false): Promise<boolean> {
      try {
        console.log(`🚀 Tentative de suppression du chasseur ${id}, force=${force}`);

        // 1. Récupérer les permis associés au chasseur
        const hunterPermits = await this.getPermitsByHunterId(id);
        console.log(`🔍 Chasseur ${id} possède ${hunterPermits.length} permis`);

        // Si le chasseur a des permis actifs et qu'on ne force pas la suppression,
        // on refuse de le supprimer
        const activePermits = hunterPermits.filter(p => p.status === 'active');
        if (activePermits.length > 0 && !force) {
          console.error(`❌ Suppression refusée : Le chasseur ${id} possède ${activePermits.length} permis actifs et force=false`);
          return false; // Ne pas supprimer le chasseur s'il a des permis
        }

        console.log(`✅ Vérification des permis actifs passée : ${activePermits.length} permis actifs, force=${force}`);

        // 2. Pour tous les permis liés, les désactiver plutôt que de les supprimer
        if (hunterPermits.length > 0) {
          for (const permit of hunterPermits) {
            if (permit.status === 'active') {
              console.log(`🔄 Désactivation du permis ${permit.id} (${permit.permitNumber})`);

              // Mettre à jour le statut des permis en "suspended" au lieu de les supprimer
              const updateResult = await db.update(permits)
                .set({ status: 'suspended' })
                .where(eq(permits.id, permit.id));

              console.log(`📊 Résultat de la désactivation du permis:`, updateResult.length > 0 ? "Succès" : "Échec");
            }
          }
        }

        // 3. Détacher les utilisateurs associés à ce chasseur
        console.log(`👥 Détachement des utilisateurs liés au chasseur ${id}`);
        const userUpdateResult = await db.update(users)
          .set({ hunterId: null })
          .where(eq(users.hunterId, id))
          .returning();

        console.log(`👤 ${userUpdateResult.length} utilisateurs détachés du chasseur ${id}`);

        // 4. Vérifier si le chasseur existe avant de le supprimer
        const hunterExists = await this.getHunter(id);
        if (!hunterExists) {
          console.error(`❓ Le chasseur ${id} n'existe pas ou a déjà été supprimé`);
          return false;
        }

        // 5. Supprimer les taxes associées (si existantes)
        try {
          console.log(`💰 Suppression des taxes associées au chasseur ${id}`);
          await db.delete(taxes)
            .where(eq(taxes.hunterId, id));
        } catch (err) {
          console.log(`⚠️ Erreur lors de la suppression des taxes:`, err);
        }

        // 6. Supprimer les demandes de permis associées (si existantes)
        try {
          console.log(`📝 Suppression des demandes de permis associées au chasseur ${id}`);
          await db.delete(permitRequests)
            .where(eq(permitRequests.hunterId, id));
        } catch (err) {
          console.log(`⚠️ Erreur lors de la suppression des demandes de permis:`, err);
        }

        // 7. Supprimer les déclarations de chasse associées (si existantes)
        try {
          console.log(`📊 Suppression des rapports de chasse associés au chasseur ${id}`);
          await db.delete(huntingReports)
            .where(eq(huntingReports.hunterId, id));
        } catch (err) {
          console.log(`⚠️ Erreur lors de la suppression des rapports de chasse:`, err);
        }

        // 8. Enfin, supprimer le chasseur
        console.log(`🗑️ Suppression du chasseur ${id}`);
        const result = await db.delete(hunters)
          .where(eq(hunters.id, id))
          .returning();

        const success = result.length > 0;
        console.log(`📊 Résultat de la suppression du chasseur ${id}:`, success ? "Succès ✓" : "Échec ×");

        return success;
      } catch (error) {
        console.error("Erreur lors de la suppression du chasseur:", error);
        return false;
      }
    }

    // Permit operations
    async getPermit(id: number): Promise<Permit | undefined> {
      const result = await db.select().from(permits).where(eq(permits.id, id));
      return result[0];
    }

    async getPermitByNumber(permitNumber: string): Promise<Permit | undefined> {
      const result = await db.select().from(permits).where(eq(permits.permitNumber, permitNumber));
      return result[0];
    }

    async getPermitsByHunterId(hunterId: number): Promise<Permit[]> {
      return await db.select().from(permits).where(eq(permits.hunterId, hunterId));
    }

    async getAllPermits(): Promise<PermitWithHunterInfo[]> {
      try {
        const results = await db.select({
          // Select only the permit fields (all columns are safe here)
          permit: permits,
          // Select ONLY the hunter columns we actually need to avoid missing-column errors
          hunterFirstName: hunters.firstName,
          hunterLastName: hunters.lastName,
          hunterIdNumber: hunters.idNumber,
        })
        .from(permits)
        .leftJoin(hunters, eq(permits.hunterId, hunters.id))
        .orderBy(desc(permits.createdAt));

        return results.map(r => ({
          ...r.permit,
          hunterFirstName: r.hunterFirstName || undefined,
          hunterLastName: r.hunterLastName || undefined,
          hunterIdNumber: r.hunterIdNumber || undefined,
        }));
      } catch (error) {
        console.error('Erreur lors de la récupération de tous les permis:', error);
        throw error;
      }
    }

    async getSuspendedPermits(): Promise<Permit[]> {
      // Sélectionner toutes les colonnes pour respecter le type Permit
      return await db.select().from(permits)
        .where(eq(permits.status, 'suspended'))
        .orderBy(desc(permits.createdAt));
    }

    async getActivePermitsByHunterId(hunterId: number): Promise<Permit[]> {
      const today = new Date().toISOString().split('T')[0];
      return db
        .select()
        .from(permits)
        .where(
          and(
            eq(permits.hunterId, hunterId),
            gte(permits.expiryDate, today)
          )
        );
    }

    async getExpiredPermitsByHunterId(hunterId: number): Promise<Permit[]> {
      const today = new Date().toISOString().split('T')[0];
      return db
        .select()
        .from(permits)
        .where(
          and(
            eq(permits.hunterId, hunterId),
            lt(permits.expiryDate, today)
          )
        );
    }

    async createPermit(permitData: InsertPermit): Promise<Permit> {
      const valuesToInsert = {
        ...permitData,
        price: String(permitData.price),
        issueDate: formatDateForDB(permitData.issueDate) ?? todayDateStr(),
        expiryDate: formatDateForDB(permitData.expiryDate) ?? todayDateStr(),
      };
      // Assurez-vous que permit_number est bien dans les données et non permitNumber
      const result = await db.insert(permits).values(valuesToInsert).returning();
      return result[0];
    }

    async updatePermit(id: number, permitData: Partial<InsertPermit>): Promise<Permit | undefined> {
      const valuesToUpdate: { [key: string]: any } = { ...permitData };

      if (permitData.issueDate !== undefined) {
        const v = formatDateForDB(permitData.issueDate);
        if (v !== null) valuesToUpdate.issueDate = v; else delete valuesToUpdate.issueDate;
      }
      if (permitData.expiryDate !== undefined) {
        const v = formatDateForDB(permitData.expiryDate);
        if (v !== null) valuesToUpdate.expiryDate = v; else delete valuesToUpdate.expiryDate;
      }
      // permits.price is TEXT in DB, InsertPermit.price is number from Zod
      if (permitData.price !== undefined) {
        valuesToUpdate.price = String(permitData.price);
      }

      const result = await db.update(permits)
        .set(valuesToUpdate)
        .where(eq(permits.id, id))
        .returning();
      return result[0];
    }

    async renewPermit(id: number, expiryDate: Date): Promise<Permit | undefined> {
      const formattedDate = expiryDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
      const result = await db.update(permits)
        .set({
          expiryDate: formattedDate,
          status: 'active'
        })
        .where(eq(permits.id, id))
        .returning();
      return result[0];
    }

    async suspendPermit(id: number): Promise<Permit | undefined> {
      console.log("Suspension de permis ID:", id);
      try {
        // Corrigé : type defini explicitement pour corriger les problèmes
        const updateData = { status: 'suspended' as const };
        const result = await db.update(permits)
          .set(updateData)
          .where(eq(permits.id, id))
          .returning();

        console.log("Résultat de la requête SQL:", result);
        return result[0];
      } catch (error) {
        console.error("Erreur dans storage.suspendPermit:", error);
        throw error;
      }
    }

    // Fonction principale pour supprimer un permis
    // La fonction ci-dessous est remplacée par celle plus complète qui vérifie les taxes associées

    async deleteAllSuspendedPermits(): Promise<Permit[]> {
      return await db.delete(permits)
        .where(eq(permits.status, 'suspended'))
        .returning();
    }

    async deletePermitBatch(permitIds: number[]): Promise<Permit[]> {
      return await db.delete(permits)
        .where(inArray(permits.id, permitIds))
        .returning();
    }

    async upgradePermit(id: number, newType: string, additionalPrice: number): Promise<Permit | undefined> {
      // Récupérer le permis actuel
      const currentPermit = await this.getPermit(id);
      if (!currentPermit) return undefined;

      // Calculer le nouveau prix (prix actuel + supplément)
      const newPrice = parseFloat(currentPermit.price.toString()) + additionalPrice;

      // Mettre à jour le permis avec le nouveau type et prix
      const result = await db.update(permits)
        .set({
          type: newType,
          price: String(newPrice) // Convertir le prix en chaîne de caractères
        })
        .where(eq(permits.id, id))
        .returning();

      return result[0];
    }

    async deletePermit(id: number): Promise<boolean> {
      console.log("Tentative de suppression du permis ID:", id);

      try {
        // Vérifier d'abord si le permis a des taxes associées
        const permitTaxes = await this.getTaxesByPermitId(id);
        if (permitTaxes.length > 0) {
          console.log("Suppression annulée: le permis a des taxes associées");
          return false; // Ne pas supprimer le permis s'il a des taxes
        }

        const result = await db.delete(permits).where(eq(permits.id, id)).returning();
        console.log("Résultat de la suppression:", result);
        return result.length > 0;
      } catch (error) {
        console.error("Erreur lors de la suppression du permis:", error);
        throw error;
      }
    }

    // Tax operations
    async getTax(id: number): Promise<Tax | undefined> {
      const result = await db.select().from(taxes).where(eq(taxes.id, id));
      return result[0];
    }

    async getTaxesByHunterId(hunterId: number): Promise<Tax[]> {
      return await db.select().from(taxes).where(eq(taxes.hunterId, hunterId));
    }

    async getTaxesByPermitId(permitId: number): Promise<Tax[]> {
      return await db.select().from(taxes).where(eq(taxes.permitId, permitId));
    }

    async getAllTaxes(): Promise<Tax[]> {
      // Sélectionner toutes les colonnes pour respecter le type Tax
      return await db.select().from(taxes).orderBy(desc(taxes.createdAt));
    }

    async createTax(taxData: InsertTax): Promise<Tax> {
      const valuesToInsert = {
        ...taxData,
        issueDate: formatDateForDB(taxData.issueDate) ?? todayDateStr(),
        // taxes.amount is TEXT in DB, InsertTax.amount is number from Zod
        amount: String(taxData.amount),
        // taxes.quantity is INTEGER in DB, InsertTax.quantity is number from Zod
        // Ensure quantity is a number (already handled if InsertTax.quantity is number)
        quantity: typeof taxData.quantity === 'string' ? parseInt(taxData.quantity, 10) : taxData.quantity,
      };
      const result = await db.insert(taxes).values(valuesToInsert).returning();
      return result[0];
    }

    async updateTax(id: number, taxData: Partial<InsertTax>): Promise<Tax | undefined> {
      const valuesToUpdate: { [key: string]: any } = { ...taxData };

      if (taxData.issueDate !== undefined) {
        const v = formatDateForDB(taxData.issueDate);
        if (v !== null) valuesToUpdate.issueDate = v; else delete valuesToUpdate.issueDate;
      }
      // taxes.amount is TEXT in DB, InsertTax.amount is number from Zod
      if (taxData.amount !== undefined) {
        valuesToUpdate.amount = String(taxData.amount);
      }
      // taxes.quantity is INTEGER in DB, InsertTax.quantity is number from Zod
      if (taxData.quantity !== undefined) {
        // Ensure quantity is a number
        valuesToUpdate.quantity = typeof taxData.quantity === 'string' ? parseInt(taxData.quantity, 10) : taxData.quantity;
      }

      const result = await db.update(taxes)
        .set(valuesToUpdate)
        .where(eq(taxes.id, id))
        .returning();
      return result[0];
    }

    // Permit request operations
    async getPermitRequest(id: number): Promise<PermitRequest | undefined> {
      const result = await db.select().from(permitRequests).where(eq(permitRequests.id, id));
      return result[0];
    }

    async getPermitRequestsByUserId(userId: number): Promise<PermitRequest[]> {
      return await db.select().from(permitRequests).where(eq(permitRequests.userId, userId));
    }

    async getPermitRequestsByHunterId(hunterId: number): Promise<PermitRequest[]> {
      return await db.select().from(permitRequests).where(eq(permitRequests.hunterId, hunterId));
    }

    async getAllPermitRequests(): Promise<PermitRequest[]> {
      return await db.select().from(permitRequests).orderBy(desc(permitRequests.createdAt));
    }

    async getPendingPermitRequests(): Promise<PermitRequest[]> {
      return await db.select()
        .from(permitRequests)
        .where(eq(permitRequests.status, 'pending'))
        .orderBy(desc(permitRequests.createdAt));
    }

    async createPermitRequest(data: InsertPermitRequest): Promise<PermitRequest> {
      console.log("Données reçues pour la création de la demande de permis:", data);

      // Based on insertPermitRequestSchema, 'status' is omitted.
      // Lint errors suggest 'requestDate' is also not on the inferred type of 'data',
      // despite not being explicitly omitted in schema.ts. We will rely on DB defaults.

      const valuesToInsert = {
        // Spread known and expected properties from data, as per InsertPermitRequest type
        hunterId: data.hunterId,
        userId: data.userId,
        requestedType: data.requestedType,
        requestedCategory: data.requestedCategory,
        // Optional fields from Zod schema (nullable in DB, not omitted from Zod schema)
        ...(data.reason && { reason: data.reason }),
        ...(data.region && { region: data.region }),
        // 'requestDate' will use DB default (defaultNow())
        // 'status' will use DB default ('pending')
        // 'notes' is omitted from Zod schema, so not included here.
        // 'createdAt' and 'updatedAt' will use DB defaults.
      };

      const result = await db.insert(permitRequests)
        .values(valuesToInsert)
        .returning();

      const newPermitRequest = result[0];

      // Si une région est spécifiée dans la demande de permis, mettre à jour le chasseur
      if (newPermitRequest.region && newPermitRequest.hunterId) {
        try {
          await db.update(hunters)
            .set({ region: newPermitRequest.region })
            .where(eq(hunters.id, newPermitRequest.hunterId));
          console.log(`✅ Région du chasseur ${newPermitRequest.hunterId} mise à jour avec ${newPermitRequest.region}`);
        } catch (error) {
          console.error("❌ Erreur lors de la mise à jour de la région du chasseur:", error);
        }
      }
      return newPermitRequest;
    }

    async updatePermitRequest(id: number, permitRequestData: Partial<InsertPermitRequest>): Promise<PermitRequest | undefined> {
      const result = await db.update(permitRequests)
        .set(permitRequestData)
        .where(eq(permitRequests.id, id))
        .returning();
      return result[0];
    }

    async approvePermitRequest(id: number, notes?: string): Promise<PermitRequest | undefined> {
      const now = new Date();

      // D'abord, obtenez la demande de permis
      const permitRequestToApprove = await this.getPermitRequest(id);
      if (!permitRequestToApprove) {
        return undefined;
      }

      // Mettre à jour la région du chasseur si elle est définie dans la demande
      if (permitRequestToApprove.region && permitRequestToApprove.hunterId) {
        try {
          await db.update(hunters)
            .set({ region: permitRequestToApprove.region })
            .where(eq(hunters.id, permitRequestToApprove.hunterId));

          console.log(`✅ Région du chasseur ${permitRequestToApprove.hunterId} mise à jour avec ${permitRequestToApprove.region} lors de l'approbation`);
        } catch (error) {
          console.error("❌ Erreur lors de la mise à jour de la région du chasseur pendant l'approbation:", error);
          // Ne pas échouer l'approbation si la mise à jour de la région échoue
        }
      }

      const result = await db.update(permitRequests)
        .set({
          status: 'approved',
          notes: notes,
          updatedAt: now
        })
        .where(eq(permitRequests.id, id))
        .returning();
      return result[0];
    }

    async rejectPermitRequest(id: number, notes?: string): Promise<PermitRequest | undefined> {
      const now = new Date();
      const result = await db.update(permitRequests)
        .set({
          status: 'rejected',
          notes: notes,
          updatedAt: now
        })
        .where(eq(permitRequests.id, id))
        .returning();
      return result[0];
    }

    async deletePermitRequest(id: number): Promise<boolean> {
      const result = await db.delete(permitRequests).where(eq(permitRequests.id, id)).returning();
      return result.length > 0;
    }

    // Hunting report operations
    async getHuntingReport(id: number): Promise<HuntingReport | undefined> {
      const result = await db.select().from(huntingReports).where(eq(huntingReports.id, id));
      return result[0];
    }

    async getHuntingReportsByUserId(userId: number): Promise<HuntingReport[]> {
      return await db.select().from(huntingReports).where(eq(huntingReports.userId, userId));
    }

    async getHuntingReportsByHunterId(hunterId: number): Promise<HuntingReport[]> {
      return await db.select({
        id: huntingReports.id,
        hunterId: huntingReports.hunterId,
        userId: huntingReports.userId,
        permitId: huntingReports.permitId,
        location: huntingReports.location,
        reportDate: huntingReports.reportDate,
        latitude: huntingReports.latitude,
        longitude: huntingReports.longitude,
        createdAt: huntingReports.createdAt,
        updatedAt: huntingReports.updatedAt
      }).from(huntingReports).where(eq(huntingReports.hunterId, hunterId)).orderBy(desc(huntingReports.createdAt));
    }

    async getHuntingReportsByPermitId(permitId: number): Promise<HuntingReport[]> {
      return await db.select().from(huntingReports).where(eq(huntingReports.permitId, permitId));
    }

    async getAllHuntingReports(): Promise<HuntingReport[]> {
      return await db.select({
        id: huntingReports.id,
        hunterId: huntingReports.hunterId,
        userId: huntingReports.userId,
        permitId: huntingReports.permitId,
        location: huntingReports.location,
        reportDate: huntingReports.reportDate,
        latitude: huntingReports.latitude,
        longitude: huntingReports.longitude,
        createdAt: huntingReports.createdAt,
        updatedAt: huntingReports.updatedAt
      }).from(huntingReports).orderBy(desc(huntingReports.createdAt));
    }

    async createHuntingReport(huntingReport: InsertHuntingReport): Promise<HuntingReport> {
      const valuesToInsert = {
        ...huntingReport,
        reportDate: formatDateForDB(huntingReport.reportDate) ?? todayDateStr(),
        // Assuming latitude and longitude in schema are strings, convert if numbers are passed
        latitude: huntingReport.latitude !== null && huntingReport.latitude !== undefined ? String(huntingReport.latitude) : null,
        longitude: huntingReport.longitude !== null && huntingReport.longitude !== undefined ? String(huntingReport.longitude) : null,
      };
      const result = await db.insert(huntingReports).values(valuesToInsert).returning();
      return result[0];
    }

    async updateHuntingReport(id: number, huntingReportData: Partial<InsertHuntingReport>): Promise<HuntingReport | undefined> {
      const valuesToUpdate: { [key: string]: any } = { ...huntingReportData };

      if (huntingReportData.reportDate !== undefined) {
        const v = formatDateForDB(huntingReportData.reportDate);
        if (v !== null) valuesToUpdate.reportDate = v; else delete valuesToUpdate.reportDate;
      }
      // Assuming latitude and longitude in schema are strings, convert if numbers are passed
      if (huntingReportData.latitude !== undefined) {
          valuesToUpdate.latitude = huntingReportData.latitude !== null ? String(huntingReportData.latitude) : null;
      }
      if (huntingReportData.longitude !== undefined) {
          valuesToUpdate.longitude = huntingReportData.longitude !== null ? String(huntingReportData.longitude) : null;
      }

      // Remove updatedAt as it's handled by the DB on update
      delete valuesToUpdate.updatedAt;

      const result = await db.update(huntingReports)
        .set(valuesToUpdate)
        .where(eq(huntingReports.id, id))
        .returning();
      return result[0];
    }

    async deleteHuntingReport(id: number): Promise<boolean> {
      // Vérifier d'abord si le rapport a des espèces chassées associées
      const huntedSpeciesForReport = await this.getHuntedSpeciesByReportId(id);
      if (huntedSpeciesForReport.length > 0) {
        // Supprimer d'abord toutes les espèces chassées
        for (const species of huntedSpeciesForReport) {
          await db.delete(huntedSpecies).where(eq(huntedSpecies.id, species.id));
        }
      }

      const result = await db.delete(huntingReports).where(eq(huntingReports.id, id)).returning();
      return result.length > 0;
    }

    // Hunted species operations
    async getHuntedSpecies(id: number): Promise<HuntedSpecies | undefined> {
      const result = await db.select().from(huntedSpecies).where(eq(huntedSpecies.id, id));
      return result[0];
    }

    async getHuntedSpeciesByReportId(reportId: number): Promise<HuntedSpecies[]> {
      return await db.select().from(huntedSpecies).where(eq(huntedSpecies.reportId, reportId));
    }

    async getAllHuntedSpecies(): Promise<HuntedSpecies[]> {
      return await db.select().from(huntedSpecies);
    }

    async createHuntedSpecies(huntedSpeciesData: InsertHuntedSpecies): Promise<HuntedSpecies> {
      const result = await db.insert(huntedSpecies).values(huntedSpeciesData).returning();
      return result[0];
    }

    async updateHuntedSpecies(id: number, huntedSpeciesData: Partial<InsertHuntedSpecies>): Promise<HuntedSpecies | undefined> {
      const result = await db.update(huntedSpecies)
        .set(huntedSpeciesData)
        .where(eq(huntedSpecies.id, id))
        .returning();
      return result[0];
    }

    async deleteHuntedSpecies(id: number): Promise<boolean> {
      const result = await db.delete(huntedSpecies).where(eq(huntedSpecies.id, id)).returning();
      return result.length > 0;
    }

    // History operations
    async getHistory(id: number): Promise<History | undefined> {
      const result = await db.select().from(history).where(eq(history.id, id));
      return result[0];
    }

    async getHistoryByEntityId(entityId: number, entityType: string): Promise<History[]> {
      return await db.select()
        .from(history)
        .where(
          and(
            eq(history.entityId, entityId),
            eq(history.entityType, entityType)
          )
        )
        .orderBy(desc(history.createdAt));
    }

    async getAllHistory(): Promise<History[]> {
      return await db.select().from(history).orderBy(desc(history.createdAt));
    }

    async createHistory(insertHistory: InsertHistory): Promise<History> {
      const result = await db.insert(history).values(insertHistory).returning();
      return result[0];
    }

    async clearHistory(): Promise<void> {
      // Supprimer tous les enregistrements d'historique sauf le dernier pour garder une trace de la suppression
      const latestHistoryEntry = await db
        .select()
        .from(history)
        .orderBy(desc(history.id))
        .limit(1);

      if (latestHistoryEntry.length > 0) {
        const latestId = latestHistoryEntry[0].id;
        await db.delete(history).where(lt(history.id, latestId));
      } else {
        // Si aucun historique n'existe encore, il n'y a rien à effacer
        return;
      }
    }

    async clearRevenues(): Promise<void> {
      // Mettre à zéro les revenus en réinitialisant les prix des permis et taxes sans les supprimer
      // Utiliser sql de drizzle-orm pour s'assurer d'avoir le bon type
      await db.update(permits).set({ price: sql`0` });
      await db.update(taxes).set({ amount: sql`0` });
    }

    // Weapon operations
    async getWeaponTypes(): Promise<{ id: number; name: string }[]> {
      // Migration Prisma -> Drizzle: on s'appuie sur l'enum métier défini dans le schéma
      // Les valeurs officielles: 'fusil', 'carabine', 'arbalete', 'arc', 'lance-pierre', 'autre'
      const types = ['fusil', 'carabine', 'arbalete', 'arc', 'lance-pierre', 'autre'];
      return types.map((name, idx) => ({ id: idx + 1, name }));
    }

    async getWeaponBrands(): Promise<string[]> {
      // DISTINCT via Drizzle (SQL brut pour la simplicité et la compatibilité)
      const rows = await db.execute(sqlRaw`SELECT DISTINCT weapon_brand FROM hunters WHERE weapon_brand IS NOT NULL AND weapon_brand <> '' ORDER BY weapon_brand ASC`);
      const arr = Array.isArray(rows) ? (rows as any[]) : [];
      return arr.map(r => r.weapon_brand).filter((b: any) => typeof b === 'string' && b.trim().length > 0);
    }

    async getWeaponCalibers(): Promise<string[]> {
      const rows = await db.execute(sqlRaw`SELECT DISTINCT weapon_caliber FROM hunters WHERE weapon_caliber IS NOT NULL AND weapon_caliber <> '' ORDER BY weapon_caliber ASC`);
      const arr = Array.isArray(rows) ? (rows as any[]) : [];
      return arr.map(r => r.weapon_caliber).filter((c: any) => typeof c === 'string' && c.trim().length > 0);
    }

    // Settings operations
    async getHuntingCampaignSettings(): Promise<{
      startDate: string;
      endDate: string;
      year: string;
      isActive?: boolean;
    } | undefined> {
      try {
        // Récupérer la dernière campagne configurée (la plus récente)
        const campaigns = await db.select().from(huntingCampaigns)
          .orderBy(desc(huntingCampaigns.id))
          .limit(1);

        // Si aucune campagne n'est configurée, retourner des paramètres par défaut
        if (campaigns.length === 0) {
          const currentYear = new Date().getFullYear();

          return {
            startDate: `${currentYear}-11-15`,
            endDate: `${currentYear + 1}-04-30`,
            year: currentYear.toString(),
            isActive: this.isCampaignActive(`${currentYear}-11-15`, `${currentYear + 1}-04-30`)
          };
        }

        const campaign = campaigns[0];

        // Formater les dates au format YYYY-MM-DD
        const formattedStartDate = isDateObject(campaign.startDate)
          ? campaign.startDate.toISOString().split('T')[0]
          : typeof campaign.startDate === 'string'
            ? campaign.startDate
            : new Date(campaign.startDate as any).toISOString().split('T')[0];

        const formattedEndDate = isDateObject(campaign.endDate)
          ? campaign.endDate.toISOString().split('T')[0]
          : typeof campaign.endDate === 'string'
            ? campaign.endDate
            : new Date(campaign.endDate as any).toISOString().split('T')[0];

        return {
          startDate: formattedStartDate,
          endDate: formattedEndDate,
          year: campaign.year,
          isActive: campaign.isActive
        };
      } catch (error) {
        console.error("Erreur lors de la récupération des paramètres de campagne:", error);
        return undefined;
      }
    }

    async saveHuntingCampaignSettings(settings: {
      startDate: string;
      endDate: string;
      year: string;
      isActive?: boolean;
    }): Promise<{
      startDate: string;
      endDate: string;
      year: string;
      isActive?: boolean;
    }> {
      try {
        console.log("Sauvegarde des paramètres de campagne:", settings);

        // Mettre à jour l'état actif de la campagne si non fourni
        if (settings.isActive === undefined) {
          settings.isActive = this.isCampaignActive(settings.startDate, settings.endDate);
        }

        // Convertir les dates au format YYYY-MM-DD attendu par PostgreSQL pour les colonnes de type date
        // On utilise des strings au lieu d'objets Date pour éviter les erreurs de sérialisation
        const startDateFormatted = new Date(settings.startDate).toISOString().split('T')[0];
        const endDateFormatted = new Date(settings.endDate).toISOString().split('T')[0];

        console.log("Conversion des dates:", {
          startDate: settings.startDate,
          startDateFormatted,
          endDate: settings.endDate,
          endDateFormatted
        });

        // Créer une nouvelle configuration de campagne
        const result = await db.insert(huntingCampaigns).values({
          startDate: startDateFormatted,
          endDate: endDateFormatted,
          year: settings.year,
          isActive: settings.isActive
        }).returning();

        const campaign = result[0];

        // Formater les dates pour les renvoyer au format YYYY-MM-DD
        const formattedStartDate = isDateObject(campaign.startDate)
          ? campaign.startDate.toISOString().split('T')[0]
          : typeof campaign.startDate === 'string'
            ? campaign.startDate
            : new Date(campaign.startDate as any).toISOString().split('T')[0];

        const formattedEndDate = isDateObject(campaign.endDate)
          ? campaign.endDate.toISOString().split('T')[0]
          : typeof campaign.endDate === 'string'
            ? campaign.endDate
            : new Date(campaign.endDate as any).toISOString().split('T')[0];

        return {
          startDate: formattedStartDate,
          endDate: formattedEndDate,
          year: campaign.year,
          isActive: campaign.isActive
        };
      } catch (error) {
        console.error("Erreur lors de la sauvegarde des paramètres de campagne:", error);
        throw new Error("Échec de la sauvegarde des paramètres de campagne");
      }
    }

    private isCampaignActive(startDateStr: string, endDateStr: string): boolean {
      const today = new Date();
      const startDate = new Date(startDateStr);
      const endDate = new Date(endDateStr);

      return today >= startDate && today <= endDate;
    }

    // Stats operations
    async getStats(): Promise<{
      hunterCount: number;
      activePermitCount: number;
      expiredPermitCount: number;
      taxCount: number;
      revenue: number;
    }> {
      const today = new Date().toISOString().split('T')[0]; // Format as YYYY-MM-DD

      // Get hunter count
      const hunterResult = await db.select({ count: count() }).from(hunters);
      const hunterCount = Number(hunterResult[0]?.count || 0);

      // Get active permit count
      const activePermitResult = await db.select({ count: count() })
        .from(permits)
        .where(
          and(
            eq(permits.status, 'active'),
            gte(permits.expiryDate, today)
          )
        );
      const activePermitCount = Number(activePermitResult[0]?.count || 0);

      // Get expired permit count
      const expiredPermitResult = await db.select({ count: count() })
        .from(permits)
        .where(
          and(
            eq(permits.status, 'expired')
          )
        );
      const statusExpiredCount = Number(expiredPermitResult[0]?.count || 0);

      const dateExpiredResult = await db.select({ count: count() })
        .from(permits)
        .where(
          and(
            lt(permits.expiryDate, today)
          )
        );
      const dateExpiredCount = Number(dateExpiredResult[0]?.count || 0);

      const expiredPermitCount = statusExpiredCount + dateExpiredCount;

      // Get tax count
      const taxResult = await db.select({ count: count() }).from(taxes);
      const taxCount = Number(taxResult[0]?.count || 0);

      // Calculate revenue
      const permitRevenueResult = await db.select({
        sum: sql<number>`sum(${permits.price})`
      }).from(permits);
      const permitRevenue = Number(permitRevenueResult[0]?.sum || 0);

      const taxRevenueResult = await db.select({
        sum: sql<number>`sum(${taxes.amount})`
      }).from(taxes);
      const taxRevenue = Number(taxRevenueResult[0]?.sum || 0);

      const revenue = permitRevenue + taxRevenue;

      return {
        hunterCount,
        activePermitCount,
        expiredPermitCount,
        taxCount,
        revenue,
      };
    }

    async getPermitsByMonth(): Promise<{
      month: string;
      count: number;
    }[]> {
      // Récupérer les permis pour les 12 derniers mois
      const today = new Date();
      const oneYearAgo = new Date(today);
      oneYearAgo.setFullYear(today.getFullYear() - 1);

      try {
        const results = await db.select({
          month: sql<string>`to_char(date_trunc('month', ${permits.createdAt}), 'YYYY-MM-DD')`,
          count: count(),
        })
        .from(permits)
        .groupBy(sql`to_char(date_trunc('month', ${permits.createdAt}), 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(date_trunc('month', ${permits.createdAt}), 'YYYY-MM-DD')`);

        // Retourner les données au format simple que le front-end va formater
        return results.map(item => ({
          month: item.month,
          count: Number(item.count),
        }));
      } catch (error) {
        console.error("Erreur dans getPermitsByMonth:", error);
        return [];
      }
    }

    async getRevenueByType(): Promise<{
      name: string;
      value: number;
    }[]> {
      // Récupérer les revenus par type de permis
      const permitRevenue = await db.select({
        type: permits.type,
        revenue: sql<number>`sum(${permits.price})`
      })
      .from(permits)
      .groupBy(permits.type);

      // Récupérer le revenu total des taxes
      const taxRevenue = await db.select({
        revenue: sql<number>`sum(${taxes.amount})`
      })
      .from(taxes);

      const taxTotal = Number(taxRevenue[0]?.revenue || 0);

      // Formatter les données pour le graphique
      const formattedPermitRevenue = permitRevenue.map(item => ({
        name: item.type || "Inconnu",
        value: Number(item.revenue || 0)
      }));

      // Ajouter les taxes comme catégorie séparée
      if (taxTotal > 0) {
        formattedPermitRevenue.push({
          name: "Taxes d'abattage",
          value: taxTotal
        });
      }

      return formattedPermitRevenue;
    }

    async getTaxDistribution(): Promise<{
      name: string;
      count: number;
      amount: number;
    }[]> {
      // Calculer la répartition des taxes d'abattage (interne/externe)
      const internalTaxes = await db.select({
        count: count(),
        amount: sql<number>`sum(${taxes.amount})`
      })
      .from(taxes)
      .where(
        and(
          sql`${taxes.permitId} IS NOT NULL`,
          sql`${taxes.externalHunterName} IS NULL`
        )
      );

      const externalTaxes = await db.select({
        count: count(),
        amount: sql<number>`sum(${taxes.amount})`
      })
      .from(taxes)
      .where(sql`${taxes.externalHunterName} IS NOT NULL`);

      const result = [
        {
          name: "Taxes internes (chasseurs avec permis)",
          count: Number(internalTaxes[0]?.count || 0),
          amount: Number(internalTaxes[0]?.amount || 0)
        },
        {
          name: "Taxes externes (chasseurs sans permis)",
          count: Number(externalTaxes[0]?.count || 0),
          amount: Number(externalTaxes[0]?.amount || 0)
        }
      ];

      return result;
    }

    // Hunting Guide operations
    async getHuntingGuide(id: number): Promise<HuntingGuide | undefined> {
      const result = await db.select().from(huntingGuides).where(eq(huntingGuides.id, id));
      return result[0];
    }

    async getHuntingGuideByIdNumber(idNumber: string): Promise<HuntingGuide | undefined> {
      const result = await db.select().from(huntingGuides).where(eq(huntingGuides.idNumber, idNumber));
      return result[0];
    }

    async getAllHuntingGuides(): Promise<HuntingGuide[]> {
      return await db.select().from(huntingGuides);
    }

    async getHuntingGuidesByRegion(region: string): Promise<HuntingGuide[]> {
      return await db.select().from(huntingGuides).where(eq(huntingGuides.region, region));
    }

    async getHuntingGuidesByZone(zone: string): Promise<HuntingGuide[]> {
      // Backward-compat API: method name kept, but filter against 'departement'
      return await db.select().from(huntingGuides).where(eq(huntingGuides.departement, zone));
    }

    async createHuntingGuide(guide: InsertHuntingGuide): Promise<HuntingGuide> {
      const result = await db.insert(huntingGuides).values(guide).returning();
      return result[0];
    }

    async updateHuntingGuide(id: number, guide: Partial<InsertHuntingGuide>): Promise<HuntingGuide | undefined> {
      const result = await db.update(huntingGuides)
        .set(guide)
        .where(eq(huntingGuides.id, id))
        .returning();
      return result[0];
    }

    async deleteHuntingGuide(id: number): Promise<boolean> {
      try {
        const result = await db.delete(huntingGuides)
          .where(eq(huntingGuides.id, id))
          .returning();
        return result.length > 0;
      } catch (error) {
        console.error("Erreur lors de la suppression du guide de chasse:", error);
        return false;
      }
    }

    async deleteAllHuntingGuides(): Promise<number> {
      try {
        // Récupérer les IDs utilisateur des guides de chasse
        const guides = await this.getAllHuntingGuides();
        const userIds = guides.filter(g => g.userId).map(g => g.userId) as number[];

        console.log(`Tentative de suppression de tous les guides de chasse. ${guides.length} guides trouvés.`);
        console.log(`${userIds.length} comptes utilisateurs associés à supprimer.`);

        // Supprimer les comptes utilisateur associés s'ils existent
        let deletedUsersCount = 0;
        if (userIds.length > 0) {
          for (const userId of userIds) {
            const result = await this.deleteUser(userId);
            if (result) {
              deletedUsersCount++;
            }
          }
          console.log(`${deletedUsersCount} comptes utilisateur de guides supprimés.`);
        }

        // Supprimer tous les guides de chasse
        const result = await db.delete(huntingGuides).returning();
        console.log(`${result.length} guides de chasse supprimés.`);

        return result.length;
      } catch (error) {
        console.error("Erreur lors de la suppression de tous les guides de chasse:", error);
        return 0;
      }
    }

    // Méthodes pour les associations guide-chasseur
    async getGuideHunterAssociations(guideId: number): Promise<GuideHunterAssociation[]> {
      return await db.select().from(guideHunterAssociations)
        .where(eq(guideHunterAssociations.guideId, guideId));
    }

    // Méthodes pour l'ID sequencing (numérotation sans sauts)
    async getNextAvailableId(table: string): Promise<number> {
      try {
        // Obtenir le plus grand ID actuel
        const result = await db.execute(sql`SELECT MAX(id) as max_id FROM ${sql.identifier(table)}`);

        const rows = result as unknown as { rows: Array<{ max_id: number | null }> };
        const maxId = rows.rows && rows.rows.length > 0 ? (rows.rows[0].max_id || 0) : 0;

        // Le prochain ID disponible est le premier ID non utilisé à partir de 1
        // Si aucun enregistrement n'existe, commencer à 1
        if (maxId === 0) {
          return 1;
        }

        // Vérifier s'il y a des "trous" dans la séquence d'IDs avec une approche récursive
        // qui est plus robuste et peut gérer de grandes plages d'IDs
        const missingIdQuery = sql`
          WITH RECURSIVE seq(id) AS (
            SELECT 1
            UNION ALL
            SELECT id + 1 FROM seq WHERE id < ${maxId}
          )
          SELECT MIN(seq.id) as next_id
          FROM seq
          LEFT JOIN ${sql.identifier(table)} t ON seq.id = t.id
          WHERE t.id IS NULL
          LIMIT 1;
        `;

        const missingIdResult = await db.execute(missingIdQuery);
        const missingIdRows = missingIdResult as unknown as { rows: Array<{ next_id: number | null }> };
        const nextId = missingIdRows.rows && missingIdRows.rows.length > 0 ? missingIdRows.rows[0].next_id : null;

        // Si un ID manquant est trouvé, l'utiliser, sinon maxId + 1
        return nextId ? Number(nextId) : maxId + 1;
      } catch (error) {
        console.error(`Erreur lors de la récupération du prochain ID pour ${table}:`, error);
        // En cas d'erreur, par défaut, retourner 1
        return 1;
      }
    }

    async resequenceIds(table: string): Promise<void> {
      try {
        // Créer une table temporaire avec des IDs réordonnés
        await db.execute(sql`
          CREATE TEMPORARY TABLE tmp_resequence AS
          SELECT id as old_id, ROW_NUMBER() OVER (ORDER BY id) as new_id
          FROM ${sql.identifier(table)}
        `);

        // Mettre à jour la table principale avec les nouveaux IDs
        await db.execute(sql`
          UPDATE ${sql.identifier(table)} t
          SET id = tmp.new_id
          FROM tmp_resequence tmp
          WHERE t.id = tmp.old_id
        `);

        // Modifier la séquence d'auto-incrémentation
        await db.execute(sql`
          SELECT setval(pg_get_serial_sequence('${sql.raw(table)}', 'id'),
                        (SELECT MAX(id) FROM ${sql.identifier(table)}), true)
        `);

        // Supprimer la table temporaire
        await db.execute(sql`DROP TABLE tmp_resequence`);

        console.log(`Table ${table} réorganisée avec succès.`);
      } catch (error) {
        console.error(`Erreur lors de la réorganisation des IDs pour ${table}:`, error);
        throw error;
      }
    }

    // Méthodes pour les messages
    async getMessage(id: number): Promise<Message | undefined> {
      const result = await db.select().from(messages).where(eq(messages.id, id));
      return result[0];
    }

    async getMessageWithSender(id: number): Promise<MessageWithSender | undefined> {
      const result = await db.select().from(messages).where(eq(messages.id, id));
      if (!result[0]) return undefined;

      const message = result[0];
      const senderResult = await db.select().from(users).where(eq(users.id, message.senderId));
      if (!senderResult[0]) return undefined;

      const sender = senderResult[0];
      return {
        ...message,
        sender: {
          id: sender.id,
          username: sender.username,
          firstName: sender.firstName || undefined,
          lastName: sender.lastName || undefined,
          role: sender.role
        }
      };
    }

    async getMessagesBySender(senderId: number): Promise<Message[]> {
      return await db.select().from(messages)
        .where(
          and(
            eq(messages.senderId, senderId),
            eq(messages.isDeletedBySender, false)
          )
        )
        .orderBy(desc(messages.createdAt));
    }

    async getMessagesByRecipient(recipientId: number): Promise<Message[]> {
      return await db.select().from(messages)
        .where(
          and(
            eq(messages.recipientId, recipientId),
            eq(messages.isDeleted, false)
          )
        )
        .orderBy(desc(messages.createdAt));
    }

    async getMessageThreads(userId: number): Promise<MessageWithSender[]> {
      // Récupérer tous les messages (envoyés ou reçus) par l'utilisateur qui sont des "parents" (pas de parentMessageId)
      // ou qui sont les premiers messages d'une conversation
      const sentMessages = await db.select().from(messages)
        .where(
          and(
            eq(messages.senderId, userId),
            eq(messages.isDeletedBySender, false),
            sql`${messages.parentMessageId} IS NULL`
          )
        );

      const receivedMessages = await db.select().from(messages)
        .where(
          and(
            eq(messages.recipientId, userId),
            eq(messages.isDeleted, false),
            sql`${messages.parentMessageId} IS NULL`
          )
        );

      const allMessages = [...sentMessages, ...receivedMessages];

      // Récupérer les informations sur les expéditeurs
      const messageWithSenders: MessageWithSender[] = await Promise.all(
        allMessages.map(async (message) => {
          const senderResult = await db.select().from(users).where(eq(users.id, message.senderId));
          const sender = senderResult[0];

          return {
            ...message,
            sender: {
              id: sender.id,
              username: sender.username,
              firstName: sender.firstName || undefined,
              lastName: sender.lastName || undefined,
              role: sender.role
            }
          };
        })
      );

      // Trier par date de création (plus récent en premier)
      return messageWithSenders.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    async getMessageThread(parentMessageId: number): Promise<MessageWithSender[]> {
      // Récupérer le message parent
      const parentMessage = await this.getMessageWithSender(parentMessageId);
      if (!parentMessage) return [];

      // Récupérer tous les messages de la conversation
      const threadMessages = await db.select().from(messages)
        .where(
          or(
            eq(messages.id, parentMessageId),
            eq(messages.parentMessageId, parentMessageId)
          )
        )
        .orderBy(desc(messages.createdAt));

      // Récupérer les informations sur les expéditeurs
      const messageWithSenders: MessageWithSender[] = await Promise.all(
        threadMessages.map(async (message) => {
          const senderResult = await db.select().from(users).where(eq(users.id, message.senderId));
          const sender = senderResult[0];

          return {
            ...message,
            sender: {
              id: sender.id,
              username: sender.username,
              firstName: sender.firstName || undefined,
              lastName: sender.lastName || undefined,
              role: sender.role
            }
          };
        })
      );

      return messageWithSenders;
    }

    async addMessageRecipients(messageId: number, recipientIds: number[]): Promise<Message[]> {
      if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
        throw new Error('Aucun destinataire fourni');
      }

      // Récupérer le message original pour cloner les champs nécessaires
      const original = await db.select().from(messages).where(eq(messages.id, messageId));
      if (!original[0]) {
        throw new Error('Message original introuvable');
      }
      const base = original[0];
      const insertValues = recipientIds.map(rid => ({
        senderId: base.senderId,
        recipientId: rid,
        content: (base as any).content,
        type: (base as any).type,
        subject: (base as any).subject ?? null,
        parentMessageId: base.parentMessageId ?? base.id,
      }));
      const recipients = await db.insert(messages)
        .values(insertValues as InsertMessage[])
        .returning();
      return recipients;
    }

    async createMessage(data: InsertMessage): Promise<Message> {
      const valuesToInsert: Partial<InsertMessage> = {
        senderId: data.senderId,
        recipientId: data.recipientId,
        content: (data as any).content ?? (data as any).body,
        type: (data as any).type ?? (data as any).messageType,
        ...(data.subject && { subject: data.subject }),
        ...(data.parentMessageId && { parentMessageId: data.parentMessageId }),
      };
      const [newMessage] = await db.insert(messages).values(valuesToInsert as InsertMessage).returning();
      if (!newMessage) {
        throw new Error('La création du message a échoué, aucun enregistrement retourné.');
      }
      return newMessage;
    }

    async markMessageAsRead(id: number): Promise<Message | undefined> {
      const result = await db.update(messages)
        .set({ isRead: true })
        .where(eq(messages.id, id))
        .returning();
      return result[0];
    }

    async markMessageAsDeleted(id: number, bySender: boolean): Promise<Message | undefined> {
      const updateData = bySender
        ? { isDeletedBySender: true }
        : { isDeleted: true };

      const result = await db.update(messages)
        .set(updateData)
        .where(eq(messages.id, id))
        .returning();
      return result[0];
    }

    async deleteMessage(id: number): Promise<boolean> {
      // Vérifier si le message existe
      const message = await this.getMessage(id);
      if (!message) return false;

      // Supprimer le message de façon permanente si les deux parties l'ont supprimé
      // OU si un administrateur a demandé la suppression
      if (message.isDeleted && message.isDeletedBySender) {
        // Les deux parties ont supprimé le message, on peut le supprimer définitivement
        const result = await db.delete(messages)
          .where(eq(messages.id, id))
          .returning();

        return result.length > 0;
      }

      // Sinon, forcer la suppression complète (pour les administrateurs ou les cas spéciaux)
      const result = await db.delete(messages)
        .where(eq(messages.id, id))
        .returning();
      return result.length > 0;
    }

      // Méthodes pour les messages groupés
      async getGroupMessage(id: number): Promise<GroupMessage | undefined> {
      const rows = await db
        .select()
        .from(groupMessages)
        .where(eq(groupMessages.id, id))
        .limit(1);
      return rows[0] as GroupMessage | undefined;
    }

    async getGroupMessageWithSender(id: number): Promise<GroupMessageWithSender | undefined> {
      const rows = await db
        .select({
          msg: groupMessages,
          senderId: users.id,
          senderUsername: users.username,
          senderFirstName: users.firstName,
          senderLastName: users.lastName,
          senderRole: users.role,
        })
        .from(groupMessages)
        .leftJoin(users, eq(groupMessages.senderId, users.id))
        .where(eq(groupMessages.id, id))
        .limit(1);
      const r = rows[0];
      if (!r) return undefined;
      return {
        id: r.msg.id,
        senderId: r.msg.senderId,
        targetRole: r.msg.targetRole,
        targetRegion: r.msg.targetRegion,
        subject: r.msg.subject,
        content: r.msg.content,
        type: r.msg.type as any,
        createdAt: r.msg.createdAt,
        sender: {
          id: r.senderId!,
          username: r.senderUsername!,
          firstName: r.senderFirstName || undefined,
          lastName: r.senderLastName || undefined,
          role: r.senderRole as any,
        },
      } as GroupMessageWithSender;
    }

    async getGroupMessagesByRole(role: string, region?: string): Promise<GroupMessageWithSender[]> {
      const rows = await db
        .select({
          msg: groupMessages,
          senderId: users.id,
          senderUsername: users.username,
          senderFirstName: users.firstName,
          senderLastName: users.lastName,
          senderRole: users.role,
        })
        .from(groupMessages)
        .leftJoin(users, eq(groupMessages.senderId, users.id))
        .where(
          region
            ? and(eq(groupMessages.targetRole, role), eq(groupMessages.targetRegion, region))
            : eq(groupMessages.targetRole, role)
        )
        .orderBy(desc(groupMessages.createdAt));
      return rows.map(r => ({
        id: r.msg.id,
        senderId: r.msg.senderId,
        targetRole: r.msg.targetRole,
        targetRegion: r.msg.targetRegion,
        subject: r.msg.subject,
        content: r.msg.content,
        type: r.msg.type as any,
        createdAt: r.msg.createdAt,
        sender: {
          id: r.senderId!,
          username: r.senderUsername!,
          firstName: r.senderFirstName || undefined,
          lastName: r.senderLastName || undefined,
          role: r.senderRole as any,
        },
      }));
    }

    async getGroupMessagesByUser(userId: number): Promise<GroupMessageWithSender[]> {
      // Récupérer l'utilisateur
      const user = await this.getUser(userId);
      if (!user) return [];

      const rows = await db
        .select({
          msg: groupMessages,
          senderId: users.id,
          senderUsername: users.username,
          senderFirstName: users.firstName,
          senderLastName: users.lastName,
          senderRole: users.role,
          readId: groupMessageReads.id,
          readIsRead: groupMessageReads.isRead,
          readIsDeleted: groupMessageReads.isDeleted,
          readAt: groupMessageReads.readAt,
        })
        .from(groupMessages)
        .leftJoin(users, eq(groupMessages.senderId, users.id))
        .leftJoin(
          groupMessageReads,
          and(eq(groupMessageReads.messageId, groupMessages.id), eq(groupMessageReads.userId, userId))
        )
        .where(
          and(
            eq(groupMessages.targetRole, user.role as any),
            or(sql`${groupMessages.targetRegion} IS NULL`, eq(groupMessages.targetRegion, user.region as any))
          )
        )
        .orderBy(desc(groupMessages.createdAt));

      return rows.map(r => ({
        id: r.msg.id,
        senderId: r.msg.senderId,
        sender: {
          id: r.senderId!,
          username: r.senderUsername!,
          firstName: r.senderFirstName || undefined,
          lastName: r.senderLastName || undefined,
          role: r.senderRole as any,
        },
        subject: r.msg.subject,
        content: r.msg.content,
        type: r.msg.type as any,
        targetRole: r.msg.targetRole,
        targetRegion: r.msg.targetRegion,
        createdAt: r.msg.createdAt,
        isRead: !!r.readId ? !!r.readIsRead : false,
      }));
    }

    async createGroupMessage(message: any): Promise<any> {
      const values = {
        senderId: message.senderId,
        subject: message.subject ?? null,
        content: message.content,
        type: message.type,
        targetRole: message.targetRole,
        targetRegion: message.targetRegion ?? null,
      } as any;
      const result = await db.insert(groupMessages).values(values).returning();
      return result[0];
    }

    async markGroupMessageAsRead(messageId: number, userId: number): Promise<GroupMessageRead> {
      // Upsert (update if exists, else create)
      const existing = await db
        .select()
        .from(groupMessageReads)
        .where(and(eq(groupMessageReads.messageId, messageId), eq(groupMessageReads.userId, userId)))
        .limit(1);
      let read;
      if (existing.length > 0) {
        const updated = await db
          .update(groupMessageReads)
          .set({ isRead: true })
          .where(eq(groupMessageReads.id, existing[0].id))
          .returning();
        read = updated[0];
      } else {
        const created = await db
          .insert(groupMessageReads)
          .values({ messageId, userId, isRead: true, isDeleted: false })
          .returning();
        read = created[0];
      }
      return read as GroupMessageRead;
    }

    async markGroupMessageAsDeleted(messageId: number, userId: number): Promise<GroupMessageRead> {
      // Upsert (update if exists, else create)
      const existing = await db
        .select()
        .from(groupMessageReads)
        .where(and(eq(groupMessageReads.messageId, messageId), eq(groupMessageReads.userId, userId)))
        .limit(1);
      let read;
      if (existing.length > 0) {
        const updated = await db
          .update(groupMessageReads)
          .set({ isDeleted: true, isRead: true })
          .where(eq(groupMessageReads.id, existing[0].id))
          .returning();
        read = updated[0];
      } else {
        const created = await db
          .insert(groupMessageReads)
          .values({ messageId, userId, isRead: true, isDeleted: true })
          .returning();
        read = created[0];
      }
      return read as GroupMessageRead;
    }


    async getGuideHunterAssociationsWithHunters(guideId: number): Promise<(GuideHunterAssociation & { hunter: Hunter })[]> {
      const results = await db.select({
        association: guideHunterAssociations,
        hunter: hunters
      })
      .from(guideHunterAssociations)
      .innerJoin(hunters, eq(guideHunterAssociations.hunterId, hunters.id))
      .where(eq(guideHunterAssociations.guideId, guideId));

      return results.map(result => ({
        ...result.association,
        hunter: result.hunter
      }));
    }

    async getGuidesByHunter(hunterId: number): Promise<HuntingGuide[]> {
      const results = await db.select({
        guide: huntingGuides
      })
      .from(guideHunterAssociations)
      .innerJoin(
        huntingGuides,
        eq(guideHunterAssociations.guideId, huntingGuides.id)
      )
      .where(eq(guideHunterAssociations.hunterId, hunterId));

      return results.map(result => result.guide);
    }

    async associateHunterToGuide(guideId: number, hunterId: number): Promise<GuideHunterAssociation> {
      // Vérifier d'abord si l'association existe déjà
      const existingAssociation = await db.select()
        .from(guideHunterAssociations)
        .where(
          and(
            eq(guideHunterAssociations.guideId, guideId),
            eq(guideHunterAssociations.hunterId, hunterId)
          )
        );

      if (existingAssociation.length > 0) {
        return existingAssociation[0]; // L'association existe déjà
      }

      // Créer une nouvelle association
      const result = await db.insert(guideHunterAssociations)
        .values({
          guideId,
          hunterId
        })
        .returning();

      return result[0];
    }

    async removeHunterAssociation(guideId: number, hunterId: number): Promise<boolean> {
      const result = await db.delete(guideHunterAssociations)
        .where(
          and(
            eq(guideHunterAssociations.guideId, guideId),
            eq(guideHunterAssociations.hunterId, hunterId)
          )
        )
        .returning();

      return result.length > 0;
    }
  }

  // Use the database storage implementation
  export const storage = new DatabaseStorage();
