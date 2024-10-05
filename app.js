import 'dotenv/config';
import express from 'express';
import {
  InteractionType,
  InteractionResponseType,
  verifyKeyMiddleware,
} from 'discord-interactions';
import { calculateTimeDifference, parseTime } from './utils.js';

import { Client, GatewayIntentBits, AttachmentBuilder } from 'discord.js'; // Importing the necessary discord.js components

const app = express();
const PORT = process.env.PORT || 3000;


// Initialize the Discord client with necessary intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates, // For tracking voice states
  ],
});

function getNickname(guildId, userId) {
  return client.guilds.fetch(guildId)
  .then(guild => guild.members.fetch(userId)) 
  .then(member => member.nickname || member.user.username) 
  .catch(error => {
      console.error('Error fetching the nickname:', error);
      return userId; 
  });
}

async function sendCSVFile(userId, string) {
  const user = await client.users.fetch(userId); // Fetch the user by ID
  
  const buffer = Buffer.from(string, 'utf-8');

  const attachment = new AttachmentBuilder(buffer, { name: 'acta.csv' });

  await user.send({
    content: 'Acta de reunión:',
    files: [attachment],
  });
}

// In production, you'd want to use a DB
const activeLoggers = new Map();

const logs = new Map();

const nicknames = new Map();


function logData(joined, userId, channelId, serverId) {
  const existingLogger = activeLoggers.get(`${serverId}-${channelId}`);
  if (existingLogger) {
    const map = logs.get(`${serverId}-${channelId}`)
    const data = {
      date: new Date(),
      joined: joined
    }
    if (map.has(userId)) {
      map.get(userId).push(data)
    } else {
      nicknames[userId] = getNickname(serverId, userId)
      map.set(userId, [data])
    }
  }
}

// Handle voice state updates
client.on('voiceStateUpdate', (oldState, newState) => {
  const userId = newState.id;
  const channelId = newState.channelId;
  const serverId = newState.guild.id;

  if (oldState.channelId === newState.channelId) return;


  if (oldState.channelId) {
    //console.log(`${newState.member.user.tag} left ${oldState.channelId}`);
    logData(false, userId, channelId, serverId)

    if (newState.channelId) {
      //console.log(`${newState.member.user.tag} joined ${newState.channelId}`)
      logData(true, userId, channelId, serverId)
    }
  }
  else if (newState.channelId) {
      //console.log(`${newState.member.user.tag} joined ${newState.channelId}`);
      logData(true, userId, channelId, serverId)
  }
  
});


app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  const { type, guild_id, data } = req.body;

  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;

    if (name === 'start-logger') {
      const context = req.body.context;
      const userId = context === 0 ? req.body.member.user.id : req.body.user.id;
      const channels = data.resolved.channels;
      const firstKey = Object.keys(channels)[0];
      const selectedChannel = channels[firstKey];

      if (selectedChannel.type !== 2) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Please select a **voice channel**! ',
            ephemeral: true
          },
        });
      }

      const channelId = selectedChannel.id
      const channelName = selectedChannel.name

      const key = `${guild_id}-${channelId}`

      const existingLogger = activeLoggers.get(key);
      if (existingLogger) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: channelName + ' is already being logged',
          },
        });
      }

      activeLoggers.set(key, {
        serverId: guild_id,
        channelId: channelId,
        channelName: channelName,
        userWhoStartedLogger: userId        
      });

      const map = new Map()

      const voiceChannel = client.channels.cache.get(channelId);
      if (voiceChannel) {
        const actualDate = new Date()
        voiceChannel.members.forEach(member => {
            const data = {
              date: actualDate,
              joined: true
            }
            nicknames[member.user.id] = member.nickname
            map.set(member.user.id, [data])        
        });
      }

      logs.set(`${guild_id}-${channelId}`, map)

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'Started logging ' + channelName,
        },
      });
    }

    if (name === 'stop-logger') {
      const context = req.body.context;
      const userId = context === 0 ? req.body.member.user.id : req.body.user.id;
      const channels = data.resolved.channels;
      const firstKey = Object.keys(channels)[0];
      const selectedChannel = channels[firstKey];
      const channelId = selectedChannel.id
      const channelName = selectedChannel.name

      const key = `${guild_id}-${channelId}`

      const existingLogger = activeLoggers.get(key);
      if (!existingLogger) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Please select a channel that is currently being logged! ',
            ephemeral: true
          },
        });
      }

      const actualDate = new Date()
      const allLogs = logs.get(key)

      let result = "nickname, time (h:m:s), userid, time (ms)"

      allLogs.forEach((dates, key) => {
        dates.push({
          date: actualDate,
          joined: false
        })

        let sum = 0
        for (let index = 0; index+1 < dates.length; index+=2) {
          const time = calculateTimeDifference(dates[index].date, dates[index+1].date)
          sum += time
        }
        
        result += `\n${nicknames[key]}, ${parseTime(sum)}, ${key}, ${sum}`
      });


      sendCSVFile(userId, result)

      const otherUserId = existingLogger.userWhoStartedLogger
      if (userId !== otherUserId) sendCSVFile(otherUserId, result)


      activeLoggers.delete(key);
      logs.delete(key)

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'Stopped logging ' + channelName,
        },
      });
    }

    if (name === 'current-loggers') {
      const currentLoggers = Array.from(activeLoggers.values())
        .filter(logger => logger.serverId === guild_id) 
        .map(logger => logger.channelName)
        .join(', ');

      const content = (currentLoggers === '') ? 'No loggers active' : 'Current loggers: ' + currentLoggers

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: content,
        },
      });
    }

    console.error(`unknown command: ${name}`);
    return res.status(400).json({ error: 'unknown command' });
  }

  console.error('unknown interaction type', type);
  return res.status(400).json({ error: 'unknown interaction type' });
});


client.login(process.env.DISCORD_TOKEN);


app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});
