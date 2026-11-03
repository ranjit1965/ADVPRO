import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api
      .getCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  const login = useCallback(async (userId, password) => {
    const u = await api.login(userId, password);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  // Saves the Settings preferences on the user's record in MongoDB.
  const savePreferences = useCallback(async (prefs) => {
    const saved = await api.savePreferences(prefs);
    setUser((u) => (u ? { ...u, preferences: saved } : u));
    return saved;
  }, []);

  const value = useMemo(() => ({ user, checking, login, logout, savePreferences }), [user, checking, login, logout, savePreferences]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
