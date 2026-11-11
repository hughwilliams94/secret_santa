'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json');

const empty = () => ({
  eventName: 'Family Secret Santa',
  budget: '',
  exchangeDate: '',
  participants: [],
  assignments: null, // { giverId: receiverId } once drawn
  drawnAt: null,
});

let state = null;

function load() {
  if (state) return state;
  try {
    state = { ...empty(), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    state = empty();
  }
  return state;
}

function save() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

const token = () => crypto.randomBytes(18).toString('base64url');

module.exports = { load, save, token, DATA_FILE };
