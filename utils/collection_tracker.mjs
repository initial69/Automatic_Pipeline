import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export class CollectionTracker {
  constructor() {
    this.today = new Date().toISOString().slice(0, 10);
    this.trackerFile = path.join('data', 'collection_tracker.json');
    this.todayFile = path.join('data', this.today, 'collection_tracker.json');
    this.tracker = this.loadTracker();
  }

  loadTracker() {
    // Load global tracker
    let globalTracker = {};
    if (existsSync(this.trackerFile)) {
      try {
        globalTracker = JSON.parse(readFileSync(this.trackerFile, 'utf8'));
      } catch (error) {
        console.log('⚠️  Error loading global tracker, starting fresh');
      }
    }

    // Load today's tracker
    let todayTracker = {};
    if (existsSync(this.todayFile)) {
      try {
        todayTracker = JSON.parse(readFileSync(this.todayFile, 'utf8'));
      } catch (error) {
        console.log('⚠️  Error loading today tracker, starting fresh');
      }
    }

    return {
      global: globalTracker,
      today: todayTracker,
      lastUpdated: new Date().toISOString()
    };
  }

  saveTracker() {
    // Ensure data directory exists
    const dataDir = path.join('data', this.today);
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    // Save global tracker
    writeFileSync(this.trackerFile, JSON.stringify(this.tracker.global, null, 2));
    
    // Save today's tracker
    writeFileSync(this.todayFile, JSON.stringify(this.tracker.today, null, 2));
  }

  // Check if a signal has been collected before
  isAlreadyCollected(signal) {
    const url = signal.url || signal.link || '';
    const title = signal.title || signal.judul || '';
    const source = signal.source || signal.repo || 'Unknown';
    
    // Normalize URL (remove parameters, trailing slashes, etc.)
    const normalizedUrl = this.normalizeUrl(url);
    const normalizedTitle = this.normalizeTitle(title);
    
    // Create multiple keys for better detection
    const keys = [
      `${source}:${normalizedUrl}:${normalizedTitle}`.toLowerCase(),
      `${source}:${normalizedUrl}`.toLowerCase(), // URL only
      `${normalizedTitle}`.toLowerCase(), // Title only
      `${source}:${normalizedTitle}`.toLowerCase() // Source + title
    ];
    
    // Check in today's collection
    if (this.tracker.today.collected) {
      for (const key of keys) {
        if (this.tracker.today.collected[key]) {
          console.log(`🔍 Found in today's collection: ${key}`);
          return true;
        }
      }
    }
    
    // Check in global collection (last 7 days)
    if (this.tracker.global.collected) {
      for (const key of keys) {
        if (this.tracker.global.collected[key]) {
          const collectedDate = new Date(this.tracker.global.collected[key]);
          const daysDiff = (new Date() - collectedDate) / (1000 * 60 * 60 * 24);
          
          // If collected within last 7 days, consider it already collected
          if (daysDiff <= 7) {
            console.log(`🔍 Found in global collection (${daysDiff.toFixed(1)} days ago): ${key}`);
            return true;
          }
        }
      }
    }
    
    return false;
  }

  // Normalize URL for better comparison
  normalizeUrl(url) {
    if (!url) return '';
    
    try {
      const urlObj = new URL(url);
      // Remove common parameters that don't affect content
      const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'source'];
      paramsToRemove.forEach(param => urlObj.searchParams.delete(param));
      
      // Normalize path
      let path = urlObj.pathname;
      if (path.endsWith('/') && path.length > 1) {
        path = path.slice(0, -1);
      }
      
      return `${urlObj.protocol}//${urlObj.host}${path}`;
    } catch (error) {
      // If URL parsing fails, return original
      return url;
    }
  }

  // Normalize title for better comparison
  normalizeTitle(title) {
    if (!title) return '';
    
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  // Mark a signal as collected
  markAsCollected(signal) {
    const url = signal.url || signal.link || '';
    const title = signal.title || signal.judul || '';
    const source = signal.source || signal.repo || 'Unknown';
    
    // Normalize for consistent keys
    const normalizedUrl = this.normalizeUrl(url);
    const normalizedTitle = this.normalizeTitle(title);
    
    // Create multiple keys for better tracking
    const keys = [
      `${source}:${normalizedUrl}:${normalizedTitle}`.toLowerCase(),
      `${source}:${normalizedUrl}`.toLowerCase(),
      `${normalizedTitle}`.toLowerCase(),
      `${source}:${normalizedTitle}`.toLowerCase()
    ];
    
    const timestamp = new Date().toISOString();
    
    // Initialize collections if they don't exist
    if (!this.tracker.today.collected) {
      this.tracker.today.collected = {};
    }
    if (!this.tracker.global.collected) {
      this.tracker.global.collected = {};
    }
    
    // Mark as collected with all keys
    keys.forEach(key => {
      this.tracker.today.collected[key] = timestamp;
      this.tracker.global.collected[key] = timestamp;
    });
    
    // Clean up old entries (older than 30 days)
    this.cleanupOldEntries();
  }

  // Clean up entries older than 30 days
  cleanupOldEntries() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    if (this.tracker.global.collected) {
      const keysToDelete = [];
      for (const [key, timestamp] of Object.entries(this.tracker.global.collected)) {
        if (new Date(timestamp) < thirtyDaysAgo) {
          keysToDelete.push(key);
        }
      }
      
      keysToDelete.forEach(key => {
        delete this.tracker.global.collected[key];
      });
    }
  }

  // Get collection statistics
  getStats() {
    const todayCount = this.tracker.today.collected ? Object.keys(this.tracker.today.collected).length : 0;
    const globalCount = this.tracker.global.collected ? Object.keys(this.tracker.global.collected).length : 0;
    
    return {
      today: todayCount,
      global: globalCount,
      lastUpdated: this.tracker.lastUpdated
    };
  }

  // Filter out already collected signals
  filterNewSignals(signals) {
    const newSignals = [];
    const skippedSignals = [];
    
    for (const signal of signals) {
      if (this.isAlreadyCollected(signal)) {
        skippedSignals.push(signal);
      } else {
        newSignals.push(signal);
        // Mark as collected immediately to avoid duplicates in same run
        this.markAsCollected(signal);
      }
    }
    
    return { newSignals, skippedSignals };
  }

  // Save tracker after processing
  finalize() {
    this.saveTracker();
    
    const stats = this.getStats();
    console.log(`📊 Collection Tracker Stats:`);
    console.log(`   Today: ${stats.today} signals collected`);
    console.log(`   Global: ${stats.global} signals tracked`);
    console.log(`   Last updated: ${stats.lastUpdated}`);
  }
}
