/**
 * Deciding how to read an uploaded job description.
 *
 * Two routes, and the split is not by file type but by whether the bytes
 * contain selectable text:
 *
 *   text   - extracted locally by parseFile (docx, odt, rtf, txt, md, csv, and
 *            the common case of PDF)
 *   visual - handed to Claude, which reads PDFs and images natively
 *
 * The visual route is what makes screenshots work, and it is also the recovery
 * path for the two failures that look identical to a text parser: a scanned PDF
 * and an Apple Pages preview. Both are pictures of a document. Neither needs a
 * separate OCR vendor - we already call Anthropic.
 */

/**
 * Formats a vision-capable model reads directly, no extraction step. The union
 * is exactly what the Messages API accepts - keeping it as literals rather than
 * `string` means adding an unsupported type is a compile error, not a 400 in
 * production.
 */
export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

const IMAGE_MEDIA_TYPES: Record<string, ImageMediaType> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

/** Everything parseFile can extract text from. Kept in sync with parse.ts. */
const TEXT_EXTENSIONS = ['pdf', 'docx', 'pages', 'odt', 'rtf', 'txt', 'md', 'markdown', 'csv'];

export const ACCEPTED_EXTENSIONS = [...TEXT_EXTENSIONS, ...Object.keys(IMAGE_MEDIA_TYPES)];

/**
 * HEIC is deliberately absent. iPhone screenshots are PNG and photos shared to
 * a browser are converted to JPEG, so the format rarely reaches an upload form -
 * and Claude does not accept it, so pretending to support it would mean adding
 * an image-conversion dependency to serve a case that mostly does not occur.
 */
export function extensionOf(filename: string): string {
  return filename.toLowerCase().split('.').pop() ?? '';
}

export function isAcceptedExtension(ext: string): boolean {
  return ACCEPTED_EXTENSIONS.includes(ext);
}

export function imageMediaType(ext: string): ImageMediaType | null {
  return IMAGE_MEDIA_TYPES[ext] ?? null;
}

/**
 * A document block for the Messages API. `application/pdf` uses the `document`
 * shape; images use `image`. Both take base64 with no newlines.
 */
export type VisualBlock =
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }
  | { type: 'image'; source: { type: 'base64'; media_type: ImageMediaType; data: string } };

export function buildVisualBlock(
  mediaType: ImageMediaType | 'application/pdf',
  buffer: Buffer
): VisualBlock {
  const data = buffer.toString('base64');

  if (mediaType === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
  }
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
}
