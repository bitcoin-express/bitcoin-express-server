"use strict";
const config = require('config');

const { Warning } = require(config.get('system.root_dir') + '/core/models/Errors/Warning');

exports.Warning = Warning;


//TODO: add RequiredField, InvalidFormat, ReadOnly, TerminalError
// TODO: ad parameter to errors to indicate if message can be forwarded or not - or add two types of messages
