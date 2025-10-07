# 🚫 Panduan Pencegahan Duplikasi Konten

## 🔍 Masalah yang Ditemukan

Setelah menganalisis sistem pipeline selama 48 jam, ditemukan beberapa masalah utama yang menyebabkan duplikasi konten di Telegram group:

### 1. **Sistem Deduplikasi Tidak Efektif**
- File `deduplication_tracker.json` mencatat konten yang sudah dipublikasikan
- Namun, sistem hanya menandai konten sebagai "published" **setelah** berhasil mengirim
- Tidak ada mekanisme untuk mencegah analisis ulang konten yang sama

### 2. **Multiple Pipeline Execution**
- Pipeline berjalan setiap beberapa jam di GitHub Actions
- Setiap kali pipeline berjalan, sistem menganalisis ulang konten yang sama
- Tidak ada persistensi URL yang sudah diproses antar run

### 3. **Inconsistent Tracking**
- `analysis_tracker.json` menunjukkan banyak entri dengan `analysisResult: null`
- `collection_tracker.json` memiliki banyak duplikasi dengan format key yang berbeda

## 🛠️ Solusi yang Diimplementasikan

### 1. **Enhanced URL-based Deduplication**
```javascript
// Method baru untuk mengecek URL yang sudah diproses
checkURLAlreadyProcessed(url) {
  // Clean URL untuk perbandingan
  const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
  
  // Cek di published items dan content hashes
  // Mencegah analisis ulang URL yang sama
}
```

### 2. **Pre-processing Marking**
```javascript
// Tandai konten sebagai "processed" SEBELUM mengirim
deduplication.markAsProcessed(signalForTracking);

// Kirim ke Telegram
const result = await sendToTelegramBot(message, botConfig);

// Tandai sebagai "published" setelah berhasil
if (result.success) {
  deduplication.markAsPublished(signalForTracking);
}
```

### 3. **Stricter Deduplication Parameters**
```javascript
const dedupOptions = {
  contentSimilarityThreshold: 0.6, // Lebih ketat - 60% similarity
  titleSimilarityThreshold: 0.7,   // Lebih ketat - 70% similarity
  maxSourcePerHour: 1,             // Lebih ketat - 1 per jam
  maxSignalsPerRun: 20,            // Lebih ketat - 20 per run
  checkURLProcessed: true,         // Enable URL-based deduplication
  checkAlreadyPublished: true,     // Enable published check
  checkContent: true,              // Enable content similarity
  checkTitle: true,                // Enable title similarity
  checkSource: true                // Enable source frequency
};
```

### 4. **New Utility Scripts**

#### `reset_deduplication.mjs`
```bash
node reset_deduplication.mjs
```
- Reset tracker deduplikasi untuk memulai fresh
- Backup tracker lama sebelum reset
- Menampilkan statistik tracker lama

#### `analyze_duplicates.mjs`
```bash
node analyze_duplicates.mjs
```
- Analisis tracker deduplikasi saat ini
- Identifikasi URL duplikat
- Rekomendasi untuk optimasi

## 📋 Langkah-langkah Implementasi

### 1. **Reset Tracker (WAJIB)**
```bash
# Jalankan script reset untuk membersihkan data lama
node reset_deduplication.mjs
```

### 2. **Analisis Duplikasi**
```bash
# Analisis duplikasi yang ada
node analyze_duplicates.mjs
```

### 3. **Jalankan Pipeline**
```bash
# Pipeline sekarang akan menggunakan deduplikasi yang lebih ketat
node complete_phase.mjs
```

## 🔧 Konfigurasi GitHub Actions

Pastikan GitHub Actions menggunakan konfigurasi yang tepat:

```yaml
# .github/workflows/pipeline.yml
name: Crypto Pipeline
on:
  schedule:
    - cron: '0 */6 * * *'  # Setiap 6 jam, bukan setiap jam
  workflow_dispatch:

jobs:
  run-pipeline:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm install
      - name: Run pipeline
        run: node complete_phase.mjs
        env:
          TG_TOKEN: ${{ secrets.TG_TOKEN }}
          TELEGRAM_CHANNEL_ID: ${{ secrets.TELEGRAM_CHANNEL_ID }}
          # ... other env vars
```

## 📊 Monitoring & Maintenance

### 1. **Daily Monitoring**
```bash
# Jalankan setiap hari untuk monitoring
node analyze_duplicates.mjs
```

### 2. **Weekly Reset (Opsional)**
```bash
# Reset tracker setiap minggu untuk cleanup
node reset_deduplication.mjs
```

### 3. **Log Analysis**
- Monitor log GitHub Actions untuk error
- Periksa file `failed_telegram_messages.json` untuk pesan yang gagal
- Analisis `deduplication_tracker.json` untuk statistik

## 🚨 Troubleshooting

### Jika Masih Ada Duplikasi:

1. **Reset Tracker**
   ```bash
   node reset_deduplication.mjs
   ```

2. **Analisis Masalah**
   ```bash
   node analyze_duplicates.mjs
   ```

3. **Periksa Log**
   - Lihat log GitHub Actions
   - Periksa file tracker di folder `data/`

4. **Adjust Parameters**
   - Kurangi `maxSourcePerHour` jika masih terlalu banyak
   - Tingkatkan `contentSimilarityThreshold` untuk lebih ketat
   - Kurangi `maxSignalsPerRun` untuk membatasi output

### Jika Pipeline Gagal:

1. **Periksa Environment Variables**
   - Pastikan `TG_TOKEN` dan `TELEGRAM_CHANNEL_ID` benar
   - Periksa koneksi internet

2. **Reset dan Coba Lagi**
   ```bash
   node reset_deduplication.mjs
   node complete_phase.mjs
   ```

## 📈 Expected Results

Setelah implementasi:

- ✅ **Tidak ada duplikasi konten** di Telegram group
- ✅ **Konten unik** setiap kali pipeline berjalan
- ✅ **Tracking yang akurat** untuk konten yang sudah diproses
- ✅ **Monitoring yang mudah** dengan script analisis
- ✅ **Recovery yang cepat** dengan script reset

## 🔄 Maintenance Schedule

- **Daily**: Monitor dengan `analyze_duplicates.mjs`
- **Weekly**: Optional reset dengan `reset_deduplication.mjs`
- **Monthly**: Review dan adjust parameters jika perlu

---

**Catatan**: Solusi ini dirancang untuk mencegah duplikasi konten secara menyeluruh. Jika masih ada masalah, silakan jalankan script analisis dan reset sesuai kebutuhan.
