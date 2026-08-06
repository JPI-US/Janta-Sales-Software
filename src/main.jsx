import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import ProposalApp from "./ProposalApp.jsx";
import * as authApi from "./authApi.js";
import { slugifyUsername, uniqueUsernameFromDisplayName } from "../shared/authUsername.js";

const THEME_KEY = "janta_dark_mode_v1";

function isSettingsSuccessMessage(msg) {
  if (!msg || typeof msg !== "string") return false;
  return /^(Email updated|Password updated|User added|User removed|Role updated)/i.test(msg.trim());
}

function AuthGate() {
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [rememberLogin, setRememberLogin] = useState(false);
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

  const currentUserIsAdmin = Boolean(currentUser?.isAdmin);

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
    } catch (err) {
      setError(err.message || "Invalid username/email or password.");
    }
  }

  async function handleSignOut() {
    const uid = currentUser?.id;
    try {
      await authApi.logout();
    } catch (_err) {
      // ignore — cookie is cleared client-side regardless
    }
    setCurrentUser(null);
    setTeamMembers([]);
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
    if (currentUserIsAdmin) {
      authApi
        .listTeam()
        .then(setTeamMembers)
        .catch(() => setTeamMembers([]));
    }
  }

  /** Only removable if not you and not a protected (bootstrap) admin account. */
  function canRemoveUser(target) {
    if (!target || !currentUser) return false;
    if (target.id === currentUser.id) return false;
    if (target.protected) return false;
    return currentUserIsAdmin;
  }

  function canChangeUserRole(target) {
    if (!currentUserIsAdmin || !target || !currentUser) return false;
    if (target.id === currentUser.id) return false;
    if (target.protected) return false;
    return true;
  }

  async function setUserRole(target, nextIsAdmin) {
    if (!canChangeUserRole(target)) return;
    const wantAdmin = Boolean(nextIsAdmin);
    try {
      const updated = await authApi.setTeamMemberRole(target.id, wantAdmin);
      setTeamMembers((prev) => prev.map((u) => (u.id === target.id ? updated : u)));
      setSettingsMsg(`Role updated: ${target.name || target.username} is now ${wantAdmin ? "Admin" : "Member"}.`);
    } catch (err) {
      setSettingsMsg(err.message || "Could not update role.");
    }
  }

  async function addInviteUser() {
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
    try {
      const created = await authApi.addTeamMember(name, cleanEmail, addUserPassword);
      setTeamMembers((prev) => [...prev, created]);
      setSettingsMsg("User added.");
      setAddUserName("");
      setAddUserEmail("");
      setAddUserPassword("");
      setAddUserConfirm("");
    } catch (err) {
      setSettingsMsg(err.message || "Could not add user.");
    }
  }

  async function removeInviteUser(target) {
    if (!canRemoveUser(target)) return;
    try {
      await authApi.removeTeamMember(target.id);
      setTeamMembers((prev) => prev.filter((u) => u.id !== target.id));
      setSettingsMsg("User removed.");
    } catch (err) {
      setSettingsMsg(err.message || "Could not remove user.");
    }
  }

  async function saveEmail() {
    if (!currentUser) return;
    const currentEmailInput = settingsCurrentEmail.trim().toLowerCase();
    const cleanEmail = settingsNewEmail.trim().toLowerCase();
    if (!currentEmailInput) {
      setSettingsMsg("Current email is required.");
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
    try {
      const updated = await authApi.updateEmail(currentEmailInput, cleanEmail, currentPassword);
      setCurrentUser(updated);
      setSettingsMsg("Email updated.");
      setSettingsCurrentEmail(updated.email);
      setSettingsNewEmail("");
      setCurrentPassword("");
    } catch (err) {
      setSettingsMsg(err.message || "Could not update email.");
    }
  }

  async function savePassword() {
    if (!currentUser) return;
    if (!currentPassword) {
      setSettingsMsg("Enter current password to change password.");
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
    try {
      await authApi.updatePassword(currentPassword, newPassword);
      setSettingsMsg("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setSettingsMsg(err.message || "Could not update password.");
    }
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0F141A" }}>
        <div style={{ color: "#8FA0B3", fontFamily: "Inter, system-ui, sans-serif", fontSize: 13 }}>Loading…</div>
      </div>
    );
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
                  Manage team sign-in accounts. Display name becomes their username for login.
                </p>

                <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${panelBorder}` }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: headingColor, marginBottom: 10 }}>
                    Team members ({teamMembers.length})
                  </div>
                  {teamMembers.length === 0 ? (
                    <div style={{ fontSize: 12, color: subtleText }}>No accounts yet.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {[...teamMembers]
                        .sort((a, b) => {
                          const aYou = a.id === currentUser.id ? 0 : 1;
                          const bYou = b.id === currentUser.id ? 0 : 1;
                          if (aYou !== bYou) return aYou - bYou;
                          return String(a.name || a.username).localeCompare(String(b.name || b.username));
                        })
                        .map((u) => {
                          const isYou = u.id === currentUser.id;
                          const admin = Boolean(u.isAdmin);
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
                                    {u.protected ? " · Protected" : ""}
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
                    Sign-in username: <strong style={{ color: headingColor }}>@{uniqueUsernameFromDisplayName(addUserName, addUserEmail, teamMembers)}</strong>
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
