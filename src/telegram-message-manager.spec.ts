import { describe, expect, test } from "bun:test";
import type { ElementNode } from "@elumixor/react-message-renderer";
import type { Context } from "grammy";
import { TelegramMessageManager } from "./telegram-message-manager";

interface ApiCall {
  method: "sendMessage" | "editMessageText" | "deleteMessage" | "sendMessageDraft";
  args: unknown[];
}

interface FakeContext {
  ctx: Context;
  calls: ApiCall[];
  setNextMessageId: (id: number) => void;
}

function makeFakeContext(initialChatId = 100, chatType: "private" | "group" = "group"): FakeContext {
  const calls: ApiCall[] = [];
  let nextMessageId = 1000;
  const ctx = {
    chat: { id: initialChatId, type: chatType },
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
      sendMessageDraft: async (chatId: number, draftId: number, text: string, options?: unknown) => {
        calls.push({ method: "sendMessageDraft", args: [chatId, draftId, text, options] });
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

  describe("draft streaming", () => {
    test("non-final commit in a private chat streams via sendMessageDraft, not edit/send", async () => {
      const fake = makeFakeContext(100, "private");
      const mgr = new TelegramMessageManager(fake.ctx);
      await mgr.update(message("typing…"), { draftStreaming: true });
      expect(fake.calls).toHaveLength(1);
      expect(fake.calls[0]?.method).toBe("sendMessageDraft");
    });

    test("successive drafts reuse the same non-zero draft_id and dedupe identical text", async () => {
      const fake = makeFakeContext(100, "private");
      const mgr = new TelegramMessageManager(fake.ctx);
      await mgr.update(message("a"), { draftStreaming: true });
      await mgr.update(message("ab"), { draftStreaming: true });
      await mgr.update(message("ab"), { draftStreaming: true });
      const drafts = fake.calls.filter((c) => c.method === "sendMessageDraft");
      expect(drafts).toHaveLength(2);
      const id0 = drafts[0]?.args[1] as number;
      const id1 = drafts[1]?.args[1] as number;
      expect(id0).not.toBe(0);
      expect(id1).toBe(id0);
    });

    test("final commit persists the message via sendMessage", async () => {
      const fake = makeFakeContext(100, "private");
      const mgr = new TelegramMessageManager(fake.ctx);
      await mgr.update(message("partial"), { draftStreaming: true });
      fake.calls.length = 0;
      await mgr.update(message("complete"), { draftStreaming: true, final: true });
      expect(fake.calls).toHaveLength(1);
      expect(fake.calls[0]?.method).toBe("sendMessage");
      expect(fake.calls[0]?.args[1]).toBe("complete");
    });

    test("group chats are not eligible — falls back to sendMessage", async () => {
      const fake = makeFakeContext(100, "group");
      const mgr = new TelegramMessageManager(fake.ctx);
      await mgr.update(message("hi"), { draftStreaming: true });
      expect(fake.calls.filter((c) => c.method === "sendMessageDraft")).toHaveLength(0);
      expect(fake.calls[0]?.method).toBe("sendMessage");
    });

    test("multi-chunk content is not eligible — falls back to sendMessage", async () => {
      const fake = makeFakeContext(100, "private");
      const mgr = new TelegramMessageManager(fake.ctx);
      await mgr.update(message("m ".repeat(3000)), { draftStreaming: true });
      expect(fake.calls.filter((c) => c.method === "sendMessageDraft")).toHaveLength(0);
      expect(fake.calls.filter((c) => c.method === "sendMessage").length).toBeGreaterThan(1);
    });

    test("draftStreaming off keeps the edit-based path even in a private chat", async () => {
      const fake = makeFakeContext(100, "private");
      const mgr = new TelegramMessageManager(fake.ctx);
      await mgr.update(message("v1"));
      await mgr.update(message("v2"));
      expect(fake.calls.filter((c) => c.method === "sendMessageDraft")).toHaveLength(0);
      expect(fake.calls.map((c) => c.method)).toEqual(["sendMessage", "editMessageText"]);
    });
  });
});
