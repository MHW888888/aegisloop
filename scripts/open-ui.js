'use strict';

const { spawn } = require('child_process');
const path = require('path');

const config = require(path.resolve(__dirname, '..', 'config.json'));
const url = `http://127.0.0.1:${config.port || 17380}/ui/`;

let command;
let args;

if (process.platform === 'darwin') {
  command = 'open';
  args = [url];
} else if (process.platform === 'win32') {
  command = 'cmd';
  args = ['/c', 'start', '', url];
} else {
  command = 'xdg-open';
  args = [url];
}

const child = spawn(command, args, {
  detached: true,
  stdio: 'ignore',
});

child.unref();
console.log(url);
