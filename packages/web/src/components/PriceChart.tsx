import { useEffect, useRef, useState } from "react";
import { Area, AreaChart, XAxis, YAxis, CartesianGrid } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { fetchCompanyChart } from "../api/client";

const RANGES = ["1d", "5d", "1mo", "6mo", "1y", "5y"] as const;

const RANGE_LABELS: Record<string, string> = {
  "1d": "1D",
  "5d": "5D",
  "1mo": "1M",
  "6mo": "6M",
  "1y": "1Y",
  "5y": "5Y",
};

interface PriceChartProps {
  ticker: string;
}

interface ChartPoint {
  time: string;
  price: number;
}

function formatTimestamp(ts: number, range: string): string {
  const date = new Date(ts * 1000);
  if (range === "1d" || range === "5d") {
    return date.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  }
  if (range === "1mo" || range === "6mo") {
    return date.toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
  }
  return date.toLocaleDateString("nb-NO", { month: "short", year: "2-digit" });
}

export default function PriceChart({ ticker }: PriceChartProps) {
  const [range, _setRange] = useState<string>("1d");

  function setRange(r: string) {
    _setRange(r);
    setLoading(true);
    setError(false);
  }
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    const id = ++fetchIdRef.current;
    let cancelled = false;

    fetchCompanyChart(ticker, range)
      .then((chart) => {
        if (cancelled || id !== fetchIdRef.current) return;
        const points: ChartPoint[] = chart.timestamps
          .map((ts, i) => ({
            time: formatTimestamp(ts, range),
            price: chart.close[i],
          }))
          .filter((p) => p.price != null);
        setData(points);
        setError(false);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled && id === fetchIdRef.current) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ticker, range]);

  const chartConfig = {
    price: {
      label: "Kurs",
      color: "var(--color-accent)",
    },
  };

  return (
    <div>
      {/* Range selector */}
      <div className="mb-3 flex gap-1">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
              range === r ? "bg-ink text-surface" : "text-ink-tertiary hover:text-ink"
            }`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      {/* Chart */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent" />
        </div>
      ) : error ? (
        <div className="flex h-40 items-center justify-center text-sm text-ink-tertiary">
          Kan ikke laste graf
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="h-40 w-full">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.15} />
                <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              stroke="var(--color-border-light)"
            />
            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              fontSize={10}
              stroke="var(--color-ink-tertiary)"
              interval="preserveStartEnd"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              fontSize={10}
              stroke="var(--color-ink-tertiary)"
              domain={["dataMin", "dataMax"]}
              width={45}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              type="monotone"
              dataKey="price"
              stroke="var(--color-accent)"
              strokeWidth={2}
              fill="url(#priceGradient)"
            />
          </AreaChart>
        </ChartContainer>
      )}
    </div>
  );
}
