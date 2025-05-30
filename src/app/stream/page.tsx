'use client';

import mediasoupClient from "mediasoup-client"
import { useEffect, useRef } from "react";
import { useZap } from '@zap-socket/react'
import type { Events } from "../../../server/src/mediaSoupServer";
import toast from "react-hot-toast";

export default function Stream() {
  const deviceRef = useRef<mediasoupClient.types.Device>(null);
  const selfVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const { zap, connected } = useZap<Events>();

  useEffect(() => {
    if (deviceRef.current || !zap) return;

    const setup = async () => {
      console.log("setup being called");
      const device = new mediasoupClient.Device();
      deviceRef.current = device;

      const routerRtpCapabilities = await zap.events.getRtpCapabilities.send();
      await device.load({ routerRtpCapabilities });

      const sendTransportDetails = await zap.events.createTransport.send({ type: "producer" });
      const recvTransportDetails = await zap.events.createTransport.send({ type: "consumer" });

      const sendTransport = device.createSendTransport({
        ...sendTransportDetails,
        iceServers: [{
          urls: 'stun:stun.l.google.com:19302'
        }]
      });
      const recvTransport = device.createRecvTransport({
        ...recvTransportDetails,
        iceServers: [{
          urls: 'stun:stun.l.google.com:19302'
        }]
      });

      sendTransport.on("connect", async ({ dtlsParameters }, callback) => {
        console.log("producer connected");
        await zap.events.connectTransport.send({
          type: 'producer',
          dtlsParameters
        });
        callback();
      });

      sendTransport.on("connectionstatechange", (state) => {
        console.log("[sendTransport] connection state change: ", state);
      })

      sendTransport.on("produce", async ({ kind, rtpParameters }, callback, errback) => {
        const { data, error } = await zap.events.produce.send({
          kind,
          rtpParameters
        });
        if (error) {
          errback(new Error(error));
          return;
        }
        const { id } = data!;
        callback({ id });
      });

      recvTransport.on("connect", async ({ dtlsParameters }, callback, errback) => {
        console.log("consumer connected");
        await zap.events.connectTransport.send({
          type: 'consumer',
          dtlsParameters
        });
        callback();
      });

      recvTransport.on("connectionstatechange", (state) => {
        console.log("[recvTransport] state change: ", state);
      })

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      const videoTrack = stream.getVideoTracks()[0]
      if (selfVideoRef.current) {
        selfVideoRef.current.srcObject = stream
      }

      zap.events.peerJoined.listen(async () => {
        toast.success("peer joined");
        const { data, error } = await zap.events.consume.send({ rtpCapabilities: device.rtpCapabilities });
        if (error) {
          throw new Error(error);
        }
        if (!data) return; // thanks TS, but this shouldn't happen, data and error are mutually exclusive

        try {
          const videoConsumer = await recvTransport.consume(data.video);
          const audioConsumer = await recvTransport.consume(data.audio);

          const mediaStream = new MediaStream();

          mediaStream.addTrack(videoConsumer.track);
          mediaStream.addTrack(audioConsumer.track);

          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = mediaStream;
            remoteVideoRef.current.load();
            remoteVideoRef.current.play().then(() => console.log("playing...")).catch((err) => console.error("Video won't play: ", err));
          }
        } catch (err) {
          console.error("[consumer] " + err);
        }
      });

      const videoProducer = await sendTransport.produce({ track: videoTrack });
      const audioProducer = await sendTransport.produce({ track: stream.getAudioTracks()[0] });
    }

    setup();
  }, [connected]);

  return (
    <div className="flex flex-col gap-4 h-screen w-screen justify-center items-center">
      <div className="bg-green-400 h-fit w-fit p-0.5 text-black">
        self
        <video autoPlay muted ref={selfVideoRef} />
      </div>

      <div className="bg-blue-400 h-fit w-fit p-0.5 text-black">
        remote
        <div />
        <video className="video" autoPlay muted ref={remoteVideoRef} />
      </div>
    </div>
  );
}

