const app = require('./src/app');

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`fun-scraper API server running on http://localhost:${PORT}`);
});
