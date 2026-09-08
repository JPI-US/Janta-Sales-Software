import React, { useState } from "react";
import * as authApi from "./authApi.js";

/**
 * Shown instead of the app when the signed-in account still has
 * `mustChangePassword` set — i.e. it is on an admin-issued temporary password.
 * The matching server-side gate (server/auth/passwordGate.js) blocks the rest
 * of the API until this succeeds, so this screen cannot simply be skipped.
 */
export default function ForcePasswordChange({ user, onUserUpdate, onSignOut }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!currentPassword) {
      setError("Enter the temporary password you were given.");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirm password must match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Choose a password different from the temporary one.");
      return;
    }
    setSaving(true);
    try {
      const updated = await authApi.updatePassword(currentPassword, newPassword);
      setError("");
      if (typeof onUserUpdate === "function") onUserUpdate(updated);
    } catch (err) {
      setError(err.message || "Could not set your password.");
    } finally {
      setSaving(false);
    }
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
        padding: "16px",
        margin: 0,
        boxSizing: "border-box",
      }}
    >
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
      <div style={{ position: "absolute", inset: 0, background: "rgba(0, 0, 0, 0.19)" }} />
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
        <h2 style={{ margin: "0 0 4px 0", color: "#1A2233" }}>Set your password</h2>
        <p style={{ margin: "0 0 14px 0", color: "#6B7A90", fontSize: 13 }}>
          Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}. Your account is on a temporary
          password. Choose your own to continue.
        </p>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Temporary password"
          style={inputStyle}
        />
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password"
          style={inputStyle}
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Confirm new password"
          style={inputStyle}
        />

        {error ? <div style={{ color: "#F55A5A", fontSize: 12, marginBottom: 10 }}>{error}</div> : null}

        <button
          type="button"
          onClick={submit}
          disabled={saving}
          style={{
            width: "100%",
            border: "none",
            borderRadius: 8,
            padding: "10px 12px",
            background: "#0B2545",
            color: "#fff",
            fontWeight: 600,
            cursor: saving ? "default" : "pointer",
            opacity: saving ? 0.7 : 1,
            marginBottom: 10,
          }}
        >
          {saving ? "Saving…" : "Save password and continue"}
        </button>
        <button
          type="button"
          onClick={onSignOut}
          style={{
            width: "100%",
            border: "none",
            background: "transparent",
            color: "#6B7A90",
            fontSize: 12,
            cursor: "pointer",
            padding: 0,
          }}
        >
          Sign out
        </button>
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
