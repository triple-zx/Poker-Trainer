const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktopSolver", {
  available: () => ipcRenderer.invoke("solver:available"),
  solve: (scenario, id) => ipcRenderer.invoke("solver:solve", scenario, id),
  cancel: (id) => ipcRenderer.invoke("solver:cancel", id),
});
