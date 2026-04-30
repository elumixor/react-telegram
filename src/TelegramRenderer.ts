import { type ElementNode, Renderer, type RendererOptions } from "@elumixor/react-message-renderer";
import type { Context } from "grammy";
import { TelegramMessageManager } from "./telegram-message-manager";

export class TelegramRenderer extends Renderer {
  private messageManagers: TelegramMessageManager[] = [];

  constructor(
    private readonly ctx: Context,
    rendererOptions?: RendererOptions,
  ) {
    super(rendererOptions);
  }

  protected async renderMessages(messageNodes: ElementNode[]): Promise<void> {
    for (const [i, node] of messageNodes.entries()) {
      if (!node) continue;

      if (!this.messageManagers[i]) {
        const replyTo = node.props.repliesTo as number | undefined;
        this.messageManagers[i] = new TelegramMessageManager(this.ctx, {
          replyToMessageId: replyTo,
          logger: { warn: (msg, meta) => this.logger.warn(msg, meta) },
        });
      }

      await this.messageManagers[i].update(node);
    }

    for (const manager of this.messageManagers.slice(messageNodes.length)) await manager.deleteMessages();
    this.messageManagers = this.messageManagers.slice(0, messageNodes.length);
  }
}
