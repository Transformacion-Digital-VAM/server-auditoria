const { Schema } = require('mongoose');
const { dbControlVam } = require('../config/db');

const CreditoSchema = new Schema({
  miembro: { type: Schema.Types.ObjectId, ref: 'Miembro', required: false },
  cliente: { type: Schema.Types.ObjectId, ref: 'Cliente', required: false },
  ciclo: { type: Number, required: false },
  semanaActual: { type: String, required: false },
}, { strict: false, timestamps: true });

CreditoSchema.index({ miembro: 1, ciclo: 1, tipoCredito: 1 }, { unique: true });

const CreditoModel = dbControlVam.model('Credito', CreditoSchema, 'creditos');

module.exports = CreditoModel;
