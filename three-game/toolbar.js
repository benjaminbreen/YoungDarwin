export const DARWIN_TOOLBAR_SLOT_COUNT = 6;

export const DEFAULT_DARWIN_TOOLBAR = Object.freeze([
  'shotgun',
  'insect_net',
  'snare',
  'hammer',
  'hands',
  'sketch',
]);

export function assignToolbarSlot(toolbarOrder, slotIndex, toolId, availableToolIds = []) {
  if (!Array.isArray(toolbarOrder) || !Number.isInteger(slotIndex)) return toolbarOrder;
  if (slotIndex < 0 || slotIndex >= toolbarOrder.length || !toolId) return toolbarOrder;
  if (availableToolIds.length > 0 && !availableToolIds.includes(toolId)) return toolbarOrder;

  const currentToolId = toolbarOrder[slotIndex];
  if (currentToolId === toolId) return toolbarOrder;

  const next = [...toolbarOrder];
  const existingIndex = next.indexOf(toolId);
  next[slotIndex] = toolId;

  // A field tool can only occupy one quick-bar slot. Dropping a tool that is
  // already present swaps it with the target instead of silently duplicating
  // it or shortening the six-slot bar.
  if (existingIndex >= 0) next[existingIndex] = currentToolId;
  return next;
}

export function moveToolbarSlot(toolbarOrder, fromIndex, toIndex) {
  if (!Array.isArray(toolbarOrder) || !Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return toolbarOrder;
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= toolbarOrder.length || toIndex >= toolbarOrder.length) {
    return toolbarOrder;
  }
  const next = [...toolbarOrder];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}
