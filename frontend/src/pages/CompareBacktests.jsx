import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { getUserBacktests } from "../services/firestoreService";
import { OverlayChart } from "../components/BacktestCharts";
import { formatTickerDisplay } from "../utils/formatters";
import { API_BASE } from "../services/api";

const COLORS = ["#6366f1", "#10b981", "#ef4444", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f43f5e"];

export default function CompareBacktests() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // Load state
  const [backtests, setBacktests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters & Sorting
  const [filterTicker, setFilterTicker] = useState("");
  const [filterStrategy, setFilterStrategy] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: "createdAt", direction: "desc" });

  // Selection & Comparison State
  const [selectedIds, setSelectedIds] = useState([]);
  const [compareLoading, setCompareLoading] = useState(false);
  const [rawCompareData, setRawCompareData] = useState(null);
  const [normCompareData, setNormCompareData] = useState(null);
  const [compareLines, setCompareLines] = useState([]);
  
  const [normalizeChart, setNormalizeChart] = useState(false);
  const [cachedRuns, setCachedRuns] = useState(0);

  useEffect(() => {
    async function loadData() {
      if (!currentUser) return;
      setLoading(true);
      try {
        const data = await getUserBacktests(currentUser.uid);
        setBacktests(data);
      } catch (err) {
        setError("Failed to load backtests.");
      }
      setLoading(false);
    }
    loadData();
  }, [currentUser]);

  // -- Table Sorting & Filtering logic --
  const filteredAndSorted = useMemo(() => {
    let result = [...backtests];

    if (filterTicker) {
      result = result.filter((bt) => bt.ticker?.toUpperCase().includes(filterTicker.toUpperCase()));
    }
    if (filterStrategy) {
      result = result.filter((bt) => {
        const typeStr = (bt.strategyType || bt.strategyName || "sma_crossover").toLowerCase();
        return typeStr.includes(filterStrategy.toLowerCase());
      });
    }

    result.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      // Handle nested/legacy mappings for sort
      if (sortConfig.key === "createdAt") {
        aVal = aVal?.toMillis ? aVal.toMillis() : (aVal?.seconds ? aVal.seconds * 1000 : new Date(aVal).getTime());
        bVal = bVal?.toMillis ? bVal.toMillis() : (bVal?.seconds ? bVal.seconds * 1000 : new Date(bVal).getTime());
      } else if (sortConfig.key === "params") {
        // Just sort by string representation
        aVal = renderParams(a);
        bVal = renderParams(b);
      }

      // Safe fallback
      if (aVal === undefined || aVal === null) aVal = "";
      if (bVal === undefined || bVal === null) bVal = "";

      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [backtests, filterTicker, filterStrategy, sortConfig]);

  const requestSort = (key) => {
    let direction = "desc";
    if (sortConfig.key === key && sortConfig.direction === "desc") {
      direction = "asc";
    }
    setSortConfig({ key, direction });
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // -- Compare Charting logic --
  async function runComparison() {
    if (selectedIds.length === 0) return;
    if (selectedIds.length === 0) return;
    setCompareLoading(true);
    setRawCompareData(null);
    setNormCompareData(null);
    setCompareLines([]);
    setCachedRuns(0);

    // Get the actual items
    const selectedItems = backtests.filter((bt) => selectedIds.includes(bt.id));

    try {
      // Concurrently run all backtests mapped out explicitly to leverage the fastAPI engine speed
      const promises = selectedItems.map(async (bt) => {
        const strategyPayload = bt.strategyType || (bt.strategyName && !bt.strategyName.includes("Strategy") ? bt.strategyName : "sma_crossover");
        const res = await fetch(`${API_BASE}/api/run-backtest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticker: bt.ticker || "AAPL",
            strategy: strategyPayload,
            params: bt.params || { short_window: bt.shortWindow || 10, long_window: bt.longWindow || 30 },
            initial_capital: bt.initialCapital || 10000,
            start_date: bt.startDate || null,
            end_date: bt.endDate || null,
          }),
        });
        if (!res.ok) throw new Error("API call failed");
        return { id: bt.id, meta: bt, data: await res.json() };
      });

      const results = await Promise.all(promises);

      const rawMap = {};
      const normMap = {};
      const newLines = [];
      let cacheCount = 0;

      results.forEach((res, index) => {
        const runKey = `run_${res.id}`;
        const color = COLORS[index % COLORS.length];
        const displayLabel = `${formatTickerDisplay(res.meta.ticker)} ${renderParams(res.meta)}`;
        
        if (res.data.from_cache) {
          cacheCount++;
        }

        newLines.push({ dataKey: runKey, name: displayLabel, color: color });

        const initCap = res.data.metrics.initial_capital || 10000;

        res.data.equity_curve.forEach((point) => {
          if (!rawMap[point.date]) rawMap[point.date] = { date: point.date };
          if (!normMap[point.date]) normMap[point.date] = { date: point.date };
          
          rawMap[point.date][runKey] = point.equity;
          normMap[point.date][runKey] = ((point.equity / initCap) - 1) * 100;
        });
      });

      const rawSeries = Object.values(rawMap).sort((a, b) => new Date(a.date) - new Date(b.date));
      const normSeries = Object.values(normMap).sort((a, b) => new Date(a.date) - new Date(b.date));

      setCompareLines(newLines);
      setRawCompareData(rawSeries);
      setNormCompareData(normSeries);
      setCachedRuns(cacheCount);
    } catch (err) {
      console.error(err);
      setError("Failed to generate combined charts. Ensure backend server is running.");
    }

    setCompareLoading(false);
  }

  // Formatting helpers
  function renderParams(bt) {
    if (bt.params && Object.keys(bt.params).length > 0) {
      const typeStr = bt.strategyType || bt.strategyName || "";
      if (typeStr.includes("sma") || typeStr.includes("ema")) {
        return `${typeStr.toUpperCase().split("_")[0]}(${bt.params.short_window}/${bt.params.long_window})`;
      } else if (typeStr === "rsi") {
        return `RSI(${bt.params.rsi_period}) [${bt.params.oversold}-${bt.params.overbought}]`;
      } else if (typeStr === "macd") {
        return `MACD(${bt.params.fast_period}, ${bt.params.slow_period})`;
      } else if (typeStr === "bollinger") {
        return `BB(${bt.params.window}, ${bt.params.num_std_dev})`;
      }
      return "Custom Params";
    }
    return `SMA(${bt.shortWindow || 10}/${bt.longWindow || 30})`;
  }

  function formatDateRow(timestamp) {
    if (!timestamp) return "—";
    let date;
    if (timestamp.toDate) date = timestamp.toDate();
    else if (timestamp.seconds) date = new Date(timestamp.seconds * 1000);
    else if (typeof timestamp === "string" || typeof timestamp === "number") date = new Date(timestamp);
    else return "—";
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  return (
    <div className="dashboard-page">
      {/* Navbar matching Dashboard perfectly */}
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="10" fill="url(#nav-logo-cp)" />
            <path d="M10 28L16 18L22 22L30 12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="30" cy="12" r="3" fill="#fff"/>
            <defs>
              <linearGradient id="nav-logo-cp" x1="0" y1="0" x2="40" y2="40">
                <stop stopColor="#6366f1"/>
                <stop offset="1" stopColor="#8b5cf6"/>
              </linearGradient>
            </defs>
          </svg>
          <span>tradingGo</span>
        </div>
        <div className="nav-user">
          <button onClick={() => navigate("/dashboard")} className="nav-link-btn">← Dashboard</button>
        </div>
      </nav>

      <main className="dashboard-main">
        <div className="dashboard-welcome">
          <h1>
            <span className="gradient-text">Compare Backtests</span>
          </h1>
          <p className="welcome-subtitle">
            Select multi-strategy overlapping configurations to visually compare aggregated timelines dynamically.
          </p>
        </div>

        {error && <div className="auth-error" style={{ marginBottom: "1rem" }}>{error}</div>}

        {/* Overlay Chart Render */}
        {compareLoading && (
          <div className="data-loading" style={{ margin: "2rem 0" }}>
            <span className="btn-loader"></span>
            <span>Simulating API curves across elements...</span>
          </div>
        )}

        {rawCompareData && !compareLoading && (
          <div className="chart-container">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                <h3 className="card-title">Equity Overlay Compare</h3>
                {cachedRuns > 0 && (
                  <span className="badge" style={{ background: "rgba(16, 185, 129, 0.2)", color: "#10b981", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8rem", fontWeight: "bold" }}>
                    ⚡ {cachedRuns} Loaded from Cache
                  </span>
                )}
              </div>
              <button 
                onClick={() => setNormalizeChart(!normalizeChart)}
                className="btn-secondary"
                style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}
              >
                {normalizeChart ? "Show Raw Equity" : "Show % Return"}
              </button>
            </div>
            <OverlayChart 
               data={normalizeChart ? normCompareData : rawCompareData} 
               lines={compareLines} 
               isNormalized={normalizeChart} 
            />
          </div>
        )}

        <div className="data-card">
          <div className="data-card-header" style={{ flexWrap: "wrap", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <input
                type="text"
                placeholder="Filter Ticker... (e.g. AAPL)"
                value={filterTicker}
                onChange={(e) => setFilterTicker(e.target.value)}
                style={{ padding: "0.5rem", borderRadius: "8px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", width: "160px" }}
              />
              <select
                value={filterStrategy}
                onChange={(e) => setFilterStrategy(e.target.value)}
                style={{ padding: "0.5rem", borderRadius: "8px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
              >
                <option value="">All Strategies</option>
                <option value="sma">SMA</option>
                <option value="ema">EMA</option>
                <option value="rsi">RSI</option>
                <option value="macd">MACD</option>
                <option value="bollinger">Bollinger Bands</option>
              </select>
            </div>

            <button
              onClick={runComparison}
              disabled={selectedIds.length === 0 || compareLoading}
              className="auth-btn"
              style={{ width: "auto", padding: "0.5rem 1.5rem" }}
            >
              📊 Compare {selectedIds.length > 0 ? selectedIds.length : ""} Selected
            </button>
          </div>

          <div className="data-table-wrapper">
            {loading ? (
              <div className="data-loading">
                <span className="btn-loader"></span>
                <span>Loading backtests...</span>
              </div>
            ) : filteredAndSorted.length === 0 ? (
              <div className="data-empty">
                <p>No backtests found. Try adjusting your filters.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: "40px" }}></th>
                    <th onClick={() => requestSort("ticker")} style={{ cursor: "pointer" }}>
                      Ticker {sortConfig.key === "ticker" && (sortConfig.direction === "asc" ? "↑" : "↓")}
                    </th>
                    <th onClick={() => requestSort("params")} style={{ cursor: "pointer" }}>
                      Setup {sortConfig.key === "params" && (sortConfig.direction === "asc" ? "↑" : "↓")}
                    </th>
                    <th onClick={() => requestSort("returnPct")} style={{ cursor: "pointer" }}>
                      Return {sortConfig.key === "returnPct" && (sortConfig.direction === "asc" ? "↑" : "↓")}
                    </th>
                    <th onClick={() => requestSort("sharpeRatio")} style={{ cursor: "pointer" }}>
                      Sharpe {sortConfig.key === "sharpeRatio" && (sortConfig.direction === "asc" ? "↑" : "↓")}
                    </th>
                    <th onClick={() => requestSort("profitFactor")} style={{ cursor: "pointer" }}>
                      Prof Fact {sortConfig.key === "profitFactor" && (sortConfig.direction === "asc" ? "↑" : "↓")}
                    </th>
                    <th onClick={() => requestSort("maxDrawdown")} style={{ cursor: "pointer" }}>
                      Drawdown {sortConfig.key === "maxDrawdown" && (sortConfig.direction === "asc" ? "↑" : "↓")}
                    </th>
                    <th onClick={() => requestSort("winRate")} style={{ cursor: "pointer" }}>
                      Win Rate {sortConfig.key === "winRate" && (sortConfig.direction === "asc" ? "↑" : "↓")}
                    </th>
                    <th onClick={() => requestSort("createdAt")} style={{ cursor: "pointer" }}>
                      Date {sortConfig.key === "createdAt" && (sortConfig.direction === "asc" ? "↑" : "↓")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSorted.map((bt) => (
                    <tr
                      key={bt.id}
                      className={selectedIds.includes(bt.id) ? "row-selected" : ""}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(bt.id)}
                          onChange={() => toggleSelect(bt.id)}
                          style={{ accentColor: "#6366f1", cursor: "pointer", width: "16px", height: "16px" }}
                        />
                      </td>
                      <td>{formatTickerDisplay(bt.ticker)}</td>
                      <td>
                        <span className="table-badge badge-muted">
                          {renderParams(bt)}
                        </span>
                      </td>
                      <td>
                        <span className={bt.returnPct >= 0 ? "text-green" : "text-red"}>
                          {bt.returnPct >= 0 ? "+" : ""}{bt.returnPct?.toFixed(2)}%
                        </span>
                      </td>
                      <td>
                        {bt.sharpeRatio !== undefined && bt.sharpeRatio !== null ? (
                          <span className={bt.sharpeRatio >= 1 ? "text-green" : bt.sharpeRatio >= 0 ? "text-muted" : "text-red"}>
                            {bt.sharpeRatio.toFixed(2)}
                          </span>
                        ) : "—"}
                      </td>
                      <td>
                        {bt.profitFactor !== undefined && bt.profitFactor !== null ? (
                          <span className={bt.profitFactor >= 1 ? "text-green" : "text-red"}>
                            {bt.profitFactor >= 999 ? "∞" : bt.profitFactor.toFixed(2)}
                          </span>
                        ) : "—"}
                      </td>
                      <td>
                        <span className="text-red">-{bt.maxDrawdown?.toFixed(2)}%</span>
                      </td>
                      <td>{bt.winRate}%</td>
                      <td>{formatDateRow(bt.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>

      <style>{`
        .row-selected {
          background-color: rgba(99, 102, 241, 0.05); /* very subtle highlight */
        }
      `}</style>
    </div>
  );
}
