const express = require('express'),
  path = require('path');

const app = express(),
  PORT = process.env.PORT || 3030,
  uiPath = path.join(__dirname, './dist/');

function rateLimiter(window, max) {
  const reset = () => setTimeout(() => {
    console.log('reset');
    requests = 0;
    reset();
  }, window);

  let requests = 0;
  reset();

  return (req, res, next) => {
    if (requests > max) {
      res.sendStatus(429);
      return;
    }

    ++requests;
    next();
  }
}

app.use(rateLimiter(10000, 15));

app.use(express.json());
app.use(express.static(uiPath));

app.get('/*', (req, res) => {
  res.sendFile(uiPath + 'index.html');
});

app.listen(PORT, () => {
  console.log(`server listening on port::${PORT}`);
});
