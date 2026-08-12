"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

type FieldErrors = Record<string, string[] | undefined>;

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  estimatedPhotos: string;
  estimatedVideoTapes: string;
  estimatedFilmReels: string;
  otherItemsNotes: string;
  specialInstructions: string;
  estimatesAcknowledged: boolean;
};

const INITIAL: FormState = {
  fullName: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "US",
  estimatedPhotos: "",
  estimatedVideoTapes: "",
  estimatedFilmReels: "",
  otherItemsNotes: "",
  specialInstructions: "",
  estimatesAcknowledged: false,
};

function fieldError(errors: FieldErrors | null, key: string): string | null {
  const list = errors?.[key];
  return list?.[0] ?? null;
}

function HighlightPlaceholder({
  template,
  placeholder,
  highlight,
}: {
  template: string;
  placeholder: string;
  highlight: ReactNode;
}) {
  const parts = template.split(placeholder);
  return (
    <>
      {parts[0]}
      {highlight}
      {parts.slice(1).join(placeholder)}
    </>
  );
}

/**
 * Public intake form for Family Memory Box orders.
 * Stripe Checkout when configured; otherwise clear unpaid request intake.
 */
export function FamilyMemoryBoxOrderForm({
  isSignedIn = false,
  stripeCheckoutEnabled = false,
  accountDefaults = null,
}: {
  isSignedIn?: boolean;
  /** When true, submit redirects to Stripe Checkout ($199). */
  stripeCheckoutEnabled?: boolean;
  accountDefaults?: {
    fullName?: string;
    email?: string;
  } | null;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => ({
    ...INITIAL,
    fullName: accountDefaults?.fullName?.trim() || "",
    email: accountDefaults?.email?.trim() || "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors | null>(null);

  const canSubmit = useMemo(
    () =>
      !busy &&
      form.fullName.trim() &&
      form.email.trim() &&
      form.phone.trim() &&
      form.addressLine1.trim() &&
      form.city.trim() &&
      form.state.trim() &&
      form.postalCode.trim() &&
      form.estimatesAcknowledged,
    [busy, form],
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors(null);
    setBusy(true);

    try {
      const response = await fetch("/api/family-memory-box/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          addressLine1: form.addressLine1.trim(),
          addressLine2: form.addressLine2.trim() || undefined,
          city: form.city.trim(),
          state: form.state.trim(),
          postalCode: form.postalCode.trim(),
          country: form.country.trim() || "US",
          estimatedPhotos: form.estimatedPhotos === "" ? 0 : form.estimatedPhotos,
          estimatedVideoTapes:
            form.estimatedVideoTapes === "" ? 0 : form.estimatedVideoTapes,
          estimatedFilmReels:
            form.estimatedFilmReels === "" ? 0 : form.estimatedFilmReels,
          otherItemsNotes: form.otherItemsNotes.trim() || undefined,
          customerNotes: form.specialInstructions.trim() || undefined,
          estimatesAcknowledged: form.estimatesAcknowledged,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        orderId?: string;
        linkedToAccount?: boolean;
        paymentStatus?: string;
        paid?: boolean;
        checkoutUrl?: string;
        message?: string;
        details?: { fieldErrors?: FieldErrors };
      };

      if (!response.ok) {
        setFieldErrors(data.details?.fieldErrors ?? null);
        setError(data.error || t("memoryBox.errorSubmit"));
        return;
      }

      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }

      if (data.orderId) {
        router.push(
          `/family-memory-box/success?order_id=${encodeURIComponent(data.orderId)}`,
        );
        return;
      }

      setError(t("memoryBox.errorConfirmMissing"));
    } catch {
      setError(t("memoryBox.errorNetwork"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="memory-box-form" onSubmit={onSubmit} noValidate>
      {stripeCheckoutEnabled ? (
        <p className="memory-box-account-note">
          <HighlightPlaceholder
            template={t("memoryBox.stripeCheckoutNote")}
            placeholder="{price}"
            highlight={<strong>$199</strong>}
          />
        </p>
      ) : (
        <p className="memory-box-account-note">
          <HighlightPlaceholder
            template={t("memoryBox.requestNote")}
            placeholder="{orderRequest}"
            highlight={<strong>{t("memoryBox.orderRequest")}</strong>}
          />
        </p>
      )}

      {isSignedIn ? (
        <p className="memory-box-hint">{t("memoryBox.signedInHint")}</p>
      ) : (
        <p className="memory-box-hint">{t("memoryBox.guestHint")}</p>
      )}

      <div className="memory-box-form-grid">
        <Field
          id="mb-full-name"
          label={t("memoryBox.fullName")}
          required
          optionalLabel={t("common.optional")}
          error={fieldError(fieldErrors, "fullName")}
        >
          <input
            id="mb-full-name"
            name="fullName"
            autoComplete="name"
            value={form.fullName}
            onChange={(e) => update("fullName", e.target.value)}
            className="memory-box-input"
            required
          />
        </Field>

        <Field
          id="mb-email"
          label={t("memoryBox.email")}
          required
          optionalLabel={t("common.optional")}
          error={fieldError(fieldErrors, "email")}
        >
          <input
            id="mb-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            className="memory-box-input"
            required
          />
        </Field>

        <Field
          id="mb-phone"
          label={t("memoryBox.phone")}
          required
          optionalLabel={t("common.optional")}
          error={fieldError(fieldErrors, "phone")}
        >
          <input
            id="mb-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            className="memory-box-input"
            required
          />
        </Field>
      </div>

      <fieldset className="memory-box-fieldset">
        <legend className="memory-box-legend">
          {t("memoryBox.mailingAddress")}
        </legend>
        <div className="memory-box-form-grid">
          <Field
            id="mb-line1"
            label={t("memoryBox.addressLine1")}
            required
            optionalLabel={t("common.optional")}
            className="memory-box-span-2"
            error={fieldError(fieldErrors, "addressLine1")}
          >
            <input
              id="mb-line1"
              name="addressLine1"
              autoComplete="address-line1"
              value={form.addressLine1}
              onChange={(e) => update("addressLine1", e.target.value)}
              className="memory-box-input"
              required
            />
          </Field>

          <Field
            id="mb-line2"
            label={t("memoryBox.addressLine2")}
            optional
            optionalLabel={t("common.optional")}
            className="memory-box-span-2"
            error={fieldError(fieldErrors, "addressLine2")}
          >
            <input
              id="mb-line2"
              name="addressLine2"
              autoComplete="address-line2"
              value={form.addressLine2}
              onChange={(e) => update("addressLine2", e.target.value)}
              className="memory-box-input"
            />
          </Field>

          <Field
            id="mb-city"
            label={t("memoryBox.city")}
            required
            optionalLabel={t("common.optional")}
            error={fieldError(fieldErrors, "city")}
          >
            <input
              id="mb-city"
              name="city"
              autoComplete="address-level2"
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
              className="memory-box-input"
              required
            />
          </Field>

          <Field
            id="mb-state"
            label={t("memoryBox.state")}
            required
            optionalLabel={t("common.optional")}
            error={fieldError(fieldErrors, "state")}
          >
            <input
              id="mb-state"
              name="state"
              autoComplete="address-level1"
              value={form.state}
              onChange={(e) => update("state", e.target.value)}
              className="memory-box-input"
              required
            />
          </Field>

          <Field
            id="mb-postal"
            label={t("memoryBox.postalCode")}
            required
            optionalLabel={t("common.optional")}
            error={fieldError(fieldErrors, "postalCode")}
          >
            <input
              id="mb-postal"
              name="postalCode"
              autoComplete="postal-code"
              value={form.postalCode}
              onChange={(e) => update("postalCode", e.target.value)}
              className="memory-box-input"
              required
            />
          </Field>

          <Field
            id="mb-country"
            label={t("memoryBox.country")}
            required
            optionalLabel={t("common.optional")}
            error={fieldError(fieldErrors, "country")}
          >
            <input
              id="mb-country"
              name="country"
              autoComplete="country-name"
              value={form.country}
              onChange={(e) => update("country", e.target.value)}
              className="memory-box-input"
              required
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="memory-box-fieldset">
        <legend className="memory-box-legend">
          {t("memoryBox.estimatedContents")}
        </legend>
        <p className="memory-box-hint">{t("memoryBox.estimatesHint")}</p>
        <div className="memory-box-form-grid memory-box-counts">
          <Field
            id="mb-photos"
            label={t("memoryBox.photos")}
            optionalLabel={t("common.optional")}
            error={fieldError(fieldErrors, "estimatedPhotos")}
          >
            <input
              id="mb-photos"
              name="estimatedPhotos"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              placeholder="0"
              value={form.estimatedPhotos}
              onChange={(e) => update("estimatedPhotos", e.target.value)}
              className="memory-box-input"
            />
          </Field>
          <Field
            id="mb-tapes"
            label={t("memoryBox.videoTapes")}
            optionalLabel={t("common.optional")}
            error={fieldError(fieldErrors, "estimatedVideoTapes")}
          >
            <input
              id="mb-tapes"
              name="estimatedVideoTapes"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              placeholder="0"
              value={form.estimatedVideoTapes}
              onChange={(e) => update("estimatedVideoTapes", e.target.value)}
              className="memory-box-input"
            />
          </Field>
          <Field
            id="mb-reels"
            label={t("memoryBox.filmReels")}
            optionalLabel={t("common.optional")}
            error={fieldError(fieldErrors, "estimatedFilmReels")}
          >
            <input
              id="mb-reels"
              name="estimatedFilmReels"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              placeholder="0"
              value={form.estimatedFilmReels}
              onChange={(e) => update("estimatedFilmReels", e.target.value)}
              className="memory-box-input"
            />
          </Field>
          <Field
            id="mb-other"
            label={t("memoryBox.otherItems")}
            optional
            optionalLabel={t("common.optional")}
            className="memory-box-span-2"
            error={fieldError(fieldErrors, "otherItemsNotes")}
          >
            <input
              id="mb-other"
              name="otherItemsNotes"
              value={form.otherItemsNotes}
              onChange={(e) => update("otherItemsNotes", e.target.value)}
              className="memory-box-input"
              placeholder={t("memoryBox.otherItemsPlaceholder")}
            />
          </Field>
        </div>
      </fieldset>

      <Field
        id="mb-notes"
        label={t("memoryBox.specialInstructions")}
        optional
        optionalLabel={t("common.optional")}
        error={fieldError(fieldErrors, "specialInstructions")}
      >
        <textarea
          id="mb-notes"
          name="specialInstructions"
          rows={3}
          value={form.specialInstructions}
          onChange={(e) => update("specialInstructions", e.target.value)}
          className="memory-box-input memory-box-textarea"
          placeholder={t("memoryBox.specialInstructionsPlaceholder")}
        />
      </Field>

      <label
        className={cn(
          "memory-box-check",
          fieldError(fieldErrors, "estimatesAcknowledged") &&
            "memory-box-check--error",
        )}
      >
        <input
          type="checkbox"
          checked={form.estimatesAcknowledged}
          onChange={(e) => update("estimatesAcknowledged", e.target.checked)}
          required
        />
        <span>{t("memoryBox.estimatesAck")}</span>
      </label>
      {fieldError(fieldErrors, "estimatesAcknowledged") ? (
        <p className="memory-box-field-error" role="alert">
          {fieldError(fieldErrors, "estimatesAcknowledged")}
        </p>
      ) : null}

      {error ? (
        <p className="memory-box-form-error" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!canSubmit}
        className="ui-btn ui-btn-primary ui-btn-lg memory-box-form-submit"
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {busy
          ? stripeCheckoutEnabled
            ? t("memoryBox.submittingPayment")
            : t("memoryBox.submitting")
          : stripeCheckoutEnabled
            ? t("memoryBox.submitPay")
            : t("memoryBox.submitRequest")}
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  required,
  optional,
  optionalLabel,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  optionalLabel: string;
  error?: string | null;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("memory-box-field", className)}>
      <label htmlFor={id} className="memory-box-label">
        {label}
        {required ? <span className="memory-box-req">*</span> : null}
        {optional ? (
          <span className="memory-box-optional">{optionalLabel}</span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="memory-box-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
