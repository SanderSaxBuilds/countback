import test from 'node:test';
import assert from 'node:assert/strict';
import {order,createLedger,applyCount,summarize,rowExceptions,receiptTotals,quoteAppears,toCSV} from './public/ledger.mjs';
import {walkthroughSteps} from './public/walkthrough.mjs';
import {agentConfig} from './public/agent-config.mjs';

test('quotes must match whole words, so 4 cartons cannot borrow from 14 cartons',()=>{
  assert.equal(quoteAppears('4 cartons of oat milk',['I got 14 cartons of oat milk']),false);
  assert.equal(quoteAppears('ten cartons',['fifteen cartons']),false);
  assert.equal(quoteAppears('14 cartons of oat milk',['I got 14 cartons of oat milk.']),true);
  const l=createLedger();
  assert.throws(()=>applyCount(l,{sku:'OAT',cartons:4,loose:0,damaged:0,evidence:'4 cartons of oat milk'},'a',['I got 14 cartons of oat milk']));
  assert.equal(l.events.length,0);
});

test('a line that is damaged and short reports both',()=>{
  const l=createLedger();
  applyCount(l,{sku:'OAT',cartons:5,loose:0,damaged:2,evidence:'five cartons two damaged'},'a',['Five cartons, two damaged.']);
  assert.deepEqual(rowExceptions(summarize(l)[0]).map(e=>e.text),['12 short','2 damaged']);
  assert.deepEqual(rowExceptions(summarize(l)[1]).map(e=>e.kind),['pending']);
});

test('guided walkthrough produces the expected receipt',()=>{
  const l=createLedger();
  walkthroughSteps.forEach((step,i)=>applyCount(l,{...step,evidence:step.text},'guided-'+i,[step.text]));
  const rows=summarize(l);
  assert.deepEqual(rows.map(r=>r.received),[72,24,45,40,36,51]);
  assert.equal(l.events.length,7);
  assert.equal(rows[0].counts,2);
  const totals=receiptTotals(rows);
  assert.deepEqual({checked:totals.checked,received:totals.received,usable:totals.usable,shortage:totals.shortage,damaged:totals.damaged,overage:totals.overage,attention:totals.attention},{checked:6,received:268,usable:265,shortage:5,damaged:3,overage:3,attention:4});
  assert.equal(totals.ordered,order.items.reduce((n,i)=>n+i.ordered,0));
  for (const step of walkthroughSteps) assert.match(step.reply,/\d/);
});

test('CSV lists every line with pack size, cartons, loose and how many counts were recorded',()=>{
  const l=createLedger();
  walkthroughSteps.forEach((step,i)=>applyCount(l,{...step,evidence:step.text},'guided-'+i,[step.text]));
  const lines=toCSV(l).split('\r\n');
  assert.equal(lines.length,order.items.length+1);
  assert.equal(lines[0],'"SKU","Product","Pack size","Ordered","Cartons","Loose","Received","Damaged","Usable","Shortage","Overage","Counts recorded","Source quote"');
  assert.match(lines[1],/^"OAT","Oat milk 1 L","12 bottles","72","6","0","72","2","70","0","0","2",/);
});

test('voice tool schema follows the order',()=>{
  const config=agentConfig([]);
  const record=config.tools.find(t=>t.name==='record_count');
  assert.deepEqual(record.parameters.properties.sku.enum,order.items.map(i=>i.sku));
  for (const item of order.items) assert.ok(config.input.keyterms.includes(item.name.toLowerCase()));
});
