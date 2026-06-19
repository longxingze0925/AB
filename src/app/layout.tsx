export const metadata = {
  title: "下载",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif" }}>{children}</body>
    </html>
  );
}
