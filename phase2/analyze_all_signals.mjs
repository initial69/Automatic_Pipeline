#!/usr/bin/env node

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// Import analysis modules
import { analyzeAllSignalsWithGemini } from '../agents/analysis_gemini_all_signals.mjs';
import { AnalysisTracker } from '../utils/analysis_tracker.mjs';
import { AdvancedDeduplication } from '../utils/advanced_deduplication.mjs';

// Main analysis function - PHASE 2: Analyze signals with incremental tracking
async function analyzeAllSignals() {
  console.log('🔍 Phase 2: Analyzing Signals (Incremental)...');
  console.log('==============================================');
  
  // Initialize analysis tracker
  const tracker = new AnalysisTracker();
  
  // Debug tracker file
  console.log(`🔍 Debug Analysis Tracker:`);
  console.log(`📁 Tracker file path: ${tracker.trackerFile}`);
  console.log(`📁 File exists: ${existsSync(tracker.trackerFile)}`);
  if (existsSync(tracker.trackerFile)) {
    const content = readFileSync(tracker.trackerFile, 'utf8');
    console.log(`📏 File size: ${content.length} characters`);
    console.log(`🔤 First 100 chars: ${content.substring(0, 100)}...`);
  }
  
  const stats = tracker.getStats();
  console.log(`📊 Analysis Tracker: ${stats.today} today, ${stats.global} global analyzed`);
  
  // Load signals from Phase 1
  const today = new Date().toISOString().slice(0, 10);
  const signalsFile = path.join('data', today, 'daily_signals.json');
  
  if (!existsSync(signalsFile)) {
    console.error('❌ No daily signals found. Run Phase 1 first.');
    console.log('   Use: node phase1/collect_data.mjs');
    process.exit(1);
  }
  
  const data = JSON.parse(readFileSync(signalsFile, 'utf8'));
  const allSignals = data.signals || [];
  console.log(`📊 Loaded ${allSignals.length} total signals`);
  
  // Filter for new signals only
  const { newSignals, skippedSignals } = tracker.filterNewSignals(allSignals);
  console.log(`🆕 New signals to analyze: ${newSignals.length}`);
  console.log(`⏭️ Skipped signals (already analyzed): ${skippedSignals.length}`);
  
  if (newSignals.length === 0) {
    console.log('✅ No new signals to analyze. All signals have been analyzed previously.');
    tracker.finalize();
    return { gemini_analysis: null };
  }

  // Apply deduplication to new signals before analysis
  console.log('\n🔍 Applying deduplication to new signals...');
  const deduplication = new AdvancedDeduplication();
  const dedupOptions = {
    contentSimilarityThreshold: 0.8,
    titleSimilarityThreshold: 0.9,
    maxSourcePerHour: 5, // More lenient for analysis phase
    maxSignalsPerRun: 100
  };
  
  // Enrich signals for deduplication
  const enrichedSignals = newSignals.map(signal => ({
    ...signal,
    content: signal.title || signal.judul || '', // Use title as content for dedup
    source: signal.source || signal.repo || 'Unknown'
  }));
  
  const dedupResult = deduplication.filterSignalsForPublishing(enrichedSignals, dedupOptions);
  const uniqueSignals = dedupResult.approved;
  const duplicateSignals = dedupResult.duplicates;
  
  console.log(`📊 Deduplication results:`);
  console.log(`   ✅ Unique signals for analysis: ${uniqueSignals.length}`);
  console.log(`   ❌ Duplicates filtered: ${duplicateSignals.length}`);
  
  if (uniqueSignals.length === 0) {
    console.log('✅ No unique signals to analyze after deduplication.');
    tracker.finalize();
    return { gemini_analysis: null };
  }
  
  let analysisResults = null;
  let geminiResults = null;
  
  // Gemini AI Analysis (Primary) - Analyze UNIQUE signals only
  if (process.env.GEMINI_API_KEY1) {
    console.log(`\n🧠 Gemini AI Analysis (Primary) - Analyzing ${uniqueSignals.length} UNIQUE signals...`);
    try {
      geminiResults = await analyzeAllSignalsWithGemini(uniqueSignals);
      if (geminiResults) {
        console.log(`✅ Gemini analysis complete: ${geminiResults.all_analyses.length} analyses identified`);
        console.log(`   Analyzed: ${geminiResults.analyzed_signals}/${geminiResults.total_signals} signals`);
        console.log(`   Errors: ${geminiResults.errors.length}`);
        
        // Mark new analyses for Phase 3 publishing
        geminiResults.new_analyses = geminiResults.all_analyses.filter(analysis => 
          uniqueSignals.some(signal => 
            signal.link === analysis.evidence?.[0] || 
            signal.url === analysis.evidence?.[0]
          )
        );
        console.log(`📤 New analyses for publishing: ${geminiResults.new_analyses.length}`);
        
        // Mark analyzed signals in tracker
        uniqueSignals.forEach(signal => {
          tracker.markAsAnalyzed(signal);
        });
      }
    } catch (error) {
      console.error(`❌ Gemini analysis failed: ${error.message}`);
    }
  } else {
    console.log('\n⚠️  No Gemini API key found. Using basic analysis fallback.');
    console.log('   Add GEMINI_API_KEY1 to your .env file for AI-powered analysis.');
  }
  
  // No fallback analysis - Gemini is required
  if (!geminiResults || geminiResults.all_analyses.length === 0) {
    console.log('\n❌ No Gemini analysis results available');
    console.log('   Make sure GEMINI_API_KEY1 is set in .env file');
  }
  
  // Save results
  const resultsDir = path.join('data', today);
  if (geminiResults) {
    const geminiFile = path.join(resultsDir, 'gemini_all_signals_analysis.json');
    writeFileSync(geminiFile, JSON.stringify(geminiResults, null, 2));
    console.log(`📁 Gemini results saved to: ${geminiFile}`);
    
    // Generate summary with incremental stats
    const summaryFile = path.join(resultsDir, 'gemini_all_signals_summary.txt');
    const summaryContent = `
🏆 INCREMENTAL ANALYSIS RESULTS:
===============================
New Signals Analyzed: ${newSignals.length}
Skipped Signals (Already Analyzed): ${skippedSignals.length}
Total Analyses Found: ${geminiResults.all_analyses.length}

📊 SCORING DISTRIBUTION:
=======================
${geminiResults.all_analyses.reduce((acc, analysis) => {
  const score = Math.round(analysis.score / 10);
  if (score >= 7) acc.good++;
  else if (score >= 4) acc.check++;
  else acc.scam++;
  return acc;
}, { good: 0, check: 0, scam: 0 })}

🔥 TOP OPPORTUNITIES (Score 7-10):
==================================
${geminiResults.all_analyses
  .filter(analysis => Math.round(analysis.score / 10) >= 7)
  .slice(0, 10)
  .map((analysis, index) => `
${index + 1}. ${analysis.project_name} - ${analysis.opportunity_type} (Score: ${Math.round(analysis.score / 10)}/10)
   ${analysis.importance} importance - ${analysis.market_impact} impact
   ${analysis.investment_angle}
`).join('\n')}

⚠️  NEED MANUAL CHECK (Score 4-6):
==================================
${geminiResults.all_analyses
  .filter(analysis => {
    const score = Math.round(analysis.score / 10);
    return score >= 4 && score <= 6;
  })
  .slice(0, 10)
  .map((analysis, index) => `
${index + 1}. ${analysis.project_name} - ${analysis.opportunity_type} (Score: ${Math.round(analysis.score / 10)}/10)
   ${analysis.importance} importance - ${analysis.market_impact} impact
   ${analysis.investment_angle}
`).join('\n')}

🚨 POTENTIAL SCAMS (Score 1-3):
===============================
${geminiResults.all_analyses
  .filter(analysis => Math.round(analysis.score / 10) <= 3)
  .slice(0, 10)
  .map((analysis, index) => `
${index + 1}. ${analysis.project_name} - ${analysis.opportunity_type} (Score: ${Math.round(analysis.score / 10)}/10)
   ${analysis.importance} importance - ${analysis.market_impact} impact
   ${analysis.investment_angle}
`).join('\n')}
    `;
    writeFileSync(summaryFile, summaryContent);
    console.log(`📄 Summary saved to: ${summaryFile}`);
  }
  
  // Finalize tracker
  tracker.finalize();
  
  // No basic analysis results to save
  
  console.log('\n✅ Phase 2 Complete!');
  console.log('===================');
  console.log(`📊 Analysis Tracker Stats:`);
  console.log(`   Today: ${tracker.getStats().today} signals analyzed`);
  console.log(`   Global: ${tracker.getStats().global} signals tracked`);
  console.log(`📊 Deduplication Stats:`);
  console.log(`   Unique signals analyzed: ${uniqueSignals.length}`);
  console.log(`   Duplicates filtered: ${duplicateSignals.length}`);
  
  return {
    gemini_analysis: geminiResults,
    incremental_stats: {
      new_signals: newSignals.length,
      unique_signals: uniqueSignals.length,
      duplicates_filtered: duplicateSignals.length,
      skipped_signals: skippedSignals.length,
      total_analyzed: tracker.getStats().global
    }
  };
}

// Run if called directly
if (process.argv[1] && process.argv[1].endsWith('analyze_all_signals.mjs')) {
  analyzeAllSignals()
    .then(results => {
      console.log('✅ Phase 2 analysis completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error(`❌ Phase 2 analysis failed: ${error.message}`);
      process.exit(1);
    });
}

export { analyzeAllSignals };
