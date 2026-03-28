"""
sample_data.py
--------------
Mock stock price data for backtesting.
Uses realistic-looking daily OHLCV data so strategy results make sense.
No external APIs needed — everything is self-contained.
"""

import math
import random

# Seed for reproducibility — same data every time
random.seed(42)


def _generate_price_series(
    ticker: str,
    start_price: float,
    days: int = 200,
    volatility: float = 0.02,
    trend: float = 0.0003,
) -> list[dict]:
    """
    Generate a synthetic daily OHLCV price series.

    Args:
        ticker:      Stock symbol label.
        start_price: Opening price on day 1.
        days:        Number of trading days to generate.
        volatility:  Daily standard deviation of returns.
        trend:       Daily drift (positive = uptrend).

    Returns:
        List of dicts with keys: date, open, high, low, close, volume.
    """
    prices = []
    price = start_price

    for day in range(days):
        # Simulate daily return with drift + noise
        daily_return = trend + random.gauss(0, volatility)
        open_price = round(price, 2)
        close_price = round(price * (1 + daily_return), 2)

        # High and low within the day
        intraday_range = abs(close_price - open_price) + round(random.uniform(0.5, 2.0), 2)
        high_price = round(max(open_price, close_price) + intraday_range * 0.5, 2)
        low_price = round(min(open_price, close_price) - intraday_range * 0.5, 2)
        low_price = max(low_price, 1.0)  # Floor at $1

        volume = random.randint(500_000, 5_000_000)

        # Date as string (YYYY-MM-DD format, starting from 2025-01-02)
        month = 1 + (day // 30) % 12
        day_of_month = 1 + (day % 28)
        year = 2025 + (day // 360)
        date_str = f"{year}-{month:02d}-{day_of_month:02d}"

        prices.append(
            {
                "date": date_str,
                "open": open_price,
                "high": high_price,
                "low": low_price,
                "close": close_price,
                "volume": volume,
            }
        )

        price = close_price

    return prices


# Pre-generated datasets for different tickers
SAMPLE_DATA: dict[str, list[dict]] = {
    "AAPL": _generate_price_series("AAPL", start_price=175.0, days=200, volatility=0.018, trend=0.0004),
    "GOOGL": _generate_price_series("GOOGL", start_price=140.0, days=200, volatility=0.022, trend=0.0003),
    "TSLA": _generate_price_series("TSLA", start_price=250.0, days=200, volatility=0.035, trend=0.0002),
    "MSFT": _generate_price_series("MSFT", start_price=370.0, days=200, volatility=0.015, trend=0.0005),
    "AMZN": _generate_price_series("AMZN", start_price=155.0, days=200, volatility=0.025, trend=0.0003),
}


def get_available_tickers() -> list[str]:
    """Return list of available ticker symbols."""
    return list(SAMPLE_DATA.keys())


def get_price_data(ticker: str) -> list[dict]:
    """
    Get price data for a ticker.
    Raises ValueError if ticker not found.
    """
    ticker = ticker.upper()
    if ticker not in SAMPLE_DATA:
        available = ", ".join(get_available_tickers())
        raise ValueError(f"Ticker '{ticker}' not found. Available: {available}")
    return SAMPLE_DATA[ticker]
