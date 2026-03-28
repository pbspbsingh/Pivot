import { useEffect } from 'react';
import { useAppStore } from '../store';

const MIN_RETRY = 1000;
const MAX_RETRY = 30000;

export function useServerEvents() {
  const setConnected = useAppStore((s) => s.setConnected);

  useEffect(() => {
    let es: EventSource | null = null;
    let retryDelay = MIN_RETRY;
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource('/api/events');

      es.onopen = () => {
        setConnected(true);
        retryDelay = MIN_RETRY;
      };

      es.onerror = () => {
        setConnected(false);
        es?.close();
        retryTimeout = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, MAX_RETRY);
      };
    }

    connect();

    return () => {
      clearTimeout(retryTimeout);
      es?.close();
    };
  }, [setConnected]);
}
