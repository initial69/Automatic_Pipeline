# Pipeline Early Stage - Cryptocurrency Signal Analysis

## 📁 Project Structure

```
Pipeline-Early-Stage/
├── 📂 phase1/                    # Phase 1: Data Collection Only
│   └── collect_data.mjs          # Data collection script
├── 📂 phase2/                    # Phase 2: Analysis Only
│   ├── analysis_phase2.mjs       # Basic analysis (fallback)
│   └── analyze_opportunities.mjs # Main analysis script
├── 📂 phase3/                    # Phase 3: Publishing
│   └── publish_to_telegram.mjs   # Telegram publishing script
├── 📂 agents/                    # AI Agents
│   ├── analysis_gemini_phase2.mjs    # Gemini AI analysis (primary)
│   └── gemini_multi_key_manager.mjs  # Multi-key manager
├── 📂 sources/                   # Data Sources
│   ├── Github_Source.mjs         # GitHub signal collection
│   ├── telegram_simple.mjs       # Telegram signal collection
│   └── collect_rss_enhanced.mjs  # RSS signal collection
├── 📂 utils/                     # Utilities
│   ├── github_fetch.mjs          # GitHub API utilities
│   └── time_window.mjs           # Time utilities
├── 📂 config/                    # Configuration
│   ├── env.example               # Environment variables template
│   ├── sources_rss.json          # RSS sources configuration
│   └── telegram.session          # Telegram session file
├── 📂 data/                      # Generated data (auto-created)
├── daily_collect.mjs             # Full Pipeline (Phase 1 + Phase 2)
├── run_phase1.mjs                # Quick run Phase 1 only
├── run_phase2.mjs                # Quick run Phase 2 only
├── run_phase3.mjs                # Quick run Phase 3 only
├── run_full_pipeline.mjs         # Quick run Full Pipeline (Phase 1+2)
├── run_complete_pipeline.mjs     # Quick run Complete Pipeline (Phase 1+2+3)
├── keywords.mjs                  # Keywords for signal filtering
├── package.json                  # Dependencies
└── README.md                     # This file
```

## 🚀 Quick Start

### Run Phase 1 Only (Data Collection)
```bash
node run_phase1.mjs
```

### Run Phase 2 Only (Analysis)
```bash
node run_phase2.mjs
```

### Run Phase 3 Only (Publishing)
```bash
node run_phase3.mjs
```

### Run Full Pipeline (Phase 1 + Phase 2)
```bash
node run_full_pipeline.mjs
# atau
node daily_collect.mjs
```

### Run Complete Pipeline (Phase 1 + Phase 2 + Phase 3)
```bash
node run_complete_pipeline.mjs
```

## 📊 Data Flow

1. **Phase 1**: Collect signals from GitHub, Telegram, RSS
2. **Phase 2**: Analyze signals using Gemini AI (multi-key support)
3. **Phase 3**: Publish top opportunities to private Telegram channel
4. **Output**: Automated daily insights with scoring and reasoning

## 🔧 Configuration

1. Copy `config/env.example` to `.env`
2. Add your API keys:
   - `GEMINI_API_KEY1-6`: Gemini API keys (multi-key support)
   - `API_ID` & `API_HASH`: Telegram API credentials
   - `TELEGRAM_CHANNEL_ID`: Your private channel for publishing

## 📈 Features

- **Multi-Source Collection**: GitHub, Telegram, RSS
- **AI-Powered Analysis**: Gemini with multi-key support
- **Automated Publishing**: Direct to private Telegram channel
- **Rate Limit Protection**: Auto-switching between API keys
- **Fallback System**: Basic analysis if AI fails
- **Structured Output**: JSON + text summaries + Telegram messages

## 🎯 Output

- **Daily Signals**: `data/[date]/daily_signals.json`
- **Analysis Results**: `data/[date]/gemini_phase2_analysis.json`
- **Summary**: `data/[date]/gemini_phase2_summary.txt`
- **Telegram Messages**: Published to your private channel with formatted opportunities
