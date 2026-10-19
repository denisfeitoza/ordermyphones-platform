import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminHeading, Panel } from "@/components/admin/parts";
import { Button } from "@/components/ui/Button";
import {
  useAllAccountTerms,
  useRecordDeposit,
  useSetAccountTerms,
} from "@/data/accounts";
import { PAYMENT_TERMS, TERMS_LABEL, type PaymentTerms } from "@/lib/payment";
import { DB_TIER_LABELS, type DbTier } from "@/lib/invites";
import { parseMoneyToCents } from "@/lib/money";
import { adminErrorMessage } from "@/lib/adminErrors";
import { formatUsd } from "@/lib/format";
import { useI18n } from "@/i18n";
import {
  DOCUMENT_SLOTS,
  documentUrl,
  useAccountDocuments,
  useAgreementSignatures,
  useAgreementVersions,
  useBusinessProfile,
  useReviewBusinessProfile,
  useReviewDocument,
  type Address,
  type Contact,
} from "@/data/onboarding";
import { formatDate } from "@/lib/format";
import { AUCTIONS_ENABLED } from "@/lib/features";

interface AccountProfile {
  id: string;
  email: string;
  display_name: string | null;
  tier: DbTier | null;
  is_test: boolean;
}

const inputCls =
  "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand";

/**
 * Admin → Customers → one account: payment terms, credit limit and the
 * auction deposit (and, as they land, business profile, documents and the
 * signed agreement).
 */
export default function CustomerAccountPage() {
  const { t } = useI18n();
  const { id = "" } = useParams();
  const profile = useQuery({
    queryKey: ["account-profile", id],
    queryFn: async (): Promise<AccountProfile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, display_name, tier, is_test")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as AccountProfile | null;
    },
  });
  const p = profile.data;

  return (
    <div className="space-y-6">
      <Link
        to="/admin/customers"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2} />
        {t("Customers")}
      </Link>
      <AdminHeading
        title={p ? (p.display_name ?? p.email) : "Customer"}
        {...(p
          ? {
              subtitle: `${p.email} · ${p.tier ? t(DB_TIER_LABELS[p.tier]) : t("No tier")}`,
            }
          : {})}
      />
      {profile.isLoading && (
        <p className="text-sm text-muted-foreground">{t("Loading…")}</p>
      )}
      {p && <TermsPanel accountId={p.id} />}
      {p && <OnboardingPanels accountId={p.id} />}
    </div>
  );
}

function TermsPanel({ accountId }: { accountId: string }) {
  const { t } = useI18n();
  const all = useAllAccountTerms();
  const save = useSetAccountTerms();
  const current = all.data?.get(accountId);
  const [terms, setTerms] = useState<PaymentTerms>("cia");
  const [limit, setLimit] = useState("");
  const [deposit, setDeposit] = useState(true);

  useEffect(() => {
    if (!all.isSuccess) return;
    setTerms(current?.paymentTerms ?? "cia");
    setLimit(
      current?.creditLimitCents === null ||
        current?.creditLimitCents === undefined
        ? ""
        : (current.creditLimitCents / 100).toFixed(2),
    );
    setDeposit(current?.auctionDepositRequired ?? true);
  }, [all.isSuccess, current]);

  const limitCents = limit.trim() === "" ? null : parseMoneyToCents(limit);
  const limitInvalid =
    limit.trim() !== "" && (limitCents === null || limitCents < 0);
  const needsLimit = terms !== "cia" && limitCents === null;

  return (
    <Panel title={t("Payment terms and credit")}>
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
            {t("Terms")}
          </span>
          <select
            value={terms}
            onChange={(e) => setTerms(e.target.value as PaymentTerms)}
            className={inputCls}
          >
            {PAYMENT_TERMS.map((k) => (
              <option key={k} value={k}>
                {t(TERMS_LABEL[k])}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
            {t("Credit limit (USD)")}
          </span>
          <input
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            inputMode="decimal"
            placeholder={t("No limit set")}
            className={inputCls}
            aria-invalid={limitInvalid || undefined}
          />
        </label>
        {AUCTIONS_ENABLED && (
          <label className="flex items-end gap-2 pb-3 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand"
              checked={deposit}
              onChange={(e) => setDeposit(e.target.checked)}
            />
            {t("Auction deposit required")}
          </label>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {terms === "cia"
          ? t(
              "Cash in advance: orders ship only after you mark them paid. No credit is used.",
            )
          : needsLimit
            ? t(
                "COD and Net terms use credit: without a limit, every approval asks you to confirm.",
              )
            : `${t("Approval checks the open balance plus the new order against")} ${formatUsd(limitCents ?? 0)}, ${t("and blocks while an invoice is overdue (you can approve anyway).")}`}
      </p>
      {AUCTIONS_ENABLED && (
        <DepositRow
          accountId={accountId}
          receivedCents={current?.auctionDepositReceivedCents ?? 0}
          required={deposit}
        />
      )}
      {save.isError && (
        <p className="mt-2 text-sm text-destructive">
          {adminErrorMessage(t, save.error.message)}
        </p>
      )}
      <div className="mt-4 flex items-center gap-3">
        <Button
          variant="brand"
          disabled={save.isPending || limitInvalid}
          onClick={() =>
            save.mutate({
              accountId,
              terms,
              creditLimitCents: limitCents,
              depositRequired: deposit,
            })
          }
        >
          {save.isPending ? t("Saving…") : t("Save terms")}
        </Button>
        {save.isSuccess && (
          <span className="text-sm text-success">{t("Saved")}</span>
        )}
      </div>
    </Panel>
  );
}

const addr = (a: Address | null) =>
  a?.street
    ? [a.street, [a.city, a.state, a.zip].filter(Boolean).join(", ")]
        .filter(Boolean)
        .join(" · ")
    : "—";
const person = (c: Contact | null) =>
  c?.name
    ? [c.name, c.title, c.email, c.phone].filter(Boolean).join(" · ")
    : "—";

/** Business profile, documents and agreement signature, with staff review. */
function OnboardingPanels({ accountId }: { accountId: string }) {
  const { t, lang } = useI18n();
  const bp = useBusinessProfile(accountId);
  const review = useReviewBusinessProfile();
  const docs = useAccountDocuments(accountId);
  const reviewDoc = useReviewDocument(accountId);
  const sigs = useAgreementSignatures(accountId);
  const versions = useAgreementVersions();
  const [note, setNote] = useState("");
  const p = bp.data;
  const rows: [string, string | null | undefined][] = p
    ? [
        ["Legal name", p.legal_name],
        ["DBA (trade name)", p.dba],
        ["Entity type", p.entity_type],
        ["EIN", p.ein],
        ["State of incorporation", p.state_of_incorporation],
        [
          "Year established",
          p.year_established ? String(p.year_established) : null,
        ],
        ["Website", p.website],
        ["Phone", p.phone],
        ["Business address", addr(p.business_address)],
        ["Billing address", addr(p.billing_address)],
        ["Director", person(p.director)],
        ["Purchasing contact", person(p.primary_contact)],
        ["Accounts payable", person(p.ap_contact)],
        [
          "Resale certificate",
          [p.resale_cert_number, p.resale_cert_state]
            .filter(Boolean)
            .join(" · "),
        ],
        ["R2 certificate number", p.r2_cert_number],
        ["D-U-N-S number", p.duns_number],
        ["Monthly volume (units)", p.monthly_volume],
        [
          "Carrier account",
          [p.carrier_account?.carrier, p.carrier_account?.account_number]
            .filter(Boolean)
            .join(" · "),
        ],
      ]
    : [];

  return (
    <>
      <Panel
        title={`${t("Company registration")}${p ? ` · ${t(p.status === "submitted" ? "In review" : p.status === "approved" ? "Approved" : p.status === "changes_requested" ? "Changes requested" : "Draft")}` : ""}`}
      >
        {!p ? (
          <p className="text-sm text-muted-foreground">
            {t("The buyer has not started the registration yet.")}
          </p>
        ) : (
          <div className="space-y-3">
            <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[12rem_1fr]">
              {rows.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{t(k)}</dt>
                  <dd className="min-w-0 break-words">{v || "—"}</dd>
                </div>
              ))}
            </dl>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {t("Note to the buyer (for changes)")}
              </span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                className={inputCls}
              />
            </label>
            {review.isError && (
              <p className="text-sm text-destructive">
                {adminErrorMessage(t, review.error.message)}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="brand"
                size="sm"
                disabled={review.isPending}
                onClick={() =>
                  review.mutate({ accountId, status: "approved", note })
                }
              >
                {t("Approve registration")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={review.isPending || !note.trim()}
                onClick={() =>
                  review.mutate({
                    accountId,
                    status: "changes_requested",
                    note,
                  })
                }
              >
                {t("Ask for changes")}
              </Button>
            </div>
          </div>
        )}
      </Panel>

      <Panel title={t("Documents")}>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {DOCUMENT_SLOTS.map((slot) => {
            const d = docs.data?.find((x) => x.kind === slot.kind);
            return (
              <li
                key={slot.kind}
                className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm"
              >
                <span className="min-w-0 flex-1 basis-40">
                  <span className="block font-medium">{t(slot.label)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {d
                      ? `${formatDate(d.uploaded_at, lang)} · ${t(d.status === "approved" ? "Approved" : d.status === "rejected" ? "Rejected" : "In review")}`
                      : t("Missing")}
                  </span>
                </span>
                {d && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void documentUrl(d.file_path).then((u) =>
                          window.open(u, "_blank", "noopener"),
                        )
                      }
                    >
                      {t("Open")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={reviewDoc.isPending || d.status === "approved"}
                      onClick={() =>
                        reviewDoc.mutate({ id: d.id, status: "approved" })
                      }
                    >
                      {t("Approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={reviewDoc.isPending || d.status === "rejected"}
                      onClick={() =>
                        reviewDoc.mutate({ id: d.id, status: "rejected", note })
                      }
                    >
                      {t("Reject")}
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        {reviewDoc.isError && (
          <p className="mt-2 text-sm text-destructive">
            {adminErrorMessage(t, reviewDoc.error.message)}
          </p>
        )}
      </Panel>

      <Panel title={t("Master Agreement")}>
        {sigs.data?.length ? (
          <ul className="space-y-1 text-sm">
            {sigs.data.map((s) => (
              <li key={s.id}>
                v
                {versions.data?.find((v) => v.id === s.version_id)?.version ??
                  "—"}{" "}
                · {s.signer_name} ({s.signer_title}) ·{" "}
                {formatDate(s.signed_at, lang)}
                {s.ip ? ` · IP ${s.ip}` : ""}
                <span className="block font-mono text-xs text-muted-foreground">
                  sha256 {s.content_sha256.slice(0, 24)}…
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("Not signed yet.")}
          </p>
        )}
      </Panel>
    </>
  );
}

/** Auction deposit: what was received by wire, and recording a new wire or refund. */
function DepositRow({
  accountId,
  receivedCents,
  required,
}: {
  accountId: string;
  receivedCents: number;
  required: boolean;
}) {
  const { t } = useI18n();
  const rec = useRecordDeposit();
  const [amount, setAmount] = useState("");
  const cents = parseMoneyToCents(amount);
  return (
    <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl bg-muted/40 p-3 text-sm">
      <p className="min-w-0 flex-1 basis-48">
        {t("Auction deposit received")}:{" "}
        <b className="font-mono">{formatUsd(receivedCents)}</b>
        <span className="block text-xs text-muted-foreground">
          {!required
            ? t("Not required for this account.")
            : receivedCents >= 250_000
              ? t("Enough to bid.")
              : t("Bidding opens at $2,500.")}
        </span>
      </p>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        inputMode="decimal"
        placeholder="2500.00"
        aria-label={t("Wire amount (USD)")}
        className="h-11 w-28 rounded-xl border border-border bg-background px-3 text-right font-mono text-sm outline-none focus:border-brand"
      />
      <Button
        size="sm"
        variant="outline"
        disabled={rec.isPending || !cents}
        onClick={() =>
          rec.mutate(
            { accountId, deltaCents: cents ?? 0, note: "wire" },
            { onSuccess: () => setAmount("") },
          )
        }
      >
        {t("Record wire")}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={rec.isPending || !cents}
        onClick={() =>
          rec.mutate(
            { accountId, deltaCents: -(cents ?? 0), note: "refund" },
            { onSuccess: () => setAmount("") },
          )
        }
      >
        {t("Record refund")}
      </Button>
      {rec.isError && (
        <p className="basis-full text-xs text-destructive">
          {adminErrorMessage(t, rec.error.message)}
        </p>
      )}
    </div>
  );
}
