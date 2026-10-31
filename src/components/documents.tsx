import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Copy, FileText, Printer, RotateCcw, Save, Undo2, Redo2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useWorkspace } from "../App";
import { api, multiplyMinor, type Row } from "../lib/api";
import { Badge, PageTitle } from "./shared";
import { Button } from "./ui/button";

export type ReceiptConfig = {
  primary_color: string;
  accent_color: string;
  font_family: string;
  paper_size: "58mm" | "80mm" | "A4";
  header_layout: "centered" | "split";
  footer_message: string;
  logo_data_url?: string;
};

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

type Template = Row & {
  document_type: "sales_receipt" | "sales_invoice";
  name: string;
  config: ReceiptConfig;
  is_default: boolean;
  is_published: boolean;
};

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
  const [undoStack, setUndoStack] = useState<ReceiptConfig[]>([]);
  const [redoStack, setRedoStack] = useState<ReceiptConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [logoError, setLogoError] = useState("");
  const activeBranch = data.branches.find((item) => item.id === branch);
  const sale = data.sales[0];
  const saleItems = sale ? data.items.filter((item) => item.sale_id === sale.id) : [];
  const currentPresets =
    documentType === "sales_invoice" ? invoicePresets : presets;
  const selectedPreset = currentPresets.find((item) => item.id === selectedId);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setTemplates([]);
    setSelectedId(currentPresets[0].id);
    setSelectedSavedId("");
    setName(currentPresets[0].name);
    setSettings(currentPresets[0].config);
    setUndoStack([]);
    setRedoStack([]);
    api<{ templates: Template[] }>(
      `/document-templates?document_type=${documentType}`,
    )
      .then((result) => {
        if (!active) return;
        const saved = result.templates || [];
        setTemplates(saved);
        const defaultTemplate = saved.find((template) => template.is_default);
        if (defaultTemplate) {
          setSelectedId("");
          setSelectedSavedId(defaultTemplate.id);
          setName(defaultTemplate.name);
          setSettings(defaultTemplate.config);
        } else {
          const firstPreset = currentPresets[0];
          setSelectedId(firstPreset.id);
          setSelectedSavedId("");
          setName(firstPreset.name);
          setSettings(firstPreset.config);
        }
      })
      .catch((reason) => {
        if (active) setError((reason as Error).message);
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [currentPresets, documentType]);

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
    setUndoStack([]);
    setRedoStack([]);
  }

  function changeSettings(next: ReceiptConfig) {
    setUndoStack((stack) => [...stack.slice(-19), settings]);
    setRedoStack([]);
    setSettings(next);
  }

  async function saveTemplate() {
    setSaving(true);
    setError("");
    try {
      const saved = await api<Template>("/document-templates", {
        action: "save",
        id: selectedSavedId || undefined,
        document_type: documentType,
        name: name.trim(),
        config: settings,
        is_published: true,
      });
      setTemplates((current) => [
        saved,
        ...current.filter((template) => template.id !== saved.id),
      ]);
      setSelectedSavedId(saved.id);
      setSelectedId("");
      notify(
        `${documentType === "sales_invoice" ? "Invoice" : "Receipt"} template saved.`,
      );
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
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
    if (file.size > 128 * 1024) {
      setLogoError("Logo files must be 128 KB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setLogoError("The selected logo could not be read.");
    reader.onload = () => {
      if (typeof reader.result === "string")
        changeSettings({ ...settings, logo_data_url: reader.result });
    };
    reader.readAsDataURL(file);
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
                    if (template.saved) {
                      setSelectedId("");
                      setSelectedSavedId(template.id);
                      setName(template.name);
                      setSettings(template.config);
                    } else choosePreset(template as Preset);
                  }}>Preview</Button>
                  <Button size="sm" variant="secondary" onClick={() => {
                    if (template.saved) {
                      setSelectedId("");
                      setSelectedSavedId(template.id);
                      setName(template.name);
                      setSettings(template.config);
                    } else choosePreset(template as Preset);
                    document.getElementById("document-editor")?.scrollIntoView({ behavior: "smooth" });
                  }}>Customize</Button>
                  <Button size="sm" variant="ghost" onClick={() => {
                    if (template.saved) {
                      setSelectedId("");
                      setSelectedSavedId("");
                      setSettings(template.config);
                      setName(`${template.name} copy`);
                    } else {
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
            <label className="field"><span>Business logo (PNG, JPEG, WebP · 128 KB max)</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void uploadLogo(event.target.files?.[0])} /></label>
            {settings.logo_data_url && <Button variant="ghost" onClick={() => changeSettings({ ...settings, logo_data_url: undefined })}><RotateCcw size={14} /> Restore supplied logo</Button>}
            {logoError && <p className="error" role="alert">{logoError}</p>}
            <div className="document-editor-actions">
              <Button onClick={() => void saveTemplate()} disabled={saving || !name.trim()}><Save size={16} />{saving ? "Saving…" : "Save template"}</Button>
              <Button variant="secondary" onClick={() => window.print()}><Printer size={16} />Print / Save PDF</Button>
            </div>
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
                settings={settings}
                previewOnly={!sale}
                documentType={documentType}
              />
            </div>
            {sale && <p className="document-preview-caption">Previewing recorded sale {sale.reference}; printing preserves its recorded amounts and status.</p>}
          </div>
        </div>
      </section>
      {!templates.length && !loading && !error && (
        <p className="subtle-note">No saved business templates yet. Choose a starter style, customize it, and save it to this business.</p>
      )}
    </div>
  );
}
