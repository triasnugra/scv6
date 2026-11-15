# ELIZ-SCALP // Real-Money Crypto Scalping Engine

Mesin analisis scalping crypto otomatis berbasis metodologi **@eliz883 (ElizCrypto)** yang dipadukan dengan validasi **Gemini AI Hybrid** dan data orderbook lintas bursa (**Binance Futures, Bybit V5, Hyperliquid**).

## Cara Upload & Deploy ke GitHub Pages (Tanpa Install Lokal)
1. Buat repository baru di GitHub (misalnya `eliz-scalp-engine`).
2. Ekstrak file ZIP ini, lalu upload seluruh file & folder (termasuk folder `.github/workflows/deploy.yml`) ke repository GitHub Anda.
3. Buka tab **Settings → Pages** di repository GitHub Anda, lalu pada bagian **Build and deployment → Source**, pilih **GitHub Actions**.
4. *(Opsional untuk mode Gemini AI Hybrid)*: Buka **Settings → Secrets and variables → Actions**, tambahkan secret baru bernama `GEMINI_API_KEY` berisi API Key Google AI Studio Anda.
5. Buka tab **Actions**, pilih workflow **Eliz Scalp Engine Scan & Deploy**, lalu klik **Run workflow**. Dalam ±30 detik, dashboard live Anda akan aktif dan otomatis diperbarui setiap 15 menit!
