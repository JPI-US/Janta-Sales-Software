import React, { useEffect, useState } from "react";
import * as authApi from "./authApi.js";
import { slugifyUsername, uniqueUsernameFromDisplayName } from "../shared/authUsername.js";
import { getAppTheme, pageShellStyle, sectionCardStyle } from "./appTheme.js";
import { PageHeader, RibbonLabeledButton } from "./appIcons.jsx";

function isSettingsSuccessMessage(msg) {
  if (!msg || typeof msg !== "string") return false;
  return /^(Email updated|Password updated|User added|User removed|Role updated)/i.test(msg.trim());
}

function fieldStyle(isDark) {
  const t = getAppTheme(isDark);
  return {
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: "10px 12px",
    marginBottom: 10,
    outline: "none",
    background: t.inputBg,
    color: t.title,
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: 13,
  };
}

function primaryBtnStyle(isDark) {
  const t = getAppTheme(isDark);
  return {
    border: "none",
    borderRadius: 8,
    padding: "10px 14px",
    background: isDark ? t.accent : "#2F3B4C",
    color: isDark ? t.accentText : "#fff",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: 13,
  };
}

function dangerBtnStyle(isDark) {
  const t = getAppTheme(isDark);
  return {
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    borderRadius: 8,
    border: `1px solid ${t.errorBorder}`,
    background: t.errorBg,
    color: t.errorText,
    fontFamily: "Inter, system-ui, sans-serif",
  };
}

function SettingsSection({ theme, title, description, children }) {
  return (
    <section style={{ ...sectionCardStyle(theme), marginBottom: 16 }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: theme.title }}>{title}</h2>
      {description ? (
        <p style={{ margin: "0 0 14px", fontSize: 13, color: theme.subtle, lineHeight: 1.5 }}>{description}</p>
      ) : null}
      {children}
    </section>
  );
}

export default function SettingsPage({ currentUser, isDark, onBack, onUserUpdate }) {
  const theme = getAppTheme(isDark);
  const isAdmin = Boolean(currentUser?.isAdmin);

  const [teamMembers, setTeamMembers] = useState([]);
  const [settingsCurrentEmail, setSettingsCurrentEmail] = useState(currentUser?.email || "");
  const [settingsNewEmail, setSettingsNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [settingsMsg, setSettingsMsg] = useState("");
  const [addUserName, setAddUserName] = useState("");
  const [addUserEmail, setAddUserEmail] = useState("");
  const [addUserPassword, setAddUserPassword] = useState("");
  const [addUserConfirm, setAddUserConfirm] = useState("");

  useEffect(() => {
    setSettingsCurrentEmail(currentUser?.email || "");
  }, [currentUser?.email]);

  useEffect(() => {
    if (!isAdmin) {
      setTeamMembers([]);
      return;
    }
    authApi
      .listTeam()
      .then(setTeamMembers)
      .catch(() => setTeamMembers([]));
  }, [isAdmin]);

  function canRemoveUser(target) {
    if (!target || !currentUser) return false;
    if (target.id === currentUser.id) return false;
    if (target.protected) return false;
    return isAdmin;
  }

  function canChangeUserRole(target) {
    if (!isAdmin || !target || !currentUser) return false;
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
    if (!currentUser || !isAdmin) return;
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
      if (typeof onUserUpdate === "function") onUserUpdate(updated);
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

  return (
    <>
      <PageHeader
        theme={theme}
        title="Settings"
        subtitle={[currentUser?.name, currentUser?.email].filter(Boolean).join(" · ")}
        onBack={onBack}
        backTitle="Back to Projects"
      />

      <main style={{ ...pageShellStyle(), flex: 1, overflow: "auto" }}>
        {settingsMsg ? (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 14px",
              borderRadius: 8,
              fontSize: 13,
              color: isSettingsSuccessMessage(settingsMsg) ? (isDark ? "#6EE7B7" : "#2A9D8F") : theme.errorText,
              background: isSettingsSuccessMessage(settingsMsg) ? (isDark ? "#142A28" : "#ECF8F5") : theme.errorBg,
              border: `1px solid ${isSettingsSuccessMessage(settingsMsg) ? (isDark ? "#2D4A38" : "#CBECE4") : theme.errorBorder}`,
            }}
          >
            {settingsMsg}
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
            alignItems: "start",
          }}
        >
          <SettingsSection theme={theme} title="Email" description="Update the email address tied to your account.">
            <input
              value={settingsCurrentEmail}
              onChange={(e) => setSettingsCurrentEmail(e.target.value)}
              placeholder="Current email"
              style={fieldStyle(isDark)}
            />
            <input
              value={settingsNewEmail}
              onChange={(e) => setSettingsNewEmail(e.target.value)}
              placeholder="New email"
              style={fieldStyle(isDark)}
            />
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              style={fieldStyle(isDark)}
            />
            <button type="button" onClick={saveEmail} style={primaryBtnStyle(isDark)}>
              Update email
            </button>
          </SettingsSection>

          <SettingsSection theme={theme} title="Password" description="Choose a new password for signing in.">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              style={fieldStyle(isDark)}
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              style={fieldStyle(isDark)}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              style={fieldStyle(isDark)}
            />
            <button type="button" onClick={savePassword} style={primaryBtnStyle(isDark)}>
              Update password
            </button>
          </SettingsSection>
        </div>

        {isAdmin ? (
          <SettingsSection
            theme={theme}
            title="Team members"
            description="Manage sign-in accounts. Display name becomes the username for login."
          >
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: theme.subtle, marginBottom: 10 }}>
                Active accounts ({teamMembers.length})
              </div>
              {teamMembers.length === 0 ? (
                <div style={{ fontSize: 13, color: theme.subtle }}>No accounts yet.</div>
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
                            padding: "12px 14px",
                            borderRadius: 8,
                            background: theme.headBg,
                            border: `1px solid ${isYou ? theme.accent : theme.border}`,
                          }}
                        >
                          <div style={{ minWidth: 0, flex: "1 1 180px" }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: theme.title }}>
                              @{u.username || "—"}
                              {isYou ? " (you)" : ""}
                            </div>
                            <div style={{ fontSize: 12, color: theme.subtle }}>{u.name || u.email}</div>
                            <div style={{ fontSize: 11, color: theme.subtle, marginTop: 2 }}>{u.email}</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            {canChangeUserRole(u) ? (
                              <select
                                value={admin ? "admin" : "member"}
                                onChange={(e) => setUserRole(u, e.target.value === "admin")}
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: 8,
                                  border: `1px solid ${theme.border}`,
                                  background: theme.inputBg,
                                  color: theme.title,
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
                                  color: theme.accent,
                                  padding: "2px 8px",
                                  borderRadius: 999,
                                  border: `1px solid ${theme.border}`,
                                }}
                              >
                                {admin ? "Admin" : "Member"}
                                {u.protected ? " · Protected" : ""}
                              </span>
                            )}
                            {!isYou && canRemoveUser(u) ? (
                              <button type="button" onClick={() => removeInviteUser(u)} style={dangerBtnStyle(isDark)}>
                                Remove
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            <div
              style={{
                paddingTop: 16,
                borderTop: `1px solid ${theme.border}`,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 10,
              }}
            >
              <input
                value={addUserName}
                onChange={(e) => setAddUserName(e.target.value)}
                placeholder="Display name"
                style={{ ...fieldStyle(isDark), marginBottom: 0 }}
              />
              <input
                value={addUserEmail}
                onChange={(e) => setAddUserEmail(e.target.value)}
                placeholder="Email"
                type="email"
                autoCapitalize="off"
                autoCorrect="off"
                style={{ ...fieldStyle(isDark), marginBottom: 0 }}
              />
              <input
                type="password"
                value={addUserPassword}
                onChange={(e) => setAddUserPassword(e.target.value)}
                placeholder="Initial password"
                style={{ ...fieldStyle(isDark), marginBottom: 0 }}
              />
              <input
                type="password"
                value={addUserConfirm}
                onChange={(e) => setAddUserConfirm(e.target.value)}
                placeholder="Confirm password"
                style={{ ...fieldStyle(isDark), marginBottom: 0 }}
              />
            </div>
            {addUserName.trim() ? (
              <div style={{ fontSize: 12, color: theme.subtle, margin: "10px 0" }}>
                Sign-in username:{" "}
                <strong style={{ color: theme.title }}>
                  @{uniqueUsernameFromDisplayName(addUserName, addUserEmail, teamMembers)}
                </strong>
              </div>
            ) : null}
            <RibbonLabeledButton theme={theme} variant="primary" onClick={addInviteUser}>
              Add member
            </RibbonLabeledButton>
          </SettingsSection>
        ) : null}
      </main>
    </>
  );
}
