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

  const add = clips => {
    let added = 0;
    for (const clip of clips || []) {
      if (!clip?.name) continue;
      const normalized = normalizeClipName(clip.name);
      // Animation banks extend the boot registry. Never replace an existing
      // clip/action while the mixer may still be playing it (including during
      // React Fast Refresh or a duplicate bank notification).
      if (clipLookup.has(clip.name) || clipLookup.has(normalized)) continue;
      availableNames.push(clip.name);
      clipLookup.set(clip.name, clip);
      clipLookup.set(normalized, clip);
      added += 1;
    }
    return added;
  };

  add(animations);

  const resolveClip = name => {
    if (!name) return null;
    return clipLookup.get(name) || clipLookup.get(normalizeClipName(name)) || null;
  };

  return {
    availableNames,
    add,
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
