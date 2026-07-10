const Grupo = require('../models/Grupo');
const Evaluation = require('../models/Evaluation');
const Credito = require('../models/Credito');
const { dbControlVam } = require('../config/db');

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

    // Verificamos que el grupo venga en la petición
    if (!evaluationData.datosGenerales || !evaluationData.datosGenerales.grupo) {
      return res.status(400).json({ success: false, message: 'El nombre del grupo es obligatorio en datosGenerales' });
    }

    // Verificamos el rango de evidenciaFotos (1 a 4 fotos)
    if (!evaluationData.evidenciaFotos || !Array.isArray(evaluationData.evidenciaFotos) || evaluationData.evidenciaFotos.length < 1 || evaluationData.evidenciaFotos.length > 4) {
      return res.status(400).json({ success: false, message: 'Debe proporcionar de 1 a 4 fotos como evidencia de la evaluación.' });
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
    console.log(evaluationData)
  } catch (error) {
    console.error('Error al crear evaluación:', error);
    res.status(500).json({ success: false, message: 'Error al guardar la evaluación', error: error.message });
  }
};

const getGrupos = async (req, res) => {
  try {
    const grupos = await Grupo.find();
    res.status(200).json({ success: true, data: grupos });
  } catch (error) {
    console.error('Error al obtener grupos:', error);
  }
}

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

const getCicloSemanaGrupo = async (req, res) => {
  try {
    const { grupoId } = req.params;

    // Buscar el grupo
    const grupo = await Grupo.findById(grupoId);

    if (!grupo) {
      return res.status(404).json({
        success: false,
        message: 'El grupo no existe'
      });
    }

    // Verificar que tenga integrantes
    if (!grupo.integrantes || grupo.integrantes.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'El grupo no tiene integrantes'
      });
    }

    // Tomar el primer integrante
    const primerMiembro = grupo.integrantes[0];

    // Buscar el crédito activo del primer integrante
    const credito = await Credito.findOne({
      miembro: primerMiembro,
      estado: 'Activo'
    }).sort({ ciclo: -1 });

    if (!credito) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró un crédito activo para el grupo'
      });
    }

    // Obtener los nombres de todos los integrantes
    const miembros = await dbControlVam.collection('miembros').find({ _id: { $in: grupo.integrantes } }).toArray();
    const integrantesNombres = miembros.map(m => `${m.nombre || ''} ${m.apellidos || ''}`.trim().replace(/\s+/g, ' '));

    return res.status(200).json({
      success: true,
      data: {
        grupoId: grupo._id,
        miembroReferencia: primerMiembro,
        cicloActual: credito.ciclo,
        semanaActual: credito.semanaActual,
        integrantes: integrantesNombres
      }
    });

  } catch (error) {
    console.error('Error al obtener ciclo y semana:', error);

    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};


const getEvaluations = async (req, res) => {
  try {
    const evaluations = await Evaluation.find().sort({ createdAt: -1 });

    // Populate manually since models are on different connection databases
    const populated = [];
    for (const item of evaluations) {
      const itemObj = item.toObject();
      if (itemObj.datosGenerales) {
        // Soporte para registros antiguos con grupoId
        if (itemObj.datosGenerales.grupoId && !itemObj.datosGenerales.grupo) {
          try {
            const grupo = await Grupo.findById(itemObj.datosGenerales.grupoId);
            itemObj.datosGenerales.grupo = grupo ? grupo.nombre : 'Grupo Desconocido';
          } catch (err) {
            itemObj.datosGenerales.grupo = 'Grupo Desconocido';
          }
        }
      }
      populated.push(itemObj);
    }

    res.status(200).json({ success: true, data: populated });
  } catch (error) {
    console.error('Error al obtener evaluaciones:', error);
    res.status(500).json({ success: false, message: 'Error al obtener evaluaciones', error: error.message });
  }
};


const getEvaluationBySucursal = async (req, res) => {
  try {
    const { sucursal } = req.params;
    const evaluations = await Evaluation.find({ 'datosGenerales.sucursal': sucursal });
    res.status(200).json({ success: true, data: evaluations });
  } catch (error) {
    console.error('Error al obtener evaluaciones:', error);
    res.status(500).json({ success: false, message: 'Error al obtener evaluaciones', error: error.message });
  }
};
module.exports = {
  getAllGrupos,
  getGruposPorAsesor,
  getGrupoById,
  getAsesores,
  createEvaluation,
  getGrupos,
  getCicloSemanaGrupo,
  getEvaluations,
  getAllEvaluations,
  getEvaluationBySucursal
} 
