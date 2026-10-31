import assert from "node:assert/strict";

// Called only after importing the 96-hand fixture in an isolated smoke profile.
export async function compactStudySmoke(contents) {
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
    [...explorer().querySelector('.toolbar').querySelectorAll('button')].find(b=>b.textContent==='Check').click();
    const fields=explorer().querySelector('fieldset');
    expect(fields,'Opponent editor missing');
    const inputs=[...fields.querySelectorAll('input')];
    expect(inputs.length===2&&inputs.every(i=>Number.isFinite(Number(i.value))),'Opponent percentages unreadable');
    inputs.forEach((input,i)=>{input.value=i?'0':'100';});
    [...fields.querySelectorAll('button')].find(b=>b.textContent==='Apply opponent edit').click();
    await wait(async()=>{saved=await solutionStore('current');return !!saved?.scenario?.fullModel;});
    expect(saved.root.policy.values instanceof Float64Array,'Remodel lost compact policy');
    expect(JSON.stringify(matrixRow(saved.root.children[0].model,0))==='[1,0]','Opponent edit was not applied');
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
      return {indexedDB:true,exportRows:true,opponentEdit:true,streets:record.decisions.map(d=>d.street),journalArrays:true};
    } finally {Math.random=random;}
  })()`);
  assert.deepEqual(report.streets, ["Flop", "Turn", "River"]);
  return report;
}
