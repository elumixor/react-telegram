import type { ElementNode, LinkPreviewOptions } from "@elumixor/react-message-renderer";
import type { Context } from "grammy";
import { InputFile } from "grammy";
import type { LinkPreviewOptions as TelegramLinkPreviewOptions } from "grammy/types";
import type { AttachmentSource } from "./attachments";
import { splitMessage } from "./telegram-message-splitter";
import { serializeTelegram } from "./telegram-serializer";

const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;

function extractUrls(text: string): string[] {
  return text.match(URL_REGEX) ?? [];
}

function getLinkPreviewOptions(text: string, options?: LinkPreviewOptions): TelegramLinkPreviewOptions {
  if (!options) return { is_disabled: true };

  const { ignored, previewUrl } = options;

  if (previewUrl && !ignored.has(previewUrl)) return { url: previewUrl };

  const urls = extractUrls(text);
  const firstNonIgnored = urls.find((url) => !ignored.has(url));

  if (firstNonIgnored) return { url: firstNonIgnored };

  return { is_disabled: true };
}

interface AttachmentNode {
  type: "tg-photo" | "tg-document";
  src: AttachmentSource;
  caption?: string;
  filename?: string;
}

interface AttachmentRecord extends AttachmentNode {
  messageId: number;
}

function collectAttachments(node: ElementNode): AttachmentNode[] {
  const out: AttachmentNode[] = [];
  for (const child of node.children) {
    if (child.type === "TEXT") continue;
    const type = child.type as string;
    if (type === "tg-photo" || type === "tg-document") {
      out.push({
        type,
        src: child.props.src as AttachmentSource,
        caption: child.props.caption as string | undefined,
        filename: child.props.filename as string | undefined,
      });
    } else {
      out.push(...collectAttachments(child));
    }
  }
  return out;
}

function sameAttachment(a: AttachmentNode, b: AttachmentNode): boolean {
  return a.type === b.type && a.src === b.src && a.caption === b.caption && a.filename === b.filename;
}

function toInputFile(att: AttachmentNode): InputFile | string {
  if (typeof att.src === "string" && /^https?:\/\//.test(att.src)) return att.src;
  if (typeof att.src === "string" && !att.src.startsWith("/") && !att.src.includes("/")) return att.src;
  return new InputFile(att.src as Buffer | Uint8Array | string, att.filename);
}

export interface TelegramMessageManagerLogger {
  warn(message: string, meta?: unknown): void;
}

export interface TelegramMessageManagerOptions {
  replyToMessageId?: number;
  logger?: TelegramMessageManagerLogger;
}

const noopLogger: TelegramMessageManagerLogger = {
  warn() {
    // no-op default
  },
};

export class TelegramMessageManager {
  private messageIds: number[] = [];
  private lastSentText?: string;
  private lastSentChunks: string[] = [];
  private attachments: AttachmentRecord[] = [];
  private readonly replyToMessageId?: number;
  private readonly logger: TelegramMessageManagerLogger;

  constructor(
    private readonly ctx: Context,
    options: TelegramMessageManagerOptions = {},
  ) {
    this.replyToMessageId = options.replyToMessageId;
    this.logger = options.logger ?? noopLogger;
  }

  private get chatId() {
    const chatId = this.ctx.chat?.id;
    if (!chatId) throw new Error("Chat ID is undefined — TelegramMessageManager requires a chat-bound Context");
    return chatId;
  }

  async update(node: ElementNode): Promise<void> {
    const html = serializeTelegram(node);
    const chatId = this.chatId;
    const threadId = (node.props.threadId as number | undefined) ?? this.ctx.message?.message_thread_id;
    const linkPreview = node.props.linkPreview as LinkPreviewOptions | undefined;

    const textChanged = html !== this.lastSentText;

    if (textChanged) {
      const chunks = splitMessage(html);
      const newMessageIds: number[] = [];
      const newChunks: string[] = [];

      for (const [i, chunk] of chunks.entries()) {
        if (!chunk) continue;

        const linkPreviewOptions = getLinkPreviewOptions(chunk.text, linkPreview);
        const existingMsgId = this.messageIds[i];

        if (existingMsgId !== undefined) {
          if (chunk.text !== this.lastSentChunks[i]) {
            try {
              await this.ctx.api.editMessageText(chatId, existingMsgId, chunk.text, {
                parse_mode: "HTML",
                link_preview_options: linkPreviewOptions,
              });
            } catch (error) {
              this.logger.warn("Failed to edit message", error);
            }
          }
          newMessageIds.push(existingMsgId);
        } else {
          const replyTo = i === 0 ? this.replyToMessageId : newMessageIds[i - 1];

          const msg = await this.ctx.api.sendMessage(chatId, chunk.text, {
            parse_mode: "HTML",
            message_thread_id: threadId,
            reply_parameters: replyTo ? { message_id: replyTo } : undefined,
            link_preview_options: linkPreviewOptions,
          });

          newMessageIds.push(msg.message_id);
        }

        newChunks.push(chunk.text);
      }

      for (const msgId of this.messageIds.slice(chunks.length)) await this.ctx.api.deleteMessage(chatId, msgId);

      this.messageIds = newMessageIds;
      this.lastSentChunks = newChunks;
      this.lastSentText = html;
    }

    await this.syncAttachments(node, threadId);
  }

  private async syncAttachments(node: ElementNode, threadId: number | undefined): Promise<void> {
    const desired = collectAttachments(node);
    const chatId = this.chatId;
    const replyTo = this.messageIds[this.messageIds.length - 1] ?? this.replyToMessageId;
    const newRecords: AttachmentRecord[] = [];

    for (let i = 0; i < desired.length; i++) {
      const want = desired[i];
      if (!want) continue;
      const have = this.attachments[i];

      if (have && sameAttachment(have, want)) {
        newRecords.push(have);
        continue;
      }

      if (have) await this.ctx.api.deleteMessage(chatId, have.messageId);

      const msgId = await this.sendAttachment(want, replyTo, threadId);
      newRecords.push({ ...want, messageId: msgId });
    }

    for (const old of this.attachments.slice(desired.length)) {
      await this.ctx.api.deleteMessage(chatId, old.messageId);
    }

    this.attachments = newRecords;
  }

  private async sendAttachment(
    att: AttachmentNode,
    replyTo: number | undefined,
    threadId: number | undefined,
  ): Promise<number> {
    const chatId = this.chatId;
    const file = toInputFile(att);
    const reply_parameters = replyTo ? { message_id: replyTo } : undefined;

    if (att.type === "tg-photo") {
      const msg = await this.ctx.api.sendPhoto(chatId, file, {
        caption: att.caption,
        message_thread_id: threadId,
        reply_parameters,
      });
      return msg.message_id;
    }

    const msg = await this.ctx.api.sendDocument(chatId, file, {
      caption: att.caption,
      message_thread_id: threadId,
      reply_parameters,
    });
    return msg.message_id;
  }

  async deleteMessages(): Promise<void> {
    const chatId = this.chatId;
    for (const msgId of this.messageIds) await this.ctx.api.deleteMessage(chatId, msgId);
    for (const att of this.attachments) await this.ctx.api.deleteMessage(chatId, att.messageId);
    this.messageIds = [];
    this.lastSentChunks = [];
    this.attachments = [];
  }
}
