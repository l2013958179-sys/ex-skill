import "./globals.css";

export const metadata = {
  title: "朝花夕拾 AI伴侣",
  description: "可直接部署到 Vercel 的 AI伴侣与多角色聊天网站。",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#020617",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
