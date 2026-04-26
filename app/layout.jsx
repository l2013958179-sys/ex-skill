import "./globals.css";

export const metadata = {
  title: "朝花夕拾 AI 聊天",
  description: "可直接部署到 Vercel 的 Serverless AI 聊天网站。",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
