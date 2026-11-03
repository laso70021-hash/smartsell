import { useEffect, useRef, useState } from "react";
import {
  ImagePlus,
  Package,
  Printer,
  QrCode,
  TriangleAlert,
} from "lucide-react";
import * as QRCode from "qrcode";
import { useWorkspace } from "../App";
import {
  api,
  MAX_PRODUCT_IMAGE_SIZE,
  MAX_PRODUCT_IMPORT_IMAGE_BYTES,
  multiplyMinor,
  productImageUrl,
  removeProductImageObject,
  saveProductImagePaths,
  toMinor,
  uploadProductImage,
  validateProductImage,
  type Row,
  type Workspace,
} from "../lib/api";
import { Modal, Form, Fields, Badge, type FieldSpec } from "./shared";
import { Button } from "./ui/button";
import {
  DEFAULT_RECEIPT_CONFIG,
  ReceiptDocument,
  officialReceiptSettings,
  type ReceiptConfig,
} from "./documents";
function parseCSV(source: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n" || c === "\r")) {
      row.push(cell);
      cell = "";
      if (c !== ",") {
        if (c === "\r" && source[i + 1] === "\n") i++;
        if (row.some((v) => v.trim())) rows.push(row);
        row = [];
      }
    } else cell += c;
  }
  if (quoted) throw new Error("The CSV has an unclosed quoted field.");
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
function matchProductPhotos(
  rows: Record<string, string>[],
  files: File[],
) {
  const filesByName = new Map(
    files.map((file) => [file.name.toLowerCase(), file]),
  );
  const filesBySku = new Map<string, File>();
  for (const file of files) {
    const stem = file.name.replace(/\.[^.]+$/, "").toLowerCase();
    if (filesBySku.has(stem))
      throw new Error(`More than one photo matches SKU "${stem}".`);
    filesBySku.set(stem, file);
  }
  const usedFiles = new Set<File>();
  return rows.flatMap((row) => {
    const filename = row.image?.trim().split(/[\\/]/).pop()?.toLowerCase();
    const file = filename ? filesByName.get(filename) : filesBySku.get(row.sku.toLowerCase());
    if (filename && !file)
      throw new Error(`Photo "${row.image}" for SKU ${row.sku} was not selected.`);
    if (!file) return [];
    if (usedFiles.has(file))
      throw new Error(`Photo "${file.name}" is assigned to more than one product.`);
    usedFiles.add(file);
    return [{ sku: row.sku, file }];
  });
}
function ProductPhotoField({
  existingPath,
  previewUrl,
  removed,
  onSelect,
  onRemove,
}: {
  existingPath?: string | null;
  previewUrl: string;
  removed: boolean;
  onSelect: (file: File | null) => void;
  onRemove: () => void;
}) {
  const existingUrl = existingPath ? productImageUrl(existingPath) : "";
  const src = previewUrl || (!removed ? existingUrl : "");
  return (
    <div className="product-photo-field">
      <div className="product-photo-preview">
        {src ? <img src={src} alt="Product photo preview" /> : <Package size={28} />}
      </div>
      <div className="product-photo-controls">
        <strong>Product photo <small>Optional</small></strong>
        <small>
          JPEG, PNG or WebP · maximum {MAX_PRODUCT_IMAGE_SIZE / (1024 * 1024)} MB
        </small>
        <label className="button button-secondary product-photo-select">
          <ImagePlus size={16} />
          {previewUrl ? "Choose another photo" : "Choose photo"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => onSelect(event.target.files?.[0] || null)}
          />
        </label>
        {existingPath && !removed && !previewUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
          >
            Remove photo
          </Button>
        )}
      </div>
    </div>
  );
}
function ImportForm({ onClose }: { onClose: () => void }) {
  const { branch, refresh, notify, scale } = useWorkspace();
  const [rows, setRows] = useState<Record<string, string>[]>([]),
    [photoFiles, setPhotoFiles] = useState<File[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <p className="muted">
        Import up to 500 new products. All rows are validated before any records
        are saved. Prices are in your business currency.
      </p>
      <div className="info-strip">
        Required columns: name, sku, category, unit, cost, price, stock,
        threshold. Optional: barcode, image. Add photos named after each SKU
        (for example SKU-123.jpg), or put each selected photo's filename in the
        optional image column.
      </div>
      <label className="upload-zone">
        <Package size={28} />
        <strong>Choose a product CSV</strong>
        <small>UTF-8 · maximum 1 MB</small>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            setRows([]);
            setError("");
            try {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 1024 * 1024)
                throw new Error("Use a CSV smaller than 1 MB.");
              const parsed = parseCSV((await f.text()).replace(/^\uFEFF/, ""));
              const headers =
                parsed.shift()?.map((v) => v.trim().toLowerCase()) || [];
              for (const h of [
                "name",
                "sku",
                "category",
                "unit",
                "cost",
                "price",
                "stock",
                "threshold",
              ])
                if (!headers.includes(h))
                  throw new Error("Missing column: " + h);
              if (parsed.length > 500)
                throw new Error("Import up to 500 products at a time.");
              const r = parsed.map((row, i) => {
                if (row.length !== headers.length)
                  throw new Error(
                    `Row ${i + 2} has the wrong number of columns.`,
                  );
                return Object.fromEntries(
                  headers.map((h, j) => [h, row[j].trim()]),
                );
              });
              setRows(r);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      </label>
      <label className="upload-zone product-photo-upload-zone">
        <ImagePlus size={24} />
        <strong>Add product photos (optional)</strong>
        <small>
          JPEG, PNG or WebP · up to 5 MB each and 50 MB total
        </small>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(event) => {
            setPhotoFiles([]);
            setError("");
            try {
              const files = Array.from(event.target.files || []);
              const totalBytes = files.reduce((total, file) => total + file.size, 0);
              if (totalBytes > MAX_PRODUCT_IMPORT_IMAGE_BYTES)
                throw new Error("Selected product photos must total 50 MB or less.");
              const names = new Set<string>();
              for (const file of files) {
                validateProductImage(file);
                const name = file.name.toLowerCase();
                if (names.has(name))
                  throw new Error(`Choose only one photo named "${file.name}".`);
                names.add(name);
              }
              setPhotoFiles(files);
            } catch (reason) {
              setError((reason as Error).message);
            }
          }}
        />
      </label>
      {photoFiles.length > 0 && (
        <p className="muted product-photo-file-count">
          {photoFiles.length} photo{photoFiles.length === 1 ? "" : "s"} selected.
          Photos are matched by SKU filename unless the CSV image column is used.
        </p>
      )}
      {rows.length > 0 && (
        <div className="import-preview">
          <strong>{rows.length} products ready for validation</strong>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>SKU</th>
                  <th>Stock</th>
                  <th>Price</th>
                  {rows.some((row) => row.image) && <th>Photo file</th>}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((r, i) => (
                  <tr key={i}>
                    <td>{r.name}</td>
                    <td>{r.sku}</td>
                    <td>{r.stock}</td>
                    <td>{r.price}</td>
                    {rows.some((row) => row.image) && <td>{r.image || "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="form-footer">
        <Button
          disabled={!rows.length || busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const photoAssignments = matchProductPhotos(rows, photoFiles);
              await api("/products/import", {
                branch_id: branch,
                products: rows.map((r) => ({
                  ...r,
                  cost: toMinor(r.cost, scale),
                  price: toMinor(r.price, scale),
                  stock: Number(r.stock),
                  threshold: Number(r.threshold),
                })),
              });
              const importedCount = rows.length;
              setRows([]);
              setPhotoFiles([]);
              const photoFailures: string[] = [];
              if (photoAssignments.length) {
                try {
                  const workspace = await api<Workspace>(
                    `/workspace?branch=${encodeURIComponent(branch)}`,
                  );
                  const productsBySku = new Map(
                    workspace.products.map((product) => [
                      product.sku.toLowerCase(),
                      product,
                    ]),
                  );
                  const uploaded: { product_id: string; path: string; file: File }[] = [];
                  for (const assignment of photoAssignments) {
                    const product = productsBySku.get(assignment.sku.toLowerCase());
                    if (!product) {
                      photoFailures.push(assignment.file.name);
                      continue;
                    }
                    try {
                      const path = await uploadProductImage(
                        workspace.business.id,
                        product.id,
                        assignment.file,
                      );
                      uploaded.push({
                        product_id: product.id,
                        path,
                        file: assignment.file,
                      });
                    } catch (reason) {
                      photoFailures.push(
                        `${assignment.file.name}: ${(reason as Error).message}`,
                      );
                    }
                  }
                  if (uploaded.length) {
                    try {
                      await saveProductImagePaths(
                        uploaded.map(({ product_id, path }) => ({
                          product_id,
                          path,
                        })),
                      );
                    } catch (reason) {
                      for (const image of uploaded) {
                        try {
                          await removeProductImageObject(image.path);
                        } catch (cleanupReason) {
                          photoFailures.push(
                            `${image.file.name}: cleanup failed: ${(cleanupReason as Error).message}`,
                          );
                        }
                      }
                      photoFailures.push(
                        ...uploaded.map(
                          (image) =>
                            `${image.file.name}: image registration failed: ${(reason as Error).message}`,
                        ),
                      );
                    }
                  }
                } catch (reason) {
                  photoFailures.push(
                    ...photoAssignments.map(
                      (assignment) =>
                        `${assignment.file.name}: ${(reason as Error).message}`,
                    ),
                  );
                }
              }
              await refresh();
              const failedPhotoCount = new Set(
                photoFailures.map((failure) => failure.split(": ", 1)[0]),
              ).size;
              notify(
                failedPhotoCount
                  ? `${importedCount} products imported. ${failedPhotoCount} photo(s) could not be attached; edit those products to retry. ${photoFailures[0]}`
                  : `${importedCount} products imported${photoAssignments.length ? ` with ${photoAssignments.length} photo(s)` : ""}.`,
              );
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Importing…" : "Validate & import"}
        </Button>
      </div>
    </>
  );
}
function ProductQrDialog({
  product,
  onClose,
}: {
  product: Row;
  onClose: () => void;
}) {
  const [src, setSrc] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(product.sku, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 256,
    })
      .then((value) => {
        if (active) setSrc(value);
      })
      .catch((e: Error) => {
        if (active) setError(`Could not generate the product QR code: ${e.message}`);
      });
    return () => {
      active = false;
    };
  }, [product.sku]);
  return (
    <Modal
      title={`QR code · ${product.name}`}
      description="Scan this code to enter the product SKU in point of sale."
      onClose={onClose}
    >
      {error ? (
        <div className="error" role="alert">{error}</div>
      ) : src ? (
        <div className="qr-panel">
          <img src={src} alt={`QR code for ${product.name}, SKU ${product.sku}`} />
          <strong>{product.sku}</strong>
          <Button asChild>
            <a href={src} download={`${product.sku}-qr.png`}>
              <QrCode size={16} /> Download QR code
            </a>
          </Button>
        </div>
      ) : (
        <p className="muted">Generating QR code…</p>
      )}
    </Modal>
  );
}
type ProductOperation = {
  id: string;
  entityId: string;
  createdAt: string;
  body: string;
};
export function ActionDialog({
  type,
  record: r,
  onClose,
}: {
  type: string;
  record?: Row;
  onClose: () => void;
}) {
  const { data, branch, write, refresh, notify, money, scale } = useWorkspace();
  const [receiptSettings, setReceiptSettings] = useState(DEFAULT_RECEIPT_CONFIG);
  const [receiptTemplateError, setReceiptTemplateError] = useState("");
  const [productImage, setProductImage] = useState<File | null>(null);
  const [removeProductImage, setRemoveProductImage] = useState(false);
  const [productImagePreview, setProductImagePreview] = useState("");
  const productOperation = useRef<ProductOperation | null>(null);
  const pendingProductImage = useRef<{
    productId: string;
    file: File;
    path: string;
  } | null>(null);
  useEffect(() => {
    if (type !== "receipt" && type !== "invoice") return;
    let active = true;
    setReceiptSettings(DEFAULT_RECEIPT_CONFIG);
    setReceiptTemplateError("");
    api<{ templates: Array<{ config: ReceiptConfig; is_default: boolean }> }>(
      `/document-templates?document_type=${type === "invoice" ? "sales_invoice" : "sales_receipt"}`,
    )
      .then(({ templates }) => {
        if (active)
          setReceiptSettings(officialReceiptSettings(templates || []));
      })
      .catch((reason) => {
        if (active) setReceiptTemplateError((reason as Error).message);
      });
    return () => {
      active = false;
    };
  }, [type]);
  useEffect(() => {
    setProductImage(null);
    setRemoveProductImage(false);
    productOperation.current = null;
    pendingProductImage.current = null;
    return () => {
      const pending = pendingProductImage.current;
      pendingProductImage.current = null;
      if (pending) {
        void removeProductImageObject(pending.path).catch((reason) => {
          console.error("Could not clean up an unlinked product photo.", reason);
        });
      }
    };
  }, [type, r?.id]);
  useEffect(() => {
    if (!productImage) {
    setProductImagePreview("");
    return;
    }
    const url = URL.createObjectURL(productImage);
    setProductImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [productImage]);
  if (type === "qr" && r)
    return <ProductQrDialog product={r} onClose={onClose} />;
  const minor = (f: FormData, k: string) => toMinor(f.get(k), scale);
  const factor = 10 ** scale;
  let fields: FieldSpec[] = [],
    title = "",
    description = "",
    submit = "Save record";
  let handler: (f: FormData) => Promise<void> = async () => {};
  const branchOptions = data.branches.map((b) => ({
    value: b.id,
    label: b.name,
  }));
  if (type === "receipt" || type === "invoice") {
    const isInvoice = type === "invoice";
    const s = data.sales.find((s) => s.id === r?.id);
    return (
      <Modal
        title={isInvoice ? "Sales invoice" : "Sale receipt"}
        description={
          isInvoice
            ? "An itemized invoice showing the customer and payment status."
            : "A record of the completed sale."
        }
        onClose={onClose}
      >
        {s ? (
          <>
            <div className="document-print-area">
              <ReceiptDocument
                business={data.business}
                branch={data.branches.find((item) => item.id === s.branch_id)}
                sale={s}
                items={data.items.filter((item) => item.sale_id === s.id)}
                money={money}
                cashChange={isInvoice ? 0 : r?.change || 0}
                settings={receiptSettings}
                documentType={isInvoice ? "sales_invoice" : "sales_receipt"}
              />
            </div>
            {receiptTemplateError && (
              <p className="subtle-note" role="status">
                Saved {isInvoice ? "invoice" : "receipt"} templates are unavailable; showing the built-in
                print style. {receiptTemplateError}
              </p>
            )}
            <div className="form-footer">
              <Button onClick={() => window.print()}>
                <Printer size={16} />
                Print {isInvoice ? "invoice" : "receipt"}
              </Button>
            </div>
          </>
        ) : (
          <p>Receipt unavailable. Refresh the workspace to retry.</p>
        )}
      </Modal>
    );
  }
  if (type === "import")
    return (
      <Modal
        title="Import inventory"
        description="Bring your product catalog into Smartsell."
        onClose={onClose}
      >
        <ImportForm onClose={onClose} />
      </Modal>
    );
  if (type === "product") {
    title = r ? "Edit product" : "Add a product";
    description = "The next thing on your shelf starts here.";
    submit = r ? "Save changes" : "Create product";
    fields = [
      { name: "name", label: "Product name", value: r?.name },
      { name: "sku", label: "SKU", value: r?.sku },
      { name: "barcode", label: "Barcode", required: false, value: r?.barcode },
      { name: "category", label: "Category", value: r?.category || "General" },
      {
        name: "unit",
        label: "Unit",
        value: r?.unit || "piece",
        help: "Stock supports quantities to three decimal places.",
      },
      {
        name: "threshold",
        label: "Low stock threshold",
        type: "number",
        step: "0.001",
        value: r?.threshold ?? 5,
      },
      {
        name: "cost",
        label: `Cost price (${data.business.currency})`,
        type: "number",
        step: String(1 / factor),
        value: r ? (r.cost / factor).toFixed(scale) : undefined,
      },
      {
        name: "price",
        label: `Selling price (${data.business.currency})`,
        type: "number",
        step: String(1 / factor),
        value: r ? (r.price / factor).toFixed(scale) : undefined,
      },
      ...(!r
        ? [
            {
              name: "stock",
              label: "Opening stock · this branch",
              type: "number",
              step: "0.001",
              value: 0,
            },
          ]
        : []),
    ];
    handler = async (f) => {
      if (productImage) validateProductImage(productImage);
      const body: Record<string, unknown> = {
        ...Object.fromEntries(f),
        cost: minor(f, "cost"),
        price: minor(f, "price"),
        threshold: Number(f.get("threshold")),
        ...(r ? { version: r.version } : {}),
        ...(!r ? { branch_id: branch, stock: Number(f.get("stock")) } : {}),
      };
      const bodySnapshot = JSON.stringify(body);
      if (
        productOperation.current &&
        productOperation.current.body !== bodySnapshot
      )
        throw new Error(
          "A previous save for this product is still pending. Restore the original fields and retry, or close and reopen the editor to review the saved product.",
        );
      const operation: ProductOperation =
        productOperation.current ||
        {
          id: crypto.randomUUID(),
          entityId: r?.id || crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          body: bodySnapshot,
        };
      productOperation.current = operation;
      let saved: Row;
      try {
        saved = await api<Row>(
          "/products" + (r ? "/" + r.id : ""),
          body,
          r ? "PUT" : "POST",
          operation,
        );
      } catch (reason) {
        const message =
          reason instanceof Error ? reason.message : String(reason);
        const code =
          typeof reason === "object" && reason !== null && "code" in reason
            ? reason.code
            : undefined;
        if (typeof code === "string" && code) productOperation.current = null;
        if (message.includes("smartsell_products_business_id_sku_key")) {
          throw new Error(
            `SKU "${String(body.sku || "")}" is already used by another product in this business. Edit that product instead, or choose a unique SKU.`,
          );
        }
        if (r && message.includes("Product changed on another device")) {
          await refresh();
          throw new Error(
            "This product changed elsewhere. The latest data is refreshed; close and reopen the editor to review it before retrying.",
          );
        }
        throw reason;
      }
      const productId = r?.id || saved.id;
      if (!productId)
        throw new Error("Product saved, but its photo could not be linked. Refresh and try again.");
      const previousPath = r?.image_path as string | null | undefined;
      try {
        if (productImage) {
          let pending = pendingProductImage.current;
          if (
            pending &&
            (pending.productId !== productId || pending.file !== productImage)
          ) {
            await removeProductImageObject(pending.path);
            pendingProductImage.current = null;
            pending = null;
          }
          const path =
            pending?.path ||
            (await uploadProductImage(
              data.business.id,
              productId,
              productImage,
            ));
          pendingProductImage.current = {
            productId,
            file: productImage,
            path,
          };
          await saveProductImagePaths([{ product_id: productId, path }]);
          pendingProductImage.current = null;
          if (previousPath) await removeProductImageObject(previousPath);
        } else if (removeProductImage && previousPath) {
          await saveProductImagePaths([{ product_id: productId, path: null }]);
          await removeProductImageObject(previousPath);
        }
      } catch (reason) {
        await refresh();
        throw new Error(
          `Product saved, but its photo could not be fully updated: ${(reason as Error).message}`,
        );
      }
      productOperation.current = null;
      await refresh();
    };
  } else if (type === "variant") {
    const editing = Boolean(r?.variant_id);
    title = editing ? "Edit product variant" : "Add product variant";
    description = `${editing ? "Update" : "Create"} a SKU, barcode, price and stock record for ${r?.product_name || r?.name || "this product"}.`;
    submit = editing ? "Save variant" : "Create variant";
    fields = [
      { name: "name", label: "Variant name", value: r?.name },
      { name: "sku", label: "Variant SKU", value: r?.sku },
      { name: "barcode", label: "Barcode", required: false, value: r?.barcode },
      {
        name: "cost",
        label: `Cost price (${data.business.currency})`,
        type: "number",
        step: String(1 / factor),
        value: r ? (r.cost / factor).toFixed(scale) : undefined,
      },
      {
        name: "price",
        label: `Selling price (${data.business.currency})`,
        type: "number",
        step: String(1 / factor),
        value: r ? (r.price / factor).toFixed(scale) : undefined,
      },
      {
        name: "threshold",
        label: "Low stock threshold",
        type: "number",
        step: "0.001",
        value: r?.threshold ?? 0,
      },
      ...(!editing
        ? [
            {
              name: "stock",
              label: "Opening stock · this branch",
              type: "number",
              step: "0.001",
              value: 0,
            },
          ]
        : []),
    ];
    handler = async (f) => {
      const body = {
        ...Object.fromEntries(f),
        cost: minor(f, "cost"),
        price: minor(f, "price"),
        threshold: Number(f.get("threshold")),
        ...(editing
          ? {}
          : { branch_id: branch, stock: Number(f.get("stock")) }),
      };
      const productId = r?.product_id || r?.id;
      await write(
        `/products/${productId}/variants${editing ? `/${r?.variant_id}` : ""}`,
        body,
        editing ? "PUT" : "POST",
      );
    };
  } else if (type === "stock") {
    title = "Adjust stock";
    description = `${r?.name} · ${r?.stock} ${r?.unit} available in this branch.`;
    submit = "Record stock movement";
    fields = [
      {
        name: "mode",
        label: "Movement type",
        value: "add",
        options: [
          { value: "add", label: "Top up stock" },
          { value: "remove", label: "Remove / correct stock" },
          ...(data.user.role === "owner" && data.branches.length > 1
            ? [{ value: "transfer", label: "Transfer to another branch" }]
            : []),
        ],
      },
      {
        name: "quantity",
        label: "Quantity",
        type: "number",
        step: "0.001",
        min: 1,
      },
      {
        name: "reason",
        label: "Reason",
        placeholder: "e.g. Stock count correction",
      },
      {
        name: "destination",
        label: "Destination (transfers only)",
        required: false,
        value: "",
        options: [
          { value: "", label: "Not a transfer" },
          ...branchOptions.filter((b) => b.value !== branch),
        ],
      },
    ];
    handler = async (f) => {
      const mode = f.get("mode");
      await write("/stock", {
        product_id: r?.product_id || r?.id,
        branch_id: branch,
        delta: Number(f.get("quantity")) * (mode === "add" ? 1 : -1),
        reason: f.get("reason"),
        ...(r?.variant_id ? { variant_id: r.variant_id } : {}),
        ...(mode === "transfer" ? { destination: f.get("destination") } : {}),
      });
    };
  } else if (type === "customer" || type === "supplier") {
    title = type === "customer" ? "Add a customer" : "Add a supplier";
    description = "A better connection starts with the details.";
    fields = [
      { name: "name", label: "Full name / business name" },
      { name: "email", label: "Email", type: "email", required: false },
      { name: "phone", label: "Phone number", required: false },
      { name: "address", label: "Address", type: "textarea", required: false },
    ];
    handler = async (f) => {
      await write("/parties", { ...Object.fromEntries(f), kind: type });
    };
  } else if (type === "purchase") {
    title = "Create purchase order";
    description = "Stock changes only after you confirm receipt of the goods.";
    fields = [
      {
        name: "supplier_id",
        label: "Supplier",
        options: data.parties
          .filter((p) => p.kind === "supplier")
          .map((p) => ({ value: p.id, label: p.name })),
      },
      {
        name: "product_id",
        label: "Product",
        options: data.products.flatMap((p) => [
          { value: p.id, label: p.name },
          ...(p.variants || []).map((v: Row) => ({
            value: `${p.id}|${v.id}`,
            label: `${p.name} · ${v.name}`,
          })),
        ]),
      },
      {
        name: "quantity",
        label: "Quantity",
        type: "number",
        min: 1,
        step: "0.001",
      },
      {
        name: "cost",
        label: `Unit purchase cost (${data.business.currency})`,
        type: "number",
        step: String(1 / factor),
      },
    ];
    handler = async (f) => {
      const selectedProduct = String(f.get("product_id") || "");
      const [productId, variantId] = selectedProduct.split("|");
      await write("/purchases", {
        ...Object.fromEntries(f),
        product_id: productId,
        ...(variantId ? { variant_id: variantId } : {}),
        branch_id: branch,
        quantity: Number(f.get("quantity")),
        cost: minor(f, "cost"),
      });
    };
  } else if (type === "expense") {
    title = "Record an expense";
    description = "Keep the cost of doing business in view.";
    fields = [
      { name: "name", label: "Description" },
      {
        name: "category",
        label: "Category",
        value: "Operations",
        options: [
          "Operations",
          "Rent",
          "Utilities",
          "Transport",
          "Salaries",
          "Marketing",
          "Other",
        ].map((s) => ({ value: s, label: s })),
      },
      {
        name: "amount",
        label: `Amount (${data.business.currency})`,
        type: "number",
        step: String(1 / factor),
      },
      {
        name: "date",
        label: "Date",
        type: "date",
        value: new Intl.DateTimeFormat("en-CA", {
          timeZone: data.business.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date()),
      },
    ];
    handler = async (f) => {
      await write("/expenses", {
        ...Object.fromEntries(f),
        branch_id: branch,
        amount: minor(f, "amount"),
      });
    };
  } else if (type === "branch") {
    title = r ? "Edit branch" : "Add a branch";
    description = r
      ? `${r.is_default ? "Main branch" : "Branch"} · update its contact details.`
      : "Make room for your next location.";
    fields = [
      { name: "name", label: "Branch name", value: r?.name },
      { name: "phone", label: "Phone number", required: false, value: r?.phone },
      {
        name: "address",
        label: "Location / address",
        type: "textarea",
        required: false,
        value: r?.address,
      },
    ];
    handler = async (f) => {
      await write(
        "/branches" + (r ? `/${r.id}` : ""),
        Object.fromEntries(f),
        r ? "PUT" : "POST",
      );
    };
  } else if (type === "staff") {
    title = "Add a team member";
    description =
      "Create a user profile, assign a role and choose whether access must be suspended or expire on a date.";
    submit = "Create team member";
    fields = [
      { name: "name", label: "Full name" },
      { name: "email", label: "Email", type: "email" },
      {
        name: "role",
        label: "Role",
        value: "cashier",
        options: [
          { value: "cashier", label: "Cashier · POS and own sales" },
          { value: "manager", label: "Manager · assigned branch operations" },
        ],
      },
      {
        name: "branch_id",
        label: "Assigned branch",
        value: branch,
        options: branchOptions,
      },
      {
        name: "account_status",
        label: "Access status",
        value: "active",
        options: [
          { value: "active", label: "Active" },
          { value: "pending", label: "Pending review" },
          { value: "suspended", label: "Suspended" },
        ],
      },
      {
        name: "expires_at",
        label: "Access expires on",
        type: "date",
        required: false,
      },
    ];
    handler = async (f) => {
      const payload = Object.fromEntries(f);
      await write("/staff", {
        ...payload,
        expires_at: payload.expires_at || "",
      });
      await refresh();
    };
  } else if (type === "staff-edit") {
    title = "Edit team member";
    description = `Update ${r?.name}'s role, assigned branch and account lifecycle. Their existing sessions will be revoked after saving.`;
    submit = "Save team member";
    fields = [
      { name: "name", label: "Full name", value: r?.name },
      {
        name: "role",
        label: "Role",
        value: r?.role,
        options: [
          { value: "cashier", label: "Cashier · POS and own sales" },
          { value: "manager", label: "Manager · assigned branch operations" },
        ],
      },
      {
        name: "branch_id",
        label: "Assigned branch",
        value: r?.branch_id,
        options: branchOptions,
      },
      {
        name: "account_status",
        label: "Access status",
        value: (r?.account_status || (r?.active ? "active" : "suspended")) as string,
        options: [
          { value: "active", label: "Active" },
          { value: "pending", label: "Pending review" },
          { value: "suspended", label: "Suspended" },
        ],
      },
      {
        name: "expires_at",
        label: "Access expires on",
        type: "date",
        required: false,
        value: r?.expires_at ? new Date(r.expires_at).toISOString().slice(0, 10) : "",
      },
    ];
    handler = async (f) => {
      const payload = Object.fromEntries(f);
      await write(`/staff/${r?.id}`, {
        ...payload,
        expires_at: payload.expires_at || "",
      }, "PUT");
    };
  } else if (type === "receive") {
    title = "Receive purchase goods";
    description = `${r?.reference} · ${r?.supplier}`;
    submit = "Confirm goods received";
    fields = [];
    handler = async () => {
      await write(`/purchases/${r?.id}/receive`, {});
    };
  } else if (type === "payment") {
    title = "Record cash payment";
    description = `${r?.reference} · ${money(r!.total - r!.paid)} outstanding`;
    submit = "Record payment";
    fields = [
      {
        name: "amount",
        label: `Payment amount (${data.business.currency})`,
        type: "number",
        step: String(1 / factor),
        value: ((r!.total - r!.paid) / factor).toFixed(scale),
      },
    ];
    handler = async (f) => {
      await write("/payments", {
        id: r?.id,
        kind: r?.kind,
        amount: minor(f, "amount"),
      });
    };
  } else if (type === "refund") {
    title = "Refund this sale?";
    description = r?.reference || "";
    submit = "Confirm full refund";
    fields = [
      {
        name: "confirmation",
        label: "Type REFUND to confirm",
        placeholder: "REFUND",
      },
    ];
    handler = async (f) => {
      if (f.get("confirmation") !== "REFUND")
        throw new Error("Type REFUND to continue.");
      await write(`/sales/${r?.id}/refund`, {});
    };
  } else if (type === "staff-toggle") {
    const isSuspended = (r?.account_status || (r?.active ? "active" : "suspended")) === "suspended";
    title = isSuspended ? "Restore staff access?" : "Suspend staff access?";
    description = `${r?.name} · ${r?.email}`;
    submit = isSuspended ? "Restore access" : "Suspend access";
    handler = async () => {
      await write(`/staff/${r?.id}/toggle`, {});
    };
  } else if (type === "staff-delete") {
    title = "Delete team member?";
    description = `${r?.name} · ${r?.email}`;
    submit = "Delete member";
    handler = async () => {
      await write(`/staff/${r?.id}`, {}, "DELETE");
    };
  }
  return (
    <Modal title={title} description={description} onClose={onClose}>
      <Form
        submit={submit}
        onSubmit={async (f) => {
          await handler(f);
          notify(
            type === "receive"
              ? "Goods received. Inventory and supplier payable updated."
              : type === "refund"
                ? "Sale refunded and stock returned. Record the cash refund with your customer."
                : type === "staff"
                  ? "Invitation email sent. Your teammate can accept it and set their own password."
                  : type === "staff-delete"
                    ? "Team member removed and the dashboard has been refreshed."
                    : "Saved successfully.",
          );
          onClose();
        }}
      >
        <Fields fields={fields} />
        {type === "product" && (
          <ProductPhotoField
            existingPath={r?.image_path}
            previewUrl={productImagePreview}
            removed={removeProductImage}
            onSelect={(file) => {
              setProductImage(file);
              setRemoveProductImage(false);
            }}
            onRemove={() => {
              setProductImage(null);
              setRemoveProductImage(true);
            }}
          />
        )}
        {type === "receive" && (
          <div className="confirmation-summary">
            <Package size={28} />
            <h3>
              {r?.quantity} × {r?.product}
            </h3>
            <p>
              This will add stock to the order’s branch and create a supplier
              payable of {money(r!.total)}.
            </p>
          </div>
        )}
        {type === "refund" && (
          <div className="warning-strip">
            <TriangleAlert size={20} />
            <p>
              This returns all items to stock and reverses the sale in reports.
              Return any collected cash to the customer separately. This records
              a full refund, not a gateway payment.
            </p>
          </div>
        )}
        {type === "staff-toggle" && (
          <p className="muted">
            {r?.active
              ? "All sessions for this account will be revoked immediately."
              : "This team member will be able to sign in again."}
          </p>
        )}
        {type === "staff-delete" && (
          <div className="warning-strip">
            <TriangleAlert size={18} />
            <p>
              This permanently removes the user record from the business dashboard
              and closes their active sessions. The team list will refresh after
              the deletion completes.
            </p>
          </div>
        )}
        {type === "purchase" &&
          (!data.products.length ||
            !data.parties.some((p) => p.kind === "supplier")) && (
            <div className="warning-strip">
              Add at least one product and supplier before creating an order.
            </div>
          )}
      </Form>
    </Modal>
  );
}
