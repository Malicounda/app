import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as dotenv from "dotenv";
dotenv.config();

const queryClient = postgres(process.env.DATABASE_URL!);
const db = drizzle(queryClient);

async function main() {
  console.log("Testing connection to Supabase...");
  try {
    const result = await queryClient`SELECT version()`;
    console.log("Connected successfully!");
    console.log(result[0].version);
  } catch (err) {
    console.error("Connection failed:", err);
  } finally {
    await queryClient.end();
  }
}

main();
