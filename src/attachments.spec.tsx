import { describe, expect, test } from "bun:test";
import { Message, useFinishRender } from "@elumixor/react-message-renderer";
import type { Context } from "grammy";
import { useEffect, useState } from "react";
import { Document, Photo } from "./attachments";
import { TelegramRenderer } from "./TelegramRenderer";

interface ApiCall {
  method: "sendMessage" | "editMessageText" | "deleteMessage" | "sendPhoto" | "sendDocument";
  args: unknown[];
}

function makeFakeContext() {
  const calls: ApiCall[] = [];
  let nextId = 1000;
  const ctx = {
    chat: { id: 100 },
    message: { message_thread_id: undefined as number | undefined },
    api: {
      sendMessage: async (chatId: number, text: string, options?: unknown) => {
        calls.push({ method: "sendMessage", args: [chatId, text, options] });
        return { message_id: nextId++ };
      },
      editMessageText: async (chatId: number, messageId: number, text: string, options?: unknown) => {
        calls.push({ method: "editMessageText", args: [chatId, messageId, text, options] });
        return true;
      },
      deleteMessage: async (chatId: number, messageId: number) => {
        calls.push({ method: "deleteMessage", args: [chatId, messageId] });
        return true;
      },
      sendPhoto: async (chatId: number, file: unknown, options?: unknown) => {
        calls.push({ method: "sendPhoto", args: [chatId, file, options] });
        return { message_id: nextId++ };
      },
      sendDocument: async (chatId: number, file: unknown, options?: unknown) => {
        calls.push({ method: "sendDocument", args: [chatId, file, options] });
        return { message_id: nextId++ };
      },
    },
  } as unknown as Context;
  return { ctx, calls };
}

function Done() {
  const finish = useFinishRender();
  useEffect(() => {
    void finish();
  }, [finish]);
  return null;
}

describe("attachments", () => {
  test("Photo inside Message sends sendPhoto as reply to text", async () => {
    const fake = makeFakeContext();
    const r = new TelegramRenderer(fake.ctx, { throttleMs: 1 });
    const buf = Buffer.from("imagebytes");
    await r.render(
      <>
        <Message>
          here is a photo
          <Photo src={buf} caption="cover" />
        </Message>
        <Done />
      </>,
    );
    const sends = fake.calls.filter((c) => c.method === "sendMessage");
    const photos = fake.calls.filter((c) => c.method === "sendPhoto");
    expect(sends).toHaveLength(1);
    expect(photos).toHaveLength(1);
    const photoOpts = photos[0]?.args[2] as { caption?: string; reply_parameters?: { message_id: number } };
    expect(photoOpts.caption).toBe("cover");
    expect(photoOpts.reply_parameters?.message_id).toBe(1000);
  });

  test("identical photo on second commit issues no api calls", async () => {
    const fake = makeFakeContext();
    const r = new TelegramRenderer(fake.ctx, { throttleMs: 5 });
    const buf = Buffer.from("img");

    function App() {
      const [n, setN] = useState(0);
      const finish = useFinishRender();
      useEffect(() => {
        if (n < 2) {
          const t = setTimeout(() => setN((v) => v + 1), 10);
          return () => clearTimeout(t);
        }
        void finish();
      }, [n, finish]);
      return (
        <Message>
          static text
          <Photo src={buf} caption="same" />
        </Message>
      );
    }

    await r.render(<App />);
    const sends = fake.calls.filter((c) => c.method === "sendMessage");
    const photos = fake.calls.filter((c) => c.method === "sendPhoto");
    const edits = fake.calls.filter((c) => c.method === "editMessageText");
    expect(sends).toHaveLength(1);
    expect(photos).toHaveLength(1);
    expect(edits).toHaveLength(0);
  });

  test("changed caption with same src deletes + resends photo", async () => {
    const fake = makeFakeContext();
    const r = new TelegramRenderer(fake.ctx, { throttleMs: 5 });
    const buf = Buffer.from("img");

    function App() {
      const [n, setN] = useState(0);
      const finish = useFinishRender();
      useEffect(() => {
        if (n < 1) {
          const t = setTimeout(() => setN(1), 10);
          return () => clearTimeout(t);
        }
        const t2 = setTimeout(() => void finish(), 30);
        return () => clearTimeout(t2);
      }, [n, finish]);
      return (
        <Message>
          x
          <Photo src={buf} caption={`v${n}`} />
        </Message>
      );
    }

    await r.render(<App />);
    const photos = fake.calls.filter((c) => c.method === "sendPhoto");
    const deletes = fake.calls.filter((c) => c.method === "deleteMessage");
    expect(photos.length).toBeGreaterThanOrEqual(2);
    expect(deletes.length).toBeGreaterThanOrEqual(1);
  });

  test("removing photo from tree deletes it", async () => {
    const fake = makeFakeContext();
    const r = new TelegramRenderer(fake.ctx, { throttleMs: 5 });
    const buf = Buffer.from("img");

    function App() {
      const [show, setShow] = useState(true);
      const finish = useFinishRender();
      useEffect(() => {
        if (show) {
          const t = setTimeout(() => setShow(false), 10);
          return () => clearTimeout(t);
        }
        const t2 = setTimeout(() => void finish(), 30);
        return () => clearTimeout(t2);
      }, [show, finish]);
      return <Message>x{show ? <Photo src={buf} /> : null}</Message>;
    }

    await r.render(<App />);
    const photos = fake.calls.filter((c) => c.method === "sendPhoto");
    const deletes = fake.calls.filter((c) => c.method === "deleteMessage");
    expect(photos).toHaveLength(1);
    expect(deletes.length).toBeGreaterThanOrEqual(1);
  });

  test("Document component uses sendDocument with filename", async () => {
    const fake = makeFakeContext();
    const r = new TelegramRenderer(fake.ctx, { throttleMs: 1 });
    const buf = Buffer.from("pdfbytes");
    await r.render(
      <>
        <Message>
          report:
          <Document src={buf} filename="report.pdf" caption="Q1" />
        </Message>
        <Done />
      </>,
    );
    const docs = fake.calls.filter((c) => c.method === "sendDocument");
    expect(docs).toHaveLength(1);
    const opts = docs[0]?.args[2] as { caption?: string };
    expect(opts.caption).toBe("Q1");
  });

  test("multiple photos preserve order via positional identity", async () => {
    const fake = makeFakeContext();
    const r = new TelegramRenderer(fake.ctx, { throttleMs: 1 });
    const a = Buffer.from("a");
    const b = Buffer.from("b");
    await r.render(
      <>
        <Message>
          gallery
          <Photo src={a} caption="a" />
          <Photo src={b} caption="b" />
        </Message>
        <Done />
      </>,
    );
    const photos = fake.calls.filter((c) => c.method === "sendPhoto");
    expect(photos).toHaveLength(2);
    expect((photos[0]?.args[2] as { caption?: string }).caption).toBe("a");
    expect((photos[1]?.args[2] as { caption?: string }).caption).toBe("b");
  });

  test("threadId on Message overrides ctx.message.message_thread_id", async () => {
    const fake = makeFakeContext();
    fake.ctx.message = { message_thread_id: 999 } as unknown as Context["message"];
    const r = new TelegramRenderer(fake.ctx, { throttleMs: 1 });
    await r.render(
      <>
        <Message threadId={123}>routed</Message>
        <Done />
      </>,
    );
    const sends = fake.calls.filter((c) => c.method === "sendMessage");
    const opts = sends[0]?.args[2] as { message_thread_id?: number };
    expect(opts.message_thread_id).toBe(123);
  });

  test("falls back to ctx.message.message_thread_id when threadId not set", async () => {
    const fake = makeFakeContext();
    fake.ctx.message = { message_thread_id: 999 } as unknown as Context["message"];
    const r = new TelegramRenderer(fake.ctx, { throttleMs: 1 });
    await r.render(
      <>
        <Message>default</Message>
        <Done />
      </>,
    );
    const sends = fake.calls.filter((c) => c.method === "sendMessage");
    const opts = sends[0]?.args[2] as { message_thread_id?: number };
    expect(opts.message_thread_id).toBe(999);
  });
});
