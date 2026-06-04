async function createLootLabsLink({ sessionId, destinationUrl }) {
  const title = String(config.lootlabsTitle || 'Earn CTK!').replace(/^"|"$/g, '').slice(0, 30);
  const finalUrl = String(destinationUrl || '').trim();
  const tierId = String(config.lootlabsTierId || 3);
  const tasks = String(config.lootlabsNumberOfTasks || 3);
  const theme = String(config.lootlabsTheme || 3);

  console.log('LootLabs request debug:', {
    hasApiKey: Boolean(config.lootlabsApiKey),
    title,
    url: finalUrl,
    tier_id: tierId,
    number_of_tasks: tasks,
    theme
  });

  if (!config.lootlabsApiKey) throw new Error('Missing LOOTLABS_API_KEY');
  if (!finalUrl) throw new Error('Missing destinationUrl for LootLabs');
  if (!title) throw new Error('Missing LOOTLABS_TITLE');

  const params = new URLSearchParams();
  params.set('title', title);
  params.set('url', finalUrl);
  params.set('tier_id', tierId);
  params.set('number_of_tasks', tasks);
  params.set('theme', theme);

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

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  console.log('LootLabs response debug:', {
    status: res.status,
    ok: res.ok,
    data
  });

  if (!res.ok || !data || data.type === 'error' || !data.message?.loot_url) {
    const msg =
      typeof data?.message === 'string'
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
