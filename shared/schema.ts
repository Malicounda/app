import { sql } from "drizzle-orm";
import { bigint, boolean, customType, date, doublePrecision, foreignKey, index, integer, json, jsonb, numeric, pgEnum, pgTable, point, primaryKey, serial, text, timestamp, uniqueIndex, varchar, unique, bigserial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Type personnalisé pour BYTEA
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

// Type personnalisé pour les géométries PostGIS
const unknown = customType({ dataType() { return 'text'; } });

const geometry = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry';
  },
});


// Enum pour les rôles utilisateur
export const userRoleEnum = pgEnum('user_role', ['admin', 'hunter', 'agent', 'sub-agent', 'hunting-guide', 'brigade', 'triage', 'poste-control', 'sous-secteur']);


// User schema (utilisé pour l'authentification)
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  publicId: text("public_id").unique(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text("phone"),
  matricule: text("matricule").unique(), // Ajout de .unique()
  serviceLocation: text("service_location"), // Inspection Régionale des Eaux et Forêts, Direction des Eaux et Forêts
  // assignmentPost supprimé selon la demande
  region: text("region"),
  departement: text("departement"),
  commune: text("commune"),
  arrondissement: text("arrondissement"),
  sousService: text("sous_service"),
  createdByUserId: integer("created_by_user_id"),
  agentLat: numeric("agent_lat"),
  agentLon: numeric("agent_lon"),
  role: userRoleEnum("role").notNull().default('hunter'),
  hunterId: integer("hunter_id"),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  active: boolean("active").notNull().default(true),
  isSuspended: boolean("is_suspended").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Ajout des colonnes de suivi
  lastLogin: timestamp("last_login"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  isActive: true,
  isSuspended: true,
  createdAt: true,
  lastLogin: true,
  updatedAt: true,
});

 export const domaines = pgTable("domaines", {
   id: serial("id").primaryKey(),
   nomDomaine: text("nom_domaine").notNull(),
   codeSlug: text("code_slug").notNull(),
   description: text("description"),
   couleurTheme: text("couleur_theme"),
   isActive: boolean("is_active").notNull().default(true),
   createdAt: timestamp("created_at").defaultNow().notNull(),
 });

export const userDomains = pgTable("user_domains", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  domain: text("domain").notNull(),
  domaineId: integer("domaine_id").references(() => domaines.id),
  zoneGeographique: text("zone_geographique"),
  roleMetierId: integer("role_metier_id").references(() => rolesMetier.id),
  role: text("role"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const superAdmins = pgTable("super_admins", {
  userId: integer("user_id").primaryKey().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const themeSysteme = pgTable("theme_systeme", {
  id: serial("id").primaryKey(),
  nom: text("nom").notNull().unique(),
  isActive: boolean("is_active").notNull().default(false),
  config: json("config").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertThemeSystemeSchema = createInsertSchema(themeSysteme).omit({
  id: true,
  updatedAt: true,
});

export type ThemeSysteme = typeof themeSysteme.$inferSelect;
export type NewThemeSysteme = typeof themeSysteme.$inferInsert;

export const agents = pgTable("agents", {
  idAgent: serial("id_agent").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => users.id),
  matriculeSol: text("matricule_sol").notNull().unique(),
  nom: text("nom"),
  prenom: text("prenom"),
  grade: text("grade"),
  genre: text("genre"),
  roleMetierId: integer("role_metier_id").references(() => rolesMetier.id),
  contact: json("contact"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const rolesMetier = pgTable("roles_metier", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  labelFr: text("label_fr").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  isSupervisor: boolean("is_supervisor").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Enum pour le niveau hiérarchique des affectations
export const niveauHierarchiqueEnum = pgEnum('niveau_hierarchique', ['NATIONAL', 'REGIONAL', 'SECTEUR']);

// Table AFFECTATIONS : Le Moteur de Droits
// Ventile l'agent dans ses différentes missions tout en verrouillant son rang hiérarchique
export const affectations = pgTable("affectations", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agents.idAgent),
  domaineId: integer("domaine_id").notNull().references(() => domaines.id),
  niveauHierarchique: niveauHierarchiqueEnum("niveau_hierarchique").notNull(),
  roleMetierId: integer("role_metier_id").references(() => rolesMetier.id),
  codeZone: text("code_zone").notNull(),
  active: boolean("active").notNull().default(true),
  dateAffectation: timestamp("date_affectation").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAffectationSchema = createInsertSchema(affectations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Affectation = typeof affectations.$inferSelect;
export type NewAffectation = typeof affectations.$inferInsert;

export const insertRoleMetierSchema = createInsertSchema(rolesMetier).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type RoleMetier = typeof rolesMetier.$inferSelect;
export type NewRoleMetier = typeof rolesMetier.$inferInsert;

/** Référentiel des grades agents (liste déroulante formulaires agent) */
export const agentGrades = pgTable("agent_grades", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  label: text("label").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAgentGradeSchema = createInsertSchema(agentGrades).omit({
  id: true,
  createdAt: true,
});

export type AgentGrade = typeof agentGrades.$inferSelect;
export type NewAgentGrade = typeof agentGrades.$inferInsert;

export const insertUserDomainSchema = createInsertSchema(userDomains).omit({
  id: true,
  createdAt: true,
});

// Enum pour les types d'armes
export const weaponTypeEnum = pgEnum('weapon_type', ['fusil', 'carabine', 'arbalete', 'arc', 'lance-pierre', 'autre']);

// Enum pour les statuts des demandes de permis
// Nous utilisons l'enum existant défini plus bas dans le fichier

// Table pour les guides de chasse
export const huntingGuides = pgTable("hunting_guides", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone"),
  departement: text("departement"),
  region: text("region"),
  idNumber: text("id_number"),
  photo: text("photo"), // Données de la photo (base64 ou chemin)
  zoneId: integer("zone_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  userId: integer("user_id").references(() => users.id),
});

export const insertHuntingGuideSchema = createInsertSchema(huntingGuides).omit({
  id: true,
  createdAt: true,
});

export const selectHuntingGuideSchema = createInsertSchema(huntingGuides).omit({
  createdAt: true,
});

export type HuntingGuide = typeof huntingGuides.$inferSelect;
export type NewHuntingGuide = typeof huntingGuides.$inferInsert;

// Table pour les tuteurs des chasseurs mineurs
export const guardians = pgTable("guardians", {
  id: serial("id").primaryKey(),
  lastName: text("last_name").notNull(),
  firstName: text("first_name").notNull(),
  idNumber: text("id_number").notNull().unique(), // Numéro de pièce d'identité du tuteur
  relationship: text("relationship").notNull(), // Relation avec le mineur (parent, tuteur légal, etc.)
  phone: text("phone"),
  address: text("address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGuardianSchema = createInsertSchema(guardians).omit({
  id: true,
  createdAt: true,
});

// Hunter schema
export const hunters = pgTable("hunters", {
  id: serial("id").primaryKey(),
  lastName: text("last_name").notNull(),
  firstName: text("first_name").notNull(),
  dateOfBirth: date("date_of_birth").notNull(),
  idNumber: text("id_number").notNull().unique(),
  phone: text("phone"),
  address: text("address").notNull(),
  experience: integer("experience").notNull(),
  profession: text("profession").notNull(),
  category: text("category").notNull(), // 'resident', 'coutumier', 'touriste'
  pays: text("pays"), // Pays d'émission de la pièce d'identité
  nationality: text("nationality"), // Nationalité déduite du pays d'émission de la pièce d'identité
  region: text("region"), // Région de résidence du chasseur
  departement: text("departement"), // Département/secteur du chasseur (anciennement zone)
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  createdByRoleSnapshot: text("created_by_role_snapshot"),
  createdByRegionSnapshot: text("created_by_region_snapshot"),
  createdByDepartementSnapshot: text("created_by_departement_snapshot"),
  // Informations sur les armes
  weaponType: weaponTypeEnum("weapon_type"),
  weaponBrand: text("weapon_brand"),
  weaponReference: text("weapon_reference"),
  weaponCaliber: text("weapon_caliber"),
  weaponOtherDetails: text("weapon_other_details"),
  isMinor: boolean("is_minor").notNull().default(false), // Indique si le chasseur est mineur
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertHunterSchema = createInsertSchema(hunters).omit({
  id: true,
  isActive: true, // Laissé tel quel, géré par la logique applicative ou DB default
  createdAt: true,
  isMinor: true, // On exclut is_minor pour le définir par défaut à false
  createdByUserId: true,
  createdByRoleSnapshot: true,
  createdByRegionSnapshot: true,
  createdByDepartementSnapshot: true,
}).extend({
  dateOfBirth: z.string().or(z.date().transform(d => d.toISOString().split('T')[0]))
    .refine(val => {
      const birthDate = new Date(val);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      const dayDiff = today.getDate() - birthDate.getDate();

      // Calcul précis de l'âge
      const exactAge = age - (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? 1 : 0);

      return exactAge >= 7;
    }, { message: "L'âge minimum pour la chasse est de 7 ans" }),
  phone: z.string().optional()
});

// Permit schema
export const permits = pgTable("permits", {
  id: serial("id").primaryKey(),
  permitNumber: text("permit_number").notNull().unique(),
  hunterId: integer("hunter_id").notNull(),
  issueDate: date("issue_date").notNull(),
  expiryDate: date("expiry_date").notNull(),
  // Durée de validité en jours (optionnelle) pour calculs métier
  validityDays: integer("validity_days"),
  status: text("status").notNull().default('active'),
  price: numeric("price").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  type: text("type"),
  categoryId: text("category_id"), // ID de la catégorie pour distinguer Coutumier, etc.
  receiptNumber: text("receipt_number"),
  area: text("area"),
  weapons: text("weapons"),
  // Utilisateur qui a délivré/créé le permis
  createdBy: integer("created_by"),
  // Workflow de demande (colonnes supprimées si non présentes en base):
  // processedBy: integer("processed_by"),
  // processedAt: timestamp("processed_at"),
  // Champ pour stocker les documents et métadonnées au format JSON
  metadata: json("metadata").default({}),
});

// Table pour les demandes de permis supprimée (duplication avec ligne 206)

// Schéma de base pour la création d'un permis
export const insertPermitSchema = z.object({
  permitNumber: z.string(),
  hunterId: z.number(),
  issueDate: z.string().or(z.date()),
  // expiryDate est désormais optionnel: calculé côté backend
  expiryDate: z.string().or(z.date()).optional(),
  status: z.string(),
  price: z.number().or(z.string().transform(val => parseFloat(val))),
  type: z.string().optional(),
  categoryId: z.string().optional(),
  receiptNumber: z.string().optional(),
  area: z.string().optional(),
  weapons: z.string().optional(),
  // Ajouter metadata comme optionnel
  metadata: z.record(z.any()).optional(),
});

// Tax schema for hunting taxes (Phacochère/warthog)
export const taxes = pgTable("taxes", {
  id: serial("id").primaryKey(),
  taxNumber: text("tax_number").notNull().unique(),
  hunterId: integer("hunter_id").notNull(),
  permitId: integer("permit_id"),  // Peut être null pour les chasseurs externes
  amount: numeric("amount").notNull(),
  issueDate: date("issue_date").notNull(),
  animalType: text("animal_type").notNull(), // e.g., "phacochère"
  quantity: integer("quantity").notNull(),
  receiptNumber: text("receipt_number").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Utilisateur qui a enregistré/délivré la taxe
  createdBy: integer("created_by"),
  // Ajout pour les chasseurs externes (sans permis)
  externalHunterName: text("external_hunter_name"),
  externalHunterRegion: text("external_hunter_region"),
  // Snapshots immuables pour conserver les références au moment de la création
  permitNumberSnapshot: text("permit_number_snapshot"),
  permitCategorySnapshot: text("permit_category_snapshot"),
  hunterNameSnapshot: text("hunter_name_snapshot"),
  issuerServiceSnapshot: text("issuer_service_snapshot"),
  permitDeletedAt: timestamp("permit_deleted_at"),
});

// Table pour les espèces d'animaux et leurs taxes
export const taxeEspeces = pgTable("taxe_especes", {
  id: serial("id").primaryKey(),
  speciesId: text("species_id").notNull().unique(),
  name: text("name").notNull(),
  price: integer("price").notNull(),
  code: text("code").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTaxeEspecesSchema = createInsertSchema(taxeEspeces).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateTaxeEspecesSchema = createInsertSchema(taxeEspeces).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  speciesId: true,
});

export const insertTaxSchema = createInsertSchema(taxes).omit({
  id: true,
  createdAt: true,
}).extend({
  amount: z.number().or(z.string().transform(val => parseFloat(val))),
  issueDate: z.string().or(z.date()),
  quantity: z.number().or(z.string().transform(val => parseInt(val))),
});

// Enum pour les statuts de demande de permis
export const permitRequestStatusEnum = pgEnum('permit_request_status', ['pending', 'approved', 'rejected']);

// Table pour les demandes de permis
export const permitRequests = pgTable("permit_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  hunterId: integer("hunter_id").notNull(),
  requestedType: text("requested_type").notNull(), // 'petite-chasse', 'grande-chasse', 'gibier-eau'
  requestedCategory: text("requested_category").notNull(), // 'resident', 'coutumier', 'touriste'
  region: text("region"),
  status: permitRequestStatusEnum("status").notNull().default('pending'),
  reason: text("reason"), // Raison de la demande
  notes: text("notes"), // Notes administratives (visible uniquement par les admins)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPermitRequestSchema = createInsertSchema(permitRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  notes: true,
});

// Table pour les déclarations d'animaux abattus
export const huntingReports = pgTable("hunting_reports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  hunterId: integer("hunter_id").notNull(),
  permitId: integer("permit_id").notNull(),
  reportDate: date("report_date").notNull(),
  location: text("location").notNull(),
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertHuntingReportSchema = createInsertSchema(huntingReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  reportDate: z.string().or(z.date()),
  longitude: z.number().or(z.string().transform(val => parseFloat(val))).optional(),
  latitude: z.number().or(z.string().transform(val => parseFloat(val))).optional()
});

// Table pour les détails des animaux abattus (liée aux rapports)
export const huntedSpecies = pgTable("hunted_species", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull(),
  speciesName: text("species_name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertHuntedSpeciesSchema = createInsertSchema(huntedSpecies).omit({
  id: true,
  createdAt: true,
}).extend({
  quantity: z.number().or(z.string().transform(val => parseInt(val)))
});

// Enum pour les zones géographiques
export const regionEnum = pgEnum('region', ['dakar', 'thies', 'saint-louis', 'louga', 'fatick', 'kaolack', 'kaffrine', 'matam', 'tambacounda', 'kedougou', 'kolda', 'sedhiou', 'ziguinchor', 'diourbel']);

// Mapping pour l'affichage des régions en majuscules
export const regionDisplayNames = {
  'dakar': 'DAKAR',
  'thies': 'THIÈS',
  'saint-louis': 'SAINT-LOUIS',
  'louga': 'LOUGA',
  'fatick': 'FATICK',
  'kaolack': 'KAOLACK',
  'kaffrine': 'KAFFRINE',
  'matam': 'MATAM',
  'tambacounda': 'TAMBACOUNDA',
  'kedougou': 'KÉDOUGOU',
  'kolda': 'KOLDA',
  'sedhiou': 'SÉDHIOU',
  'ziguinchor': 'ZIGUINCHOR',
  'diourbel': 'DIOURBEL'
};

// History for tracking operations
export const history = pgTable("history", {
  id: serial("id").primaryKey(),
  operation: text("operation").notNull(), // 'create', 'update', 'delete', 'renew', 'suspend'
  entityType: text("entity_type").notNull(), // 'hunter', 'permit', 'tax', 'user', 'report', 'request'
  entityId: integer("entity_id").notNull(),
  details: text("details").notNull(),
  userId: integer("user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertHistorySchema = createInsertSchema(history).omit({
  id: true,
  createdAt: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertGuardian = z.infer<typeof insertGuardianSchema>;
export type Guardian = typeof guardians.$inferSelect;

export type InsertHunter = z.infer<typeof insertHunterSchema>;
export type Hunter = typeof hunters.$inferSelect;
export type InsertUserDomain = z.infer<typeof insertUserDomainSchema>;
export type UserDomain = typeof userDomains.$inferSelect;

export type InsertPermit = z.infer<typeof insertPermitSchema>;
export type Permit = typeof permits.$inferSelect;

export type InsertTax = z.infer<typeof insertTaxSchema>;
export type Tax = typeof taxes.$inferSelect;

export type InsertTaxeEspeces = z.infer<typeof insertTaxeEspecesSchema>;
export type TaxeEspeces = typeof taxeEspeces.$inferSelect;
export type UpdateTaxeEspeces = z.infer<typeof updateTaxeEspecesSchema>;

export type InsertPermitRequest = z.infer<typeof insertPermitRequestSchema>;
export type PermitRequest = typeof permitRequests.$inferSelect;

export type InsertHuntingReport = z.infer<typeof insertHuntingReportSchema>;
export type HuntingReport = typeof huntingReports.$inferSelect;

export type InsertHuntedSpecies = z.infer<typeof insertHuntedSpeciesSchema>;
export type HuntedSpecies = typeof huntedSpecies.$inferSelect;

export type InsertHistory = z.infer<typeof insertHistorySchema>;
export type History = typeof history.$inferSelect;

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = typeof pushSubscriptions.$inferInsert;

// Guide-Hunter Associations schema
export const guideHunterAssociations = pgTable("guide_hunter_associations", {
  id: serial("id").primaryKey(),
  guideId: integer("guide_id").notNull(),
  hunterId: integer("hunter_id").notNull(),
  associatedAt: timestamp("associated_at").defaultNow().notNull(),
  dissociatedAt: timestamp("dissociated_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGuideHunterAssociationSchema = createInsertSchema(guideHunterAssociations).omit({
  id: true,
  associatedAt: true,
  dissociatedAt: true,
  isActive: true,
  createdAt: true,
});

export type InsertGuideHunterAssociation = z.infer<typeof insertGuideHunterAssociationSchema>;
export type GuideHunterAssociation = typeof guideHunterAssociations.$inferSelect;

// Enum pour les types de messages
export const messageTypeEnum = pgEnum('message_type', ['standard', 'urgent', 'information', 'notification']);

// Table pour les messages internes
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull(), // ID de l'utilisateur qui envoie le message
  recipientId: integer("recipient_id").notNull(), // ID de l'utilisateur destinataire
  subject: text("subject"), // Sujet du message (optionnel)
  content: text("content").notNull(), // Contenu du message
  type: messageTypeEnum("type").notNull().default('standard'),
  isRead: boolean("is_read").notNull().default(false), // Si le message a été lu
  readAt: timestamp("read_at"),
  deletedAt: timestamp("deleted_at"), // Soft delete destinataire
  deletedAtSender: timestamp("deleted_at_sender"), // Soft delete expéditeur
  parentMessageId: integer("parent_message_id"), // Pour les réponses/conversations
  domaineId: integer("domaine_id").references(() => domaines.id), // Référence à la table domaines
  // Colonnes pour les pièces jointes
  attachmentPath: text("attachment_path"), // Chemin relatif du fichier dans /uploads/
  attachmentName: text("attachment_name"), // Nom original du fichier
  attachmentMime: text("attachment_mime"), // Type MIME du fichier
  attachmentSize: integer("attachment_size"), // Taille en octets
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  isRead: true,
  readAt: true,
  deletedAt: true,
  deletedAtSender: true,
  createdAt: true,
});

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// Table pour les messages groupés/diffusion
export const groupMessages = pgTable("group_messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull(), // ID de l'utilisateur qui envoie le message
  targetRole: text("target_role"), // Rôle ciblé ('admin', 'agent', 'hunter', 'sub-agent', 'hunting-guide', etc.)
  targetRegion: text("target_region"), // Région ciblée (si applicable)
  subject: text("subject"), // Sujet du message (optionnel)
  content: text("content").notNull(), // Contenu du message
  type: messageTypeEnum("type").notNull().default('standard'),
  domaineId: integer("domaine_id").references(() => domaines.id), // Référence à la table domaines
  // Colonnes pour les pièces jointes
  attachmentPath: text("attachment_path"), // Chemin relatif du fichier dans /uploads/
  attachmentName: text("attachment_name"), // Nom original du fichier
  attachmentMime: text("attachment_mime"), // Type MIME du fichier
  attachmentSize: integer("attachment_size"), // Taille en octets
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertGroupMessageSchema = createInsertSchema(groupMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertGroupMessage = z.infer<typeof insertGroupMessageSchema>;
export type GroupMessage = typeof groupMessages.$inferSelect;

// Table de lecture pour les messages groupés
export const groupMessageReads = pgTable("group_message_reads", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull(), // ID du message de groupe
  userId: integer("user_id").notNull(), // ID de l'utilisateur qui a lu le message
  isRead: boolean("is_read").notNull().default(true),
  isDeleted: boolean("is_deleted").notNull().default(false),
  readAt: timestamp("read_at").defaultNow().notNull(),
});

export const insertGroupMessageReadSchema = createInsertSchema(groupMessageReads).omit({
  id: true,
  readAt: true,
});

export type InsertGroupMessageRead = z.infer<typeof insertGroupMessageReadSchema>;
export type GroupMessageRead = typeof groupMessageReads.$inferSelect;

// Alerts and Notifications (Messagerie/Alertes)
// Structure alignée sur le backend (voir server/controllers/alerts.controller.ts)
// et la migration server/migrations/0005_add_alerts_lat_lon_departement.sql
export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  title: text("title"),
  message: text("message"),
  nature: text("nature"), // 'feux_de_brousse' | 'braconnage' | 'trafic_bois' | 'autre'
  region: text("region"),
  // zone hérite de l'ancien schéma: stockage "lat,lon" en texte, conservé pour compatibilité
  zone: text("zone"),
  // Nouvelles colonnes GPS dédiées
  lat: doublePrecision("lat"),
  lon: doublePrecision("lon"),
  arrondissement: text("arrondissement"),
  commune: text("commune"),
  departement: text("departement"),
  senderId: integer("sender_id").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  alertId: integer("alert_id"),
  message: text("message"),
  // Types et statuts libres côté DB (le backend utilise 'ALERT' et 'NON_LU')
  type: text("type"),
  status: text("status"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Alert = typeof alerts.$inferSelect;
export type Notification = typeof notifications.$inferSelect;

// --- Reboisement: Pépinières et Zones reboisées ---

export const pepinieres = pgTable("pepinieres", {
  id: serial("id").primaryKey(),
  // nom de la pépinière
  nom: text("nom").notNull(),
  // type: REGIE / COMMUNAUTAIRE / PRIVEE / SCOLAIRE
  type: text("type").notNull(),
  // localisation géographique principale
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  // géométrie complète (point/polygone) au format JSON (GeoJSON, WKT sérialisé, etc.)
  geom: json("geom"),
  // surface en hectares
  surfaceHa: numeric("surface_ha", { precision: 12, scale: 2 }),
  // localisation administrative dérivée des coordonnées
  communeId: integer("commune_id"),
  region: text("region"),
  departement: text("departement"),
  arrondissement: text("arrondissement"),
  commune: text("commune"),
  // capacité de production (nombre de plants)
  capacityPlants: integer("capacity_plants"),
  // contacts
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  // pièces jointes (liens de fichiers, photos, etc.)
  pieceJointe: json("piece_jointe"),
  // auteur de la saisie (clé étrangère vers users.id si souhaité)
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const reforestationZones = pgTable("reforestation_zones", {
  id: serial("id").primaryKey(),
  // nom de la zone reboisée
  name: text("name").notNull(),
  // localisation géographique principale (centre)
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  // surface en hectares
  areaHa: numeric("area_ha", { precision: 12, scale: 2 }),
  // localisation administrative dérivée des coordonnées / géométrie
  communeId: integer("commune_id"),
  region: text("region"),
  departement: text("departement"),
  arrondissement: text("arrondissement"),
  // informations sur le reboisement
  plantingYear: integer("planting_year"),
  species: text("species"),
  program: text("program"),
  // auteur de la saisie
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Table pour les paramètres de l'application
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// Table pour les paramètres de la campagne cynégétique
export const huntingCampaigns = pgTable("hunting_campaigns", {
  id: serial("id").primaryKey(),
  startDate: date("start_date").notNull(),  // Date d'ouverture de la campagne
  endDate: date("end_date").notNull(),      // Date de fermeture de la campagne
  year: text("year").notNull(),             // Année de la campagne (ex: "2025-2026")
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),                     // Notes éventuelles sur la campagne
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertHuntingCampaignSchema = createInsertSchema(huntingCampaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertHuntingCampaign = z.infer<typeof insertHuntingCampaignSchema>;
export type HuntingCampaign = typeof huntingCampaigns.$inferSelect;

// Reboisement types
export type Pepiniere = typeof pepinieres.$inferSelect;
export type InsertPepiniere = typeof pepinieres.$inferInsert;
export type ReforestationZone = typeof reforestationZones.$inferSelect;
export type InsertReforestationZone = typeof reforestationZones.$inferInsert;

// Mise à jour des interfaces pour les API (utilisées par le frontend)
export interface MessageWithSender extends Message {
  sender: {
    id: number;
    username: string;
    firstName?: string;
    lastName?: string;
    role: string;
  };
}

export interface GroupMessageWithSender extends GroupMessage {
  sender: {
    id: number;
    username: string;
    firstName?: string;
    lastName?: string;
    role: string;
  };
  isRead?: boolean; // Pour le lecteur actuel
}

export interface PermitWithHunterInfo extends Permit {
  hunterFirstName?: string;
  hunterLastName?: string;
  hunterIdNumber?: string;
  // Informations sur les armes du chasseur
  weaponType?: string;
  weaponBrand?: string;
  weaponReference?: string;
  weaponCaliber?: string;
  weaponOtherDetails?: string;
}

// --- Tables Géographiques: Arrondissements et Communes ---

// Table pour les arrondissements
export const arrondissements = pgTable("arrondissements", {
  id: serial("id").primaryKey(),
  code: text("code").unique(),
  nom: text("nom").notNull(),
  // Colonnes de géométrie PostGIS
  geom: geometry("geom"), // Géométrie principale (polygone)
  centreGeometrique: geometry("centre_geometrique"), // Point central
  centroidLat: doublePrecision("centroid_lat"), // Latitude du centroïde
  centroidLon: doublePrecision("centroid_lon"), // Longitude du centroïde
  areaSqKm: doublePrecision("area_sq_km"), // Superficie en km²
  // Relations administratives
  regionId: integer("region_id"),
  departementId: integer("departement_id"),
  region: text("region"),
  departement: text("departement"),
  // Métadonnées
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertArrondissementSchema = createInsertSchema(arrondissements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  centreGeometrique: true, // Calculé automatiquement par trigger
  centroidLat: true, // Calculé automatiquement par trigger
  centroidLon: true, // Calculé automatiquement par trigger
  areaSqKm: true, // Calculé automatiquement par trigger
});

export type Arrondissement = typeof arrondissements.$inferSelect;
export type InsertArrondissement = z.infer<typeof insertArrondissementSchema>;

// Table pour les communes
export const communes = pgTable("communes", {
  id: serial("id").primaryKey(),
  code: text("code").unique(),
  nom: text("nom").notNull(),
  // Colonnes de géométrie PostGIS
  geom: geometry("geom"), // Géométrie principale (polygone)
  centreGeometrique: geometry("centre_geometrique"), // Point central
  centroidLat: doublePrecision("centroid_lat"), // Latitude du centroïde
  centroidLon: doublePrecision("centroid_lon"), // Longitude du centroïde
  areaSqKm: doublePrecision("area_sq_km"), // Superficie en km²
  // Relations administratives
  regionId: integer("region_id"),
  departementId: integer("departement_id"),
  arrondissementId: integer("arrondissement_id"),
  region: text("region"),
  departement: text("departement"),
  arrondissement: text("arrondissement"),
  // Métadonnées
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCommuneSchema = createInsertSchema(communes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  centreGeometrique: true, // Calculé automatiquement par trigger
  centroidLat: true, // Calculé automatiquement par trigger
  centroidLon: true, // Calculé automatiquement par trigger
  areaSqKm: true, // Calculé automatiquement par trigger
});

export type Commune = typeof communes.$inferSelect;
export type InsertCommune = z.infer<typeof insertCommuneSchema>;

// --- Rapports de Quinzaine Reboisement (CNR) ---

export const reforestationReports = pgTable("reforestation_reports", {
  id: serial("id").primaryKey(),
  createdBy: integer("created_by").notNull(),
  status: text("status").notNull().default("brouillon"), // brouillon, soumis, valide, rejete
  reportDate: date("report_date").notNull(),
  period: text("period").notNull(), // ex: "2024-05-Q1"
  region: text("region").notNull(),
  departement: text("departement"),
  arrondissement: text("arrondissement"),
  commune: text("commune"),
  level: text("level").notNull(), // commune, arrondissement, departement, region
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const reforestationProductionData = pgTable("reforestation_production_data", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull(),

  // Localité
  localite: text("localite").notNull().default(""),
  parentLocalite: text("parent_localite"),

  nurseryType: text("nursery_type").notNull(), // regie, communautaire, privee, scolaire


  // Nombre de pépinières
  nbPepinieresAnterieur: integer("nb_pepinieres_anterieur").default(0),
  nbPepinieresPeriode: integer("nb_pepinieres_periode").default(0),

  // Gaines empotées
  gainesEmpoteesAnterieur: integer("gaines_empotees_anterieur").default(0),
  gainesEmpoteesPeriode: integer("gaines_empotees_periode").default(0),

  // Gaines arrimées
  gainesArrimeesAnterieur: integer("gaines_arrimees_anterieur").default(0),
  gainesArrimeesPeriode: integer("gaines_arrimees_periode").default(0),

  // Gaines ensemencées
  gainesEnsemenceesAnterieur: integer("gaines_ensemencees_anterieur").default(0),
  gainesEnsemenceesPeriode: integer("gaines_ensemencees_periode").default(0),

  // Gaines en germination
  gainesGerminationAnterieur: integer("gaines_germination_anterieur").default(0),
  gainesGerminationPeriode: integer("gaines_germination_periode").default(0),
});

export const reforestationPlantsData = pgTable("reforestation_plants_data", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull(),

  // Localité
  localite: text("localite").notNull(),
  parentLocalite: text("parent_localite"),

  // Plants par type de pépinière
  regieNbPep: integer("regie_nb_pep").default(0),
  regieNbPlants: integer("regie_nb_plants").default(0),
  priveIndivNbPep: integer("prive_indiv_nb_pep").default(0),
  priveIndivNbPlants: integer("prive_indiv_nb_plants").default(0),
  villagCommNbPep: integer("villag_comm_nb_pep").default(0),
  villagCommNbPlants: integer("villag_comm_nb_plants").default(0),
  scolaireNbPep: integer("scolaire_nb_pep").default(0),
  scolaireNbPlants: integer("scolaire_nb_plants").default(0),

  // Nouveau champ dynamique pour la F2
  nurseries: json("nurseries").default([]),
});

export const reforestationSpeciesCategories = pgTable("reforestation_species_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").default("bg-gray-100 text-gray-800 border-gray-300"),
});

export const reforestationSpeciesCatalog = pgTable("reforestation_species_catalog", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  category: text("category").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const reforestationSpeciesData = pgTable("reforestation_species_data", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull(),

  // Localité (nécessaire pour la consolidation régionale)
  localite: text("localite"),
  parentLocalite: text("parent_localite"),

  speciesName: text("species_name").notNull(),
  category: text("category").notNull(), // forestiere, fruitier-forestiere, fruitiere, ornementale
  count: integer("count").notNull().default(0),
  // Nouveau champ dynamique pour la F3
  nurseries: json("nurseries").default([]),
});

export const reforestationNurseryTypes = pgTable("reforestation_nursery_types", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  code: text("code").notNull(), // ex: "REGIE", "COMMUNAUTAIRE"
  departement: text("departement"), // Optionnel: spécifique à un département, ou null pour "Tous"
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const reforestationLocalites = pgTable("reforestation_localites", {
  id: serial("id").primaryKey(),
  departement: text("departement").notNull(),
  arrondissement: text("arrondissement"),
  commune: text("commune").notNull(),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: integer("deleted_by"),
});

export const reforestationFieldData = pgTable("reforestation_field_data", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull(),

  // Ligne géographique
  localite: text("localite").notNull(),
  localiteLevel: text("localite_level").notNull(), // 'commune', 'arrondissement', 'departement', 'region'
  parentLocalite: text("parent_localite"),

  // SECTION 1: Plantations massives (ha + plants)
  pmRegieHa: numeric("pm_regie_ha", { precision: 12, scale: 2 }).default("0"),
  pmRegiePlants: integer("pm_regie_plants").default(0),
  pmPriveIndivHa: numeric("pm_prive_indiv_ha", { precision: 12, scale: 2 }).default("0"),
  pmPriveIndivPlants: integer("pm_prive_indiv_plants").default(0),
  pmVillagCommHa: numeric("pm_villag_comm_ha", { precision: 12, scale: 2 }).default("0"),
  pmVillagCommPlants: integer("pm_villag_comm_plants").default(0),
  pmScolaireHa: numeric("pm_scolaire_ha", { precision: 12, scale: 2 }).default("0"),
  pmScolairePlants: integer("pm_scolaire_plants").default(0),

  // SECTION 2: Plantations linéaires (km + plants)
  plAxesKm: numeric("pl_axes_km", { precision: 12, scale: 2 }).default("0"),
  plAxesPlants: integer("pl_axes_plants").default(0),
  plDelimKm: numeric("pl_delim_km", { precision: 12, scale: 2 }).default("0"),
  plDelimPlants: integer("pl_delim_plants").default(0),
  plHaieViveKm: numeric("pl_haie_vive_km", { precision: 12, scale: 2 }).default("0"),
  plHaieVivePlants: integer("pl_haie_vive_plants").default(0),
  plBriseVentKm: numeric("pl_brise_vent_km", { precision: 12, scale: 2 }).default("0"),
  plBriseVentPlants: integer("pl_brise_vent_plants").default(0),
  plParFeuKm: numeric("pl_par_feu_km", { precision: 12, scale: 2 }).default("0"),
  plParFeuPlants: integer("pl_par_feu_plants").default(0),

  // SECTION 3: Restauration / Réhabilitation (ha + plants)
  rrRnaHa: numeric("rr_rna_ha", { precision: 12, scale: 2 }).default("0"),
  rrRnaPlants: integer("rr_rna_plants").default(0),
  rrMiseEnDefenseHa: numeric("rr_mise_en_defense_ha", { precision: 12, scale: 2 }).default("0"),
  rrMiseEnDefensePlants: integer("rr_mise_en_defense_plants").default(0),
  rrEnrichissementHa: numeric("rr_enrichissement_ha", { precision: 12, scale: 2 }).default("0"),
  rrEnrichissementPlants: integer("rr_enrichissement_plants").default(0),
  rrMangroveHa: numeric("rr_mangrove_ha", { precision: 12, scale: 2 }).default("0"),
  rrMangrovePlants: integer("rr_mangrove_plants").default(0),

  // SECTION 4: Distribution individuelle
  distribPlants: integer("distrib_plants").default(0),
  distribHa: numeric("distrib_ha", { precision: 12, scale: 2 }).default("0"),
});

// Schemas
export const insertReforestationReportSchema = createInsertSchema(reforestationReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertReforestationProductionDataSchema = createInsertSchema(reforestationProductionData).omit({
  id: true,
});

export const insertReforestationSpeciesDataSchema = createInsertSchema(reforestationSpeciesData).omit({
  id: true,
});

export const insertReforestationFieldDataSchema = createInsertSchema(reforestationFieldData).omit({
  id: true,
});

export const insertReforestationPlantsDataSchema = createInsertSchema(reforestationPlantsData).omit({
  id: true,
});

export const insertReforestationNurseryTypeSchema = createInsertSchema(reforestationNurseryTypes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertReforestationLocaliteSchema = createInsertSchema(reforestationLocalites).omit({
  id: true,
  createdAt: true,
  deletedAt: true,
  deletedBy: true,
});

// Types
export type ReforestationReport = typeof reforestationReports.$inferSelect;
export type InsertReforestationReport = z.infer<typeof insertReforestationReportSchema>;

export type ReforestationProductionData = typeof reforestationProductionData.$inferSelect;
export type InsertReforestationProductionData = z.infer<typeof insertReforestationProductionDataSchema>;

export type ReforestationSpeciesData = typeof reforestationSpeciesData.$inferSelect;
export type InsertReforestationSpeciesData = z.infer<typeof insertReforestationSpeciesDataSchema>;

export type ReforestationFieldData = typeof reforestationFieldData.$inferSelect;
export type InsertReforestationFieldData = z.infer<typeof insertReforestationFieldDataSchema>;

export type ReforestationPlantsData = typeof reforestationPlantsData.$inferSelect;
export type InsertReforestationPlantsData = z.infer<typeof insertReforestationPlantsDataSchema>;

export type ReforestationNurseryType = typeof reforestationNurseryTypes.$inferSelect;
export type InsertReforestationNurseryType = z.infer<typeof insertReforestationNurseryTypeSchema>;

export type ReforestationLocalite = typeof reforestationLocalites.$inferSelect;
export type InsertReforestationLocalite = z.infer<typeof insertReforestationLocaliteSchema>;


// --- AUTO-GENERATED MISSING TABLES ---

export const alertNature = pgEnum("AlertNature", ['braconnage', 'trafic_bois', 'feux_brousse', 'autre', 'feux_de_brousse'])
export const notificationStatus = pgEnum("NotificationStatus", ['READ', 'NON_LU'])
export const agentLevel = pgEnum("agent_level", ['regional', 'departmental'])
export const messageType = pgEnum("message_type", ['standard', 'urgent', 'information', 'notification'])
export const niveauHierarchique = pgEnum("niveau_hierarchique", ['NATIONAL', 'REGIONAL', 'SECTEUR'])
export const permitRequestStatus = pgEnum("permit_request_status", ['pending', 'approved', 'rejected'])
export const profilCompteStatus = pgEnum("profil_compte_status", ['Actif', 'User', 'Inactif'])
export const region = pgEnum("region", ['dakar', 'thies', 'saint-louis', 'louga', 'fatick', 'kaolack', 'kaffrine', 'matam', 'tambacounda', 'kedougou', 'kolda', 'sedhiou', 'ziguinchor', 'diourbel'])
export const regionStatus = pgEnum("region_status", ['open', 'closed', 'partially_open'])
export const userRole = pgEnum("user_role", ['admin', 'hunter', 'agent', 'sub-agent', 'hunting-guide', 'brigade', 'triage', 'poste-control', 'sous-secteur'])
export const weaponType = pgEnum("weapon_type", ['fusil', 'carabine', 'arbalete', 'arc', 'lance-pierre', 'autre'])
export const zoneType = pgEnum("zone_type", ['ZIC', 'Amodié', 'Amodi‚'])



export const adminDomains = pgTable("admin_domains", {
	id: serial("id").primaryKey().notNull(),
	adminId: integer("admin_id").notNull(),
	domainId: integer("domain_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		idxAdminDomainsDomain: index("idx_admin_domains_domain").using("btree", table.domainId.asc().nullsLast()),
		adminDomainsAdminIdFkey: foreignKey({
			columns: [table.adminId],
			foreignColumns: [users.id],
			name: "admin_domains_admin_id_fkey"
		}),
		adminDomainsDomainIdFkey: foreignKey({
			columns: [table.domainId],
			foreignColumns: [domaines.id],
			name: "admin_domains_domain_id_fkey"
		}),
		adminDomainsAdminIdKey: unique("admin_domains_admin_id_key").on(table.adminId),
	}
});

export const spatialRefSys = pgTable("spatial_ref_sys", {
	srid: integer("srid").primaryKey().notNull(),
	authName: varchar("auth_name", { length: 256 }),
	authSrid: integer("auth_srid"),
	srtext: varchar("srtext", { length: 2048 }),
	proj4Text: varchar("proj4text", { length: 2048 }),
});

export const codeInfractions = pgTable("code_infractions", {
	id: serial("id").primaryKey().notNull(),
	code: varchar("code", { length: 50 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
},
(table) => {
	return {
		idxCodeInfractionsCode: index("idx_code_infractions_code").using("btree", table.code.asc().nullsLast()),
		codeInfractionsCodeKey: unique("code_infractions_code_key").on(table.code),
	}
});

export const contrevenants = pgTable("contrevenants", {
	id: serial("id").primaryKey().notNull(),
	nom: varchar("nom", { length: 100 }).notNull(),
	prenom: varchar("prenom", { length: 100 }),
	filiation: varchar("filiation", { length: 255 }),
	// TODO: failed to parse database type 'bytea'
	photo: unknown("photo"),
	// TODO: failed to parse database type 'bytea'
	pieceIdentite: unknown("piece_identite"),
	numeroPiece: varchar("numero_piece", { length: 100 }),
	typePiece: varchar("type_piece", { length: 100 }),
	// TODO: failed to parse database type 'bytea'
	donneesBiometriques: unknown("donnees_biometriques"),
	dateCreation: timestamp("date_creation", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	createdBy: integer("created_by"),
	domainId: integer("domain_id"),
},
(table) => {
	return {
		idxContrevenantsCreatedBy: index("idx_contrevenants_created_by").using("btree", table.createdBy.asc().nullsLast()),
		idxContrevenantsNom: index("idx_contrevenants_nom").using("btree", table.nom.asc().nullsLast()),
		uqContrevenantsNumeroPiece: uniqueIndex("uq_contrevenants_numero_piece").using("btree", sql`lower((numero_piece)::text)`).where(sql`(numero_piece IS NOT NULL)`),
		contrevenantsCreatedByFkey: foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "contrevenants_created_by_fkey"
		}).onDelete("set null"),
	}
});

export const agentDomains = pgTable("agent_domains", {
	id: serial("id").primaryKey().notNull(),
	agentId: integer("agent_id").notNull(),
	domainId: integer("domain_id").notNull(),
	level: agentLevel("level").notNull(),
	region: text("region").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		idxAgentDomainsAgent: index("idx_agent_domains_agent").using("btree", table.agentId.asc().nullsLast()),
		idxAgentDomainsDomain: index("idx_agent_domains_domain").using("btree", table.domainId.asc().nullsLast()),
		idxAgentDomainsLevelRegion: index("idx_agent_domains_level_region").using("btree", table.level.asc().nullsLast(), table.region.asc().nullsLast()),
		agentDomainsAgentIdFkey: foreignKey({
			columns: [table.agentId],
			foreignColumns: [users.id],
			name: "agent_domains_agent_id_fkey"
		}),
		agentDomainsDomainIdFkey: foreignKey({
			columns: [table.domainId],
			foreignColumns: [domaines.id],
			name: "agent_domains_domain_id_fkey"
		}),
	}
});

export const infractions = pgTable("infractions", {
	id: serial("id").primaryKey().notNull(),
	codeInfractionId: integer("code_infraction_id").notNull(),
	lieuId: integer("lieu_id"),
	dateInfraction: timestamp("date_infraction", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	agentId: integer("agent_id"),
	montantChiffre: numeric("montant_chiffre", { precision: 12, scale:  2 }),
	montantLettre: varchar("montant_lettre", { length: 255 }),
	numeroQuittance: varchar("numero_quittance", { length: 100 }),
	// TODO: failed to parse database type 'bytea'
	photoQuittance: unknown("photo_quittance"),
	// TODO: failed to parse database type 'bytea'
	photoInfraction: unknown("photo_infraction"),
	// TODO: failed to parse database type 'bytea[]'
	autresPieces: unknown("autres_pieces").array(),
	observations: text("observations"),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	codeItemId: bigint("code_item_id", { mode: "number" }),
	nature: text("nature"),
	articleCode: text("article_code"),
	createdBy: integer("created_by"),
	domainId: integer("domain_id"),
},
(table) => {
	return {
		idxInfractionsAgent: index("idx_infractions_agent").using("btree", table.agentId.asc().nullsLast()),
		idxInfractionsCodeItemId: index("idx_infractions_code_item_id").using("btree", table.codeItemId.asc().nullsLast()),
		idxInfractionsCreatedBy: index("idx_infractions_created_by").using("btree", table.createdBy.asc().nullsLast()),
		idxInfractionsDate: index("idx_infractions_date").using("btree", table.dateInfraction.asc().nullsLast()),
		idxInfractionsNumeroQuittanceUnique: uniqueIndex("idx_infractions_numero_quittance_unique").using("btree", table.numeroQuittance.asc().nullsLast()).where(sql`(numero_quittance IS NOT NULL)`),
		infractionsAgentIdFkey: foreignKey({
			columns: [table.agentId],
			foreignColumns: [agentsVerbalisateurs.id],
			name: "infractions_agent_id_fkey"
		}).onDelete("set null"),
		infractionsCodeInfractionIdFkey: foreignKey({
			columns: [table.codeInfractionId],
			foreignColumns: [codeInfractions.id],
			name: "infractions_code_infraction_id_fkey"
		}).onDelete("cascade"),
		infractionsLieuIdFkey: foreignKey({
			columns: [table.lieuId],
			foreignColumns: [lieux.id],
			name: "infractions_lieu_id_fkey"
		}).onDelete("set null"),
		infractionsCodeItemIdFkey: foreignKey({
			columns: [table.codeItemId],
			foreignColumns: [codeInfractionItems.id],
			name: "infractions_code_item_id_fkey"
		}).onDelete("set null"),
		infractionsCreatedByFkey: foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "infractions_created_by_fkey"
		}).onDelete("set null"),
	}
});

export const declarationEspeces = pgTable("declaration_especes", {
	id: serial("id").primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	hunterId: integer("hunter_id"),
	permitId: integer("permit_id"),
	permitNumber: text("permit_number").notNull(),
	category: text("category"),
	especeId: text("espece_id").notNull(),
	nomEspece: text("nom_espece"),
	nomScientifique: text("nom_scientifique"),
	sexe: text("sexe").notNull(),
	quantity: integer("quantity").notNull(),
	lat: numeric("lat"),
	lon: numeric("lon"),
	location: text("location"),
	// TODO: failed to parse database type 'bytea'
	photoData: unknown("photo_data"),
	photoMime: text("photo_mime"),
	photoName: text("photo_name"),
	photoChecksum: text("photo_checksum"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	arrondissement: text("arrondissement"),
	commune: text("commune"),
	departement: text("departement"),
	region: text("region"),
	guideId: integer("guide_id"),
	status: varchar("status", { length: 20 }).default('pending'),
	reviewedAt: timestamp("reviewed_at", { mode: 'string' }),
	reviewNotes: text("review_notes"),
	domainId: integer("domain_id"),
},
(table) => {
	return {
		idxDeclarationEspecesArrondissement: index("idx_declaration_especes_arrondissement").using("btree", table.arrondissement.asc().nullsLast()),
		idxDeclarationEspecesCommune: index("idx_declaration_especes_commune").using("btree", table.commune.asc().nullsLast()),
		idxDeclarationEspecesCreatedAt: index("idx_declaration_especes_created_at").using("btree", table.createdAt.desc().nullsFirst()),
		idxDeclarationEspecesDepartement: index("idx_declaration_especes_departement").using("btree", table.departement.asc().nullsLast()),
		idxDeclarationEspecesGuideId: index("idx_declaration_especes_guide_id").using("btree", table.guideId.asc().nullsLast()),
		idxDeclarationEspecesHunterGuide: index("idx_declaration_especes_hunter_guide").using("btree", table.hunterId.asc().nullsLast(), table.guideId.asc().nullsLast()),
		idxDeclarationEspecesRegion: index("idx_declaration_especes_region").using("btree", table.region.asc().nullsLast()),
		idxDeclarationEspecesStatus: index("idx_declaration_especes_status").using("btree", table.status.asc().nullsLast()),
		idxDeclarationEspecesUserId: index("idx_declaration_especes_user_id").using("btree", table.userId.asc().nullsLast()),
	}
});

export const agentsRegionauxLegacy = pgTable("agents_regionaux_legacy", {
	id: serial("id").primaryKey().notNull(),
	username: text("username").notNull(),
	password: text("password").notNull(),
	email: text("email").notNull(),
	prenom: text("prenom").notNull(),
	nom: text("nom").notNull(),
	telephone: text("telephone"),
	matricule: text("matricule"),
	region: text("region").notNull(),
},
(table) => {
	return {
		uniqueUsername: unique("unique_username").on(table.username),
		uniqueEmail: unique("unique_email").on(table.email),
		uniqueTelephone: unique("unique_telephone").on(table.telephone),
		uniqueMatricule: unique("unique_matricule").on(table.matricule),
	}
});

export const departements = pgTable("departements", {
	id: serial("id").primaryKey().notNull(),
	code: varchar("code", { length: 20 }),
	nom: varchar("nom", { length: 255 }).notNull(),
	codeRegion: varchar("code_region", { length: 20 }),
	pays: varchar("pays", { length: 10 }),
	surfaceHa: numeric("surface_ha", { precision: 15, scale:  6 }),
	perimetreM: numeric("perimetre_m", { precision: 15, scale:  3 }),
	dateCreation: timestamp("date_creation", { mode: 'string' }).defaultNow(),
	dateMaj: timestamp("date_maj", { mode: 'string' }).defaultNow(),
	statutChasse: varchar("statut_chasse", { length: 255 }),
	color: varchar("color", { length: 50 }),
	regionId: integer("region_id"),
	geom: geometry("geom", { type: "multipolygon", srid: 32628 }),
	centreGeometrique: geometry("centre_geometrique", { type: "point", srid: 32628 }),
},
(table) => {
	return {
		centreGeometriqueIdx: index("departements_centre_geometrique_idx").using("gist", table.centreGeometrique.asc().nullsLast()),
		geomIdx: index("departements_geom_idx").using("gist", table.geom.asc().nullsLast()),
		idxDepartementsGeom: index("idx_departements_geom").using("gist", table.geom.asc().nullsLast()),
		fkDepartementsRegion: foreignKey({
			columns: [table.regionId],
			foreignColumns: [regions.id],
			name: "fk_departements_region"
		}),
	}
});

export const regionalAgentsView = pgTable("regional_agents_view", {
	id: integer("id"),
	username: text("username"),
	email: text("email"),
	firstName: text("first_name"),
	lastName: text("last_name"),
	phone: text("phone"),
	matricule: text("matricule"),
	serviceLocation: text("service_location"),
	region: text("region"),
	zone: text("zone"),
	role: userRole("role"),
	isActive: boolean("is_active"),
	isSuspended: boolean("is_suspended"),
	createdAt: timestamp("created_at", { mode: 'string' }),
});

export const saisieGroups = pgTable("saisie_groups", {
	id: serial("id").primaryKey().notNull(),
	key: text("key").notNull(),
	label: text("label").notNull(),
	color: text("color").default('red-light'),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
},
(table) => {
	return {
		saisieGroupsKeyKey: unique("saisie_groups_key_key").on(table.key),
	}
});

export const agentsVerbalisateurs = pgTable("agents_verbalisateurs", {
	id: serial("id").primaryKey().notNull(),
	nom: varchar("nom", { length: 100 }).notNull(),
	prenom: varchar("prenom", { length: 100 }).notNull(),
	matricule: varchar("matricule", { length: 50 }),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	createdBy: integer("created_by"),
},
(table) => {
	return {
		idxAgentsVerbalisateursCreatedBy: index("idx_agents_verbalisateurs_created_by").using("btree", table.createdBy.asc().nullsLast()),
		agentsVerbalisateursCreatedByFkey: foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "agents_verbalisateurs_created_by_fkey"
		}).onDelete("set null"),
		agentsVerbalisateursMatriculeKey: unique("agents_verbalisateurs_matricule_key").on(table.matricule),
	}
});

export const agentsSecteursLegacy = pgTable("agents_secteurs_legacy", {
	id: serial("id").primaryKey().notNull(),
	username: text("username").notNull(),
	password: text("password").notNull(),
	email: text("email").notNull(),
	prenom: text("prenom").notNull(),
	nom: text("nom").notNull(),
	telephone: text("telephone"),
	matricule: text("matricule"),
	secteur: text("secteur").notNull(),
	idAgentRegional: integer("id_agent_regional").notNull(),
},
(table) => {
	return {
		agentsSecteursUsernameKey: uniqueIndex("agents_secteurs_username_key").using("btree", table.username.asc().nullsLast()),
		agentsSecteursIdAgentRegionalFkey: foreignKey({
			columns: [table.idAgentRegional],
			foreignColumns: [agentsRegionauxLegacy.id],
			name: "agents_secteurs_id_agent_regional_fkey"
		}).onDelete("cascade"),
	}
});

export const huntingCampaignCategoryPeriods = pgTable("hunting_campaign_category_periods", {
	id: bigserial("id", { mode: "bigint" }).primaryKey().notNull(),
	campaignId: integer("campaign_id").notNull(),
	categoryKey: text("category_key").notNull(),
	startDate: date("start_date").notNull(),
	endDate: date("end_date").notNull(),
	enabled: boolean("enabled").default(true).notNull(),
	derogationEnabled: boolean("derogation_enabled").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		idxHccpCampaignId: index("idx_hccp_campaign_id").using("btree", table.campaignId.asc().nullsLast()),
		idxHccpCategoryKey: index("idx_hccp_category_key").using("btree", table.categoryKey.asc().nullsLast()),
		huntingCampaignCategoryPeriodsCampaignIdFkey: foreignKey({
			columns: [table.campaignId],
			foreignColumns: [huntingCampaigns.id],
			name: "hunting_campaign_category_periods_campaign_id_fkey"
		}).onDelete("cascade"),
		huntingCampaignCategoryPeriodsCampaignIdCategoryKeyKey: unique("hunting_campaign_category_periods_campaign_id_category_key_key").on(table.campaignId, table.categoryKey),
	}
});

export const regions = pgTable("regions", {
	id: serial("id").primaryKey().notNull(),
	code: varchar("code", { length: 20 }),
	nom: varchar("nom", { length: 255 }).notNull(),
	pays: varchar("pays", { length: 10 }),
	surfaceHa: numeric("surface_ha", { precision: 15, scale:  6 }),
	perimetreM: numeric("perimetre_m", { precision: 15, scale:  3 }),
	dateCreation: timestamp("date_creation", { mode: 'string' }).defaultNow(),
	dateMaj: timestamp("date_maj", { mode: 'string' }).defaultNow(),
	statutChasse: varchar("statut_chasse", { length: 255 }),
	color: varchar("color", { length: 50 }),
	geom: geometry("geom", { type: "multipolygon", srid: 32628 }),
	centreGeometrique: geometry("centre_geometrique", { type: "point", srid: 32628 }),
},
(table) => {
	return {
		idxRegionsGeom: index("idx_regions_geom").using("gist", table.geom.asc().nullsLast()),
		centreGeometriqueIdx: index("regions_centre_geometrique_idx").using("gist", table.centreGeometrique.asc().nullsLast()),
		geomIdx: index("regions_geom_idx").using("gist", table.geom.asc().nullsLast()),
	}
});

export const units = pgTable("units", {
	id: serial("id").primaryKey().notNull(),
	key: text("key").notNull(),
	label: text("label").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
},
(table) => {
	return {
		unitsKeyKey: unique("units_key_key").on(table.key),
	}
});

export const usersAgentsLabels = pgTable("users_agents_labels", {
	id: integer("id"),
	username: text("username"),
	email: text("email"),
	firstName: text("first_name"),
	lastName: text("last_name"),
	phone: text("phone"),
	matricule: text("matricule"),
	serviceLocation: text("service_location"),
	region: text("region"),
	departement: text("departement"),
	role: userRole("role"),
	roleMetierCode: text("role_metier_code"),
	roleMetierLabel: text("role_metier_label"),
	isActive: boolean("is_active"),
	active: boolean("active"),
	isSuspended: boolean("is_suspended"),
	createdAt: timestamp("created_at", { mode: 'string' }),
	lastLogin: timestamp("last_login", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	hunterId: integer("hunter_id"),
	agentLat: doublePrecision("agent_lat"),
	agentLon: doublePrecision("agent_lon"),
});

export const authorizedSpecies = pgTable("authorized_species", {
	id: serial("id").primaryKey().notNull(),
	speciesId: integer("species_id").notNull(),
	zoneId: integer("zone_id").notNull(),
	allowed: boolean("allowed").default(true).notNull(),
	seasonStartDate: date("season_start_date"),
	seasonEndDate: date("season_end_date"),
	notes: text("notes"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const campagnes = pgTable("campagnes", {
	id: integer("id").primaryKey().generatedAlwaysAsIdentity({ name: "campagnes_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	nom: text("nom"),
	annee: text("annee"),
	dateOuverture: date("date_ouverture").notNull(),
	dateFermeture: date("date_fermeture").notNull(),
	grandeChasseDateOuverture: date("grande_chasse_date_ouverture"),
	grandeChasseDateFermeture: date("grande_chasse_date_fermeture"),
	gibierEauDateOuverture: date("gibier_eau_date_ouverture"),
	gibierEauDateFermeture: date("gibier_eau_date_fermeture"),
	statutActif: boolean("statut_actif").default(false).notNull(),
	creeLe: timestamp("cree_le", { mode: 'string' }).defaultNow().notNull(),
	majLe: timestamp("maj_le", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		uqCampagnesActive: uniqueIndex("uq_campagnes_active").using("btree", table.statutActif.asc().nullsLast()).where(sql`(statut_actif IS TRUE)`),
	}
});

export const ecoGeographieZones = pgTable("eco_geographie_zones", {
	ogcFid: serial("ogc_fid").primaryKey().notNull(),
	area: doublePrecision("area"),
	perimeter: doublePrecision("perimeter"),
	zone: integer("zone"),
	nom: varchar("nom"),
	geometry: geometry("geometry", { type: "multipolygon", srid: 32628 }),
},
(table) => {
	return {
		geometryIdx: index("eco_geographie_zones_geometry_idx").using("gist", table.geometry.asc().nullsLast()),
	}
});

export const huntingActivities = pgTable("hunting_activities", {
	id: serial("id").primaryKey().notNull(),
	hunterId: integer("hunter_id").notNull(),
	permitId: integer("permit_id"),
	permitNumber: varchar("permit_number", { length: 50 }),
	speciesId: varchar("species_id", { length: 50 }),
	speciesName: varchar("species_name", { length: 100 }),
	scientificName: varchar("scientific_name", { length: 100 }),
	sex: varchar("sex", { length: 20 }),
	quantity: integer("quantity").default(1),
	location: text("location"),
	lat: numeric("lat", { precision: 10, scale:  8 }),
	lon: numeric("lon", { precision: 11, scale:  8 }),
	huntingDate: timestamp("hunting_date", { mode: 'string' }),
	// TODO: failed to parse database type 'bytea'
	photoData: unknown("photo_data"),
	photoMime: varchar("photo_mime", { length: 100 }),
	photoName: varchar("photo_name", { length: 255 }),
	sourceType: varchar("source_type", { length: 50 }).default('direct'),
	sourceId: integer("source_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	activityNumber: varchar("activity_number", { length: 50 }),
	domainId: integer("domain_id"),
},
(table) => {
	return {
		idxHuntingActivitiesActivityNumber: index("idx_hunting_activities_activity_number").using("btree", table.activityNumber.asc().nullsLast()),
		idxHuntingActivitiesHunterId: index("idx_hunting_activities_hunter_id").using("btree", table.hunterId.asc().nullsLast()),
		idxHuntingActivitiesHuntingDate: index("idx_hunting_activities_hunting_date").using("btree", table.huntingDate.asc().nullsLast()),
		idxHuntingActivitiesPermitId: index("idx_hunting_activities_permit_id").using("btree", table.permitId.asc().nullsLast()),
		idxHuntingActivitiesSource: index("idx_hunting_activities_source").using("btree", table.sourceType.asc().nullsLast(), table.sourceId.asc().nullsLast()),
		huntingActivitiesDomainIdFkey: foreignKey({
			columns: [table.domainId],
			foreignColumns: [domaines.id],
			name: "hunting_activities_domain_id_fkey"
		}),
		huntingActivitiesActivityNumberKey: unique("hunting_activities_activity_number_key").on(table.activityNumber),
	}
});

export const hunterAttachments = pgTable("hunter_attachments", {
	hunterId: integer("hunter_id").primaryKey().notNull(),
	// TODO: failed to parse database type 'bytea'
	idCardData: unknown("id_card_data"),
	idCardMime: varchar("id_card_mime", { length: 100 }),
	idCardName: varchar("id_card_name", { length: 255 }),
	idCardChecksum: varchar("id_card_checksum", { length: 64 }),
	// TODO: failed to parse database type 'bytea'
	weaponPermitData: unknown("weapon_permit_data"),
	weaponPermitMime: varchar("weapon_permit_mime", { length: 100 }),
	weaponPermitName: varchar("weapon_permit_name", { length: 255 }),
	weaponPermitChecksum: varchar("weapon_permit_checksum", { length: 64 }),
	// TODO: failed to parse database type 'bytea'
	hunterPhotoData: unknown("hunter_photo_data"),
	hunterPhotoMime: varchar("hunter_photo_mime", { length: 100 }),
	hunterPhotoName: varchar("hunter_photo_name", { length: 255 }),
	hunterPhotoChecksum: varchar("hunter_photo_checksum", { length: 64 }),
	// TODO: failed to parse database type 'bytea'
	treasuryStampData: unknown("treasury_stamp_data"),
	treasuryStampMime: varchar("treasury_stamp_mime", { length: 100 }),
	treasuryStampName: varchar("treasury_stamp_name", { length: 255 }),
	treasuryStampChecksum: varchar("treasury_stamp_checksum", { length: 64 }),
	// TODO: failed to parse database type 'bytea'
	weaponReceiptData: unknown("weapon_receipt_data"),
	weaponReceiptMime: varchar("weapon_receipt_mime", { length: 100 }),
	weaponReceiptName: varchar("weapon_receipt_name", { length: 255 }),
	weaponReceiptChecksum: varchar("weapon_receipt_checksum", { length: 64 }),
	// TODO: failed to parse database type 'bytea'
	insuranceData: unknown("insurance_data"),
	insuranceMime: varchar("insurance_mime", { length: 100 }),
	insuranceName: varchar("insurance_name", { length: 255 }),
	insuranceChecksum: varchar("insurance_checksum", { length: 64 }),
	// TODO: failed to parse database type 'bytea'
	moralCertificateData: unknown("moral_certificate_data"),
	moralCertificateMime: varchar("moral_certificate_mime", { length: 100 }),
	moralCertificateName: varchar("moral_certificate_name", { length: 255 }),
	moralCertificateChecksum: varchar("moral_certificate_checksum", { length: 64 }),
	updatedAt: timestamp("updated_at", { precision: 6, withTimezone: true, mode: 'string' }).defaultNow(),
	treasuryStampIssueDate: date("treasury_stamp_issue_date"),
	treasuryStampExpiryDate: date("treasury_stamp_expiry_date"),
	idCardIssueDate: date("id_card_issue_date"),
	idCardExpiryDate: date("id_card_expiry_date"),
	weaponPermitIssueDate: date("weapon_permit_issue_date"),
	weaponPermitExpiryDate: date("weapon_permit_expiry_date"),
	insuranceIssueDate: date("insurance_issue_date"),
	insuranceExpiryDate: date("insurance_expiry_date"),
	weaponReceiptIssueDate: date("weapon_receipt_issue_date"),
	weaponReceiptExpiryDate: date("weapon_receipt_expiry_date"),
},
(table) => {
	return {
		idxHunterAttachmentsUpdatedAt: index("idx_hunter_attachments_updated_at").using("btree", table.updatedAt.asc().nullsLast()),
		hunterAttachmentsHunterIdFkey: foreignKey({
			columns: [table.hunterId],
			foreignColumns: [hunters.id],
			name: "hunter_attachments_hunter_id_fkey"
		}).onDelete("cascade"),
	}
});

export const especes = pgTable("especes", {
	id: serial("id").primaryKey().notNull(),
	nom: text("nom").notNull(),
	nomScientifique: text("nom_scientifique"),
	statutProtection: text("statut_protection").default('Aucun').notNull(),
	citesAnnexe: text("cites_annexe"),
	groupe: text("groupe").notNull(),
	quota: integer("quota"),
	chassable: boolean("chassable").default(true).notNull(),
	taxable: boolean("taxable").default(true).notNull(),
	photoUrl: text("photo_url"),
	photoData: text("photo_data"),
	photoMime: text("photo_mime"),
	photoName: text("photo_name"),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
},
(table) => {
	return {
		idxEspecesChassable: index("idx_especes_chassable").using("btree", table.chassable.asc().nullsLast()),
		idxEspecesGroupe: index("idx_especes_groupe").using("btree", table.groupe.asc().nullsLast()),
		idxEspecesNom: index("idx_especes_nom").using("btree", table.nom.asc().nullsLast()),
		idxEspecesTaxable: index("idx_especes_taxable").using("btree", table.taxable.asc().nullsLast()),
	}
});

export const procesVerbaux = pgTable("proces_verbaux", {
	id: serial("id").primaryKey().notNull(),
	infractionId: integer("infraction_id").notNull(),
	// TODO: failed to parse database type 'bytea'
	fichierPv: unknown("fichier_pv"),
	numeroPv: varchar("numero_pv", { length: 50 }),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	domainId: integer("domain_id"),
},
(table) => {
	return {
		idxProcesVerbauxInfraction: index("idx_proces_verbaux_infraction").using("btree", table.infractionId.asc().nullsLast()),
		procesVerbauxInfractionIdFkey: foreignKey({
			columns: [table.infractionId],
			foreignColumns: [infractions.id],
			name: "proces_verbaux_infraction_id_fkey"
		}).onDelete("cascade"),
		procesVerbauxNumeroPvKey: unique("proces_verbaux_numero_pv_key").on(table.numeroPv),
	}
});

export const receiptRegistry = pgTable("receipt_registry", {
	receiptNumber: text("receipt_number").primaryKey().notNull(),
	source: text("source").notNull(),
	sourceId: integer("source_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const hunterDocuments = pgTable("hunter_documents", {
	id: serial("id").primaryKey().notNull(),
	hunterId: integer("hunter_id"),
	documentType: varchar("document_type", { length: 100 }),
	filePath: text("file_path"),
	fileName: varchar("file_name", { length: 255 }),
	uploadedAt: timestamp("uploaded_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
},
(table) => {
	return {
		hunterDocumentsHunterIdFkey: foreignKey({
			columns: [table.hunterId],
			foreignColumns: [hunters.id],
			name: "hunter_documents_hunter_id_fkey"
		}),
	}
});

export const huntingCampaignPeriods = pgTable("hunting_campaign_periods", {
	id: serial("id").primaryKey().notNull(),
	campaignId: integer("campaign_id").notNull(),
	code: text("code").notNull(),
	name: text("name").notNull(),
	startDate: date("start_date").notNull(),
	endDate: date("end_date").notNull(),
	enabled: boolean("enabled").default(true).notNull(),
	derogationEnabled: boolean("derogation_enabled").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	categoryKey: text("category_key"),
},
(table) => {
	return {
		idxHcpCampaign: index("idx_hcp_campaign").using("btree", table.campaignId.asc().nullsLast()),
		idxHcpUniqueCampaignCode: uniqueIndex("idx_hcp_unique_campaign_code").using("btree", table.campaignId.asc().nullsLast(), table.code.asc().nullsLast()),
		huntingCampaignPeriodsCampaignIdFkey: foreignKey({
			columns: [table.campaignId],
			foreignColumns: [huntingCampaigns.id],
			name: "hunting_campaign_periods_campaign_id_fkey"
		}).onDelete("cascade"),
	}
});

export const lieux = pgTable("lieux", {
	id: serial("id").primaryKey().notNull(),
	region: varchar("region", { length: 100 }),
	departement: varchar("departement", { length: 100 }),
	commune: varchar("commune", { length: 100 }),
	arrondissement: varchar("arrondissement", { length: 100 }),
	latitude: numeric("latitude", { precision: 9, scale:  6 }),
	longitude: numeric("longitude", { precision: 9, scale:  6 }),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

export const mappingArrDept = pgTable("mapping_arr_dept", {
	arrondissementNom: text("arrondissement_nom").primaryKey().notNull(),
	departementNom: text("departement_nom").notNull(),
});

export const permitCategoryPrices = pgTable("permit_category_prices", {
	id: serial("id").primaryKey().notNull(),
	categoryId: integer("category_id").notNull(),
	seasonYear: text("season_year").notNull(),
	tarifXof: numeric("tarif_xof", { precision: 12, scale:  2 }).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		idxPermitCategoryPricesActive: index("idx_permit_category_prices_active").using("btree", table.isActive.asc().nullsLast()),
		idxPermitCategoryPricesSeason: index("idx_permit_category_prices_season").using("btree", table.seasonYear.asc().nullsLast()),
		permitCategoryPricesCategoryIdFkey: foreignKey({
			columns: [table.categoryId],
			foreignColumns: [permitCategories.id],
			name: "permit_category_prices_category_id_fkey"
		}).onDelete("cascade"),
		uqCategorySeason: unique("uq_category_season").on(table.categoryId, table.seasonYear),
	}
});

export const weaponCalibers = pgTable("weapon_calibers", {
	id: serial("id").primaryKey().notNull(),
	weaponTypeId: integer("weapon_type_id").notNull(),
	code: varchar("code", { length: 50 }).notNull(),
	label: varchar("label", { length: 100 }).notNull(),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
},
(table) => {
	return {
		weaponCalibersWeaponTypeIdFkey: foreignKey({
			columns: [table.weaponTypeId],
			foreignColumns: [weaponTypes.id],
			name: "weapon_calibers_weapon_type_id_fkey"
		}).onDelete("cascade"),
	}
});

export const zoneGuides = pgTable("zone_guides", {
	id: serial("id").primaryKey().notNull(),
	zoneId: integer("zone_id").notNull(),
	guideId: integer("guide_id").notNull(),
	startDate: date("start_date").notNull(),
	endDate: date("end_date"),
	isPrincipal: boolean("is_principal").default(false).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		zoneGuidesGuideIdHuntingGuidesIdFk: foreignKey({
			columns: [table.guideId],
			foreignColumns: [huntingGuides.id],
			name: "zone_guides_guide_id_hunting_guides_id_fk"
		}),
	}
});

export const weaponTypes = pgTable("weapon_types", {
	id: serial("id").primaryKey().notNull(),
	code: varchar("code", { length: 50 }).notNull(),
	label: varchar("label", { length: 100 }).notNull(),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
},
(table) => {
	return {
		weaponTypesNewCodeKey: unique("weapon_types_new_code_key").on(table.code),
	}
});

export const zoneTypes = pgTable("zone_types", {
	id: serial("id").primaryKey().notNull(),
	key: text("key").notNull(),
	label: text("label").notNull(),
	color: text("color").default('#0ea5e9').notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		idxZoneTypesActive: index("idx_zone_types_active").using("btree", table.isActive.asc().nullsLast()),
		idxZoneTypesKey: index("idx_zone_types_key").using("btree", table.key.asc().nullsLast()),
		zoneTypesKeyKey: unique("zone_types_key_key").on(table.key),
	}
});

export const permitCategories = pgTable("permit_categories", {
	id: serial("id").primaryKey().notNull(),
	key: text("key").notNull(),
	labelFr: text("label_fr").notNull(),
	groupe: text("groupe").notNull(),
	genre: text("genre").notNull(),
	defaultValidityDays: integer("default_validity_days"),
	maxRenewals: integer("max_renewals").default(0).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	rulesJson: jsonb("rules_json"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	sousCategorie: text("sous_categorie"),
	displayOrder: integer("display_order"),
},
(table) => {
	return {
		idxPermitCategoriesActive: index("idx_permit_categories_active").using("btree", table.isActive.asc().nullsLast()),
		idxPermitCategoriesGroupGenreSous: index("idx_permit_categories_group_genre_sous").using("btree", table.groupe.asc().nullsLast(), table.genre.asc().nullsLast(), table.sousCategorie.asc().nullsLast()),
		permitCategoriesKeyKey: unique("permit_categories_key_key").on(table.key),
	}
});

export const zoneStatuses = pgTable("zone_statuses", {
	id: serial("id").primaryKey().notNull(),
	key: text("key").notNull(),
	label: text("label").notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		idxZoneStatusesActive: index("idx_zone_statuses_active").using("btree", table.isActive.asc().nullsLast()),
		idxZoneStatusesKey: index("idx_zone_statuses_key").using("btree", table.key.asc().nullsLast()),
		zoneStatusesKeyKey: unique("zone_statuses_key_key").on(table.key),
	}
});

export const contrevenantsInfractions = pgTable("contrevenants_infractions", {
	id: serial("id").primaryKey().notNull(),
	contrevenantId: integer("contrevenant_id").notNull(),
	infractionId: integer("infraction_id").notNull(),
	role: varchar("role", { length: 100 }),
	dateImplication: timestamp("date_implication", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
},
(table) => {
	return {
		contrevenantsInfractionsContrevenantIdFkey: foreignKey({
			columns: [table.contrevenantId],
			foreignColumns: [contrevenants.id],
			name: "contrevenants_infractions_contrevenant_id_fkey"
		}).onDelete("cascade"),
		contrevenantsInfractionsInfractionIdFkey: foreignKey({
			columns: [table.infractionId],
			foreignColumns: [infractions.id],
			name: "contrevenants_infractions_infraction_id_fkey"
		}).onDelete("cascade"),
		contrevenantsInfractionsContrevenantIdInfractionIdKey: unique("contrevenants_infractions_contrevenant_id_infraction_id_key").on(table.contrevenantId, table.infractionId),
	}
});

export const weaponBrands = pgTable("weapon_brands", {
	id: serial("id").primaryKey().notNull(),
	weaponTypeId: integer("weapon_type_id").notNull(),
	code: varchar("code", { length: 50 }).notNull(),
	label: varchar("label", { length: 100 }).notNull(),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
},
(table) => {
	return {
		weaponBrandsWeaponTypeIdFkey: foreignKey({
			columns: [table.weaponTypeId],
			foreignColumns: [weaponTypes.id],
			name: "weapon_brands_weapon_type_id_fkey"
		}).onDelete("cascade"),
	}
});

export const zones = pgTable("zones", {
	id: serial("id").primaryKey().notNull(),
	name: text("name").notNull(),
	type: text("type").notNull(),
	status: text("status").default('active'),
	color: text("color"),
	responsibleName: text("responsible_name"),
	responsiblePhone: text("responsible_phone"),
	responsibleEmail: text("responsible_email"),
	responsiblePhoto: text("responsible_photo"),
	attachments: jsonb("attachments"),
	notes: text("notes"),
	guidesCount: integer("guides_count"),
	trackersCount: integer("trackers_count"),
	geometry: geometry("geometry", { type: "polygon", srid: 4326 }).notNull(),
	region: text("region"),
	departement: text("departement"),
	commune: text("commune"),
	arrondissement: text("arrondissement"),
	centroidLat: doublePrecision("centroid_lat"),
	centroidLon: doublePrecision("centroid_lon"),
	areaSqKm: doublePrecision("area_sq_km"),
	createdBy: text("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		idxZonesDepartement: index("idx_zones_departement").using("btree", table.departement.asc().nullsLast()),
		idxZonesGeomGist: index("idx_zones_geom_gist").using("gist", table.geometry.asc().nullsLast()),
		idxZonesGeometry: index("idx_zones_geometry").using("gist", table.geometry.asc().nullsLast()),
		idxZonesName: index("idx_zones_name").using("btree", table.name.asc().nullsLast()),
		idxZonesRegion: index("idx_zones_region").using("btree", table.region.asc().nullsLast()),
		idxZonesStatus: index("idx_zones_status").using("btree", table.status.asc().nullsLast()),
		idxZonesType: index("idx_zones_type").using("btree", table.type.asc().nullsLast()),
	}
});

export const systemSettings = pgTable("system_settings", {
	id: serial("id").primaryKey().notNull(),
	settingKey: text("setting_key").notNull(),
	settingValue: text("setting_value"),
	description: text("description"),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
},
(table) => {
	return {
		idxSystemSettingsKey: index("idx_system_settings_key").using("btree", table.settingKey.asc().nullsLast()),
		systemSettingsSettingKeyKey: unique("system_settings_setting_key_key").on(table.settingKey),
	}
});

export const protectedZoneTypes = pgTable("protected_zone_types", {
	id: serial("id").primaryKey().notNull(),
	key: text("key").notNull(),
	label: text("label").notNull(),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
},
(table) => {
	return {
		protectedZoneTypesKeyKey: unique("protected_zone_types_key_key").on(table.key),
	}
});

export const geographyColumns = pgTable("geography_columns", {
	// TODO: failed to parse database type 'name'
	fTableCatalog: unknown("f_table_catalog"),
	// TODO: failed to parse database type 'name'
	fTableSchema: unknown("f_table_schema"),
	// TODO: failed to parse database type 'name'
	fTableName: unknown("f_table_name"),
	// TODO: failed to parse database type 'name'
	fGeographyColumn: unknown("f_geography_column"),
	coordDimension: integer("coord_dimension"),
	srid: integer("srid"),
	type: text("type"),
});

export const geometryColumns = pgTable("geometry_columns", {
	fTableCatalog: varchar("f_table_catalog", { length: 256 }),
	// TODO: failed to parse database type 'name'
	fTableSchema: unknown("f_table_schema"),
	// TODO: failed to parse database type 'name'
	fTableName: unknown("f_table_name"),
	// TODO: failed to parse database type 'name'
	fGeometryColumn: unknown("f_geometry_column"),
	coordDimension: integer("coord_dimension"),
	srid: integer("srid"),
	type: varchar("type", { length: 30 }),
});

export const sectorAgentsView = pgTable("sector_agents_view", {
	id: integer("id"),
	username: text("username"),
	email: text("email"),
	firstName: text("first_name"),
	lastName: text("last_name"),
	phone: text("phone"),
	matricule: text("matricule"),
	serviceLocation: text("service_location"),
	region: text("region"),
	zone: text("zone"),
	role: userRole("role"),
	isActive: boolean("is_active"),
	isSuspended: boolean("is_suspended"),
	createdAt: timestamp("created_at", { mode: 'string' }),
});

export const allAgentsView = pgTable("all_agents_view", {
	id: integer("id"),
	username: text("username"),
	email: text("email"),
	firstName: text("first_name"),
	lastName: text("last_name"),
	phone: text("phone"),
	matricule: text("matricule"),
	serviceLocation: text("service_location"),
	region: text("region"),
	zone: text("zone"),
	role: userRole("role"),
	isActive: boolean("is_active"),
	isSuspended: boolean("is_suspended"),
	createdAt: timestamp("created_at", { mode: 'string' }),
	agentType: text("agent_type"),
});

export const protectedZones = pgTable("protected_zones", {
	id: serial("id").primaryKey().notNull(),
	name: text("name").notNull(),
	type: text("type").notNull(),
	createdAt: timestamp("created_at", { precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 3, mode: 'string' }).notNull(),
	surfaceHa: numeric("surface_ha", { precision: 15, scale:  6 }),
	perimetreM: numeric("perimetre_m", { precision: 15, scale:  3 }),
	centreGeometrique: geometry("centre_geometrique", { type: "point", srid: 32628 }),
	geom: geometry("geom", { type: "multipolygonz", srid: 32628 }),
	region: text("region"),
	geom4326: geometry("geom_4326", { type: "multipolygon", srid: 4326 }),
	bbox4326: geometry("bbox_4326", { type: "polygon", srid: 4326 }),
},
(table) => {
	return {
		idxProtectedZonesBbox4326: index("idx_protected_zones_bbox_4326").using("gist", table.bbox4326.asc().nullsLast()),
		idxProtectedZonesGeom: index("idx_protected_zones_geom").using("gist", table.geom.asc().nullsLast()),
		idxProtectedZonesGeom4326: index("idx_protected_zones_geom_4326").using("gist", table.geom4326.asc().nullsLast()),
		idxProtectedZonesName: index("idx_protected_zones_name").using("btree", table.name.asc().nullsLast()),
		idxProtectedZonesType: index("idx_protected_zones_type").using("btree", table.type.asc().nullsLast()),
		idxPzType: index("idx_pz_type").using("btree", table.type.asc().nullsLast()),
		centreGeometriqueIdx: index("protected_zones_centre_geometrique_idx").using("gist", table.centreGeometrique.asc().nullsLast()),
		geomIdx: index("protected_zones_geom_idx").using("gist", table.geom.asc().nullsLast()),
	}
});

export const regionCoordinates = pgTable("region_coordinates", {
	id: serial("id").primaryKey().notNull(),
	regionName: text("region_name").notNull(),
	regionCode: text("region_code"),
	coordinates: jsonb("coordinates").notNull(),
	status: text("status").default('unknown'),
	color: text("color").default('#6b7280'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		idxRegionCoordinatesRegionName: index("idx_region_coordinates_region_name").using("btree", table.regionName.asc().nullsLast()),
		regionCoordinatesRegionNameKey: unique("region_coordinates_region_name_key").on(table.regionName),
	}
});

export const codeInfractionDocuments = pgTable("code_infraction_documents", {
	id: bigserial("id", { mode: "bigint" }).primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	codeInfractionId: bigint("code_infraction_id", { mode: "number" }).notNull(),
	filename: text("filename").notNull(),
	mime: text("mime"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	size: bigint("size", { mode: "number" }),
	storagePath: text("storage_path").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		idxCodeDocsCodeId: index("idx_code_docs_code_id").using("btree", table.codeInfractionId.asc().nullsLast()),
		codeInfractionDocumentsCodeInfractionIdFkey: foreignKey({
			columns: [table.codeInfractionId],
			foreignColumns: [codeInfractions.id],
			name: "code_infraction_documents_code_infraction_id_fkey"
		}).onDelete("cascade"),
	}
});

export const codeInfractionItems = pgTable("code_infraction_items", {
	id: bigserial("id", { mode: "bigint" }).primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	codeInfractionId: bigint("code_infraction_id", { mode: "number" }).notNull(),
	nature: text("nature").notNull(),
	articleCode: text("article_code").notNull(),
	isDefault: boolean("is_default").default(false).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
},
(table) => {
	return {
		idxCodeItemsArticle: index("idx_code_items_article").using("gin", sql`to_tsvector('simple'::regconfig`),
		idxCodeItemsNature: index("idx_code_items_nature").using("gin", sql`to_tsvector('simple'::regconfig`),
		uxCodeItemsOneDefaultPerCode: uniqueIndex("ux_code_items_one_default_per_code").using("btree", table.codeInfractionId.asc().nullsLast()).where(sql`(is_default = true)`),
		uxCodeItemsUniqueTuple: uniqueIndex("ux_code_items_unique_tuple").using("btree", table.codeInfractionId.asc().nullsLast(), table.nature.asc().nullsLast(), table.articleCode.asc().nullsLast()),
		codeInfractionItemsCodeInfractionIdFkey: foreignKey({
			columns: [table.codeInfractionId],
			foreignColumns: [codeInfractions.id],
			name: "code_infraction_items_code_infraction_id_fkey"
		}).onDelete("cascade"),
	}
});

export const messageAttachmentBlobs = pgTable("message_attachment_blobs", {
	storageKey: text("storage_key").primaryKey().notNull(),
	// TODO: failed to parse database type 'bytea'
	data: unknown("data").notNull(),
	mimeType: text("mime_type"),
	sizeBytes: integer("size_bytes").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const codeItemUnitsConfig = pgTable("code_item_units_config", {
	itemId: integer("item_id").primaryKey().notNull(),
	mode: text("mode").notNull(),
	allowed: text("allowed").array(),
	fixed: text("fixed"),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
},
(table) => {
	return {
		codeItemUnitsConfigItemIdFkey: foreignKey({
			columns: [table.itemId],
			foreignColumns: [codeInfractionItems.id],
			name: "code_item_units_config_item_id_fkey"
		}).onDelete("cascade"),
	}
});

export const saisieItems = pgTable("saisie_items", {
	id: serial("id").primaryKey().notNull(),
	key: text("key").notNull(),
	label: text("label").notNull(),
	isActive: boolean("is_active").default(true),
	quantityEnabled: boolean("quantity_enabled").default(false),
	unitMode: text("unit_mode").default('none').notNull(),
	unitFixedKey: text("unit_fixed_key"),
	unitAllowed: text("unit_allowed").array(),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	groupKey: text("group_key"),
},
(table) => {
	return {
		saisieItemsGroupKeyFkey: foreignKey({
			columns: [table.groupKey],
			foreignColumns: [saisieGroups.key],
			name: "saisie_items_group_key_fkey"
		}).onUpdate("cascade").onDelete("set null"),
		saisieItemsKeyKey: unique("saisie_items_key_key").on(table.key),
	}
});

export const agentsRegionaux = pgTable("agents_regionaux", {
	userId: integer("user_id"),
	region: text("region"),
	isActive: boolean("is_active"),
	createdAt: timestamp("created_at", { mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
});

export const agentsSecteurs = pgTable("agents_secteurs", {
	userId: integer("user_id"),
	region: text("region"),
	secteur: text("secteur"),
	isActive: boolean("is_active"),
	createdAt: timestamp("created_at", { mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
});

export const clientMutations = pgTable("client_mutations", {
	id: serial("id").primaryKey().notNull(),
	deviceId: text("device_id").notNull(),
	mutationId: text("mutation_id").notNull(),
	entity: text("entity").notNull(),
	action: text("action").notNull(),
	userId: integer("user_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	appliedAt: timestamp("applied_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	result: jsonb("result"),
},
(table) => {
	return {
		deviceMutationUidx: uniqueIndex("client_mutations_device_mutation_uidx").using("btree", table.deviceId.asc().nullsLast(), table.mutationId.asc().nullsLast()),
	}
});

export const activeSessions = pgTable("active_sessions", {
	id: serial("id").primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	sessionToken: varchar("session_token", { length: 255 }).notNull(),
	ipAddress: varchar("ip_address", { length: 45 }),
	userAgent: text("user_agent"),
	deviceInfo: text("device_info"),
	lat: numeric("lat", { precision: 10, scale:  6 }),
	lon: numeric("lon", { precision: 10, scale:  6 }),
	domain: varchar("domain", { length: 50 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	lastActivity: timestamp("last_activity", { mode: 'string' }).defaultNow(),
	isActive: boolean("is_active").default(true),
	blockedReason: text("blocked_reason"),
},
(table) => {
	return {
		activeSessionsUserIdFkey: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "active_sessions_user_id_fkey"
		}).onDelete("cascade"),
		activeSessionsSessionTokenKey: unique("active_sessions_session_token_key").on(table.sessionToken),
	}
});