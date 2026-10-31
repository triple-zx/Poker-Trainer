const cancelled = () =>
  Object.assign(new Error("Analysis cancelled"), { name: "AbortError" });

// One worker/cache per explorer. Serialize requests so cancellation of a queued
// report does not kill another report; cancelling the active job replaces its
// worker before starting the next queued job. Late replies are never accepted.
export function createAnalysisClient(
  factory = () =>
    new Worker(new URL("./node-analysis-worker.js", import.meta.url), {
      type: "module",
    }),
) {
  let worker = null,
    active = null,
    nextId = 0,
    disposed = false;
  const queue = [];
  const stop = () => {
    worker?.terminate();
    worker = null;
  };
  function start() {
    if (disposed || active || !queue.length) return;
    active = queue.shift();
    try {
      if (!worker) {
        const instance = (worker = factory());
        worker.onmessage = ({ data }) => {
          if (worker !== instance || !active || data.id !== active.id) return;
          const done = active;
          active = null;
          if (data.error !== undefined)
            done.reject(new Error(data.error || "Analysis failed"));
          else done.resolve(data.report);
          start();
        };
        const failed = (event) => {
          if (worker !== instance) return;
          const done = active;
          active = null;
          stop();
          done?.reject(new Error(event.message || "Analysis worker failed"));
          start();
        };
        worker.onerror = failed;
        worker.onmessageerror = failed;
      }
      worker.postMessage({ ...active.data, id: active.id });
    } catch (error) {
      const done = active;
      active = null;
      stop();
      done.reject(error);
      start();
    }
  }
  function request(data) {
    const job = { id: ++nextId, data };
    const promise = new Promise((resolve, reject) => {
      job.resolve = resolve;
      job.reject = reject;
    });
    if (disposed) job.reject(cancelled());
    else {
      queue.push(job);
      start();
    }
    return {
      promise,
      cancel() {
        if (active === job) {
          active = null;
          stop();
          job.reject(cancelled());
          start();
        } else {
          const index = queue.indexOf(job);
          if (index >= 0) {
            queue.splice(index, 1);
            job.reject(cancelled());
          }
        }
      },
    };
  }
  function cancelAll() {
    for (const job of queue.splice(0)) job.reject(cancelled());
    if (active) {
      const done = active;
      active = null;
      stop();
      done.reject(cancelled());
    }
  }
  return {
    request,
    cancelAll,
    dispose() {
      disposed = true;
      cancelAll();
      stop();
    },
  };
}
