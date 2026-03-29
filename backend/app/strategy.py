"""
strategy.py
-----------
Trading strategy implementations for the tradingGo backtesting engine.
Each strategy takes price data and returns trade signals + performance metrics.

Currently implemented:
  - SMA Crossover (Simple Moving Average Crossover)
"""


def _compute_sma(prices: list[float], window: int) -> list[float | None]:
    """
    Compute Simple Moving Average.
    Returns a list the same length as `prices`, with None for indices
    where there isn't enough data to compute the average.
    """
    sma = []
    for i in range(len(prices)):
        if i < window - 1:
            sma.append(None)
        else:
            window_slice = prices[i - window + 1 : i + 1]
            sma.append(sum(window_slice) / window)
    return sma


def sma_crossover_backtest(
    price_data: list[dict],
    short_window: int = 10,
    long_window: int = 30,
    initial_capital: float = 10_000.0,
) -> dict:
    """
    Simple Moving Average Crossover Strategy.

    Rules:
      - BUY  when short SMA crosses ABOVE long SMA (golden cross).
      - SELL when short SMA crosses BELOW long SMA (death cross).

    Args:
        price_data:      List of OHLCV dicts (must have 'close' and 'date').
        short_window:    Short SMA period (default 10).
        long_window:     Long SMA period (default 30).
        initial_capital: Starting cash (default $10,000).

    Returns:
        Dict with: trades, metrics, equity_curve.
    """
    closes = [d["close"] for d in price_data]
    dates = [d["date"] for d in price_data]

    # Compute both SMAs
    sma_short = _compute_sma(closes, short_window)
    sma_long = _compute_sma(closes, long_window)

    # --- Run strategy ---
    trades = []
    position = None           # None = no position, dict = open trade
    capital = initial_capital
    shares = 0
    equity_curve = []

    for i in range(len(closes)):
        current_equity = capital + (shares * closes[i])
        equity_curve.append({"date": dates[i], "equity": round(current_equity, 2)})

        # Need both SMAs to be valid
        if sma_short[i] is None or sma_long[i] is None:
            continue

        # Also need previous values for crossover detection
        if i == 0 or sma_short[i - 1] is None or sma_long[i - 1] is None:
            continue

        prev_short_above = sma_short[i - 1] > sma_long[i - 1]
        curr_short_above = sma_short[i] > sma_long[i]

        # --- Golden Cross: BUY ---
        if not prev_short_above and curr_short_above and position is None:
            # Buy as many shares as we can afford
            shares = int(capital // closes[i])
            if shares > 0:
                cost = shares * closes[i]
                capital -= cost
                position = {
                    "entry_date": dates[i],
                    "entry_price": closes[i],
                    "shares": shares,
                }

        # --- Death Cross: SELL ---
        elif prev_short_above and not curr_short_above and position is not None:
            revenue = shares * closes[i]
            capital += revenue
            pnl = (closes[i] - position["entry_price"]) * shares
            pnl_pct = ((closes[i] / position["entry_price"]) - 1) * 100

            trades.append(
                {
                    "entry_date": position["entry_date"],
                    "exit_date": dates[i],
                    "entry_price": round(position["entry_price"], 2),
                    "exit_price": round(closes[i], 2),
                    "shares": shares,
                    "pnl": round(pnl, 2),
                    "pnl_pct": round(pnl_pct, 2),
                    "type": "long",
                }
            )
            shares = 0
            position = None

    # Close any open position at the last price
    if position is not None:
        last_price = closes[-1]
        revenue = shares * last_price
        capital += revenue
        pnl = (last_price - position["entry_price"]) * shares
        pnl_pct = ((last_price / position["entry_price"]) - 1) * 100

        trades.append(
            {
                "entry_date": position["entry_date"],
                "exit_date": dates[-1],
                "entry_price": round(position["entry_price"], 2),
                "exit_price": round(last_price, 2),
                "shares": shares,
                "pnl": round(pnl, 2),
                "pnl_pct": round(pnl_pct, 2),
                "type": "long (closed at end)",
            }
        )
        shares = 0
        position = None

    # --- Compute Metrics ---
    final_equity = capital
    total_return_pct = ((final_equity / initial_capital) - 1) * 100
    num_trades = len(trades)
    winning_trades = [t for t in trades if t["pnl"] > 0]
    losing_trades = [t for t in trades if t["pnl"] <= 0]
    win_rate = (len(winning_trades) / num_trades * 100) if num_trades > 0 else 0.0

    # Max drawdown + drawdown curve
    peak = initial_capital
    max_drawdown = 0.0
    drawdown_curve = []
    for point in equity_curve:
        if point["equity"] > peak:
            peak = point["equity"]
        drawdown = ((peak - point["equity"]) / peak) * 100
        if drawdown > max_drawdown:
            max_drawdown = drawdown
        drawdown_curve.append({
            "date": point["date"],
            "drawdown": round(drawdown, 2),
        })

    # Average win / loss
    avg_win = (
        sum(t["pnl"] for t in winning_trades) / len(winning_trades)
        if winning_trades
        else 0.0
    )
    avg_loss = (
        sum(t["pnl"] for t in losing_trades) / len(losing_trades)
        if losing_trades
        else 0.0
    )

    metrics = {
        "initial_capital": initial_capital,
        "final_equity": round(final_equity, 2),
        "total_return_pct": round(total_return_pct, 2),
        "num_trades": num_trades,
        "winning_trades": len(winning_trades),
        "losing_trades": len(losing_trades),
        "win_rate": round(win_rate, 2),
        "max_drawdown_pct": round(max_drawdown, 2),
        "avg_win": round(avg_win, 2),
        "avg_loss": round(avg_loss, 2),
    }

    return {
        "trades": trades,
        "metrics": metrics,
        "equity_curve": equity_curve,
        "drawdown_curve": drawdown_curve,
    }
