export async function engineInfo() {
  return window.desktopSolver
    ? window.desktopSolver.available()
    : fetch("/api/engine").then((r) => r.json());
}
export async function nativeSolve(s, signal) {
  if (window.desktopSolver) {
    const id = crypto.randomUUID(),
      cancel = () => window.desktopSolver.cancel(id).catch(() => {});
    signal.addEventListener("abort", cancel, { once: true });
    try {
      return await window.desktopSolver.solve(s, id);
    } finally {
      signal.removeEventListener("abort", cancel);
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
