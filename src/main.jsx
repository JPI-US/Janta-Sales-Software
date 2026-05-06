import React, { useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import JantaProposal from "../janta-proposal-generator-v3 (1).jsx";

const DB_KEY = "janta_local_db_v1";
const SESSION_KEY = "janta_local_session_v1";
const REMEMBER_KEY = "janta_local_saved_login_v1";
const THEME_KEY = "janta_dark_mode_v1";
// Admin-managed user list (local MVP): add/edit allowed users here.
const ADMIN_SEED_USERS = [
  { name: "Sean Simmons", email: "seansimmons@jantaus.com", password: "CyanRyan05" },
];

function readDb() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return { users: [] };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.users)) return { users: [] };
    return parsed;
  } catch (_err) {
    return { users: [] };
  }
}

function writeDb(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function readSession() {
  return localStorage.getItem(SESSION_KEY) || "";
}

function writeSession(userId) {
  if (!userId) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, userId);
}

function ensureSeedUsers(db) {
  if (!ADMIN_SEED_USERS.length) return db;
  const byEmail = new Map(
    db.users.map((u) => [String(u.email || "").toLowerCase(), u])
  );
  let changed = false;
  ADMIN_SEED_USERS.forEach((seed) => {
    const email = String(seed.email || "").trim().toLowerCase();
    if (!email || !seed.password) return;
    const existing = byEmail.get(email);
    if (existing) {
      const next = {
        ...existing,
        name: seed.name || existing.name || email,
        password: seed.password,
      };
      byEmail.set(email, next);
      changed =
        changed ||
        existing.password !== next.password ||
        existing.name !== next.name;
      return;
    }
    changed = true;
    byEmail.set(email, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: seed.name || email,
      email,
      password: seed.password,
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
    });
  });
  if (!changed) return db;
  return { ...db, users: Array.from(byEmail.values()) };
}

function AuthGate() {
  const [db, setDb] = useState(() => {
    const seeded = ensureSeedUsers(readDb());
    writeDb(seeded);
    return seeded;
  });
  const [sessionUserId, setSessionUserId] = useState(() => readSession());
  const savedLogin = useMemo(() => {
    try {
      const raw = localStorage.getItem(REMEMBER_KEY);
      if (!raw) return { email: "", password: "", remember: false };
      const parsed = JSON.parse(raw);
      return {
        email: String(parsed.email || ""),
        password: String(parsed.password || ""),
        remember: Boolean(parsed.remember),
      };
    } catch (_err) {
      return { email: "", password: "", remember: false };
    }
  }, []);
  const [email, setEmail] = useState(savedLogin.email);
  const [password, setPassword] = useState(savedLogin.password);
  const [rememberLogin, setRememberLogin] = useState(savedLogin.remember);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsCurrentEmail, setSettingsCurrentEmail] = useState("");
  const [settingsNewEmail, setSettingsNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [settingsMsg, setSettingsMsg] = useState("");
  const [appDarkMode, setAppDarkMode] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) === "1";
    } catch (_err) {
      return false;
    }
  });

  const currentUser = useMemo(
    () => db.users.find((u) => u.id === sessionUserId) || null,
    [db.users, sessionUserId]
  );

  function resetForm() {
    setEmail("");
    setPassword("");
  }

  function handleSignIn() {
    const cleanEmail = email.trim().toLowerCase();
    const user = db.users.find(
      (u) => u.email === cleanEmail && u.password === password
    );
    if (!user) {
      setError("Invalid email or password.");
      return;
    }
    const nextDb = {
      ...db,
      users: db.users.map((u) =>
        u.id === user.id ? { ...u, lastLoginAt: new Date().toISOString() } : u
      ),
    };
    setDb(nextDb);
    writeDb(nextDb);
    setSessionUserId(user.id);
    writeSession(user.id);
    if (rememberLogin) {
      localStorage.setItem(
        REMEMBER_KEY,
        JSON.stringify({ email: cleanEmail, password, remember: true })
      );
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }
    setError("");
    resetForm();
  }

  function handleSignOut() {
    setSessionUserId("");
    writeSession("");
    setSettingsOpen(false);
    setSettingsMsg("");
  }

  function openSettings() {
    if (!currentUser) return;
    setSettingsCurrentEmail(currentUser.email || "");
    setSettingsNewEmail("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSettingsMsg("");
    setSettingsOpen(true);
  }

  function saveEmail() {
    if (!currentUser) return;
    const currentEmailInput = settingsCurrentEmail.trim().toLowerCase();
    const cleanEmail = settingsNewEmail.trim().toLowerCase();
    if (!currentEmailInput) {
      setSettingsMsg("Current email is required.");
      return;
    }
    if (currentEmailInput !== currentUser.email) {
      setSettingsMsg("Current email does not match your account.");
      return;
    }
    if (!cleanEmail) {
      setSettingsMsg("New email is required.");
      return;
    }
    if (!currentPassword) {
      setSettingsMsg("Enter current password to save changes.");
      return;
    }
    if (currentPassword !== currentUser.password) {
      setSettingsMsg("Current password is incorrect.");
      return;
    }
    const emailTaken = db.users.some(
      (u) => u.id !== currentUser.id && u.email === cleanEmail
    );
    if (emailTaken) {
      setSettingsMsg("That email is already used by another account.");
      return;
    }
    const nextDb = {
      ...db,
      users: db.users.map((u) =>
        u.id === currentUser.id
          ? {
              ...u,
              email: cleanEmail,
            }
          : u
      ),
    };
    setDb(nextDb);
    writeDb(nextDb);
    setSettingsMsg("Email updated.");
    setSettingsCurrentEmail(cleanEmail);
    setSettingsNewEmail("");
  }

  function savePassword() {
    if (!currentUser) return;
    if (!currentPassword) {
      setSettingsMsg("Enter current password to change password.");
      return;
    }
    if (currentPassword !== currentUser.password) {
      setSettingsMsg("Current password is incorrect.");
      return;
    }
    if (!newPassword) {
      setSettingsMsg("Enter a new password.");
      return;
    }
    if (newPassword.length < 6) {
      setSettingsMsg("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setSettingsMsg("New password and confirm password must match.");
      return;
    }
    const nextDb = {
      ...db,
      users: db.users.map((u) =>
        u.id === currentUser.id ? { ...u, password: newPassword } : u
      ),
    };
    setDb(nextDb);
    writeDb(nextDb);
    setSettingsMsg("Password updated.");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  if (currentUser) {
    if (settingsOpen) {
      const settingsBg = appDarkMode ? "#100D0A" : "#F3F4F6";
      const panelBg = appDarkMode ? "#1A1510" : "#FFFFFF";
      const panelBorder = appDarkMode ? "#3A2B1D" : "#DDE2E8";
      const headingColor = appDarkMode ? "#F8F2E8" : "#2F3B4C";
      const subtleText = appDarkMode ? "#D8C6AE" : "#6F8096";
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            background: settingsBg,
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 960,
              background: panelBg,
              border: `1px solid ${panelBorder}`,
              borderRadius: 12,
              padding: 24,
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            <h2 style={{ margin: "0 0 14px 0", color: headingColor }}>Settings</h2>
            <div style={{ marginBottom: 12, padding: 12, border: `1px solid ${panelBorder}`, borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: subtleText, marginBottom: 8 }}>Change email</div>
              <input
                value={settingsCurrentEmail}
                onChange={(e) => setSettingsCurrentEmail(e.target.value)}
                placeholder="Current email"
                style={themedInputStyle(appDarkMode)}
              />
              <input
                value={settingsNewEmail}
                onChange={(e) => setSettingsNewEmail(e.target.value)}
                placeholder="New email"
                style={themedInputStyle(appDarkMode)}
              />
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                style={themedInputStyle(appDarkMode)}
              />
              <button type="button" onClick={saveEmail} style={themedPrimaryButtonStyle(appDarkMode)}>
                Update email
              </button>
            </div>

            <div style={{ marginBottom: 12, padding: 12, border: `1px solid ${panelBorder}`, borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: subtleText, marginBottom: 8 }}>Change password</div>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                style={themedInputStyle(appDarkMode)}
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                style={themedInputStyle(appDarkMode)}
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                style={themedInputStyle(appDarkMode)}
              />
              <button type="button" onClick={savePassword} style={themedPrimaryButtonStyle(appDarkMode)}>
                Update password
              </button>
            </div>
            {settingsMsg && (
              <div
                style={{
                  color: settingsMsg.includes("saved") ? "#2A9D8F" : "#F55A5A",
                  fontSize: 12,
                  marginBottom: 10,
                }}
              >
                {settingsMsg}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                style={themedSecondaryButtonStyle(appDarkMode)}
              >
                Back
              </button>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              style={{
                width: "100%",
                border: appDarkMode ? "1px solid #5B2921" : "1px solid #F1B8B8",
                borderRadius: 8,
                padding: "10px 12px",
                background: appDarkMode ? "#2D1612" : "#FFF5F5",
                color: appDarkMode ? "#F9C8C1" : "#B42318",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      );
    }
    return (
      <div style={{ minHeight: "100vh", background: appDarkMode ? "#000000" : "#F3F4F6" }}>
        <JantaProposal
          onOpenSettings={openSettings}
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
      </div>
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
        <h2 style={{ margin: "0 0 4px 0", color: "#2F3B4C" }}>
          Sign in
        </h2>
        <p style={{ margin: "0 0 14px 0", color: "#6F8096", fontSize: 13 }}>
          Access the Janta Proposal Generator.
        </p>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
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
              color: "#6F8096",
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
          Save email and password
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
            background: "#2F3B4C",
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
            marginBottom: 10,
          }}
        >
          Sign in
        </button>
        <p style={{ margin: 0, color: "#6F8096", fontSize: 12 }}>
          Accounts are managed by admins only.
        </p>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #DDE2E8",
  borderRadius: 8,
  padding: "10px 12px",
  marginBottom: 10,
  outline: "none",
};

function themedInputStyle(isDark) {
  if (!isDark) return inputStyle;
  return {
    ...inputStyle,
    border: "1px solid #3A2B1D",
    background: "#120E0A",
    color: "#F8F2E8",
  };
}

const primaryButtonStyle = {
  flex: 1,
  border: "none",
  borderRadius: 8,
  padding: "10px 12px",
  background: "#2F3B4C",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};

function themedPrimaryButtonStyle(isDark) {
  if (!isDark) return primaryButtonStyle;
  return {
    ...primaryButtonStyle,
    background: "#D3A14A",
    color: "#1B140D",
  };
}

const secondaryButtonStyle = {
  flex: 1,
  border: "1px solid #DDE2E8",
  borderRadius: 8,
  padding: "10px 12px",
  background: "#fff",
  color: "#2F3B4C",
  cursor: "pointer",
};

function themedSecondaryButtonStyle(isDark) {
  if (!isDark) return secondaryButtonStyle;
  return {
    ...secondaryButtonStyle,
    border: "1px solid #3A2B1D",
    background: "#120E0A",
    color: "#F8F2E8",
  };
}

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
