const express = require('express');
const router = express.Router();
const evaluationController = require('../controllers/evaluationController');

router.get('/asesores', evaluationController.getAsesores);
router.get('/grupos/:asesor', evaluationController.getGruposPorAsesor);
router.get('/grupos', evaluationController.getGrupos);
router.get("/grupos/getCicloSemanaGrupo/:grupoId", evaluationController.getCicloSemanaGrupo); //verifyToken
router.post('/', evaluationController.createEvaluation);
router.get('/', evaluationController.getEvaluations);

module.exports = router;
