'use client';

import { useEffect, useState } from 'react';
import { HLSPlayer } from "@/components/HslVideo";

const HLS_SERVER = 'http://localhost:8080';

export default function WatchPage() {
  const [streams, setStreams] = useState<string[]>([]);

  useEffect(() => {
    fetch(`${HLS_SERVER}/streams`)
      .then(res => res.json())
      .then(setStreams)
      .catch(err => console.error("Failed to load streams:", err));
  }, []);

  return (
    <div className="p-6 space-y-10">
      <h1 className="text-3xl font-bold">Live Streams</h1>

      {streams.length === 0 ? (
        <p>No streams currently live.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {streams.map(streamId => (
            <div key={streamId} className="border rounded-xl p-4">
              <h2 className="text-xl font-semibold mb-2">Stream {streamId}</h2>
              <HLSPlayer src={`${HLS_SERVER}/stream/${streamId}/stream.m3u8`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
