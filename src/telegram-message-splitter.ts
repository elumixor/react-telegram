export interface MessageChunk {
  text: string;
  isFirst: boolean;
  isLast: boolean;
}

interface CodeBlock {
  start: number;
  end: number;
}

export function splitMessage(text: string, maxLength = 4000): MessageChunk[] {
  if (text.length <= maxLength) return [{ text, isFirst: true, isLast: true }];

  const codeBlocks = findCodeBlocks(text);
  const chunks: string[] = [];
  let currentPos = 0;

  while (currentPos < text.length) {
    const remainingText = text.substring(currentPos);

    if (remainingText.length <= maxLength) {
      chunks.push(remainingText);
      break;
    }

    const splitPoint = findSafeSplitPoint(text, currentPos, currentPos + maxLength, codeBlocks);
    chunks.push(text.substring(currentPos, splitPoint));
    currentPos = splitPoint;
  }

  return chunks.map((chunk, index) => ({
    text: chunk,
    isFirst: index === 0,
    isLast: index === chunks.length - 1,
  }));
}

function findCodeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const regexes = [/```[\s\S]*?```/g, /<pre(?:\s[^>]*)?>[\s\S]*?<\/pre>/gi];

  for (const regex of regexes) {
    let match: RegExpExecArray | null = regex.exec(text);
    while (match !== null) {
      blocks.push({ start: match.index, end: match.index + match[0].length });
      match = regex.exec(text);
    }
  }

  blocks.sort((a, b) => a.start - b.start);

  return blocks;
}

function findSafeSplitPoint(text: string, startPos: number, maxPos: number, codeBlocks: CodeBlock[]): number {
  for (const block of codeBlocks) {
    if (maxPos > block.start && maxPos < block.end) {
      if (block.start > startPos) return block.start;

      const newlineInBlock = text.lastIndexOf("\n", maxPos);
      if (newlineInBlock > startPos + (maxPos - startPos) * 0.5) return newlineInBlock + 1;

      return block.start > startPos ? block.start : startPos + Math.floor((maxPos - startPos) / 2);
    }
  }

  let splitPos = text.lastIndexOf("\n\n", maxPos);
  if (splitPos > startPos && splitPos > startPos + (maxPos - startPos) * 0.6) return splitPos + 2;

  splitPos = text.lastIndexOf("\n", maxPos);
  if (splitPos > startPos && splitPos > startPos + (maxPos - startPos) * 0.6) return splitPos + 1;

  const sentenceEndings = [". ", "! ", "? "];
  for (const ending of sentenceEndings) {
    splitPos = text.lastIndexOf(ending, maxPos);
    if (splitPos > startPos && splitPos > startPos + (maxPos - startPos) * 0.6) return splitPos + ending.length;
  }

  const punctuation = [", ", "; "];
  for (const punct of punctuation) {
    splitPos = text.lastIndexOf(punct, maxPos);
    if (splitPos > startPos && splitPos > startPos + (maxPos - startPos) * 0.6) return splitPos + punct.length;
  }

  splitPos = text.lastIndexOf(" ", maxPos);
  if (splitPos > startPos) return splitPos + 1;

  return maxPos;
}
