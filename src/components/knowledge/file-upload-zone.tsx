'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, FileText, X, AlertCircle } from 'lucide-react';

interface FileUploadZoneProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

const ALLOWED_EXTENSIONS = ['.docx', '.pdf'];
const ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
];
const MAX_SIZE_MB = 4;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

export function FileUploadZone({ onFileSelect, disabled }: FileUploadZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): string | null => {
    // Check extension
    const ext = '.' + file.name.toLowerCase().split('.').pop();
    if (ext === '.doc') {
      return 'Please convert your .doc file to .docx and try again.';
    }
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Unsupported file type. Please upload a .docx or .pdf file.`;
    }

    // Check MIME type (with fallback for some browsers)
    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
      // Some browsers may not set MIME type correctly, so we rely on extension check above
    }

    // Check size
    if (file.size > MAX_SIZE_BYTES) {
      return `File too large. Maximum size is ${MAX_SIZE_MB}MB.`;
    }

    return null;
  }, []);

  const handleFile = useCallback((file: File) => {
    setError(null);
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
    onFileSelect(file);
  }, [validateFile, onFileSelect]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, [disabled, handleFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  const handleClear = useCallback(() => {
    setSelectedFile(null);
    setError(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, []);

  const handleClick = useCallback(() => {
    if (!disabled) {
      inputRef.current?.click();
    }
  }, [disabled]);

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={handleClick}
        className={`relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          disabled
            ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
            : dragActive
            ? 'border-ce-teal bg-ce-teal/5'
            : 'border-ce-border hover:border-ce-teal hover:bg-ce-teal/5'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".docx,.pdf"
          onChange={handleChange}
          disabled={disabled}
          className="hidden"
        />

        <Upload className={`w-10 h-10 mx-auto mb-3 ${dragActive ? 'text-ce-teal' : 'text-ce-text-muted'}`} />

        <p className="text-sm font-medium text-ce-text">
          {dragActive ? 'Drop your file here' : 'Drag & drop your file here'}
        </p>
        <p className="mt-1 text-xs text-ce-text-muted">
          or click to browse
        </p>
        <p className="mt-3 text-xs text-ce-text-muted">
          Supports .docx and .pdf files up to {MAX_SIZE_MB}MB
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Selected file */}
      {selectedFile && !error && (
        <div className="flex items-center justify-between p-3 bg-ce-muted rounded-lg">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-5 h-5 text-ce-teal flex-shrink-0" />
            <span className="text-sm text-ce-text truncate">{selectedFile.name}</span>
            <span className="text-xs text-ce-text-muted flex-shrink-0">
              ({(selectedFile.size / 1024).toFixed(1)} KB)
            </span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
            className="p-1 text-ce-text-muted hover:text-ce-text transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
