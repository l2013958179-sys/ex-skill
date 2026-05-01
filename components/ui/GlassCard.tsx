import type { ElementType, ReactNode } from "react";

function cn(...values) {
  return values.filter(Boolean).join(" ");
}

type GlassCardProps = {
  as?: ElementType;
  className?: string;
  theme?: string;
  hoverable?: boolean;
  compact?: boolean;
  children?: ReactNode;
} & Record<string, any>;

export default function GlassCard({
  as = "div",
  className = "",
  theme = "default",
  hoverable = false,
  compact = false,
  children,
  ...props
}: GlassCardProps) {
  const Component: ElementType = as;

  return (
    <Component
      className={cn(
        "glass-card",
        hoverable && "glass-card-hover",
        compact && "glass-card-compact",
        className,
      )}
      data-theme={theme}
      {...props}
    >
      {children}
    </Component>
  );
}
