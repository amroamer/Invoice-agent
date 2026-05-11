type Props = {
  variant?: "light" | "dark";
  size?: "sm" | "md";
  className?: string;
};

export function KpmgLogo({ variant = "light", size = "md", className }: Props) {
  const fg = variant === "dark" ? "#00338D" : "#FFFFFF";
  const w = size === "sm" ? 56 : 72;
  const h = size === "sm" ? 16 : 20;
  return (
    <svg
      viewBox="0 0 200 56"
      width={w}
      height={h}
      className={className}
      role="img"
      aria-label="KPMG"
    >
      <g fill={fg}>
        {/* Four squares logomark */}
        <rect x="0" y="0" width="20" height="20" />
        <rect x="24" y="0" width="20" height="20" />
        <rect x="0" y="24" width="20" height="20" />
        <rect x="24" y="24" width="20" height="20" />
        {/* KPMG wordmark */}
        <text
          x="56"
          y="34"
          fontFamily="Inter, sans-serif"
          fontWeight="800"
          fontSize="30"
          letterSpacing="-0.5"
        >
          KPMG
        </text>
      </g>
    </svg>
  );
}
