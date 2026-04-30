import { describe, expect, test } from "bun:test";
import { markdownToTelegramHtml } from "./markdown-to-telegram-html";

describe("markdownToTelegramHtml", () => {
  test("converts headers to bold with blockquote", () => {
    expect(markdownToTelegramHtml("# Header 1")).toBe("<blockquote><b>Header 1</b></blockquote>");
    expect(markdownToTelegramHtml("## Header 2")).toBe("<blockquote><b>Header 2</b></blockquote>");
    expect(markdownToTelegramHtml("### Header 3")).toBe("<b>Header 3</b>");
  });

  test("converts code blocks to <pre><code>", () => {
    const input = "```javascript\nconst x = 1;\n```";
    const expected = "<pre><code>const x = 1;\n</code></pre>";
    expect(markdownToTelegramHtml(input)).toBe(expected);
  });

  test("escapes HTML in code blocks", () => {
    const input = "```\n<script>alert('xss')</script>\n```";
    const expected = "<pre><code>&lt;script&gt;alert('xss')&lt;/script&gt;\n</code></pre>";
    expect(markdownToTelegramHtml(input)).toBe(expected);
  });

  test("converts inline code to <code>", () => {
    expect(markdownToTelegramHtml("Use `const` instead")).toBe("Use <code>const</code> instead");
  });

  test("escapes HTML in inline code", () => {
    expect(markdownToTelegramHtml("Use `<tag>` here")).toBe("Use <code>&lt;tag&gt;</code> here");
  });

  test("converts bold with **", () => {
    expect(markdownToTelegramHtml("This is **bold** text")).toBe("This is <b>bold</b> text");
  });

  test("converts bold with __", () => {
    expect(markdownToTelegramHtml("This is __bold__ text")).toBe("This is <b>bold</b> text");
  });

  test("converts italic with *", () => {
    expect(markdownToTelegramHtml("This is *italic* text")).toBe("This is <i>italic</i> text");
  });

  test("converts italic with _", () => {
    expect(markdownToTelegramHtml("This is _italic_ text")).toBe("This is <i>italic</i> text");
  });

  test("converts links", () => {
    expect(markdownToTelegramHtml("[Click here](https://example.com)")).toBe(
      '<a href="https://example.com">Click here</a>',
    );
  });

  test("converts strikethrough", () => {
    expect(markdownToTelegramHtml("This is ~~deleted~~ text")).toBe("This is <s>deleted</s> text");
  });

  test("converts unordered lists", () => {
    const input = "- Item 1\n- Item 2\n* Item 3";
    const expected = "• Item 1\n• Item 2\n• Item 3";
    expect(markdownToTelegramHtml(input)).toBe(expected);
  });

  test("converts ordered lists", () => {
    const input = "1. First\n2. Second\n3. Third";
    const expected = "1. First\n2. Second\n3. Third";
    expect(markdownToTelegramHtml(input)).toBe(expected);
  });

  test("handles mixed formatting", () => {
    const input =
      "## API Response\n\nThe API returned **success** with code `200`.\n\n- Status: *OK*\n- [Docs](https://example.com)";
    const expected =
      '<blockquote><b>API Response</b></blockquote>\n\nThe API returned <b>success</b> with code <code>200</code>.\n\n• Status: <i>OK</i>\n• <a href="https://example.com">Docs</a>';
    expect(markdownToTelegramHtml(input)).toBe(expected);
  });

  test("handles plain text", () => {
    expect(markdownToTelegramHtml("Just plain text")).toBe("Just plain text");
  });

  test("preserves line breaks", () => {
    const input = "Line 1\nLine 2\n\nLine 3";
    expect(markdownToTelegramHtml(input)).toBe("Line 1\nLine 2\n\nLine 3");
  });

  test("does not apply italic/bold inside code blocks", () => {
    expect(markdownToTelegramHtml("Use `*asterisk*` here")).toBe("Use <code>*asterisk*</code> here");
    expect(markdownToTelegramHtml("Use `_underscore_` here")).toBe("Use <code>_underscore_</code> here");
    expect(markdownToTelegramHtml("```\n*code*\n```")).toBe("<pre><code>*code*\n</code></pre>");
  });

  test("handles asterisks spanning across inline code", () => {
    const input = "Start *word `code*here` end* finish";
    const result = markdownToTelegramHtml(input);
    expect(result).toBe("Start <i>word <code>code*here</code> end</i> finish");
  });
});
