require('dotenv').config();
// No me dejaba probar en mi lap
require('dns').setServers(['8.8.8.8', '8.8.4.4']);

const express = require('express');
const { dbControlVam, dbEvaluaciones } = require('./config/db'); 
const Grupo = require('./models/Grupo');
const Evaluation = require('./models/Evaluation');

const app = express();
const PORT = process.env.PORT || 3000;

// conectar a la Base de Datos
dbControlVam;
dbEvaluaciones;

app.use(express.json());

const evaluationRoutes = require('./routes/evaluationRoutes');
app.use('/api/evaluaciones', evaluationRoutes);

// Ruta base
app.get('/', (req, res) => {
  res.send('Servidor funcionando correctamente');
});

// Ruta para consultar datos de ambas bases de datos
app.get('/api/test-db', async (req, res) => {
  try {
    // Consultar 5 grupos de la base dbControlVam para pruebas
    const grupos = await Grupo.find().limit(5);
    
    // Consultar 5 evaluaciones de la base dbEvaluaciones para pruebas
    const evaluaciones = await Evaluation.find().limit(5);
    
    res.json({
      success: true,
      mensaje: 'Consultas exitosas en ambas bases de datos',
      db_control_vam: {
        totalObtenidos: grupos.length,
        data: grupos
      },
      db_auditoria_vam: {
        totalObtenidos: evaluaciones.length,
        data: evaluaciones
      }
    });
  } catch (error) {
    console.error('Error al consultar bases de datos:', error);
    res.status(500).json({ success: false, error: 'Hubo un error al realizar las consultas.' });
  }
});

// Iniciar el servidor Express
app.listen(PORT, () => {
  console.log(`Servidor en http://localhost:${PORT}`);
});