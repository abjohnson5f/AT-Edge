import { useState, useRef, useCallback } from "react";
import { Upload, CheckCircle2, Loader, X, ImageIcon } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

interface ScreenshotUploadProps {
  onUpload: (url: string) => void;
  currentUrl?: string;
}

export function ScreenshotUpload({ onUpload, currentUrl }: ScreenshotUploadProps) {
  const [preview, setPreview] = useState<string | null>(currentUrl?.startsWith("https://placehold") ? null : (currentUrl ?? null));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (JPEG, PNG, WebP)");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Image must be under 8 MB");
      return;
    }

    setError(null);
    setUploading(true);

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setPreview(dataUrl);

      try {
        const base64 = dataUrl.split(",")[1];
        const res = await fetch(`${API_BASE}/upload/screenshot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ data: base64, contentType: file.type }),
        });

        const data = await res.json();
        if (data.RequestStatus === "Succeeded") {
          onUpload(data.Payload.url);
        } else {
          setError(data.ResponseMessage ?? "Upload failed");
          setPreview(null);
        }
      } catch (err) {
        setError("Upload failed — check connection");
        setPreview(null);
      } finally {
        setUploading(false);
      }
    };
  }, [onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleClear = useCallback(() => {
    setPreview(null);
    setError(null);
    onUpload("");
    if (inputRef.current) inputRef.current.value = "";
  }, [onUpload]);

  const uploaded = preview && !preview.startsWith("blob:") && !uploading;

  return (
    <div className="screenshot-upload-wrapper">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        style={{ display: "none" }}
      />

      {preview ? (
        <div className="screenshot-preview">
          <img src={preview} alt="Confirmation screenshot" className="screenshot-img" />
          <div className="screenshot-overlay">
            {uploading ? (
              <div className="screenshot-status uploading">
                <Loader size={16} className="spinning" />
                <span>Uploading...</span>
              </div>
            ) : (
              <div className="screenshot-status uploaded">
                <CheckCircle2 size={16} />
                <span>Screenshot ready</span>
              </div>
            )}
            <button
              type="button"
              className="screenshot-clear"
              onClick={handleClear}
              title="Remove"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`screenshot-dropzone ${dragOver ? "dragover" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          {dragOver ? (
            <><Upload size={20} className="screenshot-icon" /><span>Drop to upload</span></>
          ) : (
            <>
              <ImageIcon size={20} className="screenshot-icon" />
              <span className="screenshot-prompt">Drag & drop or <u>click to upload</u></span>
              <span className="screenshot-hint">JPEG, PNG, WebP · max 8 MB</span>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="screenshot-error">{error}</div>
      )}
    </div>
  );
}
