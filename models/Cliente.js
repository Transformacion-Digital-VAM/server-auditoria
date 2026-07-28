const { Schema } = require('mongoose');
const { dbControlVam } = require('../config/db');

const ClienteSchema = new Schema({
    nombre: { type: String, required: true },
    semanaActual: { type: String, required: true },
    cicloActual: { type: String, required: true },
    evaluadorAsignado: { type: String, required: true }
});

const ClienteModel = dbControlVam.model('Cliente', ClienteSchema, 'clientes');

module.exports = ClienteModel;