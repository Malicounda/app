import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './use-toast';
import { useQueryClient } from '@tanstack/react-query';

// Clé publique VAPID (doit correspondre à celle du serveur)
const VAPID_PUBLIC_KEY = 'BEeDwYMq5gQ4AKENupJYtKL4NyqNojph-vAchHIr-2ROFRevIuihgrb4Y5ZCV1Nc4qrIag74HHqQgDiKafO8Fpw';

/**
 * Hook pour gérer les notifications en temps réel (Socket.io) 
 * et les notifications système (Web Push)
 */
export function useNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const [isPushSupported, setIsPushSupported] = useState(false);
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);

  // 1. Gestion de Socket.io
  useEffect(() => {
    if (!user) return;

    // Initialisation de la connexion Socket.io
    const socket = io(window.location.origin, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[Socket.io] Connecté au serveur');
      // S'authentifier auprès du socket pour recevoir les notifications ciblées
      socket.emit('authenticate', user.id);
    });

    socket.on('notification', (payload) => {
      console.log('[Socket.io] Notification reçue:', payload);
      
      // Afficher un toast dans l'application
      toast({
        title: payload.title,
        description: payload.body,
        variant: payload.data?.type === 'ALERT' ? 'destructive' : 'default',
      });

      // Rafraîchir les données concernées
      if (payload.data?.type === 'ALERT') {
        queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    });

    socket.on('disconnect', () => {
      console.log('[Socket.io] Déconnecté');
    });

    socketRef.current = socket;

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [user, toast, queryClient]);

  // 2. Gestion de Web Push
  useEffect(() => {
    const checkPushSupport = async () => {
      const supported = 'serviceWorker' in navigator && 'PushManager' in window;
      setIsPushSupported(supported);

      if (supported && user) {
        try {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.getSubscription();
          setIsPushSubscribed(!!subscription);
        } catch (err) {
          console.error('[Web Push] Erreur lors de la vérification de l\'abonnement:', err);
        }
      }
    };

    checkPushSupport();
  }, [user]);

  /**
   * Demande la permission et inscrit l'utilisateur aux notifications Push
   */
  const subscribeToPush = async () => {
    if (!isPushSupported || !user) {
      console.warn('[Web Push] Non supporté ou utilisateur non connecté');
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      
      // Demander la permission si nécessaire
      let permission = Notification.permission;
      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }

      if (permission !== 'granted') {
        toast({
          title: 'Notifications bloquées',
          description: 'Veuillez autoriser les notifications dans les paramètres de votre navigateur.',
          variant: 'destructive'
        });
        return false;
      }

      // S'abonner via le PushManager
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      // Envoyer l'abonnement au backend
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription)
      });

      if (response.ok) {
        setIsPushSubscribed(true);
        toast({
          title: 'Notifications activées',
          description: 'Vous recevrez désormais des alertes système en temps réel.',
        });
        return true;
      } else {
        throw new Error('Échec de l\'enregistrement sur le serveur');
      }
    } catch (err) {
      console.error('[Web Push] Erreur lors de l\'inscription:', err);
      toast({
        title: 'Erreur',
        description: 'Impossible d\'activer les notifications push.',
        variant: 'destructive'
      });
      return false;
    }
  };

  return { 
    isPushSupported, 
    isPushSubscribed, 
    subscribeToPush,
    socket: socketRef.current 
  };
}

/**
 * Convertit une clé VAPID base64 en Uint8Array
 */
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
