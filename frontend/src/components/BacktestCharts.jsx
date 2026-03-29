import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

/**
 * Custom tooltip that matches the dark theme.
 */
function ChartTooltip({ active, payload, label, valuePrefix, valueSuffix }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{label}</p>
      {payload.map((entry, idx) => (
        <p key={idx} style={{ color: entry.color, margin: 0 }}>
          {entry.name}: {valuePrefix || ""}
          {typeof entry.value === "number" ? entry.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : entry.value}
          {valueSuffix || ""}
        </p>
      ))}
    </div>
  );
}

/**
 * Equity Curve Chart — shows portfolio value over time.
 */
export function EquityCurveChart({ data, initialCapital }) {
  if (!data || data.length === 0) return null;

  // Sample data to max ~60 points for readability
  const sampled = sampleData(data, 60);

  return (
    <div className="chart-container">
      <h3 className="chart-title">
        📈 Equity Curve
        <span className="chart-subtitle">Portfolio value over time</span>
      </h3>
      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={sampled} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "rgba(148,163,184,0.12)" }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
              width={55}
            />
            <Tooltip content={<ChartTooltip valuePrefix="$" />} />
            {initialCapital && (
              <ReferenceLine
                y={initialCapital}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                strokeWidth={1}
                label={{
                  value: "Initial",
                  position: "insideTopLeft",
                  fill: "#f59e0b",
                  fontSize: 10,
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey="equity"
              name="Equity"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#equityGrad)"
              dot={false}
              activeDot={{ r: 4, stroke: "#6366f1", strokeWidth: 2, fill: "#0b0e17" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Drawdown Chart — shows drawdown % from peak over time.
 */
export function DrawdownChart({ data }) {
  if (!data || data.length === 0) return null;

  const sampled = sampleData(data, 60);

  return (
    <div className="chart-container">
      <h3 className="chart-title">
        📉 Drawdown
        <span className="chart-subtitle">Decline from peak (%)</span>
      </h3>
      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={sampled} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "rgba(148,163,184,0.12)" }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `-${v}%`}
              width={50}
              reversed
            />
            <Tooltip content={<ChartTooltip valueSuffix="%" />} />
            <Area
              type="monotone"
              dataKey="drawdown"
              name="Drawdown"
              stroke="#ef4444"
              strokeWidth={1.5}
              fill="url(#ddGrad)"
              dot={false}
              activeDot={{ r: 4, stroke: "#ef4444", strokeWidth: 2, fill: "#0b0e17" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Down-sample array to a max of `maxPoints` evenly spaced entries.
 */
function sampleData(data, maxPoints) {
  if (data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  const result = [];
  for (let i = 0; i < data.length; i += step) {
    result.push(data[i]);
  }
  // Always include the last point
  if (result[result.length - 1] !== data[data.length - 1]) {
    result.push(data[data.length - 1]);
  }
  return result;
}
