import { Message, useFinishRender } from "@elumixor/react-message-renderer";
import { TelegramRenderer } from "@elumixor/react-telegram";
import { Bot, type Context } from "grammy";
import { useEffect } from "react";

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error("Set BOT_TOKEN in your environment");

const BROADCAST_CHAT_ID = process.env.BROADCAST_CHAT_ID ? Number(process.env.BROADCAST_CHAT_ID) : null;
const BROADCAST_THREAD_IDS = (process.env.BROADCAST_THREAD_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map(Number);

function FinishOnMount() {
  const finish = useFinishRender();
  useEffect(() => {
    void finish();
  }, [finish]);
  return null;
}

const bot = new Bot(BOT_TOKEN);

// Reply mode — same thread the command was posted in. No threadId needed.
bot.command("ping", async (ctx: Context) => {
  const renderer = new TelegramRenderer(ctx);
  await renderer.render(
    <>
      <Message>
        <b>pong</b>
        <br />
        from thread {ctx.message?.message_thread_id ?? "(main)"}
      </Message>
      <FinishOnMount />
    </>,
  );
});

// Broadcast mode — fan out across configured topic threads.
bot.command("broadcast", async (ctx: Context) => {
  const text = ctx.match?.toString().trim();
  if (!text) {
    await ctx.reply("Usage: /broadcast <text>");
    return;
  }
  if (!BROADCAST_CHAT_ID || BROADCAST_THREAD_IDS.length === 0) {
    await ctx.reply("Broadcast disabled — set BROADCAST_CHAT_ID and BROADCAST_THREAD_IDS in .env.");
    return;
  }

  // Spoof a context whose chat is the broadcast supergroup, so renderer commits land there.
  const broadcastCtx = {
    ...ctx,
    chat: { ...(ctx.chat ?? {}), id: BROADCAST_CHAT_ID },
    message: undefined,
    api: ctx.api,
  } as unknown as Context;

  const renderer = new TelegramRenderer(broadcastCtx);
  await renderer.render(
    <>
      {BROADCAST_THREAD_IDS.map((threadId) => (
        <Message key={threadId} threadId={threadId}>
          <b>📣 Announcement</b>
          <br />
          {text}
        </Message>
      ))}
      <FinishOnMount />
    </>,
  );

  await ctx.reply(`Broadcast sent to ${BROADCAST_THREAD_IDS.length} thread(s).`);
});

console.log("Bot starting…");
await bot.start();
