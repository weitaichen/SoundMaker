import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "曲匠 AI — 用一句話做一首歌",
  description: "描述你想要的歌，Claude 作詞作曲、AI 演唱，線上播放與下載。",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect width='24' height='24' rx='6' fill='%2331e3c8'/><path d='M9 17V7l8-1.5v9' fill='none' stroke='%23062a26' stroke-width='2' stroke-linecap='round'/><circle cx='7' cy='17' r='2' fill='%23062a26'/><circle cx='15' cy='15.5' r='2' fill='%23062a26'/></svg>",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0b0d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
