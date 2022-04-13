import Bootstrap from '../../charging-station/Bootstrap';
import express from 'express';

const pageHeader = `
<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN"
"http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
</head>`;
const pageFooter = '</html>';

const app = express();

app.get('/', (request, response) => {
  response.send(
    pageHeader +
      `<body>
       <form>
         <input type="button" onclick="window.location.href='/start';" value="Start" />
         <input type="button" onclick="window.location.href='/stop';" value="Stop" />
       </form>
       </body>` +
      pageFooter
  );
});

app.get('/start', (request, response, next) => {
  Bootstrap.getInstance().start().catch(next);
  console.info('*** started');
  response.send(
    pageHeader + '<body><b>Started</b><br/><a href="/">Return to Top</a></body>' + pageFooter
  );
});

app.get('/stop', (request, response, next) => {
  Bootstrap.getInstance().stop().catch(next);
  console.info('*** stopped');
  response.send(
    pageHeader + '<body><b>Stopped</b><br/><a href="/">Return to Top</a></body>' + pageFooter
  );
});

app.listen(process.env.PORT ?? 8080, () =>
  console.info(`Listening on http://localhost:${process.env.PORT ?? 8080}`)
);
