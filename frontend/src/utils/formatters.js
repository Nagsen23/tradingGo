/**
 * Common formatting utilities.
 */

export function formatTickerDisplay(tickerStr) {
  if (!tickerStr) return "—";
  
  // Safe string conversion
  const t = String(tickerStr).trim().toUpperCase();
  
  if (t.endsWith(".NS")) {
    return `${t.replace(".NS", "")} (NSE)`;
  } else if (t.endsWith(".BO")) {
    return `${t.replace(".BO", "")} (BSE)`;
  }
  
  // Default US
  return `${t} (US)`;
}
