function cn(...values) {
  return values.filter(Boolean).join(" ");
}

export default function TypingDots({ className = "", theme = "default", label = "正在生成回复" }) {
  return (
    <span className={cn("loading-dots", className)} data-theme={theme} aria-label={label}>
      <span />
      <span />
      <span />
    </span>
  );
}
