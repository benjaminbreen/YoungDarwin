function defaultNormalizeClipName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function createLazyAnimationActions({
  animations = [],
  mixer,
  root,
  normalizeClipName = defaultNormalizeClipName,
}) {
  const clipLookup = new Map();
  const actionCache = new Map();
  const availableNames = [];

  for (const clip of animations) {
    if (!clip?.name) continue;
    availableNames.push(clip.name);
    clipLookup.set(clip.name, clip);
    clipLookup.set(normalizeClipName(clip.name), clip);
  }

  const resolveClip = name => {
    if (!name) return null;
    return clipLookup.get(name) || clipLookup.get(normalizeClipName(name)) || null;
  };

  return {
    availableNames,
    has: name => Boolean(resolveClip(name)),
    get size() {
      return actionCache.size;
    },
    get(name) {
      const clip = resolveClip(name);
      if (!clip || !mixer) return null;
      let action = actionCache.get(clip);
      if (!action) {
        action = mixer.clipAction(clip, root);
        actionCache.set(clip, action);
      }
      return action;
    },
    stopAll() {
      actionCache.forEach(action => action?.stop?.());
    },
    dispose() {
      actionCache.forEach((action, clip) => {
        action?.stop?.();
        mixer?.uncacheAction?.(clip, root);
      });
      actionCache.clear();
    },
  };
}
