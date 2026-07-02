// const mongoose = require('mongoose');

// const conectarDB = async () => {
//   try {
//     const conexion = await mongoose.connect(process.env.MONGO_URI);
    
//     console.log(`¡Conexión exitosa a DB en: ${conexion.connection.host}!`);
//   } catch (error) {
//     console.error('Error crítico al conectar a DB:', error.message);
    
//     // Detener la aplicación si la base de datos falla
//     process.exit(1); 
//   }
// };

// module.exports = conectarDB;


const mongoose = require('mongoose');
require('dotenv').config();

const masterURI = process.env.MONGO_URI;

// Conexión a la base de datos hojas de control
const dbControlVam = mongoose.createConnection(`${masterURI}/db_control_vam?retryWrites=true&w=majority`, { family: 4 });

// Conexión a base de datos auditorias
const dbEvaluaciones = mongoose.createConnection(`${masterURI}/db_auditoria_vam?retryWrites=true&w=majority`, { family: 4 });

// confirmar en consola que ambas conectaron con éxito
dbControlVam.on('connected', () => console.log('Conectado con éxito a: db_control_vam'));
dbEvaluaciones.on('connected', () => console.log('Conectado con éxito a: db_auditoria_vam'));

module.exports = {
  dbControlVam,
  dbEvaluaciones
};