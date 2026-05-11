import { useQuery, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

/**
 * Hook optimisé pour les requêtes avec chargement différé et gestion intelligente du cache
 */
export function useOptimizedQuery<TData = unknown, TError = Error>(
  options: UseQueryOptions<TData, TError> & {
    /**
     * Délai en ms avant de déclencher la requête (pour éviter les requêtes inutiles)
     */
    debounceMs?: number;
    /**
     * Charger uniquement quand visible (Intersection Observer)
     */
    loadOnVisible?: boolean;
    /**
     * Élément à observer pour loadOnVisible
     */
    targetRef?: React.RefObject<HTMLElement>;
  }
): UseQueryResult<TData, TError> {
  const {
    debounceMs = 0,
    loadOnVisible = false,
    targetRef,
    enabled = true,
    ...queryOptions
  } = options;

  const [isVisible, setIsVisible] = useState(!loadOnVisible);
  // Preserve the exact type of `enabled` (boolean | (query) => boolean)
  type EnabledType = NonNullable<typeof enabled>;
  const [debouncedEnabled, setDebouncedEnabled] = useState<EnabledType>(enabled as EnabledType);
  const timeoutRef = useRef<NodeJS.Timeout>();

  // Gestion du debounce
  useEffect(() => {
    if (debounceMs > 0) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setDebouncedEnabled(enabled as EnabledType);
      }, debounceMs);
    } else {
      setDebouncedEnabled(enabled as EnabledType);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, debounceMs]);

  // Gestion de l'Intersection Observer
  useEffect(() => {
    if (!loadOnVisible || !targetRef?.current) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        rootMargin: '50px', // Charger un peu avant que l'élément soit visible
        threshold: 0.1,
      }
    );

    observer.observe(targetRef.current);

    return () => {
      observer.disconnect();
    };
  }, [loadOnVisible, targetRef]);

  // Combiner toutes les conditions d'activation
  const finalEnabled: boolean | ((query: any) => boolean) =
    typeof debouncedEnabled === 'function'
      ? (query: any) => Boolean(debouncedEnabled(query)) && isVisible
      : Boolean(debouncedEnabled) && isVisible;

  return useQuery({
    ...queryOptions,
    enabled: finalEnabled,
  } as UseQueryOptions<TData, TError>);
}

/**
 * Hook pour précharger les données en arrière-plan
 */
export function usePrefetchQuery<TData = unknown>(
  queryKey: unknown[],
  queryFn: () => Promise<TData>,
  options?: {
    /**
     * Délai en ms avant de précharger
     */
    delayMs?: number;
    /**
     * Précharger uniquement si l'utilisateur est inactif
     */
    onIdle?: boolean;
  }
) {
  const { delayMs = 0, onIdle = false } = options || {};
  const [shouldPrefetch, setShouldPrefetch] = useState(false);

  useEffect(() => {
    if (onIdle) {
      // Utiliser requestIdleCallback si disponible
      if ('requestIdleCallback' in window) {
        const id = window.requestIdleCallback(() => {
          setShouldPrefetch(true);
        });
        return () => window.cancelIdleCallback(id);
      }
    }

    if (delayMs > 0) {
      const timeout = setTimeout(() => {
        setShouldPrefetch(true);
      }, delayMs);
      return () => clearTimeout(timeout);
    }

    setShouldPrefetch(true);
  }, [delayMs, onIdle]);

  useQuery({
    queryKey,
    queryFn,
    enabled: shouldPrefetch,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook pour charger les données par batch (pagination infinie optimisée)
 */
export function useBatchQuery<TData = unknown>(
  queryKey: unknown[],
  queryFn: (page: number) => Promise<TData[]>,
  options?: {
    /**
     * Nombre d'éléments par batch
     */
    batchSize?: number;
    /**
     * Charger automatiquement le prochain batch
     */
    autoLoad?: boolean;
  }
) {
  const { batchSize = 20, autoLoad = false } = options || {};
  const [page, setPage] = useState(1);
  const [allData, setAllData] = useState<TData[]>([]);

  const query = useQuery({
    queryKey: [...queryKey, page],
    queryFn: () => queryFn(page),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (query.data) {
      setAllData((prev) => [...prev, ...query.data]);

      if (autoLoad && query.data.length === batchSize) {
        // Charger automatiquement le prochain batch si le batch actuel est plein
        setPage((p) => p + 1);
      }
    }
  }, [query.data, autoLoad, batchSize]);

  return {
    data: allData,
    isLoading: query.isLoading,
    error: query.error,
    loadMore: () => setPage((p) => p + 1),
    hasMore: query.data?.length === batchSize,
  };
}
