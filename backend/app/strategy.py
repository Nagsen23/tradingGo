"""
strategy.py
------------
Handles individual trading strategy logic using python loop optimizations (now Numba).
"""

import math
import numpy as np
import talib
from app.engine_core import run_crossover, run_rsi, run_bbands
from app.metrics import calculate_metrics

# ─── Indicator Helpers ───────────────────────────────────────────────────────

def _compute_sma(prices: list[float], window: int) -> list[float | None]:
    arr = np.array(prices, dtype=float)
    res = talib.SMA(arr, timeperiod=window)
    return [None if np.isnan(x) else float(x) for x in res]

def _compute_ema(prices: list[float], window: int) -> list[float | None]:
    arr = np.array(prices, dtype=float)
    res = talib.EMA(arr, timeperiod=window)
    return [None if np.isnan(x) else float(x) for x in res]

def _compute_rsi(prices: list[float], period: int = 14) -> list[float | None]:
    arr = np.array(prices, dtype=float)
    res = talib.RSI(arr, timeperiod=period)
    return [None if np.isnan(x) else float(x) for x in res]

def _compute_macd(prices: list[float], fast: int = 12, slow: int = 26, signal: int = 9):
    arr = np.array(prices, dtype=float)
    macd, macdsignal, _ = talib.MACD(arr, fastperiod=fast, slowperiod=slow, signalperiod=signal)
    
    macd_res = [None if np.isnan(x) else float(x) for x in macd]
    sig_res = [None if np.isnan(x) else float(x) for x in macdsignal]
    return macd_res, sig_res

def _compute_bollinger(prices: list[float], window: int = 20, num_std: float = 2.0):
    arr = np.array(prices, dtype=float)
    upper, middle, lower = talib.BBANDS(arr, timeperiod=window, nbdevup=num_std, nbdevdn=num_std, matype=0)
    
    upp_res = [None if np.isnan(x) else float(x) for x in upper]
    low_res = [None if np.isnan(x) else float(x) for x in lower]
    return upp_res, low_res

# ─── Shared Logic ────────────────────────────────────────────────────────────

def format_trades_and_equity(trades_arr, equity_arr, dates, initial_capital):
    trades = []
    for row in trades_arr:
        entry_idx, exit_idx, ep, xp, tc, shares = row
        entry_idx = int(entry_idx)
        exit_idx = int(exit_idx)
        shares = int(shares)
        
        if shares == 0:
            continue
            
        pnl = (xp - ep) * shares
        pnl_pct = ((xp / ep) - 1) * 100
        trades.append({
             "entry_date": dates[entry_idx],
             "exit_date": dates[exit_idx],
             "entry_price": round(ep, 2),
             "exit_price": round(xp, 2),
             "shares": shares,
             "pnl": round(pnl, 2),
             "pnl_pct": round(pnl_pct, 2),
             "type": "long" if tc == 1.0 else "long (closed at end)"
        })
        
    equity_curve = [{"date": dates[i], "equity": round(equity_arr[i], 2)} for i in range(len(dates))]
    metrics, drawdown_curve = calculate_metrics(trades, equity_curve, initial_capital)
    
    return {"trades": trades, "metrics": metrics, "equity_curve": equity_curve, "drawdown_curve": drawdown_curve}

# ─── Strategies ──────────────────────────────────────────────────────────────

def sma_crossover_backtest(price_data: list[dict], params: dict, initial_capital: float = 10_000.0) -> dict:
    sw = params.get("short_window", 10)
    lw = params.get("long_window", 30)
    
    closes = np.array([d["close"] for d in price_data], dtype=np.float64)
    dates = [d["date"] for d in price_data]

    # Use native talib for fast math without mapping
    sma_short = talib.SMA(closes, timeperiod=sw)
    sma_long = talib.SMA(closes, timeperiod=lw)

    trades_arr, equity_arr = run_crossover(closes, sma_short, sma_long, initial_capital)
    return format_trades_and_equity(trades_arr, equity_arr, dates, initial_capital)

def ema_crossover_backtest(price_data: list[dict], params: dict, initial_capital: float = 10_000.0) -> dict:
    sw = params.get("short_window", 10)
    lw = params.get("long_window", 30)
    
    closes = np.array([d["close"] for d in price_data], dtype=np.float64)
    dates = [d["date"] for d in price_data]

    ema_short = talib.EMA(closes, timeperiod=sw)
    ema_long = talib.EMA(closes, timeperiod=lw)

    trades_arr, equity_arr = run_crossover(closes, ema_short, ema_long, initial_capital)
    return format_trades_and_equity(trades_arr, equity_arr, dates, initial_capital)

def rsi_backtest(price_data: list[dict], params: dict, initial_capital: float = 10_000.0) -> dict:
    period = params.get("rsi_period", 14)
    oversold = float(params.get("oversold_threshold", params.get("oversold", 30)))
    overbought = float(params.get("overbought_threshold", params.get("overbought", 70)))
    
    closes = np.array([d["close"] for d in price_data], dtype=np.float64)
    dates = [d["date"] for d in price_data]

    rsi_arr = talib.RSI(closes, timeperiod=period)

    trades_arr, equity_arr = run_rsi(closes, rsi_arr, oversold, overbought, initial_capital)
    return format_trades_and_equity(trades_arr, equity_arr, dates, initial_capital)

def macd_crossover_backtest(price_data: list[dict], params: dict, initial_capital: float = 10_000.0) -> dict:
    fast = params.get("fast_period", 12)
    slow = params.get("slow_period", 26)
    signal = params.get("signal_period", 9)
    
    closes = np.array([d["close"] for d in price_data], dtype=np.float64)
    dates = [d["date"] for d in price_data]

    macd_line, signal_line, _ = talib.MACD(closes, fastperiod=fast, slowperiod=slow, signalperiod=signal)

    trades_arr, equity_arr = run_crossover(closes, macd_line, signal_line, initial_capital)
    return format_trades_and_equity(trades_arr, equity_arr, dates, initial_capital)

def bollinger_bands_backtest(price_data: list[dict], params: dict, initial_capital: float = 10_000.0) -> dict:
    window = params.get("window", 20)
    num_std = float(params.get("num_std_dev", 2.0))
    
    closes = np.array([d["close"] for d in price_data], dtype=np.float64)
    dates = [d["date"] for d in price_data]

    upper, _, lower = talib.BBANDS(closes, timeperiod=window, nbdevup=num_std, nbdevdn=num_std, matype=0)

    trades_arr, equity_arr = run_bbands(closes, upper, lower, initial_capital)
    return format_trades_and_equity(trades_arr, equity_arr, dates, initial_capital)
