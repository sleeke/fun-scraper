import { useState, useCallback, useRef } from 'react';

/**
 * Simple toast notification hook.
 */
export function useToast() {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const addToast = useCallback((message, type = 'info', duration = 3500) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  return { toasts, addToast };
}
