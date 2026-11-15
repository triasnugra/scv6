/**
 * Multi-Exchange Market Data Adapter (Binance Futures, Bybit V5, Hyperliquid)
 * Dilengkapi auto-failover agar tetap berjalan 100% di server GitHub Actions (anti HTTP 451)
 * serta mengambil data Order Book L2 (Bid/Ask Walls), Funding Rate, dan Open Interest.
 */

const TIMEOUT_MS = 9000;

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ElizScalpEngine/1.0",
        ...(options.headers || {})
      }
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBybitKlines(pair, interval, limit = 150) {
  const tfMap = { "15m": "15", "1h": "60", "4h": "240", "1d": "D" };
  const bybitTf = tfMap[interval] || "15";
  const url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${pair}&interval=${bybitTf}&limit=${limit}`;
  const json = await fetchJson(url);
  if (json.retCode !== 0 || !json.result?.list?.length) {
    throw new Error(`Bybit kline empty for ${pair}`);
  }
  return json.result.list.reverse().map((row) => ({
    time: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5])
  }));
}

async function fetchBybitOrderbookAndTicker(pair) {
  const [obJson, tickJson] = await Promise.all([
    fetchJson(`https://api.bybit.com/v5/market/orderbook?category=linear&symbol=${pair}&limit=50`),
    fetchJson(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${pair}`)
  ]);
  const bids = (obJson.result?.b || []).map(([p, q]) => ({ price: Number(p), size: Number(q), usd: Number(p) * Number(q) }));
  const asks = (obJson.result?.a || []).map(([p, q]) => ({ price: Number(p), size: Number(q), usd: Number(p) * Number(q) }));
  const ticker = tickJson.result?.list?.[0] || {};
  return {
    exchange: "BYBIT",
    bids,
    asks,
    fundingRate: Number(ticker.fundingRate || 0),
    openInterestUsd: Number(ticker.openInterestValue || 0),
    volume24hUsd: Number(ticker.turnover24h || 0)
  };
}

async function fetchBinanceKlines(pair, interval, limit = 150) {
  const endpoints = [
    `https://fapi.binance.com/fapi/v1/klines?symbol=${pair}&interval=${interval}&limit=${limit}`,
    `https://data-api.binance.vision/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`
  ];
  for (const url of endpoints) {
    try {
      const rows = await fetchJson(url);
      if (Array.isArray(rows) && rows.length > 0) {
        return rows.map((r) => ({
          time: Number(r[0]),
          open: Number(r[1]),
          high: Number(r[2]),
          low: Number(r[3]),
          close: Number(r[4]),
          volume: Number(r[5])
        }));
      }
    } catch (_) {}
  }
  throw new Error(`Binance klines unavailable for ${pair}`);
}

async function fetchBinanceOrderbook(pair) {
  const endpoints = [
    `https://fapi.binance.com/fapi/v1/depth?symbol=${pair}&limit=50`,
    `https://data-api.binance.vision/api/v3/depth?symbol=${pair}&limit=50`
  ];
  for (const url of endpoints) {
    try {
      const ob = await fetchJson(url);
      if (ob?.bids && ob?.asks) {
        return {
          exchange: "BINANCE",
          bids: ob.bids.map(([p, q]) => ({ price: Number(p), size: Number(q), usd: Number(p) * Number(q) })),
          asks: ob.asks.map(([p, q]) => ({ price: Number(p), size: Number(q), usd: Number(p) * Number(q) })),
          fundingRate: 0,
          openInterestUsd: 0,
          volume24hUsd: 0
        };
      }
    } catch (_) {}
  }
  return null;
}

async function fetchHyperliquidOrderbookAndMeta(hlCoin) {
  try {
    const [l2, metaCtx] = await Promise.all([
      fetchJson("https://api.hyperliquid.xyz/info", {
        method: "POST",
        body: JSON.stringify({ type: "l2Book", coin: hlCoin })
      }),
      fetchJson("https://api.hyperliquid.xyz/info", {
        method: "POST",
        body: JSON.stringify({ type: "metaAndAssetCtxs" })
      })
    ]);

    const levels = l2?.levels || [[], []];
    const bids = (levels[0] || []).map((lv) => ({
      price: Number(lv.px),
      size: Number(lv.sz),
      usd: Number(lv.px) * Number(lv.sz)
    }));
    const asks = (levels[1] || []).map((lv) => ({
      price: Number(lv.px),
      size: Number(lv.sz),
      usd: Number(lv.px) * Number(lv.sz)
    }));

    let fundingRate = 0;
    let openInterestUsd = 0;
    if (Array.isArray(metaCtx) && metaCtx.length === 2) {
      const universe = metaCtx[0]?.universe || [];
      const ctxs = metaCtx[1] || [];
      const idx = universe.findIndex((u) => u.name === hlCoin);
      if (idx >= 0 && ctxs[idx]) {
        fundingRate = Number(ctxs[idx].funding || 0);
        openInterestUsd = Number(ctxs[idx].openInterest || 0) * Number(ctxs[idx].markPx || 0);
      }
    }

    return {
      exchange: "HYPERLIQUID",
      bids,
      asks,
      fundingRate,
      openInterestUsd
    };
  } catch (_) {
    return null;
  }
}

export async function fetchAssetMarketBundle(asset) {
  const { pair, hlCoin } = asset;

  const loadTf = async (tf, limit) => {
    try {
      return await fetchBybitKlines(pair, tf, limit);
    } catch (_) {
      return await fetchBinanceKlines(pair, tf, limit);
    }
  };

  const [candles15m, candles1h, candles4h, bybitMeta, binanceOb, hlMeta] = await Promise.all([
    loadTf("15m", 160),
    loadTf("1h", 160),
    loadTf("4h", 100),
    fetchBybitOrderbookAndTicker(pair).catch(() => null),
    fetchBinanceOrderbook(pair).catch(() => null),
    fetchHyperliquidOrderbookAndMeta(hlCoin).catch(() => null)
  ]);

  const primaryOb = bybitMeta || binanceOb || hlMeta || {
    exchange: "FALLBACK",
    bids: [],
    asks: [],
    fundingRate: 0,
    openInterestUsd: 0,
    volume24hUsd: 0
  };

  return {
    asset,
    candles: {
      "15m": candles15m,
      "1h": candles1h,
      "4h": candles4h
    },
    orderbook: primaryOb,
    venues: {
      bybit: Boolean(bybitMeta),
      binance: Boolean(binanceOb),
      hyperliquid: Boolean(hlMeta),
      hlFundingRate: hlMeta?.fundingRate ?? null,
      hlOpenInterestUsd: hlMeta?.openInterestUsd ?? null
    }
  };
}
