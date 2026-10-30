import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { available, run } from "./native/adapter.mjs";
let nativeBusy = false;
const root = path.resolve(fileURLToPath(new URL("./app/", import.meta.url)));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};
export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/api/engine") {
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(JSON.stringify({ native: await available() }));
        return;
      }
      if (url.pathname === "/api/solve") {
        if (
          req.method !== "POST" ||
          req.headers.origin !== `http://${req.headers.host}` ||
          !/^127\.0\.0\.1:\d+$/.test(req.headers.host || "")
        ) {
          res.writeHead(403).end();
          return;
        }
        if (nativeBusy) {
          res.writeHead(409).end("Solver is busy");
          return;
        }
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 64000) {
            res.writeHead(413).end();
            return;
          }
        }
        const abort = new AbortController();
        res.on("close", () => abort.abort());
        nativeBusy = true;
        try {
          const output = await run(JSON.parse(body), abort.signal);
          res
            .writeHead(200, { "Content-Type": "application/json" })
            .end(JSON.stringify(output));
        } catch (e) {
          res
            .writeHead(400, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: e.message }));
        } finally {
          nativeBusy = false;
        }
        return;
      }
      const name = decodeURIComponent(url.pathname);
      const file = path.resolve(
        root,
        "." + (name === "/" ? "/index.html" : name),
      );
      if (
        !file.startsWith(root + path.sep) &&
        file !== path.join(root, "index.html")
      ) {
        res.writeHead(403).end();
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'self'; style-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      });
      res.end(body);
    } catch {
      res.writeHead(404).end("Not found");
    }
  });
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  createServer().listen(4173, "127.0.0.1", () =>
    console.log("Poker Trainer: http://127.0.0.1:4173"),
  );
