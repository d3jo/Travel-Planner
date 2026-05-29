import { createContext, useContext, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const AuthContext = createContext(null);

const TOKEN_KEY = "tp_token";
const USER_KEY = "tp_user";
const SAVED_USERNAME_KEY = "tp_saved_username";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
  });
  const nav = useNavigate();

  function login(tokenStr, userObj, rememberUsername) {
    setToken(tokenStr);
    setUser(userObj);
    localStorage.setItem(TOKEN_KEY, tokenStr);
    localStorage.setItem(USER_KEY, JSON.stringify(userObj));
    if (rememberUsername) {
      localStorage.setItem(SAVED_USERNAME_KEY, userObj.username);
    } else {
      localStorage.removeItem(SAVED_USERNAME_KEY);
    }
  }

  function logout() {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function getSavedUsername() {
    return localStorage.getItem(SAVED_USERNAME_KEY) || "";
  }

  useEffect(() => {
    function handleExpired() {
      setToken(null);
      setUser(null);
      nav("/auth");
    }
    window.addEventListener("auth:expired", handleExpired);
    return () => window.removeEventListener("auth:expired", handleExpired);
  }, [nav]);

  return (
    <AuthContext.Provider value={{ token, user, login, logout, getSavedUsername, isLoggedIn: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
