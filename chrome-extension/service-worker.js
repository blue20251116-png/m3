const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(path, opt = {}) {
  const saved = await chrome.storage.local.get(['baseUrl', 'adminPassword']);
  const baseUrl = String(saved.baseUrl || '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('M3 서버 주소가 설정되지 않았습니다.');
  const r = await fetch(`${baseUrl}${path}`, {
    ...opt,
    headers: {
      'content-type': 'application/json',
      'x-admin-password': String(saved.adminPassword || ''),
      ...(opt.headers || {}),
    },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || j.message || `M3 HTTP ${r.status}`);
  return j;
}

async function waitTab(tabId, timeout = 18000) {
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }, timeout);
    function onUpdated(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        setTimeout(resolve, 1200);
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

async function extractFromTab(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const text = v => String(v || '').replace(/\s+/g, ' ').trim();
      const meta = (...names) => {
        for (const name of names) {
          const el = document.querySelector(`meta[property="${name}"],meta[name="${name}"]`);
          if (el?.content) return text(el.content);
        }
        return '';
      };
      const abs = raw => {
        try { return new URL(raw, location.href).href; } catch { return ''; }
      };
      const images = [];
      const addImage = raw => {
        const u = abs(raw);
        if (!/^https?:\/\//i.test(u)) return;
        if (/sprite|logo|icon|favicon|avatar|badge/i.test(u)) return;
        if (!images.includes(u)) images.push(u);
      };
      addImage(meta('og:image', 'twitter:image'));
      for (const img of [...document.images].slice(0, 80)) {
        const w = Number(img.naturalWidth || img.width || 0);
        const h = Number(img.naturalHeight || img.height || 0);
        if (w >= 220 && h >= 220) addImage(img.currentSrc || img.src);
      }

      let jsonLd = [];
      for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
        try { jsonLd.push(JSON.parse(node.textContent || '{}')); } catch {}
      }
      const flat = [];
      const walk = v => {
        if (!v) return;
        if (Array.isArray(v)) return v.forEach(walk);
        if (typeof v !== 'object') return;
        flat.push(v);
        if (v['@graph']) walk(v['@graph']);
      };
      jsonLd.forEach(walk);
      const product = flat.find(x => String(x['@type'] || '').toLowerCase().includes('product')) || {};
      const offers = Array.isArray(product.offers) ? product.offers[0] : (product.offers || {});
      const ldImages = Array.isArray(product.image) ? product.image : [product.image];
      ldImages.filter(Boolean).forEach(addImage);

      const productName = text(
        product.name ||
        meta('og:title', 'twitter:title') ||
        document.querySelector('h1')?.innerText ||
        document.title
      );
      const brand = text(
        typeof product.brand === 'string' ? product.brand : product.brand?.name ||
        document.querySelector('[class*="brand" i]')?.textContent || ''
      );
      const price = text(
        offers.price ||
        meta('product:price:amount') ||
        document.querySelector('[class*="price" i]')?.textContent || ''
      );
      const description = text(product.description || meta('og:description', 'description'));

      return {
        finalUrl: location.href,
        pageTitle: text(document.title),
        productName,
        brand,
        price,
        images: images.slice(0, 12),
        description,
      };
    },
  });
  return result || {};
}

function getAllowedHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (!host || host === 'naver.me') return '';
    return host;
  } catch {
    return '';
  }
}

async function searchNaverSameSourceImages(productName, allowedHost) {
  if (!productName || !allowedHost) return [];
  let tab = null;
  try {
    const query = `${productName} ${allowedHost}`;
    const searchUrl = `https://search.naver.com/search.naver?where=image&sm=tab_jum&query=${encodeURIComponent(query)}`;
    tab = await chrome.tabs.create({ url: searchUrl, active: false });
    await waitTab(tab.id, 20000);
    await sleep(1200);

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [allowedHost],
      func: (allowedHostArg) => {
        const allowedHost = String(allowedHostArg || '').toLowerCase();
        const out = [];
        const seen = new Set();

        const normalizeCandidateUrl = raw => {
          try { return new URL(raw, location.href).href; } catch { return ''; }
        };

        const decodedTargets = href => {
          const values = [];
          const add = v => {
            if (!v) return;
            let x = String(v);
            for (let i = 0; i < 2; i++) {
              try { x = decodeURIComponent(x); } catch { break; }
            }
            values.push(x);
          };
          add(href);
          try {
            const u = new URL(href, location.href);
            for (const key of ['url', 'u', 'target', 'source', 'redirect', 'link']) add(u.searchParams.get(key));
          } catch {}
          return values;
        };

        const sourceMatches = anchor => {
          if (!anchor?.href) return false;
          for (const candidate of decodedTargets(anchor.href)) {
            try {
              const h = new URL(candidate, location.href).hostname.toLowerCase();
              if (h === allowedHost) return true;
            } catch {}
          }
          return false;
        };

        for (const img of [...document.images].slice(0, 240)) {
          const w = Number(img.naturalWidth || img.width || 0);
          const h = Number(img.naturalHeight || img.height || 0);
          if (w < 180 || h < 150) continue;
          const anchor = img.closest('a[href]');
          if (!sourceMatches(anchor)) continue;
          const src = normalizeCandidateUrl(img.currentSrc || img.src);
          if (!/^https?:\/\//i.test(src)) continue;
          if (/logo|icon|sprite|avatar|badge/i.test(src)) continue;
          if (seen.has(src)) continue;
          seen.add(src);
          out.push(src);
          if (out.length >= 8) break;
        }
        return out;
      },
    });

    const images = Array.isArray(result) ? result : [];
    console.log(`[M3 Bridge] naver-image-search product=${productName.slice(0,80)} host=${allowedHost} found=${images.length}`);
    return images;
  } catch (e) {
    console.warn(`[M3 Bridge] naver-image-search failed: ${e.message}`);
    return [];
  } finally {
    if (tab?.id) await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function processJob(job) {
  let tab = null;
  try {
    await api(`/api/browser-bridge/jobs/${encodeURIComponent(job.id)}/claim`, { method: 'POST', body: '{}' });
    tab = await chrome.tabs.create({ url: job.url, active: false });
    await waitTab(tab.id);
    const data = await extractFromTab(tab.id);

    const allowedHost = getAllowedHost(data.finalUrl);
    const searchedImages = await searchNaverSameSourceImages(data.productName, allowedHost);
    data.images = [...new Set([...(searchedImages || []), ...(data.images || [])])].slice(0, 20);

    await api(`/api/browser-bridge/jobs/${encodeURIComponent(job.id)}/result`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    console.log(`[M3 Bridge] done job=${job.id} product=${data.productName || '-'} images=${data.images?.length || 0} searched=${searchedImages.length}`);
    return true;
  } catch (e) {
    console.warn(`[M3 Bridge] failed job=${job.id}`, e);
    try {
      await api(`/api/browser-bridge/jobs/${encodeURIComponent(job.id)}/result`, {
        method: 'POST',
        body: JSON.stringify({ error: String(e?.message || e), finalUrl: job.url }),
      });
    } catch {}
    return false;
  } finally {
    if (tab?.id) await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function runOnce() {
  const j = await api('/api/browser-bridge/jobs');
  const jobs = Array.isArray(j.jobs) ? j.jobs : [];
  let done = 0;
  for (const job of jobs.slice(0, 3)) {
    if (await processJob(job)) done++;
    await sleep(250);
  }
  return { checked: jobs.length, done };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('m3-bridge-poll', { periodInMinutes: 0.5 });
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('m3-bridge-poll', { periodInMinutes: 0.5 });
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'm3-bridge-poll') runOnce().catch(() => {});
});
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'RUN_M3_BRIDGE') {
    runOnce().then(r => sendResponse({ ok: true, ...r })).catch(e => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }
});
