import { useEffect, useState } from 'react';

type Resource<T> =
  { status: 'loading' | 'error'; data: null } | { status: 'ready'; data: T };
export function useResource<T>(load: () => Promise<T>) {
  const [state, setState] = useState<Resource<T>>({
    status: 'loading',
    data: null,
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => {
        if (!active) return;
        setState({ status: 'loading', data: null });
        return load();
      })
      .then((data) => {
        if (active && data !== undefined) setState({ status: 'ready', data });
      })
      .catch(() => {
        if (active) setState({ status: 'error', data: null });
      });
    return () => {
      active = false;
    };
  }, [load, attempt]);
  return { ...state, retry: () => setAttempt((value) => value + 1) };
}
