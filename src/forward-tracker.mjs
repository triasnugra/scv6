/**
 * Forward-Test & Real-Money R-Multiple Journal Tracker
 */

import { CONFIG } from "./config.mjs";

export function updateForwardJournal(existingJournal, newApprovedSignals, latestMarketMap) {
  const journal = {
    updatedAt: new Date().toISOString(),
    stats: {
      totalClosed: 0,
      wins: 0,
      breakevenOrPartial: 0,
      losses: 0,
      winRatePct: 0,
      netRMultiple: 0,
      expectancyR: 0
    },
    activeSignals: [],
    closedSignals: existingJournal?.closedSignals || []
  };

  const prevActive = existingJournal?.activeSignals || [];
  const stillActive = [];

  for (const sig of prevActive) {
    const market = latestMarketMap[sig.symbol];
    if (!market) {
      stillActive.push(sig);
      continue;
    }

    const lastCandle = market.candles["15m"][market.candles["15m"].length - 1];
    const high = Math.max(lastCandle.high, market.price);
    const low = Math.min(lastCandle.low, market.price);
    const ageHours = (Date.now() - new Date(sig.createdAt).getTime()) / 3600000;

    const isLong = sig.direction === "LONG";
    const entryMid = (sig.entryLow + sig.entryHigh) / 2;
    const riskDist = Math.abs(entryMid - sig.initialStopLoss);

    let tp1Hit = sig.tp1Hit || false;
    let currentSl = sig.stopLoss;

    if (isLong) {
      if (!tp1Hit && high >= sig.tp1) {
        tp1Hit = true;
        currentSl = entryMid;
      }
      if (high >= sig.tp2) {
        const rewardR = riskDist > 0 ? (sig.tp2 - entryMid) / riskDist : sig.rr;
        const blendedR = Number((0.6 * 1.5 + 0.4 * rewardR).toFixed(2));
        journal.closedSignals.unshift({
          ...sig,
          status: "TP2_FULL_WIN",
          closedAt: new Date().toISOString(),
          exitPrice: sig.tp2,
          realizedR: blendedR
        });
        continue;
      }
      if (low <= currentSl) {
        const realizedR = tp1Hit ? 0.9 : -1.0;
        journal.closedSignals.unshift({
          ...sig,
          status: tp1Hit ? "TP1_BE_PROTECTED" : "STOPPED_OUT",
          closedAt: new Date().toISOString(),
          exitPrice: currentSl,
          realizedR
        });
        continue;
      }
    } else {
      if (!tp1Hit && low <= sig.tp1) {
        tp1Hit = true;
        currentSl = entryMid;
      }
      if (low <= sig.tp2) {
        const rewardR = riskDist > 0 ? (entryMid - sig.tp2) / riskDist : sig.rr;
        const blendedR = Number((0.6 * 1.5 + 0.4 * rewardR).toFixed(2));
        journal.closedSignals.unshift({
          ...sig,
          status: "TP2_FULL_WIN",
          closedAt: new Date().toISOString(),
          exitPrice: sig.tp2,
          realizedR: blendedR
        });
        continue;
      }
      if (high >= currentSl) {
        const realizedR = tp1Hit ? 0.9 : -1.0;
        journal.closedSignals.unshift({
          ...sig,
          status: tp1Hit ? "TP1_BE_PROTECTED" : "STOPPED_OUT",
          closedAt: new Date().toISOString(),
          exitPrice: currentSl,
          realizedR
        });
        continue;
      }
    }

    if (ageHours >= CONFIG.risk.signalExpiryHours) {
      journal.closedSignals.unshift({
        ...sig,
        status: tp1Hit ? "TP1_EXPIRED_PROFIT" : "EXPIRED_NO_FILL",
        closedAt: new Date().toISOString(),
        exitPrice: market.price,
        realizedR: tp1Hit ? 0.9 : 0
      });
      continue;
    }

    stillActive.push({
      ...sig,
      tp1Hit,
      stopLoss: currentSl,
      lastCheckedPrice: market.price
    });
  }

  for (const item of newApprovedSignals) {
    if (item.aiReview?.aiVerdict === "VETO_WAIT") continue;
    const alreadyOpen = stillActive.some(
      (s) => s.symbol === item.symbol && s.direction === item.candidateSetup.direction
    );
    if (!alreadyOpen) {
      stillActive.unshift({
        id: `${item.symbol}-${item.candidateSetup.direction}-${Date.now()}`,
        createdAt: new Date().toISOString(),
        symbol: item.symbol,
        pair: item.pair,
        direction: item.candidateSetup.direction,
        setupCode: item.candidateSetup.setupCode,
        setupName: item.candidateSetup.setupName,
        entryLow: item.candidateSetup.entryLow,
        entryHigh: item.candidateSetup.entryHigh,
        initialStopLoss: item.candidateSetup.stopLoss,
        stopLoss: item.candidateSetup.stopLoss,
        tp1: item.candidateSetup.tp1,
        tp2: item.candidateSetup.tp2,
        rr: item.candidateSetup.rr,
        stopDistancePct: item.candidateSetup.stopDistancePct,
        tp1Hit: false,
        lastCheckedPrice: item.price,
        sizing: item.gate.positionSizing,
        aiNote: item.aiReview?.tacticalNote || ""
      });
    }
  }

  journal.activeSignals = stillActive.slice(0, 20);
  journal.closedSignals = journal.closedSignals.slice(0, 100);

  const validTrades = journal.closedSignals.filter((t) => t.status !== "EXPIRED_NO_FILL");
  const wins = validTrades.filter((t) => t.realizedR > 1.0).length;
  const bePartial = validTrades.filter((t) => t.realizedR > 0 && t.realizedR <= 1.0).length;
  const losses = validTrades.filter((t) => t.realizedR < 0).length;
  const netR = validTrades.reduce((s, t) => s + (t.realizedR || 0), 0);

  journal.stats = {
    totalClosed: validTrades.length,
    wins,
    breakevenOrPartial: bePartial,
    losses,
    winRatePct: validTrades.length > 0 ? Number((((wins + bePartial) / validTrades.length) * 100).toFixed(1)) : 0,
    netRMultiple: Number(netR.toFixed(2)),
    expectancyR: validTrades.length > 0 ? Number((netR / validTrades.length).toFixed(2)) : 0
  };

  return journal;
}
