#!/usr/bin/env node
import Parser from "rss-parser";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import https from "https";
import fetch from "node-fetch";
import { cutoffMs24h, localISO, parseDateFlexible, isWithin } from "../utils/time_window.mjs";

// Header anti-403 untuk menghindari blocking
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
  'Accept': 'application/rss+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.8'
};

// HTTPS agent yang mengabaikan SSL certificate issues
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

const parser = new Parser({
  timeout: 15000, // Timeout 15 detik (dikurangi)
  headers: DEFAULT_HEADERS
});

const cutoff = cutoffMs24h();
const todayDir = path.join("data", new Date().toISOString().slice(0,10));
if (!existsSync(todayDir)) mkdirSync(todayDir, { recursive: true });

function pickTime(item) {
  return parseDateFlexible(item.isoDate || item.pubDate || item.published || item.updated);
}

// Sanitize XML untuk mengatasi karakter & yang tidak valid
function sanitizeXml(str) {
  // escape ampersand yang bukan entitas valid
  return str.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#[0-9]+;|#x[0-9a-fA-F]+;)/g, '&amp;');
}

// Google News RSS proxy untuk situs yang tidak punya RSS
function makeGNewsSiteFeed(site, keywords = '') {
  const query = keywords ? `${keywords} site:${site}` : `site:${site}`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

// Retry mechanism dengan exponential backoff dan XML sanitization
async function fetchWithRetry(url, maxRetries = 2, timeout = 15000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`    🔄 Attempt ${attempt}/${maxRetries} for ${url.substring(0, 50)}...`);
      
      // Untuk feed yang bermasalah dengan XML, fetch manual dulu
      if (url.includes('polygon.technology') || url.includes('bitcoinmagazine')) {
        const response = await fetch(url, {
          headers: DEFAULT_HEADERS,
          agent: httpsAgent,
          timeout: timeout
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        let xml = await response.text();
        xml = sanitizeXml(xml);
        
        // Parse XML yang sudah disanitasi
        return await parser.parseString(xml);
      }
      
      return await parser.parseURL(url);
    } catch (error) {
      console.log(`    ⚠️ Attempt ${attempt} failed: ${error.message.substring(0, 100)}...`);
      
      if (attempt === maxRetries) {
        console.log(`    ❌ All attempts failed for ${url.substring(0, 50)}...`);
        throw error;
      }
      
      // Exponential backoff: 1s, 2s
      const delay = attempt * 1000;
      console.log(`    ⏳ Waiting ${delay/1000}s before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// HTML scraper untuk The Block
async function scrapeTheBlock() {
  try {
    const response = await fetch('https://www.theblock.co/latest', {
      headers: DEFAULT_HEADERS,
      agent: httpsAgent,
      timeout: 30000
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const html = await response.text();
    const items = [];
    
    // Simple regex untuk extract artikel (bisa diperbaiki dengan cheerio jika perlu)
    const articleRegex = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
    let match;
    let count = 0;
    
    while ((match = articleRegex.exec(html)) !== null && count < 20) {
      const link = match[1];
      const title = match[2].trim();
      
      if (link.includes('/news/') && title.length > 10) {
        items.push({
          source: "The Block",
          title: title.substring(0, 140),
          link: link.startsWith('http') ? link : `https://www.theblock.co${link}`,
          time: localISO(new Date()),
          channel: "rss",
          category: "news core"
        });
        count++;
      }
    }
    
    return items;
  } catch (error) {
    return [];
  }
}

// CMC Recently Added via API endpoint (lebih stabil)
async function scrapeCMCRecentlyAdded() {
  try {
    const url = 'https://api.coinmarketcap.com/data-api/v3/cryptocurrency/listing?start=1&limit=50&listing_status=recently_added&sort=date_added&sort_type=desc';
    
    const response = await fetch(url, {
      headers: DEFAULT_HEADERS,
      agent: httpsAgent,
      timeout: 30000
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const json = await response.json();
    const items = [];
    const nowMinus24h = cutoffMs24h(); // Use consistent cutoff from utils
    
    const tokens24h = (json.data?.cryptoCurrencyList || []).filter(x => {
      const ts = Date.parse(x.listingTime || x.dateAdded || x.firstSeen || '');
      return ts && ts >= nowMinus24h;
    });
    
    for (const token of tokens24h.slice(0, 10)) {
      items.push({
        source: "CoinMarketCap",
        title: `New Token Listed: ${token.name} (${token.symbol})`,
        link: `https://coinmarketcap.com/currencies/${(token.slug || '').toLowerCase()}/`,
        time: localISO(new Date(token.listingTime || token.dateAdded)),
        channel: "rss",
        category: "airdrops & events"
      });
    }
    
    return items;
  } catch (error) {
    return [];
  }
}

// Filter CoinTelegraph berdasarkan kategori
function filterCoinTelegraph(items) {
  return items.filter(item => {
    const title = (item.title || '').toLowerCase();
    const content = (item.contentSnippet || '').toLowerCase();
    const text = `${title} ${content}`;
    
    // Filter untuk topik yang relevan
    return /bitcoin|ethereum|defi|nft|dao|governance|airdrop|testnet|mainnet|upgrade|fork/.test(text);
  });
}

async function fetchRssBatch(list, label) {
  let total = 0, in24h = 0, valid = 0;
  const out = [];
  const errors = [];

  console.log(`📡 Processing ${list.length} ${label} sources...`);

  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    try {
      console.log(`  🔍 [${i+1}/${list.length}] Fetching ${s.name}...`);
      
      // Timeout per source dengan Promise.race
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Source timeout')), 20000)
      );
      
      const fetchPromise = fetchWithRetry(s.url);
      const feed = await Promise.race([fetchPromise, timeoutPromise]);
      
      let items = feed.items || [];
      console.log(`  📊 ${s.name}: ${items.length} items found`);
      
      // Filter khusus untuk CoinTelegraph
      if (s.name === 'CoinTelegraph') {
        items = filterCoinTelegraph(items);
        console.log(`  🔍 ${s.name}: ${items.length} items after filtering`);
      }
      
      for (const it of items) {
        total++;
        const ts = pickTime(it);
        if (!isWithin(ts, cutoff)) continue;
        in24h++;

        const link = (it.link || "").trim();
        const title = (it.title || "").trim();

        if (!link || !title) continue;
        valid++;

        out.push({
          source: s.name,
          title: title.substring(0, 140),
          link,
          time: localISO(new Date(ts)),
          channel: "rss",
          category: label.toLowerCase()
        });
      }
      
      console.log(`  ✅ ${s.name}: ${valid} valid signals from ${items.length} items`);
    } catch (e) {
      console.error(`  ❌ ${s.name}: ${e.message.substring(0, 100)}...`);
      errors.push({ source: s.name, error: e.message });
      
      // Skip source yang bermasalah dan lanjut ke source berikutnya
      console.log(`  ⏭️ Skipping ${s.name}, continuing with next source...`);
    }
  }

  console.log(`📊 ${label} Summary: ${valid} valid, ${total} total, ${in24h} in 24h, ${errors.length} errors`);
  return out;
}

async function main() {
  console.log('🚀 Starting RSS Enhanced Collection...');
  console.log('='.repeat(60));
  
  // Overall timeout untuk seluruh proses (5 menit)
  const overallTimeout = setTimeout(() => {
    console.log('\n⏰ Overall timeout reached (5 minutes), stopping collection...');
    process.exit(0);
  }, 5 * 60 * 1000);
  
  const cfg = JSON.parse(readFileSync("config/sources_rss.json","utf8"));

  const buckets = [];
  const allErrors = [];
  
  try {
    console.log('\n📰 Processing News Core sources...');
    const startTime = Date.now();
    buckets.push(await fetchRssBatch(cfg.news_core, "News Core"));
    console.log(`⏱️ News Core completed in ${Math.round((Date.now() - startTime) / 1000)}s`);
  } catch (error) {
    console.error('❌ News Core failed:', error.message);
    allErrors.push({ category: 'news_core', error: error.message });
  }
  
  try {
    console.log('\n🎁 Processing Airdrops & Events sources...');
    buckets.push(await fetchRssBatch(cfg.airdrops_events, "Airdrops & Events"));
  } catch (error) {
    console.error('❌ Airdrops & Events failed:', error.message);
    allErrors.push({ category: 'airdrops_events', error: error.message });
  }
  
  try {
    console.log('\n🏛️ Processing Foundation & Ecosystem sources...');
    buckets.push(await fetchRssBatch(cfg.foundation_ecosystem, "Foundation & Ecosystem"));
  } catch (error) {
    console.error('❌ Foundation & Ecosystem failed:', error.message);
    allErrors.push({ category: 'foundation_ecosystem', error: error.message });
  }
  
  try {
    console.log('\n🗳️ Processing Governance Forums sources...');
    buckets.push(await fetchRssBatch(cfg.governance_forums, "Governance Forums"));
  } catch (error) {
    console.error('❌ Governance Forums failed:', error.message);
    allErrors.push({ category: 'governance_forums', error: error.message });
  }

  // Tambahkan HTML scrapers
  try {
    console.log('\n🔍 Scraping The Block...');
    const theBlockResults = await scrapeTheBlock();
    buckets.push(theBlockResults);
    console.log(`✅ The Block: ${theBlockResults.length} signals`);
  } catch (error) {
    console.error('❌ The Block scraping failed:', error.message);
    allErrors.push({ category: 'the_block', error: error.message });
  }
  
  try {
    console.log('\n📊 Scraping CMC Recently Added...');
    const cmcResults = await scrapeCMCRecentlyAdded();
    buckets.push(cmcResults);
    console.log(`✅ CMC Recently Added: ${cmcResults.length} signals`);
  } catch (error) {
    console.error('❌ CMC scraping failed:', error.message);
    allErrors.push({ category: 'cmc', error: error.message });
  }

  // gabung + dedupe by link
  console.log('\n🔄 Merging and deduplicating signals...');
  const combined = [];
  const seen = new Set();
  for (const arr of buckets) {
    for (const x of arr) {
      if (seen.has(x.link)) continue;
      seen.add(x.link);
      combined.push(x);
    }
  }

  const outPath = path.join(todayDir, "rss_enhanced_24h.jsonl");
  writeFileSync(outPath, combined.map(o => JSON.stringify(o)).join("\n") + "\n", "utf8");
  
  console.log('\n📊 FINAL RESULTS:');
  console.log('='.repeat(60));
  console.log(`✅ Total signals collected: ${combined.length}`);
  console.log(`📁 Saved to: ${outPath}`);
  console.log(`❌ Errors encountered: ${allErrors.length}`);
  
  if (allErrors.length > 0) {
    console.log('\n⚠️ ERRORS:');
    allErrors.forEach(err => {
      console.log(`  - ${err.category}: ${err.error}`);
    });
  }
  
  // Clear overall timeout
  clearTimeout(overallTimeout);
  
  return combined; // Return signals data for daily_collect.mjs
}

if (process.argv[1] && process.argv[1].endsWith("collect_rss_enhanced.mjs")) {
  main()
    .then(() => {
      console.log('\n✅ Process completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Process failed:', error.message);
      process.exit(1);
    });
}

export { main as collectRssEnhanced };
