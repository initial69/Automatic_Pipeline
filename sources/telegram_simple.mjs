#!/usr/bin/env node

import 'dotenv/config';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { CRYPTO_KEYWORDS } from '../keywords.mjs';
import { cutoffMs24h, localISO } from '../utils/time_window.mjs';

const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;
const SESSION_PATH = 'config/telegram.session';

// Channel IDs yang akan dibaca
const CHANNELS = [-1002294721332, -1001182619094, -1001364412069, -1001390962936, -1001146915409];

// Using imported CRYPTO_KEYWORDS from keywords.mjs

async function readTelegramMessages() {
  console.log('🚀 Membaca pesan Telegram...');
  console.log('='.repeat(50));
  
  // Debug environment and paths
  console.log(`🔑 API_ID: ${process.env.API_ID ? 'SET' : 'NOT SET'}`);
  console.log(`🔑 API_HASH: ${process.env.API_HASH ? 'SET' : 'NOT SET'}`);
  console.log(`📁 Working directory: ${process.cwd()}`);
  console.log(`📁 Session path: ${SESSION_PATH}`);
  console.log(`📁 Config exists: ${existsSync('config')}`);
  if (existsSync('config')) {
    console.log(`📁 Config contents: ${readdirSync('config').join(', ')}`);
  }
  
  if (!existsSync(SESSION_PATH)) {
    console.error('❌ File session tidak ditemukan. Jalankan: node scripts/tg_login.mjs');
    console.error(`📁 Looking for session at: ${SESSION_PATH}`);
    console.error(`📁 Current working directory: ${process.cwd()}`);
    console.error(`📁 Files in config/: ${existsSync('config') ? readdirSync('config').join(', ') : 'config directory does not exist'}`);
    return [];
  }

  // Debug session file
  const sessionContent = readFileSync(SESSION_PATH, 'utf8');
  console.log(`📏 Session file size: ${sessionContent.length} characters`);
  console.log(`🔤 First 50 chars: ${sessionContent.substring(0, 50)}...`);
  console.log(`🔤 Last 50 chars: ...${sessionContent.substring(sessionContent.length - 50)}`);

  // Overall timeout untuk seluruh proses Telegram (2 menit)
  const telegramTimeout = setTimeout(() => {
    console.log('\n⏰ Telegram timeout reached (2 minutes), stopping...');
    process.exit(0);
  }, 2 * 60 * 1000);

  const sessionStr = readFileSync(SESSION_PATH, 'utf8');
  const client = new TelegramClient(new StringSession(sessionStr), apiId, apiHash, {
    connectionRetries: 2,
    timeout: 20000,
    requestRetries: 2,
    retryDelay: 1000,
    useWSS: false, // Disable WebSocket untuk stability
    floodSleepThreshold: 60
  });

  try {
    await client.connect();
    console.log('✅ Terhubung ke Telegram');
  } catch (error) {
    console.error('❌ Gagal terhubung ke Telegram:', error.message);
    clearTimeout(telegramTimeout);
    return [];
  }

  const results = [];
  const cutoff = cutoffMs24h();

  for (const channelId of CHANNELS) {
    try {
      console.log(`\n📱 Membaca channel: ${channelId}`);
      
      const entity = await client.getEntity(channelId);
      
      // Safe getMessages dengan retry
      let messages = [];
      for (let retry = 0; retry < 3; retry++) {
        try {
          messages = await client.getMessages(entity, { limit: 1000 });
          break; // Success, exit retry loop
        } catch (e) {
          if (retry === 2) throw e; // Final attempt failed
          console.warn(`Retry ${retry + 1}/3 for channel ${channelId}:`, e.message);
          await new Promise(r => setTimeout(r, 1000 * (retry + 1))); // Exponential backoff
        }
      }
      
      console.log(`📊 Ditemukan ${messages.length} pesan`);
      
      let validMessages = 0;
      let messagesIn24h = 0;
      let messagesWithLinks = 0;
      let messagesWithCryptoKeywords = 0;
      
      for (const msg of messages) {
        if (!msg?.message || !msg?.date) continue;
        
        const messageTime = msg.date * 1000;          // epoch ms (UTC)
        if (messageTime < cutoff) continue;           // hanya 24 jam terakhir
        messagesIn24h++;
        
        const text = msg.message.toLowerCase();
        
        // Cek apakah ada link
        const hasLink = /https?:\/\/\S+/.test(text);
        if (hasLink) messagesWithLinks++;
        if (!hasLink) continue;
        
        // Cek apakah ada keyword crypto
        const hasCryptoKeyword = CRYPTO_KEYWORDS.some(k => text.includes(k.toLowerCase()));
        if (hasCryptoKeyword) messagesWithCryptoKeywords++;
        if (!hasCryptoKeyword) continue;
        
        // Ambil link pertama
        const linkMatch = msg.message.match(/https?:\/\/\S+/);
        const link = linkMatch ? linkMatch[0] : null;
        
        if (link) {
          results.push({
            source: entity.title || `Channel ${channelId}`,
            title: msg.message.split('\n')[0].substring(0, 100),
            link: link,
            time: localISO(new Date(messageTime)),   // 👉 Swiss time
            messageId: msg.id,
            channel: 'telegram'
          });
          validMessages++;
        }
      }
      
      console.log(`📈 Statistik channel:`);
      console.log(`   - Total pesan dalam 24h: ${messagesIn24h}`);
      console.log(`   - Pesan dengan link: ${messagesWithLinks}`);
      console.log(`   - Pesan dengan keyword crypto: ${messagesWithCryptoKeywords}`);
      console.log(`   - Pesan valid (link + crypto): ${validMessages}`);
      
      // Delay antar channel
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      if (error.message.includes('TIMEOUT')) {
        console.warn(`⚠️  Timeout membaca channel ${channelId}`);
      } else {
        console.error(`❌ Error membaca channel ${channelId}:`, error.message);
      }
    }
  }

  try {
    await client.disconnect();
  } catch (error) {
    console.warn('⚠️  TG disconnect warn:', error.message);
  }
  
  // Clear timeout
  clearTimeout(telegramTimeout);
  
  console.log('\n📊 HASIL AKHIR:');
  console.log('='.repeat(50));
  console.log(`Total pesan yang memenuhi kriteria: ${results.length}`);
  
  if (results.length > 0) {
    results.forEach((msg, i) => {
      console.log(`\n${i+1}. [${msg.source}]`);
      console.log(`   Judul: ${msg.title}`);
      console.log(`   Link: ${msg.link}`);
      console.log(`   Waktu: ${msg.time}`);
    });
  } else {
    console.log('❌ Tidak ada pesan yang memenuhi kriteria:');
    console.log('   - Harus ada link');
    console.log('   - Harus ada keyword crypto');
    console.log('   - Harus dalam 24 jam terakhir');
  }
  
  return results;
}

// Jalankan jika dipanggil langsung
if (process.argv[1] && process.argv[1].endsWith('telegram_simple.mjs')) {
  readTelegramMessages()
    .then(() => {
      console.log('\n✅ Telegram process completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Telegram process failed:', error.message);
      process.exit(1);
    });
}

export { readTelegramMessages };
