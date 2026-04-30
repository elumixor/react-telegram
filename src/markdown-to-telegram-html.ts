/**
 * Converts Markdown to Telegram-compatible HTML.
 * Telegram supports a limited subset of HTML tags.
 * @see https://core.telegram.org/bots/api#html-style
 */
export function markdownToTelegramHtml(markdown: string): string {
  let html = markdown;

  const codeBlocks: string[] = [];
  const inlineCodes: string[] = [];
  const links: string[] = [];

  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_match, _lang, code) => {
    const placeholder = `\x00CODEBLOCK${codeBlocks.length}\x00`;
    codeBlocks.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
    return placeholder;
  });

  html = html.replace(/`([^`]+)`/g, (_match, code) => {
    const placeholder = `\x00INLINECODE${inlineCodes.length}\x00`;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return placeholder;
  });

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match) => {
    const placeholder = `\x00LINK${links.length}\x00`;
    links.push(match);
    return placeholder;
  });

  html = html.replace(/https?:\/\/[^\s<>)]+/g, (match) => {
    const placeholder = `\x00LINK${links.length}\x00`;
    links.push(match);
    return placeholder;
  });

  html = escapeHtml(html);

  html = html.replace(/^### (.+)$/gm, "<b>$1</b>");
  html = html.replace(/^## (.+)$/gm, "<blockquote><b>$1</b></blockquote>");
  html = html.replace(/^# (.+)$/gm, "<blockquote><b>$1</b></blockquote>");

  html = html.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  html = html.replace(/__(.+?)__/g, "<b>$1</b>");

  html = html.replace(/\*(.+?)\*/g, "<i>$1</i>");
  html = html.replace(/_(.+?)_/g, "<i>$1</i>");

  html = html.replace(/~~(.+?)~~/g, "<s>$1</s>");

  html = html.replace(/^[*-] (.+)$/gm, "• $1");
  html = html.replace(/^(\d+)\. (.+)$/gm, "$1. $2");

  for (const [i, block] of codeBlocks.entries()) html = html.replace(`\x00CODEBLOCK${i}\x00`, block);
  for (const [i, code] of inlineCodes.entries()) html = html.replace(`\x00INLINECODE${i}\x00`, code);

  for (const [i, link] of links.entries()) {
    const mdMatch = link.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    const restored = mdMatch ? `<a href="${mdMatch[2]}">${mdMatch[1]}</a>` : link;
    html = html.replace(`\x00LINK${i}\x00`, restored);
  }

  return html;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
