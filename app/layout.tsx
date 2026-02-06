import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "AutoManual - 動画から自動手順書生成",
    description: "動画をアップロードするだけで、AIが自動的にステップバイステップの手順書を生成します",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ja">
            <body>{children}</body>
        </html>
    );
}
