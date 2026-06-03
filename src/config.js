require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function optional(name, fallback = '') {
  return (process.env[name] || fallback).trim();
}

const config = {
  discordToken: required('DISCORD_TOKEN'),
  clientId: required('CLIENT_ID'),
  clientSecret: required('CLIENT_SECRET'),
  guildId: process.env.GUILD_ID || '1390687797190594651',
  adminRoleId: optional('ADMIN_ROLE_ID'),
  publicBaseUrl: required('PUBLIC_BASE_URL').replace(/\/$/, ''),
  port: Number(process.env.PORT || 3000),
  sessionSecret: required('SESSION_SECRET'),

  lootlabsApiKey: required('LOOTLABS_API_KEY'),
  lootlabsPostbackSecret: required('LOOTLABS_POSTBACK_SECRET'),
  lootlabsTierId: Number(process.env.LOOTLABS_TIER_ID || 3),
  lootlabsNumberOfTasks: Number(process.env.LOOTLABS_NUMBER_OF_TASKS || 3),
  lootlabsTheme: Number(process.env.LOOTLABS_THEME || 3),
  lootlabsTitle: optional('LOOTLABS_TITLE', 'Earn CTK'),
  lootlabsThumbnail: optional('LOOTLABS_THUMBNAIL'),
  lootlabsStrictIpCheck: String(process.env.LOOTLABS_STRICT_IP_CHECK || 'false').toLowerCase() === 'true',

  rewardAmount: Number(process.env.REWARD_AMOUNT || 100),
  cooldownHours: Number(process.env.EARN_COOLDOWN_HOURS || 24),
  sessionExpiryMinutes: Number(process.env.SESSION_EXPIRY_MINUTES || 30),
  dbPath: process.env.DB_PATH || './ctk.sqlite'
};

module.exports = config;
