# streaming-llm

Streams a Claude response token-by-token into a single editable Telegram message. The marquee demo for `@elumixor/react-telegram` — shows the throttle, the markdown→Telegram-HTML conversion, and the auto-chunking past 4000 chars.

## Run

```bash
cd examples/streaming-llm
bun install
cp .env.example .env  # then fill in your tokens
bun run dev
```

In Telegram, send your bot any message. The bot streams Claude's reply into one message that grows in place.

## What it shows

- React state (`useState`) holding the running response, updated on every SSE delta from Anthropic.
- `throttleMs: 500` — frequent enough that streaming feels live, sparse enough to stay under Telegram's per-chat edit budget.
- LLM markdown (`**bold**`, fenced code) renders correctly because the renderer converts it to Telegram-HTML on commit.
- Long responses split across multiple consecutive Telegram messages automatically.
