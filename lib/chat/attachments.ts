import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";

import { createId, type Attachment, type AttachmentKind } from "@/lib/chat/types";

export interface PreparedAttachment extends Attachment {
  imageDataUrl?: string;
  textContent?: string;
}

const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const MAX_TEXT_CHARACTERS = 18000;

function determineKind(mimeType: string): AttachmentKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("text/") || mimeType === "application/json" || mimeType === "application/xml") {
    return "text";
  }
  return "other";
}

export async function selectAttachments(): Promise<PreparedAttachment[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["image/*", "text/*", "application/json", "application/xml", "application/pdf"],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];

  return Promise.all(
    result.assets.map(async (asset) => {
      const mimeType = asset.mimeType || "application/octet-stream";
      const kind = determineKind(mimeType);
      const attachment: PreparedAttachment = {
        id: createId("file"),
        name: asset.name || "Attachment",
        mimeType,
        size: asset.size,
        uri: asset.uri,
        kind,
      };
      if ((asset.size ?? 0) > MAX_ATTACHMENT_BYTES) {
        throw new Error(`“${attachment.name}” is larger than the 3 MB attachment limit.`);
      }
      const file = new File(asset.uri);
      if (kind === "image") {
        attachment.imageDataUrl = `data:${mimeType};base64,${await file.base64()}`;
      }
      if (kind === "text") {
        const content = await file.text();
        attachment.textContent = content.slice(0, MAX_TEXT_CHARACTERS);
      }
      return attachment;
    }),
  );
}

export function toStoredAttachment(attachment: PreparedAttachment): Attachment {
  const { imageDataUrl: _imageDataUrl, textContent: _textContent, ...stored } = attachment;
  return stored;
}

export function attachmentSummary(attachment: Attachment): string {
  if (attachment.kind === "image") return "Image";
  if (attachment.kind === "text") return "Document";
  return "File";
}
