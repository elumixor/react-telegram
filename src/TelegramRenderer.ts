import {
  type ElementNode,
  Renderer,
  type RendererOptions,
  type RenderPassOptions,
} from "@elumixor/react-message-renderer";
import type { Context } from "grammy";
import { TelegramMessageManager } from "./telegram-message-manager";

export interface TelegramRendererOptions extends RendererOptions {
  /**
   * Stream eligible messages via Telegram's `sendMessageDraft` instead of repeated edits.
   * Off by default. Auto-gated to messages it supports (private chat, single chunk, text-only);
   * everything else falls back to the edit-based path. Pairs well with a low `throttleMs`.
   */
  draftStreaming?: boolean;
}

export class TelegramRenderer extends Renderer {
  private messageManagers: TelegramMessageManager[] = [];
  private readonly draftStreaming: boolean;

  constructor(
    private readonly ctx: Context,
    rendererOptions?: TelegramRendererOptions,
  ) {
    super(rendererOptions);
    this.draftStreaming = rendererOptions?.draftStreaming ?? false;
  }

  protected async renderMessages(messageNodes: ElementNode[], { final }: RenderPassOptions): Promise<void> {
    for (const [i, node] of messageNodes.entries()) {
      if (!node) continue;

      if (!this.messageManagers[i]) {
        const replyTo = node.props.repliesTo as number | undefined;
        this.messageManagers[i] = new TelegramMessageManager(this.ctx, {
          replyToMessageId: replyTo,
          logger: { warn: (msg, meta) => this.logger.warn(msg, meta) },
        });
      }

      await this.messageManagers[i].update(node, { final, draftStreaming: this.draftStreaming });
    }

    for (const manager of this.messageManagers.slice(messageNodes.length)) await manager.deleteMessages();
    this.messageManagers = this.messageManagers.slice(0, messageNodes.length);
  }
}
