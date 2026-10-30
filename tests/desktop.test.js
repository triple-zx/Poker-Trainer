import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assetPath, assetHandler } from "../desktop/protocol.mjs";
const root = fileURLToPath(new URL("../app/", import.meta.url));
test("desktop assets stay inside the application and reject other origins", async () => {
  const handler = assetHandler(root);
  assert.equal(
    assetPath("poker://trainer/", root),
    path.join(root, "index.html"),
  );
  for (const url of [
    "https://trainer/app.js",
    "poker://other/app.js",
    "poker://trainer/%2e%2e%2fpackage.json",
    "poker://trainer/%5c..%5cpackage.json",
  ])
    assert.throws(() => assetPath(url, root));
  const home = await handler(new Request("poker://trainer/"));
  assert.equal(home.status, 200);
  assert.match(
    home.headers.get("Content-Security-Policy"),
    /script-src 'self'/,
  );
  assert.match(await home.text(), /Poker Trainer/);
  assert.equal(
    (await handler(new Request("poker://trainer/no-such-file"))).status,
    404,
  );
  assert.equal(
    (await handler(new Request("poker://trainer/", { method: "POST" }))).status,
    405,
  );
});
