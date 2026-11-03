import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getLookups } from '../services/api';

const LookupsContext = createContext(null);

/** Loads master data (faculties, courses, colleges ...) once for all forms. */
export function LookupsProvider({ children }) {
  const [lookups, setLookups] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(() => {
    setError(null);
    return getLookups()
      .then(setLookups)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return <LookupsContext.Provider value={{ lookups, error, reload }}>{children}</LookupsContext.Provider>;
}

export const useLookups = () => useContext(LookupsContext);
