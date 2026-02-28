import mammoth from 'mammoth';
import pdf from 'pdf-parse';

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB

export interface ParseResult {
  success: boolean;
  text?: string;
  error?: string;
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

  return {
    success: false,
    error: `Unsupported file type: .${ext}. Please upload a .docx or .pdf file.`,
  };
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
    const data = await pdf(buffer);
    const text = data.text.trim();

    if (!text) {
      return {
        success: false,
        error: 'The PDF appears to be empty or contains no extractable text (it may be image-based).',
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
  return ['.docx', '.pdf'];
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
