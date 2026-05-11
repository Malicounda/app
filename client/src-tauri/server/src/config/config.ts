// Configuration de l'application
export const PORT = process.env.PORT || 3000;
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const JWT_SECRET = process.env.JWT_SECRET || 'votre_clé_secrète_par_défaut';

// Configuration de la base de données
export const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'aspchs',
};

// Configuration du stockage des fichiers
export const UPLOAD_CONFIG = {
  maxFileSize: 5 * 1024 * 1024, // 5MB
  allowedMimeTypes: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/jpg'
  ],
  uploadDir: process.env.UPLOAD_DIR || 'uploads/documents',
  tempDir: process.env.TEMP_DIR || 'uploads/temp',
};
