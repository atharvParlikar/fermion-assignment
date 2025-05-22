import * as mediasoup from "mediasoup";
import { createZapServer, zapEvent, zapServerEvent } from "@zap-socket/server";
import { z } from "zod";
import { startHlsStream } from "./hlsServer";

const createWorker = async () => {
  const newWorker = await mediasoup.createWorker({
    rtcMinPort: 4010,
    rtcMaxPort: 4030,
  });

  console.log("Worker process ID: ", newWorker.pid);

  newWorker.on("died", () => {
    console.error("mediasoup worker died");
    setTimeout(() => {
      process.exit()
    }, 2000);
  });

  return newWorker;
}

const mediaCodecs: mediasoup.types.RtpCodecCapability[] = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
    preferredPayloadType: 96,
    rtcpFeedback: [
      { type: "nack" },
      { type: "nack", parameter: "pli" }
    ]
  },
  {
    kind: "video",
    mimeType: "video/H264",
    clockRate: 90000,
    parameters: {
      "packetization-mode": 1,
      "profile-level-id": "42e01f", // Baseline profile, level 3.1
      "level-asymmetry-allowed": 1
    },
    preferredPayloadType: 97,
    rtcpFeedback: [
      { type: "nack" },
      { type: "nack", parameter: "pli" },
      { type: "ccm", parameter: "fir" },
      { type: "goog-remb" }
    ]
  }
]

let worker: mediasoup.types.Worker<mediasoup.types.AppData>;
let router: mediasoup.types.Router<mediasoup.types.AppData>
let producerTransportMap = new Map<string, mediasoup.types.WebRtcTransport<mediasoup.types.AppData>>();
let consumerTransportMap = new Map<string, mediasoup.types.WebRtcTransport<mediasoup.types.AppData>>();
let producerMap = new Map<string, {
  video: mediasoup.types.Producer<mediasoup.types.AppData> | null,
  audio: mediasoup.types.Producer<mediasoup.types.AppData> | null
}>();
let consumerMap = new Map<string, {
  video: mediasoup.types.Consumer<mediasoup.types.AppData>,
  audio: mediasoup.types.Consumer<mediasoup.types.AppData>
}>();

const events = {
  getRtpCapabilities: zapEvent({
    process: () => router.rtpCapabilities
  }),

  createTransport: zapEvent({
    input: z.object({
      type: z.enum(["producer", "consumer"])
    }),
    process: async (input, ctx) => {
      const { type } = input;
      const { id } = ctx;

      const transport = await router.createWebRtcTransport({
        listenIps: [{ ip: "192.168.0.175" }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      });

      if (type === "producer") {
        producerTransportMap.set(id, transport);
      } else {
        consumerTransportMap.set(id, transport);
      }

      return {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      };
    }
  }),

  connectTransport: zapEvent({
    input: z.object({
      type: z.enum(["producer", "consumer"]),
      dtlsParameters: z.any()
    }),
    process: async (input, ctx) => {
      const { type, dtlsParameters } = input;
      const { id } = ctx;

      const transport = type === "producer" ? producerTransportMap.get(id) : consumerTransportMap.get(id);

      if (transport) {
        await transport.connect({ dtlsParameters });
      }
    }
  }),

  produce: zapEvent({
    input: z.object({
      kind: z.enum(["audio", "video"]),
      rtpParameters: z.any(),
    }),
    process: async (input, ctx) => {
      const { kind, rtpParameters } = input;
      const { id, server } = ctx;
      const transport = producerTransportMap.get(id);

      if (!transport) {
        return { data: null, error: "Producer transport not found" };
      }

      const keys = Array.from(producerMap.keys());
      const existing = producerMap.get(id);

      if (keys.length > 1 && !existing) {
        return { data: null, error: "Streaming room full" };
      }

      const producer = await transport.produce({
        kind: kind as mediasoup.types.MediaKind,
        rtpParameters
      });

      const current = existing ?? { video: null, audio: null };
      current[kind] = producer;
      producerMap.set(id, current);

      const peerId = keys.find(k => k !== id);
      const peer = peerId ? producerMap.get(peerId) : null;
      const self = producerMap.get(id);

      // start a RTP stream for ffmpeg HLS conversion
      // if (self && self.video && self.audio) {
      //   startHlsStream({
      //     videoProducerId: self.video.id,
      //     router,
      //     outputDirRoot: "./hls"
      //   });
      // }

      if (peer?.audio && peer?.video && self?.audio && self?.video) {
        server.sendMessage("peerJoined", id, null); // tell current user

        startHlsStream({
          videoProducerId: self.video.id,
          videoProducerId_: peer.video.id,
          router,
          outputDirRoot: "./hls"
        });
      }
      if (self?.audio && self?.video && peerId) {
        server.sendMessage("peerJoined", peerId, null); // tell peer
      }

      return {
        data: { id: producer.id },
        error: null
      };
    }
  }),

  consume: zapEvent({
    input: z.object({
      rtpCapabilities: z.any()
    }),
    process: async (input, ctx) => {
      const { rtpCapabilities } = input;
      const { id } = ctx;

      if (Array.from(producerMap.keys()).length < 2) {
        return {
          data: null,
          error: "Peer not connected"
        }
      }

      const peerId = Array.from(producerMap.keys()).filter(i => i !== id)[0];
      const peerProducer = producerMap.get(peerId);
      const consumerTransporter = consumerTransportMap.get(id);

      if (!(peerProducer && consumerTransporter && peerProducer.audio && peerProducer.video)) {
        return {
          data: null,
          error: "Producer not found"
        }
      }

      if (!router.canConsume({ producerId: peerProducer.video.id, rtpCapabilities })) {
        return {
          data: null,
          error: "cannot consume producer " + peerProducer.video.id
        }
      }

      if (!router.canConsume({ producerId: peerProducer.audio.id, rtpCapabilities })) {
        return {
          data: null,
          error: "cannot consume producer " + peerProducer.audio.id
        }
      }

      const videoConsumer = await consumerTransporter.consume({
        producerId: peerProducer.video.id,
        rtpCapabilities,
        paused: false
      });

      const audioConsumer = await consumerTransporter.consume({
        producerId: peerProducer.audio.id,
        rtpCapabilities,
        paused: false
      });


      consumerMap.set(id, {
        video: videoConsumer,
        audio: audioConsumer
      });

      return {
        data: {
          video: {
            id: videoConsumer.id,
            producerId: peerProducer.video.id,
            kind: videoConsumer.kind,
            rtpParameters: videoConsumer.rtpParameters,
            type: videoConsumer.type
          },
          audio: {
            id: audioConsumer.id,
            producerId: peerProducer.audio.id,
            kind: audioConsumer.kind,
            rtpParameters: audioConsumer.rtpParameters,
            type: audioConsumer.type
          }
        },
        error: null
      };
    }
  }),

  peerJoined: zapServerEvent({
    data: z.void()
  })
};

export type Events = typeof events

export const runMediaSoupServer = async () => {
  worker = await createWorker();
  router = await worker.createRouter({
    mediaCodecs
  });

  const server = createZapServer<Events>({ port: 8000, events }, () => {
    console.log("listening on ws://localhost:8000/");
  });

  server.onconnect(({ id, ws }) => {
    console.log(`⚡ ${id} joined`);
    ws.onclose = () => {
      console.log(`🔥 ${id} disconnected`);
      producerTransportMap.delete(id);
      consumerTransportMap.delete(id);
      producerMap.delete(id);
      consumerMap.delete(id);
    };
  });
}

