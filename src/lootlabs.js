const config = require('./config');

const API_URL = 'https://creators.lootlabs.gg/api/public/content_locker';

function appendPuid(lootUrl, puid) {
  const url = new URL(lootUrl);
  url.searchParams.set('puid', puid);
  return url.toString();
}

async function createLootLabsLink({ sessionId, destinationUrl }) {
  if (!destinationUrl) {
    throw new Error('LootLabs destinationUrl is missing');
  }

  const params = new URLSearchParams({
    title: String(config.lootlabsTitle || 'Earn CTK!').slice(0, 30),
    url: destinationUrl,
    tier_id: String(config.lootlabsTierId || 3),
    number_of_tasks: String(config.lootlabsNumberOfTasks || 3),
    theme: String(config.lootlabsTheme || 3)
  });

  if (config.lootlabsThumbnail) {
    params.set('thumbnail', config.lootlabsThumbnail);
  }

  const res = await fetch(`${API_URL}?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.lootlabsApiKey}`
    }
  });

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

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

module.exports = { createLootLabsLink };
