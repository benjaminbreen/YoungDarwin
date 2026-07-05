export const SNARE_ARM_SECONDS = 1.25;
export const SNARE_TRIGGER_RADIUS = 1.02;
export const SNARE_CHARACTER_TRIGGER_RADIUS = 0.64;
export const SNARE_CHECK_AFTER_MINUTES = 20;
export const MAX_ACTIVE_SNARES = 4;

export function snareActorId(specimen) {
  return specimen?.instanceId || specimen?.id || null;
}

export function normalizeSnareSpecimenId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
}

export function isSnareCompatibleSpecimen(specimen) {
  if (!specimen) return false;
  const id = normalizeSnareSpecimenId(specimen.id);
  const name = String(specimen.name || '').toLowerCase();
  const ontology = String(specimen.ontology || '').toLowerCase();
  const order = String(specimen.order || '').toLowerCase();
  const subOrder = String(specimen.sub_order || specimen.subOrder || '').toLowerCase();
  if (ontology !== 'animal') return false;
  if (id.includes('tortoise') || subOrder.includes('tortoise') || name.includes('tortoise')) return false;
  if (id.includes('sealion') || name.includes('sea lion') || order.includes('mammal')) return false;
  if (id.includes('turtle') || id.includes('fish') || id.includes('ray') || order.includes('marine')) return false;
  if (id.includes('booby') || id.includes('frigate') || id.includes('flamingo') || id.includes('penguin')) return false;
  return (
    id.includes('lizard')
    || id.includes('iguana')
    || id.includes('crab')
    || id.includes('finch')
    || id.includes('mockingbird')
    || order.includes('reptile')
    || order.includes('crustacean')
    || order.includes('bird')
  );
}

export function snareTargetLabel(specimen) {
  if (!specimen) return 'small ground animal';
  if (isSnareCompatibleSpecimen(specimen)) return specimen.name || 'small ground animal';
  return null;
}

export function activeSnareStatuses() {
  return new Set(['set', 'sprung', 'sprung-darwin', 'sprung-syms']);
}

export function isActiveSnareTrap(trap) {
  return activeSnareStatuses().has(trap?.status);
}
