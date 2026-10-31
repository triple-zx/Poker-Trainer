export function analysisTask(content, t, request, render) {
  let job = null,
    revision = 0,
    disposed = false,
    ready = false;
  const note = (text) => {
    const p = document.createElement("p");
    p.textContent = text;
    content.append(p);
  };
  const button = (text, action, className) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.className = className;
    b.onclick = action;
    content.append(b);
  };
  function retry(message) {
    content.replaceChildren();
    note(message);
    button(t("Retry analysis", "重试分析"), load, "analysis-retry");
  }
  async function load() {
    if (disposed || job || ready) return;
    const token = ++revision;
    content.replaceChildren();
    content.setAttribute("aria-busy", "true");
    note(
      t(
        "Calculating report… You can keep exploring or cancel.",
        "正在计算报告… 可继续浏览或取消。",
      ),
    );
    button(
      t("Cancel analysis", "取消分析"),
      () => job?.cancel(),
      "analysis-cancel",
    );
    try {
      job = request();
      const report = await job.promise;
      if (disposed || token !== revision || !content.isConnected) return;
      content.replaceChildren();
      render(report);
      ready = true;
    } catch (error) {
      if (disposed || token !== revision || !content.isConnected) return;
      retry(
        error.name === "AbortError"
          ? t("Analysis cancelled.", "分析已取消。")
          : error.message,
      );
    } finally {
      if (token === revision) {
        job = null;
        content.removeAttribute("aria-busy");
      }
    }
  }
  function cancel() {
    if (!job) return;
    revision++;
    job.cancel();
    job = null;
    content.removeAttribute("aria-busy");
    if (!disposed) retry(t("Analysis cancelled.", "分析已取消。"));
  }
  return {
    load,
    cancel,
    get ready() {
      return ready;
    },
    dispose() {
      disposed = true;
      cancel();
    },
  };
}
