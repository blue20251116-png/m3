const $ = id => document.getElementById(id);

async function load() {
  const saved = await chrome.storage.local.get(['baseUrl', 'adminPassword']);
  $('baseUrl').value = saved.baseUrl || '';
  $('adminPassword').value = saved.adminPassword || '';
}

$('save').addEventListener('click', async () => {
  const baseUrl = $('baseUrl').value.trim().replace(/\/$/, '');
  const adminPassword = $('adminPassword').value;
  await chrome.storage.local.set({ baseUrl, adminPassword });
  $('status').textContent = '저장됨';
});

$('run').addEventListener('click', async () => {
  $('status').textContent = '확인 중...';
  const response = await chrome.runtime.sendMessage({ type: 'RUN_M3_BRIDGE' });
  $('status').textContent = response?.ok
    ? `대기 작업 ${response.checked || 0}개 확인\n완료 ${response.done || 0}개`
    : `실패: ${response?.error || 'unknown error'}`;
});

load();
