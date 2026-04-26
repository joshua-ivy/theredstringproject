import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";
import { getAnalytics, isSupported } from "firebase/analytics";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyBH-qORZ2lStD--xZFnJr1eJcreRFkT9Ys",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "the-red-string-project.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "the-red-string-project",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "the-red-string-project.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "54337999390",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:54337999390:web:07a60d70d420fb9d42d40f",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "G-9KBWMGGJDX"
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);
export const functions = getFunctions(firebaseApp, "us-central1");

export const firebaseAI = getAI(firebaseApp, { backend: new GoogleAIBackend() });
export const clientGenerativeModel = getGenerativeModel(firebaseAI, {
  model: "gemini-2.5-flash"
});

export async function initAnalytics() {
  if (typeof window === "undefined") {
    return null;
  }

  const supported = await isSupported();
  return supported ? getAnalytics(firebaseApp) : null;
}
