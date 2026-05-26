import { useEffect, useRef, useState } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { authenticatedFetch } from '../lib/authenticatedFetch';
import { getApiBaseUrl } from '../utils/environment';
import { useToast } from './use-toast';

const VAPID_PUBLIC_KEY =
  'BEeDwYMq5gQ4AKENupJYtKL4NyqNojph-vAchHIr-2ROFRevIuihgrb4Y5ZCV1Nc4qrIag74HHqQgDiKafO8Fpw';

const ANDROID_CHANNEL_ID = 'alerte_messages_v3';

function isNativeCapacitor(): boolean {
  const cap = typeof window !== 'undefined' ? (window as Window & { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor : undefined;
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
  if (getCapacitorPlatform() !== 'android') return;
  try {
    for (const oldId of ['alerte_messages', 'alerte_messages_v2']) {
      try {
        await LocalNotifications.deleteChannel({ id: oldId });
      } catch {
        /* ignore */
      }
    }
    await LocalNotifications.createChannel({
      id: ANDROID_CHANNEL_ID,
      name: 'Messages et alertes',
      description: 'Son, vibration et notification en tête d’écran',
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#114B26',
    });
  } catch (e) {
    console.warn('[LocalNotifications] createChannel:', e);
  }
}

async function showSystemNotification(
  title: string,
  body: string,
  extra?: Record<string, unknown>
): Promise<void> {
  if (!isNativeCapacitor()) return;
  try {
    await ensureAndroidNotificationChannel();
    const id = Math.floor(Date.now() % 2147483640) + 1;
    const isAndroid = getCapacitorPlatform() === 'android';
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title,
          body,
          channelId: ANDROID_CHANNEL_ID,
          smallIcon: isAndroid ? 'ic_launcher_foreground' : undefined,
          iconColor: '#114B26',
          schedule: { at: new Date(Date.now() + 80) },
          extra: extra || {},
        },
      ],
    });
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
        console.log('[LocalNotifications] setup:', e);
      }
    };
    void setup();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    // Laisser la navigation post-login se stabiliser avant Socket.io + notifs natives
    const connectDelayMs = isNativeCapacitor() ? 3000 : 0;
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

      if (document.visibilityState === 'visible') {
        toast({
          title,
          description: body,
          variant: payload?.data?.type === 'ALERT' ? 'destructive' : 'default',
        });
      }

      void showSystemNotification(title, body, payload?.data as Record<string, unknown>);

      if (payload?.data?.type === 'ALERT') {
        queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
        queryClient.invalidateQueries({ queryKey: ['alerts-unread-count'] });
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

    socketRef.current = socket;
    }, connectDelayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(connectTimer);
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [enabled, userId, toast, queryClient]);

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
