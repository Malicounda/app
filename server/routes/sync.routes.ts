import { sql } from 'drizzle-orm';
import { Router } from 'express';
import { createAlert } from '../controllers/alerts.controller.js';
import { createHuntingReport } from '../controllers/huntingReports.controller.js';
import { db } from '../db.js';
import { storage } from '../storage.js';
import { isAuthenticated } from './middlewares/auth.middleware.js';

type SyncItem = {
  mutationId: string;
  entity: 'alert' | 'message' | 'hunting_report' | 'declaration_especes';
  action: 'create' | 'update' | 'delete';
  payload: any;
};

function asNonEmptyString(v: any): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s : null;
}

function decodeBase64ToBuffer(base64: string): Buffer {
  return Buffer.from(base64, 'base64');
}

async function getExistingMutationResult(deviceId: string, mutationId: string) {
  const rows: any[] = await db.execute(sql`
    SELECT id, result
    FROM client_mutations
    WHERE device_id = ${deviceId} AND mutation_id = ${mutationId}
    LIMIT 1
  ` as any);

  const row = Array.isArray(rows) ? rows[0] : (rows as any)[0];
  if (!row) return null;

  let parsed: any = row.result ?? null;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = row.result;
    }
  }
  return { id: row.id, result: parsed };
}

async function insertMutationResult(args: {
  deviceId: string;
  mutationId: string;
  entity: string;
  action: string;
  userId: number | null;
  result: any;
}) {
  await db.execute(sql`
    INSERT INTO client_mutations (device_id, mutation_id, entity, action, user_id, result)
    VALUES (
      ${args.deviceId},
      ${args.mutationId},
      ${args.entity},
      ${args.action},
      ${args.userId},
      ${JSON.stringify(args.result)}
    )
    ON CONFLICT (device_id, mutation_id)
    DO NOTHING
  ` as any);
}

function createMockResponseCapture() {
  const capture: { statusCode: number; body: any; headers: Record<string, any> } = {
    statusCode: 200,
    body: undefined,
    headers: {},
  };

  const res: any = {
    status(code: number) {
      capture.statusCode = code;
      return res;
    },
    json(payload: any) {
      capture.body = payload;
      return res;
    },
    send(payload: any) {
      capture.body = payload;
      return res;
    },
    end(payload?: any) {
      capture.body = payload;
      return res;
    },
    setHeader(key: string, value: any) {
      capture.headers[key.toLowerCase()] = value;
    },
  };

  return { res, capture };
}

async function applyAlertCreate(reqUser: any, payload: any) {
  const req: any = {
    body: payload,
    user: reqUser,
  };
  const { res, capture } = createMockResponseCapture();
  await createAlert(req as any, res as any, () => {});
  return capture;
}

async function applyMessageCreate(reqUser: any, payload: any) {
  const senderId = reqUser?.id;
  if (!senderId) return { statusCode: 401, body: { message: 'Non authentifié' }, headers: {} };

  const contentRaw = payload?.content ?? payload?.body ?? payload?.message;
  const content = typeof contentRaw === 'string' ? contentRaw.trim() : '';
  if (!content) return { statusCode: 400, body: { message: 'Le contenu du message est requis.' }, headers: {} };

  const subject = payload?.subject ?? undefined;

  const recipientIds: number[] = [];
  const recipientIdentifier = payload?.recipient ?? payload?.recipientIdentifier;
  const recipientIdsValue = payload?.recipientIds;
  const fallbackRecipientId = payload?.recipientId;

  if (recipientIdentifier && typeof recipientIdentifier === 'string') {
    const resolved = await storage.findUserByIdentifier(recipientIdentifier);
    if (!resolved) return { statusCode: 404, body: { message: 'Destinataire introuvable' }, headers: {} };
    recipientIds.push(resolved.id);
  }

  if (recipientIds.length === 0) {
    if (Array.isArray(recipientIdsValue)) {
      for (const v of recipientIdsValue) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) recipientIds.push(n);
      }
    } else if (typeof recipientIdsValue === 'string') {
      try {
        const parsed = JSON.parse(recipientIdsValue);
        if (Array.isArray(parsed)) {
          for (const v of parsed) {
            const n = Number(v);
            if (Number.isFinite(n) && n > 0) recipientIds.push(n);
          }
        }
      } catch {}
    }
  }

  if (recipientIds.length === 0 && fallbackRecipientId !== undefined) {
    const n = Number(fallbackRecipientId);
    if (Number.isFinite(n) && n > 0) recipientIds.push(n);
  }

  if (!recipientIds.length) return { statusCode: 400, body: { message: 'Aucun destinataire valide fourni.' }, headers: {} };

  const created: any[] = [];
  for (const rid of recipientIds) {
    const m = await storage.createMessage({
      senderId,
      recipientId: rid,
      subject,
      content,
      // Offline sync: attachment support via base64 is not persisted to disk here.
    } as any);
    created.push({ ...m, isGroupMessage: false });
  }

  return { statusCode: 201, body: created, headers: {} };
}

async function applyHuntingReportCreate(reqUser: any, payload: any) {
  const photoBase64 = asNonEmptyString(payload?.photoBase64 ?? payload?.photo_data_base64);
  const photoMime = asNonEmptyString(payload?.photoMime ?? payload?.photo_mime) ?? 'image/jpeg';
  const photoName = asNonEmptyString(payload?.photoName ?? payload?.photo_name) ?? 'photo.jpg';

  const req: any = {
    body: payload,
    user: reqUser,
    file: photoBase64
      ? {
          buffer: decodeBase64ToBuffer(photoBase64),
          mimetype: photoMime,
          originalname: photoName,
        }
      : undefined,
  };

  const { res, capture } = createMockResponseCapture();
  await createHuntingReport(req as any, res as any);
  return capture;
}

const router = Router();

router.post('/batch', isAuthenticated, async (req, res) => {
  const deviceId = asNonEmptyString(req.body?.deviceId);
  const items = req.body?.items as SyncItem[];

  if (!deviceId) return res.status(400).json({ error: 'deviceId manquant' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items manquant' });

  const user = (req as any)?.user;
  const userId = user?.id ? Number(user.id) : null;

  const results: any[] = [];

  for (const item of items) {
    const mutationId = asNonEmptyString(item?.mutationId);
    const entity = item?.entity;
    const action = item?.action;
    const payload = item?.payload;

    if (!mutationId) {
      results.push({ mutationId: item?.mutationId ?? null, ok: false, error: 'mutationId manquant' });
      continue;
    }

    if (action !== 'create') {
      results.push({ mutationId, ok: false, error: `action non supportée: ${action}` });
      continue;
    }

    if ((entity as string) === 'infraction') {
      results.push({
        mutationId,
        ok: false,
        error: 'infraction sync disabled',
      });
      continue;
    }

    try {
      const existing = await getExistingMutationResult(deviceId, mutationId);
      if (existing) {
        results.push({ mutationId, ok: true, statusCode: 200, data: existing.result, duplicate: true });
        continue;
      }
    } catch (e: any) {
      results.push({ mutationId, ok: false, error: e?.message ?? String(e) });
      continue;
    }

    try {
      let capture:
        | { statusCode: number; body: any; headers: Record<string, any> }
        | undefined;

      if (entity === 'alert') capture = await applyAlertCreate(user, payload);
      else if (entity === 'message') capture = await applyMessageCreate(user, payload);
      else if (entity === 'hunting_report') capture = await applyHuntingReportCreate(user, payload);
      else if (entity === 'declaration_especes') capture = await applyHuntingReportCreate(user, payload);
      else {
        results.push({ mutationId, ok: false, error: `entity non supportée: ${entity}` });
        continue;
      }

      const ok = capture.statusCode >= 200 && capture.statusCode < 300;

      const resultPayload = { statusCode: capture.statusCode, data: capture.body };
      if (ok) {
        try {
          await insertMutationResult({
            deviceId,
            mutationId,
            entity: String(entity),
            action: String(action),
            userId,
            result: resultPayload,
          });
        } catch (e) {
          // Idempotence insert failure should not break successful application
          console.warn('[sync/batch] failed to persist mutation result:', e);
        }
      }

      results.push({ mutationId, ok, statusCode: capture.statusCode, data: capture.body });
    } catch (e: any) {
      results.push({ mutationId, ok: false, error: e?.message ?? String(e) });
    }
  }

  return res.json({ results });
});

export default router;
