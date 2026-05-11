import { useMemo, useState } from "react";

export interface UsePaginationOptions {
  pageSize?: number;
}

export function usePagination<T>(items: T[] = [], options: UsePaginationOptions = {}) {
  const defaultPageSize = options.pageSize ?? 10;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const total = items?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const currentItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const goToPage = (p: number) => {
    const next = Math.min(Math.max(1, p), pageCount);
    setPage(next);
  };

  const nextPage = () => goToPage(page + 1);
  const prevPage = () => goToPage(page - 1);

  const onPageSizeChange = (size: number) => {
    if (!Number.isFinite(size) || size <= 0) return;
    setPageSize(size);
    setPage(1);
  };

  const rangeFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = Math.min(page * pageSize, total);

  return {
    page,
    pageSize,
    setPage: goToPage,
    setPageSize: onPageSizeChange,
    total,
    pageCount,
    currentItems,
    nextPage,
    prevPage,
    rangeFrom,
    rangeTo,
  };
}
