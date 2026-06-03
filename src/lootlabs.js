const config = require('./config');

const API_URL = 'https://creators.lootlabs.gg/api/public/content_locker';

function appendPuid(lootUrl, puid) {
  const url = new URL(lootUrl);
  url.searchParams.set('puid', puid);
  return url.toString();
}

async function createLootLabsLink({ sessionId, destinationUrl }) {
  const body = {
    title: config.lootlabsTitle.slice(0, 30),
    url: destinationUrl,
    tier_id: config.lootlabsTierId,
    number_of_tasks: config.lootlabsNumberOfTasks,
    theme: config.lootlabsTheme
  };

  if (config.lootlabsThumbnail) body.thumbnail = config.lootlabsThumbnail;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.lootlabsApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok || !data || data.type === 'error' || !data.message?.loot_url) {
    const msg = data?.message || `LootLabs API failed with HTTP ${res.status}`;
    throw new Error(`LootLabs link creation failed: ${msg}`);
  }

  return {
    shortCode: data.message.short || null,
    rawLootUrl: data.message.loot_url,
    lootUrl: appendPuid(data.message.loot_url, sessionId),
    apiResponse: data
  };
}

module.exports = { createLootLabsLink };
