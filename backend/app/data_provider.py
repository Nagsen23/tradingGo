"""
data_provider.py
-----------------
Fetch real historical stock market data using yfinance.
Falls back to the mock sample_data module if yfinance fails.

This module is the ONLY place in the backend that talks to external APIs.
Strategy logic never fetches data directly — it only receives price lists.
"""

from cachetools import cached, TTLCache
from app.config import settings
from app.providers.yfinance_provider import YFinanceProvider

# Factory / Provider initialization
provider = YFinanceProvider()

@cached(cache=TTLCache(maxsize=100, ttl=settings.cache_ttl_seconds))
def fetch_historical_data(
    ticker: str,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[dict]:
    return provider.fetch_historical_data(ticker, start_date, end_date)



def validate_data_for_strategy(
    price_data: list[dict],
    long_window: int,
) -> None:
    """
    Validate that there's enough price data to run the strategy.

    Raises:
        ValueError: If not enough data points for the given SMA window.
    """
    required = long_window + 5  # Need some extra rows after SMA kicks in
    if len(price_data) < required:
        raise ValueError(
            f"Not enough data: got {len(price_data)} rows but need at least "
            f"{required} for a {long_window}-day SMA. Try a wider date range."
        )


# ── Popular tickers for the frontend dropdown ──────────────────────────────

POPULAR_TICKERS = [
    {"symbol": "AAPL", "name": "Apple Inc."},
    {"symbol": "GOOGL", "name": "Alphabet Inc."},
    {"symbol": "MSFT", "name": "Microsoft Corp."},
    {"symbol": "AMZN", "name": "Amazon.com Inc."},
    {"symbol": "TSLA", "name": "Tesla Inc."},
    {"symbol": "META", "name": "Meta Platforms Inc."},
    {"symbol": "NVDA", "name": "NVIDIA Corp."},
    {"symbol": "NFLX", "name": "Netflix Inc."},
    {"symbol": "JPM", "name": "JPMorgan Chase"},
    {"symbol": "V", "name": "Visa Inc."},
]


def get_popular_tickers() -> list[dict]:
    """Return the list of popular/suggested tickers."""
    return POPULAR_TICKERS
