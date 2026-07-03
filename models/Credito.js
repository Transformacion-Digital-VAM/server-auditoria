const { Schema } = require('mongoose');
const { dbControlVam } = require('../config/db');

const CreditoSchema = new Schema({
  miembro: { type: Schema.Types.ObjectId, required: true },
  ciclo: { type: String },
  semanaActual: { type: String }
}, { strict: false }); 

const CreditoModel = dbControlVam.model('Credito', CreditoSchema, 'creditos');

module.exports = CreditoModel;
