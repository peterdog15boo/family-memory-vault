import {
  TERMS_OF_SERVICE_CLOSING,
  TERMS_OF_SERVICE_INTRO,
  TERMS_OF_SERVICE_META,
  TERMS_OF_SERVICE_SECTIONS,
  TERMS_OF_SERVICE_TITLE,
  TERMS_OF_SERVICE_VERSION,
  type TermsSection,
} from "@/content/legal/terms-of-service";
import { cn } from "@/lib/utils";

function SectionBlock({
  section,
  headingLevel,
}: {
  section: TermsSection | NonNullable<TermsSection["subsections"]>[number];
  headingLevel: "h2" | "h3";
}) {
  const Heading = headingLevel;
  return (
    <section className="legal-doc-section">
      <Heading className={headingLevel === "h2" ? "legal-doc-h2" : "legal-doc-h3"}>
        {section.heading}
      </Heading>
      {section.paragraphs?.map((p) => (
        <p key={p.slice(0, 64)} className="legal-doc-p">
          {p}
        </p>
      ))}
      {section.bullets?.length ? (
        <ul className="legal-doc-list">
          {section.bullets.map((item) => (
            <li key={item.slice(0, 64)}>{item}</li>
          ))}
        </ul>
      ) : null}
      {section.afterBullets?.map((p) => (
        <p key={p.slice(0, 64)} className="legal-doc-p">
          {p}
        </p>
      ))}
    </section>
  );
}

type TermsOfServiceDocumentProps = {
  className?: string;
  /** Extra class on the scrollable article (agree page). */
  articleClassName?: string;
  showClosing?: boolean;
  ariaLabel?: string;
};

/**
 * Renders the canonical Terms of Service body.
 * Used by both /terms and /terms-agree — do not duplicate the legal text elsewhere.
 */
export function TermsOfServiceDocument({
  className,
  articleClassName,
  showClosing = true,
  ariaLabel = "Terms of Service",
}: TermsOfServiceDocumentProps) {
  return (
    <article
      className={cn("legal-doc", articleClassName, className)}
      aria-label={ariaLabel}
    >
      <h1 className="legal-doc-title">{TERMS_OF_SERVICE_TITLE}</h1>
      <p className="legal-doc-meta">
        Last updated: {TERMS_OF_SERVICE_META.lastUpdated}
        <span aria-hidden="true"> · </span>
        Version: {TERMS_OF_SERVICE_META.versionLabel}
        <span aria-hidden="true"> · </span>
        {TERMS_OF_SERVICE_VERSION}
      </p>

      {TERMS_OF_SERVICE_INTRO.map((p) => (
        <p key={p.slice(0, 64)} className="legal-doc-p">
          {p}
        </p>
      ))}

      {TERMS_OF_SERVICE_SECTIONS.map((section) => (
        <div key={section.heading}>
          <SectionBlock section={section} headingLevel="h2" />
          {section.subsections?.map((sub) => (
            <SectionBlock
              key={sub.heading}
              section={sub}
              headingLevel="h3"
            />
          ))}
        </div>
      ))}

      {showClosing ? (
        <p className="legal-doc-p legal-doc-closing">{TERMS_OF_SERVICE_CLOSING}</p>
      ) : null}
    </article>
  );
}
