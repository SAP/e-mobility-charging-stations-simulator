const express = require('express'),
  path = require('path');

const app = express(),
  PORT = process.env.PORT || 3030,
  uiPath = path.join(__dirname, './dist/');

app.use(express.json());
app.use(express.static(uiPath));

app.get('/*', (req, res) => {
  res.sendFile(uiPath + 'index.html');
});

app.listen(PORT, () => {
  console.log(`server listening on port::${PORT}`);
});
