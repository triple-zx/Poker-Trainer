import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Runs only in a fresh, hidden smoke profile, through the actual app controls.
export async function trainingLanguageSmoke(contents, root) {
  const fixture = await readFile(
    path.join(root, ".native", "expanded-ranges.json"),
    "utf8",
  );
  await contents.executeJavaScript(`(() => {
    const file=new File([${JSON.stringify(fixture)}], 'language-study.json', {type:'application/json'});
    const transfer=new DataTransfer(); transfer.items.add(file);
    const input=document.querySelector('#import'); input.files=transfer.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  const run = (code) =>
    contents.executeJavaScript(`(async () => {
    const $=s=>document.querySelector(s);
    const expect=(ok,message)=>{if(!ok) throw Error(message);};
    const wait=async predicate=>{
      const deadline=Date.now()+90000;
      while(!predicate()) {if(Date.now()>deadline) throw Error('Training UI timeout: '+$('#status').textContent); await new Promise(r=>setTimeout(r,30));}
    };
    const buttons=()=>[...$('#sized-actions').querySelectorAll('button')];
    const board=()=>$('#board').textContent;
    const hidden=()=>$('#opponent').querySelectorAll('.back').length===2;
    const record=()=>JSON.parse(localStorage.getItem('poker-trainer-v1')).records[0];
    ${code}
  })()`);
  const hand = await run(`
    await wait(()=>$('#status').textContent.includes('135,996 verified nodes'));
    window.__languageSmokeRandom=Math.random; Math.random=()=>0;
    $('[data-tab=train]').click(); $('#deal').click();
    const initialCards=$('#hero-cards').textContent;
    const initialHistory=$('#action-history').children.length;
    $('#language').click();
    expect($('#action-history').children.length===initialHistory,'Language switch restarted intro');
    expect($('#action-history').textContent.includes('翻牌 · 行动开始'),'Intro not translated');
    expect(hidden(),'Opponent cards revealed during intro');
    expect($('#sampling-note').textContent.includes('所有适用街道'),'Sampling note not translated');
    $('#animation-speed').click();
    await wait(()=>buttons().length>0);
    expect(buttons().some(b=>b.textContent==='过牌'),'Chinese check missing');
    expect(buttons().some(b=>b.textContent.includes('全下')),'Chinese all-in missing');
    buttons().find(b=>b.textContent==='过牌').click();
    await wait(()=>buttons().length>0 && $('#pot-display').textContent.startsWith('转牌'));
    const turn=board(), pot=$('#pot-display').textContent, events=$('#action-history').children.length;
    $('#language').click();
    expect(board()===turn && $('#hero-cards').textContent===initialCards,'Language switch redealt cards');
    expect($('#action-history').children.length===events && hidden(),'Language switch changed hand');
    expect($('#pot-display').textContent.startsWith('Turn') && buttons()[0].textContent==='Check','English turn not restored');
    $('#language').click();
    expect($('#pot-display').textContent===pot,'Language switch changed stacks or pot');
    buttons().find(b=>b.textContent==='过牌').click();
    await wait(()=>buttons().length>0 && $('#pot-display').textContent.startsWith('河牌'));
    expect(hidden(),'Opponent cards revealed before river decision');
    buttons().find(b=>b.textContent.startsWith('下注')).click();
    await wait(()=>!$('#deal').disabled);
    expect($('#feedback').textContent.includes('总 EV 损失'),'Chinese EV feedback missing');
    const saved=JSON.stringify(record());
    expect(record().decisions.map(d=>d.street).join(',')==='Flop,Turn,River','Did not score all streets');
    expect(record().decisions.at(-1).label.startsWith('Bet '),'River bet not recorded canonically');
    $('#feedback details').open=true;
    $('#language').click();
    expect($('#feedback details').open,'Language switch closed feedback');
    expect($('#feedback').textContent.includes('Total EV loss'),'Completed feedback not translated');
    expect(JSON.stringify(record())===saved,'Translation changed saved decisions or scores');
    $('[data-tab=history]').click();
    [...$('#records .record').querySelectorAll('button')].find(b=>b.textContent==='Replay details').click();
    $('#records .record section button').click();
    const step=$('#records .record section p').textContent.split(' · ')[0];
    $('#language').click();
    expect($('#records .record section p').textContent.startsWith(step+' · '),'Replay position lost on language switch');
    expect($('#records .record section button').textContent==='下一步 →','Replay control not translated');
    expect($('#records').textContent.includes('完整手牌与单次决策训练频率'),'Frequency report not translated');
    expect($('#records').textContent.includes('实际选择'),'Frequency values not translated');
    expect(JSON.stringify(record())===saved,'Review translation mutated journal');
    return {streets:record().decisions.map(d=>d.street),decisions:record().decisions.length,replayStep:step,canonicalRecordUnchanged:true};
  `);
  await contents.executeJavaScript(
    "document.querySelector('#records').scrollIntoView({block:'start'})",
  );
  await contents.capturePage();
  contents.invalidate();
  await new Promise((resolve) => setTimeout(resolve, 300));
  await writeFile(
    path.join(root, ".native", "training-language-review.png"),
    (await contents.capturePage()).toPNG(),
  );
  const drill = await run(`
    $('[data-tab=analysis]').click();
    const explorer=()=>[...$('#analysis-content').querySelectorAll('section')].find(s=>s.querySelector('h3')?.textContent==='浏览已保存的策略树');
    const choose=text=>{
      const button=[...explorer().querySelector('.toolbar').querySelectorAll('button')].find(b=>b.textContent===text);
      expect(button,'Missing explorer action '+text); button.click();
    };
    choose('过牌'); choose('过牌');
    explorer().querySelector('.toolbar button').click();
    choose('过牌');
    const bet=[...explorer().querySelector('.toolbar').querySelectorAll('button')].find(b=>b.textContent.startsWith('下注')&&!b.textContent.includes('全下'));
    expect(bet,'Missing turn bet'); bet.click();
    expect(explorer().textContent.includes('加注至'),'Turn raise not translated in explorer');
    [...explorer().querySelectorAll('button')].find(b=>b.textContent==='练习此决策').click();
    expect($('#target').disabled,'Drill should disable full-hand sampling');
    $('#animation-speed').click();
    await wait(()=>buttons().length>0);
    expect($('#action-history').children.length>=6,'Turn drill history missing');
    expect($('#pot-display').textContent.startsWith('转牌') && hidden(),'Drill context or hidden cards wrong');
    const events=$('#action-history').children.length;
    $('#language').click();
    expect($('#action-history').children.length===events,'Language switch replayed drill history');
    expect(buttons().some(b=>b.textContent.startsWith('Raise to ')),'English raise missing');
    $('#language').click();
    buttons().find(b=>b.textContent.startsWith('加注至')).click();
    await wait(()=>!$('#deal').disabled);
    expect($('#feedback').textContent.includes('单次决策训练完成'),'Chinese drill feedback missing');
    expect(record().drill && record().decisions.length===1,'Drill scored extra decisions');
    expect(record().decisions[0].label.startsWith('Raise to '),'Raise not recorded canonically');
    const saved=JSON.stringify(record());
    $('#language').click();
    expect($('#feedback').textContent.includes('Repeat this decision'),'Repeat control not translated');
    expect(JSON.stringify(record())===saved,'Drill translation changed data');
    Math.random=window.__languageSmokeRandom; delete window.__languageSmokeRandom;
    return {historyEvents:events,street:record().decisions[0].street,action:record().decisions[0].label,decisions:1};
  `);
  assert.equal(hand.decisions, 3);
  assert.equal(drill.street, "Turn");
  return { hand, drill };
}
