import { useCallback, useEffect, useState } from 'react';

/**
 * Runs an async loader whenever deps change.
 * Returns { data, error, loading, reload }. `loading` is derived (no setState inside the effect body).
 */
export function useAsync(loader, deps) {
  const [tick, setTick] = useState(0);
  const key = JSON.stringify([...deps, tick]);
  const [result, setResult] = useState({ key: null, data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    loader()
      .then((data) => !cancelled && setResult({ key, data, error: null }))
      .catch((error) => !cancelled && setResult({ key, data: null, error }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const loading = result.key !== key;
  return { data: loading ? null : result.data, error: loading ? null : result.error, loading, reload };
}
