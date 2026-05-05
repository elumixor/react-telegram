# forum-thread-router

A bot for **forum-style supergroups** that posts to specific topic threads via `<Message threadId={…}>`. Demonstrates the v0.2 thread-routing feature.

## Two modes

1. **Reply mode** — `/ping` inside any topic. Bot replies in the same thread. This works automatically because `TelegramRenderer` falls back to `ctx.message.message_thread_id` when a `<Message>` doesn't specify `threadId`.
2. **Broadcast mode** — `/broadcast <text>`. Bot fans out the message into every topic listed in `BROADCAST_THREAD_IDS`, each addressed by an explicit `threadId` prop. Requires `BROADCAST_CHAT_ID` and `BROADCAST_THREAD_IDS` in `.env`.

## Setup

1. Create a Telegram supergroup with forum topics enabled (group settings → "Topics").
2. Add your bot as an admin with permission to post in topics.
3. Get the supergroup's chat id (e.g. forward a message from it to [@RawDataBot](https://t.me/raw_data_bot)) — it'll be a negative number like `-1001234567890`.
4. Get the topic ids by tapping a topic and looking at the URL fragment in the link, or via [@RawDataBot](https://t.me/raw_data_bot) again.

```bash
cd examples/forum-thread-router
bun install
cp .env.example .env  # fill in BOT_TOKEN, BROADCAST_CHAT_ID, BROADCAST_THREAD_IDS
bun run dev
```

## What it shows

- Implicit thread routing: `<Message>` with no `threadId` inherits from the incoming `ctx.message.message_thread_id`.
- Explicit thread routing: `<Message threadId={n}>` sends to topic `n` regardless of where the command came from.
- Same renderer reused across multiple thread IDs in one render — each `<Message>` independently keeps its own message id.
