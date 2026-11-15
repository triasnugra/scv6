/**
 * Real-Money Execution Safety Gate (@eliz883 Discipline Guard)
 */

import { CONFIG } from "./config.mjs";

export function evaluateExecutionGate(analysis, marketRegime) {
  const { symbol, structure, liquidity, candidateSetup } = analysis;
  const reasons = [];

  if (!candidateSetup) {
    return {
      approved: false,
      status: "WAIT_NO_TRIGGER",
      reasons: ["Belum ada Trigger Sweep/Flip/Fib 0.75 terkonfirmasi. @eliz883: Jangan menebak pasar, tunggu harga menjemput level."],
      positionSizing: null
    };
  }

  if (structure.inNoTradeMidRange && candidateSetup.setupCode !== "EMA_FLIP_SQUEEZE") {
    reasons.push(
      `MID-RANGE BLOCK: Harga berada di ${(structure.relativePosition * 100).toFixed(1)}% range (No-Man's Land). Tidak ada keunggulan R:R.`
    );
  }

  if (candidateSetup.zoneTaps > CONFIG.risk.maxZoneTaps) {
    reasons.push(
      `ZONE EXHAUSTED: Level sudah diuji ${candidateSetup.zoneTaps}x (batas maksimal @eliz883 adalah 2x pantulan).`
    );
  }

  if (candidateSetup.stopDistancePct > CONFIG.risk.maxStopLossPct) {
    reasons.push(
      `STOP TOO WIDE: Jarak SL ${candidateSetup.stopDistancePct}% melebihi batas scalping maksimal ${CONFIG.risk.maxStopLossPct}%.`
    );
  }
  if (candidateSetup.stopDistancePct < CONFIG.risk.minStopLossPct) {
    reasons.push(
      `STOP TOO TIGHT: Jarak SL ${candidateSetup.stopDistancePct}% terlalu rapat (< ${CONFIG.risk.minStopLossPct}%), rawan terkena noise & fee bursa.`
    );
  }

  if (candidateSetup.rr < CONFIG.risk.minRiskReward) {
    reasons.push(
      `LOW R:R: Risk-Reward ${candidateSetup.rr}R di bawah standar minimum ${CONFIG.risk.minRiskReward}R.`
    );
  }

  if (
    symbol !== "BTC" &&
    candidateSetup.direction === "LONG" &&
    marketRegime.regime === "BEARISH_PRESSURE" &&
    candidateSetup.setupCode !== "LIQUIDITY_SWEEP_RECLAIM"
  ) {
    reasons.push(
      `BTC HEADWIND: BTC dalam tekanan bearish (${marketRegime.btcPrice}), hindari altcoin long tanpa sweep likuiditas ekstrem.`
    );
  }

  if (candidateSetup.direction === "LONG" && liquidity.fundingRatePct > 0.06) {
    reasons.push(`CROWDED LONGS: Funding rate terlalu tinggi (${liquidity.fundingRatePct}%), rawan long squeeze.`);
  }
  if (candidateSetup.direction === "SHORT" && liquidity.fundingRatePct < -0.06) {
    reasons.push(`CROWDED SHORTS: Funding rate terlalu negatif (${liquidity.fundingRatePct}%), rawan short squeeze.`);
  }

  const approved = reasons.length === 0;

  const equity = CONFIG.risk.defaultEquityUsdt;
  const riskUsd = equity * (CONFIG.risk.riskPerTradePct / 100);
  const stopFrac = candidateSetup.stopDistancePct / 100;
  const notionalPositionUsd = stopFrac > 0 ? riskUsd / stopFrac : 0;
  const recommendedLeverage = Math.min(20, Math.max(2, Math.ceil((notionalPositionUsd / equity) * 2)));

  return {
    approved,
    status: approved ? "APPROVED_TRIGGER" : "REJECTED_BY_GATE",
    reasons: approved
      ? ["Semua kriteria Trigger, Invalidation ketat, R:R, & Likuiditas @eliz883 terpenuhi."]
      : reasons,
    positionSizing: {
      baseEquityUsdt: equity,
      riskAmountUsdt: Number(riskUsd.toFixed(2)),
      notionalSizeUsdt: Number(notionalPositionUsd.toFixed(2)),
      suggestedIsolatedLeverage: `${recommendedLeverage}x`,
      executionPlan: `Entry ${candidateSetup.entryLow} - ${candidateSetup.entryHigh} | SL ${candidateSetup.stopLoss} (-${candidateSetup.stopDistancePct}%) | TP1 ${candidateSetup.tp1} (Close ${CONFIG.risk.tp1ClosePct}%, geser SL ke Break-Even) | TP2 ${candidateSetup.tp2}`
    }
  };
}
