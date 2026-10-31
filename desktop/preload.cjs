const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktopSolver", {
  available: () => ipcRenderer.invoke("solver:available"),
  solve: (scenario, id, options) =>
    ipcRenderer.invoke("solver:solve", scenario, id, options),
  cancel: (id) => ipcRenderer.invoke("solver:cancel", id),
  pause: (id) => ipcRenderer.invoke("solver:pause", id),
  checkpoint: () => ipcRenderer.invoke("solver:checkpoint"),
  onProgress: (callback) => {
    const listener = (_event, id, progress) => callback(id, progress);
    ipcRenderer.on("solver:progress", listener);
    return () => ipcRenderer.removeListener("solver:progress", listener);
  },
});
