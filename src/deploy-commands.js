const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('./config');

const commands = [
  new SlashCommandBuilder()
    .setName('earn')
    .setDescription('Create a private CTK earn session link.')
    .addStringOption(opt =>
      opt
        .setName('method')
        .setDescription('Choose earning method')
        .setRequired(false)
        .addChoices(
          { name: 'LootLabs - higher CTK', value: 'lootlabs' },
          { name: 'Linkvertise - quick CTK', value: 'linkvertise' }
        )
    ),

  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your CTK balance or another user balance.')
    .addUserOption(opt =>
      opt.setName('user').setDescription('Optional user to check').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the top CTK balances.'),

  new SlashCommandBuilder()
    .setName('redeem')
    .setDescription('Request a manual server redemption using your CTK.')
    .addIntegerOption(opt =>
      opt.setName('amount').setDescription('CTK amount to redeem').setMinValue(1).setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('item').setDescription('What you want to redeem').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('admin-add')
    .setDescription('Admin: add CTK to a user.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption(opt => opt.setName('amount').setDescription('Amount to add').setMinValue(1).setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false)),

  new SlashCommandBuilder()
    .setName('admin-remove')
    .setDescription('Admin: remove a specific amount of CTK from a user.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption(opt => opt.setName('amount').setDescription('Amount to remove').setMinValue(1).setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false)),

  new SlashCommandBuilder()
    .setName('admin-set')
    .setDescription('Admin: set a user CTK balance to an exact amount.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption(opt => opt.setName('amount').setDescription('New balance').setMinValue(0).setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false)),

  new SlashCommandBuilder()
    .setName('admin-clear')
    .setDescription('Admin: clear a user CTK balance to 0.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(false)),

  new SlashCommandBuilder()
    .setName('admin-redemptions')
    .setDescription('Admin: list pending manual redemption requests.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map(cmd => cmd.toJSON());

async function main() {
  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  console.log('Deploying guild slash commands...');
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
  process.exit(1);
});
