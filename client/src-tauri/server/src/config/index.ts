import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Charger les variables d'environnement
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Schéma de validation pour les variables d'environnement
const envSchema = z.object({
  // Configuration du serveur
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('*'),
  
  // Configuration de la base de données
  DB_CLIENT: z.string().default('postgresql'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.string().transform(Number).default('5432'),
  DB_USER: z.string().min(1, 'DB_USER is required'),
  DB_PASSWORD: z.string().min(1, 'DB_PASSWORD is required'),
  DB_DATABASE: z.string().min(1, 'DB_DATABASE is required'),
  DB_SSL: z.string().transform(str => str === 'true'),
  
  // Configuration de l'authentification
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  REFRESH_TOKEN_SECRET: z.string().min(32, 'REFRESH_TOKEN_SECRET must be at least 32 characters'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  
  // Configuration des logs
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('debug'),
  LOG_TO_FILE: z.string().transform(str => str === 'true'),
  LOG_FILE_PATH: z.string().default('logs/app.log'),
  
  // Configuration du taux limite
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),
});

// Valider les variables d'environnement
const validatedEnv = envSchema.parse(process.env);

// Configuration de base
const config = {
  // Configuration du serveur
  nodeEnv: validatedEnv.NODE_ENV,
  port: validatedEnv.PORT,
  host: validatedEnv.HOST,
  corsOrigin: validatedEnv.CORS_ORIGIN,
  
  // Configuration de la base de données
  db: {
    client: validatedEnv.DB_CLIENT,
    host: validatedEnv.DB_HOST,
    port: validatedEnv.DB_PORT,
    user: validatedEnv.DB_USER,
    password: validatedEnv.DB_PASSWORD,
    database: validatedEnv.DB_DATABASE,
    ssl: validatedEnv.DB_SSL,
    pool: {
      min: 2,
      max: 10,
    },
  },
  
  // Configuration de l'authentification
  auth: {
    jwtSecret: validatedEnv.JWT_SECRET,
    jwtExpiresIn: validatedEnv.JWT_EXPIRES_IN,
    refreshTokenSecret: validatedEnv.REFRESH_TOKEN_SECRET,
    refreshTokenExpiresIn: validatedEnv.REFRESH_TOKEN_EXPIRES_IN,
  },
  
  // Configuration des logs
  logs: {
    level: validatedEnv.LOG_LEVEL,
    toFile: validatedEnv.LOG_TO_FILE,
    filePath: validatedEnv.LOG_FILE_PATH,
  },
  
  // Configuration du taux limite
  rateLimit: {
    windowMs: validatedEnv.RATE_LIMIT_WINDOW_MS,
    maxRequests: validatedEnv.RATE_LIMIT_MAX_REQUESTS,
  },
  
  // Configuration du stockage
  storage: {
    provider: process.env.STORAGE_PROVIDER || 'local',
    local: {
      path: process.env.STORAGE_PATH || 'uploads',
    },
    // Ajouter d'autres fournisseurs de stockage (S3, etc.) ici
  },
  
  // Configuration des e-mails (optionnel)
  email: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || 'noreply@example.com',
    secure: process.env.SMTP_SECURE === 'true',
  },
} as const;

export type Config = typeof config;
export default config;
