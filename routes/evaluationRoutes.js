const express = require('express');
const router = express.Router();
const evaluationController = require('../controllers/evaluationController');

router.get('/asesores', evaluationController.getAsesores);
router.get('/grupos/:asesor', evaluationController.getGruposPorAsesor);
router.post('/', evaluationController.createEvaluation);

module.exports = router;
