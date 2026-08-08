const Grupo = require('../models/Grupo');
const Evaluation = require('../models/Evaluation');
const Credito = require('../models/Credito');
const Cliente = require('../models/Cliente');
const { dbControlVam } = require('../config/db');
const axios = require('axios');

// Obtener todos los grupos + clientes individuales combinados
const getAllGrupos = async (req, res) => {
    try {
        // ── Obtenemos mapa de asesores (id/username -> nombre) ──────────────
        const asesoresMap = new Map();
        try {
            const resp = await axios.get('https://servidor-pwa-control.onrender.com/api/users/users-asesores');
            if (Array.isArray(resp.data)) {
                resp.data.forEach(u => {
                    const nombre = u.nombre || u.username || '';
                    if (u._id) asesoresMap.set(u._id.toString(), nombre);
                    if (u.username) asesoresMap.set(u.username.toString(), nombre);
                    if (u.nombre) asesoresMap.set(u.nombre.toString(), nombre);
                });
            }
        } catch (err) {
            console.error('Error al obtener mapa de asesores:', err.message);
        }

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

            const rawAsesor = grupo.asesor || grupo.evaluadorAsignado || '';
            const asesorNombre = asesoresMap.get(rawAsesor.toString()) || rawAsesor.toString();

            return {
                ...grupo,
                evaluadorAsignado: asesorNombre,
                asesor: asesorNombre,
                tipo: 'grupo'
            };
        }));

        // ── Clientes individuales: enriquecer desde Crédito ──────────────────
        const clientes = await Cliente.find().lean();
        const clientesFormateados = await Promise.all(clientes.map(async (cliente) => {
            let credito = await Credito.findOne({
                $or: [{ cliente: cliente._id }, { miembro: cliente._id }],
                estado: 'Activo'
            }).sort({ ciclo: -1 }).lean();

            if (!credito) {
                credito = await Credito.findOne({
                    $or: [{ cliente: cliente._id }, { miembro: cliente._id }]
                }).sort({ ciclo: -1 }).lean();
            }

            const cicloActual = credito?.ciclo?.toString() || cliente.cicloActual?.toString() || '';
            const semanaActual = credito?.semanaActual?.toString() || cliente.semanaActual?.toString() || '';

            const rawAsesor = cliente.asesor || cliente.evaluadorAsignado || credito?.asesor || credito?.evaluadorAsignado || '';
            const asesorNombre = asesoresMap.get(rawAsesor.toString()) || rawAsesor.toString();

            return {
                _id: cliente._id,
                nombre: cliente.nombre,
                semanaActual,
                cicloActual,
                evaluadorAsignado: asesorNombre,
                asesor: asesorNombre,
                tipo: 'cliente',
            };
        }));

        // ── Combinar y ordenar alfabéticamente por nombre ─────────────────────
        const combinado = [...gruposConDatos, ...clientesFormateados]
            .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));

        res.status(200).json({ success: true, data: combinado });
    } catch (error) {
        console.error('Error al obtener grupos y clientes:', error);
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

// Obtener todos los asesores desde el endpoint remoto de usuarios
const getAsesores = async (req, res) => {
    try {
        const response = await axios.get('https://servidor-pwa-control.onrender.com/api/users/users-asesores');
        let asesores = [];
        if (Array.isArray(response.data)) {
            asesores = response.data
                .map(u => u.nombre || u.username)
                .filter(Boolean);
        } else if (response.data && Array.isArray(response.data.data)) {
            asesores = response.data.data
                .map(u => u.nombre || u.username)
                .filter(Boolean);
        }

        const distinctLocal = await Grupo.distinct('evaluadorAsignado');
        const combinados = Array.from(new Set([...asesores, ...distinctLocal.filter(Boolean)])).sort();

        res.status(200).json({ success: true, data: combinados });
    } catch (error) {
        console.error('Error al obtener asesores remotos:', error.message);
        try {
            const distinctLocal = await Grupo.distinct('evaluadorAsignado');
            res.status(200).json({ success: true, data: distinctLocal.filter(Boolean) });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Error al obtener asesores', error: err.message });
        }
    }
};

// Crear una nueva evaluación 
const createEvaluation = async (req, res) => {
    try {
        const evaluationData = req.body;

        // Verificamos que el evaluador venga en la petición
        if (!evaluationData.datosGenerales || !evaluationData.datosGenerales.nombreEvaluador) {
            return res.status(400).json({ success: false, message: 'El nombre del evaluador es obligatorio en datosGenerales' });
        }

        // Extraer nombre del grupo/cliente
        let rawGrupo = evaluationData.datosGenerales.grupo;
        let grupoNombreStr = typeof rawGrupo === 'object' ? (rawGrupo.nombre || '') : (rawGrupo || '');

        if (!grupoNombreStr && evaluationData.datosGenerales.clienteIndividual?.nombre) {
            grupoNombreStr = evaluationData.datosGenerales.clienteIndividual.nombre;
        }

        if (!grupoNombreStr) {
            return res.status(400).json({ success: false, message: 'El nombre del grupo o cliente es obligatorio en datosGenerales' });
        }

        // Verificamos el rango de evidenciaFotos (1 a 4 fotos)
        if (!evaluationData.evidenciaFotos || !Array.isArray(evaluationData.evidenciaFotos) || evaluationData.evidenciaFotos.length < 1 || evaluationData.evidenciaFotos.length > 4) {
            return res.status(400).json({ success: false, message: 'Debe proporcionar de 1 a 4 fotos como evidencia de la evaluación.' });
        }

        // ── 1. Determinar grupoId / clienteId ──────────────────────────────
        let grupoObj = { grupoId: null, nombre: grupoNombreStr };
        let clienteIndividualObj = { clienteId: null, nombre: '' };

        const inputGrupoId = typeof rawGrupo === 'object' ? rawGrupo.grupoId : null;
        const inputClienteId = evaluationData.datosGenerales.clienteIndividual?.clienteId;

        if (inputGrupoId) {
            const foundGrupo = await Grupo.findById(inputGrupoId).lean();
            if (foundGrupo) {
                grupoObj = { grupoId: foundGrupo._id, nombre: foundGrupo.nombre };
            }
        } else if (inputClienteId) {
            const foundCliente = await Cliente.findById(inputClienteId).lean();
            if (foundCliente) {
                clienteIndividualObj = { clienteId: foundCliente._id, nombre: foundCliente.nombre };
                grupoObj = { grupoId: null, nombre: foundCliente.nombre };
            }
        }

        if (!grupoObj.grupoId && !clienteIndividualObj.clienteId) {
            const foundGrupoByName = await Grupo.findOne({ nombre: grupoNombreStr }).lean();
            if (foundGrupoByName) {
                grupoObj = { grupoId: foundGrupoByName._id, nombre: foundGrupoByName.nombre };
            } else {
                const foundClienteByName = await Cliente.findOne({ nombre: grupoNombreStr }).lean();
                if (foundClienteByName) {
                    clienteIndividualObj = { clienteId: foundClienteByName._id, nombre: foundClienteByName.nombre };
                    grupoObj = { grupoId: null, nombre: foundClienteByName.nombre };
                }
            }
        }

        // ── 2. Resolver información del asesor y su coordinación ───────────
        const targetAsesorName = evaluationData.datosGenerales.asesorGrupo ||
            evaluationData.datosGenerales.asesorEvaluadoNombre || '';

        let asesorEvaluadoId = evaluationData.datosGenerales.asesorEvaluadoId || null;
        let asesorEvaluadoNombre = targetAsesorName || null;
        let coordinacionId = evaluationData.datosGenerales.coordinacionId || null;
        let coordinacionNombre = evaluationData.datosGenerales.coordinacionNombre || null;

        if (targetAsesorName) {
            try {
                const resp = await axios.get('https://servidor-pwa-control.onrender.com/api/users/users-asesores');
                if (Array.isArray(resp.data)) {
                    const userMatch = resp.data.find(u =>
                        (u.nombre && u.nombre.trim().toLowerCase() === targetAsesorName.trim().toLowerCase()) ||
                        (u.username && u.username.trim().toLowerCase() === targetAsesorName.trim().toLowerCase()) ||
                        (u._id && u._id.toString() === targetAsesorName)
                    );

                    if (userMatch) {
                        asesorEvaluadoId = userMatch._id ? userMatch._id.toString() : asesorEvaluadoId;
                        asesorEvaluadoNombre = userMatch.nombre || userMatch.username || asesorEvaluadoNombre;
                        if (userMatch.coordinacion) {
                            coordinacionId = userMatch.coordinacion._id ? userMatch.coordinacion._id.toString() : null;
                            coordinacionNombre = userMatch.coordinacion.nombre || null;
                        }
                    }
                }
            } catch (err) {
                console.error('Error al resolver asesor/coordinación remoto:', err.message);
            }
        }

        const filter = {
            'datosGenerales.semanaEvaluada': evaluationData.datosGenerales.semanaEvaluada,
            'datosGenerales.cicloEvaluado': evaluationData.datosGenerales.cicloEvaluado,
            'datosGenerales.procesoEvaluado': evaluationData.datosGenerales.procesoEvaluado,
            $or: [
                { 'datosGenerales.grupo.nombre': grupoNombreStr },
                { 'datosGenerales.grupo': grupoNombreStr }
            ]
        };

        const update = {
            ...evaluationData,
            datosGenerales: {
                ...evaluationData.datosGenerales,
                grupo: grupoObj,
                clienteIndividual: clienteIndividualObj,
                asesorEvaluadoId,
                asesorEvaluadoNombre,
                coordinacionId,
                coordinacionNombre,
                fechaEvaluacion: evaluationData.datosGenerales.fechaEvaluacion || new Date()
            }
        };

        const evaluacionGuardada = await Evaluation.findOneAndUpdate(filter, update, {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true
        });

        res.status(201).json({ success: true, message: 'Evaluación guardada exitosamente', data: evaluacionGuardada });
        console.log(`Evaluación guardada para: ${grupoNombreStr} | grupoId: ${grupoObj.grupoId} | Asesor: ${asesorEvaluadoNombre} | Coordinación: ${coordinacionNombre}`);
    } catch (error) {
        console.error('Error al crear/sincronizar evaluación:', error);
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

// Obtener el asesor asignado a un grupo o cliente específico por ID (mapeado a su nombre real)
const getAsesorPorGrupo = async (req, res) => {
    try {
        const { grupoId } = req.params;
        let entidad = await Grupo.findById(grupoId).lean();
        let esCliente = false;

        if (!entidad) {
            entidad = await Cliente.findById(grupoId).lean();
            esCliente = true;
        }

        if (!entidad) {
            return res.status(404).json({
                success: false,
                message: 'Grupo o cliente no encontrado'
            });
        }

        let rawAsesor = entidad.asesor || entidad.evaluadorAsignado || null;

        if (!rawAsesor && esCliente) {
            const credito = await Credito.findOne({
                $or: [{ cliente: entidad._id }, { miembro: entidad._id }]
            }).sort({ ciclo: -1 }).lean();
            if (credito) {
                rawAsesor = credito.asesor || credito.evaluadorAsignado || null;
            }
        }

        let asesorNombre = rawAsesor ? rawAsesor.toString() : null;

        if (rawAsesor) {
            try {
                const resp = await axios.get('https://servidor-pwa-control.onrender.com/api/users/users-asesores');
                if (Array.isArray(resp.data)) {
                    const foundUser = resp.data.find(u =>
                        u._id?.toString() === rawAsesor.toString() ||
                        u.username?.toString() === rawAsesor.toString() ||
                        u.nombre?.toString() === rawAsesor.toString()
                    );
                    if (foundUser) {
                        asesorNombre = foundUser.nombre || foundUser.username;
                    }
                }
            } catch (err) {
                console.error('Error al resolver nombre de asesor:', err.message);
            }
        }

        return res.status(200).json({
            success: true,
            data: {
                grupoId: entidad._id,
                asesor: asesorNombre
            }
        });
    } catch (error) {
        console.error('Error al obtener asesor:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: error.message
        });
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

const getClientesMaster = async (req, res) => {
    try {
        const response = await fetch(
            'https://servidor-pwa-control.onrender.com/api/clientes/clientes-master'
        );

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                message: 'Error al consultar el servidor remoto'
            });
        }

        const data = await response.json();

        res.status(200).json(data);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Error al obtener clientes master',
            error: error.message
        });
    }
};



const getClientesEjecutivas = async (req, res) => {
    try {
        const response = await axios.get('https://servidor-pwa-control.onrender.com/api/clientes/clientes-master/');
        let clientes = [];
        if (Array.isArray(response.data)) {
            clientes = response.data
                .map(u => u.nombre || u.username)
                .filter(Boolean);
        } else if (response.data && Array.isArray(response.data.data)) {
            clientes = response.data.data
                .map(u => u.nombre || u.username)
                .filter(Boolean);
        }

        const distinctLocal = await Grupo.distinct('evaluadorAsignado');
        const combinados = Array.from(new Set([...clientes, ...distinctLocal.filter(Boolean)])).sort();

        res.status(200).json({ success: true, data: combinados });
    } catch (error) {
        console.error('Error al obtener clientes remotos:', error.message);
        try {
            const distinctLocal = await Grupo.distinct('evaluadorAsignado');
            res.status(200).json({ success: true, data: distinctLocal.filter(Boolean) });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Error al obtener clientes', error: err.message });
        }
    }
}
module.exports = {
    getAllGrupos,
    getGruposPorAsesor,
    getGrupoById,
    getAsesores,
    getAsesorPorGrupo,
    createEvaluation,
    getGrupos,
    getCicloSemanaGrupo,
    getEvaluations,
    getAllEvaluations,
    getEvaluationBySucursal,
    getClientesEjecutivas,
    getClientesMaster
}