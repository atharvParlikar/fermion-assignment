import { spawn } from "child_process";
import path from "path";
import * as mediasoup from "mediasoup";
import getPort from "get-port";
import { writeFileSync } from "node:fs";
import { nanoid } from "nanoid";

type StartHlsStreamOptions = {
  videoProducerId: string;
  router: mediasoup.types.Router;
  outputDirRoot?: string; // e.g. "./hls"
};

export async function startHlsStream({
  videoProducerId,
  router,
  outputDirRoot = "./hls"
}: StartHlsStreamOptions) {
  const streamId = nanoid();
  const outputDir = path.resolve(`${outputDirRoot}/stream-${streamId}`);
  const outputPlaylist = path.join(outputDir, "index.m3u8");

  spawn("mkdir", ["-p", outputDir]);

  const ffmpegPort = await getPort({ port: [4000, 4002] });
  const sdpPath = generateSdpFile(ffmpegPort, outputDir);

  const ffmpeg = spawn('ffmpeg', [
    '-protocol_whitelist', 'file,udp,rtp',
    '-i', sdpPath,
    '-c:v', 'libx264',
    '-preset', 'ultrafast', // Faster than veryfast
    '-tune', 'zerolatency',
    '-probesize', '32', // Reduce probing time
    '-analyzeduration', '0', // Minimize analysis time
    '-fflags', 'nobuffer', // Disable buffering
    '-flags', 'low_delay', // Low delay flag
    '-crf', '18', // visually-lossless (0 is truely lossless).
    '-strict', 'experimental', // Enable experimental features
    '-g', '46',
    '-keyint_min', '46',
    '-sc_threshold', '0',
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_list_size', '2',
    '-hls_flags', 'delete_segments',
    '-hls_segment_filename', `${outputDir}/segment_%03d.ts`,
    `${outputDir}/stream.m3u8`
  ]);

  ffmpeg.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
  });

  ffmpeg.on('close', (code) => {
    console.log(`Child process exited with code ${code}`);
  });

  ffmpeg.on("exit", code => {
    console.log(`FFmpeg exited with code ${code}`);
  });

  setTimeout(() => { }, 1000); // warm up time for ffmpeg

  const plainTransport = await router.createPlainTransport({
    listenIp: "0.0.0.0",
    rtcpMux: true,
    comedia: false,
    enableSrtp: false
  });

  const consumer = await plainTransport.consume({
    producerId: videoProducerId,
    rtpCapabilities: router.rtpCapabilities,
    paused: false
  });


  plainTransport.connect({
    ip: "127.0.0.1",
    port: ffmpegPort
  });

  consumer.on("rtp", (whatever) => {
    console.log(whatever);
  });

  return {
    hlsPath: outputPlaylist,
    streamId
  };
}

function generateSdpFile(listenPort: number, dir: string) {
  const sdp = `
v=0
o=- 0 0 IN IP4 127.0.0.1
s=Video Session
t=0 0
c=IN IP4 127.0.0.1
m=video ${listenPort} RTP/AVP 97
a=rtpmap:97 VP8/90000
a=fmtp:97 profile-level-id=42e01f
a=rtcp-fb:97 nack
a=rtcp-fb:97 nack pli
a=rtcp-fb:97 ccm fir
a=rtcp-fb:97 goog-remb
a=sendonly
`.trim();

  writeFileSync(`${dir}/input.sdp`, sdp);

  return dir + "/input.sdp"
}
