import { useEffect } from 'react';
import { messaging, VAPID_KEY } from '../utils/firebase';
import { getToken, onMessage } from 'firebase/messaging';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

export default function PushNotificationManager({ serverUrl, token, showToast }) {
  useEffect(() => {
    if (!token) return;

    const registerPushToken = async (pushToken) => {
      try {
        await fetch(`${serverUrl}/api/push/subscribe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ token: pushToken, platform: Capacitor.isNativePlatform() ? 'android' : 'web' })
        });
        console.log('Push token registered successfully.');
      } catch (err) {
        console.error('Failed to register push token:', err);
      }
    };

    const setupWebPush = async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY });
          if (currentToken) {
            console.log('Web Push Token:', currentToken);
            registerPushToken(currentToken);
          }
        }
      } catch (error) {
        console.error('Error getting web push token:', error);
      }
    };

    const setupCapacitorPush = async () => {
      try {
        let permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive === 'prompt') {
          permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
          throw new Error('User denied permissions!');
        }

        await PushNotifications.register();

        PushNotifications.addListener('registration', (token) => {
          console.log('Capacitor Push Token:', token.value);
          registerPushToken(token.value);
        });

        PushNotifications.addListener('registrationError', (error) => {
          console.error('Error on push registration:', error);
        });

        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('Push notification received: ', notification);
          // showToast(notification.title || 'New Message', 'info');
        });
      } catch (error) {
        console.error('Error setting up native push:', error);
      }
    };

    if (Capacitor.isNativePlatform()) {
      setupCapacitorPush();
    } else {
      setupWebPush();
      
      // Handle foreground messages for web
      const unsubscribe = onMessage(messaging, (payload) => {
        console.log('Foreground push message received: ', payload);
        // We can let Socket.io handle the UI update, no need to show double toasts
      });

      return () => {
        unsubscribe();
      };
    }
  }, [serverUrl, token]);

  return null;
}
