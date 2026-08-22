const express = require('express');
const router = express.Router();
const evaluationController = require('../controllers/evaluationController');

// Rutas de grupos (más específicas primero)
router.get('/grupos/getCicloSemanaGrupo/:grupoId', evaluationController.getCicloSemanaGrupo);
router.get('/grupos/asesores/grupo/:grupoId', evaluationController.getAsesorPorGrupo);
router.get('/miembros-grupo-con-individual', evaluationController.getMiembrosGrupoConIndividual);
router.get('/grupos/:asesor', evaluationController.getGruposPorAsesor);
router.get('/grupos', evaluationController.getAllGrupos);
router.get('/grupo/:id', evaluationController.getGrupoById);

// Rutas de asesores
router.get('/asesores', evaluationController.getAsesores);

// Rutas de evaluaciones
router.post('/', evaluationController.createEvaluation);
router.get('/', evaluationController.getEvaluations);
router.get('/:id', evaluationController.getEvaluationById);

module.exports = router;
