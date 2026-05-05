import Anthropic from "@anthropic-ai/sdk";
import { Message, useFinishRender } from "@elumixor/react-message-renderer";
import { Document, Photo, TelegramRenderer } from "@elumixor/react-telegram";
import { Bot, type Context } from "grammy";
import { useEffect, useState } from "react";

const BOT_TOKEN = process.env.BOT_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!BOT_TOKEN) throw new Error("Set BOT_TOKEN in your environment");
if (!ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY in your environment");

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const MODEL = "claude-haiku-4-5-20251001";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ───────────────────────────────────────────────────────────────────────────
// Workers — each one drives its own <Message>, on its own clock.
// ───────────────────────────────────────────────────────────────────────────

interface Source {
  title: string;
  url: string;
}

function useSourceScanner(topic: string) {
  const [found, setFound] = useState<Source[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 800,
          messages: [
            {
              role: "user",
              content: `List 5 real, authoritative sources to research the topic "${topic}". Reply with ONLY a JSON array of {"title": string, "url": string}, nothing else. Use real URLs you actually know exist.`,
            },
          ],
        });
        const block = res.content[0];
        if (!block || block.type !== "text") throw new Error("no text response");
        const match = block.text.match(/\[[\s\S]*\]/);
        if (!match) throw new Error("no JSON array in response");
        const parsed = JSON.parse(match[0]) as Source[];

        // Reveal one at a time so it animates on camera.
        for (const s of parsed) {
          await delay(900);
          if (cancelled) return;
          setFound((prev) => [...prev, s]);
        }
        if (!cancelled) setDone(true);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setDone(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topic]);

  return { found, done, error };
}

function useGallery(topic: string) {
  const [images, setImages] = useState<{ url: string; caption: string }[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const seeds = [`${topic}-a`, `${topic}-b`, `${topic}-c`];
      const captions = ["Hero shot", "Detail view", "Wide angle"];
      for (let i = 0; i < seeds.length; i++) {
        await delay(2200);
        if (cancelled) return;
        const seed = encodeURIComponent(seeds[i] ?? "");
        setImages((prev) => [
          ...prev,
          {
            url: `https://picsum.photos/seed/${seed}/720/480`,
            caption: `${captions[i]} · ${topic}`,
          },
        ]);
      }
      if (!cancelled) setDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [topic]);

  return { images, done };
}

function useReasoning(topic: string) {
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stream = anthropic.messages.stream({
          model: MODEL,
          max_tokens: 600,
          messages: [
            {
              role: "user",
              content: `You are a research assistant thinking out loud about: "${topic}".

Write ~150 words of internal reasoning — exploratory, candid, like notes to yourself. Use markdown:
- a few **bold** key terms
- one or two *italic* asides
- short paragraphs separated by blank lines

End with a one-line tentative verdict prefixed with "**Verdict:** ".`,
            },
          ],
        });
        for await (const event of stream) {
          if (cancelled) return;
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const delta = event.delta as { text: string };
            setText((prev) => prev + delta.text);
          }
        }
        if (!cancelled) setDone(true);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setDone(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topic]);

  return { text, done, error };
}

function useElapsed(running: boolean) {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const id = setInterval(() => setMs(Date.now() - start), 200);
    return () => clearInterval(id);
  }, [running]);
  return ms;
}

// ───────────────────────────────────────────────────────────────────────────
// UI — five sibling <Message>s.
// ───────────────────────────────────────────────────────────────────────────

function ResearchCrew({ topic }: { topic: string }) {
  const sources = useSourceScanner(topic);
  const gallery = useGallery(topic);
  const reasoning = useReasoning(topic);
  const finish = useFinishRender();

  const allDone = sources.done && gallery.done && reasoning.done;
  const elapsed = useElapsed(!allDone);

  useEffect(() => {
    if (allDone) void finish();
  }, [allDone, finish]);

  const report = JSON.stringify(
    {
      topic,
      finishedAt: new Date().toISOString(),
      sources: sources.found,
      images: gallery.images,
      reasoning: reasoning.text,
    },
    null,
    2,
  );

  return (
    <>
      <Message>
        🔬 <b>Research crew</b>
        <br />
        Topic: <i>{topic}</i>
        <br />
        Elapsed: <code>{(elapsed / 1000).toFixed(1)}s</code>
        {allDone ? " · ✅ done" : " · running…"}
      </Message>

      <Message>
        <b>📚 Sources</b> {sources.done ? "✓" : "⏳"}
        <br />
        {sources.error
          ? `_error: ${sources.error}_`
          : sources.found.length === 0
            ? "_asking Claude…_"
            : sources.found
                .map((s, i) => `${i + 1}. [${s.title}](${s.url})`)
                .join("\n")}
      </Message>

      <Message>
        <b>🖼 Gallery</b> {gallery.done ? "✓" : "⏳"} ({gallery.images.length}/3)
        {gallery.images.map((img) => (
          <Photo key={img.url} src={img.url} caption={img.caption} />
        ))}
      </Message>

      <Message>
        <b>🧠 Reasoning</b> {reasoning.done ? "✓" : "⏳"}
        <br />
        {reasoning.error
          ? `_error: ${reasoning.error}_`
          : reasoning.text || "_thinking…_"}
      </Message>

      {allDone && (
        <Message>
          <b>📦 Final report</b>
          <br />
          Full trace attached as JSON.
          <Document
            src={Buffer.from(report, "utf8")}
            filename={`report-${topic.replace(/\s+/g, "-")}.json`}
            caption="Full research trace"
          />
        </Message>
      )}
    </>
  );
}

const bot = new Bot(BOT_TOKEN);

bot.command("research", async (ctx: Context) => {
  const topic = ctx.match?.toString().trim() || "telegram bots";
  const renderer = new TelegramRenderer(ctx, { throttleMs: 600 });
  await renderer.render(<ResearchCrew topic={topic} />);
});

bot.command("start", async (ctx: Context) => {
  await ctx.reply(
    "Send /research <topic> — e.g. `/research quantum computing`",
    { parse_mode: "Markdown" },
  );
});

console.log("Bot starting…");
await bot.start();
