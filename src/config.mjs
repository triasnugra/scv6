/**
 * Konfigurasi Utama Mesin Analisis Scalping @eliz883 + Gemini Hybrid
 * Dirancang untuk eksekusi real-money di Binance Futures, Bybit Linear, dan Hyperliquid.
 */

export const CONFIG = {
  engineName: "ELIZ-SCALP // HYDRO ENGINE v1.0",
  methodology: "@eliz883 Liquidity Sweeps, Triggers, Custom Fibs (0.25/0.5/0.75) & Orderbook Confluence",

  // Daftar aset likuiditas tinggi & koin favorit scalping @eliz883
  watchlist: [
    { symbol: "BTC", pair: "BTCUSDT", hlCoin: "BTC", category: "MAJOR" },
    { symbol: "ETH", pair: "ETHUSDT", hlCoin: "ETH", category: "MAJOR" },
    { symbol: "SOL", pair: "SOLUSDT", hlCoin: "SOL", category: "MAJOR" },
    { symbol: "PEPE", pair: "PEPEUSDT", hlCoin: "kPEPE", category: "SCALP_FAV" },
    { symbol: "INJ", pair: "INJUSDT", hlCoin: "INJ", category: "SCALP_FAV" },
    { symbol: "LTC", pair: "LTCUSDT", hlCoin: "LTC", category: "SCALP_FAV" },
    { symbol: "TRB", pair: "TRBUSDT", hlCoin: "TRB", category: "SCALP_FAV" },
    { symbol: "HBAR", pair: "HBARUSDT", hlCoin: "HBAR", category: "SCALP_FAV" },
    { symbol: "ARB", pair: "ARBUSDT", hlCoin: "ARB", category: "ALT" },
    { symbol: "SUI", pair: "SUIUSDT", hlCoin: "SUI", category: "ALT" }
  ],

  // Parameter Timeframe Scalping @eliz883
  timeframes: {
    htfBias: "4h",      // Framing makro & level kunci H4
    structure: "1h",    // Range utama, Monday Range, & EMA flip
    trigger: "15m"      // Presisi entry sweep, wick absorption, & tight invalidation
  },

  // Level Fibonacci khas @eliz883 (bukan Fib retail biasa)
  elizFibLevels: [0.25, 0.5, 0.75, 0.786],

  // Parameter Risk Management Real-Money (Strict Gate)
  risk: {
    defaultEquityUsdt: 1000,
    riskPerTradePct: 1.0,        // Risiko maksimal 1% ekuitas per posisi scalp
    minRiskReward: 1.8,          // Tolak setup jika R:R < 1.8
    maxStopLossPct: 3.5,         // Stop loss scalp wajib ketat (maks 3.5%)
    minStopLossPct: 0.25,        // Hindari SL terlalu sempit kena noise spread/fee
    midRangeNoTradeMin: 0.36,    // Zona terlarang "Middle of Nowhere" (36% - 64% range)
    midRangeNoTradeMax: 0.64,
    maxZoneTaps: 2,              // Aturan @eliz883: Pantulan ke-1 & ke-2 valid, ke-3+ hangus!
    tp1ClosePct: 60,             // Tutup 60% posisi di TP1, sisanya 40% runner dengan SL di Break-Even
    signalExpiryHours: 12        // Sinyal scalp kadaluarsa setelah 12 jam jika belum tersentuh
  }
};
