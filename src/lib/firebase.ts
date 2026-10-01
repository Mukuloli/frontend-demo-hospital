import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, type Auth, type User } from "firebase/auth";

function firebaseAuth(): Auth {
  if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY || !process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
    throw new Error("Add your Firebase web configuration to frontend/.env.local first.");
  }
  const app = getApps().length ? getApp() : initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  });
  return getAuth(app);
}

async function identity(user: User) {
  return { token: await user.getIdToken(), name: user.displayName || "Patient", email: user.email || "" };
}

export async function restoreGoogleSignIn() {
  const auth = firebaseAuth();
  await auth.authStateReady();
  return auth.currentUser ? identity(auth.currentUser) : null;
}

export async function googleSignIn() {
  const auth = firebaseAuth();
  await auth.authStateReady();
  if (auth.currentUser) return identity(auth.currentUser);
  try {
    const result = await signInWithPopup(auth, new GoogleAuthProvider());
    return identity(result.user);
  } catch (error) {
    const code = (error as { code?: string }).code;
    const messages: Record<string, string> = {
      "auth/operation-not-allowed": "Enable Google sign-in in Firebase Console → Authentication → Sign-in method.",
      "auth/unauthorized-domain": "Add localhost to Firebase Console → Authentication → Settings → Authorized domains.",
      "auth/popup-blocked": "Allow the Google sign-in popup in your browser, then try again.",
      "auth/popup-closed-by-user": "Google sign-in was closed. Start again when you’re ready.",
      "auth/invalid-api-key": "Firebase did not accept the web API key. Check the project’s web configuration.",
    };
    throw new Error(messages[code || ""] || "Google sign-in could not complete. Please try again.");
  }
}

export async function signOutGoogle() {
  await signOut(firebaseAuth());
}
