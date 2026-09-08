"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_SOURCE_SIZE = 40 * 1024 * 1024;
const MAX_ENCODED_LENGTH = 2_500_000;
const MAX_DIMENSION = 1400;

async function resizeImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("请选择图片文件");
  if (file.size > MAX_SOURCE_SIZE) throw new Error("原图不能超过 40 MB");
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
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法处理图片");
  for (const [dimension, quality] of [[1400, 0.82], [1200, 0.72], [1000, 0.62], [800, 0.52]] as const) {
    const limit = Math.min(MAX_DIMENSION, dimension);
    const scale = Math.min(1, limit / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/webp", quality);
    if (result.length <= MAX_ENCODED_LENGTH) return result;
  }
  throw new Error("照片处理失败，请重新拍摄或选择其他图片");
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
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-3 sm:flex-row sm:items-center">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
          {value ? <img src={value} alt="SKU 图片预览" className="h-full w-full object-cover" /> : <ImagePlus className="size-6 text-muted-foreground" />}
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <input ref={inputRef} className="hidden" type="file" accept="image/*" disabled={disabled} onChange={(event) => { void selectFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          <input ref={cameraInputRef} className="hidden" type="file" accept="image/*" capture="environment" disabled={disabled} onChange={(event) => { void selectFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          <Button type="button" variant="outline" disabled={disabled} onClick={() => cameraInputRef.current?.click()}><Camera className="mr-2 size-4" />拍照</Button>
          <Button type="button" variant="outline" disabled={disabled} onClick={() => inputRef.current?.click()}><ImagePlus className="mr-2 size-4" />{value ? "更换图片" : "上传图片"}</Button>
          {value && <Button type="button" variant="outline" className="col-span-2 sm:col-span-1" disabled={disabled} onClick={() => onChange(null)}><Trash2 className="mr-2 size-4" />移除</Button>}
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
