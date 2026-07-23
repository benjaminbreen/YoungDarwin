export function examinationDepthOfFieldActive(session) {
  return Boolean(session?.focus);
}

export function postprocessingComposerActive(generalPostprocessingEnabled, session) {
  return Boolean(generalPostprocessingEnabled) || examinationDepthOfFieldActive(session);
}
