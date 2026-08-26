import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchStockVideos } from './stockVideoProvider.js';
import { generateJapaneseCopy, suggestSearchTerms } from './japaneseCopyGenerator.js';
import { renderShort } from './shortsRenderer.js';
import { getSettingsStatus, saveSettings } from './configStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 8080);

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', async (_req, res) => {
  const settings = await getSettingsStatus();
  res.json({
    ok: true,
    service: 'm3-japanese-shorts',
    pexels: settings.PEXELS_API_KEY.configured,
    pixabay: settings.PIXABAY_API_KEY.configured
  });
});

app.get('/api/admin/settings', async (_req, res) => {
  try {
    res.json(await getSettingsStatus());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/settings', async (req, res) => {
  try {
    const allowed = {};
    for (const key of ['PEXELS_API_KEY', 'PIXABAY_API_KEY']) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) allowed[key] = req.body[key];
    }
    res.json({ ok: true, settings: await saveSettings(allowed) });
  } catch (error) {
    console.error('[SETTINGS]', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const subject = String(req.query.q || '').trim();
    if (!subject) return res.status(400).json({ error: 'q is required' });
    const terms = suggestSearchTerms(subject);
    const selectedTerm = String(req.query.term || terms[0]);
    const videos = await searchStockVideos(selectedTerm, 8);
    res.json({ subject, terms, selectedTerm, videos });
  } catch (error) {
    console.error('[SEARCH]', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/copy', (req, res) => {
  const { subject, mood = 'dreamy', duration = 20 } = req.body || {};
  res.json(generateJapaneseCopy({ subject, mood, duration: Number(duration) || 20 }));
});

app.post('/api/render', async (req, res) => {
  try {
    const { clips, title, captions, style = {} } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title is required' });
    const result = await renderShort({ clips, title, captions, style });
    res.json(result);
  } catch (error) {
    console.error('[RENDER]', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')));
app.use((_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`m3 Japanese Shorts listening on :${PORT}`);
});
