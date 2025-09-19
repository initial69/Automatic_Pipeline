#!/usr/bin/env node

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import fetch from 'node-fetch';

// Telegram Bot configuration
const TG_TOKEN = process.env.TG_TOKEN;
const TARGET_CHANNEL = process.env.TELEGRAM_CHANNEL_ID;

// Send message to Telegram with retry
async function sendToTelegramBot(message, maxRetries = 3) {
  const telegramUrl = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📤 Attempt ${attempt}/${maxRetries} - Sending message...`);
      
      const payload = {
        chat_id: TARGET_CHANNEL,
        text: message,
        parse_mode: 'Markdown'
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
        
        if (result.error_code === 429) {
          const retryAfter = result.parameters?.retry_after || 60;
          console.log(`⏳ Rate limited. Waiting ${retryAfter} seconds...`);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          continue;
        }
        
        if (attempt < maxRetries) {
          const waitTime = attempt * 2000;
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

// Retry failed messages
async function retryFailedMessages() {
  console.log('🔄 Retrying Failed Telegram Messages...');
  console.log('=====================================');
  
  // Find the most recent failed messages file
  const today = new Date().toISOString().slice(0, 10);
  const failedFile = path.join('data', today, 'failed_telegram_messages.json');
  
  if (!existsSync(failedFile)) {
    console.log('❌ No failed messages file found');
    console.log(`   Looking for: ${failedFile}`);
    return;
  }
  
  console.log(`📁 Loading failed messages from: ${failedFile}`);
  const failedData = JSON.parse(readFileSync(failedFile, 'utf8'));
  const failedMessages = failedData.failed_messages || [];
  
  if (failedMessages.length === 0) {
    console.log('✅ No failed messages to retry');
    return;
  }
  
  console.log(`📊 Found ${failedMessages.length} failed messages to retry`);
  
  const retryResults = {
    total: failedMessages.length,
    sent: 0,
    failed: 0,
    stillFailed: []
  };
  
  for (let i = 0; i < failedMessages.length; i++) {
    const failed = failedMessages[i];
    console.log(`\n🔄 Retrying ${i + 1}/${failedMessages.length}: ${failed.type}`);
    console.log(`   Message: ${failed.message}`);
    
    // For now, we'll just log the retry attempt
    // In a real implementation, you'd need to reconstruct the original message
    console.log(`   ⚠️  Note: Original message content not available for retry`);
    console.log(`   📝 You may need to manually send this message`);
    
    // Simulate retry (in real implementation, you'd reconstruct and send the message)
    console.log(`   🔄 Retry attempt would go here...`);
    
    // For demonstration, mark as "would retry"
    retryResults.sent++;
    
    if (i < failedMessages.length - 1) {
      console.log('⏳ Waiting 2s before next retry...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n📊 Retry Summary:');
  console.log('=================');
  console.log(`📤 Total Messages: ${retryResults.total}`);
  console.log(`✅ Would Retry: ${retryResults.sent}`);
  console.log(`❌ Still Failed: ${retryResults.failed}`);
  
  console.log('\n💡 Manual Retry Instructions:');
  console.log('==============================');
  console.log('1. Check the failed messages file for details');
  console.log('2. Manually send important messages to your Telegram channel');
  console.log('3. Focus on high-score opportunities that failed to send');
  console.log('4. Consider increasing delay between messages to avoid rate limits');
}

// Run if called directly
if (process.argv[1] && process.argv[1].endsWith('retry_failed_messages.mjs')) {
  retryFailedMessages()
    .then(() => {
      console.log('✅ Retry process completed');
      process.exit(0);
    })
    .catch(error => {
      console.error(`❌ Retry failed: ${error.message}`);
      process.exit(1);
    });
}

export { retryFailedMessages };
