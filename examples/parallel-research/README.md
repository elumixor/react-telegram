# parallel-research

The all-in-one demo. On `/research <topic>` the bot spins up a "research crew" that updates **four messages in parallel** in the same chat, then drops a final report:

- **Header** — live elapsed timer, edited in place every 200ms.
- **Sources** — Claude (Haiku) returns a JSON list of real authoritative sources for your topic; revealed one-by-one for the camera.
- **Gallery** — drops 3 real photos one at a time (via [picsum.photos](https://picsum.photos), seeded by topic).
- **Reasoning** — **real Claude streaming** — token-by-token internal-monologue analysis with markdown.
- **Final report** — markdown verdict + a `<Document>` attachment with the full JSON trace.

Each worker has its own `setInterval`/`setTimeout`/jitter, so the messages genuinely race. The renderer reconciles all four independently against Telegram's edit API.

Features showcased:

- Multiple sibling `<Message>`s with concurrent state.
- Markdown → Telegram-HTML (bold, italic, code, links, bullets).
- `<Photo>` with remote URLs (no image deps required).
- `<Document>` with an in-memory `Buffer`.
- `useFinishRender()` to flush the last frame and stop.

## Run

```bash
cd examples/parallel-research
bun install
cp .env.example .env  # fill in BOT_TOKEN and ANTHROPIC_API_KEY
bun run dev
```

In the chat:

```
/research quantum computing
```

## Recording tips

- Pick a topic with a short name so the header line doesn't wrap.
- The picsum seed is derived from the topic — re-running with the same topic gives the same images, change topics to vary visuals.
- Default `throttleMs: 600` is a good middle ground for video — bump to `300` if you want the timer to look snappier on screen.
- Reasoning pacing comes from Claude's actual stream rate (Haiku ≈ 5–10s for ~150 words). Gallery is paced to ~6.6s total so it doesn't beat the LLM to the finish.
- Cost per run is a fraction of a cent (Haiku, ~1k input + ~600 output tokens across two calls).
