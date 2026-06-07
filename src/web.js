const express = require('express');
const path = require('path');
const sessionMiddleware = require('express-session');

const config = require('./config');
const db = require('./db');
const { signSession, verifyOAuthState, signOAuthState } = require('./security');
const { createLootLabsLink } = require('./lootlabs');
const { makeLinkvertiseUrl } = require('./linkvertise');

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

  if (!res.ok) {
    throw new Error(`Discord token exchange failed: ${res.status}`);
  }

  return res.json();
}

async function fetchDiscordUser(accessToken) {
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    throw new Error(`Discord user fetch failed: ${res.status}`);
  }

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

function checkSessionValid(res, session) {
  if (!session) {
    res.status(404).render('message', {
      title: 'Invalid session',
      message: 'This earn session does not exist.'
    });
    return false;
  }

  if (session.status === 'completed') {
    res.render('message', {
      title: 'Already claimed',
      message: 'This session has already been claimed.'
    });
    return false;
  }

  if (session.expires_at < db.now()) {
    db.markSessionExpired(session.session_id);
    res.render('message', {
      title: 'Expired session',
      message: 'This session expired. Use /earn or !earn again in Discord.'
    });
    return false;
  }

  return true;
}

async function continueAfterDiscordVerified(req, res, client, session, discordUser) {
  if (discordUser.id !== session.discord_id) {
    return res.status(403).render('message', {
      title: 'Wrong Discord account',
      message: 'This session belongs to a different Discord account. Please log in with the same account that used /earn or !earn.'
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
  const destinationUrl =
    `${config.publicBaseUrl}/complete?session=${encodeURIComponent(session.session_id)}&token=${encodeURIComponent(rewardToken)}`;

  const ipHint = getRequestIp(req);

  if (session.provider === 'linkvertise') {
    if (session.status === 'linkvertise_started' && session.linkvertise_url) {
      return res.redirect(session.linkvertise_url);
    }

    const linkvertiseUrl = makeLinkvertiseUrl(destinationUrl);

    db.updateSessionLinkvertiseStarted(
      session.session_id,
      rewardToken,
      linkvertiseUrl,
      ipHint
    );

    return res.redirect(linkvertiseUrl);
  }

  if (session.status === 'loot_started' && session.lootlabs_url) {
    return res.redirect(session.lootlabs_url);
  }

  const loot = await createLootLabsLink({
    sessionId: session.session_id,
    destinationUrl
  });

  db.updateSessionLootStarted(
    session.session_id,
    rewardToken,
    loot.lootUrl,
    loot.shortCode,
    ipHint
  );

  return res.redirect(loot.lootUrl);
}

function startWebServer(client) {
  const app = express();

  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  app.use(sessionMiddleware({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  }));

  app.get('/', (req, res) => {
    res.render('index', { publicBaseUrl: config.publicBaseUrl });
  });
  
  app.get('/health', (req, res) => {
  return res.status(200).json({
    ok: true,
    bot: client?.user?.tag || 'starting',
    time: new Date().toISOString()
  });
});

  app.get('/start/:sessionId', async (req, res) => {
    try {
      const session = db.getSession(req.params.sessionId);
      if (!checkSessionValid(res, session)) return;

if (req.session.discordUser) {
  if (req.session.discordUser.id === session.discord_id) {
    return continueAfterDiscordVerified(req, res, client, session, req.session.discordUser);
  }

  // Saved browser login is for a different Discord account.
  // Clear it and force a fresh Discord OAuth login.
  delete req.session.discordUser;
}

      const state = signOAuthState(session.session_id);
      const oauth = new URL('https://discord.com/api/oauth2/authorize');

      oauth.searchParams.set('client_id', config.clientId);
      oauth.searchParams.set('redirect_uri', `${config.publicBaseUrl}/auth/callback`);
      oauth.searchParams.set('response_type', 'code');
      oauth.searchParams.set('scope', 'identify');
      oauth.searchParams.set('state', state);
      oauth.searchParams.set('prompt', 'consent');

      return res.redirect(oauth.toString());
    } catch (err) {
      console.error(err);
      return res.status(500).render('message', {
        title: 'Website error',
        message: 'Something went wrong while starting your earn session.'
      });
    }
  });

  app.get('/auth/callback', async (req, res) => {
    try {
      const code = req.query.code;
      const state = verifyOAuthState(req.query.state);

      if (!code || !state) {
        return res.status(400).render('message', {
          title: 'Invalid login',
          message: 'Discord login state was invalid. Start again with /earn or !earn.'
        });
      }

      const session = db.getSession(state.sessionId);
      if (!checkSessionValid(res, session)) return;

      const tokenData = await fetchDiscordToken(code);
      const discordUser = await fetchDiscordUser(tokenData.access_token);

      req.session.discordUser = {
        id: discordUser.id,
        username: discordUser.username
      };

      return continueAfterDiscordVerified(req, res, client, session, discordUser);
    } catch (err) {
      console.error(err);

      return res.status(500).render('message', {
        title: 'Website error',
        message: 'Something went wrong during Discord verification or ad link creation.'
      });
    }
  });

  app.get('/complete', (req, res) => {
    const sessionId = String(req.query.session || '');
    const token = String(req.query.token || '');
    const session = db.getSession(sessionId);

    if (!session) {
      return res.status(404).render('message', {
        title: 'Invalid session',
        message: 'This session does not exist.'
      });
    }

    if (session.token !== token) {
      return res.status(403).render('message', {
        title: 'Invalid token',
        message: 'This completion token is invalid.'
      });
    }

    if (session.status === 'completed') {
      return res.render('message', {
        title: 'Already claimed',
        message: `This session was already claimed. Check your balance in Discord.`
      });
    }

    if (session.expires_at < db.now()) {
      db.markSessionExpired(session.session_id);
      return res.render('message', {
        title: 'Expired session',
        message: 'This session expired. Use /earn or !earn again in Discord.'
      });
    }

    if (session.provider === 'linkvertise') {
      const result = db.completeLinkvertiseSession(session.session_id, token);

      if (!result.ok) {
        return res.status(409).render('message', {
          title: 'Could not claim',
          message: `Could not claim this Linkvertise session: ${result.code}`
        });
      }

      return res.render('message', {
        title: 'CTK added!',
        message: `Success. ${session.reward_amount} CTK has been added to your Discord account. Check it with /balance or !balance.`
      });
    }

    return res.render('message', {
      title: 'Task return received',
      message:
        'You reached the return page. For LootLabs, CTK is only added after LootLabs sends the server-side postback. This usually happens automatically after a valid task completion. Check /balance or !balance in Discord.'
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

      if (!session) {
        return res.status(404).json({ ok: false, error: 'SESSION_NOT_FOUND' });
      }

      if (config.lootlabsStrictIpCheck && session.ip_hint && ip && session.ip_hint !== ip) {
        return res.status(403).json({ ok: false, error: 'IP_MISMATCH' });
      }

      const result = db.completeSessionFromPostback(
        clickId,
        uniqueId,
        ip,
        JSON.stringify(req.query)
      );

      if (!result.ok) {
        return res.status(409).json({ ok: false, error: result.code });
      }

      return res.json({
        ok: true,
        rewarded: result.session.reward_amount,
        discord_id: result.session.discord_id
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  app.listen(config.port, () => {
    console.log(`Website running on port ${config.port}`);
  });
}

module.exports = {
  startWebServer
};
