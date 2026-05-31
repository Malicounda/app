import { useState, useEffect, useCallback } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

// La clé publique VAPID récupérée depuis l'API ou définie en dur (fallback)
const FALLBACK_VAPID_PUBLIC_KEY = 'BNcXB8lrjG6n81HfH7lTfqSB-yT3ucZj23LNcfD2NSrAiiZxIHmX63svFrUdGfUuThsi6kCWYD0TRvtKCAk9P9A';

/**
 * Convertit une chaîne Base64 URL-safe en Uint8Array (nécessaire pour la souscription Web Push)
 */
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Vérifier le support au chargement
  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);
    
    if (supported) {
      setPermission(Notification.permission);
      checkSubscription();
    } else {
      setIsLoading(false);
    }
  }, []);

  // Vérifier si l'utilisateur est déjà abonné
  const checkSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error('Erreur lors de la vérification de l\'abonnement Push:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Demander la permission et s'abonner
  const subscribe = useCallback(async () => {
    if (!isSupported) return false;

    setIsLoading(true);
    try {
      // 1. Demander la permission
      const currentPermission = await Notification.requestPermission();
      setPermission(currentPermission);

      if (currentPermission !== 'granted') {
        throw new Error('Permission refusée par l\'utilisateur');
      }

      // 2. Récupérer la clé VAPID publique depuis le serveur
      let vapidPublicKey = FALLBACK_VAPID_PUBLIC_KEY;
      try {
        const response = await authenticatedFetch('/api/push/key');
        if (response.ok) {
          const data = await response.json();
          if (data.publicKey) vapidPublicKey = data.publicKey;
        }
      } catch (e) {
        console.warn('Impossible de récupérer la clé VAPID du serveur, utilisation du fallback', e);
      }

      // 3. S'abonner via le Service Worker
      const registration = await navigator.serviceWorker.ready;
      
      // S'assurer de se désabonner de l'ancien s'il existe
      const existingSub = await registration.pushManager.getSubscription();
      if (existingSub) {
        await existingSub.unsubscribe();
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });

      // 4. Envoyer l'abonnement au serveur
      const response = await authenticatedFetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!response.ok) {
        throw new Error('Erreur lors de l\'envoi de la souscription au serveur');
      }

      setIsSubscribed(true);
      return true;
    } catch (error) {
      console.error('Erreur lors de l\'abonnement aux notifications Push:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  // Se désabonner
  const unsubscribe = useCallback(async () => {
    if (!isSupported) return false;

    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        // Supprimer côté serveur
        await authenticatedFetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });

        // Supprimer côté navigateur
        await subscription.unsubscribe();
        setIsSubscribed(false);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Erreur lors du désabonnement:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe
  };
}
