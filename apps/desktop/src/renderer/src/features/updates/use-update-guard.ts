import { useEffect, useRef } from 'react';

const guards = new Set<() => void | Promise<void>>();
export function useUpdateGuard(guard: () => void | Promise<void>) {
  const latest = useRef(guard);
  latest.current = guard;
  useEffect(() => {
    const run = () => latest.current();
    guards.add(run);
    return () => {
      guards.delete(run);
    };
  }, []);
}
export async function prepareUpdate() {
  for (const guard of guards) await guard();
}
