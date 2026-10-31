import {
  app,
  BrowserWindow,
  protocol,
  session,
  ipcMain,
  Menu,
  dialog,
} from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_ORIGIN, assetHandler } from "./protocol.mjs";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  smoke = process.argv.includes("--smoke-test");
app.setName("Poker Trainer");
if (smoke)
  app.setPath(
    "userData",
    path.join(app.getPath("temp"), "poker-desktop-smoke-" + process.pid),
  );
protocol.registerSchemesAsPrivileged([
  {
    scheme: "poker",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
if (!app.requestSingleInstanceLock()) app.quit();
else {
  let window;
  const jobs = new Map();
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  app.on("before-quit", () => {
    for (const job of jobs.values()) job.abort.abort();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin" || smoke) app.quit();
  });
  app
    .whenReady()
    .then(async () => {
      const nativeRoot = path.join(process.resourcesPath, "native-engine"),
        executable = path.join(
          nativeRoot,
          process.platform === "win32"
            ? "console_solver.exe"
            : "console_solver",
        );
      if (existsSync(executable)) {
        process.env.TEXASSOLVER_BIN = executable;
        process.env.TEXASSOLVER_RESOURCES = path.join(nativeRoot, "resources");
      }
      const solver = await import("../native/adapter.mjs");
      const { savedCheckpoint } = await import("../native/checkpoint-job.mjs");
      const checkpointDirectory = path.join(
        app.getPath("userData"),
        "solver-job",
      );
      const trusted = (event) => {
        if (
          !event.senderFrame ||
          !event.senderFrame.url.startsWith(APP_ORIGIN + "/")
        )
          throw Error("Untrusted app frame");
      };
      ipcMain.handle("solver:available", async (event) => {
        trusted(event);
        return {
          native: await solver.available(),
          checkpoints: await solver.checkpointSupported(),
        };
      });
      ipcMain.handle("solver:checkpoint", async (event) => {
        trusted(event);
        const saved = await savedCheckpoint(checkpointDirectory);
        return saved ? { scenario: saved.scenario } : null;
      });
      ipcMain.handle(
        "solver:solve",
        async (event, scenario, id, options = {}) => {
          trusted(event);
          if (
            typeof id !== "string" ||
            id.length > 80 ||
            JSON.stringify(scenario).length > 64000
          )
            throw Error("Invalid solve request");
          if (
            !options ||
            typeof options !== "object" ||
            Object.keys(options).some(
              (key) => !["checkpoint", "resume"].includes(key),
            ) ||
            Object.values(options).some((value) => typeof value !== "boolean")
          )
            throw Error("Invalid checkpoint options");
          if (jobs.size) throw Error("Solver is busy");
          const job = {
            id,
            abort: new AbortController(),
            pause: new AbortController(),
          };
          jobs.set(event.sender.id, job);
          try {
            return await solver.run(
              scenario,
              job.abort.signal,
              options.checkpoint
                ? {
                    checkpointDirectory,
                    resume: options.resume,
                    pauseSignal: job.pause.signal,
                    onProgress: (progress) => {
                      if (!event.sender.isDestroyed())
                        event.sender.send("solver:progress", id, progress);
                    },
                  }
                : {},
            );
          } finally {
            jobs.delete(event.sender.id);
          }
        },
      );
      ipcMain.handle("solver:pause", (event, id) => {
        trusted(event);
        const job = jobs.get(event.sender.id);
        if (job?.id === id) job.pause.abort();
      });
      ipcMain.handle("solver:cancel", (event, id) => {
        trusted(event);
        const job = jobs.get(event.sender.id);
        if (job?.id === id) job.abort.abort();
      });
      protocol.handle("poker", assetHandler(path.join(root, "app")));
      session.defaultSession.setPermissionRequestHandler(
        (_web, _permission, callback) => callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
          {
            label: "File",
            submenu: [
              { role: "close" },
              ...(process.platform === "darwin" ? [] : [{ role: "quit" }]),
            ],
          },
          { role: "editMenu" },
          {
            label: "View",
            submenu: [
              { role: "resetZoom" },
              { role: "zoomIn" },
              { role: "zoomOut" },
              { role: "togglefullscreen" },
            ],
          },
          {
            label: "Help",
            submenu: [
              {
                label: "About Poker Trainer",
                click: () =>
                  dialog.showMessageBox(window, {
                    title: "Poker Trainer",
                    message: "Poker Trainer " + app.getVersion(),
                    detail:
                      "Local poker research and practice. Native C++ computation. Your scenarios and journal stay on this computer.",
                  }),
              },
            ],
          },
        ]),
      );
      async function createWindow() {
        window = new BrowserWindow({
          width: 1240,
          height: 900,
          minWidth: 780,
          minHeight: 620,
          title: "Poker Trainer",
          show: false,
          backgroundColor: "#101c17",
          webPreferences: {
            preload: path.join(root, "desktop/preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        });
        const contents = window.webContents,
          contentsId = contents.id;
        contents.setWindowOpenHandler(() => ({ action: "deny" }));
        contents.on("will-navigate", (event, url) => {
          if (!url.startsWith(APP_ORIGIN + "/")) event.preventDefault();
        });
        contents.on("will-attach-webview", (event) => event.preventDefault());
        contents.on("destroyed", () => {
          const job = jobs.get(contentsId);
          job?.abort.abort();
        });
        window.on("closed", () => {
          window = null;
        });
        if (!smoke) window.once("ready-to-show", () => window?.show());
        await window.loadURL(APP_ORIGIN + "/");
        if (smoke) {
          const { DEFAULT, validate, equity, solve } = await import(
            "../app/engine.js"
          );
          const scenario = {
            ...DEFAULT,
            hero: "AhKh",
            villain: "QcQd",
            iterations: 100,
          };
          const profile = await contents.executeJavaScript(
            `window.desktopSolver.solve(${JSON.stringify(scenario)}, 'desktop-smoke')`,
          );
          const game = validate(scenario);
          const verified = solve(
            scenario,
            [equity(game.hero[0].cards, game.villain[0].cards, game.board)],
            profile,
          );
          const ready = await contents.executeJavaScript(
            "document.title.includes('Poker Trainer') && typeof window.desktopSolver?.solve === 'function' && !!document.querySelector('#form') && document.querySelector('#engine').value === 'native' && document.querySelectorAll('#ranges .range-editor-matrix button').length === 169",
          );
          // The private app origin must support File/Blob transfer to workers,
          // otherwise a browser-only import test could miss a desktop failure.
          const packageWorker =
            await contents.executeJavaScript(`new Promise((resolve, reject) => {
            const worker = new Worker('./package-worker.js', {type:'module'});
            const timer = setTimeout(() => { worker.terminate(); reject(Error('Package worker timeout')); }, 10000);
            worker.onerror = (event) => { clearTimeout(timer); worker.terminate(); reject(Error(event.message)); };
            worker.onmessage = ({data}) => { clearTimeout(timer); worker.terminate(); resolve(data.type === 'imported' && data.result === null && data.scenario.flop === ${JSON.stringify(scenario.flop)}); };
            worker.postMessage({type:'import', file:new File([${JSON.stringify(JSON.stringify({ schema: 1, scenario }))}], 'scenario.json', {type:'application/json'})});
          })`);
          // A fresh smoke profile has no saved solutions. Reaching the explicit
          // missing-solution response proves the worker can read IndexedDB on
          // the private desktop origin, without touching the user's library.
          const flopReportWorker =
            await contents.executeJavaScript(`new Promise((resolve, reject) => {
            const worker = new Worker('./flop-report-worker.js', {type:'module'});
            const timer = setTimeout(() => { worker.terminate(); reject(Error('Flop report worker timeout')); }, 10000);
            worker.onerror = (event) => { clearTimeout(timer); worker.terminate(); reject(Error(event.message)); };
            worker.onmessage = ({data}) => {
              if (data.type === 'progress') return;
              clearTimeout(timer); worker.terminate();
              resolve(data.type === 'error' && data.message.startsWith('smoke-a: No complete saved solution'));
            };
            worker.postMessage({profile:'baseline', weightMode:'equal', entries:[{name:'smoke-a'}, {name:'smoke-b'}]});
          })`);
          let checkpointUI = null;
          if (process.argv.includes("--checkpoint-smoke")) {
            const { checkpointSmoke } = await import("./checkpoint-smoke.mjs");
            checkpointUI = await checkpointSmoke(contents, root);
          }
          console.log(
            JSON.stringify({
              desktopLoaded: ready,
              native: await solver.available(),
              nativeSolve: verified.gap < 0.001,
              packageWorker,
              flopReportWorker,
              ...(checkpointUI ? { checkpointUI } : {}),
              url: contents.getURL(),
            }),
          );
          app.exit(
            ready && verified.gap < 0.001 && packageWorker && flopReportWorker
              ? 0
              : 1,
          );
        }
      }
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0)
          createWindow().catch(() => app.exit(1));
      });
      await createWindow();
    })
    .catch((error) => {
      console.error(error);
      app.exit(1);
    });
}
