'use client';

import { useEffect, useRef } from 'react';

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

/**
 * Shared behavior for the expedition's full-screen overlays: Escape closes,
 * Tab cycles inside the panel instead of escaping into the scene behind it, and
 * focus returns to whatever opened the overlay when it closes.
 *
 * The journal, island chart, and inventory previously dismissed on backdrop
 * click only, while six other modals handled Escape — the inconsistency read as
 * a bug. Returns a ref to attach to the panel element.
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

    const onKeyDown = event => {
      if (event.key === 'Escape' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (!trapFocus || event.key !== 'Tab') return;
      const nodes = focusableWithin(containerRef.current);
      if (nodes.length === 0) {
        // Nothing focusable inside: keep focus on the panel rather than letting
        // it fall through to the game behind the scrim.
        event.preventDefault();
        containerRef.current?.focus?.({ preventScroll: true });
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !containerRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // Capture phase so the overlay wins over the gameplay key handlers that
    // listen on window.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, trapFocus]);

  return containerRef;
}
