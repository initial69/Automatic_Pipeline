import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export class AnalysisTracker {
  constructor() {
    this.today = new Date().toISOString().slice(0, 10);
    this.trackerFile = path.join('data', 'analysis_tracker.json');
    this.tracker = this.loadTracker();
  }

  loadTracker() {
    if (existsSync(this.trackerFile)) {
      try {
        return JSON.parse(readFileSync(this.trackerFile, 'utf8'));
      } catch (error) {
        console.warn('⚠️ Could not load analysis tracker, starting fresh');
      }
    }
    
    return {
      analyzed: {},
      lastUpdated: new Date().toISOString()
    };
  }

  saveTracker() {
    this.tracker.lastUpdated = new Date().toISOString();
    writeFileSync(this.trackerFile, JSON.stringify(this.tracker, null, 2));
  }

  // Generate unique key for signal
  generateSignalKey(signal) {
    // Use same key generation as collection tracker for consistency
    const source = (signal.source || '').toLowerCase();
    const link = (signal.link || '').toLowerCase();
    const title = (signal.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${source}:${link}:${title}`;
  }

  // Check if signal was already analyzed
  isAlreadyAnalyzed(signal) {
    const key = this.generateSignalKey(signal);
    return this.tracker.analyzed.hasOwnProperty(key);
  }

  // Mark signal as analyzed
  markAsAnalyzed(signal, analysisResult = null) {
    const key = this.generateSignalKey(signal);
    this.tracker.analyzed[key] = {
      timestamp: new Date().toISOString(),
      analysisResult: analysisResult
    };
  }

  // Filter out already analyzed signals
  filterNewSignals(signals) {
    const newSignals = [];
    const skippedSignals = [];
    
    for (const signal of signals) {
      if (this.isAlreadyAnalyzed(signal)) {
        skippedSignals.push(signal);
      } else {
        newSignals.push(signal);
        // Mark as analyzed immediately to avoid duplicates in same run
        this.markAsAnalyzed(signal);
      }
    }
    
    return { newSignals, skippedSignals };
  }

  // Get statistics
  getStats() {
    const analyzedCount = Object.keys(this.tracker.analyzed).length;
    const todayAnalyzed = Object.values(this.tracker.analyzed).filter(
      entry => entry.timestamp.startsWith(this.today)
    ).length;

    return {
      today: todayAnalyzed,
      global: analyzedCount,
      lastUpdated: this.tracker.lastUpdated
    };
  }

  // Save tracker after processing
  finalize() {
    this.saveTracker();
  }
}
