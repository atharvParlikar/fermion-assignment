import express from "express";
import { runMediaSoupServer } from "./mediaSoupServer.js";
import path from "path";
import fs from "node:fs";
import cors from "cors";

const app = express();

app.use(cors());

app.get('/stream/:streamid/stream.m3u8', (req, res) => {
  const streamid = req.params.streamid;
  const filepath = path.join(__dirname, `../hls/stream-${streamid}/stream.m3u8`);

  fs.stat(filepath, (err) => {
    if (err) {
      res.status(404).send("Stream not found");
      return;
    }

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    const stream = fs.createReadStream(filepath);
    stream.pipe(res);
  });
});

app.get('/stream/:streamid/:segment', (req, res) => {
  const { streamid, segment } = req.params;
  const filepath = path.join(__dirname, `../hls/stream-${streamid}/${segment}`);

  fs.stat(filepath, (err) => {
    if (err) {
      res.status(404).send("Segment not found");
      return;
    }

    res.setHeader("Content-Type", "video/MP2T");
    const stream = fs.createReadStream(filepath);
    stream.pipe(res);
  });
});

app.get('/streams', (_, res) => {
  const hlsPath = path.join(__dirname, '../hls');

  fs.readdir(hlsPath, (err, files) => {
    if (err) {
      res.status(500).send("Could not read HLS directory");
      return;
    }

    const streamDirs = files
      .filter(file => file.startsWith("stream-"))
      .map(file => file.replace("stream-", ""));

    res.json(streamDirs);
  });
});

app.listen(8080, () => {
  console.log("HLS server live at http://localhost:8000/");
  runMediaSoupServer();
});
