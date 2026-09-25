const express = require('express');
const router = express.Router();
const coordinacionController = require('../controllers/coordinacionController');

//----------------------------------------------------------------------------------------------------
// COORDINACION
router.get('/', coordinacionController.obtenerCoordinacion);
router.post('/', coordinacionController.crearCoordinacion);

module.exports = router;