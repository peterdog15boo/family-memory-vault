/**
 * Intentional loading placeholder while Clerk hydrates.
 * Fills the glass card so the page never reads as an empty shell.
 */
export function AuthCardSkeleton() {
  return (
    <div className="auth-card-skeleton" aria-hidden>
      <div className="auth-card-skeleton-line auth-card-skeleton-line--title" />
      <div className="auth-card-skeleton-line auth-card-skeleton-line--sub" />
      <div className="auth-card-skeleton-block auth-card-skeleton-block--social" />
      <div className="auth-card-skeleton-divider">
        <span />
      </div>
      <div className="auth-card-skeleton-line auth-card-skeleton-line--label" />
      <div className="auth-card-skeleton-block" />
      <div className="auth-card-skeleton-line auth-card-skeleton-line--label" />
      <div className="auth-card-skeleton-block" />
      <div className="auth-card-skeleton-block auth-card-skeleton-block--cta" />
      <p className="auth-card-skeleton-hint">Preparing a calm sign-in…</p>
    </div>
  );
}
