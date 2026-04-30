import { describe, expect, test } from "bun:test";
import type { ElementNode, TextNode } from "@elumixor/react-message-renderer";
import { serializeTelegram } from "./telegram-serializer";

const t = (text: string): TextNode => ({ type: "TEXT", text });

const el = (
  type: ElementNode["type"],
  children: Array<ElementNode | TextNode> = [],
  props: ElementNode["props"] = {},
): ElementNode => ({ type, props, children });

describe("serializeTelegram", () => {
  test("converts Markdown in text nodes to Telegram HTML", () => {
    const tree = el("io-message", [t("This is **bold** and *italic* and `code`.")]);
    expect(serializeTelegram(tree)).toBe("This is <b>bold</b> and <i>italic</i> and <code>code</code>.");
  });

  test("does not run Markdown conversion inside <code>", () => {
    const tree = el("io-message", [el("code", [t("**not bold** <tag>")])]);
    expect(serializeTelegram(tree)).toBe("<code>**not bold** &lt;tag&gt;</code>");
  });

  test("does not run Markdown conversion inside <pre>", () => {
    const tree = el("io-message", [el("pre", [t("* not italic\n<raw>")])]);
    expect(serializeTelegram(tree)).toBe("<pre>* not italic\n&lt;raw&gt;</pre>");
  });

  test("renders blockquote elements", () => {
    const tree = el("io-message", [el("blockquote", [t("This is a quote")])]);
    expect(serializeTelegram(tree)).toBe("<blockquote>This is a quote</blockquote>");
  });

  test("escapes attribute on <a href>", () => {
    const tree = el("a", [t("link")], { href: 'https://x.test/?q="x"&y=1' });
    expect(serializeTelegram(tree)).toBe('<a href="https://x.test/?q=&quot;x&quot;&amp;y=1">link</a>');
  });

  test("renders strikethrough", () => {
    expect(serializeTelegram(el("s", [t("gone")]))).toBe("<s>gone</s>");
  });
});
