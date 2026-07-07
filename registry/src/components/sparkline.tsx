import { cn } from "@/lib/utils";

type SparklineProps = {
  /** Values ordered oldest to newest. */
  data: number[];
  className?: string;
};

const WIDTH = 100;
const HEIGHT = 32;
const TOP_PADDING = 2;

/**
 * Tiny npm-style area sparkline. Renders nothing when there are fewer than
 * two data points.
 */
export function Sparkline({ data, className }: SparklineProps) {
  if (data.length < 2) {
    return null;
  }

  const max = Math.max(...data, 1);
  const step = WIDTH / (data.length - 1);
  const points = data.map((value, index) => {
    const x = index * step;
    const y = HEIGHT - (value / max) * (HEIGHT - TOP_PADDING);
    return { x, y };
  });

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
  const area = `${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden
      className={cn("block", className)}
    >
      <path d={area} className="fill-primary/15" />
      <path
        d={line}
        className="stroke-primary"
        fill="none"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
