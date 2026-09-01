import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { fontSans, getAppTheme } from "./appTheme.js";
import { mountEmailStudio, unmountEmailStudio } from "./email-studio/bootstrap.js";
import { logEmailCampaign, scheduleEmailStudioCloudSave } from "./emailStudioApi.js";
import { resolveEmailTemplate } from "./emailStudioStoreBridge.js";
import EmailStudioLibrary from "./EmailStudioLibrary.jsx";

export default function EmailStudioPage({
  isDark,
  accountKey,
  templateId,
  userName,
  userEmail,
  onActiveTemplateChange,
  onPinsChanged,
  autoOpenCreate = false,
  autoOpenCreateFolderId = null,
  onAutoOpenCreateHandled,
}) {
  const rootRef = useRef(null);
  const studioRef = useRef(null);
  const t = getAppTheme(isDark);
  const [editorId, setEditorId] = useState(templateId || null);
  const [openError, setOpenError] = useState(null);
  const [studioReady, setStudioReady] = useState(false);

  useEffect(() => {
    if (templateId) setEditorId(templateId);
  }, [templateId]);

  function paintEditor(id) {
    if (!id || !studioRef.current) return;
    studioRef.current.navigateToTemplate(id);
  }

  // Mount the vanilla studio once per account — do not tear down when returning to library.
  useLayoutEffect(() => {
    if (!accountKey || !rootRef.current) return undefined;

    const instance = mountEmailStudio(rootRef.current, {
      accountKey,
      onPersist: (state) => scheduleEmailStudioCloudSave(accountKey, state),
      onExitToLibrary: () => {
        setEditorId(null);
        onActiveTemplateChange?.(null);
      },
      onCopyHtml: async ({ templateId: tid, doc, title, kind }) => {
        try {
          await logEmailCampaign({
            templateId: tid,
            title: title || "Untitled email",
            subject: "",
            kind: kind || "custom",
          });
        } catch {
          // campaign log is best-effort
        }
      },
    });
    studioRef.current = instance;
    setStudioReady(true);

    return () => {
      studioRef.current = null;
      setStudioReady(false);
      unmountEmailStudio();
    };
  }, [accountKey]);

  // Open the requested draft — paint immediately, then verify after store init/hydrate.
  useEffect(() => {
    if (!accountKey || !editorId || !studioReady) return undefined;

    let cancelled = false;
    setOpenError(null);
    paintEditor(editorId);

    (async () => {
      const tpl = await resolveEmailTemplate(accountKey, editorId);
      if (cancelled) return;

      if (!tpl) {
        setOpenError("That email could not be found. It may not have finished saving.");
        setEditorId(null);
        onActiveTemplateChange?.(null);
        return;
      }

      paintEditor(editorId);
    })();

    return () => {
      cancelled = true;
    };
  }, [accountKey, editorId, studioReady]);

  function openTemplate(id) {
    setOpenError(null);
    setEditorId(id);
    onActiveTemplateChange?.(id);
    paintEditor(id);
  }

  const shellStyle = {
    flex: 1,
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    background: t.bg,
    fontFamily: fontSans,
    overflow: "hidden",
  };

  return (
    <div style={shellStyle}>
      {openError ? (
        <div
          style={{
            padding: "12px 16px",
            margin: "12px 16px 0",
            borderRadius: 8,
            background: isDark ? "rgba(220, 38, 38, 0.12)" : "rgba(254, 226, 226, 0.9)",
            color: isDark ? "#fca5a5" : "#991b1b",
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          {openError}
        </div>
      ) : null}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: editorId ? "none" : "flex",
          flexDirection: "column",
        }}
      >
        <EmailStudioLibrary
          isDark={isDark}
          accountKey={accountKey}
          userName={userName}
          userEmail={userEmail}
          onOpenTemplate={openTemplate}
          onPinsChanged={onPinsChanged}
          autoOpenCreate={autoOpenCreate}
          autoOpenCreateFolderId={autoOpenCreateFolderId}
          onAutoOpenCreateHandled={onAutoOpenCreateHandled}
        />
      </div>

      <div
        className={`email-studio-root ${isDark ? "is-dark" : "is-light"}`}
        ref={rootRef}
        style={{
          flex: 1,
          minHeight: 0,
          display: editorId ? "flex" : "none",
          flexDirection: "column",
        }}
      />
    </div>
  );
}
