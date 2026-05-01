"use client";

import GlassCard from "@/components/ui/GlassCard";

function cn(...values) {
  return values.filter(Boolean).join(" ");
}

export default function CollapsiblePanel({
  eyebrow,
  title,
  description,
  meta,
  icon,
  isExpanded,
  onToggle,
  theme = "default",
  className = "",
  children,
}) {
  return (
    <GlassCard className={cn("collapsible-panel", className)} theme={theme}>
      <button
        type="button"
        className={cn("collapsible-trigger", isExpanded && "is-expanded")}
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <div className="collapsible-trigger-copy">
          <div className="collapsible-trigger-title">
            {icon ? <span className="collapsible-icon" aria-hidden="true">{icon}</span> : null}
            <div>
              {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
              <h3>{title}</h3>
            </div>
          </div>
          {description ? <p className="collapsible-trigger-description">{description}</p> : null}
        </div>
        <div className="collapsible-trigger-meta">
          {meta ? <span className="settings-tip">{meta}</span> : null}
          <span className={cn("memory-toggle-arrow", isExpanded && "is-expanded")} aria-hidden="true">
            ▾
          </span>
        </div>
      </button>

      <div className={cn("collapsible-body", isExpanded && "is-expanded")}>
        <div className="collapsible-body-inner">{children}</div>
      </div>
    </GlassCard>
  );
}
