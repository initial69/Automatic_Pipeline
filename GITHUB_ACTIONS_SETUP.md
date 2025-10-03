# GitHub Actions Setup untuk Crypto Early Detection Pipeline

## Overview
Pipeline ini akan berjalan otomatis setiap 2 jam untuk mengumpulkan, menganalisis, dan mempublikasikan sinyal crypto early detection ke Telegram.

## Required Secrets

Anda perlu mengatur secrets berikut di GitHub repository settings:

### 1. Telegram Bot Configuration
```
TG_TOKEN=your_telegram_bot_token
TELEGRAM_CHANNEL_ID=@your_channel_username_or_chat_id
```

### 2. Telegram Client (untuk membaca channel)
```
API_ID=your_telegram_api_id
API_HASH=your_telegram_api_hash
TELEGRAM_SESSION=your_telegram_session_string
```

### 3. Gemini API Keys (Multi-key support)
```
GEMINI_API_KEY1=your_gemini_api_key_1
GEMINI_API_KEY2=your_gemini_api_key_2
GEMINI_API_KEY3=your_gemini_api_key_3
GEMINI_API_KEY4=your_gemini_api_key_4
GEMINI_API_KEY5=your_gemini_api_key_5
GEMINI_API_KEY6=your_gemini_api_key_6
```

### 4. Optional APIs
```
OPENAI_API_KEY=your_openai_api_key
GITHUB_TOKEN=your_github_token
```

## Cara Setup Secrets

1. Buka repository GitHub Anda
2. Klik **Settings** → **Secrets and variables** → **Actions**
3. Klik **New repository secret**
4. Masukkan nama secret dan value-nya
5. Klik **Add secret**

## Workflow Features

### Automatic Scheduling
- **Schedule**: Setiap 2 jam (cron: `0 */2 * * *`)
- **Timezone**: Europe/Zurich
- **Manual Trigger**: Tersedia dengan opsi reset trackers

### Error Handling
- ✅ Timeout protection (60 menit)
- ✅ File verification sebelum menjalankan
- ✅ Error logging dan reporting
- ✅ Artifact upload untuk debugging

### Deduplication
- ✅ Advanced content similarity detection
- ✅ Title similarity checking
- ✅ Source frequency limiting
- ✅ Already published tracking

## Manual Trigger

Anda bisa menjalankan workflow secara manual:

1. Buka tab **Actions** di repository
2. Pilih workflow **Crypto Early Detection Pipeline**
3. Klik **Run workflow**
4. Pilih branch dan opsi:
   - **Reset trackers**: Centang untuk analisis fresh (kosongkan semua tracker)

## Monitoring

### Logs
- Semua output tersedia di Actions tab
- Error logs otomatis di-upload sebagai artifacts
- Failed messages tersimpan di `data/YYYY-MM-DD/failed_telegram_messages.json`

### Artifacts
- Data harian di-upload sebagai artifacts
- Tersedia untuk download selama 90 hari
- Berisi semua file data pipeline

## Troubleshooting

### Common Issues

1. **"Cannot read properties of undefined"**
   - ✅ **FIXED**: Deduplication tracker sekarang menggunakan property names yang benar
   - ✅ **FIXED**: Defensive programming untuk handle missing properties

2. **Telegram API Errors**
   - Periksa `TG_TOKEN` dan `TELEGRAM_CHANNEL_ID`
   - Pastikan bot sudah ditambahkan ke channel sebagai admin

3. **Gemini API Rate Limits**
   - Pipeline menggunakan multi-key manager
   - Otomatis switch ke key berikutnya jika rate limit

4. **Missing Dependencies**
   - ✅ **FIXED**: `jq` diinstall otomatis
   - ✅ **FIXED**: File permissions di-set otomatis

### Debug Steps

1. Cek logs di Actions tab
2. Download artifacts untuk melihat data
3. Periksa failed messages file
4. Verifikasi secrets configuration

## Recent Updates

### v2.1 - Fixed Deduplication Issues
- ✅ Fixed property name mismatch (`contentHashes` → `content_hashes`)
- ✅ Added missing `source_hashes` property
- ✅ Added defensive programming untuk handle undefined properties
- ✅ Improved error handling dan logging
- ✅ Added file verification step
- ✅ Added timeout protection

## Support

Jika ada masalah:
1. Cek logs di GitHub Actions
2. Periksa secrets configuration
3. Test manual trigger dengan reset trackers
4. Download artifacts untuk debugging
