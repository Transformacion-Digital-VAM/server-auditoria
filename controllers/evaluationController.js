const Grupo = require('../models/Grupo');
const Evaluation = require('../models/Evaluation');
const Credito = require('../models/Credito');
const Cliente = require('../models/Cliente');
const { dbControlVam } = require('../config/db');
const axios = require('axios');

// ── Cache en memoria para asesores y coordinaciones (TTL: 10 minutos) ──
let asesoresCache = {
    data: null,
    asesoresMap: new Map(),
    coordinacionesMap: new Map(),
    expiresAt: 0
};

const MAX_EVALUATIONS_PER_PAGE = 50;
const MAX_PHOTOS_BYTES = 12 * 1024 * 1024;

function getPagination(query) {
    const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
    const requestedLimit = Number.parseInt(query.limit, 10) || 20;
    const limit = Math.min(Math.max(requestedLimit, 1), MAX_EVALUATIONS_PER_PAGE);

    return {
        page,
        limit,
        skip: (page - 1) * limit
    };
}

async function getAsesoresData() {
    const now = Date.now();
    if (asesoresCache.data && now < asesoresCache.expiresAt) {
        return asesoresCache;
    }

    const asesoresMap = new Map();
    const coordinacionesMap = new Map();
    let rawList = [];

    try {
        const resp = await axios.get('https://servidor-pwa-control-lku5.onrender.com/api/users/users-asesores', {
            timeout: 8000
        });
        rawList = Array.isArray(resp.data) ? resp.data : (resp.data?.data || []);
        rawList.forEach(u => {
            const nombre = u.nombre || u.username || '';
            const coord = (typeof u.coordinacion === 'object' && u.coordinacion?.nombre)
                ? u.coordinacion.nombre
                : (u.coordinacionNombre || u.coordinacion || '');

            const keys = [u._id?.toString(), u.username?.toString(), u.nombre?.toString()].filter(Boolean);
            keys.forEach(k => {
                if (nombre) asesoresMap.set(k, nombre);
                if (coord) coordinacionesMap.set(k, coord);
            });
        });

        asesoresCache = {
            data: rawList,
            asesoresMap,
            coordinacionesMap,
            expiresAt: now + (10 * 60 * 1000) // 10 minutos de caché
        };
    } catch (err) {
        console.error('Error al obtener mapa de asesores/coordinaciones (usando caché si existe):', err.message);
        if (asesoresCache.data) {
            return asesoresCache;
        }
    }

    return { data: rawList, asesoresMap, coordinacionesMap };
}

// Obtener todos los grupos + clientes individuales combinados (Optimizado con Batch Queries)
const getAllGrupos = async (req, res) => {
    try {
        const { asesoresMap, coordinacionesMap } = await getAsesoresData();

        // 1. Obtener grupos y clientes en paralelo (2 consultas)
        const [grupos, clientes] = await Promise.all([
            Grupo.find().select('nombre semanaActual cicloActual evaluadorAsignado integrantes asesor coordinacion coordinacionNombre').lean(),
            Cliente.find().select('nombre semanaActual cicloActual evaluadorAsignado asesor coordinacion coordinacionNombre').lean()
        ]);

        // 2. Extraer IDs de integrantes y clientes para consultar créditos en lote
        const memberIds = [];
        grupos.forEach(g => {
            if (g.integrantes && g.integrantes.length > 0) {
                memberIds.push(g.integrantes[0]);
            }
        });

        const clientIds = clientes.map(c => c._id);

        // 3. Consultar todos los créditos en 1 sola consulta en lote (elimina N+1 queries)
        const creditQueries = [];
        if (memberIds.length > 0) {
            creditQueries.push({ miembro: { $in: memberIds } });
        }
        if (clientIds.length > 0) {
            creditQueries.push({ cliente: { $in: clientIds } });
            creditQueries.push({ miembro: { $in: clientIds } });
        }

        let creditos = [];
        if (creditQueries.length > 0) {
            creditos = await Credito.find({ $or: creditQueries })
                .select('miembro cliente ciclo semanaActual estado asesor evaluadorAsignado coordinacion coordinacionNombre')
                .sort({ ciclo: -1 })
                .lean();
        }

        // 4. Indexar créditos en Mapas en memoria para acceso O(1)
        const creditoPorMiembro = new Map();
        const creditoPorClienteActivo = new Map();
        const creditoPorClienteCualquiera = new Map();

        creditos.forEach(c => {
            const mId = c.miembro?.toString();
            const clId = c.cliente?.toString();

            if (mId && !creditoPorMiembro.has(mId)) {
                creditoPorMiembro.set(mId, c);
            }
            if (clId) {
                if (c.estado === 'Activo' && !creditoPorClienteActivo.has(clId)) {
                    creditoPorClienteActivo.set(clId, c);
                }
                if (!creditoPorClienteCualquiera.has(clId)) {
                    creditoPorClienteCualquiera.set(clId, c);
                }
            }
            if (mId) {
                if (c.estado === 'Activo' && !creditoPorClienteActivo.has(mId)) {
                    creditoPorClienteActivo.set(mId, c);
                }
                if (!creditoPorClienteCualquiera.has(mId)) {
                    creditoPorClienteCualquiera.set(mId, c);
                }
            }
        });

        // 5. Mapear grupos en memoria
        const gruposConDatos = grupos.map(grupo => {
            let credito = null;
            if (grupo.integrantes && grupo.integrantes.length > 0) {
                const primerIntegrante = grupo.integrantes[0].toString();
                credito = creditoPorMiembro.get(primerIntegrante);
                if (credito) {
                    grupo.cicloActual = credito.ciclo || grupo.cicloActual;
                    grupo.semanaActual = credito.semanaActual || grupo.semanaActual;
                }
            }

            const rawAsesor = grupo.asesor || grupo.evaluadorAsignado || credito?.asesor || credito?.evaluadorAsignado || '';
            const asesorNombre = asesoresMap.get(rawAsesor.toString()) || rawAsesor.toString();
            const rawCoord = grupo.coordinacionNombre || grupo.coordinacion || credito?.coordinacion || credito?.coordinacionNombre || '';
            const coordNombre = (typeof rawCoord === 'object' && rawCoord?.nombre)
                ? rawCoord.nombre
                : (rawCoord.toString() || coordinacionesMap.get(rawAsesor.toString()) || coordinacionesMap.get(asesorNombre) || '');

            return {
                ...grupo,
                evaluadorAsignado: asesorNombre,
                asesor: asesorNombre,
                coordinacion: coordNombre,
                coordinacionNombre: coordNombre,
                tipo: 'grupo'
            };
        });

        // 6. Mapear clientes en memoria
        const clientesFormateados = clientes.map(cliente => {
            const cId = cliente._id.toString();
            const credito = creditoPorClienteActivo.get(cId) || creditoPorClienteCualquiera.get(cId);

            const cicloActual = credito?.ciclo?.toString() || cliente.cicloActual?.toString() || '';
            const semanaActual = credito?.semanaActual?.toString() || cliente.semanaActual?.toString() || '';

            const rawAsesor = cliente.asesor || cliente.evaluadorAsignado || credito?.asesor || credito?.evaluadorAsignado || '';
            const asesorNombre = asesoresMap.get(rawAsesor.toString()) || rawAsesor.toString();
            const rawCoord = cliente.coordinacionNombre || cliente.coordinacion || credito?.coordinacion || credito?.coordinacionNombre || '';
            const coordNombre = (typeof rawCoord === 'object' && rawCoord?.nombre)
                ? rawCoord.nombre
                : (rawCoord.toString() || coordinacionesMap.get(rawAsesor.toString()) || coordinacionesMap.get(asesorNombre) || '');

            return {
                _id: cliente._id,
                nombre: cliente.nombre,
                semanaActual,
                cicloActual,
                evaluadorAsignado: asesorNombre,
                asesor: asesorNombre,
                coordinacion: coordNombre,
                coordinacionNombre: coordNombre,
                tipo: 'cliente',
            };
        });

        // 7. Combinar y ordenar alfabéticamente
        const combinado = [...gruposConDatos, ...clientesFormateados]
            .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));

        res.status(200).json({ success: true, data: combinado });
    } catch (error) {
        console.error('Error al obtener grupos y clientes:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
    }
};

// Obtener grupos asignados a un asesor específico y enriquecer con ciclo/semana en lote
const getGruposPorAsesor = async (req, res) => {
    try {
        const { asesor } = req.params;
        const grupos = await Grupo.find({ evaluadorAsignado: asesor }).lean();

        if (!grupos || grupos.length === 0) {
            return res.status(404).json({ success: false, message: 'No se encontraron grupos para este asesor' });
        }

        const memberIds = grupos
            .filter(g => g.integrantes && g.integrantes.length > 0)
            .map(g => g.integrantes[0]);

        const creditos = await Credito.find({ miembro: { $in: memberIds } }).lean();
        const creditoPorMiembro = new Map();
        creditos.forEach(c => {
            const mId = c.miembro?.toString();
            if (mId && !creditoPorMiembro.has(mId)) {
                creditoPorMiembro.set(mId, c);
            }
        });

        const gruposConDatos = grupos.map(grupo => {
            if (grupo.integrantes && grupo.integrantes.length > 0) {
                const primerIntegrante = grupo.integrantes[0].toString();
                const credito = creditoPorMiembro.get(primerIntegrante);
                if (credito) {
                    grupo.cicloActual = credito.ciclo || grupo.cicloActual;
                    grupo.semanaActual = credito.semanaActual || grupo.semanaActual;
                }
            }
            return grupo;
        });

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

// Obtener todos los asesores (usa caché en memoria)
const getAsesores = async (req, res) => {
    try {
        const { data: rawUsers } = await getAsesoresData();
        let asesores = [];
        if (Array.isArray(rawUsers)) {
            asesores = rawUsers.map(u => u.nombre || u.username).filter(Boolean);
        }

        const distinctLocal = await Grupo.distinct('evaluadorAsignado');
        const combinados = Array.from(new Set([...asesores, ...distinctLocal.filter(Boolean)])).sort();

        res.status(200).json({ success: true, data: combinados });
    } catch (error) {
        console.error('Error al obtener asesores:', error.message);
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

        if (!evaluationData.datosGenerales || !evaluationData.datosGenerales.nombreEvaluador) {
            return res.status(400).json({ success: false, message: 'El nombre del evaluador es obligatorio en datosGenerales' });
        }

        let rawGrupo = evaluationData.datosGenerales.grupo;
        let grupoNombreStr = typeof rawGrupo === 'object' ? (rawGrupo.nombre || '') : (rawGrupo || '');

        if (!grupoNombreStr && evaluationData.datosGenerales.clienteIndividual?.nombre) {
            grupoNombreStr = evaluationData.datosGenerales.clienteIndividual.nombre;
        }

        if (!grupoNombreStr) {
            return res.status(400).json({ success: false, message: 'El nombre del grupo o cliente es obligatorio en datosGenerales' });
        }

        if (!evaluationData.evidenciaFotos || !Array.isArray(evaluationData.evidenciaFotos) || evaluationData.evidenciaFotos.length < 1 || evaluationData.evidenciaFotos.length > 4) {
            return res.status(400).json({ success: false, message: 'Debe proporcionar de 1 a 4 fotos como evidencia de la evaluación.' });
        }

        const fotosBytes = evaluationData.evidenciaFotos.reduce((total, foto) =>
            total + (typeof foto === 'string' ? Buffer.byteLength(foto, 'utf8') : 0), 0);
        if (fotosBytes > MAX_PHOTOS_BYTES) {
            return res.status(413).json({ success: false, message: 'El tamaño total de las fotos no puede superar 12 MB.' });
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

        // ── 2. Resolver información del asesor y su coordinación con caché ───────────
        const targetAsesorName = evaluationData.datosGenerales.asesorGrupo ||
            evaluationData.datosGenerales.asesorEvaluadoNombre || '';

        let asesorEvaluadoId = evaluationData.datosGenerales.asesorEvaluadoId || null;
        let asesorEvaluadoNombre = targetAsesorName || null;
        let coordinacionId = evaluationData.datosGenerales.coordinacionId || null;
        let coordinacionNombre = evaluationData.datosGenerales.coordinacionNombre || null;

        if (targetAsesorName) {
            const { data: userList } = await getAsesoresData();
            if (Array.isArray(userList)) {
                const userMatch = userList.find(u =>
                    (u.nombre && u.nombre.trim().toLowerCase() === targetAsesorName.trim().toLowerCase()) ||
                    (u.username && u.username.trim().toLowerCase() === targetAsesorName.trim().toLowerCase()) ||
                    (u._id && u._id.toString() === targetAsesorName)
                );

                if (userMatch) {
                    asesorEvaluadoId = userMatch._id ? userMatch._id.toString() : asesorEvaluadoId;
                    asesorEvaluadoNombre = userMatch.nombre || userMatch.username || asesorEvaluadoNombre;
                    if (userMatch.coordinacion) {
                        coordinacionId = userMatch.coordinacion._id ? userMatch.coordinacion._id.toString() : null;
                        coordinacionNombre = (typeof userMatch.coordinacion === 'object' ? userMatch.coordinacion.nombre : userMatch.coordinacion) || null;
                    }
                }
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
    } catch (error) {
        console.error('Error al crear/sincronizar evaluación:', error);
        res.status(500).json({ success: false, message: 'Error al guardar la evaluación', error: error.message });
    }
};

const getGrupos = async (req, res) => {
    try {
        const grupos = await Grupo.find().lean();
        res.status(200).json({ success: true, data: grupos });
    } catch (error) {
        console.error('Error al obtener grupos:', error);
        res.status(500).json({ success: false, message: 'Error al obtener grupos', error: error.message });
    }
};

// Obtener todas las evaluaciones (con soporte para excluir fotos pesadas si se requiere)
const getAllEvaluations = async (req, res) => {
    try {
        const { page, limit, skip } = getPagination(req.query);
        const filter = {};
        const [evaluaciones, total] = await Promise.all([
            Evaluation.find(filter)
                .select('-evidenciaFotos')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Evaluation.countDocuments(filter)
        ]);
        res.status(200).json({
            success: true,
            count: evaluaciones.length,
            data: evaluaciones,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        });
    } catch (error) {
        console.error('Error al obtener evaluaciones:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
    }
};

const getCicloSemanaGrupo = async (req, res) => {
    try {
        const { grupoId } = req.params;

        const grupo = await Grupo.findById(grupoId).lean();
        if (!grupo) {
            return res.status(404).json({ success: false, message: 'El grupo no existe' });
        }

        if (grupo.integrantes && grupo.integrantes.length > 0) {
            const primerMiembro = grupo.integrantes[0];
            const credito = await Credito.findOne({ miembro: primerMiembro, estado: 'Activo' })
                .sort({ ciclo: -1 })
                .lean();

            if (!credito) {
                return res.status(404).json({ success: false, message: 'No se encontró un crédito activo para el grupo' });
            }

            const miembros = await dbControlVam.collection('miembros')
                .find({ _id: { $in: grupo.integrantes } })
                .toArray();
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
        }

        return res.status(404).json({ success: false, message: 'El grupo no tiene integrantes' });
    } catch (error) {
        console.error('Error al obtener ciclo y semana:', error);
        return res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
    }
};

const getEvaluations = async (req, res) => {
    try {
        const { page, limit, skip } = getPagination(req.query);
        const filter = {};
        const [evaluations, total] = await Promise.all([
            Evaluation.find(filter)
                .select('-evidenciaFotos')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Evaluation.countDocuments(filter)
        ]);

        const populated = evaluations.map(itemObj => {
            if (itemObj.datosGenerales) {
                if (itemObj.datosGenerales.grupoId && !itemObj.datosGenerales.grupo) {
                    itemObj.datosGenerales.grupo = 'Grupo Desconocido';
                }
            }
            return itemObj;
        });

        res.status(200).json({
            success: true,
            data: populated,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        });
    } catch (error) {
        console.error('Error al obtener evaluaciones:', error);
        res.status(500).json({ success: false, message: 'Error al obtener evaluaciones', error: error.message });
    }
};

// Obtener una evaluación específica con sus fotos completas
const getEvaluationById = async (req, res) => {
    try {
        const { id } = req.params;
        const evaluation = await Evaluation.findById(id).lean();
        if (!evaluation) {
            return res.status(404).json({ success: false, message: 'Evaluación no encontrada' });
        }
        res.status(200).json({ success: true, data: evaluation });
    } catch (error) {
        console.error('Error al obtener evaluación por ID:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
    }
};

// Obtener el asesor asignado a un grupo o cliente específico por ID (usa caché)
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
            return res.status(404).json({ success: false, message: 'Grupo o cliente no encontrado' });
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
            const { data: userList } = await getAsesoresData();
            if (Array.isArray(userList)) {
                const foundUser = userList.find(u =>
                    u._id?.toString() === rawAsesor.toString() ||
                    u.username?.toString() === rawAsesor.toString() ||
                    u.nombre?.toString() === rawAsesor.toString()
                );
                if (foundUser) {
                    asesorNombre = foundUser.nombre || foundUser.username;
                }
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
        return res.status(500).json({ success: false, message: 'Error interno del servidor', error: error.message });
    }
};

const getEvaluationBySucursal = async (req, res) => {
    try {
        const { sucursal } = req.params;
        const { page, limit, skip } = getPagination(req.query);
        const filter = { 'datosGenerales.sucursal': sucursal };
        const [evaluations, total] = await Promise.all([
            Evaluation.find(filter)
                .select('-evidenciaFotos')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Evaluation.countDocuments(filter)
        ]);
        res.status(200).json({
            success: true,
            data: evaluations,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        });
    } catch (error) {
        console.error('Error al obtener evaluaciones:', error);
        res.status(500).json({ success: false, message: 'Error al obtener evaluaciones', error: error.message });
    }
};

const getClientesMaster = async (req, res) => {
    try {
        const response = await axios.get('https://servidor-pwa-control-lku5.onrender.com/api/clientes/clientes-master', {
            timeout: 10000
        });
        res.status(200).json(response.data);
    } catch (error) {
        console.error('Error al obtener clientes master:', error.message);
        res.status(500).json({ success: false, message: 'Error al obtener clientes master', error: error.message });
    }
};

const getClientesEjecutivas = async (req, res) => {
    try {
        const { data: userList } = await getAsesoresData();
        let clientes = [];
        if (Array.isArray(userList)) {
            clientes = userList.map(u => u.nombre || u.username).filter(Boolean);
        }

        const distinctLocal = await Grupo.distinct('evaluadorAsignado');
        const combinados = Array.from(new Set([...clientes, ...distinctLocal.filter(Boolean)])).sort();

        res.status(200).json({ success: true, data: combinados });
    } catch (error) {
        console.error('Error al obtener clientes ejecutivas:', error.message);
        try {
            const distinctLocal = await Grupo.distinct('evaluadorAsignado');
            res.status(200).json({ success: true, data: distinctLocal.filter(Boolean) });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Error al obtener clientes', error: err.message });
        }
    }
};

const getMiembrosGrupoConIndividual = async (req, res) => {
    try {
        const { grupoId, estado } = req.query;
        let url = 'https://servidor-pwa-control-lku5.onrender.com/api/clientes/miembros-grupo-con-individual';
        const queryParams = [];
        if (grupoId) queryParams.push(`grupoId=${grupoId}`);
        if (estado) queryParams.push(`estado=${estado}`);

        if (queryParams.length > 0) {
            url += `?${queryParams.join('&')}`;
        }

        const response = await axios.get(url, { timeout: 15000 });
        res.status(200).json(response.data);
    } catch (error) {
        console.error('Error al obtener miembros con crédito individual:', error.message);
        res.status(500).json({ success: false, message: 'Error al comunicarse con la API externa', error: error.message });
    }
};

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
    getEvaluationById,
    getAllEvaluations,
    getEvaluationBySucursal,
    getClientesEjecutivas,
    getClientesMaster,
    getMiembrosGrupoConIndividual
};