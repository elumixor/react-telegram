# @elumixor/react-telegram

Stream React JSX into editable Telegram messages. Built on [`@elumixor/react-message-renderer`](../react-message-renderer) and [grammy](https://grammy.dev).

A `<Message>` is a Telegram message. Render once, the bot sends. Re-render with new state, the bot edits the same message in place via Telegram's `editMessageText` API. The reconciler tracks message ids and chunks for you.

## Install

```bash
bun add @elumixor/react-telegram @elumixor/react-message-renderer grammy react
```

Peer dependencies: `grammy >= 1`, `react >= 19`.

## The 30-second tour

```tsx
import { Message, useFinishRender } from "@elumixor/react-message-renderer";
import { TelegramRenderer } from "@elumixor/react-telegram";
import { Bot, type Context } from "grammy";
import { useEffect, useState } from "react";

function Agent() {
  const [steps, setSteps] = useState<string[]>([]);
  const finish = useFinishRender();

  useEffect(() => {
    void (async () => {
      for (const step of ["Loading…", "Analyzing…", "Done"]) {
        await new Promise((r) => setTimeout(r, 700));
        setSteps((p) => [...p, step]);
      }
      void finish();
    })();
  }, [finish]);

  return (
    <Message>
      <b>Working</b>
      <br />
      {steps.join("\n")}
    </Message>
  );
}

const bot = new Bot(process.env.BOT_TOKEN!);
bot.command("start", async (ctx: Context) => {
  const renderer = new TelegramRenderer(ctx, { throttleMs: 600 });
  await renderer.render(<Agent />);
});
await bot.start();
```

In the chat, the user sees one message that grows in place from "Loading…" to a full three-line summary. No tracking message ids manually.

## What you get

- `TelegramRenderer` — extend-free, pass a grammy `Context` and you're done.
- `<Message repliesTo={id}>` — sets `reply_parameters.message_id` on first send.
- `<Message linkPreview={…}>` — fine-grained `link_preview_options`: ignore certain URLs, force a specific URL, or disable.
- Markdown-flavoured text inside `<Message>` is converted to Telegram-HTML automatically (`**bold**`, `_italic_`, `[link](url)`, fenced code blocks, lists, headers, strikethrough).
- Messages longer than 4000 chars are split across multiple consecutive Telegram messages, threaded with `reply_parameters` so they stay grouped.
- When the React tree shrinks (`<Message>` removed, or text gets shorter than chunk count), orphan messages are deleted. When it grows, only new chunks get sent.

## Public API

- `TelegramRenderer(ctx, { throttleMs?, logger? })`
- `TelegramMessageManager(ctx, { replyToMessageId?, logger? })` — single-message-instance manager, if you want to skip the React layer
- `serializeTelegram(node, mode?)` — markdown-aware HTML serializer
- `markdownToTelegramHtml(text)` — standalone Markdown → Telegram-HTML
- `splitMessage(text, maxLength?)` — chunk safely on paragraph/sentence/word boundaries, preserving fenced code blocks

## Example

See [`examples/streaming-counter`](./examples/streaming-counter) for a full grammy bot you can run with `BOT_TOKEN=… bun run dev`.

## Status

`0.x` — API stable, expect minor breakage as the underlying renderer evolves.

## License

ISC
