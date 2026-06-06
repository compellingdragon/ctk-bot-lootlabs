const { REST, Routes, SlashCommandBuilder } = require("discord.js");
require("dotenv").config();

const commands = [
  new SlashCommandBuilder()
    .setName("earn")
    .setDescription("Earn CTK by completing ads")
    .addStringOption(option =>
      option
        .setName("method")
        .setDescription("Choose earning method")
        .setRequired(true)
        .addChoices(
          { name: "LootLabs", value: "lootlabs" },
          { name: "Linkvertise", value: "linkvertise" }
        )
    ),

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your CTK balance")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("User to check")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the CTK leaderboard"),

  new SlashCommandBuilder()
    .setName("redeem")
    .setDescription("Redeem your CTK")
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("Amount of CTK to redeem")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("item")
        .setDescription("What you want to redeem")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("admin-add")
    .setDescription("Admin: add CTK")
    .addUserOption(option =>
      option.setName("user").setDescription("User").setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName("amount").setDescription("Amount").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("reason").setDescription("Reason").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("admin-remove")
    .setDescription("Admin: remove CTK")
    .addUserOption(option =>
      option.setName("user").setDescription("User").setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName("amount").setDescription("Amount").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("reason").setDescription("Reason").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("admin-set")
    .setDescription("Admin: set CTK balance")
    .addUserOption(option =>
      option.setName("user").setDescription("User").setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName("amount").setDescription("Amount").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("reason").setDescription("Reason").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("admin-clear")
    .setDescription("Admin: clear CTK balance")
    .addUserOption(option =>
      option.setName("user").setDescription("User").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("reason").setDescription("Reason").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("admin-redemptions")
    .setDescription("Admin: view pending redemptions"),
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function deployCommands() {
  try {
    console.log("Started refreshing application commands...");

    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );

      console.log("Successfully reloaded GUILD commands.");
      console.log("Guild commands update almost instantly.");
    } else {
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
      );

      console.log("Successfully reloaded GLOBAL commands.");
      console.log("Global commands may take time to update.");
    }
  } catch (error) {
    console.error("Error deploying commands:", error);
    process.exit(1);
  }
}

deployCommands();
