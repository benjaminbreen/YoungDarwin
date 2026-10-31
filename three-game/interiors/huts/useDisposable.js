import { useEffect, useMemo } from 'react';

// useMemo for GPU resources: whatever the factory returns — a geometry, an
// array of them, or an object of them — is disposed when it is replaced or
// the component unmounts.
export function useDisposable(factory, deps) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(factory, deps);
  useEffect(() => () => {
    if (Array.isArray(value)) value.forEach(item => item?.dispose?.());
    else if (value?.dispose) value.dispose();
    else if (value && typeof value === 'object') Object.values(value).forEach(item => item?.dispose?.());
  }, [value]);
  return value;
}
