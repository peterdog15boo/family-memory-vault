/**
 * Warm Clerk appearance for cinematic sign-in / sign-up.
 * Keeps widgets fully usable while matching Family Memory Vault tone.
 */

export const authClerkAppearance = {
  variables: {
    colorPrimary: "#b56f5e",
    colorText: "#2a2623",
    colorTextSecondary: "#6b635c",
    colorBackground: "transparent",
    colorInputBackground: "rgba(255, 252, 248, 0.96)",
    colorInputText: "#2a2623",
    colorNeutral: "#8a7f76",
    borderRadius: "0.85rem",
    fontFamily: "var(--font-figtree), ui-sans-serif, system-ui, sans-serif",
    fontFamilyButtons:
      "var(--font-figtree), ui-sans-serif, system-ui, sans-serif",
  },
  elements: {
    rootBox: "auth-clerk-root w-full",
    cardBox: "auth-clerk-card-box shadow-none w-full",
    card: "auth-clerk-card bg-transparent shadow-none border-0 p-0 w-full",
    /** Friendly headline lives outside the card — hide Clerk’s generic title */
    header: "auth-clerk-header hidden",
    headerTitle: "hidden",
    headerSubtitle: "hidden",
    socialButtonsBlockButton:
      "auth-clerk-social border border-[rgba(42,38,35,0.12)] bg-white/90 hover:bg-white",
    formButtonPrimary:
      "auth-clerk-primary bg-[#b56f5e] hover:bg-[#9d5d4e] text-white shadow-none",
    formFieldInput:
      "auth-clerk-input border-[rgba(42,38,35,0.14)] focus:border-[#b56f5e] focus:ring-[#b56f5e]/30",
    footerActionLink: "auth-clerk-link text-[#9d5d4e] hover:text-[#7f4a3d]",
    identityPreviewEditButton: "text-[#9d5d4e]",
    formFieldLabel: "text-[#4a443e] text-sm font-medium",
    dividerLine: "bg-[rgba(42,38,35,0.1)]",
    dividerText: "text-[#8a7f76] text-xs",
  },
} as const;
