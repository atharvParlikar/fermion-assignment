import express from "express";
import { runMediaSoupServer } from "./mediaSoupServer.js";
import path from "path";
import { promises as fs } from "node:fs";
import cors from "cors";

const app = express();
app.use(cors());

app.get('/stream/:streamid/stream.m3u8', async (req, res) => {
  const streamid = req.params.streamid;
  const filepath = path.join(__dirname, `../hls/stream-${streamid}/stream.m3u8`);

  try {
    const data = await fs.readFile(filepath);
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.send(data);
  } catch (err) {
    res.status(404).send("Stream not found");
  }
});

app.get('/stream/:streamid/:segment', async (req, res) => {
  const { streamid, segment } = req.params;
  const filepath = path.join(__dirname, `../hls/stream-${streamid}/${segment}`);

  try {
    const data = await fs.readFile(filepath);
    res.setHeader("Content-Type", "video/MP2T");
    res.send(data);
  } catch (err) {
    res.status(404).send("Segment not found");
  }
});

app.get('/streams', async (_, res) => {
  const hlsPath = path.join(__dirname, '../hls');

  try {
    const files = await fs.readdir(hlsPath);
    const streamDirs = files
      .filter(file => file.startsWith("stream-"))
      .map(file => file.replace("stream-", ""));

    res.json(streamDirs);
  } catch (err) {
    res.status(500).send("Could not read HLS directory");
  }
});

app.listen(8080, () => {
  console.log("HLS server live at http://localhost:8000/");
  runMediaSoupServer();
});
