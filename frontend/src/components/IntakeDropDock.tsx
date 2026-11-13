import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileImage, Plus, X } from "lucide-react";
import type { WorkspaceImage } from "../types/toolkit";

interface IntakeDropDockProps {
  images: WorkspaceImage[];
  selectedId: string;
  onSelect: (id: string) => void;
  onFilesAdded: (files: FileList | File[]) => void;
  onRemoveImage: (id: string) => void;
}

export function IntakeDropDock({
  images,
  selectedId,
  onSelect,
  onFilesAdded,
  onRemoveImage,
}: IntakeDropDockProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const activeIndex = Math.max(
    0,
    images.findIndex((image) => image.id === selectedId),
  );
  const selectIndex = (index: number) => {
    if (images[index]) onSelect(images[index].id);
  };
  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);
    if (event.dataTransfer.files.length) onFilesAdded(event.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDraggingOver(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDraggingOver(false);
      }}
      onDrop={handleDrop}
      className={`flex min-h-16 items-center justify-between gap-3 rounded-2xl border px-3 py-2 transition ${isDraggingOver ? "border-[var(--accent-brand)] bg-[var(--accent-brand)]/5 ring-2 ring-[var(--accent-brand)]/20" : "border-[var(--border-subtle)] bg-[var(--bg-surface)]"}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        data-testid="dock-file-input"
        onChange={(event) => {
          if (event.target.files?.length) onFilesAdded(event.target.files);
          event.currentTarget.value = "";
        }}
      />
      <div className="flex min-w-0 items-center gap-2.5 overflow-x-auto py-0.5">
        <div className="inline-flex shrink-0 items-center rounded-xl bg-[var(--bg-subtle)] p-0.5">
          <button
            type="button"
            disabled={images.length <= 1}
            onClick={() => selectIndex((activeIndex - 1 + images.length) % images.length)}
            className="rounded-lg p-1.5 text-[var(--fg-primary)] transition hover:bg-[var(--bg-surface)] disabled:opacity-35"
            title="Previous image"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="px-2.5 font-mono text-xs font-medium text-[var(--fg-secondary)]">
            {images.length ? `${activeIndex + 1} / ${images.length}` : "0 / 0"}
          </span>
          <button
            type="button"
            disabled={images.length <= 1}
            onClick={() => selectIndex((activeIndex + 1) % images.length)}
            className="rounded-lg p-1.5 text-[var(--fg-primary)] transition hover:bg-[var(--bg-surface)] disabled:opacity-35"
            title="Next image"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="h-5 w-px shrink-0 bg-[var(--border-subtle)]" />
        <div className="flex items-center gap-2">
          {images.map((image) => (
            <div
              key={image.id}
              className={`group relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border-2 transition ${image.id === selectedId ? "scale-105 border-[var(--fg-primary)] shadow-sm" : "border-transparent opacity-65 hover:opacity-100"}`}
              title={image.name}
            >
              <button
                type="button"
                onClick={() => onSelect(image.id)}
                className="absolute inset-0 z-0 grid place-items-center bg-[var(--bg-subtle)]"
                aria-label={`Select ${image.name}`}
              >
                {image.width ? (
                  <img src={image.previewUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <FileImage size={18} className="text-[var(--fg-muted)]" />
                )}
              </button>
              <button
                type="button"
                onClick={() => onRemoveImage(image.id)}
                className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/60 text-white opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100 focus:pointer-events-auto focus:opacity-100"
                aria-label={`Remove ${image.name}`}
                title="Remove image"
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
        {images.length === 0 && (
          <span className="text-sm text-[var(--fg-muted)]">No images added yet</span>
        )}
      </div>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--bg-subtle)] px-3.5 py-2 text-xs font-medium text-[var(--fg-primary)] transition hover:bg-[var(--border-subtle)]"
      >
        <Plus size={14} /> Add photos
      </button>
    </div>
  );
}
