import { useLayoutEffect, useRef } from 'react';

// React development effect replay reuses memoized resources. Cancelling a
// pending release preserves async texture subscriptions until a real unmount.
export function useDeferredDisposal(resource, dispose) {
  const timers = useRef(new Map());
  useLayoutEffect(() => {
    const pending = timers.current;
    clearTimeout(pending.get(resource));
    pending.delete(resource);
    return () => {
      pending.set(resource, setTimeout(() => {
        pending.delete(resource);
        dispose(resource);
      }, 0));
    };
  }, [resource, dispose]);
}
