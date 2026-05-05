import Anthropic from "@anthropic-ai/sdk";
import { Message, useFinishRender } from "@elumixor/react-message-renderer";
import { TelegramRenderer } from "@elumixor/react-telegram";
import { Bot, type Context } from "grammy";
import { useEffect, useState } from "react";

const BOT_TOKEN = process.env.BOT_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!BOT_TOKEN) throw new Error("Set BOT_TOKEN in your environment");
if (!ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY in your environment");

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

function StreamingReply({ prompt }: { prompt: string }) {
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  const finish = useFinishRender();

  useEffect(() => {
    void (async () => {
      const stream = anthropic.messages.stream({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          const delta = event.delta as { text: string };
          setText((prev) => prev + delta.text);
        }
      }
      setDone(true);
      void finish();
    })();
  }, [prompt, finish]);

  return (
    <Message>
      {text}
      {!done && "\n\n_…thinking_"}
    </Message>
  );
}

const bot = new Bot(BOT_TOKEN);

bot.on("message:text", async (ctx: Context) => {
  const prompt = ctx.message?.text;
  if (!prompt) return;
  const replyTo = ctx.message?.message_id;
  const renderer = new TelegramRenderer(ctx, { throttleMs: 500 });

  await renderer.render(
    <Message repliesTo={replyTo}>
      <StreamingReply prompt={prompt} />
    </Message>,
  );
});

console.log("Bot starting…");
await bot.start();
