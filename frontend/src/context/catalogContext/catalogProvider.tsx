import { useEffect, useState, type ReactNode } from 'react';
import { CatalogContext, type CatalogContextValue } from './catalogContext';
import { loadCatalog } from '../../service/catalog.service';

const empty = { products: [], categories: [], deliveryMethods: [], payMethods: [] };

export default function CatalogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CatalogContextValue>({ ...empty, loading: true, error: false });

  useEffect(() => {
    loadCatalog()
      .then((data) => setState({ ...data, loading: false, error: false }))
      .catch(() => setState({ ...empty, loading: false, error: true }));
  }, []);

  return <CatalogContext.Provider value={state}>{children}</CatalogContext.Provider>;
}