import type { ElementNode, OutputNode, TextNode } from "@elumixor/react-message-renderer";
import { markdownToTelegramHtml } from "./markdown-to-telegram-html";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

function isTextNode(node: OutputNode): node is TextNode {
  return node.type === "TEXT";
}

type TextMode = "markdown" | "plain";

function serializeChildren(node: ElementNode, mode: TextMode): string {
  return node.children.map((child) => serializeTelegram(child, mode)).join("");
}

/**
 * Serialize the output tree into Telegram-flavour HTML.
 *
 * Plain text nodes are treated as Markdown by default and converted into Telegram-compatible HTML.
 * Inside <code>/<pre> the text is treated as plain (HTML-escaped only).
 */
export function serializeTelegram(node: OutputNode, mode: TextMode = "markdown"): string {
  if (isTextNode(node)) {
    if (mode === "plain") return escapeHtml(node.text);
    return markdownToTelegramHtml(node.text);
  }

  const children = serializeChildren(node, node.type === "code" || node.type === "pre" ? "plain" : mode);

  switch (node.type) {
    case "io-root":
    case "io-text":
    case "io-message":
      return children;
    case "b":
      return `<b>${children}</b>`;
    case "i":
      return `<i>${children}</i>`;
    case "u":
      return `<u>${children}</u>`;
    case "s":
      return `<s>${children}</s>`;
    case "a": {
      const href = escapeAttr(String(node.props.href ?? ""));
      return `<a href="${href}">${children}</a>`;
    }
    case "code":
      return `<code>${children}</code>`;
    case "pre":
      return `<pre>${children}</pre>`;
    case "blockquote":
      return `<blockquote>${children}</blockquote>`;
    case "br":
      return "\n";
    case "div":
    case "p":
      return `${children}\n`;
    default:
      return children;
  }
}
