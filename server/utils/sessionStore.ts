import session from 'express-session';
import { pg } from '../db.js';

export class CustomPGStore extends session.Store {
  constructor() {
    super();
    // Créer la table des sessions si elle n'existe pas
    this.initTable().catch(err => {
      console.error('[SessionStore] Erreur lors de l\'initialisation de la table:', err);
    });
  }

  private async initTable() {
    await pg.query(`
      CREATE TABLE IF NOT EXISTS session (
        sid varchar NOT NULL COLLATE "default",
        sess json NOT NULL,
        expire timestamp(6) NOT NULL,
        CONSTRAINT session_pkey PRIMARY KEY (sid)
      );
    `);
    await pg.query(`
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session (expire);
    `);
    console.log('✅ Table de sessions initialisée avec succès');
  }

  async get(sid: string, callback: (err: any, session?: session.SessionData | null) => void): Promise<void> {
    try {
      const res = await pg.query(
        'SELECT sess FROM session WHERE sid = $1 AND expire > CURRENT_TIMESTAMP',
        [sid]
      );
      if (res.rows.length === 0) {
        return callback(null, null);
      }
      const sess = typeof res.rows[0].sess === 'string'
        ? JSON.parse(res.rows[0].sess)
        : res.rows[0].sess;
      callback(null, sess);
    } catch (err) {
      console.error('[SessionStore] get error:', err);
      callback(err);
    }
  }

  async set(sid: string, sessionData: session.SessionData, callback?: (err?: any) => void): Promise<void> {
    try {
      const expire = sessionData.cookie?.expires
        ? new Date(sessionData.cookie.expires)
        : new Date(Date.now() + 86400 * 1000);

      const sessJson = JSON.stringify(sessionData);

      await pg.query(
        `INSERT INTO session (sid, sess, expire)
         VALUES ($1, $2, $3)
         ON CONFLICT (sid)
         DO UPDATE SET sess = $2, expire = $3`,
        [sid, sessJson, expire.toISOString()]
      );
      if (callback) callback(null);
    } catch (err) {
      console.error('[SessionStore] set error:', err);
      if (callback) callback(err);
    }
  }

  async destroy(sid: string, callback?: (err?: any) => void): Promise<void> {
    try {
      await pg.query('DELETE FROM session WHERE sid = $1', [sid]);
      if (callback) callback(null);
    } catch (err) {
      console.error('[SessionStore] destroy error:', err);
      if (callback) callback(err);
    }
  }

  async touch(sid: string, sessionData: session.SessionData, callback?: (err?: any) => void): Promise<void> {
    try {
      const expire = sessionData.cookie?.expires
        ? new Date(sessionData.cookie.expires)
        : new Date(Date.now() + 86400 * 1000);

      await pg.query('UPDATE session SET expire = $1 WHERE sid = $2', [expire.toISOString(), sid]);
      if (callback) callback(null);
    } catch (err) {
      console.error('[SessionStore] touch error:', err);
      if (callback) callback(err);
    }
  }
}
