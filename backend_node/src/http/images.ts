import { HttpError } from "./errors";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function validateImage(content: Buffer, contentType: string): void {
  const matches =
    contentType === "image/jpeg"
      ? content.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) &&
        content.subarray(-2).equals(Buffer.from([0xff, 0xd9]))
      : contentType === "image/png"
        ? content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        : contentType === "image/webp"
          ? content.length >= 12 &&
            content.subarray(0, 4).equals(Buffer.from("RIFF")) &&
            content.subarray(8, 12).equals(Buffer.from("WEBP"))
          : false;
  if (content.length === 0 || !matches) {
    throw new HttpError(422, "Image content does not match its declared format");
  }
}
