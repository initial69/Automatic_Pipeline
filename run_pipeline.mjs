#!/usr/bin/env node

import 'dotenv/config';
import { collectData } from './phase1/collect_data.mjs';
import { analyzeAllSignals } from './phase2/analyze_all_signals.mjs';
import { publishEarlyDetection } from './phase3/publish_early_detection.mjs';

async function runPipeline() {
  const startTime = new Date();
  console.log('🚀 Starting Crypto Early Detection Pipeline...');
  console.log('==============================================');
  console.log(`⏰ Start time: ${startTime.toISOString()}`);
  
  try {
    // Phase 1: Data Collection
    console.log('\n📊 Phase 1: Collecting signals...');
    const phase1Start = Date.now();
    const phase1Results = await collectData();
    const phase1Duration = ((Date.now() - phase1Start) / 1000).toFixed(1);
    console.log(`✅ Phase 1 complete: ${phase1Results.signals.length} signals collected (${phase1Duration}s)`);
    
    if (phase1Results.signals.length === 0) {
      console.log('⚠️  No signals collected. Skipping analysis and publishing.');
      return { success: true, message: 'No signals to process' };
    }
    
    // Phase 2: Analysis
    console.log('\n🔍 Phase 2: Analyzing signals...');
    const phase2Start = Date.now();
    const phase2Results = await analyzeAllSignals();
    const phase2Duration = ((Date.now() - phase2Start) / 1000).toFixed(1);
    console.log(`✅ Phase 2 complete: Analysis finished (${phase2Duration}s)`);
    
    if (!phase2Results.gemini_analysis || phase2Results.gemini_analysis.all_analyses.length === 0) {
      console.log('⚠️  No analysis results. Skipping publishing.');
      return { success: true, message: 'No analysis results to publish' };
    }
    
    // Phase 3: Publishing
    console.log('\n📢 Phase 3: Publishing to Telegram...');
    const phase3Start = Date.now();
    const phase3Results = await publishEarlyDetection();
    const phase3Duration = ((Date.now() - phase3Start) / 1000).toFixed(1);
    console.log(`✅ Phase 3 complete: ${phase3Results.hot} hot, ${phase3Results.early} early, ${phase3Results.watch} watch, ${phase3Results.risk} risk alerts published (${phase3Duration}s)`);
    
    // Summary
    const totalDuration = ((Date.now() - startTime.getTime()) / 1000).toFixed(1);
    console.log('\n🎉 Pipeline completed successfully!');
    console.log('=====================================');
    console.log(`📊 Signals collected: ${phase1Results.signals.length}`);
    console.log(`🧠 Signals analyzed: ${phase2Results.gemini_analysis.all_analyses.length}`);
    console.log(`📢 Messages published: ${phase3Results.publish.sent}/${phase3Results.publish.total} (${Math.round((phase3Results.publish.sent / phase3Results.publish.total) * 100)}% success rate)`);
    console.log(`⏱️  Total duration: ${totalDuration}s`);
    console.log(`🔥 Hot opportunities: ${phase3Results.hot}`);
    console.log(`⚡ Early signals: ${phase3Results.early}`);
    console.log(`👀 Watch closely: ${phase3Results.watch}`);
    console.log(`🚨 Risk alerts: ${phase3Results.risk}`);
    
    return {
      success: true,
      duration: totalDuration,
      signals: phase1Results.signals.length,
      analyzed: phase2Results.gemini_analysis.all_analyses.length,
      published: phase3Results.publish.sent,
      hot: phase3Results.hot,
      early: phase3Results.early,
      watch: phase3Results.watch,
      risk: phase3Results.risk
    };
    
  } catch (error) {
    const totalDuration = ((Date.now() - startTime.getTime()) / 1000).toFixed(1);
    console.error('\n❌ Pipeline failed!');
    console.error('==================');
    console.error(`⏱️  Duration before failure: ${totalDuration}s`);
    console.error(`❌ Error: ${error.message}`);
    console.error(`📊 Stack trace:`, error.stack);
    
    return {
      success: false,
      error: error.message,
      duration: totalDuration
    };
  }
}

// Run if called directly
if (process.argv[1] && process.argv[1].endsWith('run_pipeline.mjs')) {
  runPipeline()
    .then(result => {
      if (result.success) {
        console.log('\n✅ Pipeline completed successfully');
        process.exit(0);
      } else {
        console.log('\n❌ Pipeline failed');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n💥 Unexpected error:', error);
      process.exit(1);
    });
}

export { runPipeline };
