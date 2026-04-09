from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    data_provider: str = "yfinance"
    default_initial_capital: float = 10000.0
    cache_ttl_seconds: int = 300
    environment: str = "development"
    api_host: str = "127.0.0.1"
    api_port: int = 8000

    # Sentry DSN — leave empty to disable error tracking
    sentry_dsn: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
