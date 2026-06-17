import { Request, Response } from 'express';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import { hunterDocuments } from '../../shared/schema.js';

export const uploadHunterDocument = async (req: Request, res: Response) => {
  try {
    const { hunterId } = req.params;
    const { documentType } = req.body as { documentType?: string };
    const file = (req as any).file as Express.Multer.File | undefined;

    if (!file) {
      return res.status(400).json({ message: 'Aucun fichier fourni' });
    }
    if (!documentType) {
      return res.status(400).json({ message: 'Type de document invalide' });
    }

    const hunterIdNum = Number(hunterId);
    if (!Number.isInteger(hunterIdNum) || hunterIdNum <= 0) {
      return res.status(400).json({ message: 'ID du chasseur invalide' });
    }

    // Upsert logic: Si un document existe déjà pour ce hunterId et ce documentType, on le met à jour
    const existingResult = await db.execute(sql`
      SELECT id FROM hunter_documents 
      WHERE hunter_id = ${hunterIdNum} AND document_type = ${documentType}
      LIMIT 1
    `);
    const existing = Array.isArray(existingResult) ? existingResult[0] : (existingResult as any)?.rows?.[0];

    let result;
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');

    if (existing && existing.id) {
      // Update
      const query = sql`
        UPDATE hunter_documents
        SET file_data = ${file.buffer},
            file_mime = ${file.mimetype},
            file_name = ${originalName},
            updated_at = NOW()
        WHERE id = ${existing.id}
        RETURNING *
      `;
      const updateResult = await db.execute(query as any);
      result = Array.isArray(updateResult) ? updateResult[0] : (updateResult as any)?.rows?.[0] || (updateResult as any)[0];
    } else {
      // Insert
      const query = sql`
        INSERT INTO hunter_documents (hunter_id, document_type, file_data, file_mime, file_name, created_at, updated_at)
        VALUES (${hunterIdNum}, ${documentType}, ${file.buffer}, ${file.mimetype}, ${originalName}, NOW(), NOW())
        RETURNING *
      `;
      const insertResult = await db.execute(query as any);
      result = Array.isArray(insertResult) ? insertResult[0] : (insertResult as any)?.rows?.[0] || (insertResult as any)[0];
    }

    // On retire le file_data avant de le renvoyer au frontend pour des raisons de performance
    if (result) {
      delete result.file_data;
    }

    return res.status(201).json({ message: 'Document enregistré', document: result });
  } catch (error) {
    console.error('Error uploading hunter document:', error);
    return res.status(500).json({ message: "Erreur lors de l'upload du document" });
  }
};

export const downloadHunterDocument = async (req: Request, res: Response) => {
  try {
    const { hunterId, documentType } = req.params as { hunterId: string; documentType: string };
    
    if (!documentType) {
      return res.status(400).json({ message: 'Type de document invalide' });
    }
    const hunterIdNum = Number(hunterId);
    if (!Number.isInteger(hunterIdNum) || hunterIdNum <= 0) {
      return res.status(400).json({ message: 'ID du chasseur invalide' });
    }

    const query = sql`
      SELECT file_data, file_mime, file_name 
      FROM hunter_documents 
      WHERE hunter_id = ${hunterIdNum} AND document_type = ${documentType} 
      LIMIT 1
    `;
    const list = await db.execute(query as any);
    const record: any = Array.isArray(list) ? list[0] : (list as any)?.rows?.[0] || (list as any)[0];

    if (!record || !record.file_data) {
      return res.status(404).json({ message: 'Document introuvable' });
    }

    const inline = String(req.query.inline ?? '').toLowerCase();
    if (record.file_mime) {
      res.setHeader('Content-Type', String(record.file_mime));
    }
    const safeName = String(record.file_name ?? 'document');
    const disposition = (inline === '1' || inline === 'true') ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`);
    return res.end(record.file_data as Buffer);
  } catch (error) {
    console.error('Error downloading hunter document:', error);
    return res.status(500).json({ message: 'Erreur lors du téléchargement du document' });
  }
};

export const deleteHunterDocument = async (req: Request, res: Response) => {
  try {
    const { hunterId, documentType } = req.params as { hunterId: string; documentType: string };
    
    if (!documentType) {
      return res.status(400).json({ message: 'Type de document invalide' });
    }
    const hunterIdNum = Number(hunterId);
    if (!Number.isInteger(hunterIdNum) || hunterIdNum <= 0) {
      return res.status(400).json({ message: 'ID du chasseur invalide' });
    }

    const query = sql`
      DELETE FROM hunter_documents
      WHERE hunter_id = ${hunterIdNum} AND document_type = ${documentType}
      RETURNING *
    `;
    const result = await db.execute(query as any);
    const deleted = Array.isArray(result) ? result[0] : (result as any)?.rows?.[0] || (result as any)[0];

    return res.status(200).json({ message: 'Document supprimé', document: deleted ? { id: deleted.id } : null });
  } catch (error) {
    console.error('Error deleting hunter document:', error);
    return res.status(500).json({ message: 'Erreur lors de la suppression du document' });
  }
};

export const getHunterDocumentsStatus = async (req: Request, res: Response) => {
  try {
    const { hunterId } = req.params as { hunterId: string };
    const hunterIdNum = Number(hunterId);
    if (!Number.isInteger(hunterIdNum) || hunterIdNum <= 0) {
      return res.status(400).json({ message: 'ID du chasseur invalide' });
    }

    const query = sql`
      SELECT id, document_type, file_mime, file_name, updated_at 
      FROM hunter_documents 
      WHERE hunter_id = ${hunterIdNum}
    `;
    const rows = await db.execute(query as any);
    const docs = Array.isArray(rows) ? rows : (rows as any)?.rows || [];

    const items = docs.map((doc: any) => ({
      type: doc.document_type,
      present: true,
      mime: doc.file_mime,
      name: doc.file_name,
      status: 'valid' // Generic for now, as hunter_documents doesn't have expiry dates yet
    }));

    return res.json({ items });
  } catch (error) {
    console.error('Error reading hunter documents status:', error);
    return res.status(500).json({ message: 'Erreur lors de la lecture du statut des documents' });
  }
};
