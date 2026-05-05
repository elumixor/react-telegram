# multi-message-agent

Agent that emits **multiple** `<Message>`s as it works — one per "step" — and attaches a generated chart `<Photo>` mid-run. Shows off the parts of `@elumixor/react-telegram` that the streaming-counter example doesn't:

- Multiple sibling `<Message>`s in the React tree → multiple Telegram messages, kept in sync independently.
- `<Photo>` inside a `<Message>` — sent as a reply to its parent text message and tracked positionally so re-renders don't resend it.
- Conditional rendering — when a step's `<Message>` unmounts, the renderer deletes that Telegram message.

## Run

```bash
cd examples/multi-message-agent
bun install
cp .env.example .env  # fill in BOT_TOKEN
bun run dev
```

Send the bot `/run`. Watch as the bot posts a header message, then progress messages, an attached "report card" image, and finally a summary.
