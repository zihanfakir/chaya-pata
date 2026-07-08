importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyAbeLZKjAcRbtcaNV3cY_hOMJcpb-JMDl0",
  authDomain: "zihan-c23df.firebaseapp.com",
  projectId: "zihan-c23df",
  storageBucket: "zihan-c23df.firebasestorage.app",
  messagingSenderId: "90634617179",
  appId: "1:90634617179:web:1f63f7610e1213f8515a7e",
  measurementId: "G-HFFB7KE4RJ"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: payload.notification.icon || '/icon.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
