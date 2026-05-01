import type { ButtonHTMLAttributes, ReactNode } from "react";

function cn(...values) {
  return values.filter(Boolean).join(" ");
}

type GradientButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  className?: string;
  variant?: string;
  theme?: string;
  size?: string;
  round?: boolean;
  children?: ReactNode;
};

export default function GradientButton({
  className = "",
  variant = "primary",
  theme = "default",
  size = "md",
  round = false,
  type = "button",
  children,
  ...props
}: GradientButtonProps) {
  return (
    <button
      type={type}
      className={cn("ui-button", className)}
      data-variant={variant}
      data-theme={theme}
      data-size={size}
      data-round={round ? "true" : "false"}
      {...props}
    >
      {children}
    </button>
  );
}
