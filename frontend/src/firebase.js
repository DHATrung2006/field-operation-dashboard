import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { createClient } from '@supabase/supabase-js';

// Firebase configuration – read from VITE_ environment variables or safe defaults
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDemoPlaceholderKey123456789',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'demo-field-op.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-field-op',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'demo-field-op.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123456789012',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:123456789012:web:abcdef123456',
};

// Initialize Firebase safely
const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);

/**
 * Sign in with email and password.
 * In local preview (before real Firebase credentials are bound), catches API key errors
 * and provides a smooth mock authentication experience.
 */
export const signIn = async (email, password) => {
  try {
    return await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    console.warn('Firebase signIn notice:', err.code || err.message);
    const isPlaceholderError =
      !import.meta.env.VITE_FIREBASE_API_KEY ||
      import.meta.env.VITE_FIREBASE_API_KEY.includes('Placeholder') ||
      err.code === 'auth/invalid-api-key' ||
      err.code === 'auth/api-key-not-valid' ||
      (err.message && err.message.toLowerCase().includes('api-key'));

    if (isPlaceholderError) {
      console.warn('Firebase Demo Preview Mode: Logging in as mock user:', email);
      // Determine role based on email prefix for testing RBAC in preview!
      let role = 'PM';
      if (email.startsWith('dev')) role = 'DEV';
      else if (email.startsWith('admin')) role = 'ADMIN';
      else if (email.startsWith('hr')) role = 'HR';
      else if (email.startsWith('sup')) role = 'SUP';

      return {
        user: {
          email,
          uid: `mock-uid-${email.split('@')[0]}`,
          displayName: `${email.split('@')[0].toUpperCase()} (${role})`,
          role,
        },
      };
    }
    throw err;
  }
};

/** Sign out current user */
export const signOutUser = async () => {
  try {
    await signOut(auth);
  } catch (e) {
    console.warn('Demo signout handled');
  }
};

/** Listen to auth state changes */
export const onAuthStateChangedListener = (callback) =>
  onAuthStateChanged(auth, callback);

// Supabase client safely initialized
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder_anon_key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper to attach Firebase ID token
export const getIdToken = async () => {
  const user = auth.currentUser;
  if (!user) return 'mock-token-123';
  try {
    return await user.getIdToken();
  } catch (e) {
    return 'mock-token-123';
  }
};
