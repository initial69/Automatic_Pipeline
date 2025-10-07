#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Analyze Duplicates Script
 * 
 * This script analyzes the current deduplication tracker to identify
 * potential duplicate content and provides insights.
 */

const dedupFile = path.join('data', 'deduplication_tracker.json');

function analyzeDuplicates() {
  console.log('🔍 Analyzing Duplicate Content...');
  console.log('==================================');
  
  if (!existsSync(dedupFile)) {
    console.log('❌ No deduplication tracker found. Run the pipeline first.');
    return;
  }
  
  try {
    const tracker = JSON.parse(readFileSync(dedupFile, 'utf8'));
    
    console.log(`📊 Deduplication Tracker Analysis`);
    console.log(`📅 Last Updated: ${tracker.lastUpdated}`);
    console.log(`🔄 Reset Reason: ${tracker.resetReason || 'N/A'}`);
    console.log(`🔄 Reset Timestamp: ${tracker.resetTimestamp || 'N/A'}`);
    
    // Analyze published items
    const publishedItems = tracker.published || {};
    const publishedCount = Object.keys(publishedItems).length;
    
    console.log(`\n📤 Published Items: ${publishedCount}`);
    
    if (publishedCount > 0) {
      // Group by source
      const sourceGroups = {};
      const urlSet = new Set();
      const duplicateUrls = [];
      
      for (const [key, item] of Object.entries(publishedItems)) {
        const source = item.source || 'Unknown';
        if (!sourceGroups[source]) {
          sourceGroups[source] = [];
        }
        sourceGroups[source].push(item);
        
        // Check for duplicate URLs
        if (item.link) {
          const cleanUrl = item.link.split('?')[0].split('#')[0].toLowerCase();
          if (urlSet.has(cleanUrl)) {
            duplicateUrls.push({
              url: cleanUrl,
              original: item,
              key: key
            });
          } else {
            urlSet.add(cleanUrl);
          }
        }
      }
      
      console.log(`\n📊 Sources with most content:`);
      const sortedSources = Object.entries(sourceGroups)
        .sort(([,a], [,b]) => b.length - a.length)
        .slice(0, 10);
      
      sortedSources.forEach(([source, items]) => {
        console.log(`   ${source}: ${items.length} items`);
      });
      
      // Check for duplicate URLs
      if (duplicateUrls.length > 0) {
        console.log(`\n🚨 DUPLICATE URLs FOUND: ${duplicateUrls.length}`);
        console.log('=====================================');
        duplicateUrls.forEach((dup, index) => {
          console.log(`${index + 1}. URL: ${dup.url}`);
          console.log(`   Source: ${dup.original.source}`);
          console.log(`   Title: ${dup.original.title}`);
          console.log(`   Timestamp: ${dup.original.timestamp}`);
          console.log('');
        });
      } else {
        console.log(`\n✅ No duplicate URLs found in published items`);
      }
      
      // Check for recent activity
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      let recentCount = 0;
      let dailyCount = 0;
      
      for (const item of Object.values(publishedItems)) {
        if (item.timestamp) {
          const itemTime = new Date(item.timestamp);
          if (itemTime > oneHourAgo) recentCount++;
          if (itemTime > oneDayAgo) dailyCount++;
        }
      }
      
      console.log(`\n⏰ Recent Activity:`);
      console.log(`   Last hour: ${recentCount} items`);
      console.log(`   Last 24 hours: ${dailyCount} items`);
    }
    
    // Analyze content hashes
    const contentHashes = tracker.content_hashes || {};
    const contentHashesCount = Object.keys(contentHashes).length;
    
    console.log(`\n🔤 Content Hashes: ${contentHashesCount}`);
    
    // Analyze title hashes
    const titleHashes = tracker.title_hashes || {};
    const titleHashesCount = Object.keys(titleHashes).length;
    
    console.log(`\n📝 Title Hashes: ${titleHashesCount}`);
    
    // Analyze source frequency
    const sourceHashes = tracker.source_hashes || {};
    const sourceCount = Object.keys(sourceHashes).length;
    
    console.log(`\n📡 Source Frequency Tracking: ${sourceCount} sources`);
    
    if (sourceCount > 0) {
      console.log(`\n📊 Source Activity (last 24h):`);
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      for (const [source, timestamps] of Object.entries(sourceHashes)) {
        const recentTimestamps = timestamps.filter(ts => new Date(ts) > oneDayAgo);
        if (recentTimestamps.length > 0) {
          console.log(`   ${source}: ${recentTimestamps.length} posts in last 24h`);
        }
      }
    }
    
    // Recommendations
    console.log(`\n💡 Recommendations:`);
    console.log('==================');
    
    if (duplicateUrls.length > 0) {
      console.log(`🚨 CRITICAL: Found ${duplicateUrls.length} duplicate URLs`);
      console.log(`   - Run: node reset_deduplication.mjs`);
      console.log(`   - This will clear the tracker and prevent future duplicates`);
    }
    
    if (publishedCount > 1000) {
      console.log(`⚠️  Large tracker size (${publishedCount} items)`);
      console.log(`   - Consider periodic cleanup of old entries`);
    }
    
    if (recentCount > 50) {
      console.log(`⚠️  High recent activity (${recentCount} items in last hour)`);
      console.log(`   - Consider reducing pipeline frequency`);
    }
    
    console.log(`✅ Analysis completed successfully`);
    
  } catch (error) {
    console.error(`❌ Error analyzing tracker: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] && process.argv[1].endsWith('analyze_duplicates.mjs')) {
  analyzeDuplicates();
}

export { analyzeDuplicates };
