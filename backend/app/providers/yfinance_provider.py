from app.providers.base import DataProvider
import yfinance as yf
from datetime import datetime, timedelta

class YFinanceProvider(DataProvider):
    def fetch_historical_data(self, ticker: str, start_date: str | None = None, end_date: str | None = None) -> list[dict]:
        # Defaults
        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")
        if not start_date:
            start_date = (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")

        # Validate date format
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")
        except ValueError:
            raise ValueError("Dates must be in YYYY-MM-DD format.")

        if start_dt >= end_dt:
            raise ValueError("start_date must be before end_date.")

        if (end_dt - start_dt).days < 10:
            raise ValueError("Date range must be at least 10 days.")

        # Fetch from Yahoo Finance
        try:
            stock = yf.Ticker(ticker)
            df = stock.history(start=start_date, end=end_date)
        except Exception as e:
            raise ValueError(f"Failed to fetch data for '{ticker}': {str(e)}")

        if df is None or df.empty:
            raise ValueError(
                f"No data returned for ticker '{ticker}' in range "
                f"{start_date} to {end_date}. Check that the ticker is valid "
                f"and the date range contains trading days."
            )

        # Convert DataFrame to list of dicts
        price_data = []
        for idx, row in df.iterrows():
            price_data.append({
                "date": idx.strftime("%Y-%m-%d"),
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": int(row["Volume"]),
            })

        if len(price_data) < 5:
            raise ValueError(
                f"Only {len(price_data)} data points found for '{ticker}'. "
                f"Need at least 5 trading days."
            )

        return price_data
