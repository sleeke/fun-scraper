// Vercel serverless function entry point.
// Exports the Express app so Vercel's Node.js runtime can invoke it.
const app = require('../backend/src/app');

module.exports = app;
