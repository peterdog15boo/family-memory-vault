"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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
        setError(data.error || "Could not submit your order.");
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

      setError("Order was saved, but we couldn’t open the confirmation page.");
    } catch {
      setError("Could not submit your order. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="memory-box-form" onSubmit={onSubmit} noValidate>
      {stripeCheckoutEnabled ? (
        <p className="memory-box-account-note">
          After you submit, you’ll pay <strong>$199</strong> securely via Stripe
          Checkout. Your box request is saved first — payment is confirmed only
          after Checkout succeeds.
        </p>
      ) : (
        <p className="memory-box-account-note">
          This form submits an <strong>order request</strong> (not an online
          payment). We’ll email you to collect the $199 fee before shipping.
        </p>
      )}

      {isSignedIn ? (
        <p className="memory-box-hint">
          Signed in — this order will be linked to your account so completed
          uploads can appear in your Photos page.
        </p>
      ) : (
        <p className="memory-box-hint">
          Not signed in? Please use a name, email, and phone we can reach — we
          need them to match your order when digitized files are ready.
        </p>
      )}

      <div className="memory-box-form-grid">
        <Field
          id="mb-full-name"
          label="Full name"
          required
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
          label="Email"
          required
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
          label="Phone"
          required
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
        <legend className="memory-box-legend">Mailing address</legend>
        <div className="memory-box-form-grid">
          <Field
            id="mb-line1"
            label="Address line 1"
            required
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
            label="Address line 2"
            optional
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
            label="City"
            required
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
            label="State"
            required
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
            label="Postal code"
            required
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
            label="Country"
            required
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
        <legend className="memory-box-legend">Estimated contents</legend>
        <p className="memory-box-hint">
          Best guesses are fine — we’ll confirm once your box arrives.
        </p>
        <div className="memory-box-form-grid memory-box-counts">
          <Field
            id="mb-photos"
            label="Photos"
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
            label="Video tapes"
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
            label="Film reels"
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
            label="Other items"
            optional
            className="memory-box-span-2"
            error={fieldError(fieldErrors, "otherItemsNotes")}
          >
            <input
              id="mb-other"
              name="otherItemsNotes"
              value={form.otherItemsNotes}
              onChange={(e) => update("otherItemsNotes", e.target.value)}
              className="memory-box-input"
              placeholder="Slides, CDs, mixed boxes…"
            />
          </Field>
        </div>
      </fieldset>

      <Field
        id="mb-notes"
        label="Special instructions"
        optional
        error={fieldError(fieldErrors, "specialInstructions")}
      >
        <textarea
          id="mb-notes"
          name="specialInstructions"
          rows={3}
          value={form.specialInstructions}
          onChange={(e) => update("specialInstructions", e.target.value)}
          className="memory-box-input memory-box-textarea"
          placeholder="Fragile albums, labeling preferences, anything we should know…"
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
        <span>
          I understand these counts are approximate, processing takes about 5–8
          weeks after you receive my filled box, and digitized media will appear
          automatically in Photos when ready.
        </span>
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
            ? "Redirecting to payment…"
            : "Sending…"
          : stripeCheckoutEnabled
            ? "Pay $199 & order"
            : "Request Family Memory Box"}
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  required,
  optional,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
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
          <span className="memory-box-optional">optional</span>
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
