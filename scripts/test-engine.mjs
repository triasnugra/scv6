/**
 * Automated Unit & Safety Gate Tests untuk CI/CD GitHub Actions
 */

import assert from "node:assert/strict";
import { analyzeRangeAndFibs, analyzeOrderbookWalls } from "../src/indicators.mjs";
import { evaluateExecutionGate } from "../src/gate.mjs";

console.log("Running @eliz883 Scalp Engine Safety & Math Tests...");

const mockCandles = Array.from({ length: 50 }, (_, i) => ({
  time: 1700000000000 + i * 3600000,
  open: 100,
  high: i === 10 ? 200 : 150,
  low: i === 20 ? 100 : 120,
  close: 125,
  volume: 1000
}));

const rangeRes = analyzeRangeAndFibs(mockCandles, 48);
assert.equal(rangeRes.rangeHigh, 200);
assert.equal(rangeRes.rangeLow, 100);
assert.equal(rangeRes.fibs.fib075, 125);
assert.equal(rangeRes.fibs.fib0786, 121.4);
assert.equal(rangeRes.relativePosition, 0.25);

const midRangeAnalysis = {
  symbol: "BTC",
  price: 150,
  structure: { relativePosition: 0.5, inNoTradeMidRange: true },
  liquidity: { fundingRatePct: 0.01 },
  candidateSetup: {
    direction: "LONG",
    setupCode: "LIQUIDITY_SWEEP_RECLAIM",
    entryLow: 149.5,
    entryHigh: 150,
    stopLoss: 148,
    tp1: 153,
    tp2: 156,
    rr: 3.0,
    stopDistancePct: 1.33,
    zoneTaps: 1
  }
};
const gateMid = evaluateExecutionGate(midRangeAnalysis, { regime: "CHOPPY_RANGE", btcPrice: 150 });
assert.equal(gateMid.approved, false);
assert.ok(gateMid.reasons.some((r) => r.includes("MID-RANGE BLOCK")));

const exhaustedAnalysis = {
  ...midRangeAnalysis,
  structure: { relativePosition: 0.1, inNoTradeMidRange: false },
  candidateSetup: { ...midRangeAnalysis.candidateSetup, zoneTaps: 3 }
};
const gateExhausted = evaluateExecutionGate(exhaustedAnalysis, { regime: "BULLISH_MOMENTUM", btcPrice: 150 });
assert.equal(gateExhausted.approved, false);
assert.ok(gateExhausted.reasons.some((r) => r.includes("ZONE EXHAUSTED")));

const validAnalysis = {
  ...midRangeAnalysis,
  structure: { relativePosition: 0.12, inNoTradeMidRange: false },
  candidateSetup: { ...midRangeAnalysis.candidateSetup, zoneTaps: 1, rr: 2.5, stopDistancePct: 1.1 }
};
const gateValid = evaluateExecutionGate(validAnalysis, { regime: "BULLISH_MOMENTUM", btcPrice: 150 });
assert.equal(gateValid.approved, true);
assert.equal(gateValid.status, "APPROVED_TRIGGER");

const ob = analyzeOrderbookWalls({
  bids: [
    { price: 99.5, size: 10, usd: 995 },
    { price: 99.0, size: 10, usd: 990 },
    { price: 98.5, size: 80, usd: 7880 }
  ],
  asks: [
    { price: 100.5, size: 10, usd: 1005 },
    { price: 101.0, size: 10, usd: 1010 },
    { price: 102.0, size: 70, usd: 7140 }
  ]
}, 100);
assert.equal(ob.strongestBidWall.price, 98.5);
assert.equal(ob.strongestAskWall.price, 102.0);

console.log("ALL TESTS PASSED SUCCESSFULLY!");
