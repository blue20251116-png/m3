'use strict';

const crypto = require('crypto');

const jobs = new Map();
const MAX_AGE_MS = 5 * 60 * 1000;

function cleanup() {
  const cutoff = Date.now() - MAX_AGE_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff || job.status === 'done' || job.status === 'expired') jobs.delete(id);
  }
}

function createJob(url) {
  cleanup();
  const id = crypto.randomUUID();
  const job = {
    id,
    url: String(url || '').trim(),
    status: 'pending',
    createdAt: Date.now(),
    claimedAt: null,
    result: null,
    error: null,
    waiters: [],
  };
  jobs.set(id, job);
  console.log(`[M3][BROWSER BRIDGE] queued job=${id} url=${job.url.slice(0,180)}`);
  return job;
}

function listPending() {
  cleanup();
  return [...jobs.values()]
    .filter(j => j.status === 'pending')
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, 5)
    .map(j => ({ id: j.id, url: j.url, status: j.status, createdAt: new Date(j.createdAt).toISOString() }));
}

function claimJob(id) {
  const job = jobs.get(String(id || ''));
  if (!job || job.status !== 'pending') return null;
  job.status = 'claimed';
  job.claimedAt = Date.now();
  return { id: job.id, url: job.url, status: job.status };
}

function normalizeResult(input, originalUrl) {
  const images = [...new Set((Array.isArray(input?.images) ? input.images : [])
    .map(x => String(x || '').trim())
    .filter(x => /^https?:\/\//i.test(x)))]
    .slice(0, 12);
  const productName = String(input?.productName || input?.pageTitle || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const priceRaw = input?.price == null ? null : String(input.price).replace(/[^0-9.]/g, '');
  const price = priceRaw ? Number(priceRaw) : null;
  return {
    productName,
    brand: String(input?.brand || '').replace(/\s+/g, ' ').trim().slice(0, 120) || null,
    price: Number.isFinite(price) ? price : null,
    images,
    productUrl: String(input?.finalUrl || input?.productUrl || originalUrl || '').trim(),
    destinationUrl: String(input?.finalUrl || originalUrl || '').trim(),
    description: String(input?.description || '').replace(/\s+/g, ' ').trim().slice(0, 1200),
    dataSource: 'browser-bridge',
    browserBridgePageTitle: String(input?.pageTitle || '').replace(/\s+/g, ' ').trim().slice(0, 300),
  };
}

function submitResult(id, payload) {
  const job = jobs.get(String(id || ''));
  if (!job) return { ok: false, reason: 'JOB_NOT_FOUND' };
  if (job.status === 'done') return { ok: true, duplicate: true };
  job.result = normalizeResult(payload || {}, job.url);
  job.error = payload?.error ? String(payload.error).slice(0, 500) : null;
  job.status = 'done';
  const waiters = job.waiters.splice(0);
  for (const resolve of waiters) resolve(job.result);
  console.log(`[M3][BROWSER BRIDGE] done job=${job.id} product="${job.result.productName || '-'}" images=${job.result.images.length}`);
  return { ok: true };
}

async function requestBrowserExtraction(url, { timeoutMs = 45000 } = {}) {
  if (!/^https?:\/\//i.test(String(url || ''))) return null;
  const job = createJob(url);
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    job.waiters.push(finish);
    setTimeout(() => {
      if (job.status !== 'done') {
        job.status = 'expired';
        console.warn(`[M3][BROWSER BRIDGE] timeout job=${job.id} after=${timeoutMs}ms → search fallback`);
      }
      finish(job.status === 'done' ? job.result : null);
    }, Math.max(5000, Number(timeoutMs) || 45000));
  });
}

module.exports = { listPending, claimJob, submitResult, requestBrowserExtraction };
