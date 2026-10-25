import { errorMessageOf } from "@/components/patterns/errorMessage";
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  CheckCircle2,
  Hash,
  KeyRound,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import {
  productMasterApi,
  type MasterDataAuditEvent,
  type Product,
  type ProductVariant,
} from '../api/productMaster';

/**
 * Product Master — Product → Variant → SKU, with the approval path and the
 * audit history that make the data trustworthy enough for a warehouse to
 * receive stock against.
 *
 * What this page deliberately does NOT do:
 *   • invent SKUs in the browser — allocation happens server-side, once, from a
 *     tenant-scoped sequence that never reuses a number;
 *   • let a variant be approved before its product is approved;
 *   • let an approved record be silently overwritten.
 */

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
  PENDING_APPROVAL: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  APPROVED: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  REJECTED: 'bg-red-500/10 text-red-300 border-red-500/30',
  RETIRED: 'bg-slate-700/20 text-slate-400 border-slate-600/30',
};

function Badge({ value }: { value?: string | null }) {
  if (!value) return null;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide ${STATUS_STYLES[value] ?? STATUS_STYLES.DRAFT}`}>
      {value.replace(/_/g, ' ')}
    </span>
  );
}

export default function ProductMasterPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [audit, setAudit] = useState<MasterDataAuditEvent[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [productForm, setProductForm] = useState({ code: '', name: '', category: '', brand: '', unitOfMeasure: 'EA' });
  const [variantForm, setVariantForm] = useState({ productId: '', code: '', name: '', attributes: '{"colour":"", "size":""}' });

  const load = useCallback(() => (async () => {
    const { enabled: isEnabled } = await productMasterApi.isEnabled();
    setEnabled(isEnabled);
    if (!isEnabled) {
      setProducts([]);
      setVariants([]);
      setAudit([]);
      return;
    }
    const [productData, variantData, auditData] = await Promise.all([
      productMasterApi.listProducts(search ? { search } : undefined),
      productMasterApi.listVariants(),
      productMasterApi.listAudit(),
    ]);
    setProducts(productData);
    setVariants(variantData);
    setAudit(auditData);

  })().catch((err: unknown) => {
    setError(errorMessageOf(err) || 'Could not load master data');

  }).finally(() => {
    setLoading(false);

  }), [search]);

  useEffect(() => {
    void load();
  }, [load]);

  const variantsByProduct = useMemo(() => {
    const map = new Map<string, ProductVariant[]>();
    for (const variant of variants) {
      const bucket = map.get(variant.productId) ?? [];
      bucket.push(variant);
      map.set(variant.productId, bucket);
    }
    return map;
  }, [variants]);

  async function run(action: string, fn: () => Promise<unknown>, successMessage?: string) {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (successMessage) setNotice(successMessage);
      await load();
    } catch (err) {
      setError(errorMessageOf(err) || 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  if (loading && enabled === null) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading master data…
      </div>
    );
  }

  if (enabled === false) {
    return (
      <div className="p-6 max-w-3xl">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-200">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldAlert className="h-5 w-5" /> Product master data is switched off
          </div>
          <p className="mt-2 text-sm text-amber-100/80">
            Master data is created and approved through this module, which ships disabled. Enable it with{' '}
            <code className="text-amber-200">PRODUCT_MASTER_ENABLED=true</code> (or{' '}
            <code className="text-amber-200">PROCESS_CONTROL_ENABLED=true</code>) in a non-production
            environment. It also stays off in production until the production gates are signed off.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-100">
            <Boxes className="h-6 w-6 text-sky-400" /> Product Master
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Products, their variants, and the tenant-scoped SKUs that stock, receipts and picks are all
            recorded against.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code, name, brand"
              className="w-64 rounded-lg border border-slate-700 bg-slate-900/60 py-2 pl-8 pr-3 text-sm text-slate-200 placeholder:text-slate-500"
            />
          </div>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800/60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </header>

      {(error || notice) && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            error ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
          }`}
        >
          {error ?? notice}
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <h2 className="flex items-center gap-2 text-sm font-medium text-slate-200">
            <Package className="h-4 w-4 text-sky-400" /> Onboard a product
          </h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              value={productForm.code}
              onChange={(e) => setProductForm({ ...productForm, code: e.target.value })}
              placeholder="Product code (PROD-001)"
              className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
            />
            <input
              value={productForm.name}
              onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
              placeholder="Product name"
              className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
            />
            <input
              value={productForm.category}
              onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
              placeholder="Category"
              className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
            />
            <input
              value={productForm.brand}
              onChange={(e) => setProductForm({ ...productForm, brand: e.target.value })}
              placeholder="Brand"
              className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
            />
          </div>
          <button
            disabled={!productForm.code || !productForm.name || busy === 'create-product'}
            onClick={() =>
              run(
                'create-product',
                async () => {
                  await productMasterApi.createProduct(productForm);
                  setProductForm({ code: '', name: '', category: '', brand: '', unitOfMeasure: 'EA' });
                },
                'Product created as a draft — it needs approval before its variants can be approved',
              )
            }
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-200 hover:bg-sky-500/20 disabled:opacity-50"
          >
            {busy === 'create-product' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create product
          </button>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <h2 className="flex items-center gap-2 text-sm font-medium text-slate-200">
            <Hash className="h-4 w-4 text-sky-400" /> Add a variant
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Attributes are normalised before they are fingerprinted, so “Red” and “red ” cannot become two
            variants of the same thing.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select
              value={variantForm.productId}
              onChange={(e) => setVariantForm({ ...variantForm, productId: e.target.value })}
              className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200"
            >
              <option value="">Select product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
            <input
              value={variantForm.code}
              onChange={(e) => setVariantForm({ ...variantForm, code: e.target.value })}
              placeholder="Variant code (PROD-001-RED-L)"
              className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
            />
            <input
              value={variantForm.name}
              onChange={(e) => setVariantForm({ ...variantForm, name: e.target.value })}
              placeholder="Variant name"
              className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
            />
            <input
              value={variantForm.attributes}
              onChange={(e) => setVariantForm({ ...variantForm, attributes: e.target.value })}
              placeholder='{"colour":"Red","size":"L"}'
              className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 font-mono text-xs text-slate-200 placeholder:text-slate-500"
            />
          </div>
          <button
            disabled={!variantForm.productId || !variantForm.code || !variantForm.name || busy === 'create-variant'}
            onClick={() =>
              run(
                'create-variant',
                async () => {
                  // Parsed inline so a malformed payload fails before any request
                  // is sent, with a message the operator can act on.
                  const attributes = (() => {
                    try {
                      return JSON.parse(variantForm.attributes || '{}') as Record<string, unknown>;
                    } catch {
                      throw new Error('Attributes must be valid JSON, e.g. {"colour":"Red"}');
                    }
                  })();

                  await productMasterApi.createVariant(variantForm.productId, {
                    code: variantForm.code,
                    name: variantForm.name,
                    attributes,
                  });
                  setVariantForm({ productId: '', code: '', name: '', attributes: '{"colour":"", "size":""}' });
                },
                'Variant created — SKUs are allocated when it is approved',
              )
            }
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-200 hover:bg-sky-500/20 disabled:opacity-50"
          >
            {busy === 'create-variant' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create variant
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40">
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3 text-sm font-medium text-slate-200">
          <Package className="h-4 w-4 text-sky-400" /> Products and variants
          <span className="ml-auto text-xs text-slate-500">{products.length} product(s)</span>
        </div>
        {products.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">No products yet. No rows are pre-created for future stock.</p>
        ) : (
          <div className="divide-y divide-slate-800">
            {products.map((product) => (
              <div key={product.id} className="p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xs text-slate-400">{product.code}</span>
                  <span className="text-sm font-medium text-slate-100">{product.name}</span>
                  <Badge value={product.status} />
                  {product.possibleDuplicate && (
                    <span className="text-[11px] text-amber-300">
                      possible duplicate of {product.possibleDuplicate.code}
                    </span>
                  )}
                  <span className="text-xs text-slate-500">revision {product.revision}</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {product.status === 'DRAFT' && (
                    <button
                      disabled={busy === `submit-${product.id}`}
                      onClick={() =>
                        run(`submit-${product.id}`, () => productMasterApi.submitProduct(product.id), 'Product submitted for approval')
                      }
                      className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/20"
                    >
                      Submit for approval
                    </button>
                  )}
                  {product.status === 'PENDING_APPROVAL' && (
                    <>
                      <button
                        disabled={busy === `approve-${product.id}`}
                        onClick={() =>
                          run(`approve-${product.id}`, () => productMasterApi.approveProduct(product.id, true), 'Product approved')
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                      </button>
                      <button
                        disabled={busy === `reject-${product.id}`}
                        onClick={() =>
                          run(`reject-${product.id}`, () => productMasterApi.approveProduct(product.id, false), 'Product rejected')
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-200 hover:bg-red-500/20"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Reject
                      </button>
                    </>
                  )}
                </div>

                {(variantsByProduct.get(product.id) ?? []).length > 0 && (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40">
                    {(variantsByProduct.get(product.id) ?? []).map((variant) => (
                      <div key={variant.id} className="flex flex-wrap items-center gap-3 border-b border-slate-800/60 px-3 py-2 last:border-b-0">
                        <span className="font-mono text-xs text-slate-400">{variant.code}</span>
                        <span className="text-xs text-slate-200">{variant.name}</span>
                        <Badge value={variant.status} />
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                          <KeyRound className="h-3 w-3" />
                          {variant.sku ?? 'no SKU yet'}
                        </span>
                        <span className="font-mono text-[11px] text-slate-600">
                          {Object.entries(variant.attributes ?? {})
                            .map(([k, v]) => `${k}=${String(v)}`)
                            .join(' · ')}
                        </span>

                        {variant.status !== 'APPROVED' && (
                          <button
                            disabled={busy === `approve-variant-${variant.id}`}
                            onClick={() =>
                              run(
                                `approve-variant-${variant.id}`,
                                () => productMasterApi.approveVariant(variant.id, true),
                                'Variant approved and a SKU allocated',
                              )
                            }
                            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200 hover:bg-emerald-500/20"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Approve variant
                          </button>
                        )}
                        {variant.status === 'APPROVED' && !variant.sku && (
                          <button
                            disabled={busy === `sku-${variant.id}`}
                            onClick={() =>
                              run(`sku-${variant.id}`, () => productMasterApi.allocateSku(variant.id), 'SKU allocated')
                            }
                            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-xs text-sky-200 hover:bg-sky-500/20"
                          >
                            <Hash className="h-3.5 w-3.5" /> Allocate SKU
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40">
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3 text-sm font-medium text-slate-200">
          <ShieldAlert className="h-4 w-4 text-slate-400" /> Master-data audit history
        </div>
        {audit.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">Nothing recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {audit.slice(0, 20).map((event) => (
              <li key={event.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-xs text-slate-400">
                <span className="text-slate-500">{new Date(event.createdAt).toLocaleString()}</span>
                <span className="font-mono text-slate-300">{event.eventType}</span>
                <span>{event.description}</span>
                <span className="ml-auto text-slate-500">{event.actorName ?? event.actorId}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
