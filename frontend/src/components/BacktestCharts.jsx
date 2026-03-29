import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  LineChart,
  Line,
  Legend,
} from "recharts";

/**
 * Custom tooltip that matches the dark theme.
 */
export function ChartTooltip({ active, payload, label, valuePrefix = "", valueSuffix = "" }) {
  if (active && payload && payload.length) {
    return (
      <div className="custom-tooltip">
        <p className="tooltip-label">{label}</p>
        {payload.map((entry, index) => (
          <p key={`item-${index}`} className="tooltip-item" style={{ color: entry.color }}>
            <span className="tooltip-name">{entry.name}: </span>
            <span className="tooltip-value">
              {valuePrefix}{typeof entry.value === 'number' ? entry.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : entry.value}{valueSuffix}
            </span>
          </p>
        ))}
      </div>
    );
  }
  return null;
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

/**
 * Overlay chart for comparing multiple equity curves.
 * `data` looks like [{ date: '2025-01-01', "run_1": 10000, "run_2": 10000 }, ...]
 * `lines` looks like [{ dataKey: "run_1", name: "SMA Crossover AAPL", color: "#6366f1" }]
 */
export function OverlayChart({ data, lines, isNormalized = false }) {
  if (!data || data.length === 0 || !lines || lines.length === 0) return null;

  // Sample data to prevent chart lag if it's too dense
  const sampled = sampleData(data, 100);

  return (
    <div className="chart-container" style={{ padding: "0" }}>
      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={sampled} margin={{ top: 20, right: 20, left: 10, bottom: 0 }}>
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
              tickFormatter={(v) => isNormalized ? `${(v).toFixed(1)}%` : `$${(v / 1000).toFixed(1)}k`}
              width={isNormalized ? 60 : 55}
            />
            <Tooltip content={<ChartTooltip valuePrefix={isNormalized ? "" : "$"} valueSuffix={isNormalized ? "%" : ""} />} />
            <Legend wrapperStyle={{ paddingTop: "20px", fontSize: "14px", color: "#94a3b8" }} />
            {lines.map((ln) => (
              <Line
                key={ln.dataKey}
                type="monotone"
                dataKey={ln.dataKey}
                name={ln.name}
                stroke={ln.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, stroke: ln.color, strokeWidth: 2, fill: "#0b0e17" }}
                connectNulls={true}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
