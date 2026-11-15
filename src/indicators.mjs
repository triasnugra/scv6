/**
 * Modul Kalkulasi Struktur Pasar, Likuiditas & Indikator ala @eliz883:
 * - EMA 20 / 50 / 100 / 200 (untuk deteksi EMA Flip & Squeeze)
 * - Monday High / Monday Low (Monday Range Sweep)
 * - Range High / Range Low & Posisi Harga (Anti Mid-Range "No-Man's Land")
 * - Custom Fibonacci @eliz883 (0.25, 0.50, 0.75, 0.786)
 * - Deteksi Bid Wall & Ask Wall (Whale Liquidity Heatmap proxy dari L2 Orderbook)
 * - Penghitung Tap Zona (Aturan maks 2 pantulan @eliz883)
 */

export function calculateEMA(closes, period) {
  if (!closes || closes.length === 0) return [];
  const k = 2 / (period + 1);
  const ema = [closes[0]];
  for (let i = 1; i < closes.length; i++) {
    ema.push(closes[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

export function calculateATR(candles, period = 14) {
  if (candles.length < period + 1) return 0;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trs.push(tr);
  }
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

export function analyzeVolumeSpike(candles, lookback = 24) {
  if (candles.length < lookback + 2) return { ratio: 1, isSpike: false };
  const recent = candles.slice(-lookback - 1, -1);
  const avgVol = recent.reduce((sum, c) => sum + c.volume, 0) / recent.length;
  const lastVol = candles[candles.length - 1].volume;
  const prevVol = candles[candles.length - 2].volume;
  const peakRecent = Math.max(lastVol, prevVol);
  const ratio = avgVol > 0 ? peakRecent / avgVol : 1;
  return {
    ratio: Number(ratio.toFixed(2)),
    isSpike: ratio >= 1.65
  };
}

export function getMondayRange(candles1h) {
  const mondayCandles = [];
  let foundMonday = false;
  for (let i = candles1h.length - 1; i >= 0; i--) {
    const day = new Date(candles1h[i].time).getUTCDay();
    if (day === 1) {
      mondayCandles.push(candles1h[i]);
      foundMonday = true;
    } else if (foundMonday) {
      break;
    }
  }
  if (mondayCandles.length === 0) return null;
  const high = Math.max(...mondayCandles.map((c) => c.high));
  const low = Math.min(...mondayCandles.map((c) => c.low));
  return { high, low };
}

export function analyzeRangeAndFibs(candles, lookback = 48) {
  const slice = candles.slice(-lookback);
  const rangeHigh = Math.max(...slice.map((c) => c.high));
  const rangeLow = Math.min(...slice.map((c) => c.low));
  const span = Math.max(rangeHigh - rangeLow, 1e-9);
  const lastPrice = slice[slice.length - 1].close;

  const relativePosition = (lastPrice - rangeLow) / span;

  const fibs = {
    fib025: rangeHigh - span * 0.25,
    fib050: rangeHigh - span * 0.50,
    fib075: rangeHigh - span * 0.75,
    fib0786: rangeHigh - span * 0.786
  };

  return {
    rangeHigh,
    rangeLow,
    span,
    lastPrice,
    relativePosition: Number(relativePosition.toFixed(3)),
    fibs
  };
}

export function countZoneTaps(candles, levelPrice, tolerancePct = 0.0035, isSupport = true) {
  const tol = levelPrice * tolerancePct;
  let taps = 0;
  let inZone = false;

  const history = candles.slice(-62, -2);
  for (const c of history) {
    const touched = isSupport
      ? c.low <= levelPrice + tol && c.close >= levelPrice - tol
      : c.high >= levelPrice - tol && c.close <= levelPrice + tol;

    if (touched && !inZone) {
      taps += 1;
      inZone = true;
    } else if (!touched) {
      inZone = false;
    }
  }
  return taps;
}

export function analyzeOrderbookWalls(orderbook, currentPrice) {
  const bids = (orderbook?.bids || []).filter((b) => b.price < currentPrice && b.price >= currentPrice * 0.965);
  const asks = (orderbook?.asks || []).filter((a) => a.price > currentPrice && a.price <= currentPrice * 1.035);

  if (bids.length === 0 || asks.length === 0) {
    return {
      strongestBidWall: null,
      strongestAskWall: null,
      imbalanceRatio: 1.0
    };
  }

  const avgBidUsd = bids.reduce((s, b) => s + b.usd, 0) / bids.length;
  const avgAskUsd = asks.reduce((s, a) => s + a.usd, 0) / asks.length;

  const sortedBids = [...bids].sort((a, b) => b.usd - a.usd);
  const sortedAsks = [...asks].sort((a, b) => b.usd - a.usd);

  const topBid = sortedBids[0];
  const topAsk = sortedAsks[0];

  const totalBidUsd = bids.reduce((s, b) => s + b.usd, 0);
  const totalAskUsd = asks.reduce((s, a) => s + a.usd, 0);

  return {
    strongestBidWall: topBid && topBid.usd >= avgBidUsd * 2.2
      ? { price: topBid.price, usd: Math.round(topBid.usd), strength: Number((topBid.usd / avgBidUsd).toFixed(1)) }
      : null,
    strongestAskWall: topAsk && topAsk.usd >= avgAskUsd * 2.2
      ? { price: topAsk.price, usd: Math.round(topAsk.usd), strength: Number((topAsk.usd / avgAskUsd).toFixed(1)) }
      : null,
    imbalanceRatio: Number((totalBidUsd / Math.max(totalAskUsd, 1)).toFixed(2))
  };
}
