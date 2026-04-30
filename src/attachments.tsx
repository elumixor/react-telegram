/// <reference path="./jsx.d.ts" />

/**
 * Anything grammy can wrap into an InputFile: a Buffer, a Uint8Array,
 * a remote URL, a file_id, or an absolute path.
 */
export type AttachmentSource = Buffer | Uint8Array | string;

export interface PhotoProps {
  src: AttachmentSource;
  caption?: string;
}

/**
 * Telegram photo message. Sent as a sibling reply to the parent <Message>.
 *
 * Identity is the React `key` — keep the key stable to avoid resends.
 * Changing src or caption with the same key will resend (Telegram does
 * not allow editing photo media after send).
 */
export function Photo({ src, caption }: PhotoProps) {
  return <tg-photo src={src} caption={caption} />;
}

export interface DocumentProps {
  src: AttachmentSource;
  filename?: string;
  caption?: string;
}

/**
 * Telegram document message. Sent as a sibling reply to the parent <Message>.
 * Same identity rules as <Photo>.
 */
export function Document({ src, filename, caption }: DocumentProps) {
  return <tg-document src={src} filename={filename} caption={caption} />;
}
