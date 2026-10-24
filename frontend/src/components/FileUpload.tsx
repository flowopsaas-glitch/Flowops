import React, { useCallback, useRef, useState } from "react";
import { Upload, X, CheckCircle2, AlertCircle, Loader2, Image, FileText } from "lucide-react";
import { FLOWOPS_API_URL } from "../lib/env";

export interface UploadedFile {
  key: string;
  url: string;
  filename: string;
  size: number;
  mimeType: string;
}

export interface FileUploadProps {
  /** Upload category: pod, signature, document, waybill, customs, image */
  category?: string;
  /** Maximum number of files (default: 1) */
  maxFiles?: number;
  /** Maximum file size in MB (default: 10) */
  maxSizeMB?: number;
  /** Accepted MIME types (default: images + PDF) */
  accept?: string;
  /** Callback when upload succeeds */
  onUpload?: (files: UploadedFile[]) => void;
  /** Callback on error */
  onError?: (error: string) => void;
  /** Label text */
  label?: string;
  /** Show preview for images */
  showPreview?: boolean;
  /** Compact mode (smaller UI) */
  compact?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Custom class */
  className?: string;
}

type FileState = {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  result?: UploadedFile;
  error?: string;
};

export default function FileUpload({
  category = "document",
  maxFiles = 1,
  maxSizeMB = 10,
  accept = "image/jpeg,image/png,image/webp,application/pdf",
  onUpload,
  onError,
  label,
  showPreview = true,
  compact = false,
  disabled = false,
  className = "",
}: FileUploadProps) {
  const [files, setFiles] = useState<FileState[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const uploadFile = useCallback(async (file: File): Promise<UploadedFile> => {
    const formData = new FormData();
    formData.append("file", file);

    const token = localStorage.getItem("flowops.access_token") || "";
    const res = await fetch(
      `${FLOWOPS_API_URL}/uploads?category=${encodeURIComponent(category)}`,
      {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      },
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.message || `Upload failed (${res.status})`);
    }

    return res.json();
  }, [category]);

  const handleFiles = useCallback(async (selectedFiles: FileList | File[]) => {
    const newFiles: FileState[] = [];

    for (let i = 0; i < Math.min(selectedFiles.length, maxFiles - files.length); i++) {
      const f = selectedFiles[i];

      // Validate size
      if (f.size > maxSizeBytes) {
        const errorMsg = `${f.name} is too large (max ${maxSizeMB}MB)`;
        onError?.(errorMsg);
        newFiles.push({ file: f, status: "error", progress: 0, error: errorMsg });
        continue;
      }

      newFiles.push({ file: f, status: "pending", progress: 0 });
    }

    setFiles((prev) => [...prev, ...newFiles]);

    // Upload each file
    const results: UploadedFile[] = [];
    for (let i = 0; i < newFiles.length; i++) {
      if (newFiles[i].status === "error") continue;

      setFiles((prev) => prev.map((p, idx) =>
        idx === files.length + i ? { ...p, status: "uploading", progress: 50 } : p,
      ));

      try {
        const result = await uploadFile(newFiles[i].file);
        results.push(result);
        setFiles((prev) => prev.map((p, idx) =>
          idx === files.length + i ? { ...p, status: "done", progress: 100, result } : p,
        ));
      } catch (err) {
        const errorMsg = err.message || "Upload failed";
        onError?.(errorMsg);
        setFiles((prev) => prev.map((p, idx) =>
          idx === files.length + i ? { ...p, status: "error", progress: 0, error: errorMsg } : p,
        ));
      }
    }

    if (results.length > 0) {
      onUpload?.(results);
    }
  }, [files.length, maxFiles, maxSizeBytes, maxSizeMB, onError, onUpload, uploadFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    handleFiles(e.dataTransfer.files);
  }, [disabled, handleFiles]);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };


  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-2">
          {label}
        </label>
      )}

      {/* Drop zone */}
      {files.length < maxFiles && (
        <div
          onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => !disabled && inputRef.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (() => !disabled && inputRef.current?.click())(); } }} role="button" tabIndex={0}
          className={`
            relative cursor-pointer rounded-2xl border-2 border-dashed transition-all
            ${isDragging
              ? "border-sky-400 bg-sky-500/10"
              : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
            }
            ${disabled ? "opacity-50 cursor-not-allowed" : ""}
            ${compact ? "p-4" : "p-6"}
          `}
        >
          <div className={`flex flex-col items-center gap-2 text-center ${compact ? "gap-1" : "gap-3"}`}>
            <div className={`rounded-xl bg-white/5 border border-white/10 ${compact ? "p-2" : "p-3"}`}>
              <Upload className={`text-white/30 ${compact ? "h-4 w-4" : "h-5 w-5"}`} />
            </div>
            <div>
              <p className={`font-bold text-white/60 ${compact ? "text-xs" : "text-sm"}`}>
                {isDragging ? "Drop files here" : "Click or drag files"}
              </p>
              <p className="text-[10px] text-white/30 mt-0.5">
                Max {maxSizeMB}MB per file · {maxFiles > 1 ? `Up to ${maxFiles} files` : "Single file"}
              </p>
            </div>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple={maxFiles > 1}
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            className="hidden"
            disabled={disabled}
          />
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-3 space-y-2">
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
            >
              {/* Icon */}
              {f.file.type.startsWith("image/") && showPreview && f.status === "done" && f.result?.url ? (
                <img
                  src={f.result.url}
                  alt={f.file.name}
                  className="h-10 w-10 rounded-lg object-cover border border-white/10"
                />
              ) : f.file.type.startsWith("image/") ? (
                <div className="h-10 w-10 rounded-lg bg-sky-500/10 border border-sky-400/20 flex items-center justify-center">
                  <Image className="h-4 w-4 text-sky-300" />
                </div>
              ) : (
                <div className="h-10 w-10 rounded-lg bg-violet-500/10 border border-violet-400/20 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-violet-300" />
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white/80 truncate">{f.file.name}</p>
                <p className="text-[10px] text-white/30">
                  {(f.file.size / 1024).toFixed(0)} KB
                  {f.status === "error" && f.error && (
                    <span className="text-rose-400 ml-2">{f.error}</span>
                  )}
                </p>
                {f.status === "uploading" && (
                  <div className="mt-1 h-1 w-full rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-sky-400 rounded-full transition-all duration-500"
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Status */}
              {f.status === "uploading" && <Loader2 className="h-4 w-4 text-sky-400 animate-spin" />}
              {f.status === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
              {f.status === "error" && <AlertCircle className="h-4 w-4 text-rose-400" />}

              {/* Remove */}
              {(f.status === "done" || f.status === "error") && (
                <button
                  onClick={() => removeFile(i)}
                  className="p-1 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
