import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/** 常用维修/配件中英对照，PDF 中显示英文；按长度降序避免短词先匹配 */
const ZH_TO_EN: Record<string, string> = {
  "更换机油": "Replace engine oil",
  "更换机油滤清器": "Replace oil filter",
  "更换空气滤清器": "Replace air filter",
  "更换空调滤清器": "Replace cabin filter",
  "更换刹车片": "Replace brake pads",
  "更换刹车盘": "Replace brake discs",
  "更换刹车油": "Replace brake fluid",
  "更换火花塞": "Replace spark plugs",
  "更换轮胎": "Replace tires",
  "四轮定位": "Wheel alignment",
  "动平衡": "Wheel balance",
  "更换雨刮": "Replace wipers",
  "更换雨刮片": "Replace wiper blades",
  "更换蓄电池": "Replace battery",
  "更换电瓶": "Replace battery",
  "更换正时皮带": "Replace timing belt",
  "更换防冻液": "Replace coolant",
  "更换变速箱油": "Replace transmission fluid",
  "清洗节气门": "Clean throttle body",
  "清洗喷油嘴": "Clean fuel injectors",
  "发动机保养": "Engine maintenance",
  "常规保养": "Regular maintenance",
  "小保养": "Minor service",
  "大保养": "Major service",
  "刹车片": "Brake pads",
  "刹车盘": "Brake discs",
  "刹车油": "Brake fluid",
  "机油": "Engine oil",
  "机油滤清器": "Oil filter",
  "空气滤清器": "Air filter",
  "空调滤清器": "Cabin filter",
  "火花塞": "Spark plugs",
  "轮胎": "Tires",
  "雨刮": "Wipers",
  "雨刮片": "Wiper blades",
  "蓄电池": "Battery",
  "电瓶": "Battery",
  "正时皮带": "Timing belt",
  "防冻液": "Coolant",
  "变速箱油": "Transmission fluid",
  "节气门": "Throttle body",
  "喷油嘴": "Fuel injectors",
  "发动机": "Engine",
  "变速箱": "Transmission",
  "底盘": "Chassis",
  "钣金": "Body repair",
  "喷漆": "Paint",
  "补漆": "Touch-up paint",
  "玻璃": "Glass",
  "前挡": "Windshield",
  "后挡": "Rear window",
  "车门": "Door",
  "保险杠": "Bumper",
  "大灯": "Headlight",
  "尾灯": "Taillight",
  "雾灯": "Fog light",
  "灯泡": "Bulb",
  "保险": "Insurance",
  "维修": "Repair",
  "保养": "Maintenance",
  "检测": "Inspection",
  "更换": "Replace",
  "清洗": "Clean",
  "补胎": "Tire repair",
};

/** 将中文转为英文（词汇表匹配），其余非 ASCII 转为 ?，保证 Helvetica 可渲染 */
function toPdfEnglish(str: string): string {
  if (!str || /^[\x20-\x7E]*$/.test(str)) return str;
  let out = str;
  const sorted = Object.entries(ZH_TO_EN).sort((a, b) => b[0].length - a[0].length);
  for (const [zh, en] of sorted) {
    out = out.split(zh).join(en);
  }
  return out.replace(/[^\x20-\x7E]/g, "?");
}

/** Helvetica 仅支持 WinAnsi，中文等非 ASCII 转为 ? 避免报错，保证生成速度快 */
function toPdfSafe(str: string): string {
  return str.replace(/[^\x20-\x7E]/g, "?");
}

function formatCents(c: number) {
  return `${(c / 100).toFixed(2)}`;
}

export type CasePdfInput = {
  companyName: string;
  date: Date;
  plate: string | null;
  vin: string | null;
  unit_number: number | null;
  driver_name: string | null;
  driver_phone: string | null;
  status: string;
  repairItems: string[];
  parts: Array<{
    name: string;
    qty: number;
    unit_price_cents: number;
    line_total_cents: number;
  }>;
  labor: Array<{
    name: string;
    hours: number;
    rate_cents: number;
    line_total_cents: number;
  }>;
  labor_subtotal_cents: number;
  cleaning_fee_cents: number;
  tax_cents: number;
  grand_total_cents: number;
};

export async function generateCasePdf(input: CasePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([612, 792]);
  const { height } = page.getSize();
  let y = height - 50;
  const left = 50;
  const lineHeight = 16;
  const smallLine = 12;

  const draw = (text: string, opts?: { bold?: boolean; size?: number }) => {
    const f = opts?.bold ? fontBold : font;
    const size = opts?.size ?? 12;
    page.drawText(text, { x: left, y, size, font: f, color: rgb(0, 0, 0) });
    y -= lineHeight;
  };

  draw(toPdfEnglish(input.companyName), { bold: true, size: 18 });
  y -= 4;
  draw(`Date: ${input.date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`);
  y -= 8;

  const vehicle: string[] = [];
  if (input.plate) vehicle.push(`Plate: ${toPdfEnglish(input.plate)}`);
  if (input.vin) vehicle.push(`VIN: ${toPdfEnglish(input.vin)}`);
  if (input.unit_number != null) vehicle.push(`Unit #: ${input.unit_number}`);
  if (vehicle.length) {
    draw("Vehicle: " + vehicle.join(" | "));
    y -= 4;
  }
  if (input.driver_name ?? input.driver_phone) {
    const driverParts: string[] = [];
    if (input.driver_name) driverParts.push(`Driver: ${toPdfEnglish(input.driver_name)}`);
    if (input.driver_phone) driverParts.push(`Phone: ${toPdfEnglish(input.driver_phone)}`);
    draw(driverParts.join(" | "));
    y -= 4;
  }
  draw(`Status: ${toPdfEnglish(input.status)} | Grand Total: ${formatCents(input.grand_total_cents)}`);
  y -= 4;

  if (input.repairItems.length) {
    draw("Repair Items:", { bold: true });
    input.repairItems.forEach((name) => {
      page.drawText("• " + toPdfEnglish(name), { x: left + 8, y, size: 10, font, color: rgb(0, 0, 0) });
      y -= smallLine;
    });
    y -= 4;
  }

  if (input.parts.length) {
    draw("Parts", { bold: true });
    page.drawText("Name", { x: left, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
    page.drawText("Qty", { x: left + 200, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
    page.drawText("Unit Price", { x: left + 260, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
    page.drawText("Line Total", { x: left + 360, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
    y -= smallLine;
    input.parts.forEach((p) => {
      page.drawText(toPdfEnglish(p.name).slice(0, 28), { x: left, y, size: 10, font, color: rgb(0, 0, 0) });
      page.drawText(String(p.qty), { x: left + 200, y, size: 10, font, color: rgb(0, 0, 0) });
      page.drawText(formatCents(p.unit_price_cents), { x: left + 260, y, size: 10, font, color: rgb(0, 0, 0) });
      page.drawText(formatCents(p.line_total_cents), { x: left + 360, y, size: 10, font, color: rgb(0, 0, 0) });
      y -= smallLine;
    });
    y -= 4;
  }

  if (input.labor.length) {
    draw("Labor", { bold: true });
    page.drawText("Name", { x: left, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
    page.drawText("Hours", { x: left + 200, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
    page.drawText("Rate", { x: left + 280, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
    page.drawText("Line Total", { x: left + 360, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
    y -= smallLine;
    input.labor.forEach((l) => {
      page.drawText(toPdfEnglish(l.name).slice(0, 28), { x: left, y, size: 10, font, color: rgb(0, 0, 0) });
      page.drawText(String(l.hours), { x: left + 200, y, size: 10, font, color: rgb(0, 0, 0) });
      page.drawText(formatCents(l.rate_cents), { x: left + 280, y, size: 10, font, color: rgb(0, 0, 0) });
      page.drawText(formatCents(l.line_total_cents), { x: left + 360, y, size: 10, font, color: rgb(0, 0, 0) });
      y -= smallLine;
    });
    y -= 4;
  }

  draw(`Labor Subtotal: ${formatCents(input.labor_subtotal_cents)}`);
  draw(`Cleaning Fee: ${formatCents(input.cleaning_fee_cents)}`);
  draw(`Tax: ${formatCents(input.tax_cents)}`);
  draw(`Grand Total: ${formatCents(input.grand_total_cents)}`, { bold: true });
  y -= 24;

  draw("Customer Signature: _________________________________________");
  draw("Date: _________________________________________");

  return doc.save();
}
