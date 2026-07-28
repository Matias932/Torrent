const express = require('express');
const torrentStream = require('torrent-stream');
const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.get('/stream', (req, res) => {
  const magnet = req.query.magnet;
  if (!magnet) return res.status(400).send('Falta el magnet link');

  const engine = torrentStream(magnet);

  engine.on('ready', () => {
    const file = engine.files.reduce((max, f) => f.length > max.length ? f : max, engine.files[0]);
    if (!file) return res.status(404).send('No se encontró video');

    const range = req.headers.range;
    if (!range) {
      res.writeHead(200, {
        'Content-Length': file.length,
        'Content-Type': 'video/mp4',
      });
      file.createReadStream().pipe(res);
    } else {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : file.length - 1;
      const chunksize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${file.length}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      });

      file.createReadStream({ start, end }).pipe(res);
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));

