const { Schema } = require('mongoose');
const { dbEvaluaciones } = require('../config/db');

// Diccionarios de validación
const NivelEnum = ['Ideal', 'Alerta', 'Riesgo'];
const CoincidenciaEnum = ['Coincidencia Total', 'Coincidencia parcial o ninguna'];
const CumplimientoEnum = ['Totalmente', 'Parcial y/o apresurada', 'No'];
const CumplimientoCortoEnum = ['Totalmente', 'Parcialmente', 'No'];

const EvaluationSchema = new Schema({
  datosGenerales: {
    nombreEvaluador: { type: String, required: true },
    grupo: {
      type: String,
      required: true
    },
    semanaEvaluada: { type: String, required: true },
    cicloEvaluado: { type: String, required: true },
    fechaEvaluacion: { type: Date, required: true },
    procesoEvaluado: {
      type: String,
      enum: ['Recuperación', 'Renovación', 'Desembolso', 'Cobranza'],
      required: true
    }
  },

  recuperacion: {
    puntualidadAsesor: { type: String, enum: NivelEnum },
    asistenciaGrupo: { type: String, enum: NivelEnum },
    recuperacionPactado: { type: String, enum: NivelEnum },
    fichaCerrada: { type: String, enum: NivelEnum },
    registroHojaControl: { type: String, enum: NivelEnum },
    cotejoHojaControl: { type: String, enum: NivelEnum },
    recibos: { type: String, enum: NivelEnum },
    montoEfectivo: { type: Number, default: 0 },
    montoTransferencia: { type: Number, default: 0 },
    montoDeposito: { type: Number, default: 0 },
    hayCargosAjustes: { type: Boolean, default: false }
  },

  cargosAjustes: {
    grupoRealizoSolidarios: { type: Boolean, default: false },
    grupoGeneroMultas: { type: Boolean, default: false },
    grupoGeneroMoratorios: { type: Boolean, default: false },
    grupoRealizoAdelantos: { type: Boolean, default: false },
  },

  renovacion: {
    documentacionSemana: { type: String, enum: NivelEnum },
    asesoriaCliente: { type: String, enum: NivelEnum },
    expedientesCompletos: { type: String, enum: NivelEnum },
    valoracionRiesgo: { type: String, enum: NivelEnum },
    observaciones: { type: String, default: "" },
    evaluaraOtroProceso: { type: Boolean, default: false }
  },

  cierreCiclo: {
    saldoCreditoSemana15: { type: Number, default: 0 },
    ahorrosSemana15: { type: Number, default: 0 },
    solidariosSemana15: { type: Number, default: 0 },
    multasSemana15: { type: Number, default: 0 },
    validacionInfo: {
      ahorrosPorSemana: { type: String },
      ahorrosPorCliente: { type: String },
      saldoCredito: { type: String },
      solidarios: { type: String, },
      multas: { type: String, }
    },
    clientesBuenComportamiento: { type: String, default: "" },
    clientesInconsistencias: { type: String, default: "" },
    incidencias: { type: String, default: "" }
  },

  desembolsoCredito: {
    actividadesPrevias: {
      dinamicaPresentacion: { type: String, enum: CumplimientoEnum },
      cierreCiclo: { type: String, enum: CumplimientoEnum },
      comentariosReglamento: { type: String, enum: CumplimientoEnum },
      educacionFinanciera: { type: String, enum: CumplimientoEnum },
      devolucionGarantias: { type: String, enum: CumplimientoEnum },
      pagoSancionesSolidarios: { type: String, enum: CumplimientoEnum },
      comentariosContrato: { type: String, enum: CumplimientoEnum }
    },
    actividadesDurante: {
      solicitoINE: { type: String, enum: CumplimientoCortoEnum },
      firmoDocumentos: { type: String, enum: CumplimientoCortoEnum },
      entregoCreditoPersonal: { type: String, enum: CumplimientoCortoEnum },
      declaroCompromiso: { type: String, enum: CumplimientoCortoEnum }
    },
    actividadesPosteriores: {
      verificoCantidad: { type: String, enum: CumplimientoEnum },
      mensajeCierre: { type: String, enum: CumplimientoEnum },
      recomendacionesRecuperacion: { type: String, enum: CumplimientoEnum }
    },
    observacionesGenerales: { type: String, default: "" }
  },

  cobranza: {
    diasAtraso: { type: String, enum: NivelEnum },
    estrategiasASEC: { type: String, enum: NivelEnum },
    acciones: { type: String, enum: NivelEnum },
    saldoVencido: { type: String, enum: NivelEnum },
    observacionesGenerales: { type: String, default: "" }
  },

  evidenciaFotos: {
    type: [String],
    default: []
  }
}, { timestamps: true });

const EvaluationModel = dbEvaluaciones.model('Evaluation', EvaluationSchema, 'evaluaciones');

module.exports = EvaluationModel;