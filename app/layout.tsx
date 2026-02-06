import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Noto_Sans_JP } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
    subsets: ["latin"],
    variable: "--font-jakarta",
    display: "swap",
});

const noto = Noto_Sans_JP({
    subsets: ["latin"],
    variable: "--font-noto",
    weight: ["400", "500", "700"],
    display: "swap",
});

export const metadata: Metadata = {
    title: "AutoManual - 動画から自動手順書生成",
    description: "動画をアップロードするだけで、AIが自動的にステップバイステップの手順書を生成します",
    viewport: "width=device-width, initial-scale=1, maximum-scale=1",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ja" className={`${jakarta.variable} ${noto.variable}`}>
            <body className="font-noto antialiased selection:bg-indigo-100 selection:text-indigo-700">
                {children}
            </body>
        </html>
    );
}
