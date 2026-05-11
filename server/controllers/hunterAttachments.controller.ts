import { Request, Response } from 'express';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';

type DocBaseName =
  | 'id_card'
  | 'weapon_permit'
  | 'hunter_photo'
  | 'treasury_stamp'
  | 'weapon_receipt'
  | 'insurance'
  | 'moral_certificate';

function toBaseName(documentType: string): DocBaseName | null {
  const t = String(documentType);
  const mapping: Record<string, DocBaseName> = {
    id_card_document: 'id_card',
    idCardDocument: 'id_card',
    weapon_permit: 'weapon_permit',
    weaponPermit: 'weapon_permit',
    hunter_photo: 'hunter_photo',
    hunterPhoto: 'hunter_photo',
    treasury_stamp: 'treasury_stamp',
    treasuryStamp: 'treasury_stamp',
    weapon_receipt: 'weapon_receipt',
    weaponReceipt: 'weapon_receipt',
    insurance: 'insurance',
    moral_certificate: 'moral_certificate',
    moralCertificate: 'moral_certificate',
  };
  return mapping[t] ?? null;
}

export const uploadAttachment = async (req: Request, res: Response) => {
  try {
    const { hunterId } = req.params;
    const { documentType, issueDate: issueDateRaw, expiryDate: expiryDateRaw } = req.body as { documentType?: string; issueDate?: string; expiryDate?: string };
    const file = (req as any).file as Express.Multer.File | undefined;

    if (!file) {
      return res.status(400).json({ message: 'Aucun fichier fourni' });
    }
    const base = toBaseName(documentType || '');
    if (!base) {
      return res.status(400).json({ message: 'Type de document invalide' });
    }
    const hunterIdNum = Number(hunterId);
    if (!Number.isInteger(hunterIdNum) || hunterIdNum <= 0) {
      return res.status(400).json({ message: 'ID du chasseur invalide' });
    }
    console.debug('[attachments] uploadAttachment params', {
      hunterId,
      hunterIdNum,
      documentType,
      base,
      issueDateRaw,
      expiryDateRaw,
      file: file ? { size: file.size, mimetype: file.mimetype, originalname: file.originalname } : null,
    });
    const data: any = {
      [`${base}_data`]: file.buffer ?? undefined,
      [`${base}_mime`]: file.mimetype,
      [`${base}_name`]: file.originalname,
    };

    // (Optionnel) checksum désactivé pour éviter des colonnes manquantes

    // Helper format date YYYY-MM-DD
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    // Documents avec date d'expiration OBLIGATOIRE
    const requireExpiry: DocBaseName[] = ['id_card', 'weapon_permit', 'insurance', 'weapon_receipt'];

    // Gestion des dates pour le Timbre Impôt: expiration annuelle
    if (base === 'treasury_stamp') {
      // issueDate: fourni ou aujourd'hui
      const now = new Date();
      const issueDate = issueDateRaw ? new Date(issueDateRaw) : now;
      const computedIssue = fmt(issueDate);

      // expiryDate: fourni ou issue + 1 an
      let expiry: Date;
      if (expiryDateRaw) {
        expiry = new Date(expiryDateRaw);
      } else {
        expiry = new Date(issueDate);
        expiry.setFullYear(expiry.getFullYear() + 1);
      }
      const computedExpiry = fmt(expiry);

      // Colonnes dédiées
      (data as any)[`treasury_stamp_issue_date`] = computedIssue;
      (data as any)[`treasury_stamp_expiry_date`] = computedExpiry;
      console.debug('[attachments] treasury_stamp dates', { computedIssue, computedExpiry });
    }

    // Dates pour les autres documents avec expiration obligatoire
    if (requireExpiry.includes(base)) {
      // La date d'expiration est obligatoire pour ces documents
      if (!expiryDateRaw) {
        return res.status(400).json({ message: "La date d'expiration est obligatoire pour ce document" });
      }
      const issueDate = issueDateRaw ? new Date(issueDateRaw) : new Date();
      const expiryDate = new Date(expiryDateRaw);
      if (Number.isNaN(expiryDate.getTime())) {
        return res.status(400).json({ message: "Format de date d'expiration invalide" });
      }
      (data as any)[`${base}_issue_date`] = fmt(issueDate);
      (data as any)[`${base}_expiry_date`] = fmt(expiryDate);
      console.debug('[attachments] required expiry stored', { base, issue: (data as any)[`${base}_issue_date`], expiry: (data as any)[`${base}_expiry_date`] });
    }

    // Upsert via SQL (ON CONFLICT sur hunter_id)
    const keys = Object.keys(data);
    const colList = sql.raw(['"hunter_id"', ...keys.map(k => '"' + k + '"')].join(', '));
    const valList = sql.join(keys.map(k => sql`${data[k]}`), sql`, `);
    const assignList = sql.raw(keys.map(k => `"${k}" = EXCLUDED."${k}"`).join(', '));

    const query = sql`
      INSERT INTO hunter_attachments (${colList})
      VALUES (${hunterIdNum}, ${valList})
      ON CONFLICT (hunter_id) DO UPDATE SET ${assignList}, updated_at = NOW()
      RETURNING *
    `;

    const result = await db.execute(query as any);
    const attachment = Array.isArray(result) ? result[0] : (result as any)[0];
    console.debug('[attachments] uploadAttachment upsert result keys', attachment ? Object.keys(attachment) : null);

    return res.status(201).json({ message: 'Pièce jointe enregistrée', attachment });
  } catch (error) {
    console.error('Error uploading attachment:', error);
    return res.status(500).json({ message: "Erreur lors de l'upload de la pièce jointe" });
  }
};

export const downloadAttachment = async (req: Request, res: Response) => {
  try {
    const { hunterId, documentType } = req.params as { hunterId: string; documentType: string };
    const base = toBaseName(documentType);
    if (!base) {
      return res.status(400).json({ message: 'Type de document invalide' });
    }
    const hunterIdNum = Number(hunterId);
    if (!Number.isInteger(hunterIdNum) || hunterIdNum <= 0) {
      return res.status(400).json({ message: 'ID du chasseur invalide' });
    }
    const recordQuery = sql`SELECT ${sql.raw('"' + base + '_data"')}, ${sql.raw('"' + base + '_mime"')}, ${sql.raw('"' + base + '_name"')} FROM hunter_attachments WHERE hunter_id = ${hunterIdNum} LIMIT 1`;
    const list = await db.execute(recordQuery as any);
    const record: any = Array.isArray(list) ? list[0] : (list as any)[0];
    console.debug('[attachments] downloadAttachment fetched', {
      hunterIdNum,
      base,
      hasData: Boolean(record && record[`${base}_data`]),
      keys: record ? Object.keys(record) : null,
    });

    if (!record || !record[`${base}_data`]) {
      return res.status(404).json({ message: 'Pièce jointe introuvable' });
    }

    const inline = String(req.query.inline ?? '').toLowerCase();
    if (record[`${base}_mime`]) {
      res.setHeader('Content-Type', String(record[`${base}_mime`]));
    }
    const safeName = String(record[`${base}_name`] ?? 'document');
    const disposition = (inline === '1' || inline === 'true') ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`);
    return res.end(record[`${base}_data`] as Buffer);
  } catch (error) {
    console.error('Error downloading attachment:', error);
    return res.status(500).json({ message: 'Erreur lors du téléchargement de la pièce jointe' });
  }
};

export const deleteAttachment = async (req: Request, res: Response) => {
  try {
    const { hunterId, documentType } = req.params as { hunterId: string; documentType: string };
    const base = toBaseName(documentType);
    if (!base) {
      return res.status(400).json({ message: 'Type de document invalide' });
    }
    const hunterIdNum = Number(hunterId);
    if (!Number.isInteger(hunterIdNum) || hunterIdNum <= 0) {
      return res.status(400).json({ message: 'ID du chasseur invalide' });
    }
    console.debug('[attachments] deleteAttachment params', { hunterIdNum, base });
    const data: any = {
      [`${base}_data`]: null,
      [`${base}_mime`]: null,
      [`${base}_name`]: null,
    };

    // Nettoyer aussi les dates pour le timbre
    if (base === 'treasury_stamp') {
      data['treasury_stamp_issue_date'] = null;
      data['treasury_stamp_expiry_date'] = null;
    }

    // Build UPDATE with explicit assignments to éviter des placeholders non supportés
    const updateAssignments = sql.join(
      Object.keys(data).map(k => sql`${sql.raw('"' + k + '"')} = ${data[k]}`),
      sql`, `
    );
    const updateQuery = sql`
      UPDATE hunter_attachments
      SET ${updateAssignments}, updated_at = NOW()
      WHERE hunter_id = ${hunterIdNum}
      RETURNING *
    `;
    const result = await db.execute(updateQuery as any);
    const attachment = Array.isArray(result) ? result[0] : (result as any)[0];
    console.debug('[attachments] deleteAttachment update result keys', attachment ? Object.keys(attachment) : null);

    return res.status(200).json({ message: 'Pièce jointe supprimée', attachment });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    return res.status(500).json({ message: 'Erreur lors de la suppression de la pièce jointe' });
  }
};

export const getAttachmentsStatus = async (req: Request, res: Response) => {
  try {
    const { hunterId } = req.params as { hunterId: string };
    const hunterIdNum = Number(hunterId);
    if (!Number.isInteger(hunterIdNum) || hunterIdNum <= 0) {
      return res.status(400).json({ message: 'ID du chasseur invalide' });
    }
    const rowList = await db.execute(sql`SELECT * FROM hunter_attachments WHERE hunter_id = ${hunterIdNum} LIMIT 1` as any);
    const row: any = Array.isArray(rowList) ? rowList[0] : (rowList as any)[0];
    console.debug('[attachments] getAttachmentsStatus row', {
      hunterIdNum,
      found: Boolean(row),
      keys: row ? Object.keys(row) : null,
    });

    const types: Array<{ code: string; label: string }> = [
      { code: 'idCardDocument', label: "Pièce d'identité" },
      { code: 'weaponPermit', label: "Permis de Port d'Arme" },
      { code: 'hunterPhoto', label: 'Photo du Chasseur' },
      { code: 'treasuryStamp', label: 'Timbre Impôt' },
      { code: 'weaponReceipt', label: "Quittance de l'Arme par le Trésor" },
      { code: 'insurance', label: 'Assurance' },
      { code: 'moralCertificate', label: 'Certificat de Bonne Vie et Mœurs' },
    ];

    const present = (key: string) => Boolean(row?.[key as keyof typeof row]);

    const computeStatus = (presentFlag: boolean, expiryDate?: string | null) => {
      if (!presentFlag) return { status: 'missing' as const };
      if (!expiryDate) return { status: 'valid' as const };
      const today = new Date();
      const exp = new Date(expiryDate);
      const expTime = exp.getTime();
      if (Number.isNaN(expTime)) {
        console.warn('[attachments] Invalid expiryDate format, treating as valid', { expiryDate });
        return { status: 'valid' as const };
      }
      const diffMs = expTime - today.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays < 0) return { status: 'expired' as const };
      if (diffDays <= 30) return { status: 'dueSoon' as const, daysLeft: diffDays };
      return { status: 'valid' as const };
    };

    const map: Record<string, any> = {
      idCardDocument: (() => {
        const isPresent = present('id_card_data');
        const expiry = row?.id_card_expiry_date ?? null;
        const computed = computeStatus(isPresent, expiry);
        return isPresent
          ? { type: 'idCardDocument', present: true, mime: row?.id_card_mime, name: row?.id_card_name, expiryDate: expiry, status: computed.status, daysLeft: computed.daysLeft }
          : { type: 'idCardDocument', present: false, status: 'missing' };
      })(),
      weaponPermit: (() => {
        const isPresent = present('weapon_permit_data');
        const expiry = row?.weapon_permit_expiry_date ?? null;
        const computed = computeStatus(isPresent, expiry);
        return isPresent
          ? { type: 'weaponPermit', present: true, mime: row?.weapon_permit_mime, name: row?.weapon_permit_name, expiryDate: expiry, status: computed.status, daysLeft: computed.daysLeft }
          : { type: 'weaponPermit', present: false, status: 'missing' };
      })(),
      hunterPhoto: present('hunter_photo_data') ? { type: 'hunterPhoto', present: true, mime: row?.hunter_photo_mime, name: row?.hunter_photo_name } : null,
      treasuryStamp: (() => {
        const isPresent = present('treasury_stamp_data');
        const expiry = row?.treasury_stamp_expiry_date ?? null;
        const computed = computeStatus(isPresent, expiry);
        return isPresent
          ? { type: 'treasuryStamp', present: true, mime: row?.treasury_stamp_mime, name: row?.treasury_stamp_name, expiryDate: expiry, status: computed.status, daysLeft: computed.daysLeft }
          : { type: 'treasuryStamp', present: false, status: 'missing' };
      })(),
      weaponReceipt: (() => {
        const isPresent = present('weapon_receipt_data');
        const expiry = row?.weapon_receipt_expiry_date ?? null;
        const computed = computeStatus(isPresent, expiry);
        return isPresent
          ? { type: 'weaponReceipt', present: true, mime: row?.weapon_receipt_mime, name: row?.weapon_receipt_name, expiryDate: expiry, status: computed.status, daysLeft: computed.daysLeft }
          : { type: 'weaponReceipt', present: false, status: 'missing' };
      })(),
      insurance: (() => {
        const isPresent = present('insurance_data');
        const expiry = row?.insurance_expiry_date ?? null;
        const computed = computeStatus(isPresent, expiry);
        return isPresent
          ? { type: 'insurance', present: true, mime: row?.insurance_mime, name: row?.insurance_name, expiryDate: expiry, status: computed.status, daysLeft: computed.daysLeft }
          : { type: 'insurance', present: false, status: 'missing' };
      })(),
      moralCertificate: present('moral_certificate_data') ? { type: 'moralCertificate', present: true, mime: row?.moral_certificate_mime, name: row?.moral_certificate_name } : null,
    };

    const result = types.map(t => map[t.code] ?? { type: t.code, present: false });
    console.debug('[attachments] getAttachmentsStatus result summary', {
      updatedAt: row?.updated_at ?? null,
      items: result.map((r: any) => ({ type: r.type, present: r.present, status: r.status, daysLeft: r.daysLeft }))
    });
    return res.json({ updatedAt: row?.updated_at ?? null, items: result });
  } catch (error) {
    console.error('Error reading attachments status:', error);
    return res.status(500).json({ message: 'Erreur lors de la lecture du statut des pièces jointes' });
  }
};


