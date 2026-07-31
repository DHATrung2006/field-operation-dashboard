import { useEffect, useState } from 'react';
import { onAuthStateChangedListener } from '../firebase';

/**
 * useUserRole – tracks the Firebase auth state directly and, whenever a real
 * (non-mock) Firebase user is signed in, calls GET /api/users/sync to fetch/create
 * that account's row in Supabase (role + approval status). Resolves to
 * { role: null, status: null } while signed out.
 */
export default function useUserRole() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChangedListener(async (firebaseUser) => {
      if (!firebaseUser) {
        if (isMounted) {
          setProfile(null);
          setError(null);
          setLoading(false);
        }
        return;
      }

      if (isMounted) {
        setLoading(true);
        setError(null);
      }
      try {
        const token = await firebaseUser.getIdToken();
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/users/sync`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        if (!response.ok) {
          const txt = await response.text();
          throw new Error(`Backend error ${response.status}: ${txt}`);
        }
        const data = await response.json();
        if (isMounted) {
          setProfile(data);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return {
    role: profile?.role ?? null,
    status: profile?.status ?? null,
    profile,
    loading,
    error,
  };
}
