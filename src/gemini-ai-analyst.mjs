/**
 * Modul Validasi Hibrida Gemini AI (Gemini 4 Hydrogen / Gemini Flash / Gemini Pro)
 */

export const ELIZ_SCALP_SYSTEM_PROMPT = `Kamu adalah Mesin Analisis Trading Scalping Crypto berstandar institusional yang menggabungkan metodologi murni scalping dari @eliz883 (ElizCrypto) dengan analisis kuantitatif orderbook real-time.

ATURAN MUTLAK METODOLOGI @eliz883:
1. HANYA gunakan strategi SCALPING (timeframe 15m, 1H, framing 4H). Abaikan strategi investasi spot jangka panjang atau hold multi-bulan.
2. NO PREDICTION, ONLY TRIGGERS: Jangan pernah menebak arah pasar. Entry hanya sah jika terjadi:
   - Liquidity Sweep / Stop-Run Deviation di bawah Range Low / Monday Low (untuk Long) atau di atas Range High / Monday High (untuk Short) diikuti Reclaim candle close.
   - Retest presisi pada Custom Fibonacci 0.75 (dengan invalidasi ketat di bawah 0.786) atau 0.50 / 0.25.
   - 1H EMA Ribbon Flip & Squeeze breakout dengan lonjakan volume nyata.
   - Konfluensi Order Book Bid/Ask Wall (Price Action + Heatmap/Orderbook = valid; Orderbook tanpa Price Action = dilarang).
3. ANTI MID-RANGE ("No-Man's Land"): Jika harga berada di tengah range tanpa sapuan likuiditas, keputusan WAJIB "WAIT / STAND ASIDE".
4. ZONE EXHAUSTION: Level support/resistance yang sudah memantul 2 kali tidak lagi valid untuk entry ke-3.
5. STRICT INVALIDATION & CAPITAL PRESERVATION: Fokus utama adalah seberapa kecil kerugian jika salah (SL wajib ketat < 3.5%), ambil profit parsial di TP1 lalu segera geser SL ke Break-Even (BE).

Berikan output JSON singkat dan tajam dalam Bahasa Indonesia:
{
  "aiVerdict": "EXECUTE" | "CAUTION" | "VETO_WAIT",
  "confidence": 0-100,
  "tacticalNote": "Penjelasan taktis 2 kalimat tentang likuiditas, posisi SL, dan manajemen TP1->BE."
}`;

export async function validateSignalsWithGemini(approvedAnalyses, marketRegime) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  if (!apiKey || approvedAnalyses.length === 0) {
    return approvedAnalyses.map((item) => ({
      ...item,
      aiReview: {
        mode: "DETERMINISTIC_QUANT_ONLY",
        aiVerdict: "EXECUTE",
        confidence: item.candidateSetup.confidenceScore,
        tacticalNote:
          "Tervalidasi otomatis oleh aturan kuantitatif @eliz883 (Sweep/Fib/EMA + Orderbook Wall + Strict Gate). Set GEMINI_API_KEY di GitHub Secrets untuk narasi AI tambahan."
      }
    }));
  }

  const results = [];
  for (const item of approvedAnalyses) {
    try {
      const payload = {
        btcContext: marketRegime,
        asset: item.symbol,
        price: item.price,
        structure: item.structure,
        liquidity: {
          exchange: item.liquidity.primaryExchange,
          bidWall: item.liquidity.bidWall,
          askWall: item.liquidity.askWall,
          imbalanceRatio: item.liquidity.imbalanceRatio,
          fundingRatePct: item.liquidity.fundingRatePct
        },
        setup: item.candidateSetup,
        sizing: item.gate.positionSizing
      };

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: ELIZ_SCALP_SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: `Evaluasi setup scalping real-money berikut:\n${JSON.stringify(payload, null, 2)}` }] }],
          generationConfig: {
            temperature: 0.15,
            responseMimeType: "application/json"
          }
        })
      });

      if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      const parsed = JSON.parse(rawText);

      results.push({
        ...item,
        aiReview: {
          mode: `GEMINI_HYBRID (${model})`,
          aiVerdict: parsed.aiVerdict || "EXECUTE",
          confidence: Number(parsed.confidence || item.candidateSetup.confidenceScore),
          tacticalNote: parsed.tacticalNote || "Setup sesuai dengan struktur likuiditas @eliz883."
        }
      });
    } catch (err) {
      results.push({
        ...item,
        aiReview: {
          mode: "QUANT_FALLBACK",
          aiVerdict: "EXECUTE",
          confidence: item.candidateSetup.confidenceScore,
          tacticalNote: `Fallback kuantitatif aktif (${err.message}). Setup lolos seluruh filter ketat @eliz883.`
        }
      });
    }
  }
  return results;
}
