# streaming-counter

Minimal grammy bot showing how `@elumixor/react-telegram` streams React updates into a single editable Telegram message.

## Run

```bash
cd examples/streaming-counter
bun install
BOT_TOKEN=<your-bot-token> bun run dev
```

Then in Telegram, message your bot with `/start`. Watch the same message edit in place from one progress step to the next, ending in a checked summary.

## What it shows

- A function component (`StreamingAgent`) using `useState` + `useEffect` exactly like a normal React component.
- Progressive `setProgress` calls trigger reconciliation; the renderer throttles commits and edits the live Telegram message via `editMessageText`.
- No imperative message-id juggling — that's the manager's job under the hood.
