import { describe, expect, test } from "bun:test";
import { splitMessage } from "./telegram-message-splitter";

describe("splitMessage", () => {
  test("returns single chunk for short messages", () => {
    const text = "Hello, world!";
    const result = splitMessage(text);

    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe(text);
    expect(result[0]?.isFirst).toBe(true);
    expect(result[0]?.isLast).toBe(true);
  });

  test("returns single chunk for message exactly at limit", () => {
    const text = "a".repeat(4000);
    const result = splitMessage(text);

    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe(text);
  });

  test("splits long message into multiple chunks", () => {
    const text = "a ".repeat(3000);
    const result = splitMessage(text);

    expect(result.length).toBeGreaterThan(1);
    expect(result[0]?.isFirst).toBe(true);
    expect(result[0]?.isLast).toBe(false);
    expect(result[result.length - 1]?.isFirst).toBe(false);
    expect(result[result.length - 1]?.isLast).toBe(true);
  });

  test("never splits words", () => {
    const text = "word ".repeat(3000);
    const result = splitMessage(text);

    for (const chunk of result) {
      const trimmed = chunk.text.trim();
      if (trimmed.length > 0) {
        const lastChar = chunk.text[chunk.text.length - 1];
        expect(lastChar === " " || lastChar === "\n" || chunk.isLast).toBe(true);
      }
    }
  });

  test("preserves code blocks", () => {
    const codeBlock = "```typescript\nconst x = 1;\n```";
    const text = `Some text before\n\n${codeBlock}\n\nSome text after`;
    const result = splitMessage(text);

    const reconstructed = result.map((c) => c.text).join("");
    expect(reconstructed).toBe(text);
  });

  test("preserves HTML <pre> blocks", () => {
    const preBlock = "<pre><code>const x = 1;\nconst y = 2;</code></pre>";
    const text = `${"Some filler text. ".repeat(600)}\n\n${preBlock}\n\n${"More filler text. ".repeat(600)}`;
    const result = splitMessage(text, 400);

    const reconstructed = result.map((c) => c.text).join("");
    expect(reconstructed).toBe(text);
  });

  test("splits at paragraph breaks when possible", () => {
    const paragraph = "This is a paragraph. ".repeat(100);
    const text = Array.from({ length: 30 }, () => paragraph).join("\n\n");
    const result = splitMessage(text);

    for (const chunk of result.slice(0, -1)) {
      const trimmed = chunk.text.trimEnd();
      expect(trimmed.endsWith("\n") || trimmed.endsWith(".")).toBe(true);
    }
  });

  test("splits at sentence boundaries when no paragraph breaks", () => {
    const text = "This is sentence one. This is sentence two. ".repeat(1500);
    const result = splitMessage(text);

    expect(result.length).toBeGreaterThan(1);

    for (const chunk of result.slice(0, -1)) {
      const trimmed = chunk.text.trimEnd();
      expect(trimmed.endsWith(".") || trimmed.endsWith("!") || trimmed.endsWith("?")).toBe(true);
    }
  });

  test("handles empty string", () => {
    const result = splitMessage("");

    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe("");
  });

  test("respects custom maxLength parameter", () => {
    const text = "a".repeat(200);
    const result = splitMessage(text, 100);

    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) expect(chunk.text.length).toBeLessThanOrEqual(100);
  });

  test("handles multiple code blocks", () => {
    const code1 = "```js\nconsole.log('1');\n```";
    const code2 = "```python\nprint('2')\n```";
    const text = `${code1}\n\n${"Some filler text. ".repeat(400)}\n\n${code2}`;
    const result = splitMessage(text);

    const reconstructed = result.map((c) => c.text).join("");
    expect(reconstructed).toBe(text);
  });

  test("all chunks are within maxLength", () => {
    const text = "word ".repeat(5000);
    const result = splitMessage(text);

    for (const chunk of result) expect(chunk.text.length).toBeLessThanOrEqual(4000);
  });

  test("reconstructs original text when joined", () => {
    const text = `${"Hello world. ".repeat(1000)}\n\n\`\`\`code\ntest\n\`\`\`\n\nMore text.`;
    const result = splitMessage(text);

    const reconstructed = result.map((c) => c.text).join("");
    expect(reconstructed).toBe(text);
  });
});
