const { REST, Routes, SlashCommandBuilder } = require("discord.js");
require("dotenv").config();

const commands = [
  new SlashCommandBuilder()
    .setName("earn")
    .setDescription("Earn CTK by completing ads")
    .addStringOption(option =>
      option
        .setName("platform")
        .setDescription("Choose ad platform")
        .setRequired(true)
        .addChoices(
          { name: "LootLabs", value: "lootlabs" },
          { name: "Linkvertise", value: "linkvertise" }
        )
    ),

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your CTK balance"),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the CTK leaderboard"),
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function deployCommands() {
  try {
    console.log("Started refreshing application commands...");

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log("Successfully reloaded application commands.");
  } catch (error) {
    console.error("Error deploying commands:", error);
    process.exit(1);
  }
}

deployCommands();
