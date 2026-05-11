import { useState } from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  type: ToastType;
  duration?: number;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { ...toast, id }]);

    if (toast.duration !== 0) {
      const duration = toast.duration || 5000;
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }

    return id;
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const toast = {
    success: (title: string, description?: string, duration?: number) =>
      addToast({ title, description, type: 'success', duration }),
    error: (title: string, description?: string, duration?: number) =>
      addToast({ title, description, type: 'error', duration }),
    warning: (title: string, description?: string, duration?: number) =>
      addToast({ title, description, type: 'warning', duration }),
    info: (title: string, description?: string, duration?: number) =>
      addToast({ title, description, type: 'info', duration }),
    custom: addToast,
  };

  return { toasts, toast, removeToast };
}

export type { ToastType };
