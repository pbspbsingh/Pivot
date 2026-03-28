import { useEffect } from 'react';
import { useAppStore } from '../store';

const MIN_RETRY = 1000;
const MAX_RETRY = 30000;
const HEARTBEAT_TIMEOUT = 15000;

export function useServerEvents() {
  const setConnected = useAppStore((s) => s.setConnected);
  const setServerTime = useAppStore((s) => s.setServerTime);

  useEffect(() => {
    let es: EventSource | null = null;
    let retryDelay = MIN_RETRY;
    let retryTimeout: ReturnType<typeof setTimeout>;
    let heartbeatTimeout: ReturnType<typeof setTimeout>;

    function resetHeartbeat() {
      clearTimeout(heartbeatTimeout);
      heartbeatTimeout = setTimeout(() => {
        setConnected(false);
        es?.close();
        retryTimeout = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, MAX_RETRY);
      }, HEARTBEAT_TIMEOUT);
    }

    function connect() {
      es = new EventSource('/api/events');

      es.onopen = () => {
        setConnected(true);
        retryDelay = MIN_RETRY;
        resetHeartbeat();
      };

      es.addEventListener('heartbeat', (e: MessageEvent) => {
        resetHeartbeat();
        setServerTime(e.data);
      });

      es.onerror = () => {
        clearTimeout(heartbeatTimeout);
        setConnected(false);
        es?.close();
        retryTimeout = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, MAX_RETRY);
      };
    }

    connect();

    return () => {
      clearTimeout(retryTimeout);
      clearTimeout(heartbeatTimeout);
      es?.close();
    };
  }, [setConnected, setServerTime]);
}
