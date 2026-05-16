import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import * as dotenv from "dotenv";
import { eq } from "drizzle-orm";
import * as schema from "../shared/schema.js";

// Charger .env racine
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL non définie dans .env");
  process.exit(1);
}

const queryClient = postgres(DATABASE_URL);
const db = drizzle(queryClient, { schema });

async function createAdmin() {
  console.log("🔌 Connexion à Supabase...");

  try {
    // Vérifier la connexion
    const version = await queryClient`SELECT version()`;
    console.log("✅ Connecté à:", version[0].version.split(",")[0]);

    // Vérifier si un admin existe déjà
    const existing = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, "admin"))
      .limit(1);

    if (existing.length > 0) {
      console.log("ℹ️  L'utilisateur 'admin' existe déjà (id:", existing[0].id, ")");
      await queryClient.end();
      return;
    }

    // Hasher le mot de passe
    const password = "Admin@2026";
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insérer l'admin
    const result = await db
      .insert(schema.users)
      .values({
        username: "admin",
        email: "admin@scodip.sn",
        password: hashedPassword,
        firstName: "Super",
        lastName: "Admin",
        role: "admin",
        isActive: true,
      } as any)
      .returning();

    console.log("✅ Compte admin créé avec succès !");
    console.log("   📧 Username: admin");
    console.log("   🔑 Mot de passe: Admin@2026");
    console.log("   🆔 ID:", result[0]?.id);
    console.log("");
    console.log("⚠️  CHANGEZ CE MOT DE PASSE après la première connexion !");
  } catch (err) {
    console.error("❌ Erreur:", err);
  } finally {
    await queryClient.end();
  }
}

createAdmin();
