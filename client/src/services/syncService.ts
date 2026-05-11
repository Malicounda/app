// Service de synchronisation pour Android
import { getDatabaseConnection } from '../utils/database';

export interface SyncStatus {
  lastSync: string | null;
  isOnline: boolean;
  pendingChanges: number;
}

export class SyncService {
  private getApiBaseUrl() {
    return 'http://localhost:3000';
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    const token = localStorage.getItem('token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async checkConnection(): Promise<boolean> {
    try {
      // Tenter de se connecter au serveur principal
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.getApiBaseUrl()}/api/auth/me`, {
        method: 'GET',
        signal: controller.signal,
        headers: this.getAuthHeaders(),
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.log('Serveur non disponible, mode hors ligne');
      return false;
    }
  }

  private async flushOutbox(): Promise<{ ok: boolean; error?: string; sent?: number }> {
    const db = await getDatabaseConnection();

    const rows = (await db.select(
      `SELECT id, entity, action, payload
       FROM outbox
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT 50`
    )) as any[];

    if (!rows || rows.length === 0) return { ok: true, sent: 0 };

    const deviceId = localStorage.getItem('deviceId') || 'android-device';

    const items = rows.map((r) => ({
      mutationId: r.id,
      entity: r.entity,
      action: r.action,
      payload: (() => {
        try {
          return JSON.parse(r.payload);
        } catch {
          return r.payload;
        }
      })(),
    }));

    const res = await fetch(`${this.getApiBaseUrl()}/api/sync/batch`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ deviceId, items }),
    });

    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, error: txt || `HTTP ${res.status}` };
    }

    const json = (await res.json()) as any;
    const results: any[] = Array.isArray(json?.results) ? json.results : [];

    for (const r of results) {
      const mid = r?.mutationId;
      const ok = !!r?.ok;
      if (!mid) continue;

      if (ok) {
        await db.execute(`UPDATE outbox SET status = 'acked', last_error = NULL WHERE id = ?`, [mid]);
      } else {
        const err = String(r?.error || 'sync failed');
        await db.execute(
          `UPDATE outbox
           SET status = 'failed', last_error = ?, retry_count = retry_count + 1
           WHERE id = ?`,
          [err, mid]
        );
      }
    }

    return { ok: true, sent: rows.length };
  }

  async syncWithServer(): Promise<{ success: boolean; error?: string }> {
    try {
      const isOnline = await this.checkConnection();

      if (!isOnline) {
        return { success: false, error: 'Serveur non disponible' };
      }

      const flushed = await this.flushOutbox();
      if (!flushed.ok) {
        return { success: false, error: flushed.error || 'Erreur de synchronisation' };
      }

      // Mettre à jour le timestamp de synchronisation
      await this.updateLastSync();

      return { success: true };
    } catch (error) {
      console.error('Erreur de synchronisation:', error);
      return { success: false, error: 'Erreur de synchronisation' };
    }
  }

  async getSyncStatus(): Promise<SyncStatus> {
    const db = await getDatabaseConnection();
    const isOnline = await this.checkConnection();

    try {
      const lastSyncResult = await db.select('SELECT value FROM settings WHERE key = ?', ['last_sync']) as any[];
      const lastSync = lastSyncResult.length > 0 ? lastSyncResult[0].value : null;

      // Compter les changements en attente (outbox)
      const pendingResult = await db.select(`SELECT COUNT(*) as count FROM outbox WHERE status = 'pending'`) as any[];
      const pendingChanges = Number(pendingResult?.[0]?.count || 0);

      return {
        lastSync,
        isOnline,
        pendingChanges
      };
    } catch (error) {
      console.error('Erreur lors de la récupération du statut de synchronisation:', error);
      return {
        lastSync: null,
        isOnline: false,
        pendingChanges: 0
      };
    }
  }

  private async updateLastSync() {
    const db = await getDatabaseConnection();
    const now = new Date().toISOString();

    await db.execute(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      ['last_sync', now]
    );
  }

  async initSettings() {
    const db = await getDatabaseConnection();

    await db.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }
}
