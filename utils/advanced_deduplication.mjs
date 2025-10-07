import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export class AdvancedDeduplication {
  constructor() {
    this.today = new Date().toISOString().slice(0, 10);
    this.dedupFile = path.join('data', 'deduplication_tracker.json');
    this.tracker = this.loadTracker();
  }

  loadTracker() {
    if (existsSync(this.dedupFile)) {
      try {
        return JSON.parse(readFileSync(this.dedupFile, 'utf8'));
      } catch (error) {
        console.warn('⚠️ Could not load deduplication tracker, starting fresh');
      }
    }
    
    return {
      published: {},
      content_hashes: {},
      title_hashes: {},
      source_hashes: {},
      lastUpdated: new Date().toISOString()
    };
  }

  saveTracker() {
    this.tracker.lastUpdated = new Date().toISOString();
    writeFileSync(this.dedupFile, JSON.stringify(this.tracker, null, 2));
  }

  // Generate content hash untuk similarity detection
  generateContentHash(content) {
    if (!content) return '';
    
    // Normalize content: lowercase, remove extra spaces, remove special chars
    const normalized = content
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' ')     // Replace multiple spaces with single space
      .trim();
    
    // Create hash from normalized content
    return this.simpleHash(normalized);
  }

  // Generate title hash
  generateTitleHash(title) {
    if (!title) return '';
    
    const normalized = title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    return this.simpleHash(normalized);
  }

  // Generate source hash
  generateSourceHash(source) {
    if (!source) return '';
    return this.simpleHash(source.toLowerCase().trim());
  }

  // Simple hash function
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  // Check content similarity (fuzzy matching)
  checkContentSimilarity(content, threshold = 0.8) {
    const contentHash = this.generateContentHash(content);
    
    // Check exact match first
    if (this.tracker.content_hashes[contentHash]) {
      return {
        isDuplicate: true,
        similarity: 1.0,
        reason: 'exact_content_match',
        original: this.tracker.content_hashes[contentHash]
      };
    }

    // Check fuzzy similarity with existing content
    if (!this.tracker.content_hashes || typeof this.tracker.content_hashes !== 'object') {
      return { isDuplicate: false, similarity: 0 };
    }
    
    const existingHashes = Object.keys(this.tracker.content_hashes);
    for (const existingHash of existingHashes) {
      const similarity = this.calculateSimilarity(contentHash, existingHash);
      if (similarity >= threshold) {
        return {
          isDuplicate: true,
          similarity: similarity,
          reason: 'similar_content',
          original: this.tracker.content_hashes[existingHash]
        };
      }
    }

    return { isDuplicate: false, similarity: 0 };
  }

  // Calculate similarity between two hashes (simplified)
  calculateSimilarity(hash1, hash2) {
    // Convert hashes back to strings for comparison
    // This is a simplified similarity - in production you'd want more sophisticated matching
    const len1 = hash1.length;
    const len2 = hash2.length;
    const maxLen = Math.max(len1, len2);
    
    if (maxLen === 0) return 1.0;
    
    // Simple character-based similarity
    let matches = 0;
    const minLen = Math.min(len1, len2);
    for (let i = 0; i < minLen; i++) {
      if (hash1[i] === hash2[i]) matches++;
    }
    
    return matches / maxLen;
  }

  // Check title similarity
  checkTitleSimilarity(title, threshold = 0.9) {
    const titleHash = this.generateTitleHash(title);
    
    if (this.tracker.title_hashes[titleHash]) {
      return {
        isDuplicate: true,
        similarity: 1.0,
        reason: 'exact_title_match',
        original: this.tracker.title_hashes[titleHash]
      };
    }

    // Check fuzzy title similarity
    if (!this.tracker.title_hashes || typeof this.tracker.title_hashes !== 'object') {
      return { isDuplicate: false, similarity: 0 };
    }
    
    const existingHashes = Object.keys(this.tracker.title_hashes);
    for (const existingHash of existingHashes) {
      const similarity = this.calculateSimilarity(titleHash, existingHash);
      if (similarity >= threshold) {
        return {
          isDuplicate: true,
          similarity: similarity,
          reason: 'similar_title',
          original: this.tracker.title_hashes[existingHash]
        };
      }
    }

    return { isDuplicate: false, similarity: 0 };
  }

  // Check source frequency (same source posting too frequently)
  checkSourceFrequency(source, maxPerHour = 3) {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    const sourceKey = source.toLowerCase().trim();
    
    // Ensure source_hashes exists and is an object
    if (!this.tracker.source_hashes || typeof this.tracker.source_hashes !== 'object') {
      this.tracker.source_hashes = {};
    }
    
    const sourceHistory = this.tracker.source_hashes[sourceKey] || [];
    
    // Filter recent posts (last hour)
    const recentPosts = sourceHistory.filter(timestamp => 
      new Date(timestamp) > oneHourAgo
    );
    
    if (recentPosts.length >= maxPerHour) {
      return {
        isDuplicate: true,
        reason: 'source_frequency_limit',
        count: recentPosts.length,
        limit: maxPerHour
      };
    }

    return { isDuplicate: false, count: recentPosts.length };
  }

  // Check if signal was already published
  checkAlreadyPublished(signal) {
    const signalKey = this.generateSignalKey(signal);
    return this.tracker.published.hasOwnProperty(signalKey);
  }

  // Check if URL was already processed (new method)
  checkURLAlreadyProcessed(url) {
    if (!url) return false;
    
    // Clean URL for comparison
    const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
    
    // Check in published items
    for (const [key, value] of Object.entries(this.tracker.published)) {
      if (value.link && value.link.toLowerCase().includes(cleanUrl)) {
        return true;
      }
    }
    
    // Check in content hashes (for analysis results)
    for (const [key, value] of Object.entries(this.tracker.content_hashes)) {
      if (value.link && value.link.toLowerCase().includes(cleanUrl)) {
        return true;
      }
    }
    
    return false;
  }

  // Generate unique key for signal
  generateSignalKey(signal) {
    const source = (signal.source || '').toLowerCase();
    const link = (signal.link || '').toLowerCase();
    const title = (signal.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${source}:${link}:${title}`;
  }

  // Comprehensive deduplication check
  checkDeduplication(signal, options = {}) {
    const {
      contentSimilarityThreshold = 0.8,
      titleSimilarityThreshold = 0.9,
      maxSourcePerHour = 3,
      checkContent = true,
      checkTitle = true,
      checkSource = true,
      checkAlreadyPublished = true,
      checkURLProcessed = true
    } = options;

    const results = {
      isDuplicate: false,
      reasons: [],
      details: {}
    };

    // 1. Check if URL was already processed (most important check)
    if (checkURLProcessed && signal.link) {
      if (this.checkURLAlreadyProcessed(signal.link)) {
        results.isDuplicate = true;
        results.reasons.push('url_already_processed');
        results.details.urlProcessed = true;
        return results;
      }
    }

    // 2. Check if already published
    if (checkAlreadyPublished) {
      if (this.checkAlreadyPublished(signal)) {
        results.isDuplicate = true;
        results.reasons.push('already_published');
        results.details.alreadyPublished = true;
        return results;
      }
    }

    // 3. Check content similarity
    if (checkContent && signal.content) {
      const contentCheck = this.checkContentSimilarity(signal.content, contentSimilarityThreshold);
      if (contentCheck.isDuplicate) {
        results.isDuplicate = true;
        results.reasons.push(contentCheck.reason);
        results.details.contentSimilarity = contentCheck;
      }
    }

    // 4. Check title similarity
    if (checkTitle && signal.title) {
      const titleCheck = this.checkTitleSimilarity(signal.title, titleSimilarityThreshold);
      if (titleCheck.isDuplicate) {
        results.isDuplicate = true;
        results.reasons.push(titleCheck.reason);
        results.details.titleSimilarity = titleCheck;
      }
    }

    // 5. Check source frequency
    if (checkSource && signal.source) {
      const sourceCheck = this.checkSourceFrequency(signal.source, maxSourcePerHour);
      if (sourceCheck.isDuplicate) {
        results.isDuplicate = true;
        results.reasons.push(sourceCheck.reason);
        results.details.sourceFrequency = sourceCheck;
      }
    }

    return results;
  }

  // Mark signal as published
  markAsPublished(signal) {
    const signalKey = this.generateSignalKey(signal);
    const now = new Date().toISOString();
    
    // Mark as published
    this.tracker.published[signalKey] = {
      timestamp: now,
      source: signal.source,
      title: signal.title,
      link: signal.link
    };

    // Add to content hash
    if (signal.content) {
      const contentHash = this.generateContentHash(signal.content);
      this.tracker.content_hashes[contentHash] = {
        timestamp: now,
        source: signal.source,
        title: signal.title,
        link: signal.link  // Add link to content hash for URL checking
      };
    }

    // Add to title hash
    if (signal.title) {
      const titleHash = this.generateTitleHash(signal.title);
      this.tracker.title_hashes[titleHash] = {
        timestamp: now,
        source: signal.source,
        link: signal.link
      };
    }

    // Add to source frequency tracking
    if (signal.source) {
      // Ensure source_hashes exists and is an object
      if (!this.tracker.source_hashes || typeof this.tracker.source_hashes !== 'object') {
        this.tracker.source_hashes = {};
      }
      
      const sourceKey = signal.source.toLowerCase().trim();
      if (!this.tracker.source_hashes[sourceKey]) {
        this.tracker.source_hashes[sourceKey] = [];
      }
      this.tracker.source_hashes[sourceKey].push(now);
      
      // Keep only last 24 hours of history
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      this.tracker.source_hashes[sourceKey] = this.tracker.source_hashes[sourceKey]
        .filter(timestamp => new Date(timestamp) > oneDayAgo);
    }
  }

  // Mark signal as processed (before publishing) - new method
  markAsProcessed(signal) {
    const signalKey = this.generateSignalKey(signal);
    const now = new Date().toISOString();
    
    // Mark as processed (but not yet published)
    this.tracker.published[signalKey] = {
      timestamp: now,
      source: signal.source,
      title: signal.title,
      link: signal.link,
      status: 'processed'  // Mark as processed, not published
    };

    // Add to content hash for URL checking
    if (signal.content) {
      const contentHash = this.generateContentHash(signal.content);
      this.tracker.content_hashes[contentHash] = {
        timestamp: now,
        source: signal.source,
        title: signal.title,
        link: signal.link,
        status: 'processed'
      };
    }
  }

  // Filter signals for publishing
  filterSignalsForPublishing(signals, options = {}) {
    const {
      contentSimilarityThreshold = 0.8,
      titleSimilarityThreshold = 0.9,
      maxSourcePerHour = 3,
      maxSignalsPerRun = 50
    } = options;

    const filteredSignals = [];
    const duplicateSignals = [];
    const skippedSignals = [];

    console.log(`🔍 Advanced Deduplication: Checking ${signals.length} signals...`);

    for (const signal of signals) {
      const dedupResult = this.checkDeduplication(signal, {
        contentSimilarityThreshold,
        titleSimilarityThreshold,
        maxSourcePerHour,
        checkContent: true,
        checkTitle: true,
        checkSource: true,
        checkAlreadyPublished: true,
        checkURLProcessed: true
      });

      if (dedupResult.isDuplicate) {
        duplicateSignals.push({
          signal,
          reasons: dedupResult.reasons,
          details: dedupResult.details
        });
        
        console.log(`❌ Skipped: ${signal.title?.substring(0, 50)}... (${dedupResult.reasons.join(', ')})`);
      } else {
        filteredSignals.push(signal);
        console.log(`✅ Approved: ${signal.title?.substring(0, 50)}...`);
      }

      // Limit signals per run
      if (filteredSignals.length >= maxSignalsPerRun) {
        console.log(`⚠️ Reached max signals per run limit (${maxSignalsPerRun})`);
        break;
      }
    }

    console.log(`\n📊 Deduplication Results:`);
    console.log(`   ✅ Approved: ${filteredSignals.length}`);
    console.log(`   ❌ Duplicates: ${duplicateSignals.length}`);
    console.log(`   📈 Total processed: ${signals.length}`);

    return {
      approved: filteredSignals,
      duplicates: duplicateSignals,
      skipped: skippedSignals
    };
  }

  // Get statistics
  getStats() {
    const publishedCount = this.tracker.published ? Object.keys(this.tracker.published).length : 0;
    const contentHashesCount = this.tracker.content_hashes ? Object.keys(this.tracker.content_hashes).length : 0;
    const titleHashesCount = this.tracker.title_hashes ? Object.keys(this.tracker.title_hashes).length : 0;
    const sourceCount = this.tracker.source_hashes ? Object.keys(this.tracker.source_hashes).length : 0;

    return {
      published: publishedCount,
      contentHashes: contentHashesCount,
      titleHashes: titleHashesCount,
      sourceCount: sourceCount,
      lastUpdated: this.tracker.lastUpdated
    };
  }

  // Finalize tracker
  finalize() {
    this.saveTracker();
  }
}
