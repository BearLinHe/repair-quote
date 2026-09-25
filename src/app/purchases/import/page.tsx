"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, CheckCircle2, FileScan, Loader2, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiErrorMessage } from "@/lib/api-error";
import { formatCents } from "@/lib/utils";
import { preparePurchasePhoto } from "@/lib/purchase-photo";
import { moneyCents, reviewedInvoiceSchema, validateReviewedInvoice, type ExtractedInvoice, type ImportInventoryItem, type ReviewedInvoice } from "@/lib/purchase-import";

type History = { id: string; file_name: string; created_at: string; status: string; clerk_user_id: string; purchase_order_id: string | null };
type Options = { configured: boolean; canWrite: boolean; owners: { id: string; name: string }[]; imports: History[] };
type DraftLine = Omit<ReviewedInvoice["lines"][number], "qty" | "kind"> & { qty: string; kind: "PART" | "CORE" | "FEE" | "UNKNOWN"; warning?: string; match?: string };
type Draft = Omit<ReviewedInvoice, "lines" | "confirmed" | "currency"> & { currency: string; confirmed: boolean; lines: DraftLine[] };
type Source = { id: string; status: string; clerk_user_id: string; file_name: string; image_data_url: string; extracted: ExtractedInvoice | null; reviewed: ReviewedInvoice | null; purchase_order_id: string | null };
const selectClass = "h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiErrorMessage(data, "操作失败，请重试"));
  return data as T;
}

function SkuPicker({ line, items, onChange }: { line: DraftLine; items: ImportInventoryItem[]; onChange: (patch: Partial<DraftLine>) => void }) {
  const [query, setQuery] = useState("");
  const term = query.trim().toLocaleLowerCase();
  const matches = items.filter((item) => item.id === line.inventory_item_id || `${item.sku} ${item.name}`.toLocaleLowerCase().includes(term));
  return <div className="space-y-2 rounded-xl bg-primary/5 p-3">
    <p className="text-xs font-semibold">对应库存 SKU <span className="font-normal text-muted-foreground">· 仅匹配当前所属账号</span></p>
    <Input aria-label="搜索库存 SKU 或名称" placeholder="搜索 SKU 或零件名称" value={query} onChange={(e) => setQuery(e.target.value)} />
    <select aria-label="选择已有库存零件或新建 SKU" className={selectClass} value={line.inventory_item_id ?? ""} onChange={(e) => onChange({ inventory_item_id: e.target.value || null, match: undefined })}>
      <option value="">新建 SKU（保存草稿时创建）</option>
      {matches.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}
    </select>
    {line.inventory_item_id ? <p className="text-xs text-primary">{line.match || "已选择已有库存零件"}，请核对型号。</p> : <div className="grid grid-cols-[1fr_100px] gap-2">
      <Input aria-label="新 SKU 编号" placeholder="填写新 SKU，必填" maxLength={50} value={line.new_sku} onChange={(e) => onChange({ new_sku: e.target.value })} />
      <Input aria-label="库存单位" placeholder="单位" value={line.unit} onChange={(e) => onChange({ unit: e.target.value })} />
    </div>}
  </div>;
}

export default function PurchaseImportPage() {
  const [options, setOptions] = useState<Options | null>(null);
  const [owner, setOwner] = useState("");
  const [image, setImage] = useState("");
  const [fileName, setFileName] = useState("");
  const [source, setSource] = useState<Source | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [items, setItems] = useState<ImportInventoryItem[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ id: string; purchase_number?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function loadOptions() {
    const result = await api<Options>("/api/purchases/imports");
    setOptions(result);
    if (result.owners.length === 1) setOwner(result.owners[0].id);
  }
  async function openImport(id: string) {
    setBusy("加载识别记录…"); setError("");
    try {
      const result = await api<{ source: Source; items: ImportInventoryItem[]; suggestions: ({ id: string; reason: string } | null)[] }>(`/api/purchases/imports/${id}`);
      setSource(result.source); setItems(result.items); setImage(result.source.image_data_url); setFileName(result.source.file_name); setOwner(result.source.clerk_user_id);
      setSaved(result.source.purchase_order_id ? { id: result.source.purchase_order_id } : null);
      const extract = result.source.extracted;
      const reviewed = result.source.reviewed;
      if (reviewed) setDraft({ ...reviewed, lines: reviewed.lines.map((line) => ({ ...line, qty: String(line.qty) })) });
      else if (extract) setDraft({
        supplier: extract.supplier ?? "", invoice_number: extract.invoice_number ?? "", invoice_date: extract.invoice_date ?? "", currency: extract.currency ?? "",
        subtotal: extract.subtotal ?? "", tax: extract.tax ?? "", shipping: extract.shipping ?? "", surcharge: extract.surcharge ?? "", total: extract.total ?? "", notes: "", confirmed: false,
        lines: extract.lines.map((line, index) => ({
          item_number: line.item_number ?? "", description: line.description ?? "", qty: line.shipped_qty === null ? "" : String(line.shipped_qty),
          unit_price: line.unit_price ?? "", line_amount: line.line_amount ?? "", kind: /(?:^|[-\s])CORE\b/i.test(line.item_number ?? "") ? "CORE" : line.kind,
          inventory_item_id: result.suggestions[index]?.id ?? null, new_sku: (line.item_number ?? "").length <= 50 ? line.item_number ?? "" : "", unit: "个",
          warning: [line.warning, line.backordered_qty ? `B/O 欠货 ${line.backordered_qty}：本次不能入库` : ""].filter(Boolean).join("；"), match: result.suggestions[index]?.reason,
        })),
      });
      else { setDraft(null); setError(result.source.status === "PROCESSING" ? "这张单据仍在识别中，请稍后刷新记录" : "上次识别失败，可以重新点击开始识别"); }
      window.history.replaceState(null, "", `/purchases/import?id=${id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "加载失败"); }
    finally { setBusy(""); }
  }
  useEffect(() => {
    void loadOptions().catch((e) => setError(e.message));
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) void openImport(id);
  }, []);
  useEffect(() => {
    if (!draft || saved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft, saved]);

  async function choosePhoto(file?: File) {
    if (!file) return;
    setBusy("处理照片…"); setError("");
    try { setImage(await preparePurchasePhoto(file)); setFileName(file.name.slice(0, 200)); setSource(null); setDraft(null); setSaved(null); }
    catch (e) { setError(e instanceof Error ? e.message : "图片处理失败"); }
    finally { setBusy(""); }
  }
  async function recognize() {
    setBusy("正在识别单据，请稍候…"); setError("");
    try {
      const result = await api<{ id: string }>("/api/purchases/imports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner_id: owner, file_name: fileName, image_data_url: image }) });
      await openImport(result.id); await loadOptions();
    } catch (e) { setError(e instanceof Error ? e.message : "识别失败"); }
    finally { setBusy(""); }
  }
  const patch = (value: Partial<Draft>) => setDraft((old) => old ? {
    ...old, ...value, confirmed: false,
    ...(value.supplier !== undefined && value.supplier !== old.supplier ? { lines: old.lines.map((line) => line.match === "历史确认的供应商编号" ? { ...line, inventory_item_id: null, match: undefined } : line) } : {}),
  } : old);
  const patchLine = (index: number, value: Partial<DraftLine>) => draft && patch({ lines: draft.lines.map((line, i) => i === index ? { ...line, ...value } : line) });
  const payload = draft ? { ...draft, lines: draft.lines.map((line) => ({ ...line, qty: line.qty.trim() === "" ? NaN : Number(line.qty) })) } : null;
  const parsed = reviewedInvoiceSchema.safeParse({ ...payload, confirmed: true });
  const issues = draft ? parsed.success ? validateReviewedInvoice(parsed.data) : ["请补全必填字段，金额最多两位小数，数量为非负整数；未知行请先选择分类。仅支持 USD。"] : [];
  const partsAmount = draft?.lines.filter((line) => line.kind === "PART").reduce((sum, line) => sum + (moneyCents(line.line_amount) ?? 0), 0) ?? 0;
  const newSkuCount = new Set(draft?.lines.filter((line) => line.kind === "PART" && Number(line.qty) > 0 && !line.inventory_item_id).map((line) => line.new_sku)).size;

  async function save() {
    if (!source || !parsed.success || !draft?.confirmed || issues.length) return;
    setBusy("保存已核对的采购草稿…"); setError("");
    try {
      const result = await api<{ order: { id: string; purchase_number: string } }>(`/api/purchases/imports/${source.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...parsed.data, confirmed: true }) });
      setSaved(result.order); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); }
    finally { setBusy(""); }
  }

  return <div className="page-shell space-y-5">
    <Link href="/purchases" className="inline-flex items-center gap-2 text-sm text-primary"><ArrowLeft className="size-4" />返回采购入库</Link>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="section-eyebrow">AI ASSISTED RECEIVING</p><h1 className="mt-2 text-2xl font-bold sm:text-3xl">拍单入库</h1><p className="mt-2 text-sm text-muted-foreground">1 上传单据 → 2 核对零件与金额 → 3 保存草稿 → 4 确认入库</p></div>
      {draft && <Button variant="outline" disabled={Boolean(busy)} onClick={() => { if (!saved && !window.confirm("离开核对？尚未保存的修改将丢失，识别原始结果会保留。")) return; setDraft(null); setSource(null); setImage(""); setSaved(null); setError(""); window.history.replaceState(null, "", "/purchases/import"); void loadOptions().catch(() => {}); }}>识别另一张单据</Button>}
    </header>
    {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}
    {busy && <div role="status" className="flex items-center gap-2 rounded-xl bg-primary/10 p-4 text-sm text-primary"><Loader2 className="size-4 animate-spin" />{busy}</div>}
    {options && !options.configured && <p role="alert" className="rounded-xl border p-4 text-sm">当前环境尚未配置 OpenAI 密钥；请由管理员在服务端设置 OPENAI_API_KEY。</p>}
    {saved && <section className="rounded-2xl border border-primary/30 bg-primary/5 p-5"><h2 className="flex items-center gap-2 text-lg font-bold"><CheckCircle2 className="size-5 text-primary" />已生成采购单{saved.purchase_number ? ` · ${saved.purchase_number}` : ""}</h2><p className="mt-2 text-sm">保存草稿不会增加库存。请到采购记录查看当前状态；若仍为草稿，核对实物后点击「确认入库」。税费、运费和 CORE 单独计入附加费用，不进入零件平均成本。</p><Link className={buttonVariants({ className: "mt-4" })} href={`/purchases?order=${saved.id}`}>查看采购单 / 确认入库</Link></section>}
    {!draft && <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <section className="surface-panel space-y-4 p-5 sm:p-6">
        <h2 className="text-lg font-bold">上传供应商单据</h2>
        <label className="block space-y-2 text-sm"><span>库存所属账号 *</span><select className={selectClass} value={owner} disabled={Boolean(busy)} onChange={(e) => { setOwner(e.target.value); setSource(null); }}><option value="">请选择入库账号</option>{options?.owners.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
        <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-6 text-center">
          <FileScan className="mx-auto size-9 text-primary" /><p className="mt-3 font-semibold">拍清整张单据，尤其是零件编号、数量和金额</p><p className="mt-2 text-xs text-muted-foreground">单页 JPG / PNG / WebP，原图最大 40 MB；上传前自动压缩并保留单据副本。</p>
          <input className="hidden" ref={fileRef} type="file" accept="image/*" onChange={(e) => { void choosePhoto(e.target.files?.[0]); e.target.value = ""; }} />
          <input className="hidden" ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={(e) => { void choosePhoto(e.target.files?.[0]); e.target.value = ""; }} />
          <div className="mt-4 flex flex-wrap justify-center gap-3"><Button variant="outline" disabled={Boolean(busy) || !options?.canWrite} onClick={() => cameraRef.current?.click()}><Camera className="mr-2 size-4" />手机拍照</Button><Button variant="outline" disabled={Boolean(busy) || !options?.canWrite} onClick={() => fileRef.current?.click()}><Upload className="mr-2 size-4" />选择图片</Button></div>
        </div>
        {image && <div className="space-y-2"><p className="break-all text-xs text-muted-foreground">{fileName}</p><img src={image} alt="待识别的供应商单据" className="mx-auto max-h-[420px] rounded-xl border object-contain" /></div>}
        <p className="text-xs leading-relaxed text-muted-foreground">点击开始识别会将单据图片发送至 OpenAI。AI 可能读错，不会自动入库。请核对实收数量；欠货、退货、外币及多页单据暂请手工处理。</p>
        <Button className="w-full" disabled={!image || !owner || Boolean(busy) || !options?.configured || !options.canWrite} onClick={recognize}><FileScan className="mr-2 size-4" />开始识别</Button>
      </section>
      <section className="surface-panel self-start p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-bold">最近识别记录</h2><Button size="sm" variant="ghost" aria-label="刷新识别记录" onClick={() => void loadOptions().catch((e) => setError(e.message))}><RefreshCw className="size-4" /></Button></div><p className="mb-3 text-xs text-muted-foreground">未保存的识别结果可以重新打开核对。字段修改仅在保存草稿后留档。</p><div className="divide-y">{options?.imports.map((record) => <button key={record.id} className="w-full py-3 text-left hover:text-primary disabled:opacity-50" disabled={Boolean(busy)} onClick={() => void openImport(record.id)}><p className="truncate text-sm font-medium">{record.file_name}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(record.created_at).toLocaleDateString("zh-CN")} · {({ READY: "待核对", SAVED: "已建单", FAILED: "识别失败，可重试", PROCESSING: "识别中" })[record.status] ?? record.status}</p></button>)}{options?.imports.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">暂无识别记录</p>}</div></section>
    </div>}
    {draft && <div className="grid items-start gap-5 xl:grid-cols-[minmax(300px,0.75fr)_minmax(0,1.25fr)]">
      <details open className="surface-panel overflow-hidden xl:sticky xl:top-24"><summary className="cursor-pointer border-b p-4 text-sm font-semibold">单据副本 · 点击展开 / 收起</summary><div className="max-h-[65vh] overflow-auto bg-white p-2"><img src={image} alt="原始供应商单据，用于逐项核对" className="w-full" /></div><div className="p-3 text-xs text-muted-foreground">已按单据文字可读性压缩。<a className="ml-2 text-primary underline" href={image} download="purchase-document.jpg">下载副本放大查看</a></div></details>
      <div className="space-y-4">
        {source?.extracted?.warnings.length ? <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm"><p className="font-semibold">识别提醒 · 请核对</p><ul className="mt-2 list-disc space-y-1 pl-5">{source.extracted.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></div> : null}
        <fieldset disabled={Boolean(busy) || Boolean(saved) || !options?.canWrite} className="min-w-0 space-y-4 disabled:opacity-80">
          <section className="surface-panel p-4 sm:p-5"><h2 className="mb-4 font-bold">单据信息 <span className="text-xs font-normal text-muted-foreground">· {options?.owners.find((item) => item.id === owner)?.name}</span></h2><div className="grid gap-3 sm:grid-cols-2">
            {([['supplier', '供应商 *'], ['invoice_number', '供应商 Invoice 编号 *'], ['invoice_date', '单据日期 *'], ['currency', '币种 *']] as const).map(([key, label]) => <label key={key} className="space-y-1 text-xs text-muted-foreground"><span>{label}</span><Input type={key === "invoice_date" ? "date" : "text"} value={draft[key]} onChange={(e) => patch({ [key]: e.target.value })} /></label>)}
          </div></section>
          <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="font-bold">逐项核对 <span className="text-sm font-normal text-muted-foreground">{draft.lines.length} 行</span></h2><span className="text-xs text-muted-foreground">{newSkuCount} 个待新建 SKU</span></div>
            {draft.lines.map((line, index) => <article key={index} className="surface-panel space-y-3 p-4">
              <div className="flex items-center gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold">{index + 1}</span><select aria-label={`第 ${index + 1} 行分类`} className={selectClass} value={line.kind} onChange={(e) => patchLine(index, { kind: e.target.value as DraftLine["kind"] })}><option value="UNKNOWN">待确认分类</option><option value="PART">零件 · 增加库存</option><option value="CORE">CORE / 押金 · 不入库存</option><option value="FEE">其他费用 · 不入库存</option></select><Button size="icon" variant="ghost" aria-label={`删除第 ${index + 1} 行`} onClick={() => patch({ lines: draft.lines.filter((_, i) => i !== index) })}><Trash2 className="size-4" /></Button></div>
              {line.warning && <p className="text-xs text-amber-700 dark:text-amber-300">{line.warning}</p>}
              <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-xs text-muted-foreground"><span>供应商完整编号</span><Input value={line.item_number} onChange={(e) => patchLine(index, { item_number: e.target.value, inventory_item_id: null, match: undefined })} /></label><label className="space-y-1 text-xs text-muted-foreground"><span>零件 / 费用名称 *</span><Input value={line.description} onChange={(e) => patchLine(index, { description: e.target.value })} /></label></div>
              <div className="grid grid-cols-3 gap-2">{([['qty', '数量（核对实收）'], ['unit_price', '实际单价 $'], ['line_amount', '行金额 $']] as const).map(([key, label]) => <label key={key} className="space-y-1 text-xs text-muted-foreground"><span>{label}</span><Input inputMode={key === "qty" ? "numeric" : "decimal"} value={line[key]} onChange={(e) => patchLine(index, { [key]: e.target.value })} /></label>)}</div>
              {line.kind === "PART" && Number(line.qty) > 0 ? <SkuPicker line={line} items={items} onChange={(value) => patchLine(index, value)} /> : <p className="rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">此行不增加库存数量。</p>}
            </article>)}
            <Button variant="outline" className="w-full" onClick={() => patch({ lines: [...draft.lines, { item_number: "", description: "", qty: "1", unit_price: "", line_amount: "", kind: "PART", inventory_item_id: null, new_sku: "", unit: "个" }] })}><Plus className="mr-2 size-4" />补充漏识别行</Button>
          </section>
          <section className="surface-panel space-y-4 p-4 sm:p-5"><h2 className="font-bold">金额复核</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{([['subtotal', '单据小计（含 CORE）'], ['tax', '税费'], ['shipping', '运费'], ['surcharge', '其他附加费用'], ['total', '单据总额']] as const).map(([key, label]) => <label key={key} className="space-y-1 text-xs text-muted-foreground"><span>{label} $</span><Input inputMode="decimal" value={draft[key]} onChange={(e) => patch({ [key]: e.target.value })} /></label>)}</div><label className="block space-y-1 text-xs text-muted-foreground"><span>备注</span><Input value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} /></label><p className="text-xs leading-relaxed text-muted-foreground">零件金额 {formatCents(partsAmount)}。CORE、税费、运费和其他费用会留档并计入采购总额，但不会摊入库存平均成本。单据有欠货、退货或实收差异时，请先与供应商核实，勿强行改金额使其相等。</p></section>
        </fieldset>
        {!saved && <section className="surface-panel space-y-3 p-4 sm:p-5">
          {issues.length ? <div role="status" className="space-y-1 text-sm text-amber-700 dark:text-amber-300">{issues.slice(0, 8).map((issue, i) => <p key={i}>{issue}</p>)}</div> : <p className="flex items-center gap-2 text-sm text-primary"><CheckCircle2 className="size-4" />金额核对通过</p>}
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed"><input className="mt-1 size-4 shrink-0 accent-primary" type="checkbox" checked={draft.confirmed} disabled={Boolean(busy) || !options?.canWrite} onChange={(e) => setDraft({ ...draft, confirmed: e.target.checked })} /><span>我已对照单据核对 SKU、数量、实收、价格和费用分类；确认新增的 SKU 无重复。</span></label>
          <Button className="min-h-12 w-full" disabled={Boolean(busy) || !draft.confirmed || Boolean(issues.length) || !options?.canWrite} onClick={save}>保存采购草稿（不增加库存）</Button>
        </section>}
      </div>
    </div>}
  </div>;
}
