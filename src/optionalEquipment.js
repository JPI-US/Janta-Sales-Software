export function newEquipmentId() {
  return `eq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createEmptyEquipment(kind) {
  return { id: newEquipmentId(), kind, name: "", unitCost: "", quantity: 1 };
}

export function parseEquipmentUnitCost(value) {
  return Math.max(0, parseFloat(String(value).replace(/,/g, "")) || 0);
}

export function equipmentQuantity(value) {
  return Math.max(1, Math.round(Number(value) || 1));
}

export function equipmentLineTotal(item) {
  return parseEquipmentUnitCost(item.unitCost) * equipmentQuantity(item.quantity);
}

export function equipmentHasContent(item) {
  return String(item.name || "").trim() !== "" || parseEquipmentUnitCost(item.unitCost) > 0;
}

export function activeEquipmentItems(items) {
  return (items || []).filter(equipmentHasContent);
}

export function formatEquipmentLabel(item) {
  const fallback = item.kind === "generator" ? "Generator" : "Battery Storage";
  const name = String(item.name || "").trim() || fallback;
  const qty = equipmentQuantity(item.quantity);
  return qty > 1 ? `${name} ×${qty}` : name;
}

export function equipmentSummaryLine(item) {
  const total = equipmentLineTotal(item);
  return `${formatEquipmentLabel(item)}${total > 0 ? ` ($${Math.round(total).toLocaleString()})` : ""}`;
}

export function normalizeOptionalEquipment(snapshot) {
  if (Array.isArray(snapshot?.optionalEquipment)) {
    return snapshot.optionalEquipment.map((item) => ({
      id: item.id || newEquipmentId(),
      kind: item.kind === "generator" ? "generator" : "battery",
      name: String(item.name || ""),
      unitCost: item.unitCost != null ? String(item.unitCost) : "",
      quantity: equipmentQuantity(item.quantity),
    }));
  }
  const legacy = [];
  if (String(snapshot?.batteryName || "").trim() || parseEquipmentUnitCost(snapshot?.batteryCost) > 0) {
    legacy.push({
      id: newEquipmentId(),
      kind: "battery",
      name: String(snapshot.batteryName || ""),
      unitCost: snapshot.batteryCost != null ? String(snapshot.batteryCost) : "",
      quantity: 1,
    });
  }
  if (String(snapshot?.generatorName || "").trim() || parseEquipmentUnitCost(snapshot?.generatorCost) > 0) {
    legacy.push({
      id: newEquipmentId(),
      kind: "generator",
      name: String(snapshot.generatorName || ""),
      unitCost: snapshot.generatorCost != null ? String(snapshot.generatorCost) : "",
      quantity: 1,
    });
  }
  return legacy;
}

export function patchEquipmentItem(items, id, patch) {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

export function presetCostForEquipment(name, presets) {
  const hit = presets.find((p) => p.label === name);
  return hit?.cost != null ? String(hit.cost) : null;
}

/** Keep at least one editable battery row and one generator row (original panel layout). */
export function ensureEquipmentEditorRows(items) {
  const next = Array.isArray(items) ? [...items] : [];
  if (!next.some((item) => item.kind === "battery")) next.push(createEmptyEquipment("battery"));
  if (!next.some((item) => item.kind === "generator")) next.push(createEmptyEquipment("generator"));
  return next;
}

export function sortEquipmentForEditor(items) {
  return [...items].sort((a, b) => {
    if (a.kind === b.kind) return 0;
    return a.kind === "battery" ? -1 : 1;
  });
}

export function equipmentRowsOfKind(items, kind) {
  return (items || []).filter((item) => item.kind === kind);
}

export function collapseEquipmentForStorage(items) {
  const filled = activeEquipmentItems(items);
  return filled.length > 0 ? filled : [];
}
