"""
tradingGo — FastAPI Backend
----------------------------
Handles all trading logic: backtesting, strategies, and market data.
Firebase is NOT used here — that stays in the frontend for auth + Firestore.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional

from app.data_provider import fetch_historical_data, validate_data_for_strategy, get_popular_tickers
from app.strategy import sma_crossover_backtest
from app.config import settings
from app.validation import validate_strategy_params
from app.backtest_service import execute_backtest_service

# ─── App Setup ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="tradingGo API",
    description="Backend for tradingGo — handles trading data, strategies, and backtesting.",
    version="0.5.0",
)


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
    from_cache: bool = Field(default=False, description="Whether metrics were loaded redundantly from mem.")
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


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "tradingGo API v0.4 — visit /docs for Swagger UI"}


@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "service": "tradingGo-api",
        "version": "0.4.0",
        "available_strategies": [
            "sma_crossover", 
            "ema_crossover", 
            "rsi", 
            "macd", 
            "bollinger"
        ],
    }


@app.get("/api/tickers")
def list_tickers():
    return {"tickers": get_popular_tickers()}


# Map strategy strings to their functions in strategy.py
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

@app.post("/api/run-backtest", response_model=BacktestResponse)
def run_backtest(request: BacktestRequest):
    # Assemble effective params
    effective_params = request.params.copy()
    
    # Backwards compatibility injection for SMA logic passing `short_window` outside params
    if request.short_window is not None:
        effective_params["short_window"] = request.short_window
    if request.long_window is not None:
        effective_params["long_window"] = request.long_window

    if request.strategy not in STRATEGY_MAP:
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
        data_required = max(effective_params.get("fast_period", 12), effective_params.get("slow_period", 26)) + effective_params.get("signal_period", 9)
    elif request.strategy == "bollinger":
        data_required = effective_params.get("window", 20)

    try:
        price_data = fetch_historical_data(
            ticker=request.ticker,
            start_date=request.start_date,
            end_date=request.end_date,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        validate_data_for_strategy(price_data, data_required)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Run backtest securely via orchestrated service memory
    strategy_func = STRATEGY_MAP[request.strategy]
    result = execute_backtest_service(
        ticker=request.ticker,
        strategy=request.strategy,
        params=effective_params,
        start_date=request.start_date,
        end_date=request.end_date,
        initial_capital=request.initial_capital,
        run_func=strategy_func,
        price_data=price_data
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
