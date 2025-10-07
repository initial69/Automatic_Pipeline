#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Reset Deduplication Tracker
 * 
 * This script resets the deduplication tracker to start fresh.
 * Use this when you want to clear all previous deduplication data.
 */

const dedupFile = path.join('data', 'deduplication_tracker.json');

function resetDeduplicationTracker() {
  console.log('🔄 Resetting Deduplication Tracker...');
  console.log('=====================================');
  
  // Create fresh tracker structure
  const freshTracker = {
    published: {},
    content_hashes: {},
    title_hashes: {},
    source_hashes: {},
    lastUpdated: new Date().toISOString(),
    resetReason: 'Manual reset to prevent duplicate content',
    resetTimestamp: new Date().toISOString()
  };
  
  // Backup existing tracker if it exists
  if (existsSync(dedupFile)) {
    const backupFile = path.join('data', `deduplication_tracker_backup_${new Date().toISOString().slice(0, 10)}.json`);
    try {
      const existingTracker = readFileSync(dedupFile, 'utf8');
      writeFileSync(backupFile, existingTracker);
      console.log(`✅ Existing tracker backed up to: ${backupFile}`);
      
      // Show stats of old tracker
      const oldData = JSON.parse(existingTracker);
      const publishedCount = Object.keys(oldData.published || {}).length;
      const contentHashesCount = Object.keys(oldData.content_hashes || {}).length;
      const titleHashesCount = Object.keys(oldData.title_hashes || {}).length;
      const sourceCount = Object.keys(oldData.source_hashes || {}).length;
      
      console.log(`📊 Old tracker stats:`);
      console.log(`   - Published items: ${publishedCount}`);
      console.log(`   - Content hashes: ${contentHashesCount}`);
      console.log(`   - Title hashes: ${titleHashesCount}`);
      console.log(`   - Source entries: ${sourceCount}`);
      
    } catch (error) {
      console.error(`❌ Error backing up existing tracker: ${error.message}`);
    }
  }
  
  // Write fresh tracker
  try {
    writeFileSync(dedupFile, JSON.stringify(freshTracker, null, 2));
    console.log(`✅ Fresh deduplication tracker created: ${dedupFile}`);
    console.log(`📅 Reset timestamp: ${freshTracker.resetTimestamp}`);
    console.log(`💡 Reason: ${freshTracker.resetReason}`);
    
    console.log('\n🎉 Deduplication tracker reset completed!');
    console.log('=====================================');
    console.log('📝 Next pipeline run will start with fresh deduplication data');
    console.log('⚠️  This will allow previously processed content to be analyzed again');
    console.log('🔒 New deduplication will prevent future duplicates');
    
  } catch (error) {
    console.error(`❌ Error creating fresh tracker: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] && process.argv[1].endsWith('reset_deduplication.mjs')) {
  resetDeduplicationTracker();
}

export { resetDeduplicationTracker };
