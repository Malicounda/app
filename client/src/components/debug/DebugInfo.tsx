import React, { useEffect, useState } from 'react';

// Types pour les éléments d'erreur collectés
type JsRuntimeError = {
  message: string | Event;
  source?: string;
  lineno?: number;
  colno?: number;
  error?: string;
};

type UnhandledRejectionError = {
  type: 'unhandledRejection';
  reason: any;
  promise: Promise<any>;
};

type DebugInfoState = {
  userAgent: string;
  viewport: { width: number; height: number };
  url: string;
  timestamp: string;
  errors: Array<JsRuntimeError | UnhandledRejectionError>;
};

export const DebugInfo: React.FC = () => {
  const [debugInfo, setDebugInfo] = useState<DebugInfoState | null>(null);

  useEffect(() => {
    const info: DebugInfoState = {
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      url: window.location.href,
      timestamp: new Date().toISOString(),
      errors: [] as Array<JsRuntimeError | UnhandledRejectionError>
    };

    // Capturer les erreurs JavaScript
    const originalError = window.onerror;
    window.onerror = (
      message: string | Event,
      source?: string,
      lineno?: number,
      colno?: number,
      error?: Error
    ) => {
      info.errors.push({
        message,
        source,
        lineno,
        colno,
        error: error?.stack
      });
      setDebugInfo({ ...info });
      return false;
    };

    // Capturer les erreurs de promesses non gérées
    const originalUnhandledRejection = window.onunhandledrejection;
    window.onunhandledrejection = (event: PromiseRejectionEvent) => {
      info.errors.push({
        type: 'unhandledRejection',
        reason: event.reason,
        promise: event.promise
      });
      setDebugInfo({ ...info });
    };

    setDebugInfo(info);

    return () => {
      window.onerror = originalError;
      window.onunhandledrejection = originalUnhandledRejection;
    };
  }, []);

  // Désactiver complètement le debug info
  return null;
};

export default DebugInfo;
