"use strict";
/**
 * This module defines all available custom error classes and exposes them via the public interface. All modules that
 * requires custom error classes should import this module, instead of directly importing custom error classes.
 * @module core/models/Errors
 * @link module:core/models/Errors/Warning
 * @link module:core/models/Errors/NotImplementedError
 * @link module:core/models/Errors/ReadOnlyError
 * @link module:core/models/Errors/ValueRequiredError
 * @link module:core/models/Errors/FatalError
 * @link module:core/models/Errors/InvalidValueError
 */

const config = require('config');

const { Warning } = require(config.get('system.root_dir') + '/core/models/Errors/Warning');
const { NotImplementedError } = require(config.get('system.root_dir') + '/core/models/Errors/NotImplementedError');
const { ReadOnlyError } = require(config.get('system.root_dir') + '/core/models/Errors/ReadOnlyError');
const { ValueRequiredError } = require(config.get('system.root_dir') + '/core/models/Errors/ValueRequiredError');
const { FatalError } = require(config.get('system.root_dir') + '/core/models/Errors/FatalError');
const { InvalidValueError } = require(config.get('system.root_dir') + '/core/models/Errors/InvalidValueError');

exports.Warning = Warning;
exports.NotImplementedError = NotImplementedError;
exports.ReadOnlyError = ReadOnlyError;
exports.ValueRequiredError = ValueRequiredError;
exports.FatalError = FatalError;
exports.InvalidValueError = InvalidValueError;

// TODO: add parameter to errors to indicate if message can be forwarded or not - or add two types of messages
