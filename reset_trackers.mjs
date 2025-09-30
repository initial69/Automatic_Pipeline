#!/usr/bin/env node

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';

console.log('🔄 Resetting all trackers for fresh start...\n');

// Create data directory if it doesn't exist
if (!existsSync('data')) {
  mkdirSync('data');
}

// Reset Analysis Tracker
const analysisTracker = {
  analyzed: {},
  lastUpdated: new Date().toISOString()
};

// Reset Collection Tracker  
const collectionTracker = {
  collected: {},
  lastUpdated: new Date().toISOString()
};

// Reset Deduplication Tracker
const deduplicationTracker = {
  published: {},
  contentHashes: {},
  titleHashes: {},
  lastUpdated: new Date().toISOString()
};

// Write reset trackers
writeFileSync('data/analysis_tracker.json', JSON.stringify(analysisTracker, null, 2));
writeFileSync('data/collection_tracker.json', JSON.stringify(collectionTracker, null, 2));
writeFileSync('data/deduplication_tracker.json', JSON.stringify(deduplicationTracker, null, 2));

console.log('✅ Analysis Tracker reset');
console.log('✅ Collection Tracker reset'); 
console.log('✅ Deduplication Tracker reset');
console.log('\n🎉 All trackers reset successfully!');
console.log('📊 Next run will analyze ALL signals from scratch');
console.log('\n💡 Usage:');
console.log('   - Run this script manually when you want fresh analysis');
console.log('   - GitHub Actions will use incremental mode by default');
console.log('   - This saves API quota and runs faster');
