/**
 * api.js — Central API configuration for tradingGo frontend.
 *
 * All backend fetch calls must import API_BASE from here.
 * The actual URL is injected at build time via the VITE_API_URL env variable.
 *
 * Local dev  : set VITE_API_URL=http://localhost:8000 in frontend/.env
 * Production : set VITE_API_URL=https://your-backend.onrender.com in Vercel env vars
 */

export const API_BASE =
  import.meta.env.VITE_API_URL || "http://localhost:8000";
