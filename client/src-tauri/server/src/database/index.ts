import { ConnectionOptions } from 'typeorm';
import config from '../config';

// Configuration de la connexion à la base de données
export const dbConnection: ConnectionOptions = {
  type: 'postgres',
  host: config.db.host,
  port: config.db.port,
  username: config.db.user,
  password: config.db.password,
  database: config.db.database,
  synchronize: process.env.NODE_ENV !== 'production',
  logging: process.env.NODE_ENV === 'development',
  entities: [
    __dirname + '/../entities/**/*.entity{.ts,.js}',
  ],
  migrations: [
    __dirname + '/../migrations/**/*{.ts,.js}',
  ],
  subscribers: [
    __dirname + '/../subscribers/**/*{.ts,.js}',
  ],
  cli: {
    entitiesDir: 'src/entities',
    migrationsDir: 'src/migrations',
    subscribersDir: 'src/subscribers',
  },
  ssl: config.db.ssl
    ? {
        rejectUnauthorized: false,
      }
    : false,
};

export default dbConnection;
