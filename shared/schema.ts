import { boolean, customType, date, doublePrecision, integer, json, numeric, pgEnum, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Type personnalisé pour BYTEA
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

// Type personnalisé pour les géométries PostGIS
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
