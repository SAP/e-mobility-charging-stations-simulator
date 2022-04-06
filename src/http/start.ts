import Bootstrap from '../charging-station/Bootstrap';
import express from 'express';

const app = express();

app.get('/', (request, response) => {
  response.send(`
 
 
  <form>
  <input type="button" onclick="window.location.href='/start';" value="Start" />
  <input type="button" onclick="window.location.href='/stop';" value="Stop" />
</form>

  `);
});

app.get('/start', (request, response, next) => {
  Bootstrap.getInstance().start().catch(next);
  console.log('*** started');
  response.send('<b>Started</b><br/><a href="/">Return to Top</a>');
});

app.get('/stop', (request, response, next) => {
  Bootstrap.getInstance().stop().catch(next);
  console.log('*** stopped');
  response.send('<b>Stopped</b><br/><a href="/">Return to Top</a>');
});

app.listen(process.env.PORT ?? 8080, () =>
  console.log(`Listening on port: ${process.env.PORT ?? 8080}`)
);
