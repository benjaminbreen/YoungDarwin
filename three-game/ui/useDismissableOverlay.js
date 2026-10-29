'use client';

import { useEffect, useRef, useState } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableWithin(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE))
    .filter(node => node.offsetWidth > 0 || node.offsetHeight > 0 || node === document.activeElement);
}

// One stack for every open overlay. Only the topmost one answers Escape and
// owns Tab, so a single Escape closes a single layer: the specimen detail over
// the case, not the case, the journal and the pause menu behind it all at once.
// Each hook used to add its own window listener and call stopPropagation, which
// does not stop other listeners on the same node, so every open layer closed.
const layers = [];
const stackListeners = new Set();
let nextLayerId = 1;

function notifyStack() {
  stackListeners.forEach(listener => listener(layers.length));
}

function topLayer() {
  return layers[layers.length - 1] || null;
}

function trapTab(event, container) {
  const nodes = focusableWithin(container);
  if (nodes.length === 0) {
    // Nothing focusable inside: keep focus on the panel rather than letting
    // it fall through to the game behind the scrim.
    event.preventDefault();
    container?.focus?.({ preventScroll: true });
    return;
  }
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !container?.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !container?.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

function onStackKeyDown(event) {
  const layer = topLayer();
  if (!layer) return;
  if (event.key === 'Escape' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) layer.onCloseRef.current?.();
    return;
  }
  if (event.key === 'Tab' && layer.trapFocus) trapTab(event, layer.containerRef.current);
}

function pushLayer(layer) {
  if (layers.length === 0 && typeof window !== 'undefined') {
    // Capture phase so the overlay wins over the gameplay key handlers that
    // listen on window.
    window.addEventListener('keydown', onStackKeyDown, true);
  }
  layers.push(layer);
  notifyStack();
}

function removeLayer(id) {
  const index = layers.findIndex(layer => layer.id === id);
  if (index < 0) return;
  layers.splice(index, 1);
  if (layers.length === 0 && typeof window !== 'undefined') {
    window.removeEventListener('keydown', onStackKeyDown, true);
  }
  notifyStack();
}

// True while any overlay is open. Global hotkeys (?, H, Cmd+I, the sketchbook
// digit) check this so they never stack a second panel over the first.
export function isOverlayOpen() {
  return layers.length > 0;
}

export function useOverlayOpen() {
  const [open, setOpen] = useState(() => layers.length > 0);
  useEffect(() => {
    const listener = count => setOpen(count > 0);
    stackListeners.add(listener);
    setOpen(layers.length > 0);
    return () => stackListeners.delete(listener);
  }, []);
  return open;
}

/**
 * Shared behavior for the expedition's full-screen overlays: Escape closes the
 * topmost one, Tab cycles inside it instead of escaping into the scene behind
 * it, and focus returns to whatever opened it when it closes.
 *
 * Returns a ref to attach to the panel element.
 */
export function useDismissableOverlay(open, onClose, { trapFocus = true, autoFocus = true } = {}) {
  const containerRef = useRef(null);
  const restoreFocusRef = useRef(null);
  // Callers pass inline arrows (`onClose={() => setMapOpen(false)}`), so keeping
  // onClose as an effect dependency would tear down and re-run setup on every
  // parent render — which re-stole focus back to the first control mid-
  // interaction. The listener reads through this ref so the effects below
  // depend only on `open`.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Focus capture/restore runs only on the open/close transition.
  useEffect(() => {
    if (!open) return undefined;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    if (autoFocus) {
      // Prefer a real control so screen readers and keyboard users land inside
      // the panel; fall back to the panel itself.
      const [first] = focusableWithin(containerRef.current);
      (first || containerRef.current)?.focus?.({ preventScroll: true });
    }
    return () => {
      const restore = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (restore && document.contains(restore)) restore.focus?.({ preventScroll: true });
    };
  }, [autoFocus, open]);

  useEffect(() => {
    if (!open) return undefined;
    const id = nextLayerId++;
    pushLayer({ id, containerRef, onCloseRef, trapFocus });
    return () => removeLayer(id);
  }, [open, trapFocus]);

  return containerRef;
}
