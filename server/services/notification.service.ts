import webpush from 'web-push';
import { storage } from '../storage.js';
import { log } from '../utils/logger.js';
import type { Express } from 'express';

/**
 * Service de gestion des notifications (Socket.io + Web Push)
 */
export class NotificationService {
  private io: any;
  private userSockets: Map<number, string[]>;

  constructor(app: Express) {
    this.io = (app as any).io;
    this.userSockets = (app as any).userSockets;

    // Configuration Web Push
    const vapidPublic = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@malicounda.sn';

    if (vapidPublic && vapidPrivate) {
      try {
        webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);
        log('✅ Web Push configuré avec succès', 'notification');
      } catch (error) {
        log('❌ Erreur configuration Web Push: ' + (error as Error).message, 'error');
      }
    } else {
      log('⚠️ Web Push non configuré (clés VAPID manquantes dans .env)', 'warning');
    }
  }

  /**
   * Envoie une notification à un utilisateur spécifique via tous les canaux disponibles
   */
  async sendToUser(userId: number, payload: { title: string; body: string; data?: any }) {
    // 1. Socket.io (Temps réel si l'utilisateur est actuellement connecté)
    const sockets = this.userSockets?.get(userId);
    if (sockets && sockets.length > 0) {
      this.io.to(sockets).emit('notification', {
        ...payload,
        timestamp: new Date().toISOString()
      });
      log(`[Socket.io] Notification envoyée à l'utilisateur ${userId}`, 'notification');
    }

    // 2. Web Push (Notification système/offline)
    try {
      const subscriptions = await storage.getPushSubscriptionsByUserId(userId);
      if (subscriptions && subscriptions.length > 0) {
        const pushPromises = subscriptions.map(async (sub) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.p256dh,
                  auth: sub.auth,
                },
              },
              JSON.stringify(payload)
            );
          } catch (error: any) {
            // Supprimer l'abonnement s'il n'est plus valide (410 Gone ou 404 Not Found)
            if (error.statusCode === 410 || error.statusCode === 404) {
              log(`[Web Push] Abonnement expiré pour l'utilisateur ${userId}, suppression de l'endpoint ${sub.endpoint.substring(0, 30)}...`, 'notification');
              await storage.deletePushSubscription(sub.endpoint);
            } else {
              log(`[Web Push] Erreur lors de l'envoi à l'utilisateur ${userId}: ${error.message}`, 'error');
            }
          }
        });
        await Promise.allSettled(pushPromises);
      }
    } catch (error) {
      log(`[Web Push] Erreur lors de la récupération des abonnements pour ${userId}: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }

  /**
   * Envoie une notification à une liste d'utilisateurs
   */
  async broadcastToUsers(userIds: number[], payload: { title: string; body: string; data?: any }) {
    if (!userIds || userIds.length === 0) return;
    
    log(`Diffusion d'une notification à ${userIds.length} utilisateurs`, 'notification');
    const promises = userIds.map((id) => this.sendToUser(id, payload));
    await Promise.allSettled(promises);
  }
}
