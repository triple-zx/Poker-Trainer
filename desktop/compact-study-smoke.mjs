import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";

// Called only after importing the 96-hand fixture in an isolated smoke profile.
export async function compactStudySmoke(contents, root) {
  const report = await contents.executeJavaScript(`(async () => {
    const $=s=>document.querySelector(s), expect=(ok,msg)=>{if(!ok) throw Error(msg);};
    const wait=async predicate=>{const deadline=Date.now()+90000; while(!await predicate()) {if(Date.now()>deadline) throw Error('Compact UI timeout: '+$('#status').textContent); await new Promise(r=>setTimeout(r,40));}};
    const {solutionStore}=await import('./solution-store.js');
    const {matrixRow}=await import('./full-matrix.js');
    let saved;
    await wait(async()=>{saved=await solutionStore('current'); return saved?.root?.policy?.length===96;});
    expect(saved.root.policy.values instanceof Float64Array,'Stored policy lost compact buffers');
    expect(saved.root.ev.values instanceof Float64Array,'Stored feedback lost compact buffers');
    const exported=await new Promise((resolve,reject)=>{
      const worker=new Worker('./package-worker.js',{type:'module'});
      const timer=setTimeout(()=>{worker.terminate();reject(Error('Compact export timeout'));},90000);
      worker.onerror=e=>{clearTimeout(timer);worker.terminate();reject(Error(e.message));};
      worker.onmessage=({data})=>{clearTimeout(timer);worker.terminate();data.type==='exported'?resolve(data.blob):reject(Error(data.message));};
      worker.postMessage({type:'export',result:saved});
    });
    const packageData=JSON.parse(await exported.text());
    expect(Array.isArray(packageData.tree.policy)&&Array.isArray(packageData.tree.policy[0]),'Export is not legacy-compatible row arrays');
    expect(!('records' in packageData),'Export leaked training records');
    $('[data-tab=analysis]').click();
    expect($('#analysis-content').textContent.includes('Root action EVs'),'Root feedback not rendered');
    expect(!$('#analysis-content').textContent.includes('NaN'),'Invalid analysis number');
    const explorer=()=>[...$('#analysis-content').querySelectorAll('section')].find(s=>s.querySelector('h3')?.textContent==='Explore the saved tree');
    const analysisStarted=performance.now();
    let ticks=0;
    const heartbeat=setInterval(()=>ticks++,10);
    explorer().querySelector('.node-ranges').open=true;
    await wait(()=>explorer().querySelector('.analysis-cancel'));
    await new Promise(resolve=>setTimeout(resolve,60));
    expect(ticks>=2,'Renderer did not stay responsive during range analysis');
    explorer().querySelector('.analysis-cancel').click();
    await wait(()=>explorer().querySelector('.analysis-retry'));
    expect(!explorer().querySelector('.node-matrix'),'Cancelled result appeared');
    explorer().querySelector('.analysis-retry').click();
    // Change the selected profile while a replacement job is still running.
    for(const profile of ['baseline','model']) {
      const select=explorer().querySelector('.node-ranges select');
      select.value=profile;select.dispatchEvent(new Event('change'));
    }
    await wait(()=>explorer().querySelectorAll('.node-matrix').length===2);
    clearInterval(heartbeat);
    const analysis={elapsedWithCancellationMs:performance.now()-analysisStarted,heartbeatTicks:ticks,cancelled:true};
    for(const profile of ['baseline','model']) {
      const select=explorer().querySelector('.node-ranges select');
      select.value=profile; select.dispatchEvent(new Event('change'));
      await wait(()=>explorer().querySelector('.node-ranges select').value===profile&&explorer().querySelectorAll('.node-matrix').length===2);
      const panel=explorer().querySelector('.node-ranges');
      expect(panel.querySelectorAll('tbody tr').length===192,'Conditional range report lost hands');
      expect([...panel.querySelectorAll('.node-matrix')].every(grid=>grid.children.length===169),'Conditional matrices incomplete');
      expect(!/NaN|Infinity/.test(panel.textContent),'Invalid range analysis value');
    }
    Object.assign(analysis,{hands:192,matrixCells:338,profiles:true});
    // Leaving Analysis disposes its worker; navigation cancels an in-flight root report.
    $('[data-tab=setup]').click();$('[data-tab=analysis]').click();
    explorer().querySelector('.node-ranges').open=true;
    await wait(()=>explorer().querySelector('.analysis-cancel'));
    [...explorer().querySelector('.toolbar').querySelectorAll('button')].find(b=>b.textContent==='Check').click();
    await wait(()=>explorer().querySelectorAll('.node-matrix').length===2);
    analysis.navigation=true;
    const fields=explorer().querySelector('fieldset');
    expect(fields,'Opponent editor missing');
    const inputs=[...fields.querySelectorAll('input')];
    expect(inputs.length===2&&inputs.every(i=>Number.isFinite(Number(i.value))),'Opponent percentages unreadable');
    inputs.forEach((input,i)=>{input.value=i?'0':'100';});
    [...fields.querySelectorAll('button')].find(b=>b.textContent==='Apply opponent edit').click();
    await wait(async()=>{saved=await solutionStore('current');return !!saved?.scenario?.fullModel;});
    expect(saved.root.policy.values instanceof Float64Array,'Remodel lost compact policy');
    expect(JSON.stringify(matrixRow(saved.root.children[0].model,0))==='[1,0]','Opponent edit was not applied');
    // Complete next-turn and next-river reports through the real background UI.
    const check=()=>[...explorer().querySelector('.toolbar').querySelectorAll('button')].find(b=>b.textContent==='Check').click();
    const compare=async(expected)=>{
      const panel=[...explorer().querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent==='Compare every next card');
      expect(panel,'Next-card panel missing');panel.open=true;
      await wait(()=>panel.textContent.includes(expected+' legal cards covered'));
      expect(panel.querySelector('tbody').rows.length===expected,'Incomplete background card report');
      expect(!/NaN|Infinity/.test(panel.textContent),'Invalid card-report value');
      [...panel.querySelectorAll('tbody button')].find(b=>!b.disabled).click();
    };
    check();await compare(49);
    check();check();await compare(48);
    analysis.nextCards=[49,48];
    const random=Math.random; Math.random=()=>0;
    try {
      $('[data-tab=train]').click(); $('#deal').click(); $('#animation-speed').click();
      for(const street of ['Flop','Turn','River']) {
        await wait(()=>$('#pot-display').textContent.startsWith(street)&&$('#sized-actions button'));
        expect($('#opponent').querySelectorAll('.back').length===2,'Hidden cards leaked before feedback');
        [...$('#sized-actions').querySelectorAll('button')].find(b=>b.textContent==='Check').click();
      }
      await wait(()=>!$('#deal').disabled);
      const record=JSON.parse(localStorage.getItem('poker-trainer-v1')).records[0];
      expect(record.decisions.map(d=>d.street).join(',')==='Flop,Turn,River','Compact training missed a street');
      expect(record.decisions.every(d=>Array.isArray(d.target)&&Array.isArray(d.ev)&&Number.isFinite(d.loss)),'Journal did not preserve numeric row arrays');
      expect($('#feedback').textContent.includes('Total EV loss'),'Post-hand feedback missing');
      return {indexedDB:true,exportRows:true,analysis,opponentEdit:true,streets:record.decisions.map(d=>d.street),journalArrays:true};
    } finally {Math.random=random;}
  })()`);
  assert.deepEqual(report.streets, ["Flop", "Turn", "River"]);
  await contents.executeJavaScript(`(() => {
    document.querySelector('[data-tab=analysis]').click();
    const explorer=[...document.querySelectorAll('#analysis-content section')].find(s=>s.querySelector('h3')?.textContent==='Explore the saved tree');
    let back;
    while(back=[...explorer.querySelectorAll('button')].find(b=>b.textContent==='← Previous node')) back.click();
    const panel=explorer.querySelector('.node-ranges');panel.open=true;panel.scrollIntoView({block:'start'});
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  await contents.capturePage();
  contents.invalidate();
  await writeFile(
    path.join(root, ".native/analysis-worker-loading.png"),
    (await contents.capturePage()).toPNG(),
  );
  await contents.executeJavaScript(`new Promise((resolve,reject)=>{
    const deadline=Date.now()+30000;
    const timer=setInterval(()=>{
      if(document.querySelectorAll('#analysis-content .node-matrix').length===2) {clearInterval(timer);resolve();}
      else if(Date.now()>deadline) {clearInterval(timer);reject(Error('Analysis screenshot report timeout'));}
    },40);
  })`);
  await contents.capturePage();
  contents.invalidate();
  await new Promise((resolve) => setTimeout(resolve, 100));
  await writeFile(
    path.join(root, ".native/analysis-worker-complete.png"),
    (await contents.capturePage()).toPNG(),
  );
  return report;
}
