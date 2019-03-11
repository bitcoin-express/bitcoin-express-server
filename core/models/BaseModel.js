"use strict";

/**
 * This module defines an interface for all API related objects providing common tools and mechanisms to validate data,
 * save objects in the database and ensures its integrity.
 *
 * All classes that are directly used by the [API]{@link module:core/api/actions} should extend {@link BaseModel} class
 * and define all necessary structures describe in this module.
 *
 * If any changes are made to this module it is important to update inheriting classes and ensure that they will - if
 * necessary - provide removed/modified functionality in an unaltered state.
 *
 * If changes are disrupting to the API itself there might be a need to change API version and provide a grace period to
 * adopt to this changes by API consumers.
 * @module core/models/BaseModel
 * @link core/api
 */

const config = require('config');
const db = require(config.get('system.root_dir') + '/db');
const errors = require(config.get('system.root_dir') + '/core/models/Errors');
const checks = require(config.get('system.root_dir') + '/core/checks');


/**
 * A private container to be used by BaseModel instances only. It is not accessible directly by any of the inheriting
 * classes. It's purpose is to seal information that should not be accessed by any public or protected interface and
 * expose it only to methods defined in the BaseModel itself.
 *
 * As this is of type Symbol the only way to access data stored under this is key is to get its value from this module
 * scope.
 *
 * There is a way to read it using Reflections mechanism, but it's design decision to use this method for "private" data
 * implementation.
 *
 * Check [BaseModel]{@link BaseModel} documentation for other required structures.
 * @type {Symbol}
 * @private
 * @link BaseModel
 */
const _privates = Symbol('_privates');


/**
 * As BaseModule is providing a fields validation mechanism there might be a situation where two different inheriting
 * classes will use the same property and will require the same validator for it. In ideal situation we would define a
 * validator in one of the classes and use it another but due to possible circular dependencies it's not always
 * possible. In situations as such this common validator should be defines in this structure as BaseModel should never
 * import any of its offsprings.
 * @type {object}
 * @private
 * @link BaseModel
 */
const _common_validators = {
    description: (text) => {
        if (!text) { throw new Error ('Required field'); }
        if (typeof text !== "string" || text.length < 1 || text.length > 64) { throw new Error('Invalid format'); }
    },
    notification: (text) => {
        if (text !== undefined && (typeof text !== "string" || text.length < 1 || text.length > 128)) {
            throw new Error('Invalid format');
        }
    },
    time_budget: (seconds) => {
        if (!checks.isInteger(seconds)) { throw new errors.InvalidValueError(); }
        if (seconds < 5 || seconds > 300) { throw new errors.InvalidValueError(); }
    },
};


/**
 * Main interface class to be implemented by all classes used in the [API]{@link module:core/api/actions}.
 * It provides a number of common mechanisms that should work in the same way in all API classes:
 *  -   data stored in an instance is private and not directly accessible via the class' public interface,
 *  -   all properties have explicitly defined setters,
 *  -   all properties set by the public interface are validated,
 *  -   only properties with defined validators can be set via the public interface,
 *  -   computed properties may define its own getters and/or default values,
 *  -   a class is expected to define which properties are allowed be set via the public interface,
 *  -   a class is expected to define which properties are required in order to save an instance to the database,
 *  -   a class is expected to define which properties are read-only. Such properties may be only set via class' private
 *      interface,
 *  -   a class is expected to define which properties are hidden. Such properties won't be exposed while serialising an
 *      instance to JSON,
 *  -   a common db interface.
 * @type {BaseModel}
 * @abstract
 */
exports.BaseModel = class BaseModel {
    /**
     * The constructor initialises all property' mechanisms like custom getters and setters, properties validation and
     * protected containers for sensitive instance data.
     *
     * It expects that inheriting class will pass identifiers to it's private data (private_data_container_key) and
     * interface (private_interface_key) containers and uses both of them to prepare a protected containers that will be
     * accessible by both BaseModel and offspring class. Thanks to than we are providing a private interface to work
     * directly on raw data.
     *
     * @param {private_data_container_key} private_data_container_key - Identifier generated in the inheriting class'
     * module to create a data container under it. Data stored in this container won't be accessible from the outside of
     * this class' module and BaseModule. This ensures that all properties are accessible only via a public interface
     * and that all mechanism guarding this interface are executed as needed.
     *
     * @param {private_interface_key} private_interface_key - Identifier generated in the inheriting class' module to
     * create an interface container under it. It stores and safely exposes data feed to the BaseModule in order to
     * populate internal mechanisms like validators, database interface etc.
     * This data could be saved directly as BaseModel instance's properties but this would pollute the main object hence
     * we are gathering them under one common key.
     *
     * @param {?object} db_session_id - if we want to use transactions for the database interface we may pass the
     * database session id in here to use it. Operations expected to either commit or revert the transaction should be
     * called from the outside of the object.
     *
     * @param {?Set} allowed_properties - Set with the names of properties that can be set and/or read via the
     * object's public interface. If the property is not defined here it won't have its getter nor setter defined and
     * will raise an error when trying to access it. Each inheriting class should define such Set unless it's not
     * exposing any public interface.
     *
     * @param {?Set} api_properties = Set with the names of properties that can be set via the API. If a property is
     * not define here then API should return an error indicating that fact. BaseModel is exposing a static method
     * [checkAPIProperties]{@link module:core/models/BaseModel/BaseModel#checkAPIProperties} in order to
     * run on API level and test all properties.
     *
     * @param {?Set} required_properties - Set with the names of properties that are required to be set in order to
     * save the object in the database.
     *
     * @param {?Set} hidden_properties - Set with the names of properties that are accessible via the object's public
     * interface but are not exposed while stringifying the object to JSON. This is used to build and control object's
     * body returned via API.
     *
     * @param {?Set} readonly_properties - Set with the names of properties that can be read via the public interface
     * but that can be set only via the private interface or that are defined as constant pr computed values.
     *
     * @param {?object} custom_getters - an object where it's keys are properties names and values - functions to be
     * called to get the value of the property. Most of the time this should be a standard (non-arrow) anonymous
     * function as getters may work on internal object's "this" representation.
     * There are two types of getters:
     * - standard - where the key has the name the same as property's name, i.e. for property "description" the key name
     * would be "description" as well,
     * - class-specific - where the name of a key is build by adding class name to the property name and joining them
     * with two underscores, i.e. for property "value" in the class Transaction the key name would be
     * "name__Transaction".
     * This mechanism is used when two or more classes are sharing the same structure with getters but they need
     * to distinguish how a specific property will behave, without changing the whole structure.
     * BaseModel will first look for class-specific getters and use one if it finds it, then for a standard getter and
     * if none of these will be found - will create a standard getter working on a private interface. As both BaseModel
     * and inheriting class have access to the same private data container both can work on it despite the fact that the
     * getters structure is defined in a different module.
     * This structure should be sealed using {@link BaseModel#lockPropertiesOf} after initialisation in order to ensure
     * that inheriting class won't be able to change it in any way after the object is instantiated.
     *
     * @param {?object} custom_setters - an object where it's keys are properties names and values - functions to be
     * called to set the value of the property. Most of the time this should be a standard (non-arrow) anonymous
     * function as setters may work on internal object's "this" representation, accepting one parameter (value to be
     * set).
     * There are two types of setters:
     * - standard - where the key has the name the same as property's name, i.e. for property "description" the key name
     * would be "description" as well,
     * - class-specific - where the name of a key is build by adding class name to the property name and joining them
     * with two underscores, i.e. for property "name" in the class Transaction the key name would be
     * "name__Transaction".
     * This mechanism is used when two or more classes are sharing the same structure with setters but they need
     * to distinguish how a specific property will behave, without changing the whole structure.
     * BaseModel will first look for class-specific setters and use one if it finds it, then for a standard setter and
     * if none of these will be found - will create a standard setter working on a private interface. As both BaseModel
     * and inheriting class have access to the same private data container both can work on it despite the fact that the
     * setters structure is defined in a different module.
     * BaseModel will check if there is validator defined for this specific property and if this property is not defined
     * as read only and only then will use the setter.
     * Base model will wrap the setter and enforce running a validator before executing the setter function itself.
     * This structure should be sealed using {@link BaseModel#lockPropertiesOf} after initialisation in order to ensure
     * that inheriting class won't be able to change it in any way after the object is instantiated.
     *
     * @param {?object} validators - an object where it's keys are properties names and values - functions to be
     * called to get the value of the property, accepting one parameter - value to be validated. Most of the time this
     * should be an arrow function checking if the passed valued is compliant to the object's restrictions/requirements.
     * Function should throw an error in case value is not compliant.
     * There are two types of validators:
     * - standard - where the key has the name the same as property's name, i.e. for property "description" the key name
     * would be "description" as well,
     * - class-specific - where the name of a key is build by adding class name to the property name and joining them
     * with two underscores, i.e. for property "name" in the class Transaction the key name would be
     * "name__Transaction".
     * This mechanism is used when two or more classes are sharing the same structure with validators but they need
     * to distinguish how a specific property will behave, without changing the whole structure.
     * If two or more classes are defining the same property with the same constraints they should reuse its validator
     * by importing them and assigning to own structure. Class' validators are exposed as the class property:
     * [VALIDATORS]{@link BaseModel#VALIDATORS}. In situation where classes are defining the same property and should
     * reuse its validator but they are requiring one another creating circular dependency, this common validator should
     * be defined on [the BaseModel level]{@link module:core/models/BaseModel~_common_validators} i.e.
     * const _validators = {
     *     own_property: value => { if (typeof value !== "string") { throw new Error(); } },
     *     shared_property: AnotherClass.VALIDATORS.shared_property,
     *     circular_property: BaseModel.VALIDATORS.circular_property,
     * };
     * This structure should be sealed using {@link BaseModel#lockPropertiesOf} after initialisation in order to ensure
     * that inheriting class won't be able to change it in any way after the object is instantiated.
     *
     * @param {?string} db_table - name of a database table were objects should be saved, i.e. accounts
     *
     * @param {?string} db_id_field - name of a field on the database side used as the object's id, i.e. _id
     *
     * @param {?string} db_id_value - name of a property storing the database id's value that should be passed to the
     * database, i.e. account_id. This works in conjunction with db_id_field as an object may store its internal id
     * representation in a different field than the database.
     */
    constructor({
        private_data_container_key=undefined,
        private_interface_key=undefined,
        db_session_id=undefined,
        allowed_properties=new Set(),
        api_properties=new Set(),
        required_properties=new Set(),
        hidden_properties=new Set(),
        readonly_properties=new Set(),
        custom_getters={},
        custom_setters={},
        validators={},
        db_table=undefined,
        db_id_field=undefined,
        db_id_value=undefined
    }) {
        // Both private data container key...
        if (!private_data_container_key) {
            throw new errors.ValueRequiredError({ class_name: 'BaseModel', field: 'private_data_container_key', });
        }

        //...and private interface key are required in order to ensure private interface accessible by both BaseModule
        // and inheriting classes
        if (!private_interface_key) {
            throw new errors.ValueRequiredError({ class_name: 'BaseModel', field: 'private_interface_key', });
        }

        // Both identifiers are hidden inside a property that is private to the BaseModel. Thanks to that we can be sure
        // that any other inheriting class won't be able to get an access to the BaseModel data.
        this[_privates] = {
            // Under "data" key we will store inheriting class' private data container key...
            data: private_data_container_key,
            // ...and under "interface" - private interface container key. Thanks to that we will create a protected
            // environment, shared by parent and offspring classes.
            interface: private_interface_key,
        };

        // Private data will be empty on the beginning...
        this[this[_privates].data] = {};

        // ...and private interface will store all the information affecting how the object will behave.
        this[this[_privates].interface] = {
            db_session_id,
            allowed_properties,
            required_properties,
            hidden_properties,
            readonly_properties,
            custom_getters,
            custom_setters,
            validators,
            db_table,
            db_id_field,
            db_id_value,
        };

        // Make data container invisible for any methods working on properties by setting a custom descriptor.
        // This structure still remains configurable as there might be a situation where we want to replace the whole
        // structure holding private data i.e. when restoring an object from the database.
        Object.defineProperty(this, this[_privates].data, {
            enumerable: false,
        });

        // Make interface container invisible and immutable for any methods working on properties. Thanks to that we
        // can be sure that inheriting classes won't modify it in any way as internal structures were already sealed.
        Object.defineProperty(this, this[_privates].interface, {
            enumerable: false,
            configurable: false,
            writable: false,
        });

        // Finally make the _private container invisible and immutable for any methods working on properties.
        Object.defineProperty(this, _privates, {
            enumerable: false,
            configurable: false,
            writable: false,
        });

        // As we only allow explicitly defined properties we are iterating over the allowed properties structure, passed
        // from the inheriting class. We are sealing the object after initialisation we can be sure that it won't be
        // possible to add any other properties.
        for (let property of this[this[_privates].interface].allowed_properties) {
            // Define a getter for the property...

                                // First - check if there is a class-specific getter defined...
            let custom_getter = this[this[_privates].interface].custom_getters.hasOwnProperty(`${property}__${this.constructor.name}`) ?
                                //...if there is one - use it...
                                this[this[_privates].interface].custom_getters[`${property}__${this.constructor.name}`] :
                                //...if not - look for a standard property getter...
                                this[this[_privates].interface].custom_getters.hasOwnProperty(property) ?
                                //...if there is one - use it...
                                this[this[_privates].interface].custom_getters[property] :
                                //...if not - define a default getter, working on a private interface.
                                () =>  { return this[this[_privates].data][property]; };

            //...now define a validator for a property...

                             // First - check if there is a class-specific validator defined...
            let validator =  this[this[_privates].interface].validators.hasOwnProperty(`${property}__${this.constructor.name}`) ?
                             //...if there is one - use it...
                             this[this[_privates].interface].validators[`${property}__${this.constructor.name}`] :
                             //...if not - look for a standard property validator...
                             this[this[_privates].interface].validators.hasOwnProperty(property) ?
                             //...if there is one - use it...
                             this[this[_privates].interface].validators[property] :
                             //...if not - make it undefined. It will ensure that it won't be possible to set this
                             // property via the public interface.
                             undefined;

            //...now finally a setter.
                                // First - check if there is a class-specific setter defined...
            let custom_setter = this[this[_privates].interface].custom_setters.hasOwnProperty(`${property}__${this.constructor.name}`) ?
                                //...if there is one - use it...
                                this[this[_privates].interface].custom_setters[`${property}__${this.constructor.name}`] :
                                //...if not - look for a standard property setter...
                                this[this[_privates].interface].custom_setters.hasOwnProperty(property) ?
                                //...if there is one - use it...
                                this[this[_privates].interface].custom_setters[property] :
                                //...if not - make it undefined. It will ensure that BaseModel will define its own
                                // setter inside a setter wrapper, working on the private interface.
                                undefined;

            // We want to make sure that all properties won't allow to change their accessors but will be enumerable to
            // shown on the object properties' list.
            let descriptor = {
                configurable: false,
                enumerable: true,
                get: custom_getter,
            };

            // If there is no validator for a property or a property is explicitly marked as read-only we are not
            // defining a setter for it. Setting this kind of property through a public interface will raise an error.
            // Only validated properties are allowed to be set.
            if (validator && !readonly_properties.has(property)) {
                // Wrap the property's setter in order to run a validator on it
                descriptor.set = value => {
                     validator(value);

                     if (custom_setter) {
                         // As we are wrapping this we need to explicitly pass the context to the custom setter function
                         custom_setter.call(this, value);
                     }
                     else {
                         this[this[_privates].data][property] = value;
                     }
                 };
            }
            else {
                descriptor.set = value => {
                    throw new errors.ReadOnlyError({ class_name: this.constructor.name, field: property, });
                };
            }

            // Define a property with the prepared descriptor
            Object.defineProperty(this, property, descriptor);
        }

        // Seal whole object in order to prevent non-explicitly-set properties to be added
        Object.seal(this);
    }


    /**
     * Returns a structure with validators, as defined in {@link module:core/models/BaseModel/BaseModel.constructor}
     * @returns {Object}
     * @static
     * @link module:core/models/BaseModel/BaseModel.constructor
     * @link module:core/models/BaseModel~_common_validators
     */
    static get VALIDATORS () { return _common_validators; }


    static get API_PROPERTIES () { throw new errors.NotImplementedError({ class_name: this.constructor.name, field: 'API_PROPERTIES', }); }


    /**
     * Makes all properties of target_object read-only and prevents its reconfiguration.
     * @param target_object
     */
    static lockPropertiesOf (target_object) {
        for (let property of Object.keys(target_object)) {
            Object.defineProperty(target_object, property, {
                enumerable: true,
                writable: false,
                configurable: false,
            });
        }
    }


    /**
     * Checks if all keys in an object passed as an argument are exposed via API and can be used as a constructor
     * payload. This method should be used on API level in order to test passed in the request keys to check if the
     * request is valid.
     */
    static checkAPIProperties (properties) {
        for (let property of Object.keys(properties)) {
            if (!this.API_PROPERTIES.has(property)) {
                throw new errors.InvalidValueError ({ class_name: this.name, field: property, });
            }
        }
    }


    /**
     * Overrides standard Object's toJSON method, used by JSON module to stringify an object.
     * It ensures that all properties mark as hidden won't be exposed in JSON stringification.
     * @returns {Object} object representation with hidden fields removed
     */
    toJSON () {
        let data = {};

        for (let property of this[this[_privates].interface].allowed_properties) {
            if (!this[this[_privates].interface].hidden_properties.has(property)) {
                data[property] = this[property];
            }
        }

        return data;
    }


    /**
     * Creates a shallow copy of the inheriting class. It uses private interfaces of both classes in order to clone all,
     * even not publicly accessible data. The cloned object will use the same Symbols as the original one to conceal its
     * private members.
     * @returns {Object}
     */
    clone () {
        let cloned_object = new this.constructor();
        Object.assign(cloned_object[this[_privates].data], this[this[_privates].data]);
        Object.assign(cloned_object[this[_privates].interface], this[this[_privates].interface]);

        return cloned_object;
    }


    /**
     * Publicly available interface to inject a database session id if one was not provided during the object's
     * initialisation in constructor. Session id is necessary for transactions mechanism and used by BaseModel's
     * database facing methods.
     * @param session
     */
    initDBSession (session) {
        this[this[_privates].interface][this[_privates].interface.db_session_id] = session;
    }


    /**
     * Publicly available interface to remove a database session id, indicating that BaseModel's database facing methods
     * should no longer use transactions.
     */
    closeDBSession () {
        this[this[_privates].interface][this[_privates].interface.db_session_id] = undefined;
    }


    /**
     * Helper method ensuring that all properties set as required are defined. All methods storing an object in the
     * database should run in to ensure data integrity.
     */
    checkRequiredProperties () {
        for (let property of this[this[_privates].interface].required_properties) {
            if (this[property] === undefined) {
                throw new errors.ValueRequiredError ({ class_name: this.constructor.name, field: property, });
            }
        }
    }


    /**
     * Create a new representation of the current object in the database.
     * It uses a database name defined in [the object's constructor]{@link module:core/models/BaseModel/BaseModel.constructor},
     * under "db_table" key.
     * Method ensures that all required keys are defined by calling {@link module:core/models/BaseModel/BaseModel.checkRequiredProperties}.
     * @returns {Promise<object>}
     * @async
     */
    async create() {
        try {
            this.checkRequiredProperties();

            if (!this[this[_privates].interface].db_table) {
                throw new Error('Missing database table name')
            }

            let data = {};

            for (let property of this[this[_privates].interface].allowed_properties) {
                data[property] = this[this[_privates].data][property];
            }

            // We are ensuring that each object will have the "created" property - it can be explicitly set or if not -
            // it will use current date
            if (!this[this[_privates].data].hasOwnProperty('created')) {
                this[this[_privates].data].created = new Date();
            }

            await db.insert(this[this[_privates].interface].db_table, data);

            return this;
        }
        catch (e) {
            console.log(`${this.constructor.name} create error`, e);
            throw new errors.FatalError(`Unable to create ${this.constructor.name}`);
        }
    }


    /**
     * Saves the current object's representation overwriting currently existing object.
     * It uses a database name defined in [the object's constructor]{@link module:core/models/BaseModel/BaseModel.constructor},
     * under "db_table" key as well as id field name (db_id_field) and id value (db_id_value).
     * Method ensures that all required keys are defined by calling {@link module:core/models/BaseModel/BaseModel.checkRequiredProperties}.
     * @returns {Promise<Object>}
     * @async
     */
    async save ({ query={}, }={}) {
        try {
            this.checkRequiredProperties();

            let id_value = this[this[_privates].interface].db_id_value ?
                           this[this[this[_privates].interface].db_id_value] :
                           this[this[this[_privates].interface].db_id_field];

            let save_query = { [this[this[_privates].interface].db_id_field]: id_value, };

            Object.assign(save_query, query);

            // TODO: move globally required/allowed/hidden fields like created and updated to the BaeModel
            // Make sure to always include the "updated" field
            this[this[_privates].data].updated = new Date();

            let modify_result = await db.findAndModify(this[this[_privates].interface].db_table,
                // What field to look for...
                save_query,
                // ...what data to change...
                { ...this[this[_privates].data], },
                // ...should we use transactions.
                { db_session: this[this[_privates].interface][this[_privates].interface.db_session_id], }
            );

            if (!modify_result) {
                throw new errors.PersistenceError('Transaction not found or already migrated to a different status');
            }

            return this;
        }
        catch (e) {
            console.log(`${this.constructor.name} save error`, e);

            // If the transient error is catched, it means that it was not fatal and could happen because a record was
            // locked by a different transaction so we can try and retry the whole transaction
            if (e.errorLabels && e.errorLabels.indexOf('TransientTransactionError') >= 0) {
                console.log(`${this.constructor.name} TransientTransactionError - retrying transaction`);
                await this.save(args);
            } else {
                throw new errors.FatalError(`Unable to save ${this.constructor.name}`);
            }
        }
    }


    /**
     * If the inheriting class supports and uses statuses to represent its internal state (or a state of an entity it's
     * representing) it should implement this method to move its state to a final status i.e. to mark a Transaction as
     * resolved.
     * @param input_data
     * @returns {Promise<Object>}
     */
    async resolve (input_data) {
        throw errors.NotImplementedError({ class_name: this.constructor.name, field: 'resolve', })
    }
};



