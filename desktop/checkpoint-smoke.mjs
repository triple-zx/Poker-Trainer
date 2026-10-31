import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";

// Explicit local-only integration check, using the smoke profile rather than
// the user's application data or original window.
export async function checkpointSmoke(contents, root) {
  const info = await contents.executeJavaScript(
    "window.desktopSolver.available()",
  );
  assert.equal(info.checkpoints, true);
  await contents.executeJavaScript(`(() => {
    const form = document.querySelector('#form');
    const values = {game:'full', engine:'native', hero:'AhKh', villain:'QcQd', pot:'4', stack:'3', iterations:'500',
      fullSizingMode:'off', flopBets:'50', turnBets:'50', riverBets:'50', flopRaises:'100', turnRaises:'100', riverRaises:'100'};
    for (const [name, value] of Object.entries(values)) form.elements[name].value = value;
    form.dispatchEvent(new Event('input', {bubbles:true}));
    const unsubscribe = window.desktopSolver.onProgress((_id, progress) => {
      if (progress.iteration >= 100 && progress.status === 'running') {
        unsubscribe();
        document.querySelector('#pause').click();
      }
    });
    document.querySelector('#compute').click();
  })()`);
  async function waitFor(expression) {
    return contents.executeJavaScript(`new Promise((resolve, reject) => {
      const deadline = Date.now() + 120000;
      const timer = setInterval(() => {
        if (${expression}) { clearInterval(timer); resolve(document.querySelector('#status').textContent); }
        else if (Date.now() > deadline) { clearInterval(timer); reject(Error('Checkpoint UI timeout: ' + document.querySelector('#status').textContent)); }
      }, 100);
    })`);
  }
  const paused = await waitFor(
    "document.querySelector('#status').textContent.startsWith('Paused at iteration') && !document.querySelector('#resume').disabled",
  );
  assert.match(paused, /iteration 10\d|iteration 1\d\d/);
  const image = await contents.capturePage();
  await writeFile(
    path.join(root, ".native", "desktop-checkpoint-paused.png"),
    image.toPNG(),
  );
  await new Promise((resolve, reject) => {
    contents.once("did-finish-load", resolve);
    contents.once("did-fail-load", reject);
    contents.reload();
  });
  await waitFor("!document.querySelector('#restore-native-job').hidden");
  await contents.executeJavaScript(
    "document.querySelector('#restore-native-job').click()",
  );
  await waitFor(
    "document.querySelector('#status').textContent.startsWith('Saved job restored.')",
  );
  await contents.executeJavaScript("document.querySelector('#resume').click()");
  const complete = await waitFor(
    "document.querySelector('#status').textContent.includes('verified nodes') && document.querySelector('#pause').disabled",
  );
  const saved = await contents.executeJavaScript(
    "window.desktopSolver.checkpoint()",
  );
  assert.equal(saved.scenario.hero, "AhKh");
  assert.equal(saved.scenario.iterations, 500);
  // A pause during the final export still stops before evaluation. The native
  // checkpoint is complete, so the next resume should only reload it.
  await contents.executeJavaScript(
    "document.querySelector('#restore-native-job').click()",
  );
  await waitFor(
    "document.querySelector('#status').textContent.startsWith('Saved job restored.')",
  );
  await contents.executeJavaScript(`(() => {
    const unsubscribe = window.desktopSolver.onProgress((_id, progress) => {
      if (progress.status === 'complete') {
        unsubscribe();
        document.querySelector('#pause').click();
      }
    });
    document.querySelector('#resume').click();
  })()`);
  await waitFor(
    "document.querySelector('#status').textContent.startsWith('Paused at iteration') && !document.querySelector('#resume').disabled",
  );
  await contents.executeJavaScript("document.querySelector('#resume').click()");
  await waitFor(
    "document.querySelector('#status').textContent.includes('verified nodes') && document.querySelector('#pause').disabled",
  );
  return {
    paused,
    restoredAfterReload: true,
    pauseDuringExport: true,
    complete,
  };
}
