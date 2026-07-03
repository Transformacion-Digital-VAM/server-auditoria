const express = require('express');
const router = express.Router();
const evaluationController = require('../controllers/evaluationController');

router.get('/grupos', evaluationController.getAllGrupos);
router.get('/grupo/:id', evaluationController.getGrupoById);
router.get('/asesores', evaluationController.getAsesores);
router.get('/grupos/:asesor', evaluationController.getGruposPorAsesor);
router.get('/', evaluationController.getAllEvaluations);
router.post('/', evaluationController.createEvaluation);

module.exports = router;
