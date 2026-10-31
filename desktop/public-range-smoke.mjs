import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function publicRangeSmoke(contents, root) {
  const raw = await readFile(
    path.join(root, ".native/preflop-source-review/UTG_RFI.txt"),
    "utf8",
  );
  const prepared = await readFile(
    path.join(root, "../preflop-study-imports/ARTGTO-UTG-RFI-100bb.range.json"),
    "utf8",
  );
  const report = await contents.executeJavaScript(`(async()=>{
    const $=s=>document.querySelector(s), expect=(v,m)=>{if(!v)throw Error(m);};
    const wait=async predicate=>{const deadline=Date.now()+10000;while(!predicate()){if(Date.now()>deadline)throw Error('Range import timeout');await new Promise(r=>setTimeout(r,20));}};
    const click=text=>{const b=[...$('#ranges').querySelectorAll('button')].find(b=>b.textContent===text);expect(b,'Missing button '+text);b.click();};
    const load=(text,name)=>{const transfer=new DataTransfer();transfer.items.add(new File([text],name,{type:'text/plain'}));const input=$('#ranges input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));};
    $('[data-tab=ranges]').click();
    load(${JSON.stringify(raw)},'UTG_RFI.txt');
    await wait(()=>$('#ranges input[type=text]').value==='UTG_RFI');
    expect($('#ranges').textContent.includes('338 included combinations · 264.21 weighted combinations · 19.93%'),'Public range weights changed');
    $('#ranges .range-editor-matrix button[aria-label^="22 ·"]').click();
    const weights=[...$('#ranges .report .range-fields').querySelectorAll('input')].map(e=>Number(e.value));
    expect(weights.length===6&&weights.every(w=>w===7.43/100),'Bracket percentage was not preserved');
    load(${JSON.stringify(prepared)},'UTG-study.range.json');
    await wait(()=>$('#ranges input[type=text]').value.startsWith('ART/GTO'));
    click('Save range');
    const before=localStorage.getItem('poker-trainer-ranges-v1'), saved=JSON.parse(before)[0];
    expect(saved.context.rakePercent===null && saved.context.anteBB===null,'Unknown source assumptions became zero');
    expect(saved.context.position==='UTG' && saved.context.stackBB===100,'Source context lost');
    expect(saved.source.url==='https://artgto.com/learn/ranges/','Source citation lost');
    expect(saved.originalRange===saved.range,'Original source weights changed');
    const hero=$('[name=hero]').value;
    click('Use as hero range');
    expect($('#ranges [role=status]').textContent.includes('currently supports 12'),'Broad range should be refused without sampling');
    expect($('[name=hero]').value===hero,'Refused range changed the scenario');
    const current=$('#ranges textarea').value;
    load('[25]AA[/50]','broken.txt');
    await wait(()=>$('#ranges [role=status]').textContent.includes('matching opening'));
    expect($('#ranges textarea').value===current,'Failed import replaced the current range');
    expect(localStorage.getItem('poker-trainer-ranges-v1')===before,'Failed import changed saved library');
    $('#language').click();
    expect($('#ranges').textContent.includes('方括号分组使用百分比'),'Chinese notation guidance missing');
    expect($('#ranges').textContent.includes('338 个已包含组合'),'Language switch changed range');
    return {included:338,weighted:264.2102,smallPairWeight:.0743,sourcePreserved:true,unknownAssumptionsPreserved:true,failedImportPreserved:true};
  })()`);
  assert.equal(report.included, 338);
  await contents.executeJavaScript(
    "document.querySelector('#ranges .range-editor-matrix').scrollIntoView({block:'center'})",
  );
  await contents.capturePage();
  contents.invalidate();
  await new Promise((resolve) => setTimeout(resolve, 250));
  await writeFile(
    path.join(root, ".native/public-range-import.png"),
    (await contents.capturePage()).toPNG(),
  );
  return report;
}
