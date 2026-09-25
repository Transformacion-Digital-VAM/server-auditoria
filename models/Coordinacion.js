const { Schema } = require('mongoose');
const { dbControlVam } = require('../config/db');

const CoordinacionSchema = new Schema({
    nombre: String,
    municipio: String,
    coordinador: String
});

const CoordinacionModel = dbControlVam.model('Coordinacion', CoordinacionSchema, 'coordinacions');

module.exports = CoordinacionModel;