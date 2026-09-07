# Countback

A hands-free delivery receiving workspace for the AssemblyAI Voice Agent Hackathon. Speak carton counts, correct mistakes, flag damaged units, then review and export a receipt. This is an AI-assisted contest project by Alexandr Khrustalev / SanderSaxBuilds.

## Run locally

Requires Node.js 22+. No packages required.

1. Copy `.env.example` to `.env` and set `ASSEMBLYAI_API_KEY`.
2. Run `node --env-file-if-exists=.env server.mjs`.
3. Open `http://localhost:3210` in a browser.
4. Choose **Try guided demo** for a clearly labeled scripted walkthrough, or **Start receiving** for live AssemblyAI speech-in/speech-out with microphone permission.

Run tests with `node --test`.

## Design

- AssemblyAI Voice Agent API handles speech recognition, dialogue, voice output, interruption and function calling.
- Server mints a single-use 60-second token with a 180-second session cap. The API key stays server-side.
- Browser captures PCM16 at 24 kHz using an AudioWorklet with persistent resampling phase. Output audio uses Web Audio scheduling.
- `record_count` replaces a complete product count only after a completed reply. Interrupted tool calls are discarded. Replayed call IDs cannot duplicate changes.
- Arithmetic is deterministic: cartons × pack size + loose = received; usable = received − damaged. Damage is included in received.
- Each change must quote an actual user transcript. This verifies quote provenance, not semantic truth: users must review the extracted quantities.
- Manual review and CSV export stay in the browser. No inventory systems, payments, or purchase orders are modified. Data is not persisted after refresh.
- Guided demo is scripted and makes no API calls. It is never presented as a live model result.

## Hosting

For public hosting, set `DEMO_ACCESS_CODE` privately and give that code to judges. Live token requests have an hourly per-address limit and a 30-session process cap. Production deployments need durable limits; restarting a process resets this demonstration limiter. The public guided demo works without credentials. Do not publish `.env`.

## Privacy

The purchase order is entirely synthetic. Live audio and session configuration are sent to AssemblyAI for processing under its policies. Transcript and draft counts remain in browser memory; refresh clears them. Do not use real customer or patient data in this demo.

## Sources

- https://www.assemblyai.com/docs/voice-agents/voice-agent-api/browser-integration
- https://www.assemblyai.com/docs/voice-agents/voice-agent-api/events-reference
- https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon

## Current validation

Seven unit tests pass for arithmetic, replacement corrections, duplicate calls, invalid counts, evidence provenance, overage and CSV quoting. A live AssemblyAI keyboard-to-voice session successfully called record_count for three products and an oat-milk correction: final totals 72 bottles (2 damaged), 24 bags, and 45 sleeves (5 short), with four retained history events. The 180-second cap ended the session correctly. Microphone capture and deployment validation are pending.

## License

MIT. See LICENSE.
