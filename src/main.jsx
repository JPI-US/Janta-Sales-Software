import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import ProposalApp from "./ProposalApp.jsx";
import ForcePasswordChange from "./ForcePasswordChange.jsx";
import * as authApi from "./authApi.js";
import { proposalStorageKey } from "../shared/proposalAccount.js";
import { confirmSignOut } from "./appIcons.jsx";
import "./themeTransition.css";

const THEME_KEY = "janta_dark_mode_v1";

function AuthGate() {
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [rememberLogin, setRememberLogin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [appDarkMode, setAppDarkMode] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) === "1";
    } catch (_err) {
      return false;
    }
  });

  useEffect(() => {
    authApi
      .fetchCurrentUser()
      .then((user) => setCurrentUser(user))
      .catch(() => setCurrentUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  function resetForm() {
    setLoginId("");
    setPassword("");
  }

  async function handleSignIn() {
    try {
      const user = await authApi.login(loginId.trim(), password, rememberLogin);
      setCurrentUser(user);
      setError("");
      resetForm();
      try {
        sessionStorage.removeItem(`janta_app_nav_v1_${proposalStorageKey(user)}`);
      } catch (_err) {
        // ignore
      }
    } catch (err) {
      setError(err.message || "Invalid username/email or password.");
    }
  }

  async function handleSignOut() {
    if (!confirmSignOut()) return;
    const uid = currentUser?.id;
    try {
      await authApi.logout();
    } catch (_err) {
      // ignore — cookie is cleared client-side regardless
    }
    setCurrentUser(null);
    if (uid) {
      try {
        sessionStorage.removeItem(`janta_app_nav_v1_${uid}`);
      } catch (_err) {
        // ignore
      }
    }
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0F141A" }}>
        <div style={{ color: "#8FA0B3", fontFamily: "Inter, system-ui, sans-serif", fontSize: 13 }}>Loading…</div>
      </div>
    );
  }

  if (currentUser?.mustChangePassword) {
    return (
      <ForcePasswordChange
        user={currentUser}
        onUserUpdate={setCurrentUser}
        onSignOut={handleSignOut}
      />
    );
  }

  if (currentUser) {
    return (
      <ProposalApp
        currentUser={currentUser}
        onUserUpdate={setCurrentUser}
        onSignOut={handleSignOut}
        initialDarkMode={appDarkMode}
        onDarkModeChange={(nextDark) => {
          setAppDarkMode(Boolean(nextDark));
          try {
            localStorage.setItem(THEME_KEY, nextDark ? "1" : "0");
          } catch (_err) {
            // ignore storage write issues
          }
        }}
      />
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        display: "grid",
        placeItems: "center",
        position: "relative",
        overflow: "hidden",
        background: "#0F141A",
        padding: "16px 16px",
        margin: 0,
        boxSizing: "border-box",
      }}
    >
      <style>{`
        html, body, #root {
          margin: 0;
          padding: 0;
          width: 100%;
          min-height: 100%;
        }
      `}</style>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "url('/assets/signin-bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(3px) brightness(0.6)",
          transform: "scale(1.04)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0, 0, 0, 0.19)",
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 420,
          background: "rgba(255, 255, 255, 0.94)",
          border: "1px solid rgba(221, 226, 232, 0.95)",
          borderRadius: 12,
          padding: 20,
          fontFamily: "Inter, system-ui, sans-serif",
          boxShadow: "0 18px 40px rgba(0,0,0,0.28)",
        }}
      >
        <h2 style={{ margin: "0 0 4px 0", color: "#1A2233" }}>Sign in</h2>
        <p style={{ margin: "0 0 14px 0", color: "#6B7A90", fontSize: 13 }}>
          Access the Janta Proposal Generator.
        </p>
        <input
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          placeholder="Email or username"
          autoCapitalize="off"
          autoCorrect="off"
          style={inputStyle}
        />
        <div style={{ position: "relative", marginBottom: 10 }}>
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            style={{ ...inputStyle, marginBottom: 0, paddingRight: 44 }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            title={showPassword ? "Hide password" : "Show password"}
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              lineHeight: 1,
              color: "#6B7A90",
              padding: 2,
              display: "grid",
              placeItems: "center",
            }}
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 3L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M10.6 10.7C10.2 11 10 11.5 10 12C10 13.1 10.9 14 12 14C12.5 14 13 13.8 13.3 13.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M9.3 5.6C10.2 5.2 11.1 5 12 5C16.6 5 20.2 8.1 21.5 12C21 13.3 20.2 14.4 19.2 15.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M14.7 18.4C13.8 18.8 12.9 19 12 19C7.4 19 3.8 15.9 2.5 12C3 10.7 3.8 9.6 4.8 8.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M2.5 12C3.8 8.1 7.4 5 12 5C16.6 5 20.2 8.1 21.5 12C20.2 15.9 16.6 19 12 19C7.4 19 3.8 15.9 2.5 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            )}
          </button>
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
            color: "#4B5B6F",
            fontSize: 12,
            fontFamily: "Inter, system-ui, sans-serif",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={rememberLogin}
            onChange={(e) => setRememberLogin(e.target.checked)}
          />
          Stay signed in on this device
        </label>

        {error && (
          <div style={{ color: "#F55A5A", fontSize: 12, marginBottom: 10 }}>
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleSignIn}
          style={{
            width: "100%",
            border: "none",
            borderRadius: 8,
            padding: "10px 12px",
            background: "#0B2545",
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
            marginBottom: 10,
          }}
        >
          Sign in
        </button>
        <p style={{ margin: 0, color: "#6B7A90", fontSize: 12 }}>
          Accounts are managed by admins only.
        </p>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #E3E8F0",
  borderRadius: 8,
  padding: "10px 12px",
  marginBottom: 10,
  outline: "none",
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <style>{`
      html, body, #root {
        margin: 0;
        padding: 0;
        width: 100%;
        min-height: 100%;
      }
    `}</style>
    <AuthGate />
  </React.StrictMode>
);
