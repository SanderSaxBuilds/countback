export const order = {
  id: 'PO-1048', supplier: 'Northside Supply', store: 'Corner Store',
  items: [
    {sku:'OAT', name:'Oat milk', unit:'bottles', perCarton:12, ordered:72},
    {sku:'COFFEE', name:'Coffee beans', unit:'bags', perCarton:6, ordered:24},
    {sku:'CUPS', name:'Paper cups', unit:'sleeves', perCarton:10, ordered:50}
  ]
};
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
      revision:ledger.revision, checked:Boolean(last)};
  });
}
export function applyCount(ledger, args, callId, evidenceTexts=[]) {
  if (ledger.seen.includes(callId)) return {ok:true, duplicate:true, rows:summarize(ledger)};
  const item=order.items.find(i=>i.sku===args.sku);
  if (!item) throw new Error('Unknown product. Use OAT, COFFEE, or CUPS.');
  for (const field of ['cartons','loose','damaged']) {
    if (!Number.isSafeInteger(args[field]) || args[field]<0 || args[field]>10000) throw new Error(`${field} must be a whole number from 0 to 10000.`);
  }
  const total=args.cartons*item.perCarton+args.loose;
  if(args.damaged>total) throw new Error('Damaged units cannot exceed the total received. Ask for clarification.');
  if(typeof args.evidence!=='string'||!args.evidence.trim()) throw new Error('A source quote is required.');
  const norm=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  if(!evidenceTexts.some(t=>norm(t).includes(norm(args.evidence)))) throw new Error('The source quote must appear in a received user transcript.');
  ledger.revision++;
  ledger.seen.push(callId);
  ledger.events.push({sku:args.sku,cartons:args.cartons,loose:args.loose,damaged:args.damaged,evidence:args.evidence,revision:ledger.revision,at:new Date().toISOString()});
  return {ok:true,revision:ledger.revision,row:summarize(ledger).find(r=>r.sku===args.sku),note:'Draft count replaced. Review before exporting.'};
}
export function toCSV(ledger) {
  const cell=value=>'"'+String(value??'').replaceAll('"','""')+'"';
  return [['SKU','Product','Ordered','Received','Damaged','Usable','Shortage','Overage','Source quote'],...summarize(ledger).map(r=>[r.sku,r.name,r.ordered,r.received,r.damaged,r.usable,r.shortage,r.overage,r.evidence])].map(row=>row.map(cell).join(',')).join('\r\n');
}
