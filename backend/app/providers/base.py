from abc import ABC, abstractmethod

class DataProvider(ABC):
    @abstractmethod
    def fetch_historical_data(self, ticker: str, start_date: str | None, end_date: str | None) -> list[dict]:
        pass
