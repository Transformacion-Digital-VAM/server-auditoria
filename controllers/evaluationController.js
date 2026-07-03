const Grupo = require('../models/Grupo');
const Evaluation = require('../models/Evaluation');
const Credito = require('../models/Credito');

// Obtener todos los grupos y enriquecer con ciclo y semana desde créditos
const getAllGrupos = async (req, res) => {
  try {
    const grupos = await Grupo.find().lean();
    
    const gruposConDatos = await Promise.all(grupos.map(async (grupo) => {
      if (grupo.integrantes && grupo.integrantes.length > 0) {
        const primerIntegrante = grupo.integrantes[0];
        const credito = await Credito.findOne({ miembro: primerIntegrante }).lean();
        
        if (credito) {
          grupo.cicloActual = credito.ciclo || grupo.cicloActual;
          grupo.semanaActual = credito.semanaActual || grupo.semanaActual;
        }
      }
      return grupo;
    }));

    res.status(200).json({ success: true, data: gruposConDatos });
  } catch (error) {
    console.error('Error al obtener todos los grupos:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

// Obtener grupos asignados a un asesor específico y enriquecer con ciclo/semana
const getGruposPorAsesor = async (req, res) => {
  try {
    const { asesor } = req.params; 

    const grupos = await Grupo.find({ evaluadorAsignado: asesor }).lean();
    
    if (!grupos || grupos.length === 0) {
      return res.status(404).json({ success: false, message: 'No se encontraron grupos para este asesor' });
    }

    const gruposConDatos = await Promise.all(grupos.map(async (grupo) => {
      if (grupo.integrantes && grupo.integrantes.length > 0) {
        const primerIntegrante = grupo.integrantes[0];
        const credito = await Credito.findOne({ miembro: primerIntegrante }).lean();
        
        if (credito) {
          grupo.cicloActual = credito.ciclo || grupo.cicloActual;
          grupo.semanaActual = credito.semanaActual || grupo.semanaActual;
        }
      }
      return grupo;
    }));

    res.status(200).json({ success: true, data: gruposConDatos });
  } catch (error) {
    console.error('Error al obtener grupos por asesor:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

// Obtener un grupo en específico por ID y enriquecer con ciclo/semana
const getGrupoById = async (req, res) => {
  try {
    const { id } = req.params;
    const grupo = await Grupo.findById(id).lean();

    if (!grupo) {
      return res.status(404).json({ success: false, message: 'Grupo no encontrado' });
    }

    if (grupo.integrantes && grupo.integrantes.length > 0) {
      const primerIntegrante = grupo.integrantes[0];
      const credito = await Credito.findOne({ miembro: primerIntegrante }).lean();
      
      if (credito) {
        grupo.cicloActual = credito.ciclo || grupo.cicloActual;
        grupo.semanaActual = credito.semanaActual || grupo.semanaActual;
      }
    }

    res.status(200).json({ success: true, data: grupo });
  } catch (error) {
    console.error('Error al obtener grupo por ID:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

// Obtener todos los asesores
const getAsesores = async (req, res) => {
  try {
    const asesores = await Grupo.distinct('evaluadorAsignado');
    res.status(200).json({ success: true, data: asesores });
  } catch (error) {
    console.error('Error al obtener asesores:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

// Crear una nueva evaluación 
const createEvaluation = async (req, res) => {
  try {
    const evaluationData = req.body;

    // Verificamos que el grup exista
    if (!evaluationData.datosGenerales || !evaluationData.datosGenerales.grupoId) {
      return res.status(400).json({ success: false, message: 'El ID del grupo (grupoId) es obligatorio en datosGenerales' });
    }

    
    const grupoExiste = await Grupo.findById(evaluationData.datosGenerales.grupoId);
    if (!grupoExiste) {
      return res.status(404).json({ success: false, message: 'El grupo especificado no existe' });
    }

    const nuevaEvaluacion = new Evaluation({
      ...evaluationData,
      datosGenerales: {
        ...evaluationData.datosGenerales,
        fechaEvaluacion: evaluationData.datosGenerales.fechaEvaluacion || new Date()
      }
    });

    await nuevaEvaluacion.save();

    res.status(201).json({ success: true, message: 'Evaluación guardada exitosamente', data: nuevaEvaluacion });
  } catch (error) {
    console.error('Error al crear evaluación:', error);
    res.status(500).json({ success: false, message: 'Error al guardar la evaluación', error: error.message });
  }
};

// Obtener todas las evaluaciones
const getAllEvaluations = async (req, res) => {
  try {
    const evaluaciones = await Evaluation.find().lean();
    res.status(200).json({ success: true, count: evaluaciones.length, data: evaluaciones });
  } catch (error) {
    console.error('Error al obtener evaluaciones:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
  }
};

module.exports = {
  getAllGrupos,
  getGruposPorAsesor,
  getGrupoById,
  getAsesores,
  createEvaluation,
  getAllEvaluations
};
