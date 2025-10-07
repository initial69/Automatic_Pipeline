#!/usr/bin/env node

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import fetch from 'node-fetch';
import { AdvancedDeduplication } from '../utils/advanced_deduplication.mjs';
import { toSwissTime, localISO } from '../utils/time_window.mjs';

// Telegram Bot configuration
const TG_TOKEN = process.env.TG_TOKEN;
const TARGET_CHANNEL = process.env.TELEGRAM_CHANNEL_ID;

// Initialize Telegram Bot
async function initTelegramBot() {
  if (!TG_TOKEN) {
    throw new Error('TG_TOKEN not set in .env file');
  }
  
  if (!TARGET_CHANNEL) {
    throw new Error('TELEGRAM_CHANNEL_ID not set in .env file');
  }
  
  console.log('✅ Telegram Bot initialized');
  return { token: TG_TOKEN, chatId: TARGET_CHANNEL };
}

// Format message for Telegram with early detection focus
function formatEarlyDetectionMessage(analysis, index, originalSignal) {
  const { 
    project_name, 
    opportunity_type, 
    investment_angle, 
    evidence, 
    score, 
    importance, 
    market_impact 
  } = analysis;
  
  // Get original source and title
  const source = originalSignal ? originalSignal.source : 'Unknown';
  const originalTitle = originalSignal ? originalSignal.title : project_name;
  const originalTime = originalSignal ? originalSignal.time : null;
  const postedAt = originalTime ? localISO(toSwissTime(new Date(originalTime))) : null;
  
  // Create title from source with Gemini enhancement
  const enhancedTitle = `${originalTitle} | ${project_name}`;
  const link = evidence && evidence[0] ? evidence[0] : 'N/A';
  const summary = investment_angle;
  
  // Convert score to 1-10 scale
  const scoreOutOf10 = Math.round(score / 10);
  
  // Categorize based on score and type for early detection
  let category, categoryEmoji, categoryColor;
  if (scoreOutOf10 >= 8) {
    category = "🔥 HOT OPPORTUNITY";
    categoryEmoji = "🔥";
    categoryColor = "🟢";
  } else if (scoreOutOf10 >= 6) {
    category = "⚡ EARLY SIGNAL";
    categoryEmoji = "⚡";
    categoryColor = "🟡";
  } else if (scoreOutOf10 >= 4) {
    category = "👀 WATCH CLOSELY";
    categoryEmoji = "👀";
    categoryColor = "🟠";
  } else {
    category = "🚨 POTENTIAL RISK";
    categoryEmoji = "🚨";
    categoryColor = "🔴";
  }
  
  // Special handling for early project types
  const earlyProjectTypes = ['Airdrop', 'IDO', 'ICO', 'Testnet', 'Mainnet', 'Partnership', 'Funding', 'DeFi', 'L2', 'Bridge'];
  const isEarlyProject = earlyProjectTypes.some(type => 
    opportunity_type.includes(type) || 
    project_name.toLowerCase().includes('test') ||
    project_name.toLowerCase().includes('beta') ||
    project_name.toLowerCase().includes('alpha')
  );
  
  if (isEarlyProject && scoreOutOf10 >= 4) {
    category = "🚀 EARLY PROJECT";
    categoryEmoji = "🚀";
    categoryColor = "🟢";
  }
  
  // Format scoring
  const scoreEmoji = scoreOutOf10 >= 8 ? '🔥' : scoreOutOf10 >= 6 ? '⚡' : scoreOutOf10 >= 4 ? '👀' : '🚨';
  const scoreText = `${scoreEmoji} Score: ${scoreOutOf10}/10`;
  
  // Format importance
  const importanceEmoji = {
    'Critical': '🚨',
    'High': '🔥',
    'Medium': '📈',
    'Low': '💡'
  };
  const importanceText = `${importanceEmoji[importance] || '📊'} ${importance}`;
  
  // Build message
  let message = `${categoryColor} **${category}**\n\n`;
  message += `📝 **${enhancedTitle}**\n\n`;
  message += `🔗 **Link:** ${link}\n\n`;
  message += `📊 **Summary:**\n${summary}\n\n`;
  message += `📈 **Analysis:**\n`;
  message += `   ${scoreText}\n`;
  message += `   ${importanceText}\n`;
  message += `   📊 Market Impact: ${market_impact}\n`;
  if (isEarlyProject) {
    message += `   🚀 Early Project Type: ${opportunity_type}\n`;
  }
  message += `\n📡 **Source:** ${source}\n`;
  if (postedAt) {
    message += `🗓️ **Posted:** ${postedAt} (Europe/Zurich)\n`;
  }
  message += `\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  
  return { message, category, scoreOutOf10, isEarlyProject };
}

// Send message to Telegram using Bot API with retry mechanism
async function sendToTelegramBot(message, botConfig, maxRetries = 3) {
  const { token, chatId } = botConfig;
  const telegramUrl = `https://api.telegram.org/bot${token}/sendMessage`;
  let useParseMode = true; // start with Markdown, fallback to plain text if it fails

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📤 Attempt ${attempt}/${maxRetries} - Sending message...`);

      const payload = {
        chat_id: chatId,
        text: message,
        ...(useParseMode ? { parse_mode: 'Markdown' } : {})
      };

      const response = await fetch(telegramUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.ok) {
        console.log(`✅ Message sent successfully (attempt ${attempt})`);
        return { success: true, messageId: result.result.message_id };
      } else {
        console.error(`❌ Telegram API error (attempt ${attempt}):`, result.description);

        // If Markdown parsing fails, retry immediately without parse_mode
        if (
          useParseMode &&
          typeof result.description === 'string' &&
          result.description.toLowerCase().includes("can't parse entities")
        ) {
          console.log('🔁 Detected Markdown parse error. Retrying without parse_mode...');
          useParseMode = false; // switch to plain text
          attempt--; // do not count this towards maxRetries
          continue;
        }

        // Check if it's a rate limit error
        if (result.error_code === 429) {
          const retryAfter = result.parameters?.retry_after || 60;
          console.log(`⏳ Rate limited. Waiting ${retryAfter} seconds...`);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          continue;
        }

        // For other errors, wait before retry
        if (attempt < maxRetries) {
          const waitTime = attempt * 2000; // Exponential backoff: 2s, 4s, 6s
          console.log(`⏳ Waiting ${waitTime/1000}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    } catch (error) {
      console.error(`❌ Network error (attempt ${attempt}):`, error.message);

      if (attempt < maxRetries) {
        const waitTime = attempt * 2000;
        console.log(`⏳ Waiting ${waitTime/1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  console.error(`❌ Failed to send message after ${maxRetries} attempts`);
  return { success: false, error: 'Max retries exceeded' };
}

// Main publishing function with early detection focus
async function publishEarlyDetection() {
  console.log('📢 Phase 3: Publishing Early Detection Results (Advanced Deduplication)...');
  console.log('=====================================================================');
  
  // Initialize Advanced Deduplication
  const deduplication = new AdvancedDeduplication();
  const dedupStats = deduplication.getStats();
  console.log(`📊 Deduplication Tracker: ${dedupStats.published} published, ${dedupStats.contentHashes} content hashes, ${dedupStats.titleHashes} title hashes`);
  
  // Initialize Telegram Bot
  const botConfig = await initTelegramBot();
  
  // Check if in test mode
  if (TG_TOKEN === 'test_mode') {
    console.log('🧪 Test Mode: Skipping Telegram publishing');
    console.log('📊 Analysis results would be published in production mode');
    return {
      hot: 0,
      early: 0,
      watch: 0,
      risk: 0,
      publish: { total: 0, sent: 0, failed: 0 }
    };
  }
  
  // Track publishing results
  const publishResults = {
    total: 0,
    sent: 0,
    failed: 0,
    failedMessages: []
  };
  
  // Load analysis results from Phase 2
  const today = new Date().toISOString().slice(0, 10);
  const geminiFile = path.join('data', today, 'gemini_all_signals_analysis.json');
  const signalsFile = path.join('data', today, 'daily_signals.json');
  
  let analyses = [];
  let originalSignals = [];
  
  // Try Gemini results first
  if (existsSync(geminiFile)) {
    console.log('📊 Loading Gemini analysis results...');
    const geminiData = JSON.parse(readFileSync(geminiFile, 'utf8'));
    
    console.log('🔍 Debug geminiData structure:');
    console.log(`   - geminiData type: ${typeof geminiData}`);
    console.log(`   - geminiData.new_analyses: ${geminiData.new_analyses ? 'exists' : 'undefined'}`);
    console.log(`   - geminiData.all_analyses: ${geminiData.all_analyses ? 'exists' : 'undefined'}`);
    
    // Use new analyses if available, otherwise fall back to all analyses
    if (geminiData.new_analyses && Array.isArray(geminiData.new_analyses) && geminiData.new_analyses.length > 0) {
      analyses = geminiData.new_analyses;
      console.log(`✅ Loaded ${analyses.length} NEW analyses for publishing`);
    } else if (geminiData.all_analyses && Array.isArray(geminiData.all_analyses)) {
      analyses = geminiData.all_analyses;
      console.log(`✅ Loaded ${analyses.length} analyses from Gemini analysis (no new_analyses found)`);
    } else {
      console.log('⚠️  No valid analyses found in geminiData, using empty array');
      analyses = [];
    }
  } else {
    console.error('❌ No analysis results found. Run Phase 2 first.');
    console.log('   Use: node phase2/analyze_all_signals.mjs');
    process.exit(1);
  }
  
  // Load original signals for source mapping
  if (existsSync(signalsFile)) {
    console.log('📊 Loading original signals for source mapping...');
    const signalsData = JSON.parse(readFileSync(signalsFile, 'utf8'));
    originalSignals = signalsData.signals || [];
    console.log(`✅ Loaded ${originalSignals.length} original signals`);
  }
  
  if (analyses.length === 0) {
    console.log('⚠️  No analyses to publish');
    // Return a safe empty result object to prevent caller from accessing undefined
    return {
      hot: 0,
      early: 0,
      watch: 0,
      risk: 0,
      duplicates: 0,
      publish: { total: 0, sent: 0, failed: 0, failedMessages: [] }
    };
  }
  
  // Ensure analyses is an array
  console.log(`🔍 Debug analyses before processing:`);
  console.log(`   - analyses type: ${typeof analyses}`);
  console.log(`   - analyses is array: ${Array.isArray(analyses)}`);
  console.log(`   - analyses length: ${analyses ? analyses.length : 'N/A'}`);
  
  if (!Array.isArray(analyses)) {
    console.error('❌ Analyses is not an array:', typeof analyses);
    console.error('❌ Analyses value:', analyses);
    return {
      hot: 0,
      early: 0,
      watch: 0,
      risk: 0,
      duplicates: 0,
      publish: { total: 0, sent: 0, failed: 0, failedMessages: [] }
    };
  }

  // Categorize analyses with early detection focus
  const hotOpportunities = analyses.filter(analysis => Math.round(analysis.score / 10) >= 8);
  const earlySignals = analyses.filter(analysis => {
    const score = Math.round(analysis.score / 10);
    return score >= 5 && score < 8;
  });
  const watchClosely = analyses.filter(analysis => {
    const score = Math.round(analysis.score / 10);
    return score >= 4 && score < 6;
  });
  const potentialRisks = analyses.filter(analysis => Math.round(analysis.score / 10) < 4);
  
  // Special early project detection
  const earlyProjects = analyses.filter(analysis => {
    const score = Math.round(analysis.score / 10);
    const earlyTypes = ['Airdrop', 'IDO', 'ICO', 'Testnet', 'Mainnet', 'Partnership', 'Funding', 'DeFi', 'L2', 'Bridge'];
    const isEarlyType = earlyTypes.some(type => 
      analysis.opportunity_type.includes(type) || 
      analysis.project_name.toLowerCase().includes('test') ||
      analysis.project_name.toLowerCase().includes('beta') ||
      analysis.project_name.toLowerCase().includes('alpha')
    );
    // Lower threshold for early projects
    return isEarlyType && score >= 3;
  });
  
  console.log(`📊 Early Detection Categorization:`);
  console.log(`   🔥 Hot Opportunities (8-10): ${hotOpportunities.length}`);
  console.log(`   ⚡ Early Signals (6-7): ${earlySignals.length}`);
  console.log(`   👀 Watch Closely (4-5): ${watchClosely.length}`);
  console.log(`   🚀 Early Projects: ${earlyProjects.length}`);
  console.log(`   🚨 Potential Risks (1-3): ${potentialRisks.length}`);
  
  // Helper to find original signal info for dedup keys
  function enrichForDedup(analysis) {
    // Ensure analysis is valid
    if (!analysis || typeof analysis !== 'object') {
      console.error('❌ Invalid analysis in enrichForDedup:', analysis);
      return {
        project_name: 'Unknown',
        opportunity_type: 'Unknown',
        investment_angle: 'Unknown',
        evidence: [],
        score: 0,
        importance: 'Low',
        market_impact: 'Low',
        source: 'Unknown',
        title: 'Unknown',
        link: '',
        content: ''
      };
    }
    
    let originalSignal = null;
    if (analysis.evidence && Array.isArray(analysis.evidence) && analysis.evidence[0]) {
      originalSignal = originalSignals.find(signal => 
        signal.link === analysis.evidence[0] || 
        signal.url === analysis.evidence[0]
      ) || null;
    }
    
    // Create a more unique key for deduplication
    const link = analysis.evidence?.[0] || '';
    const projectName = analysis.project_name || 'Unknown';
    const opportunityType = analysis.opportunity_type || 'Unknown';
    
    // Enrich analysis with fields used by dedup tracker
    return {
      ...analysis,
      source: originalSignal?.source || 'Unknown',
      title: `${projectName} - ${opportunityType}`, // More specific title
      link: link,
      content: `${analysis.investment_angle || ''} ${analysis.reasoning || ''}`.trim(), // Combine content
      // Add URL-based deduplication key
      url_key: link.split('?')[0].split('#')[0] // Clean URL for dedup
    };
  }

  // Combine all analyses and enrich for deduplication
  const allAnalyses = [
    ...(hotOpportunities || []), 
    ...(earlySignals || []), 
    ...(watchClosely || []), 
    ...(potentialRisks || [])
  ];
  const allAnalysesForDedup = allAnalyses.map(enrichForDedup);
  
  // Pre-filter by URL to prevent same URL being analyzed multiple times
  console.log('\n🔍 Pre-filtering by URL to prevent duplicate analysis...');
  const urlSeen = new Set();
  const urlFilteredAnalyses = [];
  const urlDuplicates = [];
  const alreadyProcessedDuplicates = [];
  
  for (const analysis of allAnalysesForDedup) {
    // Skip if URL already processed in previous runs (strong guard)
    const cleanUrl = analysis.url_key || '';
    if (cleanUrl && deduplication.checkURLAlreadyProcessed(cleanUrl)) {
      alreadyProcessedDuplicates.push(analysis);
      console.log(`❌ Already processed (tracker): ${cleanUrl}`);
      continue;
    }
    
    if (analysis.url_key && urlSeen.has(analysis.url_key)) {
      urlDuplicates.push(analysis);
      console.log(`❌ URL duplicate filtered: ${analysis.url_key}`);
    } else {
      if (analysis.url_key) {
        urlSeen.add(analysis.url_key);
      }
      urlFilteredAnalyses.push(analysis);
    }
  }
  
  console.log(`📊 URL filtering results:`);
  console.log(`   ✅ Unique URLs: ${urlFilteredAnalyses.length}`);
  console.log(`   ❌ URL duplicates: ${urlDuplicates.length}`);
  console.log(`   ❌ Already-processed (tracker): ${alreadyProcessedDuplicates.length}`);
  
  // Apply advanced deduplication
  console.log('\n🔍 Applying Advanced Deduplication...');
  const dedupOptions = {
    contentSimilarityThreshold: 0.6, // More strict - 60% similarity
    titleSimilarityThreshold: 0.7,   // More strict - 70% similarity
    maxSourcePerHour: 1,             // More strict - 1 per hour
    maxSignalsPerRun: 20,            // More strict - 20 per run
    checkURLProcessed: true,         // Enable URL-based deduplication
    checkAlreadyPublished: true,     // Enable published check
    checkContent: true,              // Enable content similarity
    checkTitle: true,                // Enable title similarity
    checkSource: true                // Enable source frequency
  };
  
  const dedupResult = deduplication.filterSignalsForPublishing(urlFilteredAnalyses, dedupOptions);
  
  // Ensure dedupResult is valid
  if (!dedupResult || typeof dedupResult !== 'object') {
    console.error('❌ Invalid dedupResult:', dedupResult);
    return {
      hot: 0,
      early: 0,
      watch: 0,
      risk: 0,
      duplicates: 0,
      publish: { total: 0, sent: 0, failed: 0, failedMessages: [] }
    };
  }
  
  // Ensure dedupResult has required properties
  if (!Array.isArray(dedupResult.approved)) {
    console.error('❌ dedupResult.approved is not an array:', dedupResult.approved);
    dedupResult.approved = [];
  }
  if (!Array.isArray(dedupResult.duplicates)) {
    console.error('❌ dedupResult.duplicates is not an array:', dedupResult.duplicates);
    dedupResult.duplicates = [];
  }
  
  console.log(`\n📊 Deduplication Results:`);
  console.log(`   ✅ Approved for publishing: ${dedupResult.approved.length}`);
  console.log(`   ❌ Content duplicates filtered: ${dedupResult.duplicates.length}`);
  console.log(`   ❌ URL duplicates filtered: ${urlDuplicates.length}`);
  console.log(`   📈 Total processed: ${allAnalyses.length}`);
  console.log(`   📈 Total duplicates: ${dedupResult.duplicates.length + urlDuplicates.length}`);
  
  if (dedupResult.duplicates.length > 0) {
    console.log(`\n❌ Duplicate Details:`);
    dedupResult.duplicates.slice(0, 5).forEach((dup, index) => {
      if (dup && dup.signal && dup.reasons) {
        console.log(`   ${index + 1}. ${dup.signal.project_name} - ${dup.reasons.join(', ')}`);
      } else {
        console.log(`   ${index + 1}. Invalid duplicate object:`, dup);
      }
    });
    if (dedupResult.duplicates.length > 5) {
      console.log(`   ... and ${dedupResult.duplicates.length - 5} more duplicates`);
    }
  }
  
  // Update categorization with deduplicated results
  const approvedAnalyses = dedupResult.approved;
  const finalHotOpportunities = approvedAnalyses.filter(analysis => Math.round(analysis.score / 10) >= 8);
  const finalEarlySignals = approvedAnalyses.filter(analysis => {
    const score = Math.round(analysis.score / 10);
    return score >= 5 && score < 8;
  });
  const finalWatchClosely = approvedAnalyses.filter(analysis => {
    const score = Math.round(analysis.score / 10);
    return score >= 4 && score < 6;
  });
  const finalPotentialRisks = approvedAnalyses.filter(analysis => Math.round(analysis.score / 10) < 4);
  
  console.log(`\n📊 Final Publishing Plan (After Deduplication):`);
  console.log(`   🔥 Hot Opportunities: ${finalHotOpportunities.length}`);
  console.log(`   ⚡ Early Signals: ${finalEarlySignals.length}`);
  console.log(`   👀 Watch Closely: ${finalWatchClosely.length}`);
  console.log(`   🚨 Potential Risks: ${finalPotentialRisks.length}`);
  
  // Send summary first
  const summaryMessage = `
📊 **DAILY CRYPTO EARLY DETECTION ANALYSIS**
==========================================
📈 **Total Signals Analyzed:** ${analyses.length}
🔍 **After Deduplication:** ${approvedAnalyses.length}
🔥 **Hot Opportunities:** ${finalHotOpportunities.length}
⚡ **Early Signals:** ${finalEarlySignals.length}
👀 **Watch Closely:** ${finalWatchClosely.length}
🚨 **Potential Risks:** ${finalPotentialRisks.length}
❌ **Duplicates Filtered:** ${dedupResult.duplicates.length}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `;
  
  console.log('\n📤 Sending summary...');
  publishResults.total++;
  const summaryResult = await sendToTelegramBot(summaryMessage, botConfig);
  if (summaryResult.success) {
    publishResults.sent++;
    console.log('✅ Summary sent successfully');
  } else {
    publishResults.failed++;
    publishResults.failedMessages.push({
      type: 'summary',
      error: summaryResult.error,
      message: 'Daily analysis summary'
    });
    console.log('❌ Summary failed to send');
  }
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Send ALL hot opportunities
  if (finalHotOpportunities.length > 0) {
    console.log(`\n🔥 Publishing ${finalHotOpportunities.length} Hot Opportunities...`);
    for (let i = 0; i < finalHotOpportunities.length; i++) {
      const analysis = finalHotOpportunities[i];
      
      let originalSignal = null;
      if (analysis.evidence && analysis.evidence[0]) {
        originalSignal = originalSignals.find(signal => 
          signal.link === analysis.evidence[0] || 
          signal.url === analysis.evidence[0]
        );
      }
      
      const { message } = formatEarlyDetectionMessage(analysis, i, originalSignal);
      
      console.log(`📤 Sending hot opportunity ${i + 1}/${finalHotOpportunities.length}...`);
      console.log(`   Title: ${analysis.project_name} - ${analysis.opportunity_type}`);
      console.log(`   Score: ${Math.round(analysis.score / 10)}/10`);
      
      // Mark as processed BEFORE sending to prevent duplicate processing
      const signalForTracking = {
        source: originalSignal?.source || 'Unknown',
        title: analysis.project_name,
        link: analysis.evidence?.[0] || '',
        content: analysis.investment_angle || ''
      };
      deduplication.markAsProcessed(signalForTracking);
      
      // Final duplicate guard right before sending
      const preSendDupCheck = deduplication.checkDeduplication(signalForTracking, {
        contentSimilarityThreshold: 0.6,
        titleSimilarityThreshold: 0.7,
        maxSourcePerHour: 1,
        checkContent: true,
        checkTitle: true,
        checkSource: true,
        checkAlreadyPublished: true,
        checkURLProcessed: true
      });
      if (preSendDupCheck.isDuplicate) {
        console.log(`❌ Skipping send (final guard): ${preSendDupCheck.reasons.join(', ')}`);
        continue;
      }
      
      publishResults.total++;
      const result = await sendToTelegramBot(message, botConfig);
      if (result.success) {
        publishResults.sent++;
        console.log(`✅ Hot opportunity ${i + 1} sent successfully`);
        
        // Mark as published in deduplication tracker and persist immediately
        deduplication.markAsPublished(signalForTracking);
        deduplication.finalize();
      } else {
        publishResults.failed++;
        publishResults.failedMessages.push({
          type: 'hot_opportunity',
          error: result.error,
          message: `${analysis.project_name} - ${analysis.opportunity_type}`,
          score: Math.round(analysis.score / 10)
        });
        console.log(`❌ Failed to send hot opportunity ${i + 1}: ${result.error}`);
      }
      
      if (i < finalHotOpportunities.length - 1) {
        console.log('⏳ Waiting 2s before next message...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  // Send ALL early signals
  if (finalEarlySignals.length > 0) {
    console.log(`\n⚡ Publishing ${finalEarlySignals.length} Early Signals...`);
    for (let i = 0; i < finalEarlySignals.length; i++) {
      const analysis = finalEarlySignals[i];
      
      let originalSignal = null;
      if (analysis.evidence && analysis.evidence[0]) {
        originalSignal = originalSignals.find(signal => 
          signal.link === analysis.evidence[0] || 
          signal.url === analysis.evidence[0]
        );
      }
      
      const { message } = formatEarlyDetectionMessage(analysis, i, originalSignal);
      
      console.log(`📤 Sending early signal ${i + 1}/${finalEarlySignals.length}...`);
      console.log(`   Title: ${analysis.project_name} - ${analysis.opportunity_type}`);
      console.log(`   Score: ${Math.round(analysis.score / 10)}/10`);
      
      // Mark as processed BEFORE sending to prevent duplicate processing
      const signalForTracking = {
        source: originalSignal?.source || 'Unknown',
        title: analysis.project_name,
        link: analysis.evidence?.[0] || '',
        content: analysis.investment_angle || ''
      };
      deduplication.markAsProcessed(signalForTracking);
      
      // Final duplicate guard right before sending
      const preSendDupCheck = deduplication.checkDeduplication(signalForTracking, {
        contentSimilarityThreshold: 0.6,
        titleSimilarityThreshold: 0.7,
        maxSourcePerHour: 1,
        checkContent: true,
        checkTitle: true,
        checkSource: true,
        checkAlreadyPublished: true,
        checkURLProcessed: true
      });
      if (preSendDupCheck.isDuplicate) {
        console.log(`❌ Skipping send (final guard): ${preSendDupCheck.reasons.join(', ')}`);
        continue;
      }
      
      publishResults.total++;
      const result = await sendToTelegramBot(message, botConfig);
      if (result.success) {
        publishResults.sent++;
        console.log(`✅ Early signal ${i + 1} sent successfully`);
        
        // Mark as published in deduplication tracker and persist immediately
        deduplication.markAsPublished(signalForTracking);
        deduplication.finalize();
      } else {
        publishResults.failed++;
        publishResults.failedMessages.push({
          type: 'early_signal',
          error: result.error,
          message: `${analysis.project_name} - ${analysis.opportunity_type}`,
          score: Math.round(analysis.score / 10)
        });
        console.log(`❌ Failed to send early signal ${i + 1}: ${result.error}`);
      }
      
      if (i < finalEarlySignals.length - 1) {
        console.log('⏳ Waiting 2s before next message...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  // Send ALL watch closely items
  if (finalWatchClosely.length > 0) {
    console.log(`\n👀 Publishing ${finalWatchClosely.length} Watch Closely Items...`);
    for (let i = 0; i < finalWatchClosely.length; i++) {
      const analysis = finalWatchClosely[i];
      
      let originalSignal = null;
      if (analysis.evidence && analysis.evidence[0]) {
        originalSignal = originalSignals.find(signal => 
          signal.link === analysis.evidence[0] || 
          signal.url === analysis.evidence[0]
        );
      }
      
      const { message } = formatEarlyDetectionMessage(analysis, i, originalSignal);
      
      console.log(`📤 Sending watch item ${i + 1}/${watchClosely.length}...`);
      console.log(`   Title: ${analysis.project_name} - ${analysis.opportunity_type}`);
      console.log(`   Score: ${Math.round(analysis.score / 10)}/10`);
      
      // Final duplicate guard right before sending
      const preSendDupCheck = deduplication.checkDeduplication({
        source: originalSignal?.source || 'Unknown',
        title: analysis.project_name,
        link: analysis.evidence?.[0] || '',
        content: analysis.investment_angle || ''
      }, {
        contentSimilarityThreshold: 0.6,
        titleSimilarityThreshold: 0.7,
        maxSourcePerHour: 1,
        checkContent: true,
        checkTitle: true,
        checkSource: true,
        checkAlreadyPublished: true,
        checkURLProcessed: true
      });
      if (preSendDupCheck.isDuplicate) {
        console.log(`❌ Skipping send (final guard): ${preSendDupCheck.reasons.join(', ')}`);
        continue;
      }
      
      const result = await sendToTelegramBot(message, botConfig);
      if (result.success) {
        console.log(`✅ Watch item ${i + 1} sent successfully`);
        // Mark as published to prevent future resend
        const signalForTracking = {
          source: originalSignal?.source || 'Unknown',
          title: analysis.project_name,
          link: analysis.evidence?.[0] || '',
          content: analysis.investment_angle || ''
        };
        deduplication.markAsPublished(signalForTracking);
        deduplication.finalize();
      } else {
        console.log(`❌ Failed to send watch item ${i + 1}`);
      }
      
      if (i < watchClosely.length - 1) {
        console.log('⏳ Waiting 2s before next message...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  // Send limited risk alerts (max 10) from deduplicated list
  if (finalPotentialRisks.length > 0) {
    console.log(`\n🚨 Publishing ${Math.min(finalPotentialRisks.length, 10)} Risk Alerts...`);
    for (let i = 0; i < Math.min(finalPotentialRisks.length, 10); i++) {
      const analysis = finalPotentialRisks[i];
      
      let originalSignal = null;
      if (analysis.evidence && analysis.evidence[0]) {
        originalSignal = originalSignals.find(signal => 
          signal.link === analysis.evidence[0] || 
          signal.url === analysis.evidence[0]
        );
      }
      
      const { message } = formatEarlyDetectionMessage(analysis, i, originalSignal);
      
      console.log(`📤 Sending risk alert ${i + 1}/${Math.min(finalPotentialRisks.length, 10)}...`);
      console.log(`   Title: ${analysis.project_name} - ${analysis.opportunity_type}`);
      console.log(`   Score: ${Math.round(analysis.score / 10)}/10`);
      
      // Final duplicate guard right before sending
      const preSendDupCheck = deduplication.checkDeduplication({
        source: originalSignal?.source || 'Unknown',
        title: analysis.project_name,
        link: analysis.evidence?.[0] || '',
        content: analysis.investment_angle || ''
      }, {
        contentSimilarityThreshold: 0.6,
        titleSimilarityThreshold: 0.7,
        maxSourcePerHour: 1,
        checkContent: true,
        checkTitle: true,
        checkSource: true,
        checkAlreadyPublished: true,
        checkURLProcessed: true
      });
      if (preSendDupCheck.isDuplicate) {
        console.log(`❌ Skipping send (final guard): ${preSendDupCheck.reasons.join(', ')}`);
        continue;
      }
      
      const result = await sendToTelegramBot(message, botConfig);
      if (result.success) {
        console.log(`✅ Risk alert ${i + 1} sent successfully`);
        // Mark as published to prevent future resend
        const signalForTracking = {
          source: originalSignal?.source || 'Unknown',
          title: analysis.project_name,
          link: analysis.evidence?.[0] || '',
          content: analysis.investment_angle || ''
        };
        deduplication.markAsPublished(signalForTracking);
        deduplication.finalize();
      } else {
        console.log(`❌ Failed to send risk alert ${i + 1}`);
      }
      
      if (i < Math.min(finalPotentialRisks.length, 10) - 1) {
        console.log('⏳ Waiting 2s before next message...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  console.log('\n📊 Publishing Summary:');
  console.log('=====================');
  console.log(`📤 Total Messages: ${publishResults.total}`);
  console.log(`✅ Successfully Sent: ${publishResults.sent}`);
  console.log(`❌ Failed to Send: ${publishResults.failed}`);
  console.log(`📊 Success Rate: ${publishResults.total > 0 ? Math.round((publishResults.sent / publishResults.total) * 100) : 0}%`);
  
  if (publishResults.failed > 0) {
    console.log('\n❌ Failed Messages:');
    console.log('==================');
    publishResults.failedMessages.forEach((failed, index) => {
      console.log(`${index + 1}. ${failed.type}: ${failed.message}`);
      console.log(`   Error: ${failed.error}`);
      if (failed.score) console.log(`   Score: ${failed.score}/10`);
    });
    
    // Save failed messages to file for manual review
    const today = new Date().toISOString().slice(0, 10);
    const failedDir = path.join('data', today);
    if (!existsSync(failedDir)) {
      mkdirSync(failedDir, { recursive: true });
    }
    
    const failedFile = path.join(failedDir, 'failed_telegram_messages.json');
    writeFileSync(failedFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      total_failed: publishResults.failed,
      failed_messages: publishResults.failedMessages
    }, null, 2));
    
    console.log(`\n💾 Failed messages saved to: ${failedFile}`);
    console.log('   You can manually send these messages or retry later');
  }
  
  // Finalize deduplication tracker
  deduplication.finalize();
  
  console.log('\n📊 Content Summary:');
  console.log('==================');
  console.log(`🔥 Hot Opportunities: ${finalHotOpportunities.length}`);
  console.log(`⚡ Early Signals: ${finalEarlySignals.length}`);
  console.log(`👀 Watch Closely: ${finalWatchClosely.length}`);
  console.log(`🚨 Risk Alerts: ${finalPotentialRisks.length}`);
  console.log(`❌ Duplicates Filtered: ${dedupResult.duplicates.length}`);
  console.log(`📡 Channel: ${TARGET_CHANNEL}`);
  console.log(`🤖 Bot: ${TG_TOKEN.substring(0, 10)}...`);
  
  return {
    hot: finalHotOpportunities.length,
    early: finalEarlySignals.length,
    watch: finalWatchClosely.length,
    risk: finalPotentialRisks.length,
    duplicates: dedupResult.duplicates.length + urlDuplicates.length,
    url_duplicates: urlDuplicates.length,
    content_duplicates: dedupResult.duplicates.length,
    publish: publishResults
  };
}

// Run if called directly
if (process.argv[1] && process.argv[1].endsWith('publish_early_detection.mjs')) {
  publishEarlyDetection()
    .then(results => {
      console.log(`✅ Phase 3 complete: ${results.hot} hot, ${results.early} early, ${results.watch} watch, ${results.risk} risk alerts published`);
      process.exit(0);
    })
    .catch(error => {
      console.error(`❌ Phase 3 failed: ${error.message}`);
      process.exit(1);
    });
}

export { publishEarlyDetection };
