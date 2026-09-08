"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_SOURCE_SIZE = 10 * 1024 * 1024;
const MAX_DIMENSION = 900;

async function resizeImage(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("请选择 JPG、PNG 或 WebP 图片");
  if (file.size > MAX_SOURCE_SIZE) throw new Error("原图不能超过 10 MB");
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("图片格式无法识别"));
    element.src = source;
  });
  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  const result = canvas.toDataURL("image/webp", 0.78);
  if (result.length > 1_000_000) throw new Error("压缩后的图片仍然过大，请选择更小的图片");
  return result;
}

export function InventoryImageInput({ value, onChange, disabled = false }: { value: string | null; onChange: (value: string | null) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const selectFile = async (file?: File) => {
    if (!file) return;
    setError("");
    try { onChange(await resizeImage(file)); }
    catch (imageError) { setError(imageError instanceof Error ? imageError.message : "图片处理失败"); }
  };
  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-muted-foreground">SKU 图片（可选）</label>
      <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
          {value ? <img src={value} alt="SKU 图片预览" className="h-full w-full object-cover" /> : <ImagePlus className="size-6 text-muted-foreground" />}
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={inputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={(event) => { void selectFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          <input ref={cameraInputRef} className="hidden" type="file" accept="image/*" capture="environment" disabled={disabled} onChange={(event) => { void selectFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          <Button type="button" variant="outline" disabled={disabled} onClick={() => cameraInputRef.current?.click()}><Camera className="mr-2 size-4" />拍照</Button>
          <Button type="button" variant="outline" disabled={disabled} onClick={() => inputRef.current?.click()}><ImagePlus className="mr-2 size-4" />{value ? "更换图片" : "上传图片"}</Button>
          {value && <Button type="button" variant="outline" disabled={disabled} onClick={() => onChange(null)}><Trash2 className="mr-2 size-4" />移除</Button>}
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
