# GitHub Actions Setup untuk Crypto Early Detection Pipeline

## Overview
Pipeline ini akan berjalan setiap 1 jam untuk mengumpulkan, menganalisis, dan mempublikasikan early crypto signals ke Telegram channel Anda.

## Setup GitHub Secrets

### 1. GitHub API
- `GITHUB_TOKEN` - Otomatis tersedia, tidak perlu setup

### 2. Telegram API (untuk data collection)
- `TELEGRAM_API_ID` - Dapatkan dari https://my.telegram.org
- `TELEGRAM_API_HASH` - Dapatkan dari https://my.telegram.org  
- `TELEGRAM_PHONE` - Nomor telepon dengan format +6281234567890
- `TELEGRAM_SESSION` - Session string dari telegram.session file

### 3. Gemini API Keys (untuk AI analysis)
- `GEMINI_API_KEY1` - Primary Gemini API key
- `GEMINI_API_KEY2` - Backup Gemini API key
- `GEMINI_API_KEY3` - Backup Gemini API key
- `GEMINI_API_KEY4` - Backup Gemini API key
- `GEMINI_API_KEY5` - Backup Gemini API key

### 4. Telegram Bot (untuk publishing)
- `TG_TOKEN` - Bot token dari @BotFather
- `TELEGRAM_CHANNEL_ID` - Channel ID (format: -1001234567890)

## Cara Setup Secrets

1. **Buka repository GitHub Anda**
2. **Klik Settings → Secrets and variables → Actions**
3. **Klik "New repository secret"**
4. **Tambahkan setiap secret di atas**

## Cara Mendapatkan Telegram Session

1. **Jalankan script setup sekali di local:**
   ```bash
   node sources/telegram_simple.mjs
   ```
2. **Copy isi file `config/telegram.session`**
3. **Paste sebagai `TELEGRAM_SESSION` secret**

## Cara Mendapatkan Channel ID

1. **Tambahkan bot ke channel sebagai admin**
2. **Kirim pesan ke channel**
3. **Gunakan bot untuk mendapatkan chat ID:**
   ```bash
   curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates"
   ```
4. **Cari chat ID dengan format -100xxxxxxxxx**

## Schedule

Pipeline berjalan:
- **Setiap jam**: `0 * * * *` (pada menit 0 setiap jam)
- **Manual trigger**: Bisa dijalankan manual dari GitHub Actions tab

## Monitoring

### Success Notifications
- Pipeline berhasil → Data tersimpan di artifacts
- Hasil analisis terkirim ke Telegram channel

### Failure Notifications  
- Pipeline gagal → Notifikasi error dikirim ke Telegram channel
- Logs tersimpan di GitHub Actions

## Test Mode

Untuk testing tanpa mengirim ke Telegram:
1. **Buka Actions tab**
2. **Klik "Crypto Early Detection Pipeline"**
3. **Klik "Run workflow"**
4. **Check "Run in test mode"**
5. **Klik "Run workflow"**

## Troubleshooting

### Common Issues

1. **"No Gemini API keys found"**
   - Pastikan setidaknya `GEMINI_API_KEY1` sudah di-set

2. **"TG_TOKEN not set"**
   - Pastikan `TG_TOKEN` dan `TELEGRAM_CHANNEL_ID` sudah di-set

3. **"Telegram session expired"**
   - Regenerate session dengan menjalankan `node sources/telegram_simple.mjs` di local

4. **"Rate limit exceeded"**
   - Pipeline akan otomatis retry dengan delay
   - Gemini multi-key system akan switch ke key lain

### Logs Location
- **GitHub Actions**: Repository → Actions tab
- **Artifacts**: Download dari Actions run
- **Telegram**: Check channel untuk published messages

## Performance

- **Expected runtime**: 5-15 menit per run
- **Signals collected**: 100-200 per run
- **Messages published**: 50-150 per run
- **Success rate**: 95%+ dengan retry mechanism
