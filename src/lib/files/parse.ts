import mammoth from 'mammoth';
import JSZip from 'jszip';
import type { ImageMediaType } from './intake-document';

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB

export interface ParseResult {
  success: boolean;
  text?: string;
  error?: string;
  /**
   * Set when a file could not be read as text but IS readable by a vision-capable
   * model: an image-only PDF, or a .pages whose embedded preview we recovered.
   * Callers that can send documents to Claude should retry down that path
   * (see src/lib/files/intake-document.ts); callers that cannot should treat the
   * result as the failure it is and surface `error`.
   *
   * `partial` marks a fallback that is knowingly incomplete - currently only the
   * .pages preview, which Apple renders for the first page alone. The caller
   * must pass that on rather than presenting page one as the whole document.
   */
  visualFallback?: {
    mediaType: 'application/pdf' | ImageMediaType;
    buffer: Buffer;
    partial?: boolean;
  };
}

/**
 * Parse a .docx or .pdf file and extract text content
 */
export async function parseFile(buffer: Buffer, filename: string): Promise<ParseResult> {
  // Check file size
  if (buffer.length > MAX_FILE_SIZE) {
    return {
      success: false,
      error: `File too large. Maximum size is 4MB, got ${(buffer.length / 1024 / 1024).toFixed(2)}MB.`,
    };
  }

  const ext = filename.toLowerCase().split('.').pop();

  // Reject .doc files
  if (ext === 'doc') {
    return {
      success: false,
      error: 'Please convert your .doc file to .docx and try again.',
    };
  }

  // Parse based on extension
  if (ext === 'docx') {
    return parseDocx(buffer);
  }

  if (ext === 'pdf') {
    return parsePdf(buffer);
  }

  // Plain text and near-plain formats. Markdown and CSV are deliberately handled
  // as text rather than parsed structurally: a language model reads the raw
  // markup perfectly well, and a CSV parser would only throw away the header row
  // context that makes the content legible.
  if (ext === 'txt' || ext === 'md' || ext === 'markdown' || ext === 'csv') {
    return parsePlainText(buffer);
  }

  if (ext === 'rtf') {
    return parseRtf(buffer);
  }

  if (ext === 'odt') {
    return parseOdt(buffer);
  }

  if (ext === 'pages') {
    return parsePages(buffer);
  }

  return {
    success: false,
    error: `Unsupported file type: .${ext}. Please upload a PDF, Word, Pages, or text document.`,
  };
}

/** UTF-8 text, with the BOM stripped so it does not show up as a stray glyph. */
function parsePlainText(buffer: Buffer): ParseResult {
  const text = buffer.toString('utf8').replace(/^﻿/, '').trim();
  if (!text) {
    return { success: false, error: 'That file appears to be empty.' };
  }
  return { success: true, text };
}

/**
 * RTF, unwrapped by hand rather than with a dependency.
 *
 * RTF is a control-word format, not a markup language: the body text is what
 * remains once the control words, the font/colour tables, and the braces are
 * removed. That is a lossy transform - it discards formatting entirely - which
 * is exactly what we want, because we are feeding a language model, not
 * rendering a document.
 */
/**
 * Windows-1252 bytes 0x80-0x9f, folded to ASCII rather than to their curly
 * Unicode equivalents. Straight quotes and hyphens read identically to a model
 * and travel better through everything downstream.
 */
const CP1252_PUNCTUATION: Record<number, string> = {
  0x82: ',', 0x84: '"', 0x85: '...', 0x91: "'", 0x92: "'",
  0x93: '"', 0x94: '"', 0x95: '-', 0x96: '-', 0x97: '-',
};

function parseRtf(buffer: Buffer): ParseResult {
  const raw = buffer.toString('utf8');

  const text = raw
    // Whole groups that hold metadata rather than body text.
    .replace(/\{\\\*[^{}]*\}/g, '')
    .replace(/\{\\(?:fonttbl|colortbl|stylesheet|info|pict)[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '')
    // \'hh escapes are single bytes in the document's codepage, which for
    // anything produced by Word is Windows-1252. Mapping them with
    // String.fromCharCode alone is wrong: 0x80-0x9f are punctuation there but
    // unprintable control characters in Unicode, so a curly apostrophe silently
    // becomes an invisible glyph and "5+ years' experience" loses its
    // apostrophe. These are the bytes that actually turn up in job specs.
    .replace(/\\'([0-9a-f]{2})/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return CP1252_PUNCTUATION[code] ?? String.fromCharCode(code);
    })
    // Paragraph and line breaks become real newlines before other control words go.
    .replace(/\\(?:par|line|pard)\b/g, '\n')
    .replace(/\\tab\b/g, '\t')
    // Remaining control words, then the braces themselves.
    .replace(/\\[a-z]+-?\d*\s?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!text) {
    return { success: false, error: 'That RTF file appears to contain no text.' };
  }
  return { success: true, text };
}

/**
 * ODT (LibreOffice / OpenOffice). A ZIP whose content.xml holds the document
 * body in plain XML - genuinely straightforward, unlike .pages below.
 */
async function parseOdt(buffer: Buffer): Promise<ParseResult> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const contentXml = await zip.file('content.xml')?.async('string');

    if (!contentXml) {
      return { success: false, error: 'That .odt file is missing its content.' };
    }

    const text = xmlToText(contentXml);
    if (!text) {
      return { success: false, error: 'That .odt file appears to be empty.' };
    }
    return { success: true, text };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Failed to read that .odt file: ${message}` };
  }
}

/**
 * Apple Pages.
 *
 * There is no honest way to parse the document itself: a modern .pages bundle
 * stores its content as IWA, Apple's undocumented binary format, and no
 * general-purpose parser exists for it. What Pages DOES include, by default, is
 * a rendered PDF preview inside the bundle - so we lift that out and read it as
 * a PDF instead.
 *
 * The consequence, stated plainly because it will happen to someone: a .pages
 * file saved with previews turned off contains nothing we can read, and no
 * amount of parsing will change that. Those get an error telling the visitor to
 * export as PDF, which is the only thing that actually works.
 */
async function parsePages(buffer: Buffer): Promise<ParseResult> {
  const CANNOT_READ =
    'We could not read that Pages file. Please export it as a PDF and upload that instead.';

  try {
    const zip = await JSZip.loadAsync(buffer);
    const paths = Object.keys(zip.files);

    // A PDF preview, where one exists, is the best case: multi-page, and often
    // carrying real text. Older Pages versions and some export settings produce
    // one. Current Pages (verified against a real bundle) does not.
    const pdfPath = paths.find((p) => /\.pdf$/i.test(p));
    if (pdfPath) {
      const pdf = await zip.file(pdfPath)?.async('nodebuffer');
      if (pdf?.length) {
        const parsed = await parsePdf(pdf);
        if (parsed.success) return parsed;
        return {
          success: false,
          error: CANNOT_READ,
          visualFallback: { mediaType: 'application/pdf', buffer: pdf },
        };
      }
    }

    // What current Pages actually ships: preview.jpg (full size), plus -web and
    // -micro thumbnails. Take the full one; the thumbnails are far too small to
    // read text from. Ordered explicitly rather than by picking the largest
    // file, so a bundle with an embedded photo can't win the comparison.
    const jpegPath =
      paths.find((p) => /(^|\/)preview\.jpe?g$/i.test(p)) ??
      paths.find((p) => /(^|\/)preview-web\.jpe?g$/i.test(p));

    if (jpegPath) {
      const jpeg = await zip.file(jpegPath)?.async('nodebuffer');
      if (jpeg?.length) {
        return {
          success: false,
          error: CANNOT_READ,
          // Apple renders this preview for the FIRST PAGE ONLY. A two-page job
          // spec loses everything after page one, and the caller has to say so
          // rather than presenting a partial read as a complete one.
          visualFallback: { mediaType: 'image/jpeg', buffer: jpeg, partial: true },
        };
      }
    }

    return { success: false, error: CANNOT_READ };
  } catch {
    return { success: false, error: CANNOT_READ };
  }
}

/** Strips XML tags, keeping paragraph boundaries as newlines. */
function xmlToText(xml: string): string {
  return xml
    .replace(/<text:(?:p|h)\b[^>]*>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Ampersand last, so a literal &amp;lt; does not become a tag.
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Parse .docx file using mammoth
 */
async function parseDocx(buffer: Buffer): Promise<ParseResult> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();

    if (!text) {
      return {
        success: false,
        error: 'The document appears to be empty or contains no extractable text.',
      };
    }

    return { success: true, text };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: `Failed to parse .docx file: ${message}`,
    };
  }
}

/**
 * Parse .pdf file using pdf-parse
 */
async function parsePdf(buffer: Buffer): Promise<ParseResult> {
  try {
    // Import from lib path to bypass pdf-parse's test file check
    const pdf = (await import('pdf-parse/lib/pdf-parse.js')).default;
    const data = await pdf(buffer);
    const text = data.text.trim();

    if (!text) {
      // Almost always a scan or an exported image rather than a genuinely empty
      // file. There is no text to extract, but a vision-capable model can still
      // read it, so hand the bytes back for that path.
      return {
        success: false,
        error: 'The PDF appears to be empty or contains no extractable text (it may be image-based).',
        visualFallback: { mediaType: 'application/pdf', buffer },
      };
    }

    return { success: true, text };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: `Failed to parse PDF file: ${message}`,
    };
  }
}

/**
 * Get allowed file extensions
 */
export function getAllowedExtensions(): string[] {
  return ['.docx', '.pdf', '.pages', '.odt', '.rtf', '.txt', '.md', '.markdown', '.csv'];
}

/**
 * Get allowed MIME types
 */
export function getAllowedMimeTypes(): string[] {
  return [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/pdf', // .pdf
  ];
}
