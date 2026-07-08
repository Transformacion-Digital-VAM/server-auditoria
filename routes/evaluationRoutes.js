const express = require('express');
const router = express.Router();
const evaluationController = require('../controllers/evaluationController');

// Rutas de grupos (más específicas primero)
router.get('/grupos/getCicloSemanaGrupo/:grupoId', evaluationController.getCicloSemanaGrupo);
router.get('/grupos/:asesor', evaluationController.getGruposPorAsesor);
router.get('/grupos', evaluationController.getAllGrupos);
router.get('/grupo/:id', evaluationController.getGrupoById);

// Rutas de asesores
router.get('/asesores', evaluationController.getAsesores);

// Rutas de evaluaciones
router.post('/', evaluationController.createEvaluation);
router.get('/', evaluationController.getEvaluations);

module.exports = router;