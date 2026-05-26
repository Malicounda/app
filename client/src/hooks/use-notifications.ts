import { useEffect, useRef, useState } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { authenticatedFetch } from '../lib/authenticatedFetch';
import { getApiBaseUrl } from '../utils/environment';
import { useToast } from './use-toast';

const VAPID_PUBLIC_KEY =
  'BEeDwYMq5gQ4AKENupJYtKL4NyqNojph-vAchHIr-2ROFRevIuihgrb4Y5ZCV1Nc4qrIag74HHqQgDiKafO8Fpw';

const ANDROID_CHANNEL_ID = 'alerte_messages_v4';

/**
 * Détecte si on est dans l'APK Alerte de manière fiable.
 * Vérifie le user-agent en premier (toujours injecté par le natif),
 * puis le bridge Capacitor en fallback.
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

function getCapacitorPlatform(): string {
  const cap = typeof window !== 'undefined' ? (window as Window & { Capacitor?: { getPlatform?: () => string } }).Capacitor : undefined;
  return cap?.getPlatform?.() || 'web';
}

function getSocketServerUrl(): string {
  const api = getApiBaseUrl();
  return api.replace(/\/api\/?$/, '');
}

async function ensureAndroidNotificationChannel(): Promise<void> {
  // Sur Android (via user-agent ou platform check)
  const platform = getCapacitorPlatform();
  const isAndroid = platform === 'android' || navigator.userAgent.includes('AlerteAPK');
  if (!isAndroid) return;

  try {
    // Supprimer les anciens channels pour forcer la recréation avec les bons paramètres
    for (const oldId of ['alerte_messages', 'alerte_messages_v2', 'alerte_messages_v3']) {
      try {
        await LocalNotifications.deleteChannel({ id: oldId });
      } catch {
        /* ignore */
      }
    }
    await LocalNotifications.createChannel({
      id: ANDROID_CHANNEL_ID,
      name: 'Messages et alertes',
      description: 'Notifications avec son et vibration pour les alertes et messages',
      importance: 5,          // MAX — heads-up, son, vibration
      visibility: 1,          // PUBLIC
      vibration: true,
      lights: true,
      lightColor: '#114B26',
      // Ne PAS spécifier sound: 'default' — cela cherche un fichier inexistant
      // Android utilisera automatiquement la sonnerie système par défaut
    });
    console.log('[LocalNotifications] Channel créé:', ANDROID_CHANNEL_ID);
  } catch (e) {
    console.warn('[LocalNotifications] createChannel:', e);
  }
}

async function showSystemNotification(
  title: string,
  body: string,
  extra?: Record<string, unknown>
): Promise<void> {
  // Utiliser isInAlerteApk() au lieu de Capacitor.isNativePlatform() qui peut échouer
  if (!isInAlerteApk()) return;

  try {
    await ensureAndroidNotificationChannel();
    const id = Math.floor(Date.now() % 2147483640) + 1;
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title,
          body,
          channelId: ANDROID_CHANNEL_ID,
          smallIcon: 'ic_launcher_foreground',
          iconColor: '#114B26',
          // Planifier immédiatement (100ms dans le futur pour éviter le filtre Android)
          schedule: { at: new Date(Date.now() + 100) },
          extra: extra || {},
        },
      ],
    });
    console.log('[LocalNotifications] Notification planifiée:', { id, title });
  } catch (e) {
    console.warn('[LocalNotifications] schedule:', e);
  }
}

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
        console.log('[LocalNotifications] Permission status:', check.display);
        if (check.display !== 'granted') {
          const result = await LocalNotifications.requestPermissions();
          console.log('[LocalNotifications] Permission request result:', result.display);
        }
        await ensureAndroidNotificationChannel();
      } catch (e) {
        console.log('[LocalNotifications] setup error:', e);
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
      console.log('[Socket.io] Connexion à', socketUrl, 'userId:', userId);

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
          console.log('[Socket.io] Authentifié avec userId:', uid);
        }
      });

      socket.on('notification', (payload: { title?: string; body?: string; data?: { type?: string } }) => {
        const title = payload?.title || 'Notification';
        const body = payload?.body || '';

        console.log('[Socket.io] Notification reçue:', { title, body, type: payload?.data?.type });

        // Toast in-app si visible
        if (document.visibilityState === 'visible') {
          toast({
            title,
            description: body,
            variant: payload?.data?.type === 'ALERT' ? 'destructive' : 'default',
          });
        }

        // Notification système Android (son + vibration + heads-up)
        void showSystemNotification(title, body, payload?.data as Record<string, unknown>);

        // Invalidation des caches pour mise à jour immédiate des badges
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
          window.dispatchEvent(new CustomEvent('messaging-refresh-all'));
        }
        queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
        window.dispatchEvent(new CustomEvent('launcher-badge-refresh'));
      });

      socket.on('connect_error', (err) => {
        console.warn('[Socket.io] Erreur de connexion:', err.message);
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

  // Web Push (pour les notifications quand l'app est fermée — navigateurs web uniquement)
  useEffect(() => {
    if (!enabled) return;
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    setIsPushSupported(supported);
    if (!supported) return;

    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setIsPushSubscribed(!!sub))
      .catch(() => setIsPushSubscribed(false));
  }, [enabled]);

  const subscribeToPush = async () => {
    if (!isPushSupported || !enabled) return false;
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

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
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
