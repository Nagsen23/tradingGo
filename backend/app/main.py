"""
tradingGo — FastAPI Backend
----------------------------
Handles all trading logic: backtesting, strategies, and (later) market data.
Firebase is NOT used here — that stays in the frontend for auth + Firestore.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.sample_data import get_price_data, get_available_tickers
from app.strategy import sma_crossover_backtest

# ─── App Setup ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="tradingGo API",
    description="Backend for tradingGo — handles trading data, strategies, and backtesting.",
    version="0.2.0",
)

# Allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Request / Response Models ────────────────────────────────────────────────

class BacktestRequest(BaseModel):
    """Request body for /api/run-backtest"""
    ticker: str = Field(..., description="Stock ticker symbol (e.g., AAPL)")
    strategy: str = Field(
        default="sma_crossover",
        description="Strategy to use. Currently only 'sma_crossover'.",
    )
    short_window: int = Field(default=10, ge=2, le=50, description="Short SMA period")
    long_window: int = Field(default=30, ge=5, le=100, description="Long SMA period")
    initial_capital: float = Field(
        default=10000.0, ge=100, le=1_000_000, description="Starting capital in USD"
    )


class BacktestMetrics(BaseModel):
    initial_capital: float
    final_equity: float
    total_return_pct: float
    num_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    max_drawdown_pct: float
    avg_win: float
    avg_loss: float


class TradeDetail(BaseModel):
    entry_date: str
    exit_date: str
    entry_price: float
    exit_price: float
    shares: int
    pnl: float
    pnl_pct: float
    type: str


class BacktestResponse(BaseModel):
    """Response from /api/run-backtest"""
    success: bool
    ticker: str
    strategy: str
    metrics: BacktestMetrics
    trades: list[TradeDetail]
    equity_curve: list[dict]


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    """Root redirect hint."""
    return {"message": "tradingGo API — visit /docs for Swagger UI"}


@app.get("/api/health")
def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "tradingGo-api",
        "version": "0.2.0",
        "available_tickers": get_available_tickers(),
        "available_strategies": ["sma_crossover"],
    }


@app.get("/api/tickers")
def list_tickers():
    """Return available tickers for the frontend dropdown."""
    tickers = get_available_tickers()
    return {
        "tickers": [
            {"symbol": t, "name": _ticker_names.get(t, t)}
            for t in tickers
        ]
    }


@app.post("/api/run-backtest", response_model=BacktestResponse)
def run_backtest(request: BacktestRequest):
    """
    Run a backtest with the specified strategy and parameters.

    Currently supports:
      - sma_crossover: Simple Moving Average Crossover

    Returns metrics, individual trades, and equity curve.
    """
    # Validate ticker
    try:
        price_data = get_price_data(request.ticker)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Validate SMA windows
    if request.short_window >= request.long_window:
        raise HTTPException(
            status_code=400,
            detail=f"short_window ({request.short_window}) must be less than long_window ({request.long_window}).",
        )

    # Validate strategy
    if request.strategy != "sma_crossover":
        raise HTTPException(
            status_code=400,
            detail=f"Unknown strategy '{request.strategy}'. Available: sma_crossover",
        )

    # Run the backtest
    result = sma_crossover_backtest(
        price_data=price_data,
        short_window=request.short_window,
        long_window=request.long_window,
        initial_capital=request.initial_capital,
    )

    return BacktestResponse(
        success=True,
        ticker=request.ticker.upper(),
        strategy=request.strategy,
        metrics=BacktestMetrics(**result["metrics"]),
        trades=[TradeDetail(**t) for t in result["trades"]],
        equity_curve=result["equity_curve"],
    )


# ─── Ticker name mapping ────────────────────────────────────────────────────

_ticker_names = {
    "AAPL": "Apple Inc.",
    "GOOGL": "Alphabet Inc.",
    "TSLA": "Tesla Inc.",
    "MSFT": "Microsoft Corp.",
    "AMZN": "Amazon.com Inc.",
}
