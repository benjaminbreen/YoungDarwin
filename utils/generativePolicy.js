const EXPLICITLY_DISABLED_VALUES = new Set(['0', 'false', 'off']);

export function enabledUnlessExplicitlyDisabled(value) {
  return !EXPLICITLY_DISABLED_VALUES.has(String(value ?? '').trim().toLowerCase());
}

export function narratorGenerationEnabled(narratorSetting, legacyGenerativeSetting) {
  return enabledUnlessExplicitlyDisabled(narratorSetting ?? legacyGenerativeSetting);
}
