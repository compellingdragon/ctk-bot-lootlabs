const config = require('./config');

const API_URL = 'https://creators.lootlabs.gg/api/public/content_locker';

function appendPuid(url, sessionId) {
  const parsed = new URL(url);
  parsed.searchParams.set('puid', sessionId);
  return parsed.toString();
}

async function createLootLabsLink({ sessionId, destinationUrl }) {
  const title = String(config.lootlabsTitle || 'Earn CTK!').replace(/^"|"$/g, '').slice(0, 30);
  const finalUrl = String(destinationUrl || '').trim();

  const params = new URLSearchParams();
  params.set('title', title);
  params.set('url', finalUrl);
  params.set('tier_id', String(config.lootlabsTierId || 3));
  params.set('number_of_tasks', String(config.lootlabsNumberOfTasks || 3));
  params.set('theme', String(config.lootlabsTheme || 3));

  if (config.lootlabsThumbnail) {
    params.set('thumbnail', String(config.lootlabsThumbnail));
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.lootlabsApiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  const data = await res.json().catch(() => null);

  console.log('LootLabs response debug:', {
    status: res.status,
    ok: res.ok,
    data
  });

  if (!res.ok || !data || data.type === 'error' || !data.message?.loot_url) {
    const msg = typeof data?.message === 'string'
      ? data.message
      : JSON.stringify(data?.message || data || {});
    throw new Error(`LootLabs link creation failed: ${msg || `HTTP ${res.status}`}`);
  }

  return {
    shortCode: data.message.short || null,
    rawLootUrl: data.message.loot_url,
    lootUrl: appendPuid(data.message.loot_url, sessionId),
    apiResponse: data
  };
}

module.exports = {
  createLootLabsLink
};
