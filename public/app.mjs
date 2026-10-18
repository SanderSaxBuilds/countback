import { order, createLedger, summarize, applyCount, toCSV, rowExceptions, receiptTotals } from "./ledger.mjs";
import { walkthroughSteps } from "./walkthrough.mjs";
import { agentConfig } from "./agent-config.mjs";

const $ = id => document.getElementById(id);
let ledger = createLedger();
let messages = 0;
let editSku = null;
let freshSku = null;
let demoRunning = false;
let runToken = 0;
let manualSequence = 0;
let session = null;
const sources = new Map();
const busy = () => demoRunning || Boolean(session);
const SAMPLE_CLIPS = 4;
const VOICE_DEFAULT = { mode: "Ready when you are", title: "Count it out loud", description: "Say the product, the cartons, any loose units and any damage. Countback reads it back and fills in the receipt." };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const unitWord = (row, n) => n === 1 ? row.unit.replace(/s$/, "") : row.unit;

function status(text) { $("walkthrough-status").textContent = text; }
function voiceText({ mode, title, description }) {
  if (mode !== undefined) $("mode-label").textContent = mode;
  if (title !== undefined) $("voice-title").textContent = title;
  if (description !== undefined) $("voice-description").textContent = description;
}

function resetLog() {
  messages = 0;
  $("transcript").replaceChildren(el("p", "empty-log", "Spoken counts and readbacks appear here."));
  $("message-count").textContent = "No entries";
}

const ROLE_LABELS = { agent: "Countback", system: "Countback", demo: "Receiver, scripted", sample: "Sample audio", user: "You" };
function appendMessage(role, text) {
  if (!messages) $("transcript").replaceChildren();
  const entry = el("article", "utterance" + (role === "agent" || role === "system" ? " is-agent" : ""));
  entry.append(el("span", "utterance-label", ROLE_LABELS[role] ?? "You"), el("p", "", text));
  $("transcript").append(entry);
  messages++;
  $("message-count").textContent = plural(messages, "entry", "entries");
  $("transcript").scrollTop = $("transcript").scrollHeight;
}

function renderDelivery(rows, totals) {
  const cartons = order.items.reduce((n, item) => n + Math.ceil(item.ordered / item.perCarton), 0);
  const meta = $("delivery-meta");
  if (!meta.childElementCount) {
    for (const [term, value] of [["Arrived", "7:42 AM"], ["Drop-off", order.dock], ["Expected", plural(cartons, "carton", "cartons")], ["Lines", String(order.items.length)]]) {
      const group = el("div"); group.append(el("dt", "", term), el("dd", "", value)); meta.append(group);
    }
    $("route").textContent = `${order.supplier} to ${order.store}`;
    $("po-title").textContent = order.id;
  }
  $("progress-count").textContent = `${totals.checked} of ${totals.lines}`;
  const track = $("progress-track");
  track.style.setProperty("--lines", String(rows.length));
  track.replaceChildren(...rows.map(row => {
    const flags = rowExceptions(row);
    return el("span", !row.checked ? "" : flags[0].kind === "match" ? "is-match" : "is-flag");
  }));
}

function renderTotals(totals) {
  const any = totals.checked > 0;
  const tiles = [
    ["", "Received", any ? String(totals.received) : "0", any ? `of ${totals.orderedChecked} ordered on counted lines` : `${totals.ordered} units on order`],
    ["is-short", "Short", any ? String(totals.shortage) : "0", "units below the order"],
    ["is-damaged", "Damaged", any ? String(totals.damaged) : "0", "included in received"],
    ["is-extra", "Extra", any ? String(totals.overage) : "0", "units above the order"],
  ];
  $("totals").replaceChildren(...tiles.map(([cls, label, value, note]) => {
    const tile = el("div", `total ${Number(value) > 0 ? cls : ""}`);
    tile.append(el("p", "total-label", label), el("p", "total-value", value), el("p", "total-note", note));
    return tile;
  }));
}

function cell(className, label) {
  const td = el("td", className);
  if (label) td.dataset.label = label;
  return td;
}

function renderRows(rows) {
  const body = $("rows");
  body.replaceChildren();
  const firstOpen = rows.find(row => !row.checked)?.sku;
  for (const row of rows) {
    const tr = el("tr", row.sku === freshSku ? "is-fresh" : "");
    const product = cell("product-cell");
    const meta = el("span", "product-meta", `${row.size}, ${row.perCarton} ${row.unit} per carton, `);
    meta.append(el("span", "sku", row.sku));
    product.append(el("span", "product-name", row.name), meta);
    const ordered = cell("num-col", "Ordered"); ordered.textContent = String(row.ordered);
    const received = cell("num-col", "Received");
    if (row.checked) received.append(document.createTextNode(String(row.received)), el("span", "count-detail", `${plural(row.cartons, "carton", "cartons")} and ${row.loose} loose`));
    else received.append(el("span", "not-counted", "Not yet"));
    const usable = cell("num-col", "Usable");
    usable.textContent = row.checked ? String(row.usable) : "0";
    const statusCell = cell("status-cell", "Status");
    const chips = el("div", "chips");
    for (const flag of rowExceptions(row)) chips.append(el("span", `chip ${flag.kind}`, flag.text));
    statusCell.append(chips);
    const actionCell = cell("action-cell");
    const action = el("button", "row-action" + (row.sku === firstOpen ? " is-first" : ""), row.checked ? "Recount" : "Count");
    action.type = "button";
    action.dataset.edit = row.sku;
    action.setAttribute("aria-label", `${row.checked ? "Recount" : "Count"} ${row.name}`);
    action.disabled = busy();
    action.addEventListener("click", () => openEdit(row.sku));
    actionCell.append(action);
    tr.append(product, ordered, received, usable, statusCell, actionCell);
    body.append(tr);
  }
}

function renderAttention(rows, totals) {
  const items = [];
  for (const row of rows) {
    for (const flag of rowExceptions(row)) {
      if (flag.kind === "short") items.push(["short", `${row.name}: ${flag.units} ${unitWord(row, flag.units)} short of the ${row.ordered} ordered.`]);
      if (flag.kind === "damaged") items.push(["damaged", `${row.name}: ${flag.units} ${unitWord(row, flag.units)} damaged. Set aside for a supplier credit.`]);
      if (flag.kind === "extra") items.push(["extra", `${row.name}: ${flag.units} ${unitWord(row, flag.units)} more than ordered.`]);
    }
  }
  const open = rows.filter(row => !row.checked);
  if (open.length) items.push(["pending", `${plural(open.length, "line", "lines")} still to count: ${open.map(row => row.name).join(", ")}.`]);
  if (!items.length) items.push(["clear", "Every line matches the order."]);
  $("attention").replaceChildren(...items.map(([kind, text]) => el("li", kind, text)));
  $("attention-count").textContent = totals.checked ? plural(totals.attention, "line flagged", "lines flagged") : "";
}

function renderHistory() {
  const list = $("history");
  $("revision").textContent = ledger.revision ? plural(ledger.revision, "count", "counts") : "";
  if (!ledger.events.length) { const empty = el("li", "history-empty", "Every count and correction will be listed here. Nothing is overwritten."); empty.style.display = "block"; list.replaceChildren(empty); return; }
  const latest = new Map(ledger.events.map(event => [event.sku, event.revision]));
  list.replaceChildren(...[...ledger.events].reverse().map(event => {
    const item = order.items.find(product => product.sku === event.sku);
    const li = el("li", latest.get(event.sku) === event.revision ? "" : "is-replaced");
    li.append(el("span", "history-rev", String(event.revision).padStart(2, "0")));
    const body = el("div");
    const main = el("span", "history-main");
    main.append(el("strong", "", item.name), document.createTextNode(`, ${plural(event.cartons, "carton", "cartons")} and ${event.loose} loose, ${event.damaged} damaged = ${event.cartons * item.perCarton + event.loose} ${item.unit}`));
    if (latest.get(event.sku) !== event.revision) main.append(el("span", "replaced-tag", "Replaced"));
    body.append(main, el("span", "history-quote", `${sources.get(event.revision) ?? "Count"}: ${event.evidence}`));
    li.append(body);
    return li;
  }));
}

function render() {
  const rows = summarize(ledger);
  const totals = receiptTotals(rows);
  const complete = totals.checked === totals.lines;
  renderDelivery(rows, totals);
  renderTotals(totals);
  renderRows(rows);
  renderAttention(rows, totals);
  renderHistory();
  $("export").disabled = !complete || busy();
  $("print").disabled = !complete || busy();
  $("stop-demo").hidden = !demoRunning;
  $("draft-chip").textContent = complete ? "Ready to export" : "Draft";
  $("draft-chip").classList.toggle("is-ready", complete);
  $("review-note").textContent = complete
    ? `All ${totals.lines} lines counted. ${totals.attention ? `${plural(totals.attention, "line needs", "lines need")} a note to the supplier.` : "Everything matches the order."}`
    : `Count all ${totals.lines} lines to export the receipt. ${plural(totals.lines - totals.checked, "line", "lines")} left.`;
}

function record(args, callId, evidenceTexts, source) {
  const result = applyCount(ledger, args, callId, evidenceTexts);
  if (result.revision) sources.set(result.revision, source);
  if (!result.duplicate) freshSku = args.sku;
  return result;
}

function openEdit(sku) {
  if (busy()) return;
  editSku = sku;
  const row = summarize(ledger).find(item => item.sku === sku);
  $("edit-title").textContent = `${row.checked ? "Recount" : "Count"} ${row.name}`;
  $("edit-intro").textContent = `${row.perCarton} ${row.unit} per carton, ${row.ordered} ordered. Damaged units are part of the received total.`;
  $("cartons").value = row.checked ? String(row.cartons) : "";
  $("loose").value = String(row.loose);
  $("damaged").value = String(row.damaged);
  $("edit-error").textContent = "";
  updateLiveTotal();
  $("edit-dialog").showModal();
  $("cartons").focus();
  $("cartons").select();
}

function readField(id) {
  const raw = $(id).value.trim();
  return /^\d+$/.test(raw) ? Number(raw) : NaN;
}

function updateLiveTotal() {
  const row = order.items.find(item => item.sku === editSku);
  if (!row) return;
  const cartons = readField("cartons"), loose = readField("loose"), damaged = readField("damaged");
  if ([cartons, loose, damaged].some(Number.isNaN)) { $("live-total").textContent = "Enter whole numbers to see the total."; return; }
  const received = cartons * row.perCarton + loose;
  const diff = received - row.ordered;
  $("live-total").textContent = `${received} ${row.unit} received, ${Math.max(0, received - damaged)} usable. ${diff === 0 ? "Matches the order." : diff < 0 ? `${-diff} short.` : `${diff} extra.`}`;
}

const delay = ms => new Promise(resolve => window.setTimeout(resolve, ms));

function setActive(active, mode) {
  $("start").hidden = active;
  $("stop").hidden = !active || demoRunning;
  for (const id of ["demo", "live-sample", "reset", "keyboard"]) $(id).disabled = active;
  if (!active && !liveAvailable) { $("start").disabled = true; $("live-sample").disabled = true; }
  $("typed-form").hidden = !active || !$("keyboard").checked || demoRunning || Boolean(session?.sample);
  $("orb").classList.toggle("live", active && !demoRunning);
  voiceText({ mode });
}

function summaryLine() {
  const totals = receiptTotals(summarize(ledger));
  const parts = [];
  if (totals.shortage) parts.push(`${totals.shortage} short`);
  if (totals.damaged) parts.push(`${totals.damaged} damaged`);
  if (totals.overage) parts.push(`${totals.overage} extra`);
  return `${totals.checked} of ${totals.lines} lines counted${parts.length ? `: ${parts.join(", ")}` : ""}. Every correction is kept in the history.`;
}

async function playWalkthrough() {
  if (busy()) return;
  demoRunning = true;
  const token = ++runToken;
  ledger = createLedger(); sources.clear(); freshSku = null;
  resetLog();
  setActive(true, "Walkthrough");
  voiceText({ title: "A delivery, line by line", description: "Scripted example. No microphone and no network calls." });
  status("Playing the scripted delivery.");
  render();
  for (let index = 0; index < walkthroughSteps.length; index++) {
    await delay(900);
    if (token !== runToken) return;
    const step = walkthroughSteps[index];
    appendMessage("demo", step.text);
    record({ ...step, evidence: step.text }, "guided-" + index, [step.text], "Walkthrough");
    render();
    await delay(650);
    if (token !== runToken) return;
    appendMessage("system", step.reply);
  }
  demoRunning = false;
  setActive(false, "Walkthrough finished");
  voiceText({ title: "Delivery checked", description: summaryLine() });
  status("Recount any line, then print or export the receipt.");
  render();
}

function newReceipt() {
  ledger = createLedger(); sources.clear(); freshSku = null;
  resetLog();
  voiceText(VOICE_DEFAULT);
}

$("demo").addEventListener("click", playWalkthrough);
$("stop-demo").addEventListener("click", () => {
  if (!demoRunning) return;
  runToken++;
  demoRunning = false;
  setActive(false, "Walkthrough stopped");
  voiceText({ title: VOICE_DEFAULT.title, description: summaryLine() });
  status("Stopped. The counts so far stay on the receipt.");
  render();
  $("demo").focus();
});
$("reset").addEventListener("click", () => {
  if (busy()) return;
  if (ledger.events.length && !window.confirm("Start a new receipt? The counts on this one will be cleared.")) return;
  newReceipt();
  status("New receipt ready.");
  render();
});
for (const id of ["cartons", "loose", "damaged"]) $(id).addEventListener("input", updateLiveTotal);
$("cancel-edit").addEventListener("click", () => $("edit-dialog").close());
$("edit-dialog").addEventListener("close", () => { document.querySelector(`[data-edit="${editSku}"]`)?.focus(); });
$("edit-form").addEventListener("submit", event => {
  event.preventDefault();
  const args = { sku: editSku };
  for (const field of ["cartons", "loose", "damaged"]) {
    args[field] = readField(field);
    if (Number.isNaN(args[field])) { $("edit-error").textContent = "Use whole numbers of 0 or more in every field."; $(field).focus(); return; }
  }
  const evidence = `Manual count: ${args.cartons} cartons, ${args.loose} loose, ${args.damaged} damaged.`;
  try {
    manualSequence++;
    record({ ...args, evidence }, "manual-" + Date.now() + "-" + manualSequence, [evidence], "Manual count");
    render();
    $("edit-dialog").close();
    status(`${order.items.find(item => item.sku === editSku).name} saved. The history keeps every earlier count.`);
  } catch (error) {
    $("edit-error").textContent = error.message;
  }
});
function download(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.hidden = true;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("export").addEventListener("click", () => {
  if ($("export").disabled) return;
  download(toCSV(ledger), `countback-${order.id}.csv`, "text/csv;charset=utf-8");
  status("CSV saved to this device. Counts and source quotes are included.");
});
$("print").addEventListener("click", () => { if (!$("print").disabled) window.print(); });

// Live voice through the AssemblyAI Voice Agent API.
let liveAvailable = true;
function base64(buffer) { const bytes = new Uint8Array(buffer); let text = ""; for (const b of bytes) text += String.fromCharCode(b); return btoa(text); }
function clearPlayback(s) { for (const source of s.sources) { try { source.stop(); } catch { /* already stopped */ } } s.sources.clear(); s.playAt = 0; }
function play(s, data) {
  if (!s.ctx || s.ctx.state === "closed") return;
  const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
  const view = new DataView(bytes.buffer), audio = s.ctx.createBuffer(1, Math.floor(bytes.length / 2), 24000);
  const channel = audio.getChannelData(0);
  for (let i = 0; i < channel.length; i++) channel[i] = view.getInt16(i * 2, true) / 32768;
  const source = s.ctx.createBufferSource(); source.buffer = audio; source.connect(s.ctx.destination);
  s.sources.add(source); source.onended = () => s.sources.delete(source);
  const at = Math.max(s.ctx.currentTime + .025, s.playAt); source.start(at); s.playAt = at + audio.duration;
}
function send(s, event) { if (s.ws?.readyState === WebSocket.OPEN) s.ws.send(JSON.stringify(event)); }
function finish(s, text) {
  if (s.finished) return;
  s.finished = true;
  clearTimeout(s.timer); clearTimeout(s.closeTimer);
  s.stream?.getTracks().forEach(track => track.stop());
  s.worklet?.disconnect(); s.source?.disconnect();
  clearPlayback(s);
  s.ctx?.close().catch(() => {});
  s.ws?.close();
  if (session === s) session = null;
  setActive(false, "Session ended");
  voiceText({ title: "Ready to review", description: summaryLine() });
  status(text);
  render();
}
function end(s) {
  if (!s || s.finished) return;
  s.ending = true;
  s.stream?.getTracks().forEach(track => track.stop());
  clearPlayback(s);
  if (s.ws?.readyState === WebSocket.OPEN) { send(s, { type: "session.end" }); s.closeTimer = setTimeout(() => finish(s, "Session ended. Your draft stays on screen."), 5000); }
  else finish(s, s.error || "Session ended.");
}
async function streamSample(s) {
  if (s.finished || s.ending) return;
  s.sampleStep++;
  if (s.sampleStep > SAMPLE_CLIPS) { status("Sample audio finished. It covers oat milk, coffee beans and paper cups. Count the other lines by hand or by voice."); end(s); return; }
  s.sampleWaiting = "listening";
  s.sampleStreaming = true;
  try {
    await delay(Math.max(0, (s.playAt - s.ctx.currentTime) * 1000) + 250);
    const response = await fetch(`/sample-${s.sampleStep}.wav`); if (!response.ok) throw new Error("Sample audio could not be loaded.");
    const buffer = await response.arrayBuffer(), v = new DataView(buffer); let audio = null, valid = false;
    for (let at = 12; at + 8 <= v.byteLength;) { const id = String.fromCharCode(...new Uint8Array(buffer, at, 4)), size = v.getUint32(at + 4, true); if (at + 8 + size > v.byteLength) throw new Error("Invalid sample audio."); if (id === "fmt ") valid = v.getUint16(at + 8, true) === 1 && v.getUint16(at + 10, true) === 1 && v.getUint32(at + 12, true) === 24000 && v.getUint16(at + 22, true) === 16; if (id === "data") audio = new Uint8Array(buffer, at + 8, size); at += 8 + size + (size % 2); }
    if (!valid || !audio) throw new Error("Sample must be mono PCM16 at 24 kHz.");
    status(`Streaming sample clip ${s.sampleStep} of ${SAMPLE_CLIPS} through live AssemblyAI speech recognition.`);
    // No microphone is opened. The same prerecorded PCM is played and streamed in real time.
    for (let at = 0; at < audio.length && !s.finished && !s.ending; at += 2400) { const chunk = audio.slice(at, at + 2400); const encoded = base64(chunk.buffer); send(s, { type: "input.audio", audio: encoded }); play(s, encoded); await delay(50); }
    // A short silence lets turn detection finalize the prerecorded utterance.
    for (let i = 0; i < 30 && !s.finished && !s.ending; i++) { send(s, { type: "input.audio", audio: base64(new ArrayBuffer(2400)) }); await delay(50); }
    s.sampleStreaming = false;
    if (s.sampleWaiting === "next") streamSample(s);
  } catch (error) { s.error = error.message; status(error.message); end(s); }
}
async function connect(useSample = false) {
  if (busy()) return;
  const s = { sources: new Set(), pending: [], seen: new Set(), evidence: [], playAt: 0, finished: false, sample: useSample, sampleStep: 0, sampleWaiting: "greeting" };
  session = s;
  setActive(true, "Connecting");
  status(useSample || $("keyboard").checked ? "Connecting to AssemblyAI." : "Asking for microphone permission.");
  render();
  try {
    s.ctx = new AudioContext(); await s.ctx.resume();
    s.keyboard = $("keyboard").checked || s.sample;
    if (!s.keyboard) s.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, channelCount: 1 } });
    if (s.finished) { s.stream?.getTracks().forEach(track => track.stop()); return; }
    if (!s.keyboard) await s.ctx.audioWorklet.addModule("/pcm-processor.js");
    const result = await fetch("/api/voice-token", { method: "POST", headers: { "X-Demo-Code": $("access").value } }); const payload = await result.json(); if (!result.ok) throw new Error(payload.error);
    if (s.finished) return;
    s.ws = new WebSocket(`wss://agents.assemblyai.com/v1/ws?token=${encodeURIComponent(payload.token)}`);
    s.ws.onopen = () => send(s, { type: "session.update", session: agentConfig(summarize(ledger)) });
    s.timer = setTimeout(() => end(s), 180000);
    s.ws.onmessage = event => {
      try {
        const msg = JSON.parse(event.data); if (!["reply.audio", "transcript.agent.delta", "transcript.user.delta"].includes(msg.type)) console.info("voice-event", JSON.stringify({ type: msg.type, status: msg.status, name: msg.name, arguments: msg.arguments, text: msg.text, code: msg.code, message: msg.message }));
        if (msg.type === "session.ready") {
          if (s.ending) { end(s); return; }
          if (!s.keyboard) {
            s.source = s.ctx.createMediaStreamSource(s.stream); s.worklet = new AudioWorkletNode(s.ctx, "capture-pcm"); const mute = s.ctx.createGain(); mute.gain.value = 0; s.source.connect(s.worklet); s.worklet.connect(mute).connect(s.ctx.destination);
            s.worklet.port.onmessage = e => { if (!s.ending && !s.finished) send(s, { type: "input.audio", audio: base64(e.data) }); };
          }
          s.ready = true;
          voiceText(s.sample
            ? { mode: "Live, sample audio", title: "Hear a delivery come together", description: "Recorded sample clips, live AssemblyAI transcription and tool calls." }
            : s.keyboard ? { mode: "Live, keyboard", title: "Type it, hear it read back", description: "Name the product, the cartons, any loose units and any damage." }
            : { mode: "Live, listening", title: "Go ahead, I'm listening", description: "Name the product, the cartons, any loose units and any damage." });
          $("typed-form").hidden = !s.keyboard || s.sample;
          status(s.sample ? "Connected. Waiting for the greeting before the sample audio starts." : s.keyboard ? "Connected to AssemblyAI. Type a count and the reply is spoken." : "Connected to AssemblyAI. The microphone is on.");
        } else if (msg.type === "transcript.user") { s.evidence.push(msg.text); appendMessage(s.sample ? "sample" : "user", msg.text); }
        else if (msg.type === "transcript.agent") appendMessage("agent", msg.text);
        else if (msg.type === "reply.audio" && !s.ending) play(s, msg.data);
        else if (msg.type === "input.speech.started" && !s.sample) clearPlayback(s);
        else if (msg.type === "tool.call") s.pending.push(msg);
        else if (msg.type === "reply.done") {
          if (msg.status === "interrupted") { s.pending = []; clearPlayback(s); return; }
          const pending = s.pending; s.pending = [];
          for (const call of pending) {
            if (s.seen.has(call.call_id)) continue; s.seen.add(call.call_id);
            try {
              const result = call.name === "get_receipt" ? { rows: summarize(ledger) } : call.name === "record_count" ? record(call.arguments, call.call_id, s.evidence, s.sample ? "Sample audio" : "Voice") : (() => { throw new Error("Unknown tool."); })();
              if (s.sample && call.name === "record_count") s.sampleWaiting = "readback";
              render();
              send(s, { type: "tool.result", call_id: call.call_id, result: JSON.stringify(result), is_error: false });
            } catch (error) { send(s, { type: "tool.result", call_id: call.call_id, result: JSON.stringify({ error: error.message }), is_error: true }); status(error.message); }
          }
          if (s.sample && !pending.length && ["greeting", "readback"].includes(s.sampleWaiting)) { if (s.sampleStreaming) s.sampleWaiting = "next"; else streamSample(s); }
        } else if (msg.type === "session.ended") finish(s, "Voice session ended. Review the draft receipt.");
        else if (msg.type === "session.error") { s.error = `Voice service: ${msg.message || msg.code}`; status(s.error); end(s); }
      } catch { status("Could not process a voice event. Ending the session."); end(s); }
    };
    s.ws.onerror = () => { s.error = "Voice connection failed."; status(s.error); end(s); };
    s.ws.onclose = () => finish(s, s.error || "Connection closed. Your draft stays on screen.");
  } catch (error) { finish(s, error.name === "NotAllowedError" ? "Microphone permission was declined. Try the walkthrough or type instead." : error.message || "Could not start the voice session."); }
}
$("start").addEventListener("click", () => connect(false));
$("stop").addEventListener("click", () => end(session));
$("live-sample").addEventListener("click", () => {
  if (busy()) return;
  if (ledger.events.length && !window.confirm("The sample starts a new receipt. Clear the current counts?")) return;
  newReceipt();
  connect(true);
});
$("typed-form").addEventListener("submit", event => {
  event.preventDefault();
  const text = $("typed-count").value.trim();
  if (!text || !session?.ready || session.ending) return;
  session.evidence.push(text);
  appendMessage("user", text);
  send(session, { type: "conversation.message", role: "user", content: text });
  send(session, { type: "reply.create", instructions: `Respond to the latest typed user message: ${JSON.stringify(text)}. Use the record_count tool when all count fields are known.` });
  $("typed-count").value = "";
});
window.addEventListener("pagehide", () => { if (session) send(session, { type: "session.end" }); });
fetch("/api/status").then(r => r.json()).then(data => {
  $("access-wrap").hidden = !data.codeRequired;
  if (!data.liveAvailable) { liveAvailable = false; $("start").disabled = true; $("live-sample").disabled = true; status("Live voice is not set up on this server. The walkthrough and manual counts still work."); }
}).catch(() => { liveAvailable = false; $("start").disabled = true; $("live-sample").disabled = true; status("Live voice is unavailable here. The walkthrough and manual counts still work."); });

resetLog();
voiceText(VOICE_DEFAULT);
render();
