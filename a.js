process.on("unhandledRejection", error => {
  console.log("Unhandled Rejection:", error);
});

process.on("uncaughtException", error => {
  console.log("Uncaught Exception:", error);
});

require("dotenv").config();
const fs = require("fs");
const axios = require("axios");

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  ActivityType
} = require("discord.js");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const OWNER_ID = process.env.OWNER_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const CONFIG_FILE = "./config.json";

function ownerOnly(interaction) {
  return interaction.user.id === OWNER_ID;
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    const defaultConfig = {
      tiktok: {
  accounts: [],
  lastPostId: {}
}
    };

    fs.writeFileSync(
      CONFIG_FILE,
      JSON.stringify(defaultConfig, null, 2)
    );

    return defaultConfig;
  }

  return JSON.parse(
    fs.readFileSync(CONFIG_FILE, "utf8")
  );
}

function saveConfig(data) {
  fs.writeFileSync(
    CONFIG_FILE,
    JSON.stringify(data, null, 2)
  );
}

async function checkTikTokUploads() {
  const data = loadConfig();

  if (!data.tiktok.lastPostId) {
    data.tiktok.lastPostId = {};
  }

  if (!data.tiktok.lastLiveStatus) {
    data.tiktok.lastLiveStatus = {};
  }

  for (const account of data.tiktok.accounts) {
    try {
      const username = account.username;

      const uploadChannel = await client.channels
  .fetch(account.channelId)
  .catch(() => null);

const liveChannel = await client.channels
  .fetch(account.liveChannelId)
  .catch(() => null);

      if (!uploadChannel || !liveChannel) continue;

      // =========================
      // CHECK LIVE TIKTOK
      // =========================

      try {
        const liveResponse = await axios.get(
          `https://www.tikwm.com/api/user/info?unique_id=${username}`,
          {
            timeout: 10000
          }
        );

        const userData = liveResponse.data.data.user;

        const isLive = userData.is_live;

        // Jika baru LIVE
        if (
          isLive &&
          data.tiktok.lastLiveStatus[username] !== true
        ) {
          data.tiktok.lastLiveStatus[username] = true;
          saveConfig(data);

          const liveEmbed = new EmbedBuilder()
            .setTitle("🔴 TikTok LIVE!")
            .setDescription(
              `👤 @${username}\n\n` +
              `[Tonton LIVE](https://www.tiktok.com/@${username}/live)`
            )
            .setThumbnail(userData.avatar)
            .setColor("Red")
            .setTimestamp()
            .setFooter({
              text: "TikTok Notification Bot"
            });

          await liveChannel.send({
         embeds: [liveEmbed]
});
        }

        // Reset saat offline
        if (!isLive) {
          data.tiktok.lastLiveStatus[username] = false;
        }

      } catch (err) {
        console.log(`Gagal cek LIVE ${username}`);
      }

      // =========================
      // CHECK VIDEO UPLOAD
      // =========================

      let latestPostMarker;
      let latestVideo;

      try {
        const response = await axios.get(
          `https://www.tikwm.com/api/user/posts?unique_id=${username}&count=1`,
          {
            timeout: 10000
          }
        );

        const videos = response.data.data.videos;

        if (!videos || videos.length === 0) {
          continue;
        }

        latestVideo = videos[0];
        latestPostMarker = latestVideo.video_id;

      } catch (err) {
        console.log(`Gagal ambil data TikTok ${username}`);
        continue;
      }

      // Jika video sama → skip
      if (
        data.tiktok.lastPostId[username] === latestPostMarker
      ) {
        continue;
      }

      data.tiktok.lastPostId[username] = latestPostMarker;

      saveConfig(data);

      const embed = new EmbedBuilder()
        .setTitle("📱 TikTok Upload Baru!")
        .setDescription(
          `👤 @${username}\n\n` +
          `[Tonton Video](https://www.tiktok.com/@${username}/video/${latestVideo.video_id})`
        )
        .setThumbnail(latestVideo.cover)
        .setColor("Random")
        .setTimestamp()
        .setFooter({
          text: "TikTok Notification Bot"
        });

      await uploadChannel.send({
  embeds: [embed]
});

    } catch (error) {
      console.log(
        `Gagal cek akun ${account.username}:`,
        error.message
      );
    }
  }
}



const commands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Melihat bantuan bot"),

  new SlashCommandBuilder()
  .setName("addaccount")
  .setDescription("Tambah akun TikTok")
  .addStringOption(option =>
    option
      .setName("username")
      .setDescription("Username TikTok tanpa @")
      .setRequired(true)
  )
  .addChannelOption(option =>
    option
      .setName("channel")
      .setDescription("Channel notif upload")
      .setRequired(true)
  )
  .addChannelOption(option =>
    option
      .setName("livechannel")
      .setDescription("Channel notif LIVE")
      .setRequired(true)
  ),

    new SlashCommandBuilder()
  .setName("removeaccount")
  .setDescription("Hapus akun TikTok")
  .addStringOption(option =>
    option
      .setName("username")
      .setDescription("Username TikTok")
      .setRequired(true)
  ),

  new SlashCommandBuilder()
  .setName("showconfig")
  .setDescription("Lihat semua config")

].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    console.log("Register slash command...");

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log("Slash command berhasil dibuat!");
  } catch (error) {
    console.error(error);
  }
})();

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (!ownerOnly(interaction)) {
    return interaction.reply({
      content: "Hanya owner yang bisa menggunakan bot ini.",
      flags: 64
    });
  }

  const data = loadConfig();

  if (interaction.commandName === "help") {
    return interaction.reply({
      content: "```/help\n/addaccount\n/removeaccount\n/showconfig```",
      flags: 64
    });
  }

  if (interaction.commandName === "addaccount") {
  const username = interaction.options.getString("username");
  if (!/^[a-zA-Z0-9._]+$/.test(username)) {
  return interaction.reply({
    content: "Username TikTok tidak valid.",
    flags: 64
  });
}
  const channel = interaction.options.getChannel("channel");

  if (data.tiktok.accounts.length >= 5) {
    return interaction.reply({
      content: "Maksimal hanya 5 akun TikTok.",
      flags: 64
    });
  }

  const alreadyExists = data.tiktok.accounts.some(
    account => account.username.toLowerCase() === username.toLowerCase()
  );

  if (alreadyExists) {
    return interaction.reply({
      content: "Akun sudah terdaftar.",
      flags: 64
    });
  }

  const liveChannel = interaction.options.getChannel("livechannel");

data.tiktok.accounts.push({
  username: username,
  channelId: channel.id,
  liveChannelId: liveChannel.id
});

  try {
  const response = await axios.get(
  `https://www.tikwm.com/api/user/posts?unique_id=${username}&count=1`,
  {
    timeout: 10000
  }
);
  const videos = response.data.data.videos;

  if (videos && videos.length > 0) {
    data.tiktok.lastPostId[username] = videos[0].video_id;
  }
} catch {}

  saveConfig(data);

  return interaction.reply({
    content: `@${username} berhasil ditambahkan ke ${channel}`,
    flags: 64
  });
}

  if (interaction.commandName === "removeaccount") {
  const username = interaction.options.getString("username");

  const index = data.tiktok.accounts.findIndex(
    account => account.username.toLowerCase() === username.toLowerCase()
  );

  if (index === -1) {
    return interaction.reply({
      content: "Akun tidak ditemukan.",
      flags: 64
    });
  }

  data.tiktok.accounts.splice(index, 1);
  saveConfig(data);

  return interaction.reply({
    content: `@${username} berhasil dihapus.`,
    flags: 64
  });
}

if (interaction.commandName === "showconfig") {
  return interaction.reply({
    content: `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
    flags: 64
  });
}
});

client.once("clientReady", async () => {
  console.log(`Bot aktif sebagai ${client.user.tag}`);

  client.user.setPresence({
    activities: [
      {
        name: "Ell",
        type: ActivityType.Playing
      }
    ],
    status: "online"
  });

  await checkTikTokUploads();

  setInterval(async () => {
    await checkTikTokUploads();
  }, 300000);
});

client.login(TOKEN);
