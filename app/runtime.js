export async function engineInfo() {
  return window.desktopSolver
    ? window.desktopSolver.available()
    : fetch("/api/engine").then((r) => r.json());
}
export async function nativeSolve(s, signal, options = {}) {
  if (window.desktopSolver) {
    const id = crypto.randomUUID(),
      cancel = () => window.desktopSolver.cancel(id).catch(() => {}),
      pause = () => window.desktopSolver.pause(id).catch(() => {}),
      unsubscribe = window.desktopSolver.onProgress?.((job, progress) => {
        if (job === id) options.onProgress?.(progress);
      });
    signal.addEventListener("abort", cancel, { once: true });
    options.pauseSignal?.addEventListener("abort", pause, { once: true });
    try {
      signal.throwIfAborted();
      return await window.desktopSolver.solve(s, id, {
        checkpoint: !!options.checkpoint,
        resume: !!options.resume,
      });
    } finally {
      signal.removeEventListener("abort", cancel);
      options.pauseSignal?.removeEventListener("abort", pause);
      unsubscribe?.();
    }
  }
  const response = await fetch("/api/solve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(s),
    signal,
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Native solve failed");
  return data;
}
