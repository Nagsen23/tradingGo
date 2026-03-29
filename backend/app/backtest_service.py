import hashlib
import json
from cachetools import TTLCache
from app.config import settings

# In-memory service-layer cache for entire result outputs
result_cache = TTLCache(maxsize=1000, ttl=settings.cache_ttl_seconds)

def generate_cache_key(ticker: str, strategy: str, params: dict, start_date: str | None, end_date: str | None, initial_capital: float) -> str:
    """Creates a deterministic hash key for any identical strategy payload."""
    sorted_params = dict(sorted(params.items()))
    key_dict = {
        "ticker": ticker.upper(),
        "strategy": strategy,
        "params": sorted_params,
        "start_date": start_date or "DEFAULT_START",
        "end_date": end_date or "DEFAULT_END",
        "initial_capital": float(initial_capital)
    }
    key_str = json.dumps(key_dict, sort_keys=True)
    return hashlib.md5(key_str.encode('utf-8')).hexdigest()

def execute_backtest_service(ticker: str, strategy: str, params: dict, start_date: str | None, end_date: str | None, initial_capital: float, run_func, price_data: list[dict]) -> dict:
    """
    Orchestrates execution, pulling from the global LRU/TTL cache unconditionally 
    to instantly resolve matching payload requests from multidimensional UI blocks.
    """
    cache_key = generate_cache_key(ticker, strategy, params, start_date, end_date, initial_capital)
    
    if cache_key in result_cache:
        # Return shallow copy to safely inject dynamic flags
        cached_result = result_cache[cache_key].copy()
        cached_result["from_cache"] = True
        return cached_result
        
    # Execute Numba / TA-Lib strategy
    result = run_func(price_data=price_data, params=params, initial_capital=initial_capital)
    
    # Store pristine output
    result_cache[cache_key] = result
    
    out = result.copy()
    out["from_cache"] = False
    return out
