import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { firebaseConfig, functionsRegion } from "./firebaseConfig";

export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.appId);

const app = isConfigured ? initializeApp(firebaseConfig) : null;

export const auth = app ? getAuth(app) : null!;
export const db = app ? getFirestore(app) : null!;
export const functions = app ? getFunctions(app, functionsRegion) : null!;

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
