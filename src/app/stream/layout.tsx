'use client';

import { ZapProvider } from "@zap-socket/react";

export default function StreamLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ZapProvider url="ws://localhost:8000/">
      {children}
    </ZapProvider>
  )
}
