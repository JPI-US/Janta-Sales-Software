import React, { useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import ProposalApp from "./ProposalApp.jsx";

const DB_KEY = "janta_local_db_v1";
const SESSION_KEY = "janta_local_session_v1";
const REMEMBER_KEY = "janta_local_saved_login_v1";
const THEME_KEY = "janta_dark_mode_v1";

/** Lowercase emails that always have Settings → user management (local app). Add more admins here only. */
const ADMIN_EMAIL_ALLOWLIST = new Set(["seansimmons@jantaus.com"]);

/** Admin-managed user list (bootstrap): seeded on first run / merge. */
const ADMIN_SEED_USERS = [
  {
    name: "Sean Simmons",
    username: "sean",
    email: "seansimmons@jantaus.com",
    password: "CyanRyan05",
    isAdmin: true,
  },
];

function normalizeLoginId(value) {
  return String(value || "").trim().toLowerCase();
}

function defaultUsernameFromEmail(email) {
  const local = String(email || "").split("@")[0].trim().toLowerCase();
  return local || "";
}

function slugifyUsername(name) {
  const slug = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 32);
  return slug;
}

function uniqueUsernameFromDisplayName(name, email, users, excludeUserId = "") {
  const taken = new Set(
    users
      .filter((u) => u.id !== excludeUserId)
      .map((u) => String(u.username || "").toLowerCase())
      .filter(Boolean)
  );
  let base = slugifyUsername(name) || defaultUsernameFromEmail(email);
  if (!base) base = "user";
  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${base}${n}`;
    n += 1;
  }
  return candidate;
}

function isProtectedAdminAccount(user) {
  return ADMIN_EMAIL_ALLOWLIST.has(String(user?.email || "").toLowerCase());
}

function normalizeUserRecord(user) {
  const email = String(user.email || "").trim().toLowerCase();
  return {
    ...user,
    email,
    username: String(user.username || defaultUsernameFromEmail(email)).trim().toLowerCase(),
  };
}

function userMatchesLogin(user, loginId, pass) {
  if (!user || user.password !== pass) return false;
  const id = normalizeLoginId(loginId);
  if (!id) return false;
  const email = String(user.email || "").toLowerCase();
  const username = String(user.username || "").toLowerCase();
  return email === id || (username && username === id);
}

function updateRememberedCredentials(patch) {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed?.remember) return;
    localStorage.setItem(
      REMEMBER_KEY,
      JSON.stringify({
        email: patch.email != null ? patch.email : String(parsed.email || ""),
        password: patch.password != null ? patch.password : String(parsed.password || ""),
        remember: true,
      })
    );
  } catch (_err) {
    // ignore
  }
}

function userIsAdmin(u) {
  if (!u || !u.email) return false;
  const email = String(u.email).trim().toLowerCase();
  if (ADMIN_EMAIL_ALLOWLIST.has(email)) return true;
  return Boolean(u.isAdmin === true || u.role === "admin");
}

function readDb() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return { users: [] };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.users)) return { users: [] };
    return { users: parsed.users.map(normalizeUserRecord) };
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
    db.users.map((u) => [String(u.email || "").toLowerCase(), { ...u }])
  );
  let changed = false;
  ADMIN_SEED_USERS.forEach((seed) => {
    const email = String(seed.email || "").trim().toLowerCase();
    if (!email || !seed.password) return;
    const seedAdmin = Boolean(seed.isAdmin) || ADMIN_EMAIL_ALLOWLIST.has(email);
    const existing = byEmail.get(email);
    if (existing) {
      const next = normalizeUserRecord({
        ...existing,
        name: seed.name || existing.name || email,
        username: existing.username || seed.username || defaultUsernameFromEmail(email),
        // Keep password the user chose; seed password only applies when creating the account.
        password: existing.password || seed.password,
        isAdmin: seedAdmin || userIsAdmin(existing),
      });
      byEmail.set(email, next);
      changed =
        changed ||
        existing.password !== next.password ||
        existing.name !== next.name ||
        existing.username !== next.username ||
        Boolean(existing.isAdmin) !== Boolean(next.isAdmin);
      return;
    }
    changed = true;
    byEmail.set(email, normalizeUserRecord({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: seed.name || email,
      username: seed.username || defaultUsernameFromEmail(email),
      email,
      password: seed.password,
      isAdmin: seedAdmin,
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
    }));
  });
  const users = Array.from(byEmail.values()).map((u) => {
    const normalized = normalizeUserRecord(u);
    const email = String(normalized.email || "").toLowerCase();
    const mustAdmin = ADMIN_EMAIL_ALLOWLIST.has(email);
    if (mustAdmin && !normalized.isAdmin) {
      changed = true;
      return { ...normalized, isAdmin: true };
    }
    return normalized;
  });
  return { ...db, users };
}

function isSettingsSuccessMessage(msg) {
  if (!msg || typeof msg !== "string") return false;
  return /^(Email updated|Password updated|User added|User removed|Role updated)/i.test(msg.trim());
}

function AuthGate() {
  const [db, setDb] = useState(() => {
    const seeded = ensureSeedUsers(readDb());
    writeDb(seeded);
    return seeded;
  });
  const [sessionUserId, setSessionUserId] = useState("");
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
  const [loginId, setLoginId] = useState(savedLogin.email);
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
  const [addUserName, setAddUserName] = useState("");
  const [addUserEmail, setAddUserEmail] = useState("");
  const [addUserPassword, setAddUserPassword] = useState("");
  const [addUserConfirm, setAddUserConfirm] = useState("");
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
  const currentUserIsAdmin = userIsAdmin(currentUser);
  React.useEffect(() => {
    writeSession("");
  }, []);

  function resetForm() {
    setLoginId("");
    setPassword("");
  }

  function handleSignIn() {
    const id = normalizeLoginId(loginId);
    const user = db.users.find((u) => userMatchesLogin(u, id, password));
    if (!user) {
      setError("Invalid username/email or password.");
      return;
    }
    const nextDb = {
      ...db,
      users: db.users.map((u) =>
        u.id === user.id ? { ...u, lastLoginAt: new Date().toISOString() } : u
      ),
    };
    const merged = ensureSeedUsers(nextDb);
    setDb(merged);
    writeDb(merged);
    setSessionUserId(user.id);
    writeSession(user.id);
    if (rememberLogin) {
      localStorage.setItem(
        REMEMBER_KEY,
        JSON.stringify({ email: user.email, password, remember: true })
      );
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }
    setError("");
    resetForm();
  }

  function handleSignOut() {
    const uid = sessionUserId;
    setSessionUserId("");
    writeSession("");
    setSettingsOpen(false);
    setSettingsMsg("");
    if (uid) {
      try {
        sessionStorage.removeItem(`janta_app_nav_v1_${uid}`);
      } catch (_err) {
        // ignore
      }
    }
  }

  function openSettings() {
    if (!currentUser) return;
    setSettingsCurrentEmail(currentUser.email || "");
    setSettingsNewEmail("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setAddUserName("");
    setAddUserEmail("");
    setAddUserPassword("");
    setAddUserConfirm("");
    setSettingsMsg("");
    setSettingsOpen(true);
  }

  /** Only removable if not you and not a built-in admin account. */
  function canRemoveUser(target) {
    if (!target || !currentUser) return false;
    if (target.id === currentUser.id) return false;
    if (ADMIN_EMAIL_ALLOWLIST.has(String(target.email || "").toLowerCase())) return false;
    return currentUserIsAdmin;
  }

  function canChangeUserRole(target) {
    if (!currentUserIsAdmin || !target || !currentUser) return false;
    if (target.id === currentUser.id) return false;
    if (isProtectedAdminAccount(target)) return false;
    return true;
  }

  function setUserRole(target, nextIsAdmin) {
    if (!canChangeUserRole(target)) return;
    const wantAdmin = Boolean(nextIsAdmin);
    const nextDb = ensureSeedUsers({
      ...db,
      users: db.users.map((u) =>
        u.id === target.id
          ? { ...u, isAdmin: wantAdmin, role: wantAdmin ? "admin" : "member" }
          : u
      ),
    });
    setDb(nextDb);
    writeDb(nextDb);
    setSettingsMsg(`Role updated: ${target.name || target.username} is now ${wantAdmin ? "Admin" : "Member"}.`);
  }

  function addInviteUser() {
    if (!currentUser || !currentUserIsAdmin) return;
    const name = addUserName.trim();
    const cleanEmail = addUserEmail.trim().toLowerCase();
    if (!name) {
      setSettingsMsg("Display name is required — it becomes their sign-in username.");
      return;
    }
    if (!cleanEmail.includes("@")) {
      setSettingsMsg("Enter a valid email address for the new user.");
      return;
    }
    if (!slugifyUsername(name)) {
      setSettingsMsg("Display name must include at least one letter or number for the username.");
      return;
    }
    if (!addUserPassword || addUserPassword.length < 6) {
      setSettingsMsg("Password must be at least 6 characters.");
      return;
    }
    if (addUserPassword !== addUserConfirm) {
      setSettingsMsg("Password and confirm password must match.");
      return;
    }
    if (db.users.some((u) => String(u.email).toLowerCase() === cleanEmail)) {
      setSettingsMsg("That email is already registered.");
      return;
    }
    const username = uniqueUsernameFromDisplayName(name, cleanEmail, db.users);
    const newUser = normalizeUserRecord({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      name,
      username,
      email: cleanEmail,
      password: addUserPassword,
      isAdmin: false,
      role: "member",
      createdBy: currentUser.id,
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
    });
    if (ADMIN_EMAIL_ALLOWLIST.has(cleanEmail)) {
      newUser.isAdmin = true;
    }
    const nextDb = ensureSeedUsers({ ...db, users: [...db.users, newUser] });
    setDb(nextDb);
    writeDb(nextDb);
    setSettingsMsg("User added.");
    setAddUserName("");
    setAddUserEmail("");
    setAddUserPassword("");
    setAddUserConfirm("");
  }

  function removeInviteUser(target) {
    if (!canRemoveUser(target)) return;
    const nextDb = ensureSeedUsers({
      ...db,
      users: db.users.filter((u) => u.id !== target.id),
    });
    setDb(nextDb);
    writeDb(nextDb);
    setSettingsMsg("User removed.");
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
    const merged = ensureSeedUsers(nextDb);
    setDb(merged);
    writeDb(merged);
    setSettingsMsg("Email updated.");
    setSettingsCurrentEmail(cleanEmail);
    setSettingsNewEmail("");
    updateRememberedCredentials({ email: cleanEmail });
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
    const merged = ensureSeedUsers(nextDb);
    setDb(merged);
    writeDb(merged);
    setSettingsMsg("Password updated.");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    updateRememberedCredentials({ password: newPassword });
  }

  if (currentUser) {
    const settingsBg = appDarkMode ? "#100D0A" : "#F3F4F6";
    const panelBg = appDarkMode ? "#1A1510" : "#FFFFFF";
    const panelBorder = appDarkMode ? "#3A2B1D" : "#DDE2E8";
    const headingColor = appDarkMode ? "#F8F2E8" : "#2F3B4C";
    const subtleText = appDarkMode ? "#D8C6AE" : "#6F8096";

    return (
      <div style={{ minHeight: "100vh", background: appDarkMode ? "#000000" : "#F3F4F6", position: "relative" }}>
        <ProposalApp
          currentUser={currentUser}
          onOpenSettings={openSettings}
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

        {settingsOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            background: settingsBg,
            padding: 20,
            overflow: "auto",
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

            {currentUserIsAdmin && (
              <div style={{ marginBottom: 12, padding: 12, border: `1px solid ${panelBorder}`, borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: subtleText, marginBottom: 4 }}>User management</div>
                <p style={{ margin: "0 0 12px 0", fontSize: 11, color: subtleText, lineHeight: 1.45 }}>
                  Manage team sign-in accounts on this device. Display name becomes their username for login.
                </p>

                <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${panelBorder}` }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: headingColor, marginBottom: 10 }}>
                    Team members ({db.users.length})
                  </div>
                  {db.users.length === 0 ? (
                    <div style={{ fontSize: 12, color: subtleText }}>No accounts yet.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {[...db.users]
                        .sort((a, b) => {
                          const aYou = a.id === currentUser.id ? 0 : 1;
                          const bYou = b.id === currentUser.id ? 0 : 1;
                          if (aYou !== bYou) return aYou - bYou;
                          return String(a.name || a.username).localeCompare(String(b.name || b.username));
                        })
                        .map((u) => {
                          const isYou = u.id === currentUser.id;
                          const admin = userIsAdmin(u);
                          return (
                            <div
                              key={u.id}
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                alignItems: "center",
                                gap: 8,
                                justifyContent: "space-between",
                                padding: "10px 12px",
                                borderRadius: 8,
                                background: appDarkMode ? "#120E0A" : "#F9FAFB",
                                border: `1px solid ${isYou ? (appDarkMode ? "#5C4A2E" : "#C8A85A") : panelBorder}`,
                              }}
                            >
                              <div style={{ minWidth: 0, flex: "1 1 180px" }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: headingColor }}>
                                  @{u.username || "—"}
                                  {isYou ? " (you)" : ""}
                                </div>
                                <div style={{ fontSize: 12, color: subtleText }}>{u.name || u.email}</div>
                                <div style={{ fontSize: 11, color: subtleText, marginTop: 2 }}>{u.email}</div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                {canChangeUserRole(u) ? (
                                  <select
                                    value={admin ? "admin" : "member"}
                                    onChange={(e) => setUserRole(u, e.target.value === "admin")}
                                    style={{
                                      padding: "6px 10px",
                                      borderRadius: 8,
                                      border: `1px solid ${panelBorder}`,
                                      background: appDarkMode ? "#1A1510" : "#fff",
                                      color: headingColor,
                                      fontSize: 12,
                                      fontFamily: "Inter, system-ui, sans-serif",
                                      cursor: "pointer",
                                    }}
                                  >
                                    <option value="member">Member</option>
                                    <option value="admin">Admin</option>
                                  </select>
                                ) : (
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 700,
                                      textTransform: "uppercase",
                                      letterSpacing: "0.04em",
                                      color: appDarkMode ? "#D4A15A" : "#2F3B4C",
                                      padding: "2px 8px",
                                      borderRadius: 999,
                                      border: `1px solid ${panelBorder}`,
                                    }}
                                  >
                                    {admin ? "Admin" : "Member"}
                                    {isProtectedAdminAccount(u) ? " · Protected" : ""}
                                  </span>
                                )}
                                {!isYou && canRemoveUser(u) && (
                                  <button
                                    type="button"
                                    onClick={() => removeInviteUser(u)}
                                    style={{
                                      padding: "6px 12px",
                                      fontSize: 12,
                                      fontWeight: 600,
                                      cursor: "pointer",
                                      borderRadius: 8,
                                      border: appDarkMode ? "1px solid #5B2921" : "1px solid #F1B8B8",
                                      background: appDarkMode ? "#2D1612" : "#FFF5F5",
                                      color: appDarkMode ? "#F9C8C1" : "#B42318",
                                    }}
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>

                <div style={{ fontSize: 11, fontWeight: 600, color: headingColor, marginBottom: 8 }}>Add member</div>
                <input
                  value={addUserName}
                  onChange={(e) => setAddUserName(e.target.value)}
                  placeholder="Display name (becomes username, e.g. Kerry Turk → kerryturk)"
                  style={themedInputStyle(appDarkMode)}
                />
                {addUserName.trim() && (
                  <div style={{ fontSize: 11, color: subtleText, margin: "-4px 0 8px 0" }}>
                    Sign-in username: <strong style={{ color: headingColor }}>@{uniqueUsernameFromDisplayName(addUserName, addUserEmail, db.users)}</strong>
                  </div>
                )}
                <input
                  value={addUserEmail}
                  onChange={(e) => setAddUserEmail(e.target.value)}
                  placeholder="Email"
                  type="email"
                  autoCapitalize="off"
                  autoCorrect="off"
                  style={themedInputStyle(appDarkMode)}
                />
                <input
                  type="password"
                  value={addUserPassword}
                  onChange={(e) => setAddUserPassword(e.target.value)}
                  placeholder="Initial password"
                  style={themedInputStyle(appDarkMode)}
                />
                <input
                  type="password"
                  value={addUserConfirm}
                  onChange={(e) => setAddUserConfirm(e.target.value)}
                  placeholder="Confirm initial password"
                  style={themedInputStyle(appDarkMode)}
                />
                <button type="button" onClick={addInviteUser} style={themedPrimaryButtonStyle(appDarkMode)}>
                  Add member
                </button>
              </div>
            )}

            {settingsMsg && (
              <div
                style={{
                  color: isSettingsSuccessMessage(settingsMsg) ? "#2A9D8F" : "#F55A5A",
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
        )}
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
          Save login and password
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
