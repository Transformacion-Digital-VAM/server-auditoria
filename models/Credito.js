const mongoose = require('mongoose');

const creditoSchema = new mongoose.Schema({
    miembro: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Miembro',
        required: false
    },
    cliente: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Cliente',
        required: false
    },
    ciclo: { type: Number, required: false },
    semanaActual: {
        type: String,
        required: true
    }
}, { timestamps: true });

creditoSchema.index({ miembro: 1, ciclo: 1, tipoCredito: 1 }, { unique: true });

module.exports = mongoose.model('Credito', creditoSchema);
