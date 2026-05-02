/**
 * Minimal inline-SVG sparkline. Renders a smooth polyline scaled to the
 * given width/height; stroke color is inherited via `currentColor`, so
 * parents can style it with Tailwind text-* utilities.
 */

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({
  values,
  width = 72,
  height = 20,
  className = "",
}: SparklineProps) {
  if (!values || values.length < 2) {
    return (
      <span className={`inline-block text-[10px] text-zinc-600 ${className}`}>—</span>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);

  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  // Close the path back to baseline so we can fill a subtle area.
  const first = values[0];
  const last = values[values.length - 1];
  const trendUp = last >= first;
  const fillId = `spark-fill-${trendUp ? "up" : "dn"}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill={`url(#${fillId})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
