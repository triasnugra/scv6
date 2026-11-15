/**
 * Orchestrator Utama Pemindaian Pasar Real-Time
 */

import fs from "node:fs/promises";
import path from "node:path";
import { CONFIG } from "../src/config.mjs";
import { fetchAssetMarketBundle } from "../src/exchanges.mjs";
import { evaluateMarketRegime, analyzeAssetScalp } from "../src/eliz-scalp-engine.mjs";
import { evaluateExecutionGate } from "../src/gate.mjs";
import { validateSignalsWithGemini } from "../src/gemini-ai-analyst.mjs";
import { updateForwardJournal } from "../src/forward-tracker.mjs";

const DATA_DIR = path.resolve("data");

async function readJsonSafe(filename, fallback) {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, filename), "utf8");
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

async function writeJson(filename, data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2) + "\n", "utf8");
}

async function main() {
  console.log(`[${new Date().toISOString()}] Memulai ${CONFIG.engineName}...`);

  const bundles = await Promise.all(
    CONFIG.watchlist.map(async (asset) => {
      try {
        return await fetchAssetMarketBundle(asset);
      } catch (err) {
        console.warn(`[WARN] Gagal mengambil data ${asset.pair}: ${err.message}`);
        return null;
      }
    })
  );

  const validBundles = bundles.filter(Boolean);
  if (validBundles.length === 0) {
    throw new Error("Seluruh koneksi bursa gagal. Periksa jaringan runner.");
  }

  const btcBundle = validBundles.find((b) => b.asset.symbol === "BTC") || validBundles[0];
  const marketRegime = evaluateMarketRegime(btcBundle);
  console.log(`[REGIME] BTC: $${marketRegime.btcPrice} | Regime: ${marketRegime.regime} | Bias: ${marketRegime.altcoinBias}`);

  const allAnalyses = [];
  const gateLogs = [];
  const marketMap = {};

  for (const bundle of validBundles) {
    const analysis = analyzeAssetScalp(bundle, marketRegime);
    const gate = evaluateExecutionGate(analysis, marketRegime);
    const enriched = { ...analysis, gate };
    allAnalyses.push(enriched);

    marketMap[analysis.symbol] = {
      price: analysis.price,
      candles: bundle.candles
    };

    gateLogs.push({
      timestamp: analysis.timestamp,
      symbol: analysis.symbol,
      price: analysis.price,
      setup: analysis.candidateSetup?.setupCode || "NONE",
      direction: analysis.candidateSetup?.direction || "WAIT",
      status: gate.status,
      reasons: gate.reasons
    });
  }

  const approvedRaw = allAnalyses.filter((a) => a.gate.approved);
  const approvedWithAi = await validateSignalsWithGemini(approvedRaw, marketRegime);

  const finalAnalyses = allAnalyses.map((item) => {
    const found = approvedWithAi.find((a) => a.symbol === item.symbol);
    return found || item;
  });

  const existingJournal = await readJsonSafe("journal.json", { activeSignals: [], closedSignals: [] });
  const updatedJournal = updateForwardJournal(existingJournal, approvedWithAi, marketMap);

  const outputSignals = {
    engine: CONFIG.engineName,
    methodology: CONFIG.methodology,
    lastUpdatedUtc: new Date().toISOString(),
    marketRegime,
    summary: {
      scannedCount: finalAnalyses.length,
      approvedTriggersCount: approvedWithAi.length,
      waitOrRejectedCount: finalAnalyses.length - approvedWithAi.length
    },
    assets: finalAnalyses
  };

  await Promise.all([
    writeJson("signals.json", outputSignals),
    writeJson("gate-log.json", { updatedAt: new Date().toISOString(), logs: gateLogs }),
    writeJson("journal.json", updatedJournal)
  ]);

  console.log(`[DONE] Selesai memindai ${finalAnalyses.length} aset. Approved Triggers: ${approvedWithAi.length}.`);
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
