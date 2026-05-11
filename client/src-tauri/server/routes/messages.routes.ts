import { and, eq } from 'drizzle-orm';
import { Request, Response, Router } from 'express';
import multer from 'multer';
import path from 'path';
import { InsertMessage, messages } from '../../shared/dist/schema.js';
import { db } from '../db.js';
import { storage } from '../storage.js';
import { isAuthenticated } from './middlewares/auth.middleware.js';

// Configuration de Multer pour les pièces jointes
const upload = multer({
  storage: multer.diskStorage({
    destination: './uploads',
    filename: (req, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname));
    }
  }),
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB max
  }
});

const router = Router();

// Récupérer les messages reçus
router.get('/inbox', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any)?.user?.id || 0;
    const userMessages = await db.query.messages.findMany({
      where: and(
        eq(messages.recipientId, userId),
        eq((messages as any).isDeleted, false as any)
      ),
      orderBy: (messages, { desc }) => [desc(messages.createdAt)]
    });
    res.json(userMessages);
  } catch (error) {
    console.error("Erreur lors de la récupération des messages:", error);
    res.status(500).json({ message: "Échec de la récupération des messages" });
  }
});

// Récupérer les messages envoyés
router.get('/sent', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any)?.user?.id || 0;
    const sentMessages = await storage.getMessagesBySender(userId);
    res.json(sentMessages);
  } catch (error) {
    console.error("Erreur lors de la récupération des messages envoyés:", error);
    res.status(500).json({ message: "Échec de la récupération des messages envoyés" });
  }
});

// Envoyer un message individuel avec pièce jointe
router.post('/', isAuthenticated, upload.single('attachment'), async (req: Request, res: Response) => {
  try {
    const subject = req.body?.subject;
    const content = req.body?.content ?? req.body?.body ?? req.body?.message; // tolère plusieurs alias
    const type = req.body?.type ?? req.body?.messageType; // tolère plusieurs alias
    // Garde-fou: contenu requis et type par défaut
    const normalizedContent = typeof content === 'string' ? content.trim() : '';
    const normalizedType = (typeof type === 'string' && type.trim().length > 0) ? type : 'standard';
    if (!normalizedContent) {
      return res.status(400).json({ message: 'Le contenu du message est requis.' });
    }
    console.log('[POST /api/messages] incoming body keys:', Object.keys(req.body || {}));
    console.log('[POST /api/messages] subject/content/type:', { subject, hasContent: normalizedContent.length > 0, type: normalizedType });
    const recipientIdsString = (req.body as any).recipientIds; // peut être string JSON, array, ou undefined
    const singleRecipientId = (req.body as any).recipientId; // peut être number ou string
    const senderId = (req as any)?.user?.id;

    if (!senderId) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    let parsedRecipientIds: number[];
    try {
      if (typeof recipientIdsString === 'string') {
        parsedRecipientIds = JSON.parse(recipientIdsString);
      } else if (Array.isArray(recipientIdsString)) {
        // Gérer le cas où ce n'est pas FormData mais une requête JSON brute (par exemple, tests API)
        parsedRecipientIds = recipientIdsString;
      } else if (typeof singleRecipientId === 'number' && Number.isFinite(singleRecipientId)) {
        parsedRecipientIds = [singleRecipientId];
      } else if (typeof singleRecipientId === 'string' && singleRecipientId.trim() !== '' && !Number.isNaN(Number(singleRecipientId))) {
        parsedRecipientIds = [Number(singleRecipientId)];
      } else {
        return res.status(400).json({ message: 'Destinataires manquants. Fournir recipientIds (array/JSON) ou recipientId (number).' });
      }

      if (!Array.isArray(parsedRecipientIds) ||
          parsedRecipientIds.length === 0 ||
          !parsedRecipientIds.every(id => typeof id === 'number' && Number.isFinite(id) && id > 0)) {
        return res.status(400).json({ message: 'recipientIds doit être un tableau non vide d\'entiers positifs valides.' });
      }
    } catch (error) {
      console.error("Erreur de parsing ou de validation pour recipientIds:", error);
      const errorMessage = error instanceof SyntaxError
        ? 'Format recipientIds invalide (JSON malformé). Attendu: chaîne JSON d\'un tableau d\'entiers positifs.'
        : 'Erreur interne lors du traitement de recipientIds.';
      return res.status(400).json({ message: errorMessage });
    }

    // Validation de parsedRecipientIds (lignes 72-76) assure déjà que parsedRecipientIds.length > 0
    // Donc pas besoin de revérifier ici si c'est vide.

    const createdMessages = [];
    // Common payload parts for all messages (only fields defined in InsertMessage)
    const commonMessageDetails = {
      senderId,
      subject,
      content: normalizedContent,
      type: normalizedType,
    };

    for (const recipientId of parsedRecipientIds) {
      const messagePayloadForRecipient: InsertMessage = {
        senderId: commonMessageDetails.senderId,
        recipientId: recipientId, // Set the specific recipient
        subject: commonMessageDetails.subject,
        content: commonMessageDetails.content, // Use 'content' as expected by InsertMessage/storage
        type: commonMessageDetails.type as InsertMessage['type'], // ensure union type compatibility
        // sentAt will be set by DB default or by createMessage if needed
      };
      try {
        const newMessage = await storage.createMessage(messagePayloadForRecipient);
        createdMessages.push(newMessage);
      } catch (innerErr) {
        console.error('[POST /api/messages] createMessage failed for recipient', recipientId, innerErr);
        // Renvoie avec détails d\'erreur pour diagnostic
        const errMsg = innerErr instanceof Error ? innerErr.message : String(innerErr);
        return res.status(400).json({ message: "Échec de l'envoi du message", error: errMsg });
      }
    }
    res.status(201).json(createdMessages);

  } catch (error) {
    console.error("Erreur lors de l'envoi du message:", error);
    const errMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ message: "Échec de l'envoi du message", error: errMsg });
  }
});

// Envoyer un message de groupe
router.post('/group', isAuthenticated, async (req, res) => {
  try {
    const { subject, content, type, targetRole, targetRegion } = req.body;
    const senderId = (req as any)?.user?.id;

    if (!senderId) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    // Garde-fou: contenu requis, type par défaut, et rôle cible requis
    const normalizedContent = typeof content === 'string' ? content.trim() : '';
    const normalizedType = (typeof type === 'string' && type.trim().length > 0) ? type : 'standard';
    const normalizedTargetRole = typeof targetRole === 'string' ? targetRole.trim() : '';
    if (!normalizedContent) {
      return res.status(400).json({ message: 'Le contenu du message est requis.' });
    }
    if (!normalizedTargetRole) {
      return res.status(400).json({ message: 'Le rôle cible (targetRole) est requis pour un message de groupe.' });
    }

    // Créer le message de groupe
    const groupMessage = await storage.createGroupMessage({
      senderId,
      subject,
      content: normalizedContent,
      type: normalizedType as any,
      targetRole: normalizedTargetRole,
      targetRegion
    });

    res.status(201).json(groupMessage);
  } catch (error) {
    console.error("Erreur lors de l'envoi du message de groupe:", error);
    res.status(400).json({ message: "Échec de l'envoi du message de groupe" });
  }
});

// Récupérer les messages de groupe pour l'utilisateur
router.get('/group/inbox', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any)?.user?.id;
    if (!userId) return res.status(401).json({ message: 'Non authentifié' });

    const groupMessages = await storage.getGroupMessagesByUser(userId);
    res.json(groupMessages);
  } catch (error) {
    console.error('Erreur récupération messages de groupe:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Marquer un message comme lu
router.patch('/:id/read', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const messageId = Number(req.params.id);
    const userId = (req as any)?.user?.id;

    if (!userId) return res.status(401).json({ message: 'Non authentifié' });

    const updatedMessage = await db.update(messages)
      .set({ isRead: true })
      .where(and(
        eq(messages.id, messageId),
        eq(messages.recipientId, userId)
      ))
      .returning();

    if (!updatedMessage) {
      return res.status(404).json({ message: "Message non trouvé" });
    }

    res.json(updatedMessage);
  } catch (error) {
    console.error("Erreur lors de la mise à jour du message:", error);
    res.status(500).json({ message: "Échec de la mise à jour du message" });
  }
});

// Supprimer un message
router.delete('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const messageId = Number(req.params.id);
    const userId = (req as any)?.user?.id;

    if (!userId) return res.status(401).json({ message: 'Non authentifié' });

    if (!Number.isFinite(messageId) || messageId <= 0) {
      return res.status(400).json({ message: 'Identifiant de message invalide' });
    }

    const message = await storage.getMessage(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message non trouvé' });
    }

    if (message.senderId === userId) {
      await storage.markMessageAsDeleted(messageId, true);
    } else if (message.recipientId === userId) {
      await storage.markMessageAsDeleted(messageId, false);
    } else {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    res.status(204).send();
  } catch (error) {
    console.error("Erreur lors de la suppression du message:", error);
    res.status(500).json({ message: "Échec de la suppression du message" });
  }
});


// =======================
// API GROUP MESSAGES
// =======================

// Marquer un message de groupe comme lu
router.patch('/group/:id/read', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any)?.user?.id;
    const messageId = Number(req.params.id);
    if (!userId) return res.status(401).json({ message: 'Non authentifié' });
    const result = await storage.markGroupMessageAsRead(messageId, userId);
    res.json(result);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du statut lu du message de groupe:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Marquer un message de groupe comme supprimé pour l'utilisateur
router.patch('/group/:id/delete', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any)?.user?.id;
    const messageId = Number(req.params.id);
    if (!userId) return res.status(401).json({ message: 'Non authentifié' });
    const result = await storage.markGroupMessageAsDeleted(messageId, userId);
    res.json(result);
  } catch (error) {
    console.error('Erreur lors de la suppression du message de groupe:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

export default router;
