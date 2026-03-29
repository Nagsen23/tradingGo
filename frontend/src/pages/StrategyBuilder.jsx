import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { saveStrategy } from "../services/firestoreService";

const TICKERS = [
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "GOOGL", name: "Alphabet Inc." },
  { symbol: "TSLA", name: "Tesla Inc." },
  { symbol: "MSFT", name: "Microsoft Corp." },
  { symbol: "AMZN", name: "Amazon.com Inc." },
];

export default function StrategyBuilder() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // Form state
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("AAPL");
  const [type] = useState("sma_crossover"); // only one type for now
  const [shortWindow, setShortWindow] = useState(10);
  const [longWindow, setLongWindow] = useState(30);
  const [initialCapital, setInitialCapital] = useState(10000);
  const [status, setStatus] = useState("draft");

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    // Validation
    if (!name.trim()) {
      setError("Strategy name is required.");
      return;
    }
    if (shortWindow >= longWindow) {
      setError("Short SMA must be less than Long SMA.");
      return;
    }

    setSaving(true);
    try {
      const docId = await saveStrategy(currentUser.uid, {
        name: name.trim(),
        ticker,
        type,
        shortWindow,
        longWindow,
        initialCapital,
        status,
      });
      setSuccess(`Strategy "${name.trim()}" saved! (ID: ${docId.slice(0, 8)}...)`);
      // Reset form
      setName("");
      setShortWindow(10);
      setLongWindow(30);
      setInitialCapital(10000);
      setStatus("draft");
    } catch (err) {
      setError(err.message || "Failed to save strategy.");
    }
    setSaving(false);
  }

  return (
    <div className="dashboard-page">
      {/* Navbar */}
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="10" fill="url(#nav-logo-sb)" />
            <path d="M10 28L16 18L22 22L30 12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="30" cy="12" r="3" fill="#fff"/>
            <defs>
              <linearGradient id="nav-logo-sb" x1="0" y1="0" x2="40" y2="40">
                <stop stopColor="#6366f1"/>
                <stop offset="1" stopColor="#8b5cf6"/>
              </linearGradient>
            </defs>
          </svg>
          <span>tradingGo</span>
        </div>

        <div className="nav-user">
          <button
            onClick={() => navigate("/dashboard")}
            className="nav-link-btn"
            id="back-to-dashboard"
          >
            ← Dashboard
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main className="dashboard-main">
        <div className="dashboard-welcome">
          <h1>
            <span className="gradient-text">Strategy Builder</span>
          </h1>
          <p className="welcome-subtitle">
            Create and save trading strategies to Firestore. Run backtests on them from the Dashboard.
          </p>
        </div>

        {/* Strategy Form */}
        <div className="strategy-builder-card">
          <div className="sb-section-header">
            <h2>📐 New Strategy</h2>
          </div>

          <form onSubmit={handleSave} className="sb-form">
            {/* Row 1: Name + Status */}
            <div className="sb-form-row">
              <div className="form-group sb-form-grow">
                <label htmlFor="sb-name">Strategy Name *</label>
                <input
                  id="sb-name"
                  type="text"
                  placeholder="e.g., Golden Cross AAPL"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                />
              </div>

              <div className="form-group">
                <label htmlFor="sb-status">Status</label>
                <select
                  id="sb-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                </select>
              </div>
            </div>

            {/* Row 2: Ticker + Type */}
            <div className="sb-form-row">
              <div className="form-group">
                <label htmlFor="sb-ticker">Ticker</label>
                <select
                  id="sb-ticker"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                >
                  {TICKERS.map((t) => (
                    <option key={t.symbol} value={t.symbol}>
                      {t.symbol} — {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="sb-type">Strategy Type</label>
                <select id="sb-type" value={type} disabled>
                  <option value="sma_crossover">SMA Crossover</option>
                </select>
              </div>
            </div>

            {/* Row 3: Parameters */}
            <div className="sb-params-header">
              <h3>Parameters</h3>
              <span className="sb-params-hint">Customize your SMA crossover settings</span>
            </div>

            <div className="sb-form-row sb-form-row-3">
              <div className="form-group">
                <label htmlFor="sb-short">Short SMA</label>
                <input
                  id="sb-short"
                  type="number"
                  min="2"
                  max="49"
                  value={shortWindow}
                  onChange={(e) => setShortWindow(Number(e.target.value))}
                />
                <span className="form-hint">Fast moving average</span>
              </div>

              <div className="form-group">
                <label htmlFor="sb-long">Long SMA</label>
                <input
                  id="sb-long"
                  type="number"
                  min="5"
                  max="100"
                  value={longWindow}
                  onChange={(e) => setLongWindow(Number(e.target.value))}
                />
                <span className="form-hint">Slow moving average</span>
              </div>

              <div className="form-group">
                <label htmlFor="sb-capital">Initial Capital ($)</label>
                <input
                  id="sb-capital"
                  type="number"
                  min="100"
                  max="1000000"
                  step="100"
                  value={initialCapital}
                  onChange={(e) => setInitialCapital(Number(e.target.value))}
                />
                <span className="form-hint">Starting investment</span>
              </div>
            </div>

            {/* Preview */}
            <div className="sb-preview">
              <h3>Strategy Preview</h3>
              <div className="sb-preview-grid">
                <div className="sb-preview-item">
                  <span className="sb-preview-label">Name</span>
                  <span className="sb-preview-value">{name || "—"}</span>
                </div>
                <div className="sb-preview-item">
                  <span className="sb-preview-label">Ticker</span>
                  <span className="sb-preview-value">{ticker}</span>
                </div>
                <div className="sb-preview-item">
                  <span className="sb-preview-label">Type</span>
                  <span className="sb-preview-value">SMA Crossover</span>
                </div>
                <div className="sb-preview-item">
                  <span className="sb-preview-label">SMA</span>
                  <span className="sb-preview-value">{shortWindow} / {longWindow}</span>
                </div>
                <div className="sb-preview-item">
                  <span className="sb-preview-label">Capital</span>
                  <span className="sb-preview-value">${initialCapital.toLocaleString()}</span>
                </div>
                <div className="sb-preview-item">
                  <span className="sb-preview-label">Status</span>
                  <span className={`table-badge ${status === "active" ? "badge-green" : "badge-muted"}`}>
                    {status}
                  </span>
                </div>
              </div>
            </div>

            {/* Error / Success */}
            {error && <div className="auth-error">{error}</div>}
            {success && <div className="sb-success">{success}</div>}

            {/* Actions */}
            <div className="sb-actions">
              <button
                type="submit"
                className="auth-btn sb-save-btn"
                disabled={saving}
              >
                {saving ? (
                  <>
                    <span className="btn-loader"></span>
                    <span style={{ marginLeft: "0.5rem" }}>Saving...</span>
                  </>
                ) : (
                  "💾 Save Strategy"
                )}
              </button>

              <button
                type="button"
                className="sb-secondary-btn"
                onClick={() => navigate("/dashboard")}
              >
                Back to Dashboard
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
