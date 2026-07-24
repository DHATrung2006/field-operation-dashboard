import { useEffect, useState } from 'react';
import { getIdToken } from '../firebase';

/**
 * useUserRole – custom hook that fetches the current user's role from the backend.
 * It obtains a Firebase ID token via getIdToken() and calls `/api/role.check`.
 * Returns an object { role, loading, error }.
 */
export default function useUserRole() {
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchRole() {
      try {
        const token = await getIdToken();
        if (!token) throw new Error('No ID token available');
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/role.check`, {
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
          setRole(data.role || null);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    }
    fetchRole();
    return () => {
      isMounted = false;
    };
  }, []);

  return { role, loading, error };
}
