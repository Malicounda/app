import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';
import config from '../config';

// Créer le répertoire de logs s'il n'existe pas
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Définir les niveaux de log
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Définir les couleurs pour les logs dans la console
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

// Lier les couleurs aux niveaux de log
winston.addColors(colors);

// Définir le format des logs
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Définir les transports (sorties des logs)
const transports = [
  // Afficher les logs dans la console
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }),
  
  // Enregistrer tous les logs dans un fichier
  new winston.transports.DailyRotateFile({
    filename: path.join(logDir, 'all-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
    format: winston.format.combine(
      winston.format.uncolorize(),
      winston.format.json()
    ),
  }),
  
  // Enregistrer les erreurs dans un fichier séparé
  new winston.transports.DailyRotateFile({
    level: 'error',
    filename: path.join(logDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '30d',
    format: winston.format.combine(
      winston.format.uncolorize(),
      winston.format.json()
    ),
  }),
];

// Créer l'instance du logger
const logger = winston.createLogger({
  level: 'debug', // Niveau de log par défaut
  levels,
  format,
  transports,
});

// Créer un stream pour Morgan (middleware de logging HTTP)
export const stream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

export default logger;
