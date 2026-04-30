import { describe, expect, test } from "bun:test";
import { Message, useFinishRender } from "@elumixor/react-message-renderer";
import type { Context } from "grammy";
import { useEffect, useState } from "react";
import { TelegramRenderer } from "./TelegramRenderer";

interface ApiCall {
  method: "sendMessage" | "editMessageText" | "deleteMessage";
  args: unknown[];
}

function makeFakeContext(initialChatId = 100) {
  const calls: ApiCall[] = [];
  let nextMessageId = 1000;
  const ctx = {
    chat: { id: initialChatId },
    message: { message_thread_id: undefined },
    api: {
      sendMessage: async (chatId: number, text: string, options?: unknown) => {
        calls.push({ method: "sendMessage", args: [chatId, text, options] });
        return { message_id: nextMessageId++ };
      },
      editMessageText: async (chatId: number, messageId: number, text: string, options?: unknown) => {
        calls.push({ method: "editMessageText", args: [chatId, messageId, text, options] });
        return true;
      },
      deleteMessage: async (chatId: number, messageId: number) => {
        calls.push({ method: "deleteMessage", args: [chatId, messageId] });
        return true;
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

describe("TelegramRenderer", () => {
  test("a single static <Message> sends exactly one telegram message", async () => {
    const fake = makeFakeContext();
    const r = new TelegramRenderer(fake.ctx, { throttleMs: 1 });
    await r.render(
      <>
        <Message>hello</Message>
        <Done />
      </>,
    );
    const sends = fake.calls.filter((c) => c.method === "sendMessage");
    expect(sends).toHaveLength(1);
    expect(sends[0]?.args[1]).toBe("hello");
  });

  test("two <Message> siblings produce two managers and two sendMessages", async () => {
    const fake = makeFakeContext();
    const r = new TelegramRenderer(fake.ctx, { throttleMs: 1 });
    await r.render(
      <>
        <Message>one</Message>
        <Message>two</Message>
        <Done />
      </>,
    );
    const sends = fake.calls.filter((c) => c.method === "sendMessage");
    expect(sends).toHaveLength(2);
    expect(sends.map((s) => s.args[1])).toEqual(["one", "two"]);
  });

  test("streaming updates produce edits, not re-sends", async () => {
    const fake = makeFakeContext();
    const r = new TelegramRenderer(fake.ctx, { throttleMs: 5 });

    function Streaming() {
      const [n, setN] = useState(0);
      const finish = useFinishRender();
      useEffect(() => {
        if (n < 3) {
          const t = setTimeout(() => setN((v) => v + 1), 10);
          return () => clearTimeout(t);
        }
        void finish();
      }, [n, finish]);
      return <Message>step {n}</Message>;
    }

    await r.render(<Streaming />);
    const sends = fake.calls.filter((c) => c.method === "sendMessage");
    const edits = fake.calls.filter((c) => c.method === "editMessageText");
    expect(sends).toHaveLength(1);
    expect(edits.length).toBeGreaterThan(0);
    expect(edits[edits.length - 1]?.args[2]).toBe("step 3");
  });

  test("dropping a sibling <Message> deletes its underlying messages", async () => {
    const fake = makeFakeContext();
    const r = new TelegramRenderer(fake.ctx, { throttleMs: 5 });

    function Toggling() {
      const [show, setShow] = useState(true);
      const finish = useFinishRender();
      useEffect(() => {
        if (show) {
          const t = setTimeout(() => setShow(false), 20);
          return () => clearTimeout(t);
        }
        const t2 = setTimeout(() => void finish(), 20);
        return () => clearTimeout(t2);
      }, [show, finish]);
      return (
        <>
          <Message>persistent</Message>
          {show ? <Message>ephemeral</Message> : null}
        </>
      );
    }

    await r.render(<Toggling />);
    const deletes = fake.calls.filter((c) => c.method === "deleteMessage");
    expect(deletes.length).toBeGreaterThanOrEqual(1);
  });
});
