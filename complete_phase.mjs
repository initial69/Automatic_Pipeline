#!/usr/bin/env node

// Complete Pipeline: Phase 1 + Phase 2 + Phase 3
import { collectData } from './phase1/collect_data.mjs';
import { analyzeAllSignals } from './phase2/analyze_all_signals.mjs';
import { publishEarlyDetection } from './phase3/publish_early_detection.mjs';

async function runCompletePhase() {
  console.log('🚀 Starting Complete Phase (1 + 2 + 3)...');
  console.log('=====================================');
  
  try {
    // Phase 1: Data Collection
    console.log('\n📊 Phase 1: Data Collection...');
    const phase1Results = await collectData();
    console.log(`✅ Phase 1 complete: ${phase1Results.signals.length} signals collected`);
    
    // Phase 2: Analysis
    console.log('\n🔍 Phase 2: Analysis...');
    const phase2Results = await analyzeAllSignals();
    console.log('✅ Phase 2 complete: Analysis finished');
    
    // Phase 3: Publishing
    console.log('\n📢 Phase 3: Publishing to Telegram...');
    const phase3Results = await publishEarlyDetection();
    console.log(`✅ Phase 3 complete: ${phase3Results.hot} hot, ${phase3Results.early} early, ${phase3Results.watch} watch, ${phase3Results.risk} risk alerts published`);
    
    console.log('\n🎉 Complete Phase finished successfully!');
    console.log('=====================================');
    console.log(`📊 Signals collected: ${phase1Results.signals.length}`);
    console.log(`📢 Opportunities published: ${phase3Results.hot} hot, ${phase3Results.early} early, ${phase3Results.watch} watch, ${phase3Results.risk} risk alerts`);
    console.log(`📊 Success rate: ${phase3Results.publish ? Math.round((phase3Results.publish.sent / phase3Results.publish.total) * 100) : 0}%`);
    
    // Ensure process exits cleanly after completion
    process.exit(0);
  } catch (error) {
    console.error('❌ Complete Phase failed:', error.message);
    process.exit(1);
  }
}

// Run the complete phase
runCompletePhase();
