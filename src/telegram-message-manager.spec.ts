import { describe, expect, test } from "bun:test";
import type { ElementNode } from "@elumixor/react-message-renderer";
import type { Context } from "grammy";
import { TelegramMessageManager } from "./telegram-message-manager";

interface ApiCall {
  method: "sendMessage" | "editMessageText" | "deleteMessage";
  args: unknown[];
}

interface FakeContext {
  ctx: Context;
  calls: ApiCall[];
  setNextMessageId: (id: number) => void;
}

function makeFakeContext(initialChatId = 100): FakeContext {
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
  return {
    ctx,
    calls,
    setNextMessageId: (id) => {
      nextMessageId = id;
    },
  };
}

const el = (
  type: ElementNode["type"],
  children: ElementNode["children"] = [],
  props: ElementNode["props"] = {},
): ElementNode => ({ type, props, children });

const text = (s: string) => ({ type: "TEXT" as const, text: s });

const message = (body: string, props: ElementNode["props"] = {}) => el("io-message", [text(body)], props);

describe("TelegramMessageManager", () => {
  test("first commit sends one sendMessage per chunk", async () => {
    const fake = makeFakeContext();
    const mgr = new TelegramMessageManager(fake.ctx);
    await mgr.update(message("hello world"));
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.method).toBe("sendMessage");
  });

  test("identical second commit issues no api calls", async () => {
    const fake = makeFakeContext();
    const mgr = new TelegramMessageManager(fake.ctx);
    await mgr.update(message("hello"));
    fake.calls.length = 0;
    await mgr.update(message("hello"));
    expect(fake.calls).toHaveLength(0);
  });

  test("changed text triggers editMessageText, not a new sendMessage", async () => {
    const fake = makeFakeContext();
    const mgr = new TelegramMessageManager(fake.ctx);
    await mgr.update(message("v1"));
    fake.calls.length = 0;
    await mgr.update(message("v2"));
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.method).toBe("editMessageText");
  });

  test("repliesTo forwards to first sendMessage", async () => {
    const fake = makeFakeContext();
    const mgr = new TelegramMessageManager(fake.ctx, { replyToMessageId: 99 });
    await mgr.update(message("hi"));
    const opts = fake.calls[0]?.args[2] as { reply_parameters?: { message_id: number } };
    expect(opts.reply_parameters?.message_id).toBe(99);
  });

  test("multi-chunk: chunk 2+ replies to chunk i-1's id", async () => {
    const fake = makeFakeContext();
    fake.setNextMessageId(2000);
    const mgr = new TelegramMessageManager(fake.ctx);
    const long = "a ".repeat(3000);
    await mgr.update(message(long));
    const sends = fake.calls.filter((c) => c.method === "sendMessage");
    expect(sends.length).toBeGreaterThan(1);
    for (let i = 1; i < sends.length; i++) {
      const opts = sends[i]?.args[2] as { reply_parameters?: { message_id: number } };
      expect(opts.reply_parameters?.message_id).toBe(2000 + i - 1);
    }
  });

  test("shrinking chunk count deletes orphan messages", async () => {
    const fake = makeFakeContext();
    fake.setNextMessageId(500);
    const mgr = new TelegramMessageManager(fake.ctx);
    const long = "x ".repeat(3000);
    await mgr.update(message(long));
    const initialChunks = fake.calls.filter((c) => c.method === "sendMessage").length;
    expect(initialChunks).toBeGreaterThan(1);

    fake.calls.length = 0;
    await mgr.update(message("short"));

    const deletes = fake.calls.filter((c) => c.method === "deleteMessage");
    expect(deletes.length).toBe(initialChunks - 1);
  });

  test("growing chunk count sends new messages but doesn't re-send existing ones", async () => {
    const fake = makeFakeContext();
    const mgr = new TelegramMessageManager(fake.ctx);
    await mgr.update(message("first"));
    fake.calls.length = 0;
    const long = "y ".repeat(3000);
    await mgr.update(message(long));
    const sends = fake.calls.filter((c) => c.method === "sendMessage");
    const edits = fake.calls.filter((c) => c.method === "editMessageText");
    expect(edits.length).toBe(1);
    expect(sends.length).toBeGreaterThanOrEqual(1);
  });

  test("link preview ignored set is honoured", async () => {
    const fake = makeFakeContext();
    const mgr = new TelegramMessageManager(fake.ctx);
    const node = message("see https://skip.test/article today", {
      linkPreview: { ignored: new Set(["https://skip.test/article"]) },
    });
    await mgr.update(node);
    const opts = fake.calls[0]?.args[2] as { link_preview_options: { is_disabled?: boolean; url?: string } };
    expect(opts.link_preview_options.is_disabled).toBe(true);
  });

  test("link preview falls back to first non-ignored URL", async () => {
    const fake = makeFakeContext();
    const mgr = new TelegramMessageManager(fake.ctx);
    const node = message("a https://skip.test b https://show.test", {
      linkPreview: { ignored: new Set(["https://skip.test"]) },
    });
    await mgr.update(node);
    const opts = fake.calls[0]?.args[2] as { link_preview_options: { url?: string } };
    expect(opts.link_preview_options.url).toBe("https://show.test");
  });

  test("explicit previewUrl wins over URLs in body", async () => {
    const fake = makeFakeContext();
    const mgr = new TelegramMessageManager(fake.ctx);
    const node = message("a https://body.test b", {
      linkPreview: { ignored: new Set<string>(), previewUrl: "https://explicit.test" },
    });
    await mgr.update(node);
    const opts = fake.calls[0]?.args[2] as { link_preview_options: { url?: string } };
    expect(opts.link_preview_options.url).toBe("https://explicit.test");
  });

  test("deleteMessages removes all tracked messages", async () => {
    const fake = makeFakeContext();
    fake.setNextMessageId(700);
    const mgr = new TelegramMessageManager(fake.ctx);
    const long = "z ".repeat(3000);
    await mgr.update(message(long));
    const sends = fake.calls.filter((c) => c.method === "sendMessage").length;
    fake.calls.length = 0;
    await mgr.deleteMessages();
    expect(fake.calls.filter((c) => c.method === "deleteMessage")).toHaveLength(sends);
  });

  test("throws when ctx has no chat id", async () => {
    const fake = makeFakeContext();
    (fake.ctx as unknown as { chat: undefined }).chat = undefined;
    const mgr = new TelegramMessageManager(fake.ctx);
    await expect(mgr.update(message("hi"))).rejects.toThrow(/Chat ID/);
  });
});
