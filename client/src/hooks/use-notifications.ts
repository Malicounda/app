import { useEffect, useRef, useState } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { authenticatedFetch } from '../lib/authenticatedFetch';
import { getApiBaseUrl } from '../utils/environment';
import { useToast } from './use-toast';
import { syncLauncherBadge } from '../lib/launcherBadge';

const VAPID_PUBLIC_KEY =
  'BNcXB8lrjG6n81HfH7lTfqSB-yT3ucZj23LNcfD2NSrAiiZxIHmX63svFrUdGfUuThsi6kCWYD0TRvtKCAk9P9A';

// ──────────────────────────────────────────────────────────────────────
// IMPORTANT: Sur Android, un channel de notification est IMMUABLE une
// fois créé. Pour changer ses paramètres (son, vibration, importance),
// il faut SUPPRIMER l'ancien et en créer un NOUVEAU avec un ID différent.
// Incrémentez ce numéro à chaque fois que vous modifiez les paramètres.
// ──────────────────────────────────────────────────────────────────────
const ANDROID_CHANNEL_ID = 'alerte_messages_v5';
const OLD_CHANNEL_IDS = ['alerte_messages', 'alerte_messages_v2', 'alerte_messages_v3', 'alerte_messages_v4'];

/**
 * Détecte si on est dans l'APK Alerte de manière fiable.
 * User-agent « AlerteAPK » est TOUJOURS injecté par Android natif.
 */
function isInAlerteApk(): boolean {
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('AlerteAPK')) {
    return true;
  }
  const cap = typeof window !== 'undefined'
    ? (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    : undefined;
  return Boolean(cap?.isNativePlatform?.());
}

function getSocketServerUrl(): string {
  const api = getApiBaseUrl();
  return api.replace(/\/api\/?$/, '');
}

// ──────────────────────────────────────────────────────────────────────
// Canal de notification Android
// ──────────────────────────────────────────────────────────────────────

let channelReady = false;

async function ensureAndroidNotificationChannel(): Promise<void> {
  if (!isInAlerteApk()) return;
  if (channelReady) return; // Ne pas recréer à chaque notification

  try {
    // Supprimer TOUS les anciens channels (y compris v4 qui était sans son)
    for (const oldId of OLD_CHANNEL_IDS) {
      try { await LocalNotifications.deleteChannel({ id: oldId }); } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  /* ignore */  }
    }

    await LocalNotifications.createChannel({
      id: ANDROID_CHANNEL_ID,
      name: 'Alertes et messages',
      description: 'Son, vibration et notification en tête pour les alertes et messages',
      importance: 5,     // MAX — heads-up notification
      visibility: 1,     // PUBLIC — visible sur l'écran verrouillé
      vibration: true,
      lights: true,
      lightColor: '#114B26',
      // sound: omis volontairement — Android utilise la sonnerie système par défaut
      // quand importance >= 3 et qu'aucun fichier son custom n'est spécifié
    });
    channelReady = true;
    console.log('[Notif] ✅ Channel Android créé:', ANDROID_CHANNEL_ID);
  } catch (e) {
    console.warn('[Notif] ⚠️ createChannel error:', e);
  }
}

// ──────────────────────────────────────────────────────────────────────
// Afficher une notification système Android
// ──────────────────────────────────────────────────────────────────────

/**
 * Génère un ID de notification déterministe à partir du type et de l'ID
 * de l'entité (message, alerte). Cela permet de supprimer la notification
 * correspondante quand le message/alerte est lu.
 * Si pas de type/entityId, on génère un ID aléatoire (fallback).
 */
function makeNotificationId(type?: string, entityId?: number | string): number {
  if (type && entityId) {
    // Hash simple: on combine type + entityId pour un entier stable dans les limites Android (1..2147483647)
    const base = type === 'ALERT' ? 100_000_000 : 200_000_000;
    const numId = typeof entityId === 'number' ? entityId : parseInt(entityId, 10) || 0;
    return base + (numId % 100_000_000);
  }
  return Math.floor(Date.now() % 2147483640) + 1;
}

async function showSystemNotification(
  title: string,
  body: string,
  extra?: Record<string, unknown>,
  badgeCount?: number
): Promise<void> {
  if (!isInAlerteApk()) return;

  try {
    await ensureAndroidNotificationChannel();

    const notifType = extra?.type as string | undefined;
    const notifEntityId = extra?.entityId as number | string | undefined;
    const id = makeNotificationId(notifType, notifEntityId);

    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title,
          body,
          channelId: ANDROID_CHANNEL_ID,
          smallIcon: 'ic_launcher_foreground',
          iconColor: '#114B26',
          extra: { ...extra, notifId: id },
          schedule: { at: new Date(Date.now() + 100) },
        },
      ],
    });
    console.log('[Notif] 📬 Notification affichée:', { id, title, notifType, notifEntityId });

    // Si on a un total fourni, forcer le badge après l'affichage natif
    // pour écraser le comportement "Notification Dots" d'Android 8.0+
    // qui met le badge à 1 par défaut.
    if (badgeCount !== undefined && badgeCount > 0) {
      setTimeout(() => {
        void syncLauncherBadge(badgeCount);
      }, 500);
    }

    // Déclencher la mise à jour des cartes et de l'interface
    window.dispatchEvent(new CustomEvent('launcher-badge-refresh'));
  } catch (e) {
    console.warn('[Notif] ⚠️ schedule error:', e);
  }
}

/**
 * Supprime la notification système Android correspondant à un type + entityId.
 * Appelé quand un message ou une alerte est marqué comme lu.
 */
export async function dismissSystemNotification(type: 'ALERT' | 'MESSAGE', entityId: number): Promise<void> {
  if (!isInAlerteApk()) return;
  try {
    const id = makeNotificationId(type, entityId);
    await LocalNotifications.cancel({ notifications: [{ id }] });
    console.log(`[Notif] 🗑️ Notification supprimée: type=${type}, entityId=${entityId}, id=${id}`);
  } catch (e) {
    console.warn('[Notif] ⚠️ dismiss error:', e);
  }
}

/**
 * Supprime toutes les notifications système en attente (ex: markAllAsRead).
 */
export async function clearAllSystemNotifications(): Promise<void> {
  if (!isInAlerteApk()) return;
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel(pending);
    }
    // Aussi supprimer les notifications déjà affichées (delivered)
    try {
      const delivered = await LocalNotifications.getDeliveredNotifications();
      if (delivered.notifications.length > 0) {
        await LocalNotifications.removeDeliveredNotifications(delivered);
      }
    } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  /* removeDelivered pas toujours dispo */  }
    console.log('[Notif] 🗑️ Toutes les notifications supprimées');
  } catch (e) {
    console.warn('[Notif] ⚠️ clearAll error:', e);
  }
}

// ──────────────────────────────────────────────────────────────────────
// Hook principal
// ──────────────────────────────────────────────────────────────────────

/**
 * Socket.io + notifications système (APK Android et web).
 * @param enabled activer uniquement si utilisateur connecté
 */
export function useNotifications(enabled = true, userId?: number | null) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const [isPushSupported, setIsPushSupported] = useState(false);
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);

  // Setup des permissions + channel Android au montage
  useEffect(() => {
    if (!enabled) return;
    const setup = async () => {
      try {
        const check = await LocalNotifications.checkPermissions();
        if (check.display !== 'granted') {
          await LocalNotifications.requestPermissions();
        }
        await ensureAndroidNotificationChannel();
      } catch (e) {
        console.log('[Notif] setup error:', e);
      }
    };
    void setup();
  }, [enabled]);

  // Socket.io pour les notifications en temps réel
  useEffect(() => {
    if (!enabled) return;

    // Laisser la navigation post-login se stabiliser avant de connecter Socket.io
    const connectDelayMs = isInAlerteApk() ? 3000 : 0;
    let cancelled = false;
    let socket: Socket | null = null;

    const connectTimer = window.setTimeout(() => {
      if (cancelled) return;

      const socketUrl = getSocketServerUrl();

      socket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 20,
        reconnectionDelay: 2000,
        auth: {
          token: localStorage.getItem('token') || undefined,
        },
      });

      socket.on('connect', () => {
        console.log('[Socket.io] Connecté à', socketUrl);
        const uid = Number(userId);
        if (socket && Number.isFinite(uid) && uid > 0) {
          socket.emit('authenticate', uid);
        }
      });

      socket.on('notification', (payload: { title?: string; body?: string; data?: { type?: string } }) => {
        const title = payload?.title || 'Notification';
        const body = payload?.body || '';

        // Toast in-app si l'application est visible
        if (document.visibilityState === 'visible') {
          toast({
            title,
            description: body,
            variant: payload?.data?.type === 'ALERT' ? 'destructive' : 'default',
          });
        }

        // Calculer le total actuel depuis le cache et ajouter 1
        const alertsData = queryClient.getQueryData<{ count: number }>(["unread-alerts-count", true]);
        const msgData = queryClient.getQueryData<{ total: number }>(["messages-unread-count-launcher-badge"]);
        const currentTotal = (alertsData?.count || 0) + (msgData?.total || 0);
        const newBadgeTotal = currentTotal + 1;

        // Notification système Android (son + vibration + heads-up + badge)
        // Passer le type et entityId dans les extras pour un ID déterministe
        const notifExtra = { ...(payload?.data || {}), type: payload?.data?.type, entityId: (payload?.data as any)?.entityId };
        void showSystemNotification(title, body, notifExtra as Record<string, unknown>, newBadgeTotal);

        // Invalidation des caches pour mise à jour immédiate des compteurs in-app
        if (payload?.data?.type === 'ALERT') {
          queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
          queryClient.invalidateQueries({ queryKey: ['/api/alerts/received'] });
          queryClient.invalidateQueries({ queryKey: ['alerts-unread-count'] });
          queryClient.invalidateQueries({ queryKey: ['unread-notifications-count'] });
          queryClient.invalidateQueries({ queryKey: ['supervisor-recent-notifs'] });
        }
        if (payload?.data?.type === 'MESSAGE') {
          queryClient.invalidateQueries({ queryKey: ['messages-unread-count'] });
          queryClient.invalidateQueries({ queryKey: ['messages-unread-count-main'] });
          queryClient.invalidateQueries({ queryKey: ['messages-unread-count-alerte'] });
          queryClient.invalidateQueries({ queryKey: ['messages-unread-count-supervisor-home'] });
          queryClient.invalidateQueries({ queryKey: ['messages-unread-count-launcher-badge'] });
          window.dispatchEvent(new CustomEvent('messaging-refresh-all'));
        }
        queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
        window.dispatchEvent(new CustomEvent('launcher-badge-refresh'));
      });

      socket.on('connect_error', (err) => {
        console.warn('[Socket.io] Erreur connexion:', err.message);
      });

      socketRef.current = socket;
    }, connectDelayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(connectTimer);
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [enabled, userId, toast, queryClient]);

  // Web Push (navigateurs web uniquement) et FCM (Android natif)
  useEffect(() => {
    if (!enabled) return;
    
    if (isInAlerteApk()) {
      setIsPushSupported(true); // FCM est toujours supporté sur Android
      
      // Listener pour le token FCM généré par l'app native
      PushNotifications.addListener('registration', async (token) => {
        // Cache the token to avoid printing it
        console.log('[FCM] Token natif reçu: (redacted)');
        try {
          // Enregistrer ce token sur notre backend de la même façon que Web Push
          // mais avec un marqueur 'FCM' pour que le serveur sache comment l'utiliser
          const subscriptionMock = {
            endpoint: token.value,
            keys: {
              p256dh: 'FCM',
              auth: 'FCM'
            }
          };
          
          await authenticatedFetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscriptionMock),
          });
          
          setIsPushSubscribed(true);
          console.log('[FCM] ✅ Token enregistré sur le backend avec succès');
        } catch (e) {
          console.error('[FCM] Erreur d\'enregistrement sur notre backend:', e);
        }
      });
      
      PushNotifications.addListener('registrationError', (error) => {
        console.error('[FCM] Erreur de registration:', error);
      });

      // Listener pour les notifications reçues en arrière-plan (quand l'utilisateur clique dessus)
      PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        console.log('[FCM] Notification cliquée (arrière-plan):', notification);
        // On pourrait naviguer vers la page correspondante ici
      });

      // ═══ ENREGISTREMENT AUTOMATIQUE FCM ═══
      // Demander la permission et enregistrer le device auprès de Firebase
      // pour recevoir les notifications même quand l'app est fermée
      (async () => {
        try {
          let permStatus = await PushNotifications.checkPermissions();
          if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
          }
          
          if (permStatus.receive === 'granted') {
            await PushNotifications.register();
            console.log('[FCM] ✅ Enregistrement FCM lancé automatiquement');
          } else {
            console.warn('[FCM] ⚠️ Permission notifications refusée par l\'utilisateur');
          }
        } catch (e) {
          console.error('[FCM] Erreur lors de l\'enregistrement automatique:', e);
        }
      })();
      
    } else {
      const supported = 'serviceWorker' in navigator && 'PushManager' in window;
      setIsPushSupported(supported);
      if (!supported) return;

      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setIsPushSubscribed(!!sub))
        .catch(() => setIsPushSubscribed(false));
    }
    
    return () => {
      if (isInAlerteApk()) {
        PushNotifications.removeAllListeners();
      }
    };
  }, [enabled]);

  const subscribeToPush = async () => {
    if (!isPushSupported || !enabled) return false;
    
    // CAS 1: Application Native Android (FCM)
    if (isInAlerteApk()) {
      try {
        let permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive === 'prompt') {
          permStatus = await PushNotifications.requestPermissions();
        }
        
        if (permStatus.receive !== 'granted') {
          toast({
            title: 'Notifications bloquées',
            description: 'Autorisez les notifications dans les paramètres Android.',
            variant: 'destructive',
          });
          return false;
        }
        
        // Ceci va déclencher l'événement 'registration' configuré plus haut
        await PushNotifications.register();
        return true;
      } catch (err) {
        console.error('[FCM] Erreur subscribe:', err);
        return false;
      }
    }
    
    // CAS 2: Navigateur Web / PWA (Web Push API)
    try {
      const registration = await navigator.serviceWorker.ready;
      let permission = Notification.permission;
      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }
      if (permission !== 'granted') {
        toast({
          title: 'Notifications bloquées',
          description: 'Autorisez les notifications dans les paramètres.',
          variant: 'destructive',
        });
        return false;
      }

      let vapidKey = VAPID_PUBLIC_KEY;
      try {
        const keyRes = await authenticatedFetch('/api/push/key');
        if (keyRes.ok) {
          const data = await keyRes.json();
          if (data.publicKey) vapidKey = data.publicKey;
        }
      } catch (e) {
        console.warn('Fallback to hardcoded VAPID key', e);
      }

      // Se désabonner de l'ancien pour éviter les erreurs de clé invalide
      const existingSub = await registration.pushManager.getSubscription();
      if (existingSub) {
        await existingSub.unsubscribe();
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const response = await authenticatedFetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription),
      });

      if (response.ok) {
        setIsPushSubscribed(true);
        toast({ title: 'Notifications activées', description: 'Alertes en temps réel activées.' });
        return true;
      }
      throw new Error('Échec enregistrement serveur');
    } catch (err) {
      console.error('[Web Push]', err);
      toast({
        title: 'Erreur',
        description: 'Impossible d\'activer les notifications push.',
        variant: 'destructive',
      });
      return false;
    }
  };

  return { isPushSupported, isPushSubscribed, subscribeToPush, socket: socketRef.current };
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
