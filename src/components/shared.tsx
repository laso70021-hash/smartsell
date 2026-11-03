import { useEffect, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDownUp,
  PackageOpen,
  Search,
  X,
  ArrowRight,
  LoaderCircle,
} from "lucide-react";
import { Button } from "./ui/button";
import type { Row } from "../lib/api";
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className="logo">
      {small ? (
        <img
          className="logo-icon"
          src="/brand/smartsell-icon.png"
          alt="Smartsell"
          width="34"
          height="33"
        />
      ) : (
        <>
          <img
            className="logo-wordmark"
            src="/brand/swahivo-pos-logo.png"
            alt="Swahivo"
            width="148"
            height="37"
          />
        </>
      )}
    </span>
  );
}
export function Empty({
  title = "Nothing here yet",
  description = "Your records will appear here as you start working.",
  action,
  icon: Icon = PackageOpen,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  icon?: typeof PackageOpen;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={24} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function ProductPhoto({
  src,
  alt,
  className,
}: {
  src?: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? (
    <img
      className={className}
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    <PackageOpen className={className} aria-hidden="true" />
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal">
          <div className="modal-head">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>
                {description || "Complete the details below."}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close dialog">
                <X size={19} />
              </Button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export type FieldSpec = {
  name: string;
  label: string;
  type?: string;
  value?: string | number;
  options?: { value: string; label: string }[];
  required?: boolean;
  min?: number;
  step?: string;
  placeholder?: string;
  help?: string;
  maxLength?: number;
  disabled?: boolean;
  otherOption?: boolean;
  otherValue?: string;
  otherFieldName?: string;
};
export function Fields({ fields }: { fields: FieldSpec[] }) {
  const initialValues = () =>
    Object.fromEntries(
      fields.flatMap((f) => [
        [f.name, String(f.value ?? "")],
        ...(f.otherOption
          ? [[f.otherFieldName || `${f.name}_other`, String(f.otherValue ?? "")]]
          : []),
      ]),
    );
  const [values, setValues] = useState<Record<string, string>>(initialValues);

  useEffect(() => {
    setValues((current) => {
      const next = { ...current };
      let changed = false;
      for (const field of fields) {
        const nextValue = String(field.value ?? "");
        if (next[field.name] !== nextValue) {
          next[field.name] = nextValue;
          changed = true;
        }
        if (field.otherOption) {
          const otherName = field.otherFieldName || `${field.name}_other`;
          const otherValue = String(field.otherValue ?? "");
          if (next[otherName] !== otherValue) {
            next[otherName] = otherValue;
            changed = true;
          }
        }
      }
      return changed ? next : current;
    });
  }, [
    fields
      .map(
        (field) =>
          `${field.name}:${String(field.value ?? "")}:${field.otherOption ? field.otherFieldName || `${field.name}_other` : ""}:${String(field.otherValue ?? "")}`,
      )
      .join("|"),
  ]);

  const updateField = (name: string, value: string) =>
    setValues((current) => ({ ...current, [name]: value }));

  return (
    <div className="form-grid">
      {fields.map((f) => {
        const fieldValue = values[f.name] ?? String(f.value ?? "");
        const customKey = f.otherFieldName || `${f.name}_other`;
        const customValue = values[customKey] ?? String(f.otherValue ?? "");
        return (
          <label
            className={"field " + (f.type === "textarea" ? "full" : "")}
            key={f.name}
          >
            <span>
              {f.label}
              {f.required === false ? <small>Optional</small> : null}
            </span>
            {f.options ? (
              <select
                name={f.name}
                value={fieldValue}
                onChange={(e) => updateField(f.name, e.target.value)}
                required={f.required !== false}
                disabled={f.disabled}
              >
                {f.value === undefined && (
                  <option value="" disabled>
                    Select {f.label.toLowerCase()}
                  </option>
                )}
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                name={f.name}
                value={fieldValue}
                onChange={(e) => updateField(f.name, e.target.value)}
                required={f.required !== false}
                maxLength={500}
                disabled={f.disabled}
              />
            ) : (
              <input
                name={f.name}
                type={f.type || "text"}
                value={fieldValue}
                onChange={(e) => updateField(f.name, e.target.value)}
                required={f.required !== false}
                min={f.min ?? (f.type === "number" ? 0 : undefined)}
                step={f.step}
                placeholder={f.placeholder}
                maxLength={f.maxLength ?? 200}
                disabled={f.disabled}
                autoComplete={f.type === "password" ? "new-password" : undefined}
              />
            )}{" "}
            {f.otherOption && fieldValue === "Other" && (
              <input
                name={customKey}
                aria-label={`Enter ${f.label.toLowerCase()}`}
                placeholder={`Enter ${f.label.toLowerCase()}`}
                value={customValue}
                onChange={(e) => updateField(customKey, e.target.value)}
                required
                maxLength={200}
              />
            )}
            {f.help && <small>{f.help}</small>}
          </label>
        );
      })}
    </div>
  );
}
export function Form({
  children,
  onSubmit,
  submit = "Save changes",
}: {
  children: ReactNode;
  onSubmit: (data: FormData) => Promise<void>;
  submit?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        const data = new FormData(e.currentTarget);
        setBusy(true);
        try {
          await onSubmit(data);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="form-footer">
        <Button disabled={busy} type="submit">
          {busy ? <LoaderCircle size={16} className="spin" /> : null}
          {submit}
          <ArrowRight size={16} />
        </Button>
      </div>
    </form>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-actions">{actions}</div>
    </div>
  );
}
export type Column = {
  key: string;
  label: string;
  render?: (r: Row) => ReactNode;
};
export function DataTable({
  rows,
  columns,
  searchPlaceholder = "Search records…",
  emptyTitle,
  emptyDescription,
  action,
}: {
  rows: Row[];
  columns: Column[];
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  action?: ReactNode;
}) {
  const [search, setSearch] = useState(""),
    [sort, setSort] = useState(""),
    [direction, setDirection] = useState(1),
    [page, setPage] = useState(0);
  const filtered = rows
    .filter((r) =>
      Object.values(r).some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    )
    .sort((a, b) => {
      const av = a[sort],
        bv = b[sort];
      return (
        direction *
        (typeof av === "number"
          ? av - bv
          : String(av ?? "").localeCompare(String(bv ?? "")))
      );
    });
  const pages = Math.max(1, Math.ceil(filtered.length / 10)),
    current = Math.min(page, pages - 1);
  return (
    <div className="panel table-panel">
      <div className="table-toolbar">
        <label className="search">
          <Search size={17} />
          <input
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <span className="muted">{filtered.length} records</span>
        {action}
      </div>
      {filtered.length ? (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key}>
                      <button
                        className="sort"
                        onClick={() => {
                          setSort(c.key);
                          setDirection(sort === c.key ? -direction : 1);
                        }}
                      >
                        {c.label}
                        <ArrowDownUp size={11} />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(current * 10, current * 10 + 10).map((r) => (
                  <tr key={r.id}>
                    {columns.map((c) => (
                      <td key={c.key}>{c.render ? c.render(r) : r[c.key]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span>
              Showing {current * 10 + 1}–
              {Math.min(current * 10 + 10, filtered.length)} of{" "}
              {filtered.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </Button>
            <span>
              {current + 1} / {pages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={current + 1 === pages}
              onClick={() => setPage(current + 1)}
            >
              Next
            </Button>
          </div>
        </>
      ) : (
        <Empty
          title={search ? "No matching records" : emptyTitle}
          description={
            search
              ? "Try another search or clear your filters."
              : emptyDescription
          }
          action={action}
        />
      )}
    </div>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
