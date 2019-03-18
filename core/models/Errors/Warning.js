"use strict";

const config = require('config');
const { BaseError } = require(config.get('system.root_dir') + '/core/models/Errors/BaseError');

exports.Warning = class Warning extends BaseError {};
