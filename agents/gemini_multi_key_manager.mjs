import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export class GeminiMultiKeyManager {
  constructor() {
    this.apiKeys = this.loadApiKeys();
    this.currentKeyIndex = 0;
    this.usageFile = path.join('data', `gemini_usage_${new Date().toISOString().slice(0, 10)}.json`);
    this.usage = this.loadUsage();
    this.maxRequestsPerKey = 50; // Free tier limit
  }

  loadApiKeys() {
    const keys = [];
    for (let i = 1; i <= 10; i++) {
      const key = process.env[`GEMINI_API_KEY${i}`];
      if (key && key.trim()) {
        keys.push({
          key: key.trim(),
          index: i,
          name: `GEMINI_API_KEY${i}`
        });
      }
    }
    return keys;
  }

  loadUsage() {
    if (!existsSync(this.usageFile)) {
      return {};
    }
    try {
      return JSON.parse(readFileSync(this.usageFile, 'utf8'));
    } catch (error) {
      console.error('Error loading usage file:', error.message);
      return {};
    }
  }

  saveUsage() {
    try {
      if (!existsSync('data')) {
        mkdirSync('data', { recursive: true });
      }
      writeFileSync(this.usageFile, JSON.stringify(this.usage, null, 2));
    } catch (error) {
      console.error('Error saving usage file:', error.message);
    }
  }

  getAvailableKey() {
    if (this.apiKeys.length === 0) {
      throw new Error('No Gemini API keys available');
    }

    // Find a key that hasn't exceeded the limit and isn't exhausted
    for (let i = 0; i < this.apiKeys.length; i++) {
      const keyIndex = (this.currentKeyIndex + i) % this.apiKeys.length;
      const key = this.apiKeys[keyIndex];
      const keyUsage = this.usage[key.name] || { requests: 0, lastUsed: null, exhausted: false };
      
      console.log(`🔍 Checking ${key.name}: ${keyUsage.requests}/${this.maxRequestsPerKey} requests used, exhausted: ${keyUsage.exhausted}`);
      
      if (keyUsage.requests < this.maxRequestsPerKey && !keyUsage.exhausted) {
        this.currentKeyIndex = keyIndex;
        console.log(`✅ Selected ${key.name} (${keyUsage.requests}/${this.maxRequestsPerKey} used)`);
        return key;
      }
    }

    // If all keys are exhausted, use the first one anyway
    console.log('⚠️  All Gemini API keys have reached their daily limit. Using first key anyway.');
    return this.apiKeys[0];
  }

  recordUsage(keyName, success = true) {
    if (!this.usage[keyName]) {
      this.usage[keyName] = { requests: 0, errors: 0, lastUsed: null, exhausted: false };
    }
    
    this.usage[keyName].requests++;
    this.usage[keyName].lastUsed = new Date().toISOString();
    
    if (!success) {
      this.usage[keyName].errors++;
      // If we get a 429 error, mark this key as exhausted for today
      if (this.usage[keyName].errors >= 3) {
        this.usage[keyName].exhausted = true;
        console.log(`⚠️  Marking ${keyName} as exhausted due to repeated errors`);
      }
    }
    
    this.saveUsage();
  }

  displayStatus() {
    console.log('\n🔑 Gemini API Keys Status:');
    console.log('==========================');
    
    if (this.apiKeys.length === 0) {
      console.log('❌ No Gemini API keys found');
      return;
    }

    this.apiKeys.forEach((key, index) => {
      const keyUsage = this.usage[key.name] || { requests: 0, errors: 0, exhausted: false };
      const remaining = Math.max(0, this.maxRequestsPerKey - keyUsage.requests);
      const status = (remaining > 0 && !keyUsage.exhausted) ? '✅' : '❌';
      
      console.log(`${status} ${key.name}: ${keyUsage.requests}/${this.maxRequestsPerKey} requests used (${remaining} remaining)`);
      if (keyUsage.errors > 0) {
        console.log(`   Errors: ${keyUsage.errors}`);
      }
      if (keyUsage.exhausted) {
        console.log(`   Status: EXHAUSTED`);
      }
    });
  }
}
