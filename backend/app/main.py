"""
tradingGo — FastAPI Backend
----------------------------
Handles all trading logic: backtesting, strategies, and market data.
Firebase is NOT used here — that stays in the frontend for auth + Firestore.

Phase 10 additions:
  - Structured logging (stdlib)
  - Sentry error tracking (optional, controlled by SENTRY_DSN env var)
  - SlowAPI rate limiting on /api/run-backtest
  - Global exception handler (consistent JSON errors)
  - Enhanced /health endpoint
"""

import time
import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.data_provider import fetch_historical_data, validate_data_for_strategy, get_popular_tickers
from app.strategy import sma_crossover_backtest
from app.config import settings
from app.validation import validate_strategy_params
from app.backtest_service import execute_backtest_service
from app.logger import get_logger

# ─── Logging ──────────────────────────────────────────────────────────────────

logger = get_logger("tradinggo.main")

# ─── Sentry (optional) ────────────────────────────────────────────────────────

if settings.sentry_dsn:
    import sentry_sdk
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=0.2,   # 20% of transactions traced
        send_default_pii=False,
    )
    logger.info(f"Sentry initialised — environment={settings.environment}")
else:
    logger.info("Sentry disabled (SENTRY_DSN not set)")

# ─── Rate Limiter ─────────────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address, default_limits=[])

# ─── App Setup ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="tradingGo API",
    description="Backend for tradingGo — handles trading data, strategies, and backtesting.",
    version="0.6.0",
)

# Attach rate limiter state and its built-in 429 handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # Temporary: restrict to frontend URL after deploy
    allow_credentials=False,    # Must be False when allow_origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Request Logging Middleware ───────────────────────────────────────────────

@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log every incoming request and its response time."""
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    logger.info(
        f"{request.method} {request.url.path} → {response.status_code} "
        f"({duration_ms:.1f}ms) | client={request.client.host if request.client else 'unknown'}"
    )
    return response


# ─── Global Exception Handler ─────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all: return a consistent JSON error and log the traceback."""
    logger.exception(f"Unhandled error on {request.method} {request.url.path}: {exc}")
    if settings.sentry_dsn:
        import sentry_sdk
        sentry_sdk.capture_exception(exc)
    return JSONResponse(
        status_code=500,
        content={"error": "internal_server_error", "detail": "An unexpected error occurred."},
    )


# ─── Request / Response Models ────────────────────────────────────────────────

class BacktestRequest(BaseModel):
    """Request body for /api/run-backtest"""
    ticker: str = Field(..., description="Stock ticker symbol (e.g., AAPL)")
    strategy: str = Field(
        default="sma_crossover",
        description="Strategy to run",
    )
    # Legacy fields (for backwards compatibility with older frontend requests)
    short_window: Optional[int] = Field(default=None, description="Short SMA period")
    long_window: Optional[int] = Field(default=None, description="Long SMA period")

    # New dynamic params field
    params: dict = Field(default_factory=dict, description="Dynamic wrapper for params")

    initial_capital: float = Field(
        default=10000.0, ge=100, le=1_000_000, description="Starting capital"
    )
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class BacktestMetrics(BaseModel):
    initial_capital: float
    final_equity: float
    total_return_pct: float
    cagr_pct: float
    num_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    max_drawdown_pct: float
    avg_win: float
    avg_loss: float
    sharpe_ratio: float
    sortino_ratio: float
    calmar_ratio: float
    profit_factor: float


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
    from_cache: bool = Field(default=False, description="Whether metrics were loaded from cache.")
    ticker: str
    strategy: str
    params: dict
    start_date: str
    end_date: str
    data_points: int
    metrics: BacktestMetrics
    trades: list[TradeDetail]
    equity_curve: list[dict]
    drawdown_curve: list[dict]


# ─── Strategy Map ─────────────────────────────────────────────────────────────

from app.strategy import (
    sma_crossover_backtest,
    ema_crossover_backtest,
    rsi_backtest,
    macd_crossover_backtest,
    bollinger_bands_backtest,
)

STRATEGY_MAP = {
    "sma_crossover": sma_crossover_backtest,
    "ema_crossover": ema_crossover_backtest,
    "rsi": rsi_backtest,
    "macd": macd_crossover_backtest,
    "bollinger": bollinger_bands_backtest,
}


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "tradingGo API v0.6 — visit /docs for Swagger UI"}


@app.get("/health")
def health_check():
    """Liveness probe — used by Render and load balancers."""
    return {"status": "ok", "environment": settings.environment}


@app.get("/api/health")
def health():
    """Rich health check — shows service info and available strategies."""
    return {
        "status": "healthy",
        "service": "tradingGo-api",
        "version": "0.6.0",
        "environment": settings.environment,
        "available_strategies": list(STRATEGY_MAP.keys()),
    }


@app.get("/api/tickers")
def list_tickers():
    return {"tickers": get_popular_tickers()}


@app.post("/api/run-backtest", response_model=BacktestResponse)
@limiter.limit("30/minute")         # max 30 backtests per IP per minute
def run_backtest(request: BacktestRequest, http_request: Request):
    start_time = time.perf_counter()

    # Assemble effective params
    effective_params = request.params.copy()

    # Backwards compatibility: inject legacy top-level fields into params
    if request.short_window is not None:
        effective_params["short_window"] = request.short_window
    if request.long_window is not None:
        effective_params["long_window"] = request.long_window

    if request.strategy not in STRATEGY_MAP:
        logger.warning(f"Unknown strategy requested: '{request.strategy}'")
        raise HTTPException(
            status_code=400,
            detail=f"Unknown strategy '{request.strategy}'. Available: {list(STRATEGY_MAP.keys())}",
        )

    validate_strategy_params(request.strategy, effective_params)

    # Calculate required data length
    if request.strategy in ["sma_crossover", "ema_crossover"]:
        data_required = effective_params.get("long_window", 30)
    elif request.strategy == "rsi":
        data_required = effective_params.get("rsi_period", 14) + 1
    elif request.strategy == "macd":
        data_required = max(
            effective_params.get("fast_period", 12),
            effective_params.get("slow_period", 26),
        ) + effective_params.get("signal_period", 9)
    elif request.strategy == "bollinger":
        data_required = effective_params.get("window", 20)
    else:
        data_required = 30

    try:
        price_data = fetch_historical_data(
            ticker=request.ticker,
            start_date=request.start_date,
            end_date=request.end_date,
        )
    except ValueError as e:
        logger.warning(f"Data fetch failed for {request.ticker}: {e}")
        raise HTTPException(status_code=400, detail=str(e))

    try:
        validate_data_for_strategy(price_data, data_required)
    except ValueError as e:
        logger.warning(f"Data validation failed for {request.ticker}: {e}")
        raise HTTPException(status_code=400, detail=str(e))

    # Execute backtest
    strategy_func = STRATEGY_MAP[request.strategy]
    result = execute_backtest_service(
        ticker=request.ticker,
        strategy=request.strategy,
        params=effective_params,
        start_date=request.start_date,
        end_date=request.end_date,
        initial_capital=request.initial_capital,
        run_func=strategy_func,
        price_data=price_data,
    )

    elapsed_ms = (time.perf_counter() - start_time) * 1000
    logger.info(
        f"Backtest complete | ticker={request.ticker.upper()} "
        f"strategy={request.strategy} trades={result['metrics']['num_trades']} "
        f"return={result['metrics']['total_return_pct']:.2f}% "
        f"from_cache={result.get('from_cache', False)} elapsed={elapsed_ms:.1f}ms"
    )

    actual_start = price_data[0]["date"]
    actual_end = price_data[-1]["date"]

    return BacktestResponse(
        success=True,
        from_cache=result.get("from_cache", False),
        ticker=request.ticker.upper(),
        strategy=request.strategy,
        params=effective_params,
        start_date=actual_start,
        end_date=actual_end,
        data_points=len(price_data),
        metrics=BacktestMetrics(**result["metrics"]),
        trades=[TradeDetail(**t) for t in result["trades"]],
        equity_curve=result["equity_curve"],
        drawdown_curve=result["drawdown_curve"],
    )
