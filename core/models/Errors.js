"use strict";
const config = require('config');

const { Warning } = require(config.get('system.root_dir') + '/core/models/Errors/Warning');
const { NotImplementedError } = require(config.get('system.root_dir') + '/core/models/Errors/NotImplementedError');
const { ReadOnlyError } = require(config.get('system.root_dir') + '/core/models/Errors/ReadOnlyError');
const { ValueRequiredError } = require(config.get('system.root_dir') + '/core/models/Errors/ValueRequiredError');
const { FatalError } = require(config.get('system.root_dir') + '/core/models/Errors/FatalError');

exports.Warning = Warning;
exports.NotImplementedError = NotImplementedError;
exports.ReadOnlyError = ReadOnlyError;
exports.ValueRequiredError = ValueRequiredError;
exports.FatalError = FatalError;

// TODO: ad parameter to errors to indicate if message can be forwarded or not - or add two types of messages
