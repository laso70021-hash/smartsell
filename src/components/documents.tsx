import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Copy,
  Download,
  FileText,
  Printer,
  RotateCcw,
  Save,
  Undo2,
  Redo2,
} from "lucide-react";
import type EditorJS from "@editorjs/editorjs";
import type { OutputData } from "@editorjs/editorjs";
import { openDB, type DBSchema } from "idb";
import { Link } from "react-router-dom";
import { useWorkspace } from "../App";
import { api, multiplyMinor, type Row } from "../lib/api";
import { Badge, PageTitle } from "./shared";
import { Button } from "./ui/button";
import { DocumentBlockEditor, EMPTY_DOCUMENT_DATA } from "./document-editor";

export type ReceiptConfig = {
  primary_color: string;
  accent_color: string;
  font_family: string;
  paper_size: "58mm" | "80mm" | "A4";
  header_layout: "centered" | "split";
  footer_message: string;
  logo_data_url?: string;
  editor_data?: OutputData;
};

const MAX_STORED_DOCUMENT_LOGO_SIZE_BYTES = 256 * 1024;

type Preset = {
  id: string;
  name: string;
  collection: string;
  description: string;
  config: ReceiptConfig;
};

const config = (
  primary_color: string,
  accent_color: string,
  paper_size: ReceiptConfig["paper_size"] = "80mm",
  header_layout: ReceiptConfig["header_layout"] = "centered",
): ReceiptConfig => ({
  primary_color,
  accent_color,
  font_family: "Segoe UI",
  paper_size,
  header_layout,
  footer_message: "Thank you for shopping with us.",
});

export const DEFAULT_RECEIPT_CONFIG = config("#087443", "#DDF3E5");

const presets: Preset[] = [
  {
    id: "executive-navy",
    name: "Executive Navy",
    collection: "Executive Navy",
    description: "Navy headings with restrained, print-friendly rules.",
    config: config("#102B4E", "#E8EEF5"),
  },
  {
    id: "blue-gold",
    name: "Blue & Gold Premium",
    collection: "Blue & Gold Premium",
    description: "Deep blue totals with a warm gold highlight.",
    config: config("#102B4E", "#E8C66A"),
  },
  {
    id: "modern-emerald",
    name: "Modern Emerald",
    collection: "Modern Emerald",
    description: "Clean white space and fresh emerald accents.",
    config: config("#087443", "#DDF3E5"),
  },
  {
    id: "corporate-blue",
    name: "Corporate Blue",
    collection: "Corporate Blue",
    description: "Clear blue sections and structured transaction details.",
    config: config("#1456A0", "#E7F1FC"),
  },
  {
    id: "minimal-mono",
    name: "Minimal Black & White",
    collection: "Minimal Black & White",
    description: "Lightweight rules for economical printing.",
    config: config("#20252B", "#F0F1F2"),
  },
  {
    id: "contemporary",
    name: "Contemporary Business",
    collection: "Contemporary Business",
    description: "Neutral details with a strong modern total.",
    config: config("#344254", "#E8EDF2"),
  },
  {
    id: "classic-professional",
    name: "Classic Professional",
    collection: "Classic Professional",
    description: "Traditional typography and formal transaction detail.",
    config: config("#263746", "#E9E5DC"),
  },
  {
    id: "compact-pos",
    name: "Compact POS",
    collection: "Compact POS",
    description: "A focused, narrow format for thermal receipt printers.",
    config: config("#20252B", "#F0F1F2", "58mm"),
  },
];

const invoicePresets: Preset[] = presets.map((preset) => ({
  ...preset,
  id: `invoice-${preset.id}`,
  name: `${preset.name} Invoice`,
  config: { ...preset.config, paper_size: "A4" as const },
}));

type DocumentVariable = { key: string; label: string };

const sharedDocumentVariables: DocumentVariable[] = [
  { key: "business.name", label: "Business name" },
  { key: "branch.name", label: "Branch name" },
  { key: "document.reference", label: "Document reference" },
  { key: "document.date", label: "Document date" },
  { key: "customer.name", label: "Customer name" },
  { key: "items.count", label: "Number of lines" },
  { key: "items.list", label: "Item names and quantities" },
  { key: "totals.subtotal", label: "Subtotal" },
  { key: "totals.discount", label: "Discount" },
  { key: "totals.tax", label: "Tax" },
  { key: "totals.total", label: "Total" },
  { key: "totals.paid", label: "Amount paid" },
  { key: "totals.balance", label: "Outstanding balance" },
  { key: "payment.status", label: "Payment status" },
];

const receiptDocumentVariables: DocumentVariable[] = [
  { key: "receipt.cashier", label: "Cashier" },
  { key: "receipt.payment_method", label: "Payment method" },
  { key: "receipt.cash_change", label: "Cash change" },
];

const invoiceDocumentVariables: DocumentVariable[] = [
  { key: "invoice.number", label: "Invoice number" },
  { key: "invoice.date", label: "Invoice date" },
  { key: "invoice.bill_to", label: "Bill to" },
  { key: "invoice.status", label: "Invoice status" },
  { key: "invoice.balance", label: "Invoice balance" },
];

interface DocumentDraftDatabase extends DBSchema {
  drafts: { key: string; value: DeviceTemplateDraft };
}

type DeviceTemplateDraft = {
  name: string;
  config: ReceiptConfig;
  selectedId: string;
  selectedSavedId: string;
};

const deviceDraftDatabase = openDB<DocumentDraftDatabase>(
  "smartsell-document-template-drafts",
  1,
  {
    upgrade(database) {
      database.createObjectStore("drafts");
    },
  },
);

async function readDeviceDraft(key: string) {
  return (await deviceDraftDatabase).get("drafts", key);
}

async function writeDeviceDraft(key: string, draft: DeviceTemplateDraft) {
  await (await deviceDraftDatabase).put("drafts", draft, key);
}

function plainEditorText(
  value: unknown,
  variables: Record<string, string> = {},
) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi, (token, key: string) =>
      variables[key.toLowerCase()] ?? token,
    );
}

function renderListItems(
  items: unknown,
  variables: Record<string, string>,
): ReactNode {
  if (!Array.isArray(items)) return null;
  return (
    <ul>
      {items.map((item, index) => {
        if (typeof item === "string")
          return <li key={index}>{plainEditorText(item, variables)}</li>;
        if (typeof item !== "object" || item === null) return null;
        const row = item as Record<string, unknown>;
        return (
          <li key={index}>
            {plainEditorText(row.content, variables)}
            {renderListItems(row.items, variables)}
          </li>
        );
      })}
    </ul>
  );
}

function renderDocumentBlocks(
  document: OutputData | undefined,
  variables: Record<string, string>,
) {
  return (document?.blocks || []).map((block, index) => {
    const data = block.data as Record<string, unknown>;
    if (block.type === "header") {
      const rawLevel = Number(data.level);
      const level = Number.isInteger(rawLevel)
        ? Math.min(4, Math.max(2, rawLevel))
        : 3;
      const text = plainEditorText(data.text, variables);
      return text
        ? level === 2
          ? <h2 key={block.id || index}>{text}</h2>
          : level === 4
            ? <h4 key={block.id || index}>{text}</h4>
            : <h3 key={block.id || index}>{text}</h3>
        : null;
    }
    if (block.type === "paragraph") {
      const text = plainEditorText(data.text, variables);
      return text ? <p key={block.id || index}>{text}</p> : null;
    }
    if (block.type === "list") {
      return (
        <div key={block.id || index} className="document-content-list">
          {renderListItems(data.items, variables)}
        </div>
      );
    }
    if (block.type === "table" && Array.isArray(data.content)) {
      return (
        <table className="document-content-table" key={block.id || index}>
          <tbody>
            {data.content.map((row, rowIndex) =>
              Array.isArray(row) ? (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => {
                    return (
                      data.withHeadings && rowIndex === 0 ? (
                        <th key={cellIndex}>{plainEditorText(cell, variables)}</th>
                      ) : (
                        <td key={cellIndex}>{plainEditorText(cell, variables)}</td>
                      )
                    );
                  })}
                </tr>
              ) : null,
            )}
          </tbody>
        </table>
      );
    }
    if (block.type === "quote") {
      const text = plainEditorText(data.text, variables);
      return text ? (
        <blockquote key={block.id || index}>
          <p>{text}</p>
          {plainEditorText(data.caption, variables) && (
            <cite>{plainEditorText(data.caption, variables)}</cite>
          )}
        </blockquote>
      ) : null;
    }
    if (block.type === "delimiter")
      return <hr key={block.id || index} className="document-content-divider" />;
    return null;
  });
}

function escapeHtml(value: unknown) {
  return plainEditorText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function exportDocumentBlocks(document?: OutputData) {
  return (document?.blocks || [])
    .map((block) => {
      const data = block.data as Record<string, unknown>;
      if (block.type === "header") {
        const rawLevel = Number(data.level);
        const level = Number.isInteger(rawLevel)
          ? Math.min(4, Math.max(2, rawLevel))
          : 3;
        const text = escapeHtml(data.text);
        return text ? `<h${level}>${text}</h${level}>` : "";
      }
      if (block.type === "paragraph") {
        const text = escapeHtml(data.text);
        return text ? `<p>${text}</p>` : "";
      }
      if (block.type === "list" && Array.isArray(data.items)) {
        const tag = data.style === "ordered" ? "ol" : "ul";
        const items = data.items
          .map((item) => {
            const text =
              typeof item === "object" && item !== null
                ? escapeHtml((item as Record<string, unknown>).content)
                : escapeHtml(item);
            return text ? `<li>${text}</li>` : "";
          })
          .join("");
        return items ? `<${tag}>${items}</${tag}>` : "";
      }
      if (block.type === "table" && Array.isArray(data.content)) {
        const rows = data.content
          .map((row, rowIndex) => {
            if (!Array.isArray(row)) return "";
            const cellTag = data.withHeadings && rowIndex === 0 ? "th" : "td";
            return `<tr>${row.map((cell) => `<${cellTag}>${escapeHtml(cell)}</${cellTag}>`).join("")}</tr>`;
          })
          .join("");
        return rows ? `<table><tbody>${rows}</tbody></table>` : "";
      }
      if (block.type === "quote") {
        const text = escapeHtml(data.text);
        const caption = escapeHtml(data.caption);
        return text
          ? `<blockquote><p>${text}</p>${caption ? `<cite>${caption}</cite>` : ""}</blockquote>`
          : "";
      }
      return block.type === "delimiter" ? "<hr>" : "";
    })
    .join("\n");
}

async function readLogoDataUrl(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The selected logo could not be read."));
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("The selected logo could not be read."));
    };
    reader.readAsDataURL(blob);
  });
}

async function optimizeDocumentLogo(file: File) {
  if (file.size <= MAX_STORED_DOCUMENT_LOGO_SIZE_BYTES)
    return readLogoDataUrl(file);
  const image = await createImageBitmap(file);
  try {
    let width = image.width;
    let height = image.height;
    for (let attempt = 0; attempt < 18; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Logo optimization is unavailable in this browser.");
      context.drawImage(image, 0, 0, width, height);
      const quality = [0.9, 0.8, 0.7][attempt % 3];
      const optimized = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", quality),
      );
      if (!optimized)
        throw new Error("The selected logo could not be optimized.");
      if (optimized.size <= MAX_STORED_DOCUMENT_LOGO_SIZE_BYTES)
        return readLogoDataUrl(optimized);
      width = Math.max(96, Math.round(width * 0.8));
      height = Math.max(96, Math.round(height * 0.8));
    }
    throw new Error("This logo could not be reduced enough. Choose a simpler logo image.");
  } finally {
    image.close();
  }
}

type Template = Row & {
  document_type: "sales_receipt" | "sales_invoice";
  name: string;
  config: ReceiptConfig;
  is_default: boolean;
  is_published: boolean;
  updated_at?: string;
};

function latestTemplateLogo(
  templates: Array<Pick<Template, "config" | "updated_at">>,
) {
  return [...templates]
    .filter((template) => template.config.logo_data_url)
    .sort(
      (left, right) =>
        Date.parse(right.updated_at || "") - Date.parse(left.updated_at || ""),
    )[0]?.config.logo_data_url;
}

export function officialReceiptSettings(
  templates: Array<Pick<Template, "config" | "is_default" | "updated_at">>,
): ReceiptConfig {
  const defaultTemplate = templates.find((template) => template.is_default);
  const logo = latestTemplateLogo(templates);
  return {
    ...(defaultTemplate?.config || DEFAULT_RECEIPT_CONFIG),
    ...(logo ? { logo_data_url: logo } : {}),
  };
}

export function ReceiptDocument({
  business,
  branch,
  sale,
  items,
  money,
  cashChange = 0,
  settings = DEFAULT_RECEIPT_CONFIG,
  previewOnly = false,
  documentType = "sales_receipt",
}: {
  business: Row;
  branch?: Row;
  sale?: Row;
  items: Row[];
  money: (amount: number) => string;
  cashChange?: number;
  settings?: ReceiptConfig;
  previewOnly?: boolean;
  documentType?: "sales_receipt" | "sales_invoice";
}) {
  const saleItems =
    sale && items.length
      ? items
      : [{ id: "preview", name: "Sample product", quantity: 1, price: 12500 }];
  const subtotal = sale
    ? saleItems.reduce(
        (sum, line) => sum + multiplyMinor(line.price, line.quantity),
        0,
      )
    : 12500;
  const paymentStatus = !sale
    ? "Preview only"
    : sale.status === "refunded"
      ? "Refunded"
      : sale.total <= sale.paid
        ? "Paid"
        : sale.paid > 0
          ? "Partially paid"
          : "Unpaid";
  const style = {
    "--document-primary": settings.primary_color,
    "--document-accent": settings.accent_color,
    fontFamily: settings.font_family,
  } as CSSProperties;
  const documentDate = sale?.created_at
    ? new Date(sale.created_at).toLocaleString()
    : "Preview date";
  const documentReference = sale?.reference || "PREVIEW";
  const customerName = sale?.customer || "Walk-in customer";
  const balance = sale?.status === "refunded"
    ? 0
    : (sale?.total || subtotal) - (sale?.paid || 0);
  const variables: Record<string, string> = {
    "business.name": String(business.name || "Business name"),
    "branch.name": String(branch?.name || ""),
    "document.reference": documentReference,
    "document.date": documentDate,
    "customer.name": customerName,
    "items.count": String(saleItems.length),
    "items.list": saleItems.map((item) => `${item.name} x ${item.quantity}`).join(", "),
    "totals.subtotal": money(subtotal),
    "totals.discount": money(sale?.discount || 0),
    "totals.tax": money(sale?.tax || 0),
    "totals.total": money(sale?.total || subtotal),
    "totals.paid": money(sale?.paid || 0),
    "totals.balance": money(balance),
    "payment.status": paymentStatus,
    "receipt.cashier": String(sale?.actor || "Sales team"),
    "receipt.payment_method": String(sale?.method || "cash"),
    "receipt.cash_change": money(cashChange),
    "invoice.number": documentReference,
    "invoice.date": documentDate,
    "invoice.bill_to": customerName,
    "invoice.status": paymentStatus,
    "invoice.balance": money(balance),
  };
  return (
    <article
      className="document-receipt"
      data-paper={settings.paper_size}
      style={style}
    >
      {previewOnly && (
        <div className="document-preview-label">DESIGN PREVIEW · NOT A TRANSACTION</div>
      )}
      <header className={"document-receipt-header " + settings.header_layout}>
        <img
          className={settings.logo_data_url ? "custom-document-logo" : undefined}
          src={settings.logo_data_url || "/brand/swahivo-pos-logo.png"}
          alt={`${business.name} logo`}
        />
        <div className="document-business">
          <strong>{business.name}</strong>
          {branch?.name && <span>{branch.name}</span>}
          {business.address && <small>{business.address}</small>}
          {(business.phone || business.email) && (
            <small>{[business.phone, business.email].filter(Boolean).join(" · ")}</small>
          )}
          {business.tax_id && <small>Tax ID: {business.tax_id}</small>}
        </div>
      </header>
      <div className="document-receipt-title">
        <span>{documentType === "sales_invoice" ? "SALES INVOICE" : "SALES RECEIPT"}</span>
        <small>{sale?.reference || "PREVIEW"}</small>
      </div>
      <div className="document-receipt-meta">
        <div><span>{documentType === "sales_invoice" ? "Invoice date" : "Date & time"}</span><strong>{sale?.created_at ? new Date(sale.created_at).toLocaleString() : "Preview date"}</strong></div>
        <div><span>{documentType === "sales_invoice" ? "Bill to" : "Customer"}</span><strong>{sale?.customer || "Walk-in customer"}</strong></div>
        {documentType === "sales_receipt" && <div><span>Cashier</span><strong>{sale?.actor || "Sales team"}</strong></div>}
        <div><span>{documentType === "sales_invoice" ? "Payment status" : "Payment"}</span><strong>{sale ? (documentType === "sales_invoice" ? paymentStatus : `${sale.method} · ${paymentStatus}`) : "Preview only"}</strong></div>
      </div>
      <div className="document-custom-content">
        {renderDocumentBlocks(settings.editor_data, variables)}
      </div>
      <table className="document-items">
        <thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead>
        <tbody>
          {saleItems.map((line) => (
            <tr key={line.id}>
              <td>{line.name}<small>{line.sku || ""}</small></td>
              <td>{line.quantity}</td>
              <td>{money(line.price)}</td>
              <td>{money(multiplyMinor(line.price, line.quantity))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <section className="document-totals">
        <div><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
        <div><span>Discount</span><strong>−{money(sale?.discount || 0)}</strong></div>
        <div><span>Tax</span><strong>{money(sale?.tax || 0)}</strong></div>
        <div className="document-grand-total"><span>Total</span><strong>{money(sale?.total || subtotal)}</strong></div>
        <div><span>Amount paid</span><strong>{money(sale?.paid || 0)}</strong></div>
        <div><span>Outstanding balance</span><strong>{money(sale?.status === "refunded" ? 0 : (sale?.total || subtotal) - (sale?.paid || 0))}</strong></div>
        {cashChange > 0 && <div><span>Cash change</span><strong>{money(cashChange)}</strong></div>}
      </section>
      <footer className="document-receipt-footer">
        <strong>{settings.footer_message || "Thank you for shopping with us."}</strong>
        <small>Business document · not a government fiscal receipt</small>
      </footer>
    </article>
  );
}

export function DocumentTemplates() {
  const { data, branch, money, notify } = useWorkspace();
  const [documentType, setDocumentType] = useState<
    "sales_receipt" | "sales_invoice"
  >("sales_receipt");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState(presets[0].id);
  const [selectedSavedId, setSelectedSavedId] = useState("");
  const [name, setName] = useState(presets[0].name);
  const [settings, setSettings] = useState<ReceiptConfig>(presets[0].config);
  const [editorData, setEditorData] = useState<OutputData>(EMPTY_DOCUMENT_DATA);
  const [editorReset, setEditorReset] = useState(0);
  const editorRef = useRef<EditorJS | null>(null);
  const [selectedVariable, setSelectedVariable] = useState("business.name");
  const [undoStack, setUndoStack] = useState<ReceiptConfig[]>([]);
  const [redoStack, setRedoStack] = useState<ReceiptConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [logoError, setLogoError] = useState("");
  const [draftStatus, setDraftStatus] = useState("Draft saves on this device");
  const draftKey = `${data.business.id}:${documentType}`;
  const activeBranch = data.branches.find((item) => item.id === branch);
  const sale = data.sales[0];
  const saleItems = sale ? data.items.filter((item) => item.sale_id === sale.id) : [];
  const currentPresets =
    documentType === "sales_invoice" ? invoicePresets : presets;
  const otherDocumentType =
    documentType === "sales_invoice" ? "sales_receipt" : "sales_invoice";
  const selectedPreset = currentPresets.find((item) => item.id === selectedId);
  const availableVariables = documentType === "sales_invoice"
    ? [...sharedDocumentVariables, ...invoiceDocumentVariables]
    : [...sharedDocumentVariables, ...receiptDocumentVariables];

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setTemplates([]);
    setSelectedId(currentPresets[0].id);
    setSelectedSavedId("");
    setName(currentPresets[0].name);
    setSettings(currentPresets[0].config);
    setEditorData(currentPresets[0].config.editor_data || EMPTY_DOCUMENT_DATA);
    setEditorReset((revision) => revision + 1);
    setUndoStack([]);
    setRedoStack([]);
    Promise.all([
      api<{ templates: Template[] }>(`/document-templates?document_type=${documentType}`)
        .catch((reason) => {
          if (active) setError((reason as Error).message);
          return { templates: [] as Template[] };
        }),
      api<{ templates: Template[] }>(
        `/document-templates?document_type=${otherDocumentType}`,
      ).catch((reason) => {
        if (active)
          setError(
            `The shared invoice/receipt logo could not be loaded: ${(reason as Error).message}`,
          );
        return { templates: [] as Template[] };
      }),
      readDeviceDraft(draftKey).catch(() => undefined),
    ])
      .then(([result, otherResult, deviceDraft]) => {
        if (!active) return;
        const saved = result.templates || [];
        const sharedLogo = latestTemplateLogo([
          ...saved,
          ...(otherResult.templates || []),
        ]);
        setTemplates(saved);
        const defaultTemplate = saved.find((template) => template.is_default);
        if (deviceDraft) {
          setSelectedId(deviceDraft.selectedId);
          setSelectedSavedId(deviceDraft.selectedSavedId);
          setName(deviceDraft.name);
          setSettings({
            ...deviceDraft.config,
            ...(deviceDraft.config.logo_data_url || !sharedLogo
              ? {}
              : { logo_data_url: sharedLogo }),
          });
          setEditorData(deviceDraft.config.editor_data || EMPTY_DOCUMENT_DATA);
          setEditorReset((revision) => revision + 1);
          setDraftStatus("Restored this device's latest draft");
        } else if (defaultTemplate) {
          setSelectedId("");
          setSelectedSavedId(defaultTemplate.id);
          setName(defaultTemplate.name);
          setSettings({
            ...defaultTemplate.config,
            ...(defaultTemplate.config.logo_data_url || !sharedLogo
              ? {}
              : { logo_data_url: sharedLogo }),
          });
          setEditorData(defaultTemplate.config.editor_data || EMPTY_DOCUMENT_DATA);
          setEditorReset((revision) => revision + 1);
        } else {
          const firstPreset = currentPresets[0];
          setSelectedId(firstPreset.id);
          setSelectedSavedId("");
          setName(firstPreset.name);
          setSettings({
            ...firstPreset.config,
            ...(sharedLogo ? { logo_data_url: sharedLogo } : {}),
          });
          setEditorData(firstPreset.config.editor_data || EMPTY_DOCUMENT_DATA);
          setEditorReset((revision) => revision + 1);
        }
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [currentPresets, documentType, draftKey]);

  useEffect(() => {
    if (loading) return;
    let active = true;
    const timer = setTimeout(() => {
      const draft: DeviceTemplateDraft = {
        name,
        config: { ...settings, editor_data: editorData },
        selectedId,
        selectedSavedId,
      };
      void writeDeviceDraft(draftKey, draft)
        .then(() => active && setDraftStatus("Draft saved on this device"))
        .catch(() => active && setDraftStatus("Device draft could not be saved"));
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [draftKey, editorData, loading, name, selectedId, selectedSavedId, settings]);

  const allTemplates = useMemo(
    () => [
        ...currentPresets.map((preset) => ({ ...preset, saved: false, is_default: false })),
      ...templates.map((template) => ({
        ...template,
        collection: "Your templates",
          description: `Business-owned ${documentType === "sales_invoice" ? "invoice" : "receipt"} template.`,
        saved: true,
      })),
    ],
      [currentPresets, documentType, templates],
  );

  function choosePreset(preset: Preset) {
    setSelectedId(preset.id);
    setSelectedSavedId("");
    setName(preset.name);
    setSettings(preset.config);
    setEditorData(preset.config.editor_data || EMPTY_DOCUMENT_DATA);
    setEditorReset((revision) => revision + 1);
    setUndoStack([]);
    setRedoStack([]);
  }

  function chooseSavedTemplate(
    template: Pick<Template, "id" | "name" | "config">,
    duplicate = false,
  ) {
    setSelectedId("");
    setSelectedSavedId(duplicate ? "" : template.id);
    setName(duplicate ? `${template.name} copy` : template.name);
    setSettings(template.config);
    setEditorData(template.config.editor_data || EMPTY_DOCUMENT_DATA);
    setEditorReset((revision) => revision + 1);
  }

  function changeSettings(next: ReceiptConfig) {
    setUndoStack((stack) => [...stack.slice(-19), settings]);
    setRedoStack([]);
    setSettings(next);
  }

  async function saveTemplateToBusiness() {
    setSaving(true);
    setError("");
    try {
      const currentEditorData = await editorRef.current?.save() || editorData;
      if (new TextEncoder().encode(JSON.stringify(currentEditorData)).byteLength > 100_000)
        throw new Error("Document layout content must be under 100 KB.");
      setEditorData(currentEditorData);
      const savedConfig = { ...settings, editor_data: currentEditorData };
      const saved = await api<Template>("/document-templates", {
        action: "save",
        id: selectedSavedId || undefined,
        document_type: documentType,
        name: name.trim(),
        config: savedConfig,
        is_published: true,
      });
      setTemplates((current) => [
        saved,
        ...current.filter((template) => template.id !== saved.id),
      ]);
      setSelectedSavedId(saved.id);
      setSelectedId("");
      setSettings(saved.config);
      notify(
        `${documentType === "sales_invoice" ? "Invoice" : "Receipt"} template saved to this business.`,
      );
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function downloadTemplate() {
    setError("");
    try {
      const currentEditorData = await editorRef.current?.save() || editorData;
      if (new TextEncoder().encode(JSON.stringify(currentEditorData)).byteLength > 100_000)
        throw new Error("Document layout content must be under 100 KB.");
      const payload = {
        format: "smartsell-document-template",
        version: 1,
        document_type: documentType,
        name: name.trim() || `Sales ${documentType === "sales_invoice" ? "invoice" : "receipt"}`,
        config: { ...settings, editor_data: currentEditorData },
      };
      try {
        await writeDeviceDraft(draftKey, {
          name: payload.name,
          config: payload.config,
          selectedId,
          selectedSavedId,
        });
        setDraftStatus("Draft saved on this device");
      } catch {
        setDraftStatus("Download is ready; device autosave is unavailable");
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${payload.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "smartsell-template"}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setEditorData(currentEditorData);
      notify("Template downloaded as a reusable JSON file.");
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function makeDefault(template: Pick<Template, "id">) {
    setError("");
    try {
      const saved = await api<Template>(
        `/document-templates/${template.id}/default?document_type=${documentType}`,
        {},
        "PUT",
      );
      setTemplates((current) =>
        current.map((item) => ({
          ...item,
          is_default: item.id === saved.id,
        })),
      );
      notify(
        `Default sales ${documentType === "sales_invoice" ? "invoice" : "receipt"} template updated.`,
      );
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function uploadLogo(file?: File) {
    setLogoError("");
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setLogoError("Choose a PNG, JPEG, or WebP logo.");
      return;
    }
    try {
      const logo_data_url = await optimizeDocumentLogo(file);
      changeSettings({ ...settings, logo_data_url });
    } catch (reason) {
      setLogoError((reason as Error).message);
    }
  }

  return (
    <div className="document-templates-page">
      <PageTitle
        eyebrow="BUSINESS SETTINGS"
        title="Document Templates"
        description="Create, customize, and manage professional business documents."
        actions={<Link className="text-link" to="/app/settings">Business settings</Link>}
      />
      {error && <div className="error" role="alert">{error}</div>}
      <section className="document-template-gallery panel">
        <div className="panel-heading">
          <div>
            <h3>Sales {documentType === "sales_invoice" ? "invoice" : "receipt"} templates</h3>
            <p>Eight print-ready styles. Each preview uses a real sale when available.</p>
          </div>
          <div className="row">
            <label className="field">
              <span>Document type</span>
              <select
                aria-label="Document type"
                value={documentType}
                onChange={(event) => {
                  setDocumentType(
                    event.target.value as "sales_receipt" | "sales_invoice",
                  );
                }}
              >
                <option value="sales_receipt">Sales receipt</option>
                <option value="sales_invoice">Sales invoice</option>
              </select>
            </label>
            <Button
              variant="secondary"
              onClick={() => {
                choosePreset(currentPresets[0]);
                setName(
                  `New ${documentType === "sales_invoice" ? "invoice" : "receipt"} template`,
                );
              }}
            >
              Create Template
            </Button>
          </div>
        </div>
        <div className="document-template-grid">
          {allTemplates.map((template) => (
            <article className="document-template-card" key={template.saved ? template.id : template.id}>
              <div className="document-template-thumb" style={{ borderTopColor: template.config.primary_color }}>
                <div className="document-template-miniature">
                  <ReceiptDocument
                    business={data.business}
                    branch={activeBranch}
                    sale={sale}
                    items={saleItems}
                    money={money}
                    settings={template.config}
                    previewOnly={!sale}
                    documentType={documentType}
                  />
                </div>
              </div>
              <div className="document-template-card-copy">
                <div><h4>{template.name}</h4>{template.is_default && <Badge>Default</Badge>}</div>
                <p>{template.description}</p>
                <small>Sales {documentType === "sales_invoice" ? "invoice" : "receipt"} · {template.config.paper_size}</small>
                <div className="document-template-actions">
                  <Button size="sm" variant="ghost" onClick={() => {
                    if (template.saved) chooseSavedTemplate(template as Pick<Template, "id" | "name" | "config">);
                    else choosePreset(template as Preset);
                  }}>Preview</Button>
                  <Button size="sm" variant="secondary" onClick={() => {
                    if (template.saved) chooseSavedTemplate(template as Pick<Template, "id" | "name" | "config">);
                    else choosePreset(template as Preset);
                    document.getElementById("document-editor")?.scrollIntoView({ behavior: "smooth" });
                  }}>Customize</Button>
                  <Button size="sm" variant="ghost" onClick={() => {
                    if (template.saved) chooseSavedTemplate(template as Pick<Template, "id" | "name" | "config">, true);
                    else {
                      choosePreset(template as Preset);
                      setName(`${template.name} copy`);
                    }
                    document.getElementById("document-editor")?.scrollIntoView({ behavior: "smooth" });
                  }} aria-label={`Duplicate ${template.name}`}><Copy size={14} /></Button>
                  {template.saved && !template.is_default && (
                    <Button size="sm" variant="ghost" onClick={() => void makeDefault(template)}>Set default</Button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="document-editor panel" id="document-editor">
        <div className="panel-heading">
          <div><h3>{documentType === "sales_invoice" ? "Invoice" : "Receipt"} designer</h3><p>Presentation settings never change recorded sale details.</p></div>
          <div className="row">
            <Button size="icon" variant="ghost" aria-label="Undo" disabled={!undoStack.length} onClick={() => {
              const previous = undoStack.at(-1);
              if (!previous) return;
              setRedoStack((stack) => [...stack, settings]);
              setUndoStack((stack) => stack.slice(0, -1));
              setSettings(previous);
            }}><Undo2 size={17} /></Button>
            <Button size="icon" variant="ghost" aria-label="Redo" disabled={!redoStack.length} onClick={() => {
              const next = redoStack.at(-1);
              if (!next) return;
              setUndoStack((stack) => [...stack, settings]);
              setRedoStack((stack) => stack.slice(0, -1));
              setSettings(next);
            }}><Redo2 size={17} /></Button>
          </div>
        </div>
        <div className="document-editor-grid">
          <div className="document-properties">
            <label className="field"><span>Template name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} /></label>
            <label className="field"><span>Primary color</span><input type="color" value={settings.primary_color} onChange={(event) => changeSettings({ ...settings, primary_color: event.target.value })} /></label>
            <label className="field"><span>Accent color</span><input type="color" value={settings.accent_color} onChange={(event) => changeSettings({ ...settings, accent_color: event.target.value })} /></label>
            <label className="field"><span>Document font</span><select value={settings.font_family} onChange={(event) => changeSettings({ ...settings, font_family: event.target.value })}>{["Segoe UI", "Arial", "Georgia", "Tahoma"].map((font) => <option key={font}>{font}</option>)}</select></label>
            <label className="field"><span>Paper size</span><select value={settings.paper_size} onChange={(event) => changeSettings({ ...settings, paper_size: event.target.value as ReceiptConfig["paper_size"] })}><option value="58mm">58 mm thermal</option><option value="80mm">80 mm thermal</option><option value="A4">A4</option></select></label>
            <label className="field"><span>Header arrangement</span><select value={settings.header_layout} onChange={(event) => changeSettings({ ...settings, header_layout: event.target.value as ReceiptConfig["header_layout"] })}><option value="centered">Centered</option><option value="split">Logo left</option></select></label>
            <label className="field"><span>Footer message</span><textarea value={settings.footer_message} maxLength={300} onChange={(event) => changeSettings({ ...settings, footer_message: event.target.value })} /></label>
            <label className="field"><span>Business logo (PNG, JPEG, or WebP)</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void uploadLogo(event.target.files?.[0])} /><small>Large images are optimized automatically. Save the template to use its logo on official invoices and receipts.</small></label>
            {settings.logo_data_url && <Button variant="ghost" onClick={() => changeSettings({ ...settings, logo_data_url: undefined })}><RotateCcw size={14} /> Restore supplied logo</Button>}
            {logoError && <p className="error" role="alert">{logoError}</p>}
            <div className="document-editor-actions">
              <Button onClick={() => void downloadTemplate()} disabled={!name.trim()}><Download size={16} />Save template</Button>
              <Button variant="secondary" onClick={() => void saveTemplateToBusiness()} disabled={saving || !name.trim()}><Save size={16} />{saving ? "Saving…" : "Save to business"}</Button>
              <Button variant="secondary" onClick={() => window.print()}><Printer size={16} />Print / Save PDF</Button>
            </div>
            <small className="muted" role="status">{draftStatus}</small>
            {loading && <small className="muted">Loading business templates…</small>}
          </div>
          <div className="document-canvas">
            <div className="document-canvas-toolbar"><span><FileText size={15} /> Live sales {documentType === "sales_invoice" ? "invoice" : "receipt"} preview</span><small>{selectedPreset?.collection || "Business template"} · {settings.paper_size}</small></div>
            <div className="document-print-area">
              <ReceiptDocument
                business={data.business}
                branch={activeBranch}
                sale={sale}
                items={saleItems}
                money={money}
                settings={{ ...settings, editor_data: editorData }}
                previewOnly={!sale}
                documentType={documentType}
              />
            </div>
            {sale && <p className="document-preview-caption">Previewing recorded sale {sale.reference}; printing preserves its recorded amounts and status.</p>}
          </div>
        </div>
        <div className="document-content-editor">
          <div className="document-variable-controls">
            <label className="field">
              <span>{documentType === "sales_invoice" ? "Invoice variable" : "Receipt variable"}</span>
              <select
                aria-label="Dynamic document variable"
                value={selectedVariable}
                onChange={(event) => setSelectedVariable(event.target.value)}
              >
                {availableVariables.map((variable) => (
                  <option key={variable.key} value={variable.key}>
                    {variable.label} ({"{{"}{variable.key}{"}}"})
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="secondary"
              onClick={() => editorRef.current?.blocks.insert("paragraph", {
                text: `{{${selectedVariable}}}`,
              })}
            >
              Insert variable
            </Button>
          </div>
          <DocumentBlockEditor
            key={editorReset}
            initialData={editorData}
            onChange={setEditorData}
            onReady={(editor) => { editorRef.current = editor; }}
            onError={setError}
          />
        </div>
      </section>
      {!templates.length && !loading && !error && (
        <p className="subtle-note">No saved business templates yet. Choose a starter style, customize it, and save it to this business.</p>
      )}
    </div>
  );
}
