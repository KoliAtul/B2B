const { Sequelize } = require('sequelize');
require('dotenv').config(); // Load environment variables

const sequelize = new Sequelize(process.env.DATABASE_NAME, process.env.DATABASE_USER, process.env.DATABASE_PASSWORD, {
    host: process.env.DATABASE_HOST,
    dialect: 'mysql',
});

module.exports = sequelize;
