import { Message, useFinishRender } from "@elumixor/react-message-renderer";
import { Photo, TelegramRenderer } from "@elumixor/react-telegram";
import { Bot, type Context } from "grammy";
import { useEffect, useState } from "react";

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error("Set BOT_TOKEN in your environment");

interface Step {
  label: string;
  status: "pending" | "running" | "done";
}

const PLAN: string[] = [
  "Inspecting input data",
  "Crunching numbers",
  "Drawing chart",
  "Compiling report",
];

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// 1x1 PNG (transparent) — stand-in "report image" so the example doesn't need a real chart lib.
const FAKE_CHART = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==",
  "base64",
);

function Agent() {
  const [steps, setSteps] = useState<Step[]>(PLAN.map((label) => ({ label, status: "pending" })));
  const [chartReady, setChartReady] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const finish = useFinishRender();

  useEffect(() => {
    void (async () => {
      for (let i = 0; i < PLAN.length; i++) {
        setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, status: "running" } : s)));
        await delay(800);
        if (i === 2) setChartReady(true);
        setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, status: "done" } : s)));
      }
      // await delay(300);
      setSummary("4 steps complete · 0 errors · chart attached above");
      void finish();
    })();
  }, [finish]);

  const icon = (s: Step["status"]) => (s === "done" ? "✓" : s === "running" ? "⏳" : "·");

  return (
    <>
      <Message>
        <b>Agent run</b>
        <br />
        Triggered by /start
      </Message>

      <Message>
        {steps.map((s) => `${icon(s.status)} ${s.label}`).join("\n")}
        {chartReady && <Photo src={FAKE_CHART} caption="Generated chart" />}
      </Message>

      {summary && (
        <Message>
          <b>Summary</b>
          <br />
          {summary}
        </Message>
      )}
    </>
  );
}

const bot = new Bot(BOT_TOKEN);

bot.command("start", async (ctx: Context) => {
  const renderer = new TelegramRenderer(ctx, { throttleMs: 500 });
  await renderer.render(<Agent />);
});

console.log("Bot starting…");
await bot.start();
