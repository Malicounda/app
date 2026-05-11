/**
 * SCHÉMA DRIZZLE ORM STABLE ET CORRIGÉ
 * Version: 1.0.0 - Production Ready
 * Compatible avec drizzle-orm@0.39.3
 * 
 * Ce schéma reflète la structure réelle de la base de données
 * et corrige tous les problèmes de types TypeScript
 */

import { 
  pgTable, 
  text, 
  serial, 
  integer, 
  boolean, 
  date, 
  numeric, 
  timestamp, 
  pgEnum, 
  json, 
  doublePrecision
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// =====================================================
// ENUMS - Définitions des types énumérés
// =====================================================

export const userRoleEnum = pgEnum('user_role', [
  'admin', 
  'hunter', 
  'agent', 
  'sub-agent', 
  'hunting-guide'
]);

export const weaponTypeEnum = pgEnum('weapon_type', [
  'fusil', 
  'carabine', 
  'arbalete', 
  'arc', 
  'lance-pierre', 
  'autre'
]);

export const permitRequestStatusEnum = pgEnum('permit_request_status', [
  'pending', 
  'approved', 
  'rejected'
]);

export const messageTypeEnum = pgEnum('message_type', [
  'standard', 
  'urgent', 
  'information', 
  'notification'
]);

// =====================================================
// TABLES PRINCIPALES - Utilisateurs et Authentification
// =====================================================

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text("phone"),
  matricule: text("matricule").unique(),
  serviceLocation: text("service_location"),
  region: text("region"),
  departement: text("departement"),
  agentLat: numeric("agent_lat"),
  agentLon: numeric("agent_lon"),
  role: userRoleEnum("role").notNull().default('hunter'),
  hunterId: integer("hunter_id"),
  isActive: boolean("is_active").notNull().default(true),
  isSuspended: boolean("is_suspended").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLogin: timestamp("last_login"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const guardians = pgTable("guardians", {
  id: serial("id").primaryKey(),
  lastName: text("last_name").notNull(),
  firstName: text("first_name").notNull(),
  phone: text("phone"),
  address: text("address"),
  idCardNumber: text("id_card_number"),
  relationship: text("relationship").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// =====================================================
// TABLES CHASSEURS ET PERMIS
// =====================================================

export const hunters = pgTable("hunters", {
  id: serial("id").primaryKey(),
  lastName: text("last_name").notNull(),
  firstName: text("first_name").notNull(),
  dateOfBirth: date("date_of_birth"),
  placeOfBirth: text("place_of_birth"),
  nationality: text("nationality").default('Sénégalaise'),
  profession: text("profession"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  idCardNumber: text("id_card_number"),
  idCardExpiryDate: date("id_card_expiry_date"),
  region: text("region").notNull(),
  departement: text("departement"),
  commune: text("commune"),
  arrondissement: text("arrondissement"),
  category: text("category").notNull(),
  weaponType: weaponTypeEnum("weapon_type"),
  weaponBrand: text("weapon_brand"),
  weaponModel: text("weapon_model"),
  weaponCaliber: text("weapon_caliber"),
  weaponSerialNumber: text("weapon_serial_number"),
  weaponLicenseNumber: text("weapon_license_number"),
  weaponLicenseExpiryDate: date("weapon_license_expiry_date"),
  guardianId: integer("guardian_id"),
  isMinor: boolean("is_minor").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const permits = pgTable("permits", {
  id: serial("id").primaryKey(),
  permitNumber: text("permit_number").notNull().unique(),
  hunterId: integer("hunter_id").notNull(),
  categoryId: text("category_id"),
  issueDate: date("issue_date").notNull(),
  expiryDate: date("expiry_date").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default('active'),
  region: text("region"),
  departement: text("departement"),
  commune: text("commune"),
  arrondissement: text("arrondissement"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
  metadata: json("metadata"),
});

export const permitRequests = pgTable("permit_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  hunterId: integer("hunter_id").notNull(),
  categoryId: text("category_id").notNull(),
  requestDate: timestamp("request_date").defaultNow().notNull(),
  status: permitRequestStatusEnum("status").notNull().default('pending'),
  reviewedBy: integer("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// =====================================================
// TABLES TAXES ET ESPÈCES
// =====================================================

export const taxes = pgTable("taxes", {
  id: serial("id").primaryKey(),
  taxNumber: text("tax_number").notNull().unique(),
  hunterId: integer("hunter_id").notNull(),
  animalType: text("animal_type").notNull(),
  quantity: integer("quantity").notNull().default(1),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  issueDate: date("issue_date").notNull(),
  region: text("region"),
  departement: text("departement"),
  commune: text("commune"),
  arrondissement: text("arrondissement"),
  externalHunterName: text("external_hunter_name"),
  externalHunterRegion: text("external_hunter_region"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  permitId: integer("permit_id"),
  permitDeletedAt: timestamp("permit_deleted_at"),
});

export const taxeEspeces = pgTable("taxe_especes", {
  id: serial("id").primaryKey(),
  speciesId: text("species_id").notNull().unique(),
  name: text("name").notNull(),
  scientificName: text("scientific_name"),
  category: text("category").notNull(),
  basePrice: numeric("base_price", { precision: 10, scale: 2 }).notNull(),
  touristPrice: numeric("tourist_price", { precision: 10, scale: 2 }),
  residentPrice: numeric("resident_price", { precision: 10, scale: 2 }),
  season: text("season"),
  quotaLimit: integer("quota_limit"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// =====================================================
// TABLES RAPPORTS ET DÉCLARATIONS
// =====================================================

export const huntingReports = pgTable("hunting_reports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  hunterId: integer("hunter_id").notNull(),
  reportDate: date("report_date").notNull(),
  location: text("location").notNull(),
  region: text("region"),
  departement: text("departement"),
  commune: text("commune"),
  arrondissement: text("arrondissement"),
  coordinates: text("coordinates"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const huntedSpecies = pgTable("hunted_species", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull(),
  speciesName: text("species_name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  weight: numeric("weight", { precision: 8, scale: 2 }),
  sex: text("sex"),
  age: text("age"),
  huntingMethod: text("hunting_method"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// =====================================================
// TABLES HISTORIQUE ET AUDIT
// =====================================================

export const history = pgTable("history", {
  id: serial("id").primaryKey(),
  operation: text("operation").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  oldValues: json("old_values"),
  newValues: json("new_values"),
  details: text("details"),
  userId: integer("user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// =====================================================
// TABLES GUIDES ET ASSOCIATIONS
// =====================================================

export const huntingGuides = pgTable("hunting_guides", {
  id: serial("id").primaryKey(),
  lastName: text("last_name").notNull(),
  firstName: text("first_name").notNull(),
  phone: text("phone"),
  email: text("email"),
  licenseNumber: text("license_number").unique(),
  region: text("region"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const guideHunterAssociations = pgTable("guide_hunter_associations", {
  id: serial("id").primaryKey(),
  guideId: integer("guide_id").notNull(),
  hunterId: integer("hunter_id").notNull(),
  associationDate: date("association_date").notNull(),
  endDate: date("end_date"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// =====================================================
// TABLES MESSAGERIE ET ALERTES
// =====================================================

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull(),
  recipientId: integer("recipient_id").notNull(),
  subject: text("subject"),
  content: text("content").notNull(),
  messageType: messageTypeEnum("message_type").notNull().default('standard'),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const groupMessages = pgTable("group_messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull(),
  targetRole: text("target_role"),
  targetRegion: text("target_region"),
  subject: text("subject"),
  content: text("content").notNull(),
  messageType: messageTypeEnum("message_type").notNull().default('standard'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const groupMessageReads = pgTable("group_message_reads", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull(),
  userId: integer("user_id").notNull(),
  readAt: timestamp("read_at").defaultNow().notNull(),
});

export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  title: text("title"),
  message: text("message"),
  nature: text("nature"),
  region: text("region"),
  departement: text("departement"),
  lat: doublePrecision("lat"),
  lon: doublePrecision("lon"),
  senderId: integer("sender_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  alertId: integer("alert_id"),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// =====================================================
// TABLES CONFIGURATION ET PARAMÈTRES
// =====================================================

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const huntingCampaigns = pgTable("hunting_campaigns", {
  id: serial("id").primaryKey(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// =====================================================
// TABLES INFRACTIONS (NOUVELLES)
// =====================================================

export const codeInfractions = pgTable("code_infractions", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  nature: text("nature").notNull(),
  description: text("description"),
  articleCode: text("article_code"),
  codeCollectivite: text("code_collectivite"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const agentsVerbalisateurs = pgTable("agents_verbalisateurs", {
  id: serial("id").primaryKey(),
  nom: text("nom").notNull(),
  prenom: text("prenom").notNull(),
  matricule: text("matricule").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const contrevenants = pgTable("contrevenants", {
  id: serial("id").primaryKey(),
  nom: text("nom").notNull(),
  prenom: text("prenom"),
  filiation: text("filiation"),
  photo: text("photo"),
  pieceIdentite: text("piece_identite"),
  numeroPiece: text("numero_piece"),
  typePiece: text("type_piece"),
  signature: text("signature"), // Base64 encoded binary data
  donneesBiometriques: text("donnees_biometriques"),
  dateCreation: timestamp("date_creation").defaultNow().notNull(),
});

export const lieux = pgTable("lieux", {
  id: serial("id").primaryKey(),
  region: text("region"),
  departement: text("departement"),
  commune: text("commune"),
  arrondissement: text("arrondissement"),
  latitude: numeric("latitude", { precision: 9, scale: 6 }),
  longitude: numeric("longitude", { precision: 9, scale: 6 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const infractions = pgTable("infractions", {
  id: serial("id").primaryKey(),
  codeInfractionId: integer("code_infraction_id").notNull(),
  lieuId: integer("lieu_id"),
  dateInfraction: timestamp("date_infraction").defaultNow().notNull(),
  agentId: integer("agent_id"),
  montantChiffre: numeric("montant_chiffre", { precision: 12, scale: 2 }),
  montantLettre: text("montant_lettre"),
  numeroQuittance: text("numero_quittance"),
  photoQuittance: text("photo_quittance"),
  photoInfraction: text("photo_infraction"),
  autresPieces: json("autres_pieces"),
  observations: text("observations"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const contrevenantsInfractions = pgTable("contrevenants_infractions", {
  id: serial("id").primaryKey(),
  contrevenantId: integer("contrevenant_id").notNull(),
  infractionId: integer("infraction_id").notNull(),
  role: text("role"),
  dateImplication: timestamp("date_implication").defaultNow().notNull(),
});

export const procesVerbaux = pgTable("proces_verbaux", {
  id: serial("id").primaryKey(),
  infractionId: integer("infraction_id").notNull(),
  dateGeneration: timestamp("date_generation").defaultNow().notNull(),
  fichierPv: text("fichier_pv"),
  numeroPv: text("numero_pv").unique(),
  pieceJointe: text("piece_jointe"),
  nomPieceJointe: text("nom_piece_jointe"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// =====================================================
// TYPES TYPESCRIPT INFÉRÉS
// =====================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Hunter = typeof hunters.$inferSelect;
export type NewHunter = typeof hunters.$inferInsert;

export type Permit = typeof permits.$inferSelect;
export type NewPermit = typeof permits.$inferInsert;

export type Tax = typeof taxes.$inferSelect;
export type NewTax = typeof taxes.$inferInsert;

export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;

export type History = typeof history.$inferSelect;
export type NewHistory = typeof history.$inferInsert;

export type Infraction = typeof infractions.$inferSelect;
export type NewInfraction = typeof infractions.$inferInsert;

// =====================================================
// SCHÉMAS DE VALIDATION ZOD
// =====================================================

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  isActive: true,
  isSuspended: true,
  createdAt: true,
  lastLogin: true,
  updatedAt: true,
});

export const insertHunterSchema = createInsertSchema(hunters).omit({
  id: true,
  createdAt: true,
});

export const insertPermitSchema = createInsertSchema(permits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTaxSchema = createInsertSchema(taxes).omit({
  id: true,
  createdAt: true,
});

// =====================================================
// EXPORT FINAL - TOUTES LES TABLES
// =====================================================

export const allTables = {
  users,
  guardians,
  hunters,
  permits,
  permitRequests,
  taxes,
  taxeEspeces,
  huntingReports,
  huntedSpecies,
  history,
  huntingGuides,
  guideHunterAssociations,
  messages,
  groupMessages,
  groupMessageReads,
  alerts,
  notifications,
  settings,
  huntingCampaigns,
  codeInfractions,
  agentsVerbalisateurs,
  contrevenants,
  lieux,
  infractions,
  contrevenantsInfractions,
  procesVerbaux,
};

export default allTables;
