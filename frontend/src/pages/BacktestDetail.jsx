import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getBacktestById } from "../services/firestoreService";
import { EquityCurveChart, DrawdownChart } from "../components/BacktestCharts";
import { formatTickerDisplay } from "../utils/formatters";
import { API_BASE } from "../services/api";

export default function BacktestDetail() {
  const { id } = useParams();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [backtest, setBacktest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Re-run state (to fetch equity/drawdown curves from API)
  const [liveResult, setLiveResult] = useState(null);
  const [rerunning, setRerunning] = useState(false);

  useEffect(() => {
    async function fetchBacktest() {
      if (!currentUser || !id) return;
      setLoading(true);
      try {
        const data = await getBacktestById(id);
        if (!data || data.userId !== currentUser.uid) {
          setError("Backtest not found or access denied.");
        } else {
          setBacktest(data);
          // Auto-fetch charts by re-running the backtest
          fetchLiveData(data);
        }
      } catch (err) {
        setError(err.message || "Failed to load backtest.");
      }
      setLoading(false);
    }

    fetchBacktest();
  }, [id, currentUser]);

  /**
   * Re-run the backtest with saved parameters to get equity/drawdown curves.
   */
  async function fetchLiveData(bt) {
    setRerunning(true);
    try {
      const res = await fetch(`${API_BASE}/api/run-backtest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: bt.ticker || "AAPL",
          strategy: bt.strategyType || (bt.strategyName && !bt.strategyName.includes("Strategy") ? bt.strategyName : "sma_crossover"),
          params: bt.params || { short_window: bt.shortWindow || 10, long_window: bt.longWindow || 30 },
          initial_capital: bt.initialCapital || 10000,
          start_date: bt.startDate || null,
          end_date: bt.endDate || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLiveResult(data);
      }
    } catch (err) {
      console.warn("Could not fetch live chart data:", err);
    }
    setRerunning(false);
  }

  function formatDate(timestamp) {
    if (!timestamp) return "—";
    let date;
    if (timestamp.toDate) date = timestamp.toDate();
    else if (timestamp.seconds) date = new Date(timestamp.seconds * 1000);
    else if (typeof timestamp === "string" || typeof timestamp === "number") date = new Date(timestamp);
    else return "—";
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  function renderParams(bt) {
    if (bt.params && Object.keys(bt.params).length > 0) {
      if (bt.strategyName?.includes("sma") || bt.strategyName?.includes("ema")) {
        return `${bt.strategyName.toUpperCase().split("_")[0]}(${bt.params.short_window}/${bt.params.long_window})`;
      } else if (bt.strategyName === "rsi") {
        return `RSI(${bt.params.rsi_period}) [${bt.params.oversold}-${bt.params.overbought}]`;
      } else if (bt.strategyName === "macd") {
        return `MACD(${bt.params.fast_period}, ${bt.params.slow_period}, ${bt.params.signal_period})`;
      } else if (bt.strategyName === "bollinger") {
        return `BB(${bt.params.window}, ${bt.params.num_std_dev})`;
      }
      // generic
      return "Custom Params";
    }
    // Legacy fallback
    return `SMA(${bt.shortWindow || 10}/${bt.longWindow || 30})`;
  }

  if (loading) {
    return (
      <div className="dashboard-page">
        <nav className="dashboard-nav">
          <div className="nav-brand">
            <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="10" fill="url(#nav-logo-bd)" />
              <path d="M10 28L16 18L22 22L30 12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="30" cy="12" r="3" fill="#fff"/>
              <defs><linearGradient id="nav-logo-bd" x1="0" y1="0" x2="40" y2="40"><stop stopColor="#6366f1"/><stop offset="1" stopColor="#8b5cf6"/></linearGradient></defs>
            </svg>
            <span>tradingGo</span>
          </div>
        </nav>
        <main className="dashboard-main">
          <div className="data-loading" style={{ marginTop: "4rem" }}>
            <span className="btn-loader"></span>
            <span>Loading backtest...</span>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-page">
        <nav className="dashboard-nav">
          <div className="nav-brand">
            <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="10" fill="url(#nav-logo-bd2)" />
              <path d="M10 28L16 18L22 22L30 12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="30" cy="12" r="3" fill="#fff"/>
              <defs><linearGradient id="nav-logo-bd2" x1="0" y1="0" x2="40" y2="40"><stop stopColor="#6366f1"/><stop offset="1" stopColor="#8b5cf6"/></linearGradient></defs>
            </svg>
            <span>tradingGo</span>
          </div>
          <div className="nav-user">
            <button onClick={() => navigate("/dashboard")} className="nav-link-btn">← Dashboard</button>
          </div>
        </nav>
        <main className="dashboard-main">
          <div className="auth-error" style={{ marginTop: "4rem" }}>{error}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      {/* Navbar */}
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="10" fill="url(#nav-logo-bd3)" />
            <path d="M10 28L16 18L22 22L30 12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="30" cy="12" r="3" fill="#fff"/>
            <defs><linearGradient id="nav-logo-bd3" x1="0" y1="0" x2="40" y2="40"><stop stopColor="#6366f1"/><stop offset="1" stopColor="#8b5cf6"/></linearGradient></defs>
          </svg>
          <span>tradingGo</span>
        </div>
        <div className="nav-user">
          <button onClick={() => navigate("/dashboard")} className="nav-link-btn" id="back-to-dashboard">
            ← Dashboard
          </button>
        </div>
      </nav>

      <main className="dashboard-main">
        {/* Header */}
        <div className="dashboard-welcome">
          <h1>
            <span className="gradient-text">{backtest.strategyName || "SMA Crossover"}</span>
          </h1>
          <p className="welcome-subtitle">
            {formatTickerDisplay(backtest.ticker)} • {renderParams(backtest)} • ${(backtest.initialCapital || 10000).toLocaleString()} capital
            <br />
            {backtest.startDate && backtest.endDate ? `${backtest.startDate} → ${backtest.endDate} • ${backtest.dataPoints} days` : formatDate(backtest.createdAt)}
          </p>
        </div>

        {/* Metrics Grid */}
        <div className="bt-metrics-grid bt-metrics-grid-detail">
          <div className="bt-metric">
            <span className="bt-metric-label">Total Return</span>
            <span className={`bt-metric-value ${backtest.returnPct >= 0 ? "text-green" : "text-red"}`}>
              {backtest.returnPct >= 0 ? "+" : ""}{backtest.returnPct?.toFixed(2)}%
            </span>
          </div>
          <div className="bt-metric">
            <span className="bt-metric-label">Final Equity</span>
            <span className="bt-metric-value">${backtest.finalEquity?.toLocaleString()}</span>
          </div>
          <div className="bt-metric">
            <span className="bt-metric-label">Initial Capital</span>
            <span className="bt-metric-value">${(backtest.initialCapital || 10000).toLocaleString()}</span>
          </div>
          <div className="bt-metric">
            <span className="bt-metric-label">Trades</span>
            <span className="bt-metric-value">{backtest.numTrades}</span>
          </div>
          <div className="bt-metric">
            <span className="bt-metric-label">Win Rate</span>
            <span className="bt-metric-value">{backtest.winRate}%</span>
          </div>
          <div className="bt-metric">
            <span className="bt-metric-label">Max Drawdown</span>
            <span className="bt-metric-value text-red">-{backtest.maxDrawdown?.toFixed(2)}%</span>
          </div>
          {backtest.sharpeRatio !== undefined && backtest.sharpeRatio !== null && (
            <div className="bt-metric">
              <span className="bt-metric-label">Sharpe Ratio</span>
              <span className={`bt-metric-value ${backtest.sharpeRatio >= 1 ? "text-green" : backtest.sharpeRatio >= 0 ? "text-muted" : "text-red"}`}>
                {backtest.sharpeRatio.toFixed(2)}
              </span>
            </div>
          )}
          {backtest.profitFactor !== undefined && backtest.profitFactor !== null && (
            <div className="bt-metric">
              <span className="bt-metric-label">Profit Factor</span>
              <span className={`bt-metric-value ${backtest.profitFactor >= 1 ? "text-green" : "text-red"}`}>
                {backtest.profitFactor >= 999 ? "∞" : backtest.profitFactor.toFixed(2)}
              </span>
            </div>
          )}
          {backtest.cagrPct !== undefined && backtest.cagrPct !== null && (
            <div className="bt-metric">
              <span className="bt-metric-label">CAGR</span>
              <span className={`bt-metric-value ${backtest.cagrPct >= 0 ? "text-green" : "text-red"}`}>
                {backtest.cagrPct >= 0 ? "+" : ""}{backtest.cagrPct.toFixed(2)}%
              </span>
            </div>
          )}
          {backtest.sortinoRatio !== undefined && backtest.sortinoRatio !== null && (
            <div className="bt-metric">
              <span className="bt-metric-label">Sortino Ratio</span>
              <span className={`bt-metric-value ${backtest.sortinoRatio >= 1 ? "text-green" : backtest.sortinoRatio >= 0 ? "text-muted" : "text-red"}`}>
                {backtest.sortinoRatio.toFixed(2)}
              </span>
            </div>
          )}
          {backtest.calmarRatio !== undefined && backtest.calmarRatio !== null && (
            <div className="bt-metric">
              <span className="bt-metric-label">Calmar Ratio</span>
              <span className={`bt-metric-value ${backtest.calmarRatio >= 1 ? "text-green" : backtest.calmarRatio >= 0 ? "text-muted" : "text-red"}`}>
                {backtest.calmarRatio.toFixed(2)}
              </span>
            </div>
          )}
          <div className="bt-metric">
            <span className="bt-metric-label">Avg Win</span>
            <span className="bt-metric-value text-green">${backtest.avgWin?.toFixed(2)}</span>
          </div>
          <div className="bt-metric">
            <span className="bt-metric-label">Avg Loss</span>
            <span className="bt-metric-value text-red">${Math.abs(backtest.avgLoss || 0).toFixed(2)}</span>
          </div>
        </div>

        {/* Charts */}
        {rerunning && (
          <div className="data-loading" style={{ marginBottom: "1rem" }}>
            <span className="btn-loader"></span>
            <span>Loading charts...</span>
          </div>
        )}

        {liveResult && (
          <div className="charts-grid">
            <EquityCurveChart
              data={liveResult.equity_curve}
              initialCapital={backtest.initialCapital || 10000}
            />
            <DrawdownChart data={liveResult.drawdown_curve} />
          </div>
        )}

        {!liveResult && !rerunning && (
          <div className="data-card">
            <div className="data-empty">
              <p>Charts unavailable — FastAPI backend may be offline.</p>
              <p className="data-empty-hint">Start the backend to see the equity curve and drawdown charts.</p>
            </div>
          </div>
        )}

        {/* Trade Log from live re-run */}
        {liveResult && liveResult.trades.length > 0 && (
          <div className="data-card">
            <div className="data-card-header">
              <h2>📋 Trade Log</h2>
              <span className="data-count">{liveResult.trades.length} trades</span>
            </div>
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Entry</th>
                    <th>Exit</th>
                    <th>Shares</th>
                    <th>P&L</th>
                    <th>Return</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {liveResult.trades.map((t, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td>
                        <span className="td-primary">${t.entry_price}</span>
                        <br /><span className="trade-date">{t.entry_date}</span>
                      </td>
                      <td>
                        <span className="td-primary">${t.exit_price}</span>
                        <br /><span className="trade-date">{t.exit_date}</span>
                      </td>
                      <td>{t.shares}</td>
                      <td>
                        <span className={t.pnl >= 0 ? "text-green" : "text-red"}>
                          {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}
                        </span>
                      </td>
                      <td>
                        <span className={t.pnl_pct >= 0 ? "text-green" : "text-red"}>
                          {t.pnl_pct >= 0 ? "+" : ""}{t.pnl_pct.toFixed(2)}%
                        </span>
                      </td>
                      <td>
                        <span className="table-badge badge-muted">{t.type}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ marginTop: "1rem" }}>
          <button className="sb-secondary-btn" onClick={() => navigate("/dashboard")}>
            ← Back to Dashboard
          </button>
        </div>
      </main>
    </div>
  );
}
