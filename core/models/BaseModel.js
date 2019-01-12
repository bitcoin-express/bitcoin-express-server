"use strict";
const config = require('config');
const db = require(config.get('system.root_dir') + '/db');

const errors = require(config.get('system.root_dir') + '/core/models/Errors');

const _privates = Symbol('_privates');

exports.BaseModel = class BaseModel {
    constructor({
                    private_data_container_key=undefined,
                    private_interface_key=undefined,
                    db_session_id=undefined,
                    allowed_properties=[],
                    required_properties=[],
                    hidden_properties=[],
                    custom_getters={},
                    custom_setters={},
                    validators={},
                    db_table={},
                    db_id_field=undefined,
                }) {
        if (!private_data_container_key) {
            throw new errors.ValueRequiredError({ class_name: 'BaseModel', field: 'private_data_container_key', });
        }

        if (!private_interface_key) {
            throw new errors.ValueRequiredError({ class_name: 'BaseModel', field: 'private_interface_key', });
        }

        this[_privates] = {
            data: private_data_container_key,
            interface: private_interface_key,
        };

        this[this[_privates].data] = {};
        this[this[_privates].interface] = {
            db_session_id,
            allowed_properties,
            required_properties,
            hidden_properties,
            custom_getters,
            custom_setters,
            validators,
            db_table,
            db_id_field,
        };

        // Make this container invisible for any methods working on properties
        Object.defineProperty(this, this[_privates].data, {
            enumerable: false,
        });

        // Make this container invisible and immutable for any methods working on properties
        Object.defineProperty(this, this[_privates].interface, {
            enumerable: false,
            configurable: false,
            writable: false,
        });

        // Make this container invisible and immutable for any methods working on properties
        Object.defineProperty(this, _privates, {
            enumerable: false,
            configurable: false,
            writable: false,
        });


        // console.log(this[this[_privates].interface].custom_setters.hasOwnProperty(`${property}__${this.constructor.name}`))

        for (let property of this[this[_privates].interface].allowed_properties) {
            let custom_getter = this[this[_privates].interface].custom_getters.hasOwnProperty(`${property}__${this.constructor.name}`) ?
                                this[this[_privates].interface].custom_getters[`${property}__${this.constructor.name}`] :
                                this[this[_privates].interface].custom_getters.hasOwnProperty(property) ?
                                this[this[_privates].interface].custom_getters[property] :
                                () =>  { return this[this[_privates].data][property]; }

            let validator =  this[this[_privates].interface].validators.hasOwnProperty(`${property}__${this.constructor.name}`) ?
                             this[this[_privates].interface].validators[`${property}__${this.constructor.name}`] :
                             this[this[_privates].interface].validators.hasOwnProperty(property) ?
                             this[this[_privates].interface].validators[property] :
                             undefined;

            let custom_setter = this[this[_privates].interface].custom_setters.hasOwnProperty(`${property}__${this.constructor.name}`) ?
                                this[this[_privates].interface].custom_setters[`${property}__${this.constructor.name}`] :
                                this[this[_privates].interface].custom_setters.hasOwnProperty(property) ?
                                this[this[_privates].interface].custom_setters[property] :
                                undefined;

            let descriptor = {
                configurable: false,
                enumerable: true,
                get: custom_getter,
            };

            // If there is no validator for a property then this property is readonly.
            // Only validated properties are allowed to be set.
            if (validator) {
                descriptor.set = value => {
                     validator(value);

                     if (custom_setter) {
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

            Object.defineProperty(this, property, descriptor);
        }

        Object.seal(this);
    }

    static get VALIDATORS () { return {}; }

    static lockPropertiesOf (target_object) {
        for (let property of Object.keys(target_object)) {
            Object.defineProperty(target_object, property, {
                enumerable: true,
                writable: false,
                configurable: false,
            });
        }
    }

    toJSON () {
        let data = {};

        for (let property of this[this[_privates].interface].allowed_properties) {
            if (!this[this[_privates].interface].hidden_properties.includes(property)) {
                data[property] = this[property];
            }
        }

        return data;
    }

    initDBSession (session) {
        this[this[_privates].interface][this[_privates].interface.db_session_id] = session;
    }

    closeDBSession () {
        this[this[_privates].interface][this[_privates].interface.db_session_id] = undefined;
    }

    checkRequiredProperties () {
        for (let property of this[this[_privates].interface].required_properties) {
            if (this[property] === undefined) {
                throw new errors.ValueRequiredError ({ class_name: this.constructor.name, field: property, });
            }
        }
    }

    async prepareInputData (input_data) {
        throw new errors.NotImplementedError({ class_name: this.constructor.name, field: 'prepareInputData', })
    }

    async create() {
        try {
            this.checkRequiredProperties();

            let data = {};

            for (let property of this[this[_privates].interface].allowed_properties) {
                data[property] = this[this[_privates].data][property];
            }

            await db.insert(this[this[_privates].interface].db_table, data);
        }
        catch (e) {
            console.log(`${this.constructor.name} create error`, e);
            throw new errors.FatalError(`Unable to create ${this.constructor.name}`);
        }
    }

    async save () {
        try {
            this.checkRequiredProperties();

            await db.findAndModify(this[this[_privates].interface].db_table,
                {
                    [this[this[_privates].interface].db_id_field]: this[this[this[_privates].interface].db_id_field],
                },
                {
                    ...this[this[_privates].data],
                },
                {
                    db_session: this[this[_privates].interface][this[_privates].interface.db_session_id],
                }
            );

            return this;
        }
        catch (e) {
            console.log(`${this.constructor.name} save error`, e);

            // If transient error, retry the whole transaction
            if (e.errorLabels && e.errorLabels.indexOf('TransientTransactionError') >= 0) {
                console.log(`${this.constructor.name} TransientTransactionError - retrying transaction`);
                await this.save();
            } else {
                throw new errors.FatalError(`Unable to save ${this.constructor.name}`);
            }
        }
    }

    async resolve (input_data) {
        throw errors.NotImplementedError({ class_name: this.constructor.name, field: 'resolve', })
    }
};



