"use client";

import {
  Clapperboard,
  Film,
  ImageIcon,
  Package,
  ScanLine,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { CinematicSection } from "@/components/cinematic";
import { FamilyMemoryBoxOrderForm } from "@/components/marketing/FamilyMemoryBoxOrderForm";
import { LandingReveal } from "@/components/marketing/LandingReveal";
import { LANDING_MEDIA } from "@/content/landing-media";

type FamilyMemoryBoxPageProps = {
  isSignedIn: boolean;
  stripeCheckoutEnabled?: boolean;
  accountDefaults?: {
    fullName?: string;
    email?: string;
  } | null;
};

const MEDIA_TYPES = [
  {
    icon: ImageIcon,
    label: "Photographs",
    detail: "Prints, albums, and loose photos",
  },
  {
    icon: Clapperboard,
    label: "Video tapes",
    detail: "VHS, Hi8, MiniDV, and similar",
  },
  {
    icon: Film,
    label: "Film reels",
    detail: "Home movies and film canisters",
  },
  {
    icon: Package,
    label: "And more",
    detail: "Other physical keepsakes we can digitize",
  },
] as const;

/**
 * Public Family Memory Box offer — digitize physical media into the vault.
 * Hero, steps, and pricing chrome are i18n-wired; deeper sections remain English for now.
 */
export function FamilyMemoryBoxPage({
  isSignedIn,
  stripeCheckoutEnabled = false,
  accountDefaults = null,
}: FamilyMemoryBoxPageProps) {
  const t = useTranslations();

  const steps = [
    {
      icon: Package,
      title: t("memoryBox.step1Title"),
      body: t("memoryBox.step1Body"),
    },
    {
      icon: ScanLine,
      title: t("memoryBox.step2Title"),
      body: t("memoryBox.step2Body"),
    },
    {
      icon: Sparkles,
      title: t("memoryBox.step3Title"),
      body: t("memoryBox.step3Body"),
    },
  ] as const;

  return (
    <div className="memory-box-page">
      <CinematicSection
        mediaType="image"
        src={LANDING_MEDIA.preserve.image}
        poster={LANDING_MEDIA.preserve.image}
        overlay="hero-cinematic"
        layout="center"
        viewport
        priority
        className="memory-box-hero"
        contentClassName="memory-box-hero-content"
        imageAlt={t("memoryBox.heroImageAlt")}
      >
        <p className="memory-box-brand animate-fade-up">
          {t("memoryBox.brand")}
        </p>
        <h1 className="memory-box-title animate-fade-up-delay-1">
          {t("memoryBox.heroTitle")}
        </h1>
        <p className="memory-box-support animate-fade-up-delay-2">
          {t("memoryBox.heroSupport")}
        </p>
        <div className="memory-box-hero-actions animate-fade-up-delay-3">
          <a href="#order" className="ui-btn ui-btn-primary ui-btn-lg">
            {t("memoryBox.heroCta")}
          </a>
          <a
            href="#how-it-works"
            className="ui-btn ui-btn-ghost ui-btn-lg landing-cta-ghost-on-media"
          >
            {t("memoryBox.heroSecondaryCta")}
          </a>
        </div>
      </CinematicSection>

      <section
        id="how-it-works"
        className="memory-box-section"
        aria-labelledby="memory-box-how-title"
      >
        <LandingReveal>
          <div className="memory-box-section-intro">
            <h2 id="memory-box-how-title" className="memory-box-section-title">
              {t("memoryBox.howTitle")}
            </h2>
            <p className="memory-box-section-lead">
              {t("memoryBox.howLead")}
            </p>
          </div>
        </LandingReveal>

        <ol className="memory-box-steps">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="memory-box-step">
                <LandingReveal delayMs={index * 80}>
                  <div className="memory-box-step-inner">
                    <span className="memory-box-step-num" aria-hidden>
                      {index + 1}
                    </span>
                    <Icon className="memory-box-step-icon" aria-hidden />
                    <h3 className="memory-box-step-title">{step.title}</h3>
                    <p className="memory-box-step-body">{step.body}</p>
                  </div>
                </LandingReveal>
              </li>
            );
          })}
        </ol>
      </section>

      <section
        id="pricing"
        className="memory-box-pricing"
        aria-labelledby="memory-box-price-title"
      >
        <LandingReveal>
          <div className="memory-box-pricing-inner">
            <p className="memory-box-pricing-eyebrow">
              {t("memoryBox.pricingEyebrow")}
            </p>
            <h2 id="memory-box-price-title" className="memory-box-pricing-title">
              {t("memoryBox.pricingTitle")}
            </h2>
            <p className="memory-box-price-row">
              <span
                className="memory-box-price-was"
                aria-label={t("memoryBox.priceWasAria")}
              >
                {t("memoryBox.priceWas")}
              </span>
              <span className="memory-box-price-now">
                {t("memoryBox.priceNow")}
              </span>
            </p>
            <p className="memory-box-pricing-note">
              {t("memoryBox.pricingNote")}
            </p>
            <a
              href="#order"
              className="ui-btn ui-btn-primary ui-btn-lg memory-box-pricing-cta"
            >
              {t("memoryBox.pricingCta")}
            </a>
          </div>
        </LandingReveal>
      </section>

      <section
        className="memory-box-section"
        aria-labelledby="memory-box-send-title"
      >
        <LandingReveal>
          <div className="memory-box-section-intro">
            <h2 id="memory-box-send-title" className="memory-box-section-title">
              What you can send
            </h2>
            <p className="memory-box-section-lead">
              Pack what you’ve been meaning to rescue — we’ll digitize it into
              Photos for you.
            </p>
          </div>
        </LandingReveal>

        <ul className="memory-box-media-list">
          {MEDIA_TYPES.map((item, index) => {
            const Icon = item.icon;
            return (
              <li key={item.label}>
                <LandingReveal delayMs={index * 60}>
                  <div className="memory-box-media-item">
                    <Icon className="memory-box-media-icon" aria-hidden />
                    <div>
                      <p className="memory-box-media-label">{item.label}</p>
                      <p className="memory-box-media-detail">{item.detail}</p>
                    </div>
                  </div>
                </LandingReveal>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        className="memory-box-timeline"
        aria-labelledby="memory-box-timeline-title"
      >
        <LandingReveal>
          <div className="memory-box-timeline-inner">
            <h2
              id="memory-box-timeline-title"
              className="memory-box-section-title"
            >
              Honest timelines
            </h2>
            <p className="memory-box-section-lead memory-box-timeline-lead">
              Careful digitizing takes time. Here’s what to plan for.
            </p>
            <dl className="memory-box-timeline-list">
              <div>
                <dt>Box arrives</dt>
                <dd>
                  Expect your Family Memory Box within about{" "}
                  <strong>2 weeks</strong> after you order.
                </dd>
              </div>
              <div>
                <dt>Processing</dt>
                <dd>
                  After we receive your filled box, allow about{" "}
                  <strong>5–8 weeks</strong> for digitizing.
                </dd>
              </div>
              <div>
                <dt>In your Photos</dt>
                <dd>
                  When work is complete, your media appears{" "}
                  <strong>automatically on your Photos page</strong> — no
                  uploading required on your end.
                </dd>
              </div>
            </dl>
          </div>
        </LandingReveal>
      </section>

      <section
        id="order"
        className="memory-box-order"
        aria-labelledby="memory-box-order-title"
      >
        <LandingReveal>
          <div className="memory-box-order-intro">
            <h2 id="memory-box-order-title" className="memory-box-section-title">
              Order your Family Memory Box
            </h2>
            <p className="memory-box-section-lead">
              {isSignedIn
                ? stripeCheckoutEnabled
                  ? "We’ll link this order to your account. After checkout, you’ll pay $199 securely — payment is confirmed only when Stripe succeeds."
                  : "We’ll link this request to your account. Online payment isn’t available yet — we’ll email you to collect $199 before shipping."
                : stripeCheckoutEnabled
                  ? "Include your contact details, then pay $199 via Stripe Checkout. Payment is confirmed only after Checkout succeeds."
                  : "Include your full name, email, phone, and mailing address. This is an order request — we’ll follow up to collect $199 before shipping."}
            </p>
          </div>
        </LandingReveal>
        <div className="memory-box-order-panel">
          <FamilyMemoryBoxOrderForm
            isSignedIn={isSignedIn}
            stripeCheckoutEnabled={stripeCheckoutEnabled}
            accountDefaults={accountDefaults}
          />
        </div>
      </section>

      <CinematicSection
        mediaType="image"
        src={LANDING_MEDIA.legacy.image}
        poster={LANDING_MEDIA.legacy.image}
        overlay="hero-cinematic"
        layout="center"
        viewport
        className="memory-box-final"
        contentClassName="memory-box-final-content"
        imageAlt="Family walking together in soft outdoor light"
        aria-labelledby="memory-box-final-title"
      >
        <LandingReveal>
          <h2 id="memory-box-final-title" className="memory-box-final-title">
            Ready when you are
          </h2>
          <p className="memory-box-final-support">
            Order your box today. In about 2 weeks it arrives; after you return
            it, allow about 5–8 weeks — then find everything waiting in Photos.
          </p>
          <a href="#order" className="ui-btn ui-btn-primary ui-btn-lg">
            {t("memoryBox.heroCta")}
          </a>
        </LandingReveal>
      </CinematicSection>
    </div>
  );
}
