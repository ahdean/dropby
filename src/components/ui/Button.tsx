import type { ButtonHTMLAttributes, ReactNode } from "react";
import { PixelIcon, type IconName } from "./PixelIcon";

export type ButtonVariant = "stone" | "free" | "join" | "locked" | "danger" | "dark";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  stone: "",
  free: "tile-free",
  join: "tile-join",
  locked: "tile-locked",
  danger: "tile-danger",
  dark: "tile-dark",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  icon?: IconName;
  busy?: boolean;
  children?: ReactNode;
}

/** A bevelled stone tile you can press. `variant` picks the colour. */
export function Button({
  variant = "stone",
  size = "md",
  icon,
  busy = false,
  className = "",
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn tile ${VARIANT_CLASS[variant]} ${size === "sm" ? "btn-sm" : ""} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {icon && <PixelIcon name={icon} size={size === "sm" ? 14 : 16} className={busy ? "animate-blink" : ""} />}
      {children}
    </button>
  );
}

/** Square icon-only button. `label` is read by screen readers and shown as a tooltip. */
export function IconButton({
  icon,
  label,
  variant = "dark",
  className = "",
  size = 16,
  ...rest
}: Omit<ButtonProps, "children" | "icon" | "size"> & { icon: IconName; label: string; size?: number }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`btn tile ${VARIANT_CLASS[variant]} !min-h-[40px] !w-10 !p-0 ${className}`}
      {...rest}
    >
      <PixelIcon name={icon} size={size} />
    </button>
  );
}
