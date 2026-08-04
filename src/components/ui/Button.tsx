/**
 * Shared button styles — Original and Modern via CSS tokens / [data-theme].
 */

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type UiButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type UiButtonSize = "sm" | "md" | "lg";

type UiButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: UiButtonVariant;
  size?: UiButtonSize;
};

const variantClass: Record<UiButtonVariant, string> = {
  primary: "ui-btn ui-btn-primary",
  secondary: "ui-btn ui-btn-secondary",
  ghost: "ui-btn ui-btn-ghost",
  danger: "ui-btn ui-btn-danger",
};

const sizeClass: Record<UiButtonSize, string> = {
  sm: "ui-btn-sm",
  md: "",
  lg: "ui-btn-lg",
};

export const UiButton = forwardRef<HTMLButtonElement, UiButtonProps>(
  function UiButton(
    {
      className,
      variant = "primary",
      size = "md",
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(variantClass[variant], sizeClass[size], className)}
        {...props}
      />
    );
  },
);
