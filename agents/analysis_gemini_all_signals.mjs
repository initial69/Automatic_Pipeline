#!/usr/bin/env node

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GeminiMultiKeyManager } from './gemini_multi_key_manager.mjs';

export async function analyzeAllSignalsWithGemini(signals) {
  console.log('\n🧠 Starting Gemini ALL Signals Analysis...');
  console.log(`📊 Processing ${signals.length} signals for comprehensive analysis`);
  
  const keyManager = new GeminiMultiKeyManager();
  keyManager.displayStatus();
  
  if (keyManager.apiKeys.length === 0) {
    console.log('❌ No Gemini API keys found in .env file');
    return null;
  }

  console.log('✅ Gemini multi-key manager initialized');

  const results = {
    timestamp: new Date().toISOString(),
    total_signals: signals.length,
    analyzed_signals: 0,
    all_analyses: [], // Store ALL analyses, not just opportunities
    errors: []
  };

  const BATCH_SIZE = 10;
  const batches = [];
  for (let i = 0; i < signals.length; i += BATCH_SIZE) {
    batches.push(signals.slice(i, i + BATCH_SIZE));
  }

  console.log(`📦 Processing ${batches.length} batches of ${BATCH_SIZE} signals each`);

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    console.log(`\n📊 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} signals)`);

    try {
      const batchResults = await processBatchWithGeminiAllSignals(batch, batchIndex, keyManager);
      results.all_analyses.push(...batchResults);
      results.analyzed_signals += batch.length;
      
      console.log(`✅ Batch ${batchIndex + 1} complete: ${batchResults.length} analyses found`);
      
      if (batchIndex < batches.length - 1) {
        console.log(`⏳ Waiting 5s before next batch...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (error) {
      console.error(`❌ Error processing batch ${batchIndex + 1}: ${error.message}`);
      results.errors.push({
        batch_index: batchIndex,
        error: error.message
      });
    }
  }
  
  // Save results
  const today = new Date().toISOString().slice(0, 10);
  const outputDir = path.join('data', today);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  
  const resultsFile = path.join(outputDir, 'gemini_all_signals_analysis.json');
  const summaryFile = path.join(outputDir, 'gemini_all_signals_summary.txt');
  
  writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  
  // Create comprehensive summary
  const summary = `Gemini ALL Signals Analysis Results - ${today}
==============================================

Total Signals Analyzed: ${results.analyzed_signals}/${results.total_signals}
All Analyses Found: ${results.all_analyses.length}
Errors: ${results.errors.length}

SCORING DISTRIBUTION:
====================
${getScoringDistribution(results.all_analyses)}

TOP OPPORTUNITIES (Score 7-10):
===============================
${results.all_analyses
  .filter(analysis => Math.round(analysis.score / 10) >= 7)
  .sort((a, b) => b.score - a.score)
  .slice(0, 20)
  .map((analysis, index) => `${index + 1}. ${analysis.project_name} (Score: ${Math.round(analysis.score / 10)}/10)
   Type: ${analysis.opportunity_type}
   Importance: ${analysis.importance}
   Market Impact: ${analysis.market_impact || 'Unknown'}
   Timeline: ${analysis.timeline || 'Unknown'}
   Investment Angle: ${analysis.investment_angle}
   Risk: ${analysis.risk_level}
   Evidence: ${analysis.evidence ? analysis.evidence.join(', ') : 'None'}
   Reasoning: ${analysis.reasoning}
`).join('\n')}

NEED MANUAL CHECK (Score 4-6):
==============================
${results.all_analyses
  .filter(analysis => {
    const score = Math.round(analysis.score / 10);
    return score >= 4 && score <= 6;
  })
  .sort((a, b) => b.score - a.score)
  .slice(0, 20)
  .map((analysis, index) => `${index + 1}. ${analysis.project_name} (Score: ${Math.round(analysis.score / 10)}/10)
   Type: ${analysis.opportunity_type}
   Importance: ${analysis.importance}
   Market Impact: ${analysis.market_impact || 'Unknown'}
   Timeline: ${analysis.timeline || 'Unknown'}
   Investment Angle: ${analysis.investment_angle}
   Risk: ${analysis.risk_level}
   Evidence: ${analysis.evidence ? analysis.evidence.join(', ') : 'None'}
   Reasoning: ${analysis.reasoning}
`).join('\n')}

POTENTIAL SCAMS (Score 1-3):
============================
${results.all_analyses
  .filter(analysis => Math.round(analysis.score / 10) <= 3)
  .sort((a, b) => b.score - a.score)
  .slice(0, 20)
  .map((analysis, index) => `${index + 1}. ${analysis.project_name} (Score: ${Math.round(analysis.score / 10)}/10)
   Type: ${analysis.opportunity_type}
   Importance: ${analysis.importance}
   Market Impact: ${analysis.market_impact || 'Unknown'}
   Timeline: ${analysis.timeline || 'Unknown'}
   Investment Angle: ${analysis.investment_angle}
   Risk: ${analysis.risk_level}
   Evidence: ${analysis.evidence ? analysis.evidence.join(', ') : 'None'}
   Reasoning: ${analysis.reasoning}
`).join('\n')}
`;

  writeFileSync(summaryFile, summary);
  
  console.log(`\n✅ Gemini ALL Signals Analysis Complete!`);
  console.log(`📊 Analyzed: ${results.analyzed_signals}/${results.total_signals} signals`);
  console.log(`🎯 All analyses found: ${results.all_analyses.length}`);
  console.log(`❌ Errors: ${results.errors.length}`);
  console.log(`📁 Results saved to: ${resultsFile}`);
  console.log(`📄 Summary saved to: ${summaryFile}`);
  
  return results;
}

async function processBatchWithGeminiAllSignals(signals, batchIndex, keyManager) {
  const prompt = createAllSignalsAnalysisPrompt(signals);
  const maxRetries = keyManager.apiKeys.length; // Max retries equals number of keys
  
  // Delay between requests
  if (batchIndex > 0) {
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  for (let retry = 0; retry < maxRetries; retry++) {
    let keyInfo;
    try {
      // Get available API key
      keyInfo = keyManager.getAvailableKey();
      console.log(`🔄 Attempt ${retry + 1}/${maxRetries} with ${keyInfo.name}`);
      
      const genAI = new GoogleGenerativeAI(keyInfo.key);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // Record successful usage
      keyManager.recordUsage(keyInfo.name, true);
      console.log(`✅ Success with ${keyInfo.name}`);
      
      // Parse JSON response - handle markdown format
      let jsonText = text;
      if (text.includes('```json')) {
        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          jsonText = jsonMatch[1];
        }
      }
      
      const analysis = JSON.parse(jsonText);
      return Array.isArray(analysis) ? analysis : [analysis];
      
    } catch (error) {
      console.log(`❌ Error with ${keyInfo.name}: ${error.message}`);
      
      // Record failed usage
      keyManager.recordUsage(keyInfo.name, false);
      
      // Check if it's a 429 error (rate limit) or 503 (service unavailable)
      if (error.message.includes('429') || error.message.includes('503')) {
        console.log(`🔄 Rate limit/service error with ${keyInfo.name}, trying next key...`);
        
        // Mark this key as exhausted if it's a 429 error
        if (error.message.includes('429')) {
          const keyUsage = keyManager.usage[keyInfo.name] || { requests: 0, errors: 0, exhausted: false };
          keyUsage.exhausted = true;
          keyManager.usage[keyInfo.name] = keyUsage;
          keyManager.saveUsage();
          console.log(`⚠️  Marked ${keyInfo.name} as exhausted due to 429 error`);
        }
        
        // Wait a bit before trying next key
        if (retry < maxRetries - 1) {
          console.log(`⏳ Waiting 3s before trying next key...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        continue; // Try next key
      } else {
        // For other errors, don't retry
        throw new Error(`Gemini analysis failed: ${error.message}`);
      }
    }
  }
  
  // If we get here, all keys failed
  throw new Error(`All Gemini API keys failed after ${maxRetries} attempts`);
}

function createAllSignalsAnalysisPrompt(signals) {
  const signalsText = signals.map((signal, index) => {
    return `${index + 1}. **${signal.title || 'Untitled'}**
   Source: ${signal.source}
   URL: ${signal.link || 'No URL'}
   Channel: ${signal.channel || 'Unknown'}
   Category: ${signal.category || 'Unknown'}
   Priority: ${signal.priority || 'Unknown'}`;
  }).join('\n\n');

  return `You are a comprehensive cryptocurrency signal analyst. Analyze ALL these signals and provide analysis for EVERY SINGLE ONE.

For EACH signal, you MUST provide analysis regardless of whether it's an opportunity or not. Analyze:
- Investment opportunities (ICOs, partnerships, product launches)
- Market updates and news
- Technical developments
- Potential scams or suspicious activities
- General crypto news and updates
- Airdrops and rewards
- DeFi protocols and innovations
- Layer 2 solutions
- Cross-chain developments

For EVERY signal, provide:
- Project/entity name
- Signal type (Opportunity|News|Update|Scam|Technical|Partnership|Funding|Airdrop|DeFi|L2|Bridge|Other)
- Importance level
- Investment angle (even if negative)
- Risk assessment
- Evidence/sources
- Reasoning
- Score (1-100)
- Market impact
- Timeline

Return ONLY valid JSON in this format:
[
  {
    "project_name": "Project/Entity Name",
    "opportunity_type": "Opportunity|News|Update|Scam|Technical|Partnership|Funding|Airdrop|DeFi|L2|Bridge|Other",
    "importance": "High|Medium|Low",
    "investment_angle": "Description of investment angle (positive or negative)",
    "risk_level": "Low|Medium|High",
    "evidence": ["url1", "url2"],
    "reasoning": "Why this signal is important or not",
    "score": 85,
    "market_impact": "High|Medium|Low",
    "timeline": "Immediate|Short-term|Medium-term|Long-term"
  }
]

IMPORTANT: You MUST analyze ALL ${signals.length} signals. Return an array with exactly ${signals.length} items.

Signals to analyze:
${signalsText}

Return valid JSON only, no other text.`;
}

function getScoringDistribution(analyses) {
  const distribution = analyses.reduce((acc, analysis) => {
    const score = Math.round(analysis.score / 10);
    if (score >= 7) acc.good++;
    else if (score >= 4) acc.check++;
    else acc.scam++;
    return acc;
  }, { good: 0, check: 0, scam: 0 });
  
  return `Good Opportunities (7-10): ${distribution.good}
Need Manual Check (4-6): ${distribution.check}
Potential Scams (1-3): ${distribution.scam}`;
}
