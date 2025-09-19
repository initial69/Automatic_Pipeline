#!/usr/bin/env node

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { cutoffMs24h, localISO } from '../utils/time_window.mjs';
import { CollectionTracker } from '../utils/collection_tracker.mjs';

// Import semua collector
import { collectGitHubSignals } from '../sources/Github_Source.mjs';
import { readTelegramMessages } from '../sources/telegram_simple.mjs';
import { collectRssEnhanced } from '../sources/collect_rss_enhanced.mjs';

// Konfigurasi
const CUTOFF_24H = cutoffMs24h();
const TODAY_DIR = path.join("data", new Date().toISOString().slice(0,10));
const TIMESTAMP = new Date().toISOString();

// Buat direktori jika belum ada
if (!existsSync(TODAY_DIR)) {
  mkdirSync(TODAY_DIR, { recursive: true });
}

// Utility untuk merge dan dedupe data dengan deteksi duplicate yang lebih baik
function mergeAndDedupe(allSignals) {
  const combined = [];
  const seen = new Set();
  const duplicates = [];
  
  console.log('\n🔍 Detecting duplicates...');
  
  for (const signals of allSignals) {
    for (const signal of signals) {
      // Multiple keys untuk deteksi duplicate yang lebih baik
      const url = signal.url || signal.link || '';
      const title = signal.title || signal.judul || '';
      const source = signal.source || signal.repo || 'Unknown';
      
      // Create multiple keys for better duplicate detection
      const keys = [
        url, // Exact URL match
        title.toLowerCase().trim(), // Title match
        `${source}:${title.toLowerCase().trim()}`, // Source + title match
        url.split('?')[0], // URL without parameters
        title.toLowerCase().replace(/[^\w\s]/g, '').trim() // Clean title
      ].filter(key => key && key.length > 0);
      
      // Check if any key already exists
      let isDuplicate = false;
      let duplicateKey = '';
      for (const key of keys) {
        if (seen.has(key)) {
          isDuplicate = true;
          duplicateKey = key;
          break;
        }
      }
      
      if (isDuplicate) {
        duplicates.push({
          signal: signal,
          duplicateKey: duplicateKey,
          reason: 'Duplicate detected'
        });
        console.log(`⚠️  Duplicate found: ${title.substring(0, 50)}... (Key: ${duplicateKey})`);
        continue;
      }
      
      // Add all keys to seen set
      keys.forEach(key => seen.add(key));
      
      // Normalize ke format yang konsisten
      const normalized = {
        source: source,
        title: title,
        link: url,
        time: signal.time || localISO(new Date()),
        messageId: signal.messageId || signal.id || '',
        channel: signal.channel || 'unknown',
        category: signal.category || 'general',
        priority: signal.priority || 1,
        originalSignal: signal // Keep original for reference
      };
      
      combined.push(normalized);
    }
  }
  
  console.log(`📊 Deduplication results:`);
  console.log(`   ✅ Unique signals: ${combined.length}`);
  console.log(`   ⚠️  Duplicates removed: ${duplicates.length}`);
  console.log(`   📈 Total processed: ${combined.length + duplicates.length}`);
  
  return combined;
}

// Filter signals dalam 24 jam terakhir
function filter24Hours(signals) {
  return signals.filter(signal => {
    const signalTime = new Date(signal.time);
    return signalTime >= CUTOFF_24H;
  });
}

// Calculate priority berdasarkan keywords dan source
function calculatePriority(signal) {
  let priority = 1;
  
  // Boost priority berdasarkan source
  if (signal.channel === 'github') priority += 2;
  if (signal.channel === 'telegram') priority += 1;
  if (signal.channel === 'rss') priority += 1;
  
  // Boost priority berdasarkan category
  if (signal.category === 'core-L1') priority += 3;
  if (signal.category === 'L2') priority += 2;
  if (signal.category === 'DeFi') priority += 2;
  if (signal.category === 'NFT') priority += 1;
  
  return priority;
}

// Sort signals by priority
function sortSignals(signals) {
  return signals.sort((a, b) => {
    // First by priority (higher first)
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    // Then by time (newer first)
    return new Date(b.time) - new Date(a.time);
  });
}

// Generate summary report
function generateSummary(allSignals, errors) {
  const summary = {
    timestamp: TIMESTAMP,
    total_signals: allSignals.length,
    error_count: errors.length,
    sources: {
      github: allSignals.filter(s => s.channel === 'github').length,
      medium: allSignals.filter(s => s.channel === 'medium').length,
      telegram: allSignals.filter(s => s.channel === 'telegram').length,
      rss: allSignals.filter(s => s.channel === 'rss').length
    },
    categories: {},
    top_sources: {},
    errors: errors
  };
  
  // Count by category
  allSignals.forEach(signal => {
    summary.categories[signal.category] = (summary.categories[signal.category] || 0) + 1;
    summary.top_sources[signal.source] = (summary.top_sources[signal.source] || 0) + 1;
  });
  
  return summary;
}

// Main collection function - PHASE 1 ONLY with incremental tracking
async function collectData() {
  console.log('🚀 Phase 1: Data Collection Starting (Incremental)...');
  console.log('===================================================');
  
  // Initialize collection tracker
  const tracker = new CollectionTracker();
  const stats = tracker.getStats();
  console.log(`📊 Collection Tracker: ${stats.today} today, ${stats.global} global tracked`);
  
  const allSignals = [];
  const allNewSignals = [];
  const allSkippedSignals = [];
  const allErrors = [];
  
  // 1. Collect GitHub signals
  console.log('\n📊 1. Collecting GitHub signals...');
  try {
    const githubResults = await collectGitHubSignals();
    if (githubResults.signals) {
      const { newSignals: newGithub, skippedSignals: skippedGithub } = tracker.filterNewSignals(githubResults.signals);
      allSignals.push(githubResults.signals);
      allNewSignals.push(newGithub);
      allSkippedSignals.push(skippedGithub);
      console.log(`✅ GitHub: ${newGithub.length} new, ${skippedGithub.length} skipped (${githubResults.signals.length} total)`);
    }
    if (githubResults.errors) {
      allErrors.push(...githubResults.errors);
    }
  } catch (error) {
    allErrors.push({ source: 'github', error: error.message });
    console.error(`❌ GitHub collection failed: ${error.message}`);
  }
  
  // 2. Medium signals disabled (always 0 results)
  console.log('📰 2. Medium signals: Skipped (always 0 results)');
  
  // 3. Collect Telegram signals
  console.log('\n📱 3. Collecting Telegram signals...');
  try {
    const telegramResults = await readTelegramMessages();
    let telegramSignals = [];
    if (Array.isArray(telegramResults)) {
      telegramSignals = telegramResults;
    } else if (telegramResults && telegramResults.signals) {
      telegramSignals = telegramResults.signals;
    }
    
    if (telegramSignals.length > 0) {
      const { newSignals: newTelegram, skippedSignals: skippedTelegram } = tracker.filterNewSignals(telegramSignals);
      allSignals.push(telegramSignals);
      allNewSignals.push(newTelegram);
      allSkippedSignals.push(skippedTelegram);
      console.log(`✅ Telegram: ${newTelegram.length} new, ${skippedTelegram.length} skipped (${telegramSignals.length} total)`);
    } else {
      console.log(`✅ Telegram: 0 signals collected`);
    }
  } catch (error) {
    allErrors.push({ source: 'telegram', error: error.message });
    console.error(`❌ Telegram collection failed: ${error.message}`);
  }
  
  // 4. Collect RSS signals
  console.log('\n📡 4. Collecting RSS signals...');
  try {
    const rssResults = await collectRssEnhanced();
    let rssSignals = [];
    if (Array.isArray(rssResults)) {
      rssSignals = rssResults;
    } else if (rssResults && rssResults.signals) {
      rssSignals = rssResults.signals;
    }
    
    if (rssSignals.length > 0) {
      const { newSignals: newRss, skippedSignals: skippedRss } = tracker.filterNewSignals(rssSignals);
      allSignals.push(rssSignals);
      allNewSignals.push(newRss);
      allSkippedSignals.push(skippedRss);
      console.log(`✅ RSS: ${newRss.length} new, ${skippedRss.length} skipped (${rssSignals.length} total)`);
    } else {
      console.log(`✅ RSS: 0 signals collected`);
    }
  } catch (error) {
    allErrors.push({ source: 'rss', error: error.message });
    console.error(`❌ RSS collection failed: ${error.message}`);
  }
  
  // 5. Process and merge only NEW signals
  console.log('\n🔄 5. Processing and merging NEW signals...');
  const mergedNewSignals = mergeAndDedupe(allNewSignals);
  const filteredNewSignals = filter24Hours(mergedNewSignals);
  
  // Load existing signals from today (if any)
  let existingSignals = [];
  const existingFile = path.join(TODAY_DIR, 'daily_signals.json');
  if (existsSync(existingFile)) {
    try {
      const existingData = JSON.parse(readFileSync(existingFile, 'utf8'));
      existingSignals = existingData.signals || [];
      console.log(`📂 Loaded ${existingSignals.length} existing signals from today`);
    } catch (error) {
      console.log('⚠️  Could not load existing signals, starting fresh');
    }
  }
  
  // Combine existing + new signals
  const allTodaySignals = [...existingSignals, ...filteredNewSignals];
  const finalSignals = mergeAndDedupe([allTodaySignals]);
  
  // Calculate priorities for final signals
  finalSignals.forEach(signal => {
    signal.priority = calculatePriority(signal);
  });
  
  // Sort by priority
  const sortedSignals = sortSignals(finalSignals);
  
  // 6. Generate summary with incremental stats
  const summary = generateSummary(sortedSignals, allErrors);
  summary.incremental = {
    new_signals: filteredNewSignals.length,
    existing_signals: existingSignals.length,
    skipped_signals: allSkippedSignals.flat().length,
    sources: {
      github: { new: allNewSignals[0]?.length || 0, skipped: allSkippedSignals[0]?.length || 0 },
      telegram: { new: allNewSignals[1]?.length || 0, skipped: allSkippedSignals[1]?.length || 0 },
      rss: { new: allNewSignals[2]?.length || 0, skipped: allSkippedSignals[2]?.length || 0 }
    }
  };
  
  // 7. Save results
  console.log('\n💾 6. Saving results...');
  const jsonFile = path.join(TODAY_DIR, 'daily_signals.json');
  const jsonOutput = {
    timestamp: TIMESTAMP,
    summary: summary,
    signals: sortedSignals
  };
  writeFileSync(jsonFile, JSON.stringify(jsonOutput, null, 2));
  
  // Save JSONL for easy processing
  const jsonlFile = path.join(TODAY_DIR, 'daily_signals.jsonl');
  const jsonlContent = sortedSignals.map(signal => JSON.stringify(signal)).join('\n');
  writeFileSync(jsonlFile, jsonlContent);
  
  // Save summary only
  const summaryFile = path.join(TODAY_DIR, 'daily_summary.json');
  writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
  
  // 8. Finalize tracker
  tracker.finalize();
  
  // 9. Display summary stats
  console.log('\n📊 Phase 1 Complete!');
  console.log('===================');
  console.log(`📊 Total Signals Today: ${summary.total_signals}`);
  console.log(`🆕 New Signals This Run: ${summary.incremental.new_signals}`);
  console.log(`📂 Existing Signals: ${summary.incremental.existing_signals}`);
  console.log(`⏭️  Skipped Signals: ${summary.incremental.skipped_signals}`);
  console.log(`📡 Sources (new/skipped):`);
  Object.entries(summary.incremental.sources).forEach(([source, stats]) => {
    console.log(`   - ${source}: ${stats.new} new, ${stats.skipped} skipped`);
  });
  console.log(`📁 Data saved to: ${TODAY_DIR}/`);
  
  return {
    signals: sortedSignals,
    newSignals: filteredNewSignals,
    existingSignals: existingSignals.length,
    summary: summary,
    errors: allErrors
  };
}

// Run if called directly
if (process.argv[1] && process.argv[1].endsWith('collect_data.mjs')) {
  collectData()
    .then(results => {
      console.log(`✅ Phase 1 complete: ${results.signals.length} signals collected`);
      process.exit(0);
    })
    .catch(error => {
      console.error(`❌ Phase 1 failed: ${error.message}`);
      process.exit(1);
    });
}

export { collectData };
