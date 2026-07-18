const { default: serverless } = require('serverless-http');
const { createApp } = require('../src/app');
module.exports = serverless(createApp());
