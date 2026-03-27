/**
 * Registry of all scrapers. Each scraper exports { scrape, SOURCE, DEFAULT_URL }.
 */
const blueprint = require('./blueprint');
const ticketmaster = require('./ticketmaster');
const celebrities = require('./celebrities');
const redroom = require('./redroom');
const fortune = require('./fortune');
const industrial236 = require('./industrial236');
const residentadvisor = require('./residentadvisor');
const thisisblueprint = require('./thisisblueprint');

const SCRAPERS = {
  blueprint,
  ticketmaster,
  celebrities,
  redroom,
  fortune,
  industrial236,
  residentadvisor,
  thisisblueprint,
};

module.exports = SCRAPERS;
