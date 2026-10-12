import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
let firebaseConfig: any = {
  projectId: "gen-lang-client-0286495500",
  appId: "1:899690953368:web:2d6e7aa901dda1363f6eed",
  apiKey: "AIzaSyBhfJMosbTICiAEXvxnnTxyTsYRJm61tnM",
  authDomain: "gen-lang-client-0286495500.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-siapin-b6acd525-7284-4786-bbde-e0c31404bd65",
  storageBucket: "gen-lang-client-0286495500.firebasestorage.app",
  messagingSenderId: "899690953368",
  oAuthClientId: "899690953368-qa2vafuauke33qu90mr41m7dgij8lc34.apps.googleusercontent.com",
};

try {
  // If FIREBASE_CONFIG is injected as Vite env
  if (import.meta.env.VITE_FIREBASE_CONFIG) {
    firebaseConfig = JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG);
  }
} catch {
  // Use embedded default config
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Provider utama untuk login / verifikasi identitas (hanya profile & email dasar)
// Bebas 100% dari batasan "Google Verification / Test Users"
const provider = new GoogleAuthProvider();
provider.addScope('email');
provider.addScope('profile');
provider.setCustomParameters({
  prompt: 'select_account',
});

// Scope terpisah jika admin memerlukan akses khusus Google Sheets di kemudian hari
export const SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken || '';
    cachedAccessToken = token;
    return { user: result.user, accessToken: token };
  } catch (error: any) {
    if (
      error.code === 'auth/popup-closed-by-user' ||
      error.code === 'auth/cancelled-popup-request' ||
      error.code === 'auth/user-cancelled'
    ) {
      console.info('Google popup ditutup oleh pengguna.');
      return null;
    }
    if (error.code === 'auth/popup-blocked') {
      const blockedErr: any = new Error('Jendela popup diblokir oleh browser. Silakan izinkan pop-up atau gunakan opsi input email manual.');
      blockedErr.code = 'auth/popup-blocked';
      throw blockedErr;
    }
    console.error('Google Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token;
};

export const logoutGoogle = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};
