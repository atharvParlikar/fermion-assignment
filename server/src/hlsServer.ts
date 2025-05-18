import { writeFileSync } from "fs";
import { spawn } from "child_process";
import path from "path";
import * as mediasoup from "mediasoup";

type StartHlsStreamOptions = {
  audioProducerId: string;
  videoProducerId: string;
  router: mediasoup.types.Router;
  outputDirRoot?: string; // e.g. "./hls"
};

export async function startHlsStreamFromProducers({
  audioProducerId,
  videoProducerId,
  router,
  outputDirRoot = "./hls"
}: StartHlsStreamOptions) {
  const audioTransport = await router.createPlainTransport({
    listenIp: "127.0.0.1",
    port: 8002,
    rtcpMux: false,
    comedia: false
  });

  const videoTransport = await router.createPlainTransport({
    listenIp: "127.0.0.1",
    port: 8004,
    rtcpMux: false,
    comedia: false
  });

  const audioConsumer = await audioTransport.consume({
    producerId: audioProducerId,
    rtpCapabilities: router.rtpCapabilities,
    paused: false
  });

  const videoConsumer = await videoTransport.consume({
    producerId: videoProducerId,
    rtpCapabilities: router.rtpCapabilities,
    paused: false
  });

  const audioPort = audioTransport.tuple.localPort!;
  const videoPort = videoTransport.tuple.localPort!;

  const sdp = generateSdp({ audioPort, videoPort });
  const streamId = Date.now().toString();
  const sdpPath = path.join(__dirname, `../mediasoup-stream-${Date.now()}.sdp`);
  const outputDir = path.resolve(`${outputDirRoot}/stream-${streamId}`);
  const outputPlaylist = path.join(outputDir, "index.m3u8");

  writeFileSync(sdpPath, sdp);

  // spawn("mkdir", ["-p", outputDir]);

  // const ffmpeg = spawn("ffmpeg", [
  //   "-protocol_whitelist", "file,udp,rtp",
  //   "-f", "sdp",
  //   "-i", sdpPath,
  //   "-c:v", "libx264",
  //   "-c:a", "aac",
  //   "-f", "hls",
  //   "-hls_time", "2",
  //   "-hls_list_size", "6",
  //   "-hls_flags", "delete_segments",
  //   outputPlaylist
  // ], {
  //   stdio: "inherit"
  // });
  //
  // ffmpeg.on("exit", code => {
  //   console.log(`FFmpeg exited with code ${code}`);
  // });

  return {
    audioConsumer,
    videoConsumer,
    // ffmpegProcess: ffmpeg,
    hlsPath: outputPlaylist,
    streamId
  };
}

function generateSdp({ audioPort, videoPort }: { audioPort: number, videoPort: number }) {
  return `
v=0
o=- 0 0 IN IP4 127.0.0.1
s=Mediasoup Stream
a=recvonly
c=IN IP4 127.0.0.1
t=0 0
m=audio ${audioPort} RTP/AVP 96
a=rtpmap:96 opus/48000/2
m=video ${videoPort} RTP/AVP 97
a=rtpmap:97 VP8/90000
a=fmtp:97 x-google-start-bitrate=1000
`.trim();
}

// function createSdpFile(type, rtpPort, rtcpPort) {
//   const payloadType = type === 'audio' ? 111 : 96;
//   const codec = type === 'audio' ? 'opus' : 'H264';
//   const clockRate = type === 'audio' ? 48000 : 90000;
//   const channels = type === 'audio' ? 2 : undefined;
//   const fileName = `./${type}.sdp`;
//
//   let sdpContent = 
//     'v=0\n' +
//     'o=- 0 0 IN IP4 127.0.0.1\n' +
//     's=MediaSoup RTP Stream\n' +
//     'c=IN IP4 127.0.0.1\n' +
//     't=0 0\n' +
//     `m=${type} ${rtpPort} RTP/AVP ${payloadType}\n` +
//     `a=rtcp:${rtcpPort}\n` +
//     `a=rtpmap:${payloadType} ${codec}/${clockRate}${channels ? '/' + channels : ''}\n`;
//
//   // Add format-specific parameters if needed
//   if (type === 'video') {
//     sdpContent += 'a=fmtp:96 profile-level-id=42e01f;level-asymmetry-allowed=1;packetization-mode=1\n';
//   }
//
//   fs.writeFileSync(fileName, sdpContent);
//   return fileName;
// }
