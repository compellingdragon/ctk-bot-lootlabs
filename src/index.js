const { Client, GatewayIntentBits, Events, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('./config');
const db = require('./db');
const { startWebServer } = require('./web');

function fmt(n) {
  return `${Number(n).toLocaleString()} CTK`;
}

function cooldownInfo(discordId) {
  const last = db.getLastCompletedEarn(discordId);
  if (!last || !last.completed_at) return { active: false };
  const next = last.completed_at + config.cooldownHours * 60 * 60 * 1000;
  const remaining = next - Date.now();
  if (remaining <= 0) return { active: false };
  return { active: true, next, remaining };
}

function hasAdminAccess(interaction) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  if (config.adminRoleId && interaction.member?.roles?.cache?.has(config.adminRoleId)) return true;
  return false;
}

async function adminGuard(interaction) {
  if (hasAdminAccess(interaction)) return true;
  await interaction.reply({ content: 'You need Manage Server permission or the configured admin role to use this command.', ephemeral: true });
  return false;
}

function userTag(user) {
  return user?.tag || user?.username || 'Unknown user';
}

async function handleEarn(interaction) {
  const discordId = interaction.user.id;
  db.getOrCreateUser(discordId, interaction.user.username);

  const cd = cooldownInfo(discordId);
  if (cd.active) {
    return interaction.reply({
      content: `You already claimed CTK recently. You can earn again <t:${Math.floor(cd.next / 1000)}:R>.`,
      ephemeral: true
    });
  }

  const active = db.getActiveSession(discordId);
  const session = active || db.createEarnSession(discordId);
  const url = `${config.publicBaseUrl}/start/${session.session_id}`;

  await interaction.reply({
    content: `Your private CTK earn session is ready.\n${url}\n\nIt expires <t:${Math.floor(session.expires_at / 1000)}:R>. Login with the same Discord account, join CompellingCore, complete LootLabs, then LootLabs postback will credit ${fmt(config.rewardAmount)}.`,
    ephemeral: true
  });
}

async function handleBalance(interaction) {
  const target = interaction.options.getUser('user') || interaction.user;
  const user = db.getOrCreateUser(target.id, target.username);
  await interaction.reply({ content: `${target.id === interaction.user.id ? 'You have' : `${userTag(target)} has`} **${fmt(user.balance)}**.`, ephemeral: true });
}

async function handleLeaderboard(interaction) {
  const rows = db.topUsers(10);
  if (!rows.length) return interaction.reply('No CTK balances yet.');

  const description = rows.map((row, i) => `${i + 1}. <@${row.discord_id}> — **${fmt(row.balance)}**`).join('\n');
  const embed = new EmbedBuilder().setTitle('CompellingCore CTK Leaderboard').setDescription(description).setTimestamp();
  await interaction.reply({ embeds: [embed] });
}

async function handleRedeem(interaction) {
  const amount = interaction.options.getInteger('amount', true);
  const item = interaction.options.getString('item', true).slice(0, 180);
  const result = db.createRedemption(interaction.user.id, amount, item);

  if (!result.ok) {
    return interaction.reply({ content: `You do not have enough CTK. Your balance is **${fmt(result.user.balance)}**.`, ephemeral: true });
  }

  await interaction.reply({
    content: `Redeem request created for **${fmt(amount)}**: **${item}**. Your CTK was deducted and an admin can manually fulfill it in the server.`,
    ephemeral: true
  });
}

async function handleAdminAdd(interaction) {
  if (!(await adminGuard(interaction))) return;
  const target = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);
  const reason = interaction.options.getString('reason') || 'Admin add';
  const user = db.addBalance(target.id, amount, reason, interaction.user.id, null);
  await interaction.reply({ content: `Added **${fmt(amount)}** to ${target}. New balance: **${fmt(user.balance)}**.`, ephemeral: true });
}

async function handleAdminRemove(interaction) {
  if (!(await adminGuard(interaction))) return;
  const target = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);
  const reason = interaction.options.getString('reason') || 'Admin remove';
  const before = db.getOrCreateUser(target.id, target.username).balance;
  const user = db.removeBalance(target.id, amount, reason, interaction.user.id);
  const removed = before - user.balance;
  await interaction.reply({ content: `Removed **${fmt(removed)}** from ${target}. New balance: **${fmt(user.balance)}**.`, ephemeral: true });
}

async function handleAdminSet(interaction) {
  if (!(await adminGuard(interaction))) return;
  const target = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);
  const reason = interaction.options.getString('reason') || 'Admin set balance';
  const user = db.setBalance(target.id, amount, reason, interaction.user.id);
  await interaction.reply({ content: `Set ${target}'s balance to **${fmt(user.balance)}**.`, ephemeral: true });
}

async function handleAdminClear(interaction) {
  if (!(await adminGuard(interaction))) return;
  const target = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason') || 'Admin clear balance';
  const user = db.setBalance(target.id, 0, reason, interaction.user.id);
  await interaction.reply({ content: `Cleared ${target}'s balance. New balance: **${fmt(user.balance)}**.`, ephemeral: true });
}

async function handleAdminRedemptions(interaction) {
  if (!(await adminGuard(interaction))) return;
  const rows = db.listPendingRedemptions(10);
  if (!rows.length) return interaction.reply({ content: 'No pending redemptions.', ephemeral: true });
  const lines = rows.map(r => `#${r.id} — <@${r.discord_id}> — **${fmt(r.amount)}** — ${r.item} — <t:${Math.floor(r.created_at / 1000)}:R>`);
  await interaction.reply({ content: lines.join('\n'), ephemeral: true });
}

async function main() {
  db.initDb();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
  });

  client.once(Events.ClientReady, readyClient => {
    console.log(`Logged in as ${readyClient.user.tag}`);
    startWebServer(client);
  });

  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    try {
      switch (interaction.commandName) {
        case 'earn': return handleEarn(interaction);
        case 'balance': return handleBalance(interaction);
        case 'leaderboard': return handleLeaderboard(interaction);
        case 'redeem': return handleRedeem(interaction);
        case 'admin-add': return handleAdminAdd(interaction);
        case 'admin-remove': return handleAdminRemove(interaction);
        case 'admin-set': return handleAdminSet(interaction);
        case 'admin-clear': return handleAdminClear(interaction);
        case 'admin-redemptions': return handleAdminRedemptions(interaction);
        default: return interaction.reply({ content: 'Unknown command.', ephemeral: true });
      }
    } catch (err) {
      console.error(err);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'Something went wrong while running that command.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'Something went wrong while running that command.', ephemeral: true });
      }
    }
  });

  await client.login(config.discordToken);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
