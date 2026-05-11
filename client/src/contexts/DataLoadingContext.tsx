import { createContext, useContext, useMemo, useState, ReactNode } from "react";

type DataLoadingContextValue = {
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
};

const DataLoadingContext = createContext<DataLoadingContextValue | undefined>(undefined);

export function DataLoadingProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const value = useMemo(() => ({ isLoading, setIsLoading }), [isLoading]);
  return <DataLoadingContext.Provider value={value}>{children}</DataLoadingContext.Provider>;
}

export function useDataLoading() {
  const ctx = useContext(DataLoadingContext);
  if (!ctx) throw new Error("useDataLoading must be used within a DataLoadingProvider");
  return ctx;
}
