import React from "react";
import { TableIconButton, tableActionBtnStyle } from "./appIcons.jsx";
import EmptyTablePlaceholder from "./EmptyTablePlaceholder.jsx";

const CELL_PAD = "6px 8px";

export default function EmailFilesTable({
  title,
  rows,
  isDark,
  panel,
  border,
  titleColor,
  subtle,
  headBg,
  emptyHint,
  onOpen,
  onPin,
  onDelete,
  isPinned,
  isTemplateSection = false,
  formatUpdated,
  embedded = false,
  onEmptyAction,
  onEmptyContextMenu,
  emptyActionLabel,
}) {
  const tableBody =
    rows.length === 0 ? (
      <EmptyTablePlaceholder
        isDark={isDark}
        subtle={subtle}
        hint={emptyHint}
        actionLabel={emptyActionLabel}
        onAction={isTemplateSection ? undefined : onEmptyAction}
        onContextMenu={isTemplateSection ? undefined : onEmptyContextMenu}
      />
    ) : (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 520 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${border}`, background: headBg }}>
              <th style={{ textAlign: "left", padding: CELL_PAD, fontWeight: 700, color: titleColor }}>Title</th>
              <th style={{ textAlign: "left", padding: CELL_PAD, fontWeight: 700, color: titleColor, width: 120 }}>
                Updated
              </th>
              <th style={{ textAlign: "left", padding: CELL_PAD, fontWeight: 700, color: titleColor, width: 100 }}>
                Type
              </th>
              <th style={{ textAlign: "right", padding: CELL_PAD, fontWeight: 700, color: titleColor, width: 140 }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isBuiltin = row.kind === "builtin";
              const pinned = !isBuiltin && typeof isPinned === "function" ? isPinned(row.id) : false;
              return (
                <tr key={row.id} style={{ borderBottom: `1px solid ${border}` }}>
                  <td style={{ padding: CELL_PAD, fontWeight: 600, color: titleColor }}>{row.title || "Untitled email"}</td>
                  <td style={{ padding: CELL_PAD, color: subtle, whiteSpace: "nowrap" }}>
                    {formatUpdated(row.updatedAt)}
                  </td>
                  <td style={{ padding: CELL_PAD, color: subtle }}>{isBuiltin ? "Template" : "Custom"}</td>
                  <td style={{ padding: CELL_PAD }}>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                      <button type="button" onClick={() => onOpen?.(row)} style={tableActionBtnStyle(isDark, "primary")}>
                        {isBuiltin ? "Edit copy" : "Open"}
                      </button>
                      {!isBuiltin && onPin ? (
                        <TableIconButton
                          isDark={isDark}
                          icon="pin"
                          title={pinned ? "Unpin from sidebar" : "Pin to sidebar"}
                          onClick={() => onPin(row)}
                          style={
                            pinned
                              ? { borderColor: "#3a84dc", color: "#3a84dc", background: isDark ? "#1a2332" : "#eef4fb" }
                              : undefined
                          }
                        />
                      ) : null}
                      {!isBuiltin && onDelete ? (
                        <TableIconButton
                          isDark={isDark}
                          icon="trash"
                          tone="danger"
                          title="Delete email"
                          onClick={() => onDelete(row)}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );

  if (embedded) {
    return <div style={{ background: panel }}>{tableBody}</div>;
  }

  return (
    <div
      style={{
        background: panel,
        border: `1px solid ${border}`,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "12px 14px",
          borderBottom: `1px solid ${border}`,
          background: headBg,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14, color: titleColor }}>{title}</div>
      </div>
      {tableBody}
    </div>
  );
}

export function formatEmailUpdated(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}
