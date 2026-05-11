CREATE TYPE "public"."message_type" AS ENUM('standard', 'urgent', 'information', 'notification');--> statement-breakpoint
CREATE TYPE "public"."permit_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."region" AS ENUM('dakar', 'thies', 'saint-louis', 'louga', 'fatick', 'kaolack', 'kaffrine', 'matam', 'tambacounda', 'kedougou', 'kolda', 'sedhiou', 'ziguinchor', 'diourbel');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'hunter', 'agent', 'sub-agent', 'hunting-guide');--> statement-breakpoint
CREATE TYPE "public"."weapon_type" AS ENUM('fusil', 'carabine', 'arbalete', 'arc', 'lance-pierre', 'autre');--> statement-breakpoint
CREATE TABLE "group_message_reads" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"is_read" boolean DEFAULT true NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"read_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"sender_id" integer NOT NULL,
	"target_role" text,
	"target_region" text,
	"subject" text,
	"content" text NOT NULL,
	"type" "message_type" DEFAULT 'standard' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" serial PRIMARY KEY NOT NULL,
	"last_name" text NOT NULL,
	"first_name" text NOT NULL,
	"id_number" text NOT NULL,
	"relationship" text NOT NULL,
	"phone" text,
	"address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "guardians_id_number_unique" UNIQUE("id_number")
);
--> statement-breakpoint
CREATE TABLE "guide_hunter_associations" (
	"id" serial PRIMARY KEY NOT NULL,
	"guide_id" integer NOT NULL,
	"hunter_id" integer NOT NULL,
	"associated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "history" (
	"id" serial PRIMARY KEY NOT NULL,
	"operation" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"details" text NOT NULL,
	"user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hunted_species" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"species_name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hunters" (
	"id" serial PRIMARY KEY NOT NULL,
	"last_name" text NOT NULL,
	"first_name" text NOT NULL,
	"date_of_birth" date NOT NULL,
	"id_number" text NOT NULL,
	"phone" text,
	"address" text NOT NULL,
	"experience" integer NOT NULL,
	"profession" text NOT NULL,
	"category" text NOT NULL,
	"pays" text,
	"nationality" text,
	"region" text,
	"zone" text,
	"weapon_type" "weapon_type",
	"weapon_brand" text,
	"weapon_reference" text,
	"weapon_caliber" text,
	"weapon_other_details" text,
	"is_minor" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hunters_id_number_unique" UNIQUE("id_number")
);
--> statement-breakpoint
CREATE TABLE "hunting_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"year" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hunting_guides" (
	"id" serial PRIMARY KEY NOT NULL,
	"last_name" text NOT NULL,
	"first_name" text NOT NULL,
	"phone" text NOT NULL,
	"zone" text NOT NULL,
	"region" text NOT NULL,
	"id_number" text NOT NULL,
	"photo" text,
	"user_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hunting_guides_id_number_unique" UNIQUE("id_number")
);
--> statement-breakpoint
CREATE TABLE "hunting_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"hunter_id" integer NOT NULL,
	"permit_id" integer NOT NULL,
	"report_date" date NOT NULL,
	"location" text NOT NULL,
	"latitude" numeric,
	"longitude" numeric,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"sender_id" integer NOT NULL,
	"recipient_id" integer NOT NULL,
	"subject" text,
	"content" text NOT NULL,
	"type" "message_type" DEFAULT 'standard' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"is_deleted_by_sender" boolean DEFAULT false NOT NULL,
	"parent_message_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permit_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"hunter_id" integer NOT NULL,
	"requested_type" text NOT NULL,
	"requested_category" text NOT NULL,
	"region" text,
	"status" "permit_request_status" DEFAULT 'pending' NOT NULL,
	"reason" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permits" (
	"id" serial PRIMARY KEY NOT NULL,
	"permit_number" text NOT NULL,
	"hunter_id" integer NOT NULL,
	"issue_date" date NOT NULL,
	"expiry_date" date NOT NULL,
	"status" text NOT NULL,
	"price" numeric NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"type" text,
	"category_id" text,
	"receipt_number" text,
	"area" text,
	"weapons" text,
	CONSTRAINT "permits_permit_number_unique" UNIQUE("permit_number")
);
--> statement-breakpoint
CREATE TABLE "taxes" (
	"id" serial PRIMARY KEY NOT NULL,
	"tax_number" text NOT NULL,
	"hunter_id" integer NOT NULL,
	"permit_id" integer,
	"amount" numeric NOT NULL,
	"issue_date" date NOT NULL,
	"animal_type" text NOT NULL,
	"quantity" integer NOT NULL,
	"location" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"external_hunter_name" text,
	"external_hunter_region" text,
	CONSTRAINT "taxes_tax_number_unique" UNIQUE("tax_number")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"phone" text,
	"matricule" text,
	"service_location" text,
	"region" text,
	"zone" text,
	"role" "user_role" DEFAULT 'hunter' NOT NULL,
	"hunter_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_suspended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
