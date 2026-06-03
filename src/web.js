const express = require('express');
const config = require('./config');
const db = require('./db');
const { signSession, verifyOAuthState, signOAuthState } = require('./security');
const { createLootLabsLink } = require('./lootlabs');

async function fetchDiscordToken(code) {
  const params = new URLSearchParams();
  params.set('client_id', config.clientId);
  params.set('client_secret', config.clientSecret);
  params.set('grant_type', 'authorization_code');
  params.set('code', code);
  params.set('redirect_uri', `${config.publicBaseUrl}/auth/callback`);

  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });

  if (!res.ok) throw new Error(`Discord token exchange failed: ${res.status}`);
  return res.json();
}

async function fetchDiscordUser(accessToken) {
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) throw new Error(`Discord user fetch failed: ${res.status}`);
  return res.json();
}

async function isGuildMember(client, discordId) {
  try {
    const guild = await client.guilds.fetch(config.guildId);
    await guild.members.fetch(discordId);
    return true;
  } catch {
    return false;
  }
}

function getRequestIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || null;
}

function startWebServer(client) {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', require('path').join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  app.get('/', (req, res) => {
    res.render('index', { publicBaseUrl: config.publicBaseUrl });
  });

  app.get('/start/:sessionId', (req, res) => {
    const session = db.getSession(req.params.sessionId);
    if (!session) return res.status(404).render('message', { title: 'Invalid session', message: 'This earn session does not exist.' });
    if (session.status === 'completed') return res.render('message', { title: 'Already claimed', message: 'This session has already been claimed.' });
    if (session.expires_at < db.now()) {
      db.markSessionExpired(session.session_id);
      return res.render('message', { title: 'Expired session', message: 'This session expired. Use /earn again in Discord.' });
    }

    const state = signOAuthState(session.session_id);
    const oauth = new URL('https://discord.com/api/oauth2/authorize');
    oauth.searchParams.set('client_id', config.clientId);
    oauth.searchParams.set('redirect_uri', `${config.publicBaseUrl}/auth/callback`);
    oauth.searchParams.set('response_type', 'code');
    oauth.searchParams.set('scope', 'identify');
    oauth.searchParams.set('state', state);
    res.redirect(oauth.toString());
  });

  app.get('/auth/callback', async (req, res) => {
    try {
      const code = req.query.code;
      const state = verifyOAuthState(req.query.state);
      if (!code || !state) return res.status(400).render('message', { title: 'Invalid login', message: 'Discord login state was invalid. Start again with /earn.' });

      const session = db.getSession(state.sessionId);
      if (!session) return res.status(404).render('message', { title: 'Invalid session', message: 'This earn session does not exist.' });
      if (session.expires_at < db.now()) {
        db.markSessionExpired(session.session_id);
        return res.render('message', { title: 'Expired session', message: 'This session expired. Use /earn again in Discord.' });
      }
      if (session.status === 'completed') return res.render('message', { title: 'Already claimed', message: 'This session has already been claimed.' });
      if (session.status === 'loot_started' && session.lootlabs_url) return res.redirect(session.lootlabs_url);

      const tokenData = await fetchDiscordToken(code);
      const discordUser = await fetchDiscordUser(tokenData.access_token);

      if (discordUser.id !== session.discord_id) {
        return res.status(403).render('message', {
          title: 'Wrong Discord account',
          message: 'This session belongs to a different Discord account. Please log in with the same account that used /earn.'
        });
      }

      db.upsertUser(discordUser.id, discordUser.username);

      const member = await isGuildMember(client, discordUser.id);
      if (!member) {
        return res.status(403).render('message', {
          title: 'Join required',
          message: 'You must join the CompellingCore Discord server before earning CTK.'
        });
      }

      const rewardToken = signSession(session.session_id, session.discord_id);
      const destinationUrl = `${config.publicBaseUrl}/complete?session=${encodeURIComponent(session.session_id)}&token=${encodeURIComponent(rewardToken)}`;
      const loot = await createLootLabsLink({ sessionId: session.session_id, destinationUrl });
      const ipHint = getRequestIp(req);

      db.updateSessionLootStarted(session.session_id, rewardToken, loot.lootUrl, loot.shortCode, ipHint);
      res.redirect(loot.lootUrl);
    } catch (err) {
      console.error(err);
      res.status(500).render('message', { title: 'Website error', message: 'Something went wrong during verification or LootLabs link creation. Check your .env keys and try /earn again.' });
    }
  });

  app.get('/complete', (req, res) => {
    const sessionId = String(req.query.session || '');
    const token = String(req.query.token || '');
    const session = db.getSession(sessionId);

    if (!session) return res.status(404).render('message', { title: 'Invalid session', message: 'This session does not exist.' });
    if (session.token !== token) return res.status(403).render('message', { title: 'Invalid token', message: 'This completion token is invalid.' });
    if (session.status === 'completed') {
      return res.render('message', {
        title: 'CTK added!',
        message: `Success. ${config.rewardAmount} CTK has been added to your Discord account. You can check it with /balance.`
      });
    }
    if (session.expires_at < db.now()) {
      db.markSessionExpired(session.session_id);
      return res.render('message', { title: 'Expired session', message: 'This session expired. Use /earn again in Discord.' });
    }

    res.render('message', {
      title: 'Task return received',
      message: 'You reached the return page. CTK is only added after LootLabs sends the server-side postback. This usually happens automatically after a valid task completion. Check /balance in Discord.'
    });
  });

  app.get('/api/lootlabs/postback', (req, res) => {
    try {
      const secret = String(req.query.secret || '');
      if (secret !== config.lootlabsPostbackSecret) {
        return res.status(403).json({ ok: false, error: 'BAD_SECRET' });
      }

      const clickId = String(req.query.click_id || req.query.puid || '');
      const uniqueId = String(req.query.unique_id || '');
      const ip = req.query.ip ? String(req.query.ip) : null;

      if (!clickId || !uniqueId) {
        return res.status(400).json({ ok: false, error: 'MISSING_CLICK_ID_OR_UNIQUE_ID' });
      }

      const session = db.getSession(clickId);
      if (!session) return res.status(404).json({ ok: false, error: 'SESSION_NOT_FOUND' });

      if (config.lootlabsStrictIpCheck && session.ip_hint && ip && session.ip_hint !== ip) {
        return res.status(403).json({ ok: false, error: 'IP_MISMATCH' });
      }

      const result = db.completeSessionFromPostback(clickId, uniqueId, ip, JSON.stringify(req.query));
      if (!result.ok) return res.status(409).json({ ok: false, error: result.code });

      return res.json({ ok: true, rewarded: config.rewardAmount, discord_id: result.session.discord_id });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  app.listen(config.port, () => console.log(`Website running on port ${config.port}`));
}

module.exports = { startWebServer };
