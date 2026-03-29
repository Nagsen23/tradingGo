from fastapi import HTTPException

def validate_strategy_params(strategy: str, params: dict):
    if strategy in ["sma_crossover", "ema_crossover"]:
        short_w = params.get("short_window", 10)
        long_w = params.get("long_window", 30)
        if short_w <= 0 or long_w <= 0:
            raise HTTPException(status_code=400, detail="Windows must be greater than 0.")
        if short_w >= long_w:
            raise HTTPException(status_code=400, detail=f"Short window ({short_w}) must be less than long window ({long_w}).")
            
    elif strategy == "rsi":
        period = params.get("rsi_period", 14)
        oversold = params.get("oversold_threshold", params.get("oversold", 30))
        overbought = params.get("overbought_threshold", params.get("overbought", 70))
        if period <= 0:
            raise HTTPException(status_code=400, detail="RSI period must be greater than 0.")
        if oversold >= overbought:
            raise HTTPException(status_code=400, detail="Oversold threshold must be strictly below overbought threshold.")
            
    elif strategy == "macd":
        fast = params.get("fast_period", 12)
        slow = params.get("slow_period", 26)
        signal = params.get("signal_period", 9)
        if fast <= 0 or slow <= 0 or signal <= 0:
            raise HTTPException(status_code=400, detail="MACD periods must be positive.")
        if fast >= slow:
            raise HTTPException(status_code=400, detail="MACD fast period must be less than slow period.")
            
    elif strategy == "bollinger":
        window = params.get("window", 20)
        std = params.get("num_std_dev", 2.0)
        if window <= 0:
            raise HTTPException(status_code=400, detail="Bollinger window must be positive.")
        if std <= 0:
            raise HTTPException(status_code=400, detail="Standard deviation must be positive.")
