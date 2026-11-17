import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  // Akun lain yang pernah masuk di perangkat ini (untuk "Ganti akun").
  const [accounts, setAccounts] = useState([]);

  const loadAccounts = useCallback(() => api.get("/auth/accounts").then((r) => setAccounts(r.accounts)).catch(() => setAccounts([])), []);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api.get("/auth/me");
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    if (ready) loadAccounts();
  }, [ready, user?._id, loadAccounts]);

  const login = async (identifier, password) => {
    const { user } = await api.post("/auth/login", { identifier, password });
    setUser(user);
    return user;
  };
  const register = async (data) => {
    const { user } = await api.post("/auth/register", data);
    setUser(user);
    return user;
  };
  const logout = async () => {
    await api.post("/auth/logout").catch(() => {});
    setUser(null);
  };
  const switchAccount = async (userId) => {
    const { user } = await api.post("/auth/switch", { userId });
    setUser(user);
    return user;
  };
  const forgetAccount = async (userId) => {
    await api.post("/auth/accounts/forget", { userId }).catch(() => {});
    loadAccounts();
  };

  return (
    <AuthContext.Provider value={{ user, ready, setUser, refresh, login, register, logout, accounts, switchAccount, forgetAccount, isAdmin: user?.role === "admin" }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
