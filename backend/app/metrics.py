import math
from datetime import datetime
import numpy as np

def calculate_metrics(trades: list[dict], equity_curve: list[dict], initial_capital: float) -> tuple[dict, list[dict]]:
    final_equity = equity_curve[-1]["equity"] if equity_curve else initial_capital
    total_return_pct = ((final_equity / initial_capital) - 1) * 100
    num_trades = len(trades)
    winning_trades = [t for t in trades if t["pnl"] > 0]
    losing_trades = [t for t in trades if t["pnl"] <= 0]
    win_rate = (len(winning_trades) / num_trades * 100) if num_trades > 0 else 0.0

    peak = initial_capital
    max_drawdown = 0.0
    drawdown_curve = []
    for point in equity_curve:
        if point["equity"] > peak:
            peak = point["equity"]
        drawdown = ((peak - point["equity"]) / peak) * 100 if peak > 0 else 0
        if drawdown > max_drawdown:
            max_drawdown = drawdown
        drawdown_curve.append({"date": point["date"], "drawdown": round(drawdown, 2)})

    avg_win = sum(t["pnl"] for t in winning_trades) / len(winning_trades) if winning_trades else 0.0
    avg_loss = sum(t["pnl"] for t in losing_trades) / len(losing_trades) if losing_trades else 0.0

    sharpe_ratio = 0.0
    sortino_ratio = 0.0
    cagr = 0.0
    calmar_ratio = 0.0

    if len(equity_curve) > 1:
        # Time calculations for CAGR
        start_date = datetime.strptime(equity_curve[0]["date"], "%Y-%m-%d")
        end_date = datetime.strptime(equity_curve[-1]["date"], "%Y-%m-%d")
        days_passed = (end_date - start_date).days
        years_passed = days_passed / 365.25 if days_passed > 0 else 0

        if years_passed > 0:
            cagr = ((final_equity / initial_capital) ** (1 / years_passed) - 1) * 100

        if max_drawdown > 0:
            calmar_ratio = cagr / max_drawdown

        daily_returns = []
        downside_returns = []
        for i in range(1, len(equity_curve)):
            prev_eq = equity_curve[i - 1]["equity"]
            curr_eq = equity_curve[i]["equity"]
            if prev_eq > 0:
                ret = (curr_eq - prev_eq) / prev_eq
                daily_returns.append(ret)
                if ret < 0:
                    downside_returns.append(ret)
                else:
                    downside_returns.append(0.0)

        if len(daily_returns) > 1:
            mean_ret = sum(daily_returns) / len(daily_returns)
            var = sum((r - mean_ret) ** 2 for r in daily_returns) / (len(daily_returns) - 1)
            std = math.sqrt(var) if var > 0 else 0
            if std > 0:
                sharpe_ratio = (mean_ret / std) * math.sqrt(252)

            # Sortino Downside STD
            down_var = sum(r ** 2 for r in downside_returns) / len(downside_returns)
            down_std = math.sqrt(down_var)
            if down_std > 0:
                sortino_ratio = (mean_ret / down_std) * math.sqrt(252)

    gross_wins = sum(t["pnl"] for t in winning_trades) if winning_trades else 0.0
    gross_losses = abs(sum(t["pnl"] for t in losing_trades)) if losing_trades else 0.0
    profit_factor = (gross_wins / gross_losses) if gross_losses > 0 else (999.99 if gross_wins > 0 else 0.0)

    metrics = {
        "initial_capital": initial_capital,
        "final_equity": round(final_equity, 2),
        "total_return_pct": round(total_return_pct, 2),
        "cagr_pct": round(cagr, 2),
        "num_trades": num_trades,
        "winning_trades": len(winning_trades),
        "losing_trades": len(losing_trades),
        "win_rate": round(win_rate, 2),
        "max_drawdown_pct": round(max_drawdown, 2),
        "avg_win": round(avg_win, 2),
        "avg_loss": round(avg_loss, 2),
        "sharpe_ratio": round(sharpe_ratio, 2),
        "sortino_ratio": round(sortino_ratio, 2),
        "calmar_ratio": round(calmar_ratio, 2),
        "profit_factor": round(profit_factor, 2),
    }
    return metrics, drawdown_curve
