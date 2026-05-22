/**
 * Global toast store — pub/sub pattern.
 * Permite llamar toast() desde cualquier parte sin context.
 */
import { useState, useEffect } from 'react';

let listeners = [];
let toastCount = 0;
let memoryState = { toasts: [] };

function dispatch(action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((l) => l(memoryState));
}

function reducer(state, { type, toast, toastId }) {
  switch (type) {
    case 'ADD':
      return { toasts: [...state.toasts, toast] };
    case 'DISMISS':
      return { toasts: state.toasts.map((t) => (t.id === toastId ? { ...t, open: false } : t)) };
    case 'REMOVE':
      return { toasts: state.toasts.filter((t) => t.id !== toastId) };
    default:
      return state;
  }
}

/**
 * Función global para mostrar un toast.
 * Llámala directamente: toast({ title, description, variant })
 */
export function toast({ title, description, variant = 'default', duration = 4000 }) {
  const id = ++toastCount;
  dispatch({ type: 'ADD', toast: { id, title, description, variant, open: true } });
  const timer = setTimeout(() => {
    dispatch({ type: 'DISMISS', toastId: id });
    setTimeout(() => dispatch({ type: 'REMOVE', toastId: id }), 350);
  }, duration);
  return () => clearTimeout(timer); // cancel fn
}

/**
 * Hook para que el Toaster renderice los toasts activos.
 */
export function useToast() {
  const [state, setState] = useState(memoryState);

  useEffect(() => {
    listeners.push(setState);
    return () => {
      listeners = listeners.filter((l) => l !== setState);
    };
  }, []);

  const dismiss = (id) => dispatch({ type: 'DISMISS', toastId: id });

  return { toasts: state.toasts, toast, dismiss };
}
