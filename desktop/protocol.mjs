import { readFile } from "node:fs/promises";
import path from "node:path";
export const APP_ORIGIN = "poker://trainer";
export function assetPath(url, root) {
  const parsed = new URL(url);
  if (parsed.protocol !== "poker:" || parsed.host !== "trainer")
    throw Error("Invalid app origin");
  const name = decodeURIComponent(parsed.pathname);
  if (name.includes("\\") || name.includes("\0")) throw Error("Invalid path");
  const file = path.resolve(root, "." + (name === "/" ? "/index.html" : name));
  if (!file.startsWith(path.resolve(root) + path.sep))
    throw Error("Invalid path");
  return file;
}
export function assetHandler(root) {
  return async (request) => {
    if (request.method !== "GET")
      return new Response("Method not allowed", { status: 405 });
    try {
      const file = assetPath(request.url, root),
        body = await readFile(file);
      return new Response(body, {
        headers: {
          "Content-Type":
            {
              ".html": "text/html; charset=utf-8",
              ".js": "text/javascript; charset=utf-8",
              ".css": "text/css; charset=utf-8",
              ".svg": "image/svg+xml",
            }[path.extname(file)] || "application/octet-stream",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy":
            "default-src 'self'; script-src 'self'; style-src 'self'; worker-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  };
}
