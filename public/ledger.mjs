// Fictional purchase order. The first three lines match the recorded sample audio.
export const order = {
  id: 'PO-1048', supplier: 'Northside Supply', store: 'Larch Street Café', dock: 'Back door',
  items: [
    {sku:'OAT', name:'Oat milk', size:'1 L', unit:'bottles', perCarton:12, ordered:72},
    {sku:'COFFEE', name:'Coffee beans', size:'1 kg house blend', unit:'bags', perCarton:6, ordered:24},
    {sku:'CUPS', name:'Paper cups', size:'12 oz', unit:'sleeves', perCarton:10, ordered:50},
    {sku:'LIDS', name:'Cup lids', size:'12 oz', unit:'sleeves', perCarton:20, ordered:40},
    {sku:'MILK', name:'Whole milk', size:'2 L', unit:'jugs', perCarton:6, ordered:36},
    {sku:'NAPKINS', name:'Napkins', size:'2-ply', unit:'packs', perCarton:24, ordered:48}
  ]
};
export const skus = order.items.map(item => item.sku);
export function createLedger() { return {events:[], seen:[], revision:0}; }
export function summarize(ledger) {
  return order.items.map(item => {
    const active = ledger.events.filter(e=>e.sku===item.sku);
    const last = active.at(-1);
    const received = last ? last.cartons*item.perCarton+last.loose : null;
    const damaged = last?.damaged ?? 0;
    return {...item, received, damaged, usable:received===null?null:received-damaged,
      shortage:received===null?null:Math.max(0,item.ordered-received),
      overage:received===null?null:Math.max(0,received-item.ordered),
      cartons:last?.cartons??0, loose:last?.loose??0, evidence:last?.evidence??'',
      counts:active.length, revision:ledger.revision, checked:Boolean(last)};
  });
}
// Every exception on a line, so a damaged line that is also short shows both.
export function rowExceptions(row) {
  if (!row.checked) return [{kind:'pending', units:null, text:'Not counted'}];
  const list = [];
  if (row.shortage) list.push({kind:'short', units:row.shortage, text:`${row.shortage} short`});
  if (row.damaged) list.push({kind:'damaged', units:row.damaged, text:`${row.damaged} damaged`});
  if (row.overage) list.push({kind:'extra', units:row.overage, text:`${row.overage} extra`});
  if (!list.length) list.push({kind:'match', units:0, text:'Matches order'});
  return list;
}
export function receiptTotals(rows) {
  const checked = rows.filter(r=>r.checked);
  const sum = key => checked.reduce((n,r)=>n+(r[key]||0),0);
  return {lines:rows.length, checked:checked.length, ordered:rows.reduce((n,r)=>n+r.ordered,0), orderedChecked:sum('ordered'),
    received:sum('received'), usable:sum('usable'), shortage:sum('shortage'), damaged:sum('damaged'), overage:sum('overage'),
    attention:checked.filter(r=>r.shortage||r.damaged||r.overage).length};
}
const norm=s=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
// The quote must appear in the transcript as whole words, so "4 cartons" cannot borrow from "14 cartons".
export function quoteAppears(quote, texts) {
  const q=norm(quote);
  return Boolean(q) && (' '+norm(texts.join(' '))+' ').includes(' '+q+' ');
}
export function applyCount(ledger, args, callId, evidenceTexts=[]) {
  if (ledger.seen.includes(callId)) return {ok:true, duplicate:true, rows:summarize(ledger)};
  const item=order.items.find(i=>i.sku===args.sku);
  if (!item) throw new Error(`Unknown product. Use ${skus.slice(0,-1).join(', ')} or ${skus.at(-1)}.`);
  for (const field of ['cartons','loose','damaged']) {
    if (!Number.isSafeInteger(args[field]) || args[field]<0 || args[field]>10000) throw new Error(`${field[0].toUpperCase()+field.slice(1)} must be a whole number from 0 to 10000.`);
  }
  const total=args.cartons*item.perCarton+args.loose;
  if(args.damaged>total) throw new Error(`Damaged units cannot be more than the ${total} received.`);
  if(typeof args.evidence!=='string'||!args.evidence.trim()) throw new Error('A source quote is required.');
  if(!quoteAppears(args.evidence, evidenceTexts)) throw new Error('The source quote must appear in a received user transcript.');
  ledger.revision++;
  ledger.seen.push(callId);
  ledger.events.push({sku:args.sku,cartons:args.cartons,loose:args.loose,damaged:args.damaged,evidence:args.evidence,revision:ledger.revision,at:new Date().toISOString()});
  return {ok:true,revision:ledger.revision,row:summarize(ledger).find(r=>r.sku===args.sku),note:'Draft count replaced. Review before exporting.'};
}
export function toCSV(ledger) {
  const cell=value=>{let text=String(value??'');if(typeof value==='string'&&/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  const header=['SKU','Product','Pack size','Ordered','Cartons','Loose','Received','Damaged','Usable','Shortage','Overage','Counts recorded','Source quote'];
  const rows=summarize(ledger).map(r=>[r.sku,`${r.name} ${r.size}`,`${r.perCarton} ${r.unit}`,r.ordered,r.checked?r.cartons:null,r.checked?r.loose:null,r.received,r.checked?r.damaged:null,r.usable,r.shortage,r.overage,r.counts,r.evidence]);
  return [header,...rows].map(row=>row.map(cell).join(',')).join('\r\n');
}
