import { useAuth } from '../context/AuthContext';

export const DEFAULT_PREFERENCES = { defaultTab: 'class', defaultFacultyIn: 'Center' };

/** Entry-screen defaults from Settings, stored on the user's record in MongoDB. */
export function usePreferences() {
  const { user, savePreferences } = useAuth();
  return [{ ...DEFAULT_PREFERENCES, ...(user?.preferences || {}) }, savePreferences];
}
