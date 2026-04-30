import { Message, useFinishRender } from "@elumixor/react-message-renderer";
import { TelegramRenderer } from "@elumixor/react-telegram";
import { Bot, type Context } from "grammy";
import { useEffect, useState } from "react";

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) throw new Error("Set BOT_TOKEN in your environment to run this example");

const STEPS = [
  "Loading user profile",
  "Fetching recent activity",
  "Analyzing patterns",
  "Generating recommendations",
  "Done",
];

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function StreamingAgent() {
  const [progress, setProgress] = useState<string[]>([]);
  const finish = useFinishRender();

  useEffect(() => {
    void (async () => {
      for (const step of STEPS) {
        await delay(700);
        setProgress((prev) => [...prev, step]);
      }
      await delay(400);
      void finish();
    })();
  }, [finish]);

  const lines = progress.map((line, i) => {
    const isLast = i === progress.length - 1 && progress.length < STEPS.length;
    return isLast ? `⏳ ${line}…` : `✓ ${line}`;
  });

  return (
    <Message>
      <b>Working on it…</b>
      <br />
      <br />
      {lines.join("\n")}
    </Message>
  );
}

const bot = new Bot(TOKEN);

bot.command("start", async (ctx: Context) => {
  const replyTo = ctx.message?.message_id;
  const renderer = new TelegramRenderer(ctx, { throttleMs: 600 });

  await renderer.render(
    <Message repliesTo={replyTo}>
      <StreamingAgent />
    </Message>,
  );
});

console.log("Bot starting…");
await bot.start();
