"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiErrorMessage } from "@/lib/api-error";
import { formatCents } from "@/lib/utils";
import { AllocationInvoice, allocationTotals, localDateValue, parsePaymentCents, PaymentAccount } from "@/lib/reconciliation-view";
import { CompanyPicker } from "./company-picker";
import { AllocationEditor } from "./allocation-editor";

export function NewPaymentDialog({ accounts, admin, onClose, onSaved }: {
  accounts: PaymentAccount[]; admin: boolean; onClose: () => void; onSaved: (message: string) => void;
}) {
  const [step, setStep] = useState<"receipt" | "allocation">("receipt");
  const [owner, setOwner] = useState("__ADMIN__");
  const [companies, setCompanies] = useState<string[]>([]);
  const [company, setCompany] = useState("");
  const [amount, setAmount] = useState("");
  const [receivedAt, setReceivedAt] = useState(localDateValue);
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [invoices, setInvoices] = useState<AllocationInvoice[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const amountCents = parsePaymentCents(amount);
  const totals = allocationTotals(invoices, amounts, amountCents ?? 0);
  const valid = Boolean(company && companies.includes(company) && amountCents && amountCents > 0 && receivedAt && method.trim());

  useEffect(() => {
    const abort = new AbortController();
    setLoadingCompanies(true);
    setError("");
    const params = new URLSearchParams();
    if (admin && owner !== "__ADMIN__") params.set("account", owner);
    void fetch(`/api/reconciliation?${params}`, { signal: abort.signal }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(payload, "公司列表加载失败"));
      if (!abort.signal.aborted) setCompanies(payload.bill_to_options);
    }).catch((cause) => {
      if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "公司列表加载失败");
    }).finally(() => { if (!abort.signal.aborted) setLoadingCompanies(false); });
    return () => abort.abort();
  }, [admin, owner]);

  const loadInvoices = useCallback(async () => {
    setLoadingInvoices(true);
    setError("");
    try {
      const params = new URLSearchParams({ bill_to: company });
      if (admin && owner !== "__ADMIN__") params.set("account", owner);
      const response = await fetch(`/api/reconciliation?${params}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(payload, "Invoice 加载失败"));
      setInvoices((payload.invoices as AllocationInvoice[]).filter((invoice) => invoice.case.bill_to_company?.trim().toLocaleLowerCase() === company.trim().toLocaleLowerCase()));
      setAmounts({});
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invoice 加载失败");
      return false;
    } finally {
      setLoadingInvoices(false);
    }
  }, [admin, company, owner]);

  const next = async () => {
    if (!valid || loadingInvoices || submitting.current) return;
    if (await loadInvoices()) setStep("allocation");
  };

  const save = async (allocate: boolean) => {
    if (submitting.current || !valid || uncertain || (allocate && (totals.invalid || totals.remaining < 0 || !totals.total))) return;
    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/reconciliation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bill_to_company: company, amount_cents: amountCents, received_at: receivedAt,
          payment_method: method.trim(), reference_number: reference.trim() || null, note: note.trim() || null,
          account: admin ? owner : null, allocations: allocate ? totals.selected : [] }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status >= 500) setUncertain(true);
        if (response.status === 409 && allocate) await loadInvoices();
        setError(apiErrorMessage(payload, "收款保存失败"));
        return;
      }
      onSaved(allocate
        ? `已登记 ${formatCents(amountCents!)}，已分配 ${formatCents(totals.total)}，待分配 ${formatCents(totals.remaining)}`
        : `已登记 ${formatCents(amountCents!)}，待分配。可在该收款记录中继续销账。`);
      onClose();
    } catch {
      setUncertain(true);
      setError("未能确认保存结果。请先查看收款记录，避免重复登记。");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  const close = () => { if (!submitting.current) { if (uncertain) onSaved("请核对最近的收款记录，确认是否已保存。"); onClose(); } };
  return <Dialog.Root open onOpenChange={(open) => { if (!open) close(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
      <Dialog.Content className={`fixed left-1/2 top-1/2 z-50 flex max-h-[92dvh] w-[calc(100%-24px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl ${step === "receipt" ? "max-w-2xl" : "max-w-6xl"}`} onInteractOutside={(event) => event.preventDefault()}>
        <div className="shrink-0 border-b px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3"><Dialog.Title className="text-lg font-bold">新增收款</Dialog.Title><Button variant="ghost" size="sm" aria-label="关闭新增收款" disabled={saving} onClick={close}><X className="size-4" /></Button></div>
          <Dialog.Description className="sr-only">选择收款公司并填写金额，可以只保存收款，或分配给 Invoice 后一起保存。</Dialog.Description>
          <ol className="mt-3 flex items-center gap-3 text-sm" aria-label="收款流程">
            <li aria-current={step === "receipt" ? "step" : undefined} className={`flex items-center gap-2 ${step === "receipt" ? "font-semibold text-primary" : "text-muted-foreground"}`}><span className="grid size-6 place-items-center rounded-full bg-primary/10 text-xs text-primary">{step === "allocation" ? <Check className="size-3.5" /> : "1"}</span>收款信息</li>
            <ArrowRight className="size-3.5 text-muted-foreground" />
            <li aria-current={step === "allocation" ? "step" : undefined} className={`flex items-center gap-2 ${step === "allocation" ? "font-semibold text-primary" : "text-muted-foreground"}`}><span className="grid size-6 place-items-center rounded-full bg-muted text-xs">2</span>分配 Invoice</li>
          </ol>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {error && <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
          {step === "receipt" ? <fieldset disabled={saving || loadingInvoices || uncertain} className="grid min-w-0 gap-4 sm:grid-cols-2">
            {admin && <div className="sm:col-span-2"><label className="mb-1.5 block text-xs font-medium text-muted-foreground">收款归属账号</label><Select value={owner} onValueChange={(value) => { setOwner(value); setCompany(""); setCompanies([]); setAmounts({}); }}><SelectTrigger aria-label="收款归属账号"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__ADMIN__">管理员（全局）</SelectItem>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent></Select></div>}
            <div className="sm:col-span-2"><label htmlFor="receipt-company" className="mb-1.5 block text-xs font-medium text-muted-foreground">Bill To 公司 *</label><CompanyPicker id="receipt-company" value={company} onChange={(value) => { setCompany(value); setAmounts({}); }} options={companies} disabled={loadingCompanies || saving} placeholder={loadingCompanies ? "正在加载公司…" : undefined} /></div>
            <div><label htmlFor="receipt-amount" className="mb-1.5 block text-xs font-medium text-muted-foreground">收款金额 USD *</label><Input id="receipt-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" aria-invalid={amountCents === null} />{amountCents === null && <p className="mt-1 text-xs text-destructive">请输入有效金额，最多两位小数</p>}</div>
            <div><span className="mb-1.5 block text-xs font-medium text-muted-foreground">收款日期 *</span><DatePicker value={receivedAt} onChange={setReceivedAt} ariaLabel="收款日期" /></div>
            <div><label htmlFor="receipt-method" className="mb-1.5 block text-xs font-medium text-muted-foreground">付款方式 *</label><Input id="receipt-method" value={method} onChange={(event) => setMethod(event.target.value)} placeholder="Check / ACH / Cash" maxLength={100} /></div>
            <div><label htmlFor="receipt-reference" className="mb-1.5 block text-xs font-medium text-muted-foreground">支票号 / 交易号</label><Input id="receipt-reference" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={200} /></div>
            <div className="sm:col-span-2"><label htmlFor="receipt-note" className="mb-1.5 block text-xs font-medium text-muted-foreground">备注</label><Input id="receipt-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} /></div>
          </fieldset> : <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/40 px-4 py-3"><div className="min-w-0"><p className="break-words font-semibold">{company}</p><p className="mt-1 text-xs text-muted-foreground">{receivedAt.replaceAll("-", "/")} · {method}{reference && ` · ${reference}`}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">本次收款</p><p className="mt-1 text-xl font-bold tabular-nums">{formatCents(amountCents!)}</p></div></div>
            <AllocationEditor invoices={invoices} amounts={amounts} onChange={setAmounts} available={amountCents ?? 0} disabled={saving || uncertain || loadingInvoices} />
          </>}
        </div>
        <div className={`shrink-0 space-y-3 border-t bg-muted/15 px-4 py-4 sm:px-6 ${step === "allocation" ? "lg:flex lg:items-center lg:justify-between lg:gap-5 lg:space-y-0" : ""}`}>
          {step === "allocation" && <div aria-live="polite" className="flex flex-wrap justify-between gap-x-5 gap-y-2 text-sm"><span>本次分配 <strong className="ml-2 tabular-nums">{formatCents(totals.total)}</strong></span><span>{totals.remaining < 0 ? "超出收款" : "分配后剩余"} <strong className={`ml-2 tabular-nums ${totals.remaining < 0 ? "text-destructive" : "text-primary"}`}>{formatCents(Math.abs(totals.remaining))}</strong></span></div>}
          {uncertain ? <Button className="w-full" variant="outline" onClick={close}>返回收款记录核对</Button> : <div className="flex flex-wrap justify-between gap-3">
            {step === "allocation" ? <Button variant="ghost" disabled={saving} onClick={() => { setStep("receipt"); setAmounts({}); setError(""); }}><ArrowLeft className="size-4" />上一步</Button> : <Button className="hidden sm:inline-flex" variant="ghost" disabled={saving || loadingInvoices} onClick={close}>取消</Button>}
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">{(step === "receipt" || !totals.total) && <Button className="w-full sm:w-auto" variant="outline" disabled={!valid || saving || loadingInvoices} onClick={() => void save(false)}>{saving ? "正在保存…" : step === "receipt" ? "保存收款，暂不销账" : "仅保存收款"}</Button>}
              {step === "receipt" ? <Button className="w-full sm:w-auto" disabled={!valid || saving || loadingInvoices || loadingCompanies} onClick={() => void next()}>{loadingInvoices ? <Loader2 className="size-4 animate-spin" /> : null}下一步：分配 Invoice<ArrowRight className="size-4" /></Button>
                : <Button className="w-full sm:w-auto" disabled={!valid || saving || uncertain || totals.invalid || totals.remaining < 0 || !totals.total} onClick={() => void save(true)}>{saving ? "正在保存…" : "确认收款并销账"}</Button>}
            </div>
          </div>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
