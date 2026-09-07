import {order,createLedger,summarize,applyCount,toCSV} from './ledger.mjs';
import {agentConfig} from './agent-config.mjs';
const $=id=>document.getElementById(id);
let ledger=createLedger(),messages=[],session=null,demoRunning=false,editSku=null;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>n===null?'—':n;
function status(text){$('status').textContent=text;}
function message(role,text){messages.push({role,text});renderMessages();}
function renderMessages(){
  $('message-count').textContent=`${messages.length} turns`;
  $('transcript').innerHTML=messages.length?messages.map(m=>`<div class="utterance ${m.role==='agent'?'agent':''}"><strong>${m.role==='agent'?'COUNTBACK':m.role==='demo'?'GUIDED DEMO':m.role==='sample'?'SAMPLE AUDIO':'YOU'}</strong>${escape(m.text)}</div>`).join(''):'<p class="empty-transcript">Your spoken counts and readbacks will appear here.</p>';
  $('transcript').scrollTop=$('transcript').scrollHeight;
}
function render(){
  const rows=summarize(ledger),checked=rows.filter(r=>r.checked).length;
  const shortage=rows.reduce((n,r)=>n+(r.shortage||0),0),damaged=rows.reduce((n,r)=>n+r.damaged,0),overage=rows.reduce((n,r)=>n+(r.overage||0),0);
  $('checked').innerHTML=`${checked}<span>/3</span>`;$('short').textContent=checked?shortage:'—';$('damage').textContent=checked?damaged:'—';
  $('rows').innerHTML=rows.map(r=>`<tr><td><strong>${r.name}</strong><small>${r.perCarton} ${r.unit} / carton · ${r.sku}</small></td><td>${r.ordered}</td><td><strong>${number(r.received)}</strong>${r.checked?`<small>${r.cartons} cartons + ${r.loose} loose</small>`:''}</td><td><span class="pill ${r.checked?r.damaged||r.shortage||r.overage?'warning':'good':''}">${!r.checked?'Not counted':r.damaged?`${r.damaged} damaged`:r.shortage?`${r.shortage} short`:r.overage?`${r.overage} extra`:'All good'}</span></td><td><button data-edit="${r.sku}" aria-label="${r.checked?'Edit':'Count'} ${r.name}">${r.checked?'Edit':'Count'} ↗</button></td></tr>`).join('');
  $('discrepancies').innerHTML=`<span class="small-icon">${checked?'↳':'⌁'}</span><div><strong>${checked?shortage||damaged||overage?'A few things need a second look.':'These counts match the order.':'The count starts with you.'}</strong><p>${checked?`${shortage} units short · ${damaged} damaged · ${overage} extra. ${3-checked?`${3-checked} product lines still unchecked.`:'All lines checked. Review the source quotes below.'}`:'Check a product to reveal shortages and damaged stock.'}</p></div>`;
  $('revision').textContent=ledger.revision?`${ledger.revision} SAVED CHANGES`:'NO CHANGES YET';
  $('history').innerHTML=ledger.events.length?[...ledger.events].reverse().map(e=>{const p=order.items.find(i=>i.sku===e.sku);return `<div class="event"><span class="event-number">${String(e.revision).padStart(2,'0')}</span><p><strong>${p.name}</strong> · ${e.cartons} cartons + ${e.loose} loose · ${e.damaged} damaged<q>${escape(e.evidence)}</q></p></div>`}).join(''):'<p class="empty-history">Corrections stay visible here. Nothing disappears.</p>';
  $('review-note').textContent=checked===3?'All lines checked. Review counts before export.':'Check all three lines before exporting.';
  $('export').disabled=checked!==3||Boolean(session)||demoRunning;
  document.querySelectorAll('[data-edit]').forEach(b=>{b.disabled=Boolean(session)||demoRunning;b.onclick=()=>openEdit(b.dataset.edit)});
}
function openEdit(sku){editSku=sku;const row=summarize(ledger).find(r=>r.sku===sku);$('edit-title').textContent=row.name;for(const field of ['cartons','loose','damaged'])$(field).value=row[field];$('edit-error').textContent='';$('edit-dialog').showModal();}
$('cancel-edit').onclick=()=>$('edit-dialog').close();
$('edit-form').onsubmit=e=>{e.preventDefault();const args={sku:editSku,...Object.fromEntries(['cartons','loose','damaged'].map(f=>[f,Number($(f).value)]))};args.evidence=`Manual review: ${args.cartons} cartons, ${args.loose} loose, ${args.damaged} damaged.`;try{applyCount(ledger,args,crypto.randomUUID(),[args.evidence]);$('edit-dialog').close();render();}catch(error){$('edit-error').textContent=error.message;}};
$('export').onclick=()=>{const blob=new Blob([toCSV(ledger)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='countback-PO-1048.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Receipt exported. Counts and source quotes are included.');};
$('reset').onclick=()=>{if(session||demoRunning)return;ledger=createLedger();messages=[];render();renderMessages();$('mode-label').textContent='READY WHEN YOU ARE';status('New draft ready.');};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
$('demo').onclick=async()=>{
  if(session||demoRunning)return;demoRunning=true;ledger=createLedger();messages=[];renderMessages();setActive(true,'GUIDED DEMO');$('stop').hidden=true;$('voice-title').textContent='A delivery, in four counts.';$('voice-description').textContent='Scripted example · no microphone or API calls';render();
  const steps=[
    {text:'Five cartons of oat milk, no loose bottles. Two bottles are damaged.',sku:'OAT',cartons:5,loose:0,damaged:2,reply:'60 bottles received, including two damaged. That is 12 bottles short.'},
    {text:'Correction: six cartons of oat milk, not five. Still two damaged.',sku:'OAT',cartons:6,loose:0,damaged:2,reply:'Corrected to 72 bottles received. Two damaged, 70 usable. The earlier count stays in the history.'},
    {text:'Four cartons of coffee beans. No loose bags, none damaged.',sku:'COFFEE',cartons:4,loose:0,damaged:0,reply:'24 bags of coffee. The count matches the order.'},
    {text:'Four cartons of paper cups and five loose sleeves. None damaged.',sku:'CUPS',cartons:4,loose:5,damaged:0,reply:'45 sleeves received. Five short. All three products are checked; review the receipt before exporting.'}
  ];
  status('Playing a labeled, scripted walkthrough.');
  for(const s of steps){await delay(1300);message('demo',s.text);applyCount(ledger,{...s,evidence:s.text},crypto.randomUUID(),[s.text]);render();await delay(850);message('agent',s.reply);}
  demoRunning=false;setActive(false,'DEMO COMPLETE');$('voice-title').textContent='Delivery checked.';$('voice-description').textContent='Five sleeves short. Two bottles damaged. Every correction retained.';status('Guided demo complete. Edit a count or export the receipt.');render();
};
function setActive(active,label){$('start').hidden=active;$('stop').hidden=!active;$('demo').disabled=active;$('live-sample').disabled=active;$('reset').disabled=active;$('keyboard').disabled=active;$('typed-form').hidden=!active||!$('keyboard').checked||demoRunning||Boolean(session?.sample);$('mode-label').textContent=label;$('orb').classList.toggle('live',active);}
function base64(buffer){const a=new Uint8Array(buffer);let text='';for(const b of a)text+=String.fromCharCode(b);return btoa(text);}
function clearPlayback(s){for(const source of s.sources){try{source.stop();}catch{}}s.sources.clear();s.playAt=0;}
function play(s,data){if(!s.ctx||s.ctx.state==='closed')return;const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));const view=new DataView(bytes.buffer),audio=s.ctx.createBuffer(1,Math.floor(bytes.length/2),24000);const channel=audio.getChannelData(0);for(let i=0;i<channel.length;i++)channel[i]=view.getInt16(i*2,true)/32768;const source=s.ctx.createBufferSource();source.buffer=audio;source.connect(s.ctx.destination);s.sources.add(source);source.onended=()=>s.sources.delete(source);const at=Math.max(s.ctx.currentTime+.025,s.playAt);source.start(at);s.playAt=at+audio.duration;}
function send(s,event){if(s.ws?.readyState===WebSocket.OPEN)s.ws.send(JSON.stringify(event));}
function finish(s,text){if(s.finished)return;s.finished=true;clearTimeout(s.timer);clearTimeout(s.closeTimer);s.stream?.getTracks().forEach(t=>t.stop());s.worklet?.disconnect();s.source?.disconnect();clearPlayback(s);s.ctx?.close().catch(()=>{});s.ws?.close();if(session===s)session=null;setActive(false,'SESSION ENDED');$('voice-title').textContent='Ready to review.';$('voice-description').textContent='Check your receipt and correct anything that needs it.';status(text);render();}
function end(s){if(!s||s.finished)return;s.ending=true;s.stream?.getTracks().forEach(t=>t.stop());clearPlayback(s);if(s.ws?.readyState===WebSocket.OPEN){send(s,{type:'session.end'});s.closeTimer=setTimeout(()=>finish(s,'Session ended. Your draft remains on screen.'),5000);}else finish(s,'Session ended.');}
async function streamSample(s){
  if(s.finished||s.ending)return;
  s.sampleStep++;
  if(s.sampleStep>4){status('Live sample complete. Review the actual transcribed counts.');end(s);return;}
  s.sampleWaiting='listening';
  s.sampleStreaming=true;
  try{
    await delay(Math.max(0,(s.playAt-s.ctx.currentTime)*1000)+250);
    const response=await fetch(`/sample-${s.sampleStep}.wav`);if(!response.ok)throw new Error('Sample audio could not be loaded.');
    const buffer=await response.arrayBuffer(),v=new DataView(buffer);let audio=null,valid=false;
    for(let at=12;at+8<=v.byteLength;){const id=String.fromCharCode(...new Uint8Array(buffer,at,4)),size=v.getUint32(at+4,true);if(at+8+size>v.byteLength)throw new Error('Invalid sample audio.');if(id==='fmt ')valid=v.getUint16(at+8,true)===1&&v.getUint16(at+10,true)===1&&v.getUint32(at+12,true)===24000&&v.getUint16(at+22,true)===16;if(id==='data')audio=new Uint8Array(buffer,at+8,size);at+=8+size+(size%2);}
    if(!valid||!audio)throw new Error('Sample must be mono PCM16 at 24 kHz.');
    status(`Streaming synthetic sample ${s.sampleStep} of 4 through live AssemblyAI speech recognition.`);
    // No microphone is opened. The same prerecorded PCM is played and streamed in real time.
    for(let at=0;at<audio.length&&!s.finished&&!s.ending;at+=2400){const chunk=audio.slice(at,at+2400);const encoded=base64(chunk.buffer);send(s,{type:'input.audio',audio:encoded});play(s,encoded);await delay(50);}
    // A short silence lets turn detection finalize the prerecorded utterance.
    for(let i=0;i<30&&!s.finished&&!s.ending;i++){send(s,{type:'input.audio',audio:base64(new ArrayBuffer(2400))});await delay(50);}
    s.sampleStreaming=false;
    if(s.sampleWaiting==='next')streamSample(s);
  }catch(error){s.error=error.message;end(s);}
}
async function connect(useSample=false){
  if(session||demoRunning)return;
  const s={sources:new Set(),pending:[],seen:new Set(),evidence:[],playAt:0,finished:false,sample:useSample,sampleStep:0,sampleWaiting:'greeting'};session=s;setActive(true,'CONNECTING');status(useSample||$('keyboard').checked?'Connecting to AssemblyAI…':'Requesting microphone permission…');render();
  try{
    s.ctx=new AudioContext();await s.ctx.resume();
    s.keyboard=$('keyboard').checked||s.sample;
    if(!s.keyboard)s.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:false,channelCount:1}});
    if(s.finished){s.stream?.getTracks().forEach(t=>t.stop());return;}
    if(!s.keyboard)await s.ctx.audioWorklet.addModule('/pcm-processor.js');
    const result=await fetch('/api/voice-token',{method:'POST',headers:{'X-Demo-Code':$('access').value}});const payload=await result.json();if(!result.ok)throw new Error(payload.error);
    if(s.finished)return;
    s.ws=new WebSocket(`wss://agents.assemblyai.com/v1/ws?token=${encodeURIComponent(payload.token)}`);
    s.ws.onopen=()=>send(s,{type:'session.update',session:agentConfig(summarize(ledger))});
    s.timer=setTimeout(()=>end(s),180000);
    s.ws.onmessage=event=>{
      try{
        const msg=JSON.parse(event.data); if(!['reply.audio','transcript.agent.delta','transcript.user.delta'].includes(msg.type))console.info('voice-event',JSON.stringify({type:msg.type,status:msg.status,name:msg.name,arguments:msg.arguments,text:msg.text,code:msg.code,message:msg.message}));
        if(msg.type==='session.ready'){
          if(s.ending){end(s);return;}
          if(!s.keyboard){s.source=s.ctx.createMediaStreamSource(s.stream);s.worklet=new AudioWorkletNode(s.ctx,'capture-pcm');const mute=s.ctx.createGain();mute.gain.value=0;s.source.connect(s.worklet);s.worklet.connect(mute).connect(s.ctx.destination);
          s.worklet.port.onmessage=e=>{if(!s.ending&&!s.finished)send(s,{type:'input.audio',audio:base64(e.data)});};}
          s.ready=true;$('mode-label').textContent=s.sample?'LIVE · SAMPLE AUDIO':s.keyboard?'LIVE · KEYBOARD':'LIVE · LISTENING';$('voice-title').textContent=s.sample?'Hear a delivery come together.':s.keyboard?'Type it. I’ll read it back.':'Go ahead. I’m listening.';$('voice-description').textContent=s.sample?'Synthetic voice clips, real AssemblyAI transcription and tool calls.':'Name the product, carton count, loose units, and damage.';status(s.sample?'Connected. Waiting for the agent greeting before streaming sample audio.':s.keyboard?'Connected to AssemblyAI · keyboard input, voice response.':'Connected to AssemblyAI · microphone active.');
        }else if(msg.type==='transcript.user'){s.evidence.push(msg.text);message(s.sample?'sample':'user',msg.text);}
        else if(msg.type==='transcript.agent')message('agent',msg.text);
        else if(msg.type==='reply.audio'&&!s.ending)play(s,msg.data);
        else if(msg.type==='input.speech.started'&&!s.sample)clearPlayback(s);
        else if(msg.type==='tool.call')s.pending.push(msg);
        else if(msg.type==='reply.done'){
          if(msg.status==='interrupted'){s.pending=[];clearPlayback(s);return;}
          const pending=s.pending;s.pending=[];
          for(const call of pending){
            if(s.seen.has(call.call_id))continue;s.seen.add(call.call_id);
            try{const result=call.name==='get_receipt'?{rows:summarize(ledger)}:call.name==='record_count'?applyCount(ledger,call.arguments,call.call_id,s.evidence):(()=>{throw new Error('Unknown tool.')})();if(s.sample&&call.name==='record_count')s.sampleWaiting='readback';render();send(s,{type:'tool.result',call_id:call.call_id,result:JSON.stringify(result),is_error:false});}
            catch(error){send(s,{type:'tool.result',call_id:call.call_id,result:JSON.stringify({error:error.message}),is_error:true});status(error.message);}
          }
          if(s.sample&&!pending.length&&['greeting','readback'].includes(s.sampleWaiting)){if(s.sampleStreaming)s.sampleWaiting='next';else streamSample(s);}
        }else if(msg.type==='session.ended')finish(s,'Voice session ended. Review the draft receipt.');
        else if(msg.type==='session.error'){status(`Voice service: ${msg.message||msg.code}`);end(s);}
      }catch{status('Could not process a voice event. Ending the session.');end(s);}
    };
    s.ws.onerror=()=>{status('Voice connection failed.');end(s);};
    s.ws.onclose=()=>finish(s,'Connection closed. Your draft remains available.');
  }catch(error){finish(s,error.name==='NotAllowedError'?'Microphone permission was declined. Try the guided demo.':error.message||'Could not start the voice session.');}
}
$('start').onclick=()=>connect(false);$('stop').onclick=()=>end(session);
$('live-sample').onclick=()=>{if(session||demoRunning)return;ledger=createLedger();messages=[];renderMessages();connect(true);};
$('typed-form').onsubmit=e=>{e.preventDefault();const text=$('typed-count').value.trim();if(!text||!session?.ready||session.ending)return;session.evidence.push(text);message('user',text);send(session,{type:'conversation.message',role:'user',content:text});send(session,{type:'reply.create',instructions:`Respond to the latest typed user message: ${JSON.stringify(text)}. Use the record_count tool when all count fields are known.`});$('typed-count').value='';};
window.addEventListener('pagehide',()=>{if(session)send(session,{type:'session.end'});});
fetch('/api/status').then(r=>r.json()).then(data=>{$('access-wrap').hidden=!data.codeRequired;if(!data.liveAvailable){$('start').disabled=true;$('live-sample').disabled=true;status('Live voice is not configured. Explore the guided demo.');}}).catch(()=>status('Live connection unavailable. The guided demo still works.'));
render();
