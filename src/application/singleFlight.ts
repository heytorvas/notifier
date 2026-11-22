export function singleFlight(task: () => Promise<unknown>): () => void {
  let pending = false;
  return () => {
    if (pending) return;
    pending = true;
    void Promise.resolve(task()).finally(() => {
      pending = false;
    });
  };
}
