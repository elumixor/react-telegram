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

export interface UpdateOptions {
  /** True on the final commit — persist the streamed draft as a real message. */
  final?: boolean;
  /** Opt into Telegram's sendMessageDraft streaming when the message is eligible. */
  draftStreaming?: boolean;
}

/**
 * Telegram draft identifiers must be non-zero and are scoped per chat; a process-wide counter
 * keeps concurrent managers from animating each other's drafts.
 */
let draftIdCounter = 0;
function nextDraftId(): number {
  draftIdCounter += 1;
  return draftIdCounter;
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
  private draftId?: number;
  private lastDraftText?: string;
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

  async update(node: ElementNode, options: UpdateOptions = {}): Promise<void> {
    const { final = false, draftStreaming = false } = options;
    const html = serializeTelegram(node);
    const chatId = this.chatId;
    const threadId = (node.props.threadId as number | undefined) ?? this.ctx.message?.message_thread_id;
    const linkPreview = node.props.linkPreview as LinkPreviewOptions | undefined;

    if (draftStreaming && this.canStreamDraft(node, html)) {
      await this.updateViaDraft(node, html, threadId, linkPreview, final);
      return;
    }

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

  /**
   * Drafts are single, text-only messages in private chats. We also refuse to switch to drafting
   * once a real message has been persisted, so a manager never mixes the two delivery paths.
   */
  private canStreamDraft(node: ElementNode, html: string): boolean {
    if (this.ctx.chat?.type !== "private") return false;
    if (this.messageIds.length > 0) return false;
    if (collectAttachments(node).length > 0) return false;
    return splitMessage(html).length <= 1;
  }

  /**
   * While streaming, each commit re-sends the same draft_id with the latest text and Telegram
   * animates the diff — no edit, no flicker. The draft is ephemeral (~30s), so the final commit
   * persists the message with a real sendMessage.
   */
  private async updateViaDraft(
    node: ElementNode,
    html: string,
    threadId: number | undefined,
    linkPreview: LinkPreviewOptions | undefined,
    final: boolean,
  ): Promise<void> {
    const chatId = this.chatId;

    if (!final) {
      // Telegram rejects empty draft text; nothing to animate until there is content.
      if (!html || html === this.lastDraftText) return;
      this.draftId ??= nextDraftId();
      try {
        await this.ctx.api.sendMessageDraft(chatId, this.draftId, html, {
          parse_mode: "HTML",
          message_thread_id: threadId,
        });
        this.lastDraftText = html;
      } catch (error) {
        this.logger.warn("Failed to send message draft", error);
      }
      return;
    }

    const msg = await this.ctx.api.sendMessage(chatId, html, {
      parse_mode: "HTML",
      message_thread_id: threadId,
      reply_parameters: this.replyToMessageId ? { message_id: this.replyToMessageId } : undefined,
      link_preview_options: getLinkPreviewOptions(html, linkPreview),
    });

    this.messageIds = [msg.message_id];
    this.lastSentChunks = [html];
    this.lastSentText = html;
    this.lastDraftText = undefined;

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
