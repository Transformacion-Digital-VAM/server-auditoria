const { Schema } = require('mongoose');
const { dbControlVam } = require('../config/db');

const GrupoSchema = new Schema({
  nombre: { type: String, required: true },
  semanaActual: { type: String, required: true },
  cicloActual: { type: String, required: true },
  evaluadorAsignado: { type: String, required: true }
});

const GrupoModel = dbControlVam.model('Grupo', GrupoSchema, 'grupos');

module.exports = GrupoModel;