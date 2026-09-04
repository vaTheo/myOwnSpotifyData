import { loadConfig } from './config.js';

const config = loadConfig();

console.log(
  `Spotify client ${config.clientId} configured. Data fetching coming soon.`
);
