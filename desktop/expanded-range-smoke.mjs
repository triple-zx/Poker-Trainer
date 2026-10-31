import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function expandedRangeSmoke(contents, root, broad = false) {
  const expectedCombos = broad ? 96 : 12;
  const expectedNodes = broad ? "21,618" : "135,996";
  const fixture = await readFile(
    path.join(
      root,
      ".native",
      broad ? "broad96-scenario.json" : "expanded-ranges.json",
    ),
    "utf8",
  );
  await contents.executeJavaScript(`(() => {
    const file = new File([${JSON.stringify(fixture)}], 'expanded-ranges.json', {type:'application/json'});
    const transfer = new DataTransfer(); transfer.items.add(file);
    const input = document.querySelector('#import'); input.files = transfer.files;
    input.dispatchEvent(new Event('change', {bubbles:true}));
  })()`);
  const imported =
    await contents.executeJavaScript(`new Promise((resolve,reject) => {
    const deadline=Date.now()+90000;
    const timer=setInterval(() => {
      const status=document.querySelector('#status').textContent;
      if(status.includes('${expectedNodes} verified nodes')) {
        clearInterval(timer);
        resolve({status,hero:document.querySelector('[name=hero]').value.split(',').length,
          villain:document.querySelector('[name=villain]').value.split(',').length,
          exportReady:!document.querySelector('#export-solution').disabled});
      } else if(Date.now()>deadline) {clearInterval(timer);reject(Error('Expanded range import timeout: '+status));}
    },100);
  })`);
  assert.equal(imported.hero, expectedCombos);
  assert.equal(imported.villain, expectedCombos);
  assert.equal(imported.exportReady, true);
  // Check translated capacity guidance through the real language switch.
  const chinese = await contents.executeJavaScript(`(() => {
    document.querySelector('#language').click();
    return document.querySelector('#form').textContent.includes('每方最多 96 个组合');
  })()`);
  assert.equal(chinese, true);
  await contents.executeJavaScript(
    "document.querySelector('#language').click()",
  );
  let compact = null;
  if (broad) {
    const { compactStudySmoke } = await import("./compact-study-smoke.mjs");
    compact = await compactStudySmoke(contents);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  const image = await contents.capturePage();
  await writeFile(
    path.join(
      root,
      ".native",
      broad ? "broad-range-desktop.png" : "expanded-range-desktop.png",
    ),
    image.toPNG(),
  );
  const refused = await contents.executeJavaScript(`(() => {
    document.querySelector('[data-tab=setup]').click();
    document.querySelector('#clear-model').click();
    const form=document.querySelector('#form');
    form.elements.stack.value='3';
    for(const street of ['flop','turn','river']) form.elements[street+'Bets'].value='33,50';
    form.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('#compute').click();
    return document.querySelector('#status').textContent;
  })()`);
  assert.match(refused, /2,400,000-probability capacity/);
  return {
    ...imported,
    chineseCapacity: chinese,
    probabilityCapacity: true,
    ...(compact ? { compact } : {}),
  };
}
