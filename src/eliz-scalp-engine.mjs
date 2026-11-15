/**
 * Mesin Inti Analisis Scalping @eliz883 (ElizCrypto)
 */

import { CONFIG } from "./config.mjs";
import {
  calculateEMA,
  calculateATR,
  analyzeVolumeSpike,
  getMondayRange,
  analyzeRangeAndFibs,
  countZoneTaps,
  analyzeOrderbookWalls
} from "./indicators.mjs";

function roundPrice(price) {
  if (price >= 1000) return Number(price.toFixed(2));
  if (price >= 1) return Number(price.toFixed(4));
  if (price >= 0.01) return Number(price.toFixed(5));
  return Number(price.toFixed(8));
}

export function evaluateMarketRegime(btcBundle) {
  const c4h = btcBundle.candles["4h"];
  const closes = c4h.map((c) => c.close);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);

  const last = closes[closes.length - 1];
  const e20 = ema20[ema20.length - 1];
  const e50 = ema50[ema50.length - 1];
  const range4h = analyzeRangeAndFibs(c4h, 36);

  let regime = "CHOPPY_RANGE";
  let altcoinBias = "SELECTIVE_SCALP_BOTH";

  if (last > e20 && e20 > e50 && range4h.relativePosition > 0.55) {
    regime = "BULLISH_MOMENTUM";
    altcoinBias = "LONG_SCALP_FAVORED";
  } else if (last < e20 && e20 < e50 && range4h.relativePosition < 0.45) {
    regime = "BEARISH_PRESSURE";
    altcoinBias = "SHORT_SCALP_FAVORED";
  } else {
    regime = "CHOPPY_RANGE";
    altcoinBias = "ALTCOIN_RANGE_EXTREMES_ONLY";
  }

  return {
    btcPrice: roundPrice(last),
    btcRangeHigh: roundPrice(range4h.rangeHigh),
    btcRangeLow: roundPrice(range4h.rangeLow),
    btcRelativePos: range4h.relativePosition,
    regime,
    altcoinBias
  };
}

export function analyzeAssetScalp(bundle, marketRegime) {
  const { asset, candles, orderbook, venues } = bundle;
  const c15 = candles["15m"];
  const c1h = candles["1h"];

  const last15 = c15[c15.length - 1];
  const prev15 = c15[c15.length - 2];
  const prev2_15 = c15[c15.length - 3];
  const currentPrice = last15.close;

  const range1h = analyzeRangeAndFibs(c1h.slice(0, -1), 48);
  const mondayRange = getMondayRange(c1h);
  const vol15 = analyzeVolumeSpike(c15, 24);
  const vol1h = analyzeVolumeSpike(c1h, 24);
  const atr15 = calculateATR(c15, 14);
  const walls = analyzeOrderbookWalls(orderbook, currentPrice);

  const closes1h = c1h.map((c) => c.close);
  const ema20_1h = calculateEMA(closes1h, 20);
  const ema50_1h = calculateEMA(closes1h, 50);
  const lastEma20_1h = ema20_1h[ema20_1h.length - 1];
  const lastEma50_1h = ema50_1h[ema50_1h.length - 1];
  const prevEma20_1h = ema20_1h[ema20_1h.length - 2];

  const supportTaps = countZoneTaps(c1h, range1h.rangeLow, 0.004, true);
  const resistanceTaps = countZoneTaps(c1h, range1h.rangeHigh, 0.004, false);

  const candidates = [];

  // TRIGGER 1: LIQUIDITY SWEEP / STOP-RUN DEVIATION & RECLAIM (LONG)
  const keyLow = mondayRange && Math.abs(mondayRange.low - range1h.rangeLow) / range1h.rangeLow < 0.015
    ? mondayRange.low
    : range1h.rangeLow;

  const recentLow15 = Math.min(last15.low, prev15.low, prev2_15.low);
  const sweptLow = recentLow15 < keyLow && currentPrice > keyLow;
  const nearRangeLow = currentPrice >= range1h.rangeLow * 0.996 && currentPrice <= range1h.rangeLow + range1h.span * 0.22;

  if (sweptLow || nearRangeLow) {
    const slRaw = Math.min(recentLow15, keyLow) - atr15 * 0.35;
    const stopLoss = walls.strongestBidWall && walls.strongestBidWall.price < currentPrice && walls.strongestBidWall.price > slRaw * 0.992
      ? walls.strongestBidWall.price * 0.9985
      : slRaw;

    const risk = currentPrice - stopLoss;
    const tp1 = Math.min(range1h.fibs.fib050, currentPrice + risk * 2.0);
    const tp2 = walls.strongestAskWall && walls.strongestAskWall.price > tp1
      ? Math.min(walls.strongestAskWall.price * 0.999, range1h.rangeHigh)
      : Math.max(range1h.rangeHigh * 0.997, currentPrice + risk * 3.2);

    const rr = risk > 0 ? (tp2 - currentPrice) / risk : 0;
    const confluences = [];
    if (sweptLow) confluences.push("Stop-Run Sweep & Reclaim di bawah Key Low");
    if (mondayRange && recentLow15 < mondayRange.low && currentPrice > mondayRange.low) {
      confluences.push("Monday Low Liquidity Sweep Reclaimed");
    }
    if (walls.strongestBidWall) {
      confluences.push(`Whale Bid Wall $${walls.strongestBidWall.usd.toLocaleString()} (${walls.strongestBidWall.strength}x)`);
    }
    if (vol15.isSpike) confluences.push(`Volume Absorption Spike (${vol15.ratio}x)`);

    candidates.push({
      direction: "LONG",
      setupCode: "LIQUIDITY_SWEEP_RECLAIM",
      setupName: sweptLow ? "Stop-Run Deviation & Reclaim (Long)" : "Range Low Demand Reaction (Long)",
      entryLow: roundPrice(Math.max(keyLow, currentPrice - risk * 0.25)),
      entryHigh: roundPrice(currentPrice),
      stopLoss: roundPrice(stopLoss),
      tp1: roundPrice(Math.max(tp1, currentPrice + risk * 1.5)),
      tp2: roundPrice(tp2),
      rr: Number(rr.toFixed(2)),
      stopDistancePct: Number(((risk / currentPrice) * 100).toFixed(2)),
      zoneTaps: supportTaps,
      confidenceScore: 68 + confluences.length * 7 + (sweptLow ? 8 : 0),
      confluences
    });
  }

  // TRIGGER 2: LIQUIDITY SWEEP / STOP-RUN DEVIATION & RECLAIM (SHORT)
  const keyHigh = mondayRange && Math.abs(mondayRange.high - range1h.rangeHigh) / range1h.rangeHigh < 0.015
    ? mondayRange.high
    : range1h.rangeHigh;

  const recentHigh15 = Math.max(last15.high, prev15.high, prev2_15.high);
  const sweptHigh = recentHigh15 > keyHigh && currentPrice < keyHigh;
  const nearRangeHigh = currentPrice <= range1h.rangeHigh * 1.004 && currentPrice >= range1h.rangeHigh - range1h.span * 0.22;

  if (sweptHigh || nearRangeHigh) {
    const slRaw = Math.max(recentHigh15, keyHigh) + atr15 * 0.35;
    const stopLoss = walls.strongestAskWall && walls.strongestAskWall.price > currentPrice && walls.strongestAskWall.price < slRaw * 1.008
      ? walls.strongestAskWall.price * 1.0015
      : slRaw;

    const risk = stopLoss - currentPrice;
    const tp1 = Math.max(range1h.fibs.fib050, currentPrice - risk * 2.0);
    const tp2 = walls.strongestBidWall && walls.strongestBidWall.price < tp1
      ? Math.max(walls.strongestBidWall.price * 1.001, range1h.rangeLow)
      : Math.min(range1h.rangeLow * 1.003, currentPrice - risk * 3.2);

    const rr = risk > 0 ? (currentPrice - tp2) / risk : 0;
    const confluences = [];
    if (sweptHigh) confluences.push("Stop-Run Deviation & Reject di atas Key High");
    if (mondayRange && recentHigh15 > mondayRange.high && currentPrice < mondayRange.high) {
      confluences.push("Monday High Liquidity Sweep Rejected");
    }
    if (walls.strongestAskWall) {
      confluences.push(`Whale Ask Wall $${walls.strongestAskWall.usd.toLocaleString()} (${walls.strongestAskWall.strength}x)`);
    }
    if (vol15.isSpike) confluences.push(`Selling Absorption Spike (${vol15.ratio}x)`);

    candidates.push({
      direction: "SHORT",
      setupCode: "DEVIATION_REJECTION_SHORT",
      setupName: sweptHigh ? "Range High Deviation & Reject (Short)" : "Supply Wall Rejection (Short)",
      entryLow: roundPrice(currentPrice),
      entryHigh: roundPrice(Math.min(keyHigh, currentPrice + risk * 0.25)),
      stopLoss: roundPrice(stopLoss),
      tp1: roundPrice(Math.min(tp1, currentPrice - risk * 1.5)),
      tp2: roundPrice(tp2),
      rr: Number(rr.toFixed(2)),
      stopDistancePct: Number(((risk / currentPrice) * 100).toFixed(2)),
      zoneTaps: resistanceTaps,
      confidenceScore: 68 + confluences.length * 7 + (sweptHigh ? 8 : 0),
      confluences
    });
  }

  // TRIGGER 3: CUSTOM FIBONACCI 0.75 RETEST + TIGHT 0.786 INVALIDATION (LONG)
  const fib075 = range1h.fibs.fib075;
  const fib0786 = range1h.fibs.fib0786;
  const touchedFib075 = Math.min(last15.low, prev15.low) <= fib075 * 1.0025 && currentPrice >= fib0786;

  if (touchedFib075 && marketRegime.regime !== "BEARISH_PRESSURE") {
    const stopLoss = Math.min(fib0786 * 0.997, Math.min(last15.low, prev15.low) - atr15 * 0.25);
    const risk = currentPrice - stopLoss;
    const tp1 = range1h.fibs.fib050;
    const tp2 = range1h.fibs.fib025;
    const rr = risk > 0 ? (tp2 - currentPrice) / risk : 0;

    const confluences = [
      `Retest Zona Custom Fib 0.75 (${roundPrice(fib075)})`,
      `Invalidasi Ketat di bawah Fib 0.786 (${roundPrice(fib0786)})`
    ];
    if (walls.strongestBidWall) confluences.push(`Bid Wall Support $${walls.strongestBidWall.usd.toLocaleString()}`);

    candidates.push({
      direction: "LONG",
      setupCode: "ELIZ_FIB_075_BOUNCE",
      setupName: "Eliz Custom Fib 0.75 Retest Bounce (Long)",
      entryLow: roundPrice(fib075),
      entryHigh: roundPrice(currentPrice),
      stopLoss: roundPrice(stopLoss),
      tp1: roundPrice(tp1),
      tp2: roundPrice(tp2),
      rr: Number(rr.toFixed(2)),
      stopDistancePct: Number(((risk / currentPrice) * 100).toFixed(2)),
      zoneTaps: supportTaps,
      confidenceScore: 70 + confluences.length * 6,
      confluences
    });
  }

  // TRIGGER 4: EMA 20/50 1H FLIP & SQUEEZE BREAKOUT
  const prev1h = c1h[c1h.length - 2];
  const emaFlippedBullish =
    prev1h.close <= prevEma20_1h &&
    currentPrice > lastEma20_1h &&
    currentPrice >= lastEma50_1h * 0.998 &&
    (vol1h.isSpike || vol15.isSpike);

  if (emaFlippedBullish) {
    const stopLoss = Math.min(prev1h.low, lastEma20_1h - atr15 * 0.5);
    const risk = currentPrice - stopLoss;
    const tp1 = currentPrice + risk * 1.8;
    const tp2 = Math.max(range1h.rangeHigh, currentPrice + risk * 2.8);
    const rr = risk > 0 ? (tp2 - currentPrice) / risk : 0;

    candidates.push({
      direction: "LONG",
      setupCode: "EMA_FLIP_SQUEEZE",
      setupName: "1H EMA Ribbon Flip & Squeeze Breakout (Long)",
      entryLow: roundPrice(lastEma20_1h),
      entryHigh: roundPrice(currentPrice),
      stopLoss: roundPrice(stopLoss),
      tp1: roundPrice(tp1),
      tp2: roundPrice(tp2),
      rr: Number(rr.toFixed(2)),
      stopDistancePct: Number(((risk / currentPrice) * 100).toFixed(2)),
      zoneTaps: 1,
      confidenceScore: 74,
      confluences: [
        "1H Candle Flip & Close di atas EMA 20/50",
        `Volume Breakout Confirmation (${Math.max(vol1h.ratio, vol15.ratio)}x)`
      ]
    });
  }

  candidates.sort((a, b) => (b.confidenceScore + b.rr * 4) - (a.confidenceScore + a.rr * 4));
  const bestSetup = candidates[0] || null;

  return {
    symbol: asset.symbol,
    pair: asset.pair,
    category: asset.category,
    price: roundPrice(currentPrice),
    timestamp: new Date().toISOString(),
    structure: {
      range1hHigh: roundPrice(range1h.rangeHigh),
      range1hLow: roundPrice(range1h.rangeLow),
      relativePosition: range1h.relativePosition,
      inNoTradeMidRange:
        range1h.relativePosition > CONFIG.risk.midRangeNoTradeMin &&
        range1h.relativePosition < CONFIG.risk.midRangeNoTradeMax,
      mondayHigh: mondayRange ? roundPrice(mondayRange.high) : null,
      mondayLow: mondayRange ? roundPrice(mondayRange.low) : null,
      fib075: roundPrice(fib075),
      fib0786: roundPrice(fib0786),
      ema20_1h: roundPrice(lastEma20_1h),
      ema50_1h: roundPrice(lastEma50_1h),
      supportTaps,
      resistanceTaps
    },
    liquidity: {
      primaryExchange: orderbook.exchange,
      bidWall: walls.strongestBidWall,
      askWall: walls.strongestAskWall,
      imbalanceRatio: walls.imbalanceRatio,
      fundingRatePct: Number(((orderbook.fundingRate || 0) * 100).toFixed(4)),
      openInterestUsd: Math.round(orderbook.openInterestUsd || 0),
      volumeSpike15m: vol15.ratio,
      venuesActive: venues
    },
    candidateSetup: bestSetup
  };
}
