const config = require('./config');

const API_URL = 'https://creators.lootlabs.gg/api/public/content_locker';

function appendPuid(url, sessionId) {
  const parsed = new URL(url);
  parsed.searchParams.set('puid', sessionId);
  return parsed.toString();
}

async function createLootLabsLink({ sessionId, destinationUrl }) {
  const title = String(config.lootlabsTitle || 'Earn CTK!')
    .replace(/^"|"$/g, '')
    .slice(0, 30);

  const finalUrl = String(destinationUrl || '').trim();

  if (!config.lootlabsApiKey) {
    throw new Error('Missing LOOTLABS_API_KEY');
  }

  if (!sessionId) {
    throw new Error('Missing sessionId');
  }

  if (!finalUrl) {
    throw new Error('Missing destinationUrl');
  }

  const body = {
    title,
    url: finalUrl,
    tier_id: Number(config.lootlabsTierId || 3),
    number_of_tasks: Number(config.lootlabsNumberOfTasks || 3),
    theme: Number(config.lootlabsTheme || 1)
  };

  if (config.lootlabsThumbnail) {
    body.thumbnail = String(config.lootlabsThumbnail);
  }

  console.log('LootLabs request debug:', {
    hasApiKey: Boolean(config.lootlabsApiKey),
    title: body.title,
    url: body.url,
    tier_id: body.tier_id,
    number_of_tasks: body.number_of_tasks,
    theme: body.theme,
    hasThumbnail: Boolean(body.thumbnail)
  });

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.lootlabsApiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  console.log('LootLabs response debug:', {
    status: res.status,
    ok: res.ok,
    data
  });

const createdLink = Array.isArray(data.message)
  ? data.message[0]
  : data.message;

if (!res.ok || !data || data.type === 'error' || !createdLink?.loot_url) {
  const msg =
    typeof data?.message === 'string'
      ? data.message
      : data?.raw || JSON.stringify(data?.message || data || {});

  throw new Error(`LootLabs link creation failed: ${msg || `HTTP ${res.status}`}`);
}

const rawLootUrl = createdLink.loot_url;

return {
  shortCode: createdLink.short || null,
  rawLootUrl,
  lootUrl: appendPuid(rawLootUrl, sessionId),
  apiResponse: data
};
}

module.exports = {
  createLootLabsLink
};
