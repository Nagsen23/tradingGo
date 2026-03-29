import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  getUserStrategies,
  getUserBacktests,
  saveBacktestRun,
  deleteStrategy,
  updateStrategyStatus,
} from "../services/firestoreService";
import { EquityCurveChart, DrawdownChart } from "../components/BacktestCharts";

const API_BASE = "http://localhost:8000";

export default function Dashboard() {
  const { currentUser, userProfile, logout } = useAuth();
  const navigate = useNavigate();

  // Firestore data state
  const [strategies, setStrategies] = useState([]);
  const [backtests, setBacktests] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Backtest form state
  const [btTicker, setBtTicker] = useState("AAPL");
  const [btShortWindow, setBtShortWindow] = useState(10);
  const [btLongWindow, setBtLongWindow] = useState(30);
  const [btCapital, setBtCapital] = useState(10000);
  const [btRunning, setBtRunning] = useState(false);
  const [btResult, setBtResult] = useState(null);
  const [btError, setBtError] = useState("");
  const [btSaved, setBtSaved] = useState(false);
  const [btSourceStrategy, setBtSourceStrategy] = useState(null);

  // Available tickers
  const [tickers, setTickers] = useState([
    { symbol: "AAPL", name: "Apple Inc." },
    { symbol: "GOOGL", name: "Alphabet Inc." },
    { symbol: "TSLA", name: "Tesla Inc." },
    { symbol: "MSFT", name: "Microsoft Corp." },
    { symbol: "AMZN", name: "Amazon.com Inc." },
  ]);

  // Backend status
  const [backendOnline, setBackendOnline] = useState(null);

  // Strategy actions
  const [deletingId, setDeletingId] = useState(null);

  /**
   * Fetch dashboard data + check backend health on mount.
   */
  useEffect(() => {
    async function fetchData() {
      if (!currentUser) return;

      setDataLoading(true);
      try {
        const [strats, tests] = await Promise.all([
          getUserStrategies(currentUser.uid),
          getUserBacktests(currentUser.uid),
        ]);
        setStrategies(strats);
        setBacktests(tests);
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
      }
      setDataLoading(false);
    }

    async function checkBackend() {
      try {
        const res = await fetch(`${API_BASE}/api/health`);
        if (res.ok) {
          const data = await res.json();
          setBackendOnline(true);
          if (data.available_tickers) {
            const tickerNames = {
              AAPL: "Apple Inc.",
              GOOGL: "Alphabet Inc.",
              TSLA: "Tesla Inc.",
              MSFT: "Microsoft Corp.",
              AMZN: "Amazon.com Inc.",
            };
            setTickers(
              data.available_tickers.map((t) => ({
                symbol: t,
                name: tickerNames[t] || t,
              }))
            );
          }
        } else {
          setBackendOnline(false);
        }
      } catch {
        setBackendOnline(false);
      }
    }

    fetchData();
    checkBackend();
  }, [currentUser]);

  /**
   * Run backtest via FastAPI backend.
   */
  async function handleRunBacktest(e) {
    e.preventDefault();
    setBtError("");
    setBtResult(null);
    setBtSaved(false);
    setBtRunning(true);

    try {
      const res = await fetch(`${API_BASE}/api/run-backtest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: btTicker,
          strategy: "sma_crossover",
          short_window: btShortWindow,
          long_window: btLongWindow,
          initial_capital: btCapital,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Backtest failed.");
      }

      const data = await res.json();
      setBtResult(data);

      // Save to Firestore
      try {
        await saveBacktestRun(currentUser.uid, {
          ...data,
          short_window: btShortWindow,
          long_window: btLongWindow,
          strategyName: btSourceStrategy?.name || data.strategy,
        });
        setBtSaved(true);

        const updatedBacktests = await getUserBacktests(currentUser.uid);
        setBacktests(updatedBacktests);
      } catch (saveErr) {
        console.error("Failed to save to Firestore:", saveErr);
      }
    } catch (err) {
      setBtError(err.message);
    }
    setBtRunning(false);
  }

  /**
   * Load a saved strategy's parameters into the backtest form.
   */
  function handleRunFromStrategy(strategy) {
    setBtTicker(strategy.ticker || "AAPL");
    setBtShortWindow(strategy.shortWindow || 10);
    setBtLongWindow(strategy.longWindow || 30);
    setBtCapital(strategy.initialCapital || 10000);
    setBtSourceStrategy(strategy);
    setBtResult(null);
    setBtError("");
    setBtSaved(false);

    // Scroll to backtest panel
    document.getElementById("backtest-panel")?.scrollIntoView({ behavior: "smooth" });
  }

  /**
   * Delete a strategy from Firestore.
   */
  async function handleDeleteStrategy(strategyId) {
    if (!window.confirm("Delete this strategy? This cannot be undone.")) return;
    setDeletingId(strategyId);
    try {
      await deleteStrategy(strategyId);
      setStrategies((prev) => prev.filter((s) => s.id !== strategyId));
    } catch (err) {
      console.error("Failed to delete strategy:", err);
    }
    setDeletingId(null);
  }

  /**
   * Toggle strategy status between draft and active.
   */
  async function handleToggleStatus(strategy) {
    const newStatus = strategy.status === "active" ? "draft" : "active";
    try {
      await updateStrategyStatus(strategy.id, newStatus);
      setStrategies((prev) =>
        prev.map((s) => (s.id === strategy.id ? { ...s, status: newStatus } : s))
      );
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  }

  async function handleLogout() {
    try {
      await logout();
      navigate("/login");
    } catch {
      console.error("Failed to log out");
    }
  }

  /* ---------- Helpers ---------- */

  function formatDate(timestamp) {
    if (!timestamp) return "—";
    let date;
    if (timestamp.toDate) {
      date = timestamp.toDate();
    } else if (timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else if (typeof timestamp === "string" || typeof timestamp === "number") {
      date = new Date(timestamp);
    } else {
      return "—";
    }
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function getMemberSince() {
    if (userProfile?.createdAt) return formatDate(userProfile.createdAt);
    if (currentUser?.metadata?.creationTime) {
      return new Date(currentUser.metadata.creationTime).toLocaleDateString(
        "en-US",
        { year: "numeric", month: "short", day: "numeric" }
      );
    }
    return "—";
  }

  return (
    <div className="dashboard-page">
      {/* Navbar */}
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="10" fill="url(#nav-logo)" />
            <path d="M10 28L16 18L22 22L30 12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="30" cy="12" r="3" fill="#fff"/>
            <defs>
              <linearGradient id="nav-logo" x1="0" y1="0" x2="40" y2="40">
                <stop stopColor="#6366f1"/>
                <stop offset="1" stopColor="#8b5cf6"/>
              </linearGradient>
            </defs>
          </svg>
          <span>tradingGo</span>
        </div>

        <div className="nav-user">
          {backendOnline !== null && (
            <span className={`backend-status ${backendOnline ? "status-online" : "status-offline"}`}>
              {backendOnline ? "● API Online" : "● API Offline"}
            </span>
          )}
          <button
            onClick={() => navigate("/strategy-builder")}
            className="nav-link-btn"
            id="nav-strategy-builder"
          >
            + New Strategy
          </button>
          <div className="user-avatar">
            {(userProfile?.displayName || currentUser?.email || "?")
              .charAt(0)
              .toUpperCase()}
          </div>
          <button onClick={handleLogout} className="logout-btn" id="logout-button">
            Sign Out
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main className="dashboard-main">
        <div className="dashboard-welcome">
          <h1>
            Welcome to <span className="gradient-text">tradingGo</span>
          </h1>
          <p className="welcome-subtitle">
            {userProfile
              ? `Logged in as ${userProfile.email}`
              : "Your trading platform is ready. Start building your strategies."}
          </p>
        </div>

        {/* Stats cards */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon stat-icon-purple">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>
              </svg>
            </div>
            <div className="stat-info">
              <span className="stat-label">Strategies</span>
              <span className="stat-value">
                {dataLoading ? <span className="stat-skeleton"></span> : strategies.length}
              </span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon stat-icon-blue">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </div>
            <div className="stat-info">
              <span className="stat-label">Backtests</span>
              <span className="stat-value">
                {dataLoading ? <span className="stat-skeleton"></span> : backtests.length}
              </span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon stat-icon-green">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23"/>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </div>
            <div className="stat-info">
              <span className="stat-label">Plan</span>
              <span className="stat-value">
                {dataLoading ? (
                  <span className="stat-skeleton"></span>
                ) : (
                  <span className="plan-badge">
                    {(userProfile?.role || "free").toUpperCase()}
                  </span>
                )}
              </span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon stat-icon-amber">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div className="stat-info">
              <span className="stat-label">Member Since</span>
              <span className="stat-value stat-value-small">
                {dataLoading ? <span className="stat-skeleton"></span> : getMemberSince()}
              </span>
            </div>
          </div>
        </div>

        {/* ═══ YOUR STRATEGIES (with actions) ═══ */}
        <div className="data-card">
          <div className="data-card-header">
            <h2>📊 Your Strategies</h2>
            <div className="data-card-actions">
              <span className="data-count">{strategies.length} total</span>
              <button
                className="small-action-btn btn-accent"
                onClick={() => navigate("/strategy-builder")}
              >
                + Create
              </button>
            </div>
          </div>
          {dataLoading ? (
            <div className="data-loading">
              <span className="btn-loader"></span>
              <span>Loading strategies...</span>
            </div>
          ) : strategies.length === 0 ? (
            <div className="data-empty">
              <p>No strategies yet.</p>
              <p className="data-empty-hint">
                <button
                  className="link-btn"
                  onClick={() => navigate("/strategy-builder")}
                >
                  Create your first strategy →
                </button>
              </p>
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Ticker</th>
                    <th>SMA</th>
                    <th>Capital</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {strategies.map((s) => (
                    <tr key={s.id} className={btSourceStrategy?.id === s.id ? "row-highlighted" : ""}>
                      <td className="td-primary">{s.name || "Untitled"}</td>
                      <td>{s.ticker || "—"}</td>
                      <td>{s.shortWindow || 10}/{s.longWindow || 30}</td>
                      <td>${(s.initialCapital || 10000).toLocaleString()}</td>
                      <td>
                        <button
                          className={`table-badge clickable ${s.status === "active" ? "badge-green" : "badge-muted"}`}
                          onClick={() => handleToggleStatus(s)}
                          title="Click to toggle status"
                        >
                          {s.status || "draft"}
                        </button>
                      </td>
                      <td>{formatDate(s.createdAt)}</td>
                      <td>
                        <div className="action-btns">
                          <button
                            className="small-action-btn btn-run"
                            onClick={() => handleRunFromStrategy(s)}
                            disabled={!backendOnline}
                            title="Run backtest with this strategy"
                          >
                            ▶ Run
                          </button>
                          <button
                            className="small-action-btn btn-danger"
                            onClick={() => handleDeleteStrategy(s.id)}
                            disabled={deletingId === s.id}
                            title="Delete strategy"
                          >
                            {deletingId === s.id ? "..." : "✕"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ═══ RUN BACKTEST PANEL ═══ */}
        <div className="backtest-panel" id="backtest-panel">
          <div className="backtest-panel-header">
            <h2>
              🧪 Run Backtest
              {btSourceStrategy && (
                <span className="bt-source-label">
                  from "{btSourceStrategy.name}"
                </span>
              )}
            </h2>
            {!backendOnline && backendOnline !== null && (
              <span className="backend-warning">
                FastAPI server not running — start it with: <code>uvicorn app.main:app --reload</code>
              </span>
            )}
          </div>

          <form onSubmit={handleRunBacktest} className="backtest-form">
            <div className="bt-form-grid">
              <div className="form-group">
                <label htmlFor="bt-ticker">Ticker</label>
                <select
                  id="bt-ticker"
                  value={btTicker}
                  onChange={(e) => { setBtTicker(e.target.value); setBtSourceStrategy(null); }}
                >
                  {tickers.map((t) => (
                    <option key={t.symbol} value={t.symbol}>
                      {t.symbol} — {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="bt-short">Short SMA</label>
                <input
                  id="bt-short"
                  type="number"
                  min="2"
                  max="49"
                  value={btShortWindow}
                  onChange={(e) => { setBtShortWindow(Number(e.target.value)); setBtSourceStrategy(null); }}
                />
              </div>

              <div className="form-group">
                <label htmlFor="bt-long">Long SMA</label>
                <input
                  id="bt-long"
                  type="number"
                  min="5"
                  max="100"
                  value={btLongWindow}
                  onChange={(e) => { setBtLongWindow(Number(e.target.value)); setBtSourceStrategy(null); }}
                />
              </div>

              <div className="form-group">
                <label htmlFor="bt-capital">Capital ($)</label>
                <input
                  id="bt-capital"
                  type="number"
                  min="100"
                  max="1000000"
                  step="100"
                  value={btCapital}
                  onChange={(e) => { setBtCapital(Number(e.target.value)); setBtSourceStrategy(null); }}
                />
              </div>
            </div>

            <button
              type="submit"
              className="auth-btn backtest-btn"
              disabled={btRunning || !backendOnline}
            >
              {btRunning ? (
                <>
                  <span className="btn-loader"></span>
                  <span style={{ marginLeft: "0.5rem" }}>Running backtest...</span>
                </>
              ) : (
                "▶ Run Backtest"
              )}
            </button>
          </form>

          {btError && <div className="auth-error" style={{ marginTop: "1rem" }}>{btError}</div>}

          {/* Results Card */}
          {btResult && (
            <div className="bt-results">
              <div className="bt-results-header">
                <h3>
                  Results — {btResult.ticker}{" "}
                  <span className="text-muted" style={{ fontWeight: 400, fontSize: "0.85rem" }}>
                    SMA({btShortWindow}/{btLongWindow})
                  </span>
                  {btSourceStrategy && (
                    <span className="bt-source-tag">via "{btSourceStrategy.name}"</span>
                  )}
                </h3>
                {btSaved && (
                  <span className="bt-saved-badge">✓ Saved to Firestore</span>
                )}
              </div>

              <div className="bt-metrics-grid">
                <div className="bt-metric">
                  <span className="bt-metric-label">Total Return</span>
                  <span className={`bt-metric-value ${btResult.metrics.total_return_pct >= 0 ? "text-green" : "text-red"}`}>
                    {btResult.metrics.total_return_pct >= 0 ? "+" : ""}
                    {btResult.metrics.total_return_pct.toFixed(2)}%
                  </span>
                </div>
                <div className="bt-metric">
                  <span className="bt-metric-label">Final Equity</span>
                  <span className="bt-metric-value">
                    ${btResult.metrics.final_equity.toLocaleString()}
                  </span>
                </div>
                <div className="bt-metric">
                  <span className="bt-metric-label">Trades</span>
                  <span className="bt-metric-value">{btResult.metrics.num_trades}</span>
                </div>
                <div className="bt-metric">
                  <span className="bt-metric-label">Win Rate</span>
                  <span className="bt-metric-value">{btResult.metrics.win_rate.toFixed(1)}%</span>
                </div>
                <div className="bt-metric">
                  <span className="bt-metric-label">Max Drawdown</span>
                  <span className="bt-metric-value text-red">
                    -{btResult.metrics.max_drawdown_pct.toFixed(2)}%
                  </span>
                </div>
                <div className="bt-metric">
                  <span className="bt-metric-label">Avg Win</span>
                  <span className="bt-metric-value text-green">
                    ${btResult.metrics.avg_win.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Charts */}
              {btResult.equity_curve && btResult.equity_curve.length > 0 && (
                <div className="charts-grid">
                  <EquityCurveChart
                    data={btResult.equity_curve}
                    initialCapital={btCapital}
                  />
                  <DrawdownChart data={btResult.drawdown_curve} />
                </div>
              )}

              {btResult.trades.length > 0 && (
                <div className="bt-trades-section">
                  <h4>Trade Log</h4>
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
                        </tr>
                      </thead>
                      <tbody>
                        {btResult.trades.map((t, idx) => (
                          <tr key={idx}>
                            <td>{idx + 1}</td>
                            <td>
                              <span className="td-primary">${t.entry_price}</span>
                              <br />
                              <span className="trade-date">{t.entry_date}</span>
                            </td>
                            <td>
                              <span className="td-primary">${t.exit_price}</span>
                              <br />
                              <span className="trade-date">{t.exit_date}</span>
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
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recent Backtests from Firestore */}
        <div className="data-card">
          <div className="data-card-header">
            <h2>⚡ Recent Backtests</h2>
            <span className="data-count">{backtests.length} total</span>
          </div>
          {dataLoading ? (
            <div className="data-loading">
              <span className="btn-loader"></span>
              <span>Loading backtests...</span>
            </div>
          ) : backtests.length === 0 ? (
            <div className="data-empty">
              <p>No backtest runs yet.</p>
              <p className="data-empty-hint">
                Use the panel above to run your first backtest!
              </p>
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Strategy</th>
                    <th>Ticker</th>
                    <th>Return</th>
                    <th>Win Rate</th>
                    <th>Trades</th>
                    <th>Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {backtests.map((bt) => (
                    <tr key={bt.id} className="row-clickable" onClick={() => navigate(`/backtest/${bt.id}`)}>
                      <td className="td-primary">{bt.strategyName || "SMA Crossover"}</td>
                      <td>{bt.ticker || "—"}</td>
                      <td>
                        {bt.returnPct !== undefined ? (
                          <span className={bt.returnPct >= 0 ? "text-green" : "text-red"}>
                            {bt.returnPct >= 0 ? "+" : ""}
                            {bt.returnPct.toFixed(2)}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{bt.winRate !== undefined ? `${bt.winRate}%` : "—"}</td>
                      <td>{bt.numTrades ?? "—"}</td>
                      <td>{formatDate(bt.createdAt)}</td>
                      <td>
                        <span className="small-action-btn btn-accent">View →</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Account info card */}
        <div className="info-card">
          <h2>Account Details</h2>
          <div className="info-row">
            <span className="info-label">Email</span>
            <span className="info-value">{userProfile?.email || currentUser?.email}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Display Name</span>
            <span className="info-value">
              {userProfile?.displayName || <span className="text-muted">Not set</span>}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">User ID</span>
            <span className="info-value mono">{currentUser?.uid}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Role</span>
            <span className="info-value">
              <span className="plan-badge">
                {(userProfile?.role || "free").toUpperCase()}
              </span>
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Currency</span>
            <span className="info-value">
              {userProfile?.preferences?.currency || "USD"}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Last Login</span>
            <span className="info-value">
              {userProfile?.lastLoginAt ? formatDate(userProfile.lastLoginAt) : "—"}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">Status</span>
            <span className="info-value">
              <span className="status-badge">Active</span>
            </span>
          </div>
        </div>

        {/* Coming soon */}
        <div className="coming-soon-card">
          <h2>🚀 Coming in Phase 5</h2>
          <ul>
            <li>Live market data from real APIs</li>
            <li>Advanced metrics &amp; equity charts</li>
            <li>Portfolio tracking &amp; performance reports</li>
            <li>Strategy comparison tools</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
