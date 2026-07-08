import { initializeApp } from "firebase/app";
import { getMessaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyAbeLZKjAcRbtcaNV3cY_hOMJcpb-JMDl0",
  authDomain: "zihan-c23df.firebaseapp.com",
  projectId: "zihan-c23df",
  storageBucket: "zihan-c23df.firebasestorage.app",
  messagingSenderId: "90634617179",
  appId: "1:90634617179:web:1f63f7610e1213f8515a7e",
  measurementId: "G-HFFB7KE4RJ"
};

const app = initializeApp(firebaseConfig);
export const messaging = getMessaging(app);
export const VAPID_KEY = "BAFWQkSVeVsNOHDG12VNfSHOTsX-sOtOli1uTGWyYxgxGLd2KsO34sKaZZ1wqeaVsREFmAKC92MtB1_Yvs1K2oI";
