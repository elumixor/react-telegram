import type { ReactNode } from "react";
import type { AttachmentSource } from "./attachments";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "tg-photo": {
        children?: ReactNode;
        src: AttachmentSource;
        caption?: string;
      };
      "tg-document": {
        children?: ReactNode;
        src: AttachmentSource;
        filename?: string;
        caption?: string;
      };
    }
  }
}
