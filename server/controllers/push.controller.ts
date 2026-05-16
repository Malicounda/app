import { Request, Response } from 'express';
import { storage } from '../storage.js';
import { log } from '../utils/logger.js';

/**
 * Enregistre un nouvel abonnement Web Push
 */
export const subscribe = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || (req as any).session?.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    const { endpoint, keys } = req.body;
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ message: 'Données d\'abonnement invalides' });
    }

    // Vérifier si l'abonnement existe déjà
    const existing = await storage.getPushSubscriptionByEndpoint(endpoint);
    if (existing) {
      if (existing.userId === userId) {
        return res.status(200).json({ message: 'Abonnement déjà enregistré' });
      } else {
        // L'abonnement appartient à un autre utilisateur, on le supprime avant de le réassigner
        await storage.deletePushSubscription(endpoint);
      }
    }

    await storage.createPushSubscription({
      userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    });

    log(`Nouvel abonnement push enregistré pour l'utilisateur ${userId}`, 'notification');
    res.status(201).json({ message: 'Abonnement enregistré avec succès' });
  } catch (error) {
    log(`Erreur lors de l'abonnement push: ${error instanceof Error ? error.message : String(error)}`, 'error');
    res.status(500).json({ message: 'Erreur lors de l\'enregistrement de l\'abonnement' });
  }
};

/**
 * Supprime un abonnement Web Push
 */
export const unsubscribe = async (req: Request, res: Response) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ message: 'Endpoint manquant' });
    }

    const success = await storage.deletePushSubscription(endpoint);
    if (success) {
      log(`Abonnement push supprimé pour l'endpoint ${endpoint.substring(0, 30)}...`, 'notification');
      res.status(200).json({ message: 'Abonnement supprimé avec succès' });
    } else {
      res.status(404).json({ message: 'Abonnement non trouvé' });
    }
  } catch (error) {
    log(`Erreur lors de la désinscription push: ${error instanceof Error ? error.message : String(error)}`, 'error');
    res.status(500).json({ message: 'Erreur lors de la suppression de l\'abonnement' });
  }
};

/**
 * Récupère la clé publique VAPID pour le client
 */
export const getVapidPublicKey = async (req: Request, res: Response) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return res.status(500).json({ message: 'Clé publique VAPID non configurée sur le serveur' });
  }
  res.status(200).json({ publicKey });
};
