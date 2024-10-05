import 'dotenv/config';
import { InstallGlobalCommands } from './utils.js';


const START_LOGGER = {
  name: 'start-logger',
  description: 'Start logging voice channel activity',
  options: [
    {
      type: 7,
      name: 'channel',
      description: 'The voice channel to log',
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 2],
};

const STOP_LOGGER = {
  name: 'stop-logger',
  description: 'Stop logging voice channel activity',
  options: [
    {
      type: 7,
      name: 'channel',
      description: 'The voice channel to stop logging',
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 2],
};

const CURRENT_LOGGERS = {
  name: 'current-loggers',
  description: 'Return current loggers',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
  //default_member_permissions: '0',
};


const ALL_COMMANDS = [START_LOGGER, STOP_LOGGER, CURRENT_LOGGERS];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
