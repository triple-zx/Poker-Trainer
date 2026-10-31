import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function expandedRangeSmoke(contents, root) {
  const fixture = await readFile(
    path.join(root, ".native", "expanded-ranges.json"),
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
      if(status.includes('135,996 verified nodes')) {
        clearInterval(timer);
        resolve({status,hero:document.querySelector('[name=hero]').value.split(',').length,
          villain:document.querySelector('[name=villain]').value.split(',').length,
          exportReady:!document.querySelector('#export-solution').disabled});
      } else if(Date.now()>deadline) {clearInterval(timer);reject(Error('Expanded range import timeout: '+status));}
    },100);
  })`);
  assert.equal(imported.hero, 12);
  assert.equal(imported.villain, 12);
  assert.equal(imported.exportReady, true);
  // Check translated capacity guidance through the real language switch.
  const chinese = await contents.executeJavaScript(`(() => {
    document.querySelector('#language').click();
    return document.querySelector('#form').textContent.includes('每方最多十二个组合');
  })()`);
  assert.equal(chinese, true);
  await contents.executeJavaScript(
    "document.querySelector('#language').click()",
  );
  await new Promise((resolve) => setTimeout(resolve, 250));
  const image = await contents.capturePage();
  await writeFile(
    path.join(root, ".native", "expanded-range-desktop.png"),
    image.toPNG(),
  );
  const refused = await contents.executeJavaScript(`(() => {
    const form=document.querySelector('#form');
    for(const street of ['flop','turn','river']) form.elements[street+'Bets'].value='33,50';
    form.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('#compute').click();
    return document.querySelector('#status').textContent;
  })()`);
  assert.match(refused, /2,400,000-probability capacity/);
  return { ...imported, chineseCapacity: chinese, probabilityCapacity: true };
}
