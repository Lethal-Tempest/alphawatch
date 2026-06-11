
// ─────────────────────────────────────────────────────────────────────────────
// frontend/src/services/useSocket.js
//
// Singleton Socket.io client — ensures only one connection exists across the
// entire React application regardless of how many components mount the hook.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

// Module-level singleton — persists across component re-renders
let socketInstance = null;

export function useSocket() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!socketInstance) {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
      socketInstance = io(backendUrl || '/', {
        transports:    ['websocket'],
        reconnection:  true,
        reconnectionAttempts: Infinity,
        reconnectionDelay:    1000,
      });
    }

    const s = socketInstance;

    const onConnect    = () => {
      setConnected(true);
      // Re-authenticate on reconnect (token may have been set after initial connect)
      const token = localStorage.getItem('token');
      if (token) s.emit('authenticate', token);
    };
    const onDisconnect = () => setConnected(false);

    s.on('connect',    onConnect);
    s.on('disconnect', onDisconnect);

    // Sync with current socket state
    if (s.connected) setConnected(true);

    return () => {
      s.off('connect',    onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, []);

  return { socket: socketInstance, connected };
}

/** Access the socket instance outside of a React component (e.g. in services) */
export function getSocket() {
  return socketInstance;
}
