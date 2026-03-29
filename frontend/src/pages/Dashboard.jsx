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
import { formatTickerDisplay } from "../utils/formatters";

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
  const [btCustomTicker, setBtCustomTicker] = useState("");
  const [btType, setBtType] = useState("sma_crossover");
  const [btParams, setBtParams] = useState({
    short_window: 10,
    long_window: 30,
    rsi_period: 14,
    oversold: 30,
    overbought: 70,
    fast_period: 12,
    slow_period: 26,
    signal_period: 9,
    window: 20,
    num_std_dev: 2.0
  });
  const [btCapital, setBtCapital] = useState(10000);
  const [btStartDate, setBtStartDate] = useState(
    new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [btEndDate, setBtEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [btRunning, setBtRunning] = useState(false);
  const [btResult, setBtResult] = useState(null);
  const [btError, setBtError] = useState("");
  const [btSaved, setBtSaved] = useState(false);
  const [btSourceStrategy, setBtSourceStrategy] = useState(null);

  // Market selection
  const [btMarket, setBtMarket] = useState("US");

  // Available tickers
  const US_TICKERS = [
    { symbol: "AAPL", name: "Apple Inc." },
    { symbol: "GOOGL", name: "Alphabet Inc." },
    { symbol: "MSFT", name: "Microsoft Corp." },
    { symbol: "AMZN", name: "Amazon.com Inc." },
    { symbol: "TSLA", name: "Tesla Inc." },
    { symbol: "META", name: "Meta Platforms Inc." },
    { symbol: "NVDA", name: "NVIDIA Corp." },
    { symbol: "NFLX", name: "Netflix Inc." },
    { symbol: "JPM", name: "JPMorgan Chase" },
    { symbol: "V", name: "Visa Inc." },
  ];

  const IN_TICKERS = [
    { symbol: "RELIANCE", name: "Reliance Industries" },
    { symbol: "TCS", name: "Tata Consultancy Services" },
    { symbol: "INFY", name: "Infosys" },
    { symbol: "HDFCBANK", name: "HDFC Bank" },
    { symbol: "ICICIBANK", name: "ICICI Bank" },
    { symbol: "SBIN", name: "State Bank of India" },
    { symbol: "LT", name: "Larsen & Toubro" },
    { symbol: "ITC", name: "ITC Limited" },
    { symbol: "HINDUNILVR", name: "Hindustan Unilever" },
    { symbol: "BHARTIARTL", name: "Bharti Airtel" },
  ];

  // Derive active tickers based on market
  const tickers = btMarket === "US" ? US_TICKERS : IN_TICKERS;

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
          setBackendOnline(true);
          // Fetch suggested tickers
          try {
            const tickerRes = await fetch(`${API_BASE}/api/tickers`);
            if (tickerRes.ok) {
              const tickerData = await tickerRes.json();
              if (tickerData.tickers) setTickers(tickerData.tickers);
            }
          } catch { /* keep defaults */ }
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

    let effectiveTicker = btCustomTicker.trim() || btTicker.trim();

    if (!effectiveTicker) {
      setBtError("Please select or enter a valid ticker.");
      setBtRunning(false);
      return;
    }

    // Append .NS if India is selected and not already appended
    if (btMarket === "IN" && !effectiveTicker.toUpperCase().endsWith(".NS")) {
      effectiveTicker = `${effectiveTicker}.NS`;
    }

    try {
      const res = await fetch(`${API_BASE}/api/run-backtest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: effectiveTicker,
          strategy: btType,
          params: btParams,
          initial_capital: btCapital,
          start_date: btStartDate || null,
          end_date: btEndDate || null,
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
          params: btParams,
          start_date: data.start_date,
          end_date: data.end_date,
          data_points: data.data_points,
          strategyName: btSourceStrategy?.name || data.strategy,
          strategyType: data.strategy,
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
    setBtType(strategy.type || "sma_crossover");
    const newParams = { ...btParams };
    if (strategy.params) {
      Object.assign(newParams, strategy.params);
    } else if (strategy.shortWindow && strategy.longWindow) { // Legacy
      newParams.short_window = strategy.shortWindow;
      newParams.long_window = strategy.longWindow;
    }
    setBtParams(newParams);
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
            onClick={() => navigate("/compare")}
            className="nav-link-btn"
          >
            ⚖️ Compare
          </button>
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
                    <th>Type</th>
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
                      <td>{formatTickerDisplay(s.ticker)}</td>
                      <td>{s.type || "sma_crossover"}</td>
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
            <div className="bt-form-grid bt-form-grid-6">
              
              <div className="form-group">
                <label htmlFor="bt-market">Market</label>
                <select
                  id="bt-market"
                  value={btMarket}
                  onChange={(e) => { 
                    setBtMarket(e.target.value); 
                    setBtCustomTicker(""); 
                    setBtTicker(e.target.value === "IN" ? "RELIANCE" : "AAPL");
                  }}
                >
                  <option value="US">US</option>
                  <option value="IN">India</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="bt-ticker">Ticker</label>
                <select
                  id="bt-ticker"
                  value={btTicker}
                  onChange={(e) => { setBtTicker(e.target.value); setBtCustomTicker(""); setBtSourceStrategy(null); }}
                >
                  {tickers.map((t) => (
                    <option key={t.symbol} value={t.symbol}>
                      {t.symbol} — {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="bt-custom-ticker">Or Custom</label>
                <input
                  id="bt-custom-ticker"
                  type="text"
                  placeholder={btMarket === "IN" ? "e.g. TATAMOTORS" : "e.g. AMD"}
                  value={btCustomTicker}
                  onChange={(e) => { setBtCustomTicker(e.target.value.toUpperCase()); setBtSourceStrategy(null); }}
                  maxLength={15}
                />
              </div>

              <div className="form-group">
                <label htmlFor="bt-start">Start Date</label>
                <input
                  id="bt-start"
                  type="date"
                  value={btStartDate}
                  onChange={(e) => { setBtStartDate(e.target.value); setBtSourceStrategy(null); }}
                />
              </div>

              <div className="form-group">
                <label htmlFor="bt-end">End Date</label>
                <input
                  id="bt-end"
                  type="date"
                  value={btEndDate}
                  onChange={(e) => { setBtEndDate(e.target.value); setBtSourceStrategy(null); }}
                />
              </div>

              <div className="form-group">
                <label htmlFor="bt-type">Strategy</label>
                <select
                  id="bt-type"
                  value={btType}
                  onChange={(e) => { setBtType(e.target.value); setBtSourceStrategy(null); }}
                >
                  <option value="sma_crossover">SMA Crossover</option>
                  <option value="ema_crossover">EMA Crossover</option>
                  <option value="rsi">RSI Mean Reversion</option>
                  <option value="macd">MACD Crossover</option>
                  <option value="bollinger">Bollinger Bands</option>
                </select>
              </div>

              {/* Dynamic Strategy Params */}
              {(btType === "sma_crossover" || btType === "ema_crossover") && (
                <>
                  <div className="form-group">
                    <label>Short Window</label>
                    <input type="number" min="2" max="100" value={btParams.short_window} 
                           onChange={(e) => setBtParams({...btParams, short_window: Number(e.target.value)})} />
                  </div>
                  <div className="form-group">
                    <label>Long Window</label>
                    <input type="number" min="5" max="250" value={btParams.long_window} 
                           onChange={(e) => setBtParams({...btParams, long_window: Number(e.target.value)})} />
                  </div>
                </>
              )}
              {btType === "rsi" && (
                <>
                  <div className="form-group">
                    <label>RSI Period</label>
                    <input type="number" min="2" max="50" value={btParams.rsi_period} 
                           onChange={(e) => setBtParams({...btParams, rsi_period: Number(e.target.value)})} />
                  </div>
                  <div className="form-group">
                    <label>Oversold</label>
                    <input type="number" min="10" max="49" value={btParams.oversold} 
                           onChange={(e) => setBtParams({...btParams, oversold: Number(e.target.value)})} />
                  </div>
                  <div className="form-group">
                    <label>Overbought</label>
                    <input type="number" min="50" max="90" value={btParams.overbought} 
                           onChange={(e) => setBtParams({...btParams, overbought: Number(e.target.value)})} />
                  </div>
                </>
              )}
              {btType === "macd" && (
                <>
                  <div className="form-group">
                    <label>Fast Period</label>
                    <input type="number" min="2" max="50" value={btParams.fast_period} 
                           onChange={(e) => setBtParams({...btParams, fast_period: Number(e.target.value)})} />
                  </div>
                  <div className="form-group">
                    <label>Slow Period</label>
                    <input type="number" min="5" max="100" value={btParams.slow_period} 
                           onChange={(e) => setBtParams({...btParams, slow_period: Number(e.target.value)})} />
                  </div>
                  <div className="form-group">
                    <label>Signal Period</label>
                    <input type="number" min="2" max="50" value={btParams.signal_period} 
                           onChange={(e) => setBtParams({...btParams, signal_period: Number(e.target.value)})} />
                  </div>
                </>
              )}
              {btType === "bollinger" && (
                <>
                  <div className="form-group">
                    <label>Window</label>
                    <input type="number" min="5" max="100" value={btParams.window} 
                           onChange={(e) => setBtParams({...btParams, window: Number(e.target.value)})} />
                  </div>
                  <div className="form-group">
                    <label>Std Dev</label>
                    <input type="number" step="0.1" min="0.5" max="4.0" value={btParams.num_std_dev} 
                           onChange={(e) => setBtParams({...btParams, num_std_dev: Number(e.target.value)})} />
                  </div>
                </>
              )}

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
                  Results — {formatTickerDisplay(btResult.ticker)}{" "}
                  <span className="text-muted" style={{ fontWeight: 400, fontSize: "0.85rem" }}>
                    {btResult.strategy} • {btResult.start_date} → {btResult.end_date} • {btResult.data_points} days
                  </span>
                  {btSourceStrategy && (
                    <span className="bt-source-tag">via "{btSourceStrategy.name}"</span>
                  )}
                </h3>
                {btSaved && (
                  <span className="bt-saved-badge">✓ Saved to Firestore</span>
                )}
                {btResult.from_cache && (
                  <span className="bt-source-tag" style={{ marginLeft: "8px", background: "rgba(16, 185, 129, 0.2)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                    ⚡ Loaded from Cache
                  </span>
                )}
              </div>

              <div className="bt-data-source">
                📡 Real market data from Yahoo Finance
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
                  <span className="bt-metric-label">Sharpe Ratio</span>
                  <span className={`bt-metric-value ${btResult.metrics.sharpe_ratio >= 1 ? "text-green" : btResult.metrics.sharpe_ratio >= 0 ? "text-muted" : "text-red"}`}>
                    {btResult.metrics.sharpe_ratio.toFixed(2)}
                  </span>
                </div>
                <div className="bt-metric">
                  <span className="bt-metric-label">Profit Factor</span>
                  <span className={`bt-metric-value ${btResult.metrics.profit_factor >= 1 ? "text-green" : "text-red"}`}>
                    {btResult.metrics.profit_factor >= 999 ? "∞" : btResult.metrics.profit_factor.toFixed(2)}
                  </span>
                </div>
                <div className="bt-metric">
                  <span className="bt-metric-label">Avg Win</span>
                  <span className="bt-metric-value text-green">
                    ${btResult.metrics.avg_win.toFixed(2)}
                  </span>
                </div>
                <div className="bt-metric">
                  <span className="bt-metric-label">CAGR</span>
                  <span className={`bt-metric-value ${btResult.metrics.cagr_pct >= 0 ? "text-green" : "text-red"}`}>
                    {btResult.metrics.cagr_pct >= 0 ? "+" : ""}{btResult.metrics.cagr_pct.toFixed(2)}%
                  </span>
                </div>
                <div className="bt-metric">
                  <span className="bt-metric-label">Sortino Ratio</span>
                  <span className={`bt-metric-value ${btResult.metrics.sortino_ratio >= 1 ? "text-green" : btResult.metrics.sortino_ratio >= 0 ? "text-muted" : "text-red"}`}>
                    {btResult.metrics.sortino_ratio.toFixed(2)}
                  </span>
                </div>
                <div className="bt-metric">
                  <span className="bt-metric-label">Calmar Ratio</span>
                  <span className={`bt-metric-value ${btResult.metrics.calmar_ratio >= 1 ? "text-green" : btResult.metrics.calmar_ratio >= 0 ? "text-muted" : "text-red"}`}>
                    {btResult.metrics.calmar_ratio.toFixed(2)}
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
                      <td>{formatTickerDisplay(bt.ticker)}</td>
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
