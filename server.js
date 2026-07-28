const express = require('express');
const torrentStream = require('torrent-stream');
const app = express();

// Permite que StackBlitz acceda al servidor sin bloqueos de seguridad
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.get('/stream', (req, res) => {
  const magnet = req.query.magnet;
  if (!magnet) return res.status(400).send('Falta el enlace magnet');

  const engine = torrentStream(magnet);

  engine.on('ready', () => {
    // Busca el archivo de video más grande
    const file = engine.files.reduce((a, b) => (a.length > b.length ? a : b));

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', file.length);

    const stream = file.createReadStream();
    stream.pipe(res);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
