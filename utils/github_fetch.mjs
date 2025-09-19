#!/usr/bin/env node

import 'dotenv/config';

// Helper untuk fetch GitHub API dengan headers yang benar
export async function ghFetchJSON(path) {
  const url = `https://api.github.com${path}`;
  const headers = {
    'User-Agent': 'early-pipeline/1.0 (+github.com/your-repo)',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  
  const res = await fetch(url, { headers });
  
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status} ${res.statusText} :: ${url} :: ${text.slice(0,200)}`);
  }
  
  return res.json();
}

// Rate limiting helper
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Check rate limit status
export async function checkRateLimit() {
  try {
    const response = await fetch('https://api.github.com/rate_limit', {
      headers: {
        'User-Agent': 'early-pipeline/1.0 (+github.com/your-repo)',
        'Accept': 'application/vnd.github+json',
        ...(process.env.GITHUB_TOKEN ? { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } : {})
      }
    });
    
    const data = await response.json();
    return {
      remaining: data.rate?.remaining || 0,
      reset: data.rate?.reset || 0,
      limit: data.rate?.limit || 60
    };
  } catch (error) {
    console.warn('⚠️ Could not check rate limit:', error.message);
    return { remaining: 0, reset: 0, limit: 60 };
  }
}
