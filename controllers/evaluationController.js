const Grupo = require('../models/Grupo');
const Evaluation = require('../models/Evaluation');

// Obtener grupos asignados a un asesor específico
const getGruposPorAsesor = async (req, res) => {
  try {
    const { asesor } = req.params; 

    const grupos = await Grupo.find({ evaluadorAsignado: asesor });
    
    if (!grupos || grupos.length === 0) {
      return res.status(404).json({ success: false, message: 'No se encontraron grupos para este asesor' });
    }

    res.status(200).json({ success: true, data: grupos });
  } catch (error) {
    console.error('Error al obtener grupos por asesor:', error);
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

module.exports = {
  getGruposPorAsesor,
  getAsesores,
  createEvaluation
};
