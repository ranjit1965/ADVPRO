import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs an async loader and tracks loading / error / data.
 * Re-runs when `deps` change; `reload()` re-runs on demand.
 */
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const callId = useRef(0);

  const run = useCallback(() => {
    callId.current += 1;
    const id = callId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    return loader()
      .then((data) => id === callId.current && setState({ data, loading: false, error: null }))
      .catch((error) => id === callId.current && setState((s) => ({ ...s, loading: false, error: error.message || 'Unexpected error' })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return { ...state, reload: run };
}
