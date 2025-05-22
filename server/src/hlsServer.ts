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
    '-c:v', 'copy', // Copy H264 stream directly (no re-encoding)
    '-probesize', '32',
    '-analyzeduration', '0',
    '-fflags', 'nobuffer+flush_packets',
    '-flags', 'low_delay',
    '-avoid_negative_ts', 'make_zero', // Handle timestamp issues
    '-f', 'hls',
    '-hls_time', '1', // Reduced from 2 seconds for lower latency
    '-hls_list_size', '3', // Keep more segments for reliability
    '-hls_flags', 'delete_segments+split_by_time',
    '-hls_segment_type', 'mpegts',
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
m=video ${listenPort} RTP/AVP 96
a=rtpmap:96 H264/90000
a=fmtp:96 packetization-mode=1;profile-level-id=42e01f;level-asymmetry-allowed=1
a=rtcp-fb:96 nack
a=rtcp-fb:96 nack pli
a=rtcp-fb:96 ccm fir
a=rtcp-fb:96 goog-remb
a=sendonly
`.trim();

  writeFileSync(`${dir}/input.sdp`, sdp);

  return dir + "/input.sdp"
}
