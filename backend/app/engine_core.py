import numpy as np
import numba

@numba.jit(nopython=True)
def run_crossover(closes: np.ndarray, ind_fast: np.ndarray, ind_slow: np.ndarray, initial_capital: float):
    n = len(closes)
    equity = np.zeros(n, dtype=np.float64)
    # max trades allowed: one buy+sell every 2 days
    max_trades = n // 2 + 1
    trades = np.zeros((max_trades, 6), dtype=np.float64) 
    
    capital = initial_capital
    shares = 0
    trade_count = 0
    in_position = False
    
    entry_idx = -1
    entry_price = 0.0
    
    for i in range(n):
        if np.isnan(ind_fast[i]) or np.isnan(ind_slow[i]) or i == 0:
            equity[i] = capital + (shares * closes[i])
            continue
            
        if np.isnan(ind_fast[i-1]) or np.isnan(ind_slow[i-1]):
            equity[i] = capital + (shares * closes[i])
            continue
            
        prev_above = ind_fast[i-1] > ind_slow[i-1]
        curr_above = ind_fast[i] > ind_slow[i]
        
        # BUY
        if not prev_above and curr_above and not in_position:
            shares = int(capital // closes[i])
            if shares > 0:
                capital -= shares * closes[i]
                in_position = True
                entry_idx = i
                entry_price = closes[i]
                
        # SELL
        elif prev_above and not curr_above and in_position:
            capital += shares * closes[i]
            trades[trade_count, 0] = entry_idx
            trades[trade_count, 1] = i
            trades[trade_count, 2] = entry_price
            trades[trade_count, 3] = closes[i]
            trades[trade_count, 4] = 1.0
            trades[trade_count, 5] = shares
            trade_count += 1
            shares = 0
            in_position = False
            
        equity[i] = capital + (shares * closes[i])
        
    if in_position:
        capital += shares * closes[n-1]
        trades[trade_count, 0] = entry_idx
        trades[trade_count, 1] = n-1
        trades[trade_count, 2] = entry_price
        trades[trade_count, 3] = closes[n-1]
        trades[trade_count, 4] = 2.0
        trades[trade_count, 5] = shares
        trade_count += 1
        equity[n-1] = capital
        
    return trades[:trade_count], equity

@numba.jit(nopython=True)
def run_rsi(closes: np.ndarray, rsi: np.ndarray, oversold: float, overbought: float, initial_capital: float):
    n = len(closes)
    equity = np.zeros(n, dtype=np.float64)
    max_trades = n // 2 + 1
    trades = np.zeros((max_trades, 6), dtype=np.float64) 
    
    capital = initial_capital
    shares = 0
    trade_count = 0
    in_position = False
    
    entry_idx = -1
    entry_price = 0.0
    
    for i in range(n):
        if np.isnan(rsi[i]) or i == 0 or np.isnan(rsi[i-1]):
            equity[i] = capital + (shares * closes[i])
            continue
            
        # BUY: cross above oversold (mean reversion)
        if rsi[i-1] < oversold and rsi[i] >= oversold and not in_position:
            shares = int(capital // closes[i])
            if shares > 0:
                capital -= shares * closes[i]
                in_position = True
                entry_idx = i
                entry_price = closes[i]
                
        # SELL: cross below overbought
        elif rsi[i-1] > overbought and rsi[i] <= overbought and in_position:
            capital += shares * closes[i]
            trades[trade_count, 0] = entry_idx
            trades[trade_count, 1] = i
            trades[trade_count, 2] = entry_price
            trades[trade_count, 3] = closes[i]
            trades[trade_count, 4] = 1.0
            trades[trade_count, 5] = shares
            trade_count += 1
            shares = 0
            in_position = False
            
        equity[i] = capital + (shares * closes[i])
        
    if in_position:
        capital += shares * closes[n-1]
        trades[trade_count, 0] = entry_idx
        trades[trade_count, 1] = n-1
        trades[trade_count, 2] = entry_price
        trades[trade_count, 3] = closes[n-1]
        trades[trade_count, 4] = 2.0
        trades[trade_count, 5] = shares
        trade_count += 1
        equity[n-1] = capital
        
    return trades[:trade_count], equity

@numba.jit(nopython=True)
def run_bbands(closes: np.ndarray, upper: np.ndarray, lower: np.ndarray, initial_capital: float):
    n = len(closes)
    equity = np.zeros(n, dtype=np.float64)
    max_trades = n // 2 + 1
    trades = np.zeros((max_trades, 6), dtype=np.float64) 
    
    capital = initial_capital
    shares = 0
    trade_count = 0
    in_position = False
    
    entry_idx = -1
    entry_price = 0.0
    
    for i in range(n):
        if np.isnan(upper[i]) or np.isnan(lower[i]) or i == 0:
            equity[i] = capital + (shares * closes[i])
            continue
            
        # BUY: cross below lower band
        if closes[i-1] >= lower[i-1] and closes[i] < lower[i] and not in_position:
            shares = int(capital // closes[i])
            if shares > 0:
                capital -= shares * closes[i]
                in_position = True
                entry_idx = i
                entry_price = closes[i]
                
        # SELL: cross above upper band
        elif closes[i-1] <= upper[i-1] and closes[i] > upper[i] and in_position:
            capital += shares * closes[i]
            trades[trade_count, 0] = entry_idx
            trades[trade_count, 1] = i
            trades[trade_count, 2] = entry_price
            trades[trade_count, 3] = closes[i]
            trades[trade_count, 4] = 1.0
            trades[trade_count, 5] = shares
            trade_count += 1
            shares = 0
            in_position = False
            
        equity[i] = capital + (shares * closes[i])
        
    if in_position:
        capital += shares * closes[n-1]
        trades[trade_count, 0] = entry_idx
        trades[trade_count, 1] = n-1
        trades[trade_count, 2] = entry_price
        trades[trade_count, 3] = closes[n-1]
        trades[trade_count, 4] = 2.0
        trades[trade_count, 5] = shares
        trade_count += 1
        equity[n-1] = capital
        
    return trades[:trade_count], equity
