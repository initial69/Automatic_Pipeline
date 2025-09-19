#!/usr/bin/env node

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { ghFetchJSON, delay, checkRateLimit } from '../utils/github_fetch.mjs';
import { cutoffMs24h } from '../utils/time_window.mjs';

// Konfigurasi repo GitHub yang paling "signalful" untuk early plays
const GITHUB_SOURCES = [
  // Wave 1 — Core Ethereum & L2 frameworks (sangat berdampak)
  { "repo": "ethereum/go-ethereum", "category": "core-L1", "priority": 10 },
  { "repo": "NethermindEth/nethermind", "category": "core-L1", "priority": 9 },
  { "repo": "erigontech/erigon", "category": "core-L1", "priority": 8 },
  { "repo": "sigp/lighthouse", "category": "core-L1", "priority": 7 },
  { "repo": "prysmaticlabs/prysm", "category": "core-L1", "priority": 7 },
  { "repo": "ConsenSys/teku", "category": "core-L1", "priority": 7 },
  { "repo": "status-im/nimbus-eth2", "category": "core-L1", "priority": 7 },

  // L2 frameworks
  { "repo": "ethereum-optimism/optimism", "category": "L2", "priority": 9 },
  { "repo": "OffchainLabs/nitro", "category": "L2", "priority": 9 },
  { "repo": "matter-labs/zksync-era", "category": "L2", "priority": 9 },
  { "repo": "scroll-tech/scroll", "category": "L2", "priority": 8 },
  { "repo": "taikoxyz/taiko-mono", "category": "L2", "priority": 8 },
  { "repo": "starkware-libs/cairo", "category": "toolchain", "priority": 7 },

  // Wave 2 — L1 baru & high-velocity chains
  { "repo": "solana-labs/solana", "category": "alt-L1", "priority": 10 },
  { "repo": "aptos-labs/aptos-core", "category": "alt-L1", "priority": 9 },
  { "repo": "MystenLabs/sui", "category": "alt-L1", "priority": 9 },
  { "repo": "celestiaorg/celestia-app", "category": "modular-DA", "priority": 9 },
  { "repo": "celestiaorg/celestia-node", "category": "modular-DA", "priority": 8 },
  { "repo": "FuelLabs/fuel-core", "category": "alt-L1", "priority": 8 },
  { "repo": "category-labs/monad", "category": "alt-L1", "priority": 7 },
  { "repo": "sei-protocol/sei-chain", "category": "alt-L1", "priority": 7 },

  // Wave 3 — Restaking/DA & infra yang sering muncul di dealflow "early"
  { "repo": "Layr-Labs/eigenda", "category": "restaking/DA", "priority": 8 },
  { "repo": "Layr-Labs/eigensdk-go", "category": "restaking/DA", "priority": 6 },
];

// Keywords untuk filter sinyal testnet/mainnet
const SIGNAL_KEYWORDS = /(testnet|mainnet|devnet|incentivized|genesis|rc\b|beta|alpha|airdrop|points|migration|staking|validator|node|launch|upgrade|fork|hard|soft|eip|grant|ecosystem|fund|eligible|app|tx|claimable|claimer|bridge|deploy)/i;

// Rate limiting configuration
const RATE_LIMIT_DELAY = 1000; // 1 second between requests
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

// Check if item is from last 24 hours using consistent cutoff
function isRecent24h(iso) {
  const t = Date.parse(iso || '');
  if (Number.isNaN(t)) return true; // Don't filter out items without date (tag fallback)
  return t >= cutoffMs24h(); // Use consistent cutoff from utils
}

// Check if item looks like early signal
function looksEarlySignal(item) {
  const hay = `${item.title || ''} ${item.tag || ''}`;
  return SIGNAL_KEYWORDS.test(hay);
}

// Get signals from a single repository
async function getRepoSignals(owner, repo, category, priority) {
  const results = [];
  const repoFull = `${owner}/${repo}`;

  try {
    // 1) Releases (strongest signal for releases/testnet)
    try {
      const releases = await ghFetchJSON(`/repos/${owner}/${repo}/releases?per_page=20`);
      for (const r of releases) {
        results.push({
          type: 'release',
          repo: repoFull,
          category,
          priority,
          title: r.name || r.tag_name || '(no title)',
          tag: r.tag_name,
          draft: r.draft,
          prerelease: r.prerelease,
          url: r.html_url,
          published_at: r.published_at || r.created_at,
          body: r.body || '',
          author: r.author?.login || 'unknown',
          channel: 'github'
        });
      }
      console.log(`✅ ${repoFull}: Found ${releases.length} releases`);
    } catch (e) {
      console.warn(`⚠️ releases API fail for ${repoFull}: ${e.message}`);
    }

    // 2) If no releases at all → fallback to Tags
    if (results.length === 0) {
      try {
        const tags = await ghFetchJSON(`/repos/${owner}/${repo}/tags?per_page=20`);
        for (const t of tags) {
          results.push({
            type: 'tag',
            repo: repoFull,
            category,
            priority,
            title: t.name,
            tag: t.name,
            url: `https://github.com/${owner}/${repo}/releases/tag/${encodeURIComponent(t.name)}`,
            published_at: new Date().toISOString(), // GitHub Tags API doesn't provide date
            body: '',
            author: 'unknown',
            channel: 'github'
          });
        }
        console.log(`✅ ${repoFull}: Found ${tags.length} tags (fallback)`);
      } catch (e) {
        console.warn(`⚠️ tags API fail for ${repoFull}: ${e.message}`);
      }
    }

    // 3) Dev activity booster → Recent commits (to detect spikes)
    try {
      const commits = await ghFetchJSON(`/repos/${owner}/${repo}/commits?per_page=10`);
      for (const c of commits) {
        results.push({
          type: 'commit',
          repo: repoFull,
          category,
          priority,
          title: (c.commit && c.commit.message ? c.commit.message.split('\n')[0] : 'commit'),
          url: c.html_url,
          author: c.author?.login || c.commit?.author?.name || 'unknown',
          published_at: c.commit?.author?.date || c.commit?.committer?.date || new Date().toISOString(),
          body: c.commit?.message || '',
          tag: null,
          channel: 'github'
        });
      }
      console.log(`✅ ${repoFull}: Found ${commits.length} recent commits`);
    } catch (e) {
      console.warn(`⚠️ commits API fail for ${repoFull}: ${e.message}`);
    }

  } catch (error) {
    console.error(`❌ Error processing ${repoFull}:`, error.message);
  }

  return results;
}

// Main function untuk mengumpulkan data GitHub
async function collectGitHubSignals() {
  console.log('🚀 Mengumpulkan sinyal dari GitHub API...');
  console.log('='.repeat(60));
  
  // Check rate limit
  const rateLimit = await checkRateLimit();
  console.log(`📊 Rate limit: ${rateLimit.remaining}/${rateLimit.limit} remaining`);
  
  if (rateLimit.remaining < 10) {
    console.warn('⚠️ Low rate limit remaining, consider adding GITHUB_TOKEN');
  }
  
  const results = [];
  const errors = [];
  
  for (const source of GITHUB_SOURCES) {
    try {
      const [owner, repo] = source.repo.split('/');
      const items = await getRepoSignals(owner, repo, source.category, source.priority);
      
      // Filter items based on time and signal keywords
      const filteredItems = items.filter(item => {
        // Keep recent items or tags (which don't have dates)
        if (!isRecent24h(item.published_at) && item.type !== 'tag') {
          return false;
        }
        
        // For early signal detection, keep items that match keywords
        return looksEarlySignal(item);
      });
      
      console.log(`📈 ${source.repo}: ${filteredItems.length} signals from ${items.length} total items`);
      
      results.push(...filteredItems);
      
      // Rate limiting delay
      await delay(RATE_LIMIT_DELAY);
      
    } catch (error) {
      console.error(`❌ Error processing ${source.repo}:`, error.message);
      errors.push({
        repo: source.repo,
        error: error.message
      });
    }
  }
  
  // Sort berdasarkan priority dan waktu
  results.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority; // Higher priority first
    }
    return new Date(b.published_at) - new Date(a.published_at); // Newer first
  });
  
  console.log('\n📊 HASIL AKHIR:');
  console.log('='.repeat(60));
  console.log(`Total sinyal ditemukan: ${results.length}`);
  console.log(`Error count: ${errors.length}`);
  
  if (results.length > 0) {
    console.log('\n🔥 Sinyal terbaru:');
    results.slice(0, 15).forEach((item, i) => {
      console.log(`\n${i+1}. [${item.category}] ${item.repo} (${item.type})`);
      console.log(`   Judul: ${item.title}`);
      console.log(`   Tag: ${item.tag || 'N/A'}`);
      console.log(`   Author: ${item.author}`);
      console.log(`   Waktu: ${new Date(item.published_at).toISOString()}`);
      console.log(`   URL: ${item.url}`);
      console.log(`   Priority: ${item.priority}`);
    });
    
    if (results.length > 15) {
      console.log(`\n... dan ${results.length - 15} sinyal lainnya`);
    }
  } else {
    console.log('❌ Tidak ada sinyal yang ditemukan dalam 24 jam terakhir');
  }
  
  if (errors.length > 0) {
    console.log('\n⚠️  Errors:');
    errors.forEach(error => {
      console.log(`   - ${error.repo}: ${error.error}`);
    });
  }
  
  return {
    signals: results,
    errors,
    summary: {
      totalSignals: results.length,
      errorCount: errors.length,
      sourcesProcessed: GITHUB_SOURCES.length - errors.length,
      rateLimitRemaining: rateLimit.remaining
    }
  };
}

// Save results to file with date structure
function saveResults(results, baseDir = 'data') {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const dir = `${baseDir}/${dateStr}`;
  
  // Create directory if it doesn't exist
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  const output = {
    timestamp: now.toISOString(),
    ...results
  };
  
  // Save detailed JSON
  const jsonFile = `${dir}/github_signals.json`;
  writeFileSync(jsonFile, JSON.stringify(output, null, 2));
  
  // Save as JSONL for easy processing
  const jsonlFile = `${dir}/github_signals.jsonl`;
  const jsonlContent = results.signals.map(signal => JSON.stringify(signal)).join('\n');
  writeFileSync(jsonlFile, jsonlContent);
  
  console.log(`\n💾 Results saved to:`);
  console.log(`   - ${jsonFile}`);
  console.log(`   - ${jsonlFile}`);
}

// Quick test function
async function testSingleRepo() {
  console.log('🧪 Testing single repo...');
  try {
    const items = await getRepoSignals('ethereum', 'go-ethereum', 'core-L1', 10);
    console.log(`✅ Test successful: Found ${items.length} items`);
    if (items.length > 0) {
      console.log(`   Latest: ${items[0].title} (${items[0].type})`);
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Jalankan jika dipanggil langsung
if (process.argv[1] && process.argv[1].endsWith('Github_Source.mjs')) {
  const args = process.argv.slice(2);
  
  if (args.includes('--test')) {
    testSingleRepo().catch(console.error);
  } else {
    collectGitHubSignals()
      .then(results => {
        saveResults(results);
        console.log('\n✅ GitHub signal collection completed!');
      })
      .catch(error => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
      });
  }
}

export { collectGitHubSignals, GITHUB_SOURCES, SIGNAL_KEYWORDS, getRepoSignals };