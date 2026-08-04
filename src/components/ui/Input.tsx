/**
 * Shared text field — theme tokens drive Original vs Modern look.
 */

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type UiInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
};

export const UiInput = forwardRef<HTMLInputElement, UiInputProps>(
  function UiInput({ className, label, hint, id, ...props }, ref) {
    const inputId = id ?? props.name;
    return (
      <label className="ui-field block">
        {label ? <span className="ui-label">{label}</span> : null}
        <input
          ref={ref}
          id={inputId}
          className={cn("ui-input", className)}
          {...props}
        />
        {hint ? <span className="ui-hint">{hint}</span> : null}
      </label>
    );
  },
);

type UiTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
};

export const UiTextarea = forwardRef<HTMLTextAreaElement, UiTextareaProps>(
  function UiTextarea({ className, label, hint, id, ...props }, ref) {
    const inputId = id ?? props.name;
    return (
      <label className="ui-field block">
        {label ? <span className="ui-label">{label}</span> : null}
        <textarea
          ref={ref}
          id={inputId}
          className={cn("ui-input ui-textarea", className)}
          {...props}
        />
        {hint ? <span className="ui-hint">{hint}</span> : null}
      </label>
    );
  },
);
