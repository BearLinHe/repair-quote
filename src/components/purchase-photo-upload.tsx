"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { Camera, FileScan, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPurchasePhotoSelection } from "@/lib/purchase-photo";
import { cn } from "@/lib/utils";

type Props = {
  disabled: boolean;
  onFile: (file: File) => void;
  onError: (message: string) => void;
};

function hasFiles(transfer: DataTransfer | null) {
  return Boolean(transfer && Array.from(transfer.types).includes("Files"));
}

export function PurchasePhotoUpload({ disabled, onFile, onError }: Props) {
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  function resetDrag() {
    dragDepth.current = 0;
    setDragging(false);
  }

  useEffect(() => {
    // Dropping outside the target must not navigate away from an unsaved invoice.
    const preventFileNavigation = (event: globalThis.DragEvent) => {
      if (hasFiles(event.dataTransfer)) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
      }
      if (event.type === "drop") resetDrag();
    };
    window.addEventListener("dragover", preventFileNavigation);
    window.addEventListener("drop", preventFileNavigation);
    window.addEventListener("dragend", resetDrag);
    window.addEventListener("blur", resetDrag);
    return () => {
      window.removeEventListener("dragover", preventFileNavigation);
      window.removeEventListener("drop", preventFileNavigation);
      window.removeEventListener("dragend", resetDrag);
      window.removeEventListener("blur", resetDrag);
    };
  }, []);

  function selectFiles(files: FileList | null) {
    if (disabled || !files?.length) return;
    try { onFile(getPurchasePhotoSelection(files)); }
    catch (error) { onError(error instanceof Error ? error.message : "无法读取图片，请重新选择"); }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    resetDrag();
    if (disabled || !hasFiles(event.dataTransfer)) return;
    if (!event.dataTransfer.files.length) {
      onError("请拖入一张图片文件，不支持文件夹或网页链接");
      return;
    }
    selectFiles(event.dataTransfer.files);
  }

  return <div
    role="group"
    aria-label="单据图片上传区域"
    aria-disabled={disabled}
    data-dragging={dragging && !disabled}
    className={cn("rounded-2xl border-2 border-dashed p-6 text-center transition-colors", dragging && !disabled ? "border-primary bg-primary/15 ring-4 ring-primary/10" : "border-primary/30 bg-primary/5")}
    onDragEnter={(event) => {
      if (!hasFiles(event.dataTransfer)) return;
      event.preventDefault(); event.stopPropagation();
      dragDepth.current += 1;
      if (!disabled) setDragging(true);
    }}
    onDragOver={(event) => {
      if (!hasFiles(event.dataTransfer)) return;
      event.preventDefault(); event.stopPropagation();
      event.dataTransfer.dropEffect = disabled ? "none" : "copy";
    }}
    onDragLeave={(event) => {
      event.preventDefault(); event.stopPropagation();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    }}
    onDrop={handleDrop}
  >
    <FileScan aria-hidden="true" className="mx-auto size-9 text-primary" />
    <p aria-live="polite" className="mt-3 font-semibold">{dragging && !disabled ? "松开鼠标，添加这张单据" : "将单据图片拖到这里"}</p>
    <p className="mt-2 text-sm text-muted-foreground">拍清整张单据，尤其是零件编号、数量和金额</p>
    <p className="mt-2 text-xs text-muted-foreground">每次一张 JPG / PNG / WebP，原图最大 40 MB；上传前自动压缩并保留单据副本。</p>
    <input className="hidden" aria-label="选择单据图片" ref={fileRef} disabled={disabled} type="file" accept="image/*" onChange={(event) => { selectFiles(event.target.files); event.target.value = ""; }} />
    <input className="hidden" aria-label="拍摄单据图片" ref={cameraRef} disabled={disabled} type="file" accept="image/*" capture="environment" onChange={(event) => { selectFiles(event.target.files); event.target.value = ""; }} />
    <div className="mt-4 flex flex-wrap justify-center gap-3">
      <Button type="button" variant="outline" disabled={disabled} onClick={() => cameraRef.current?.click()}><Camera className="mr-2 size-4" />手机拍照</Button>
      <Button type="button" variant="outline" disabled={disabled} onClick={() => fileRef.current?.click()}><Upload className="mr-2 size-4" />选择图片</Button>
    </div>
  </div>;
}
