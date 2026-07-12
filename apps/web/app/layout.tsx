import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";

import { Footer } from "@/components/footer";
import { Nav } from "@/components/nav";
import { SolanaProviders } from "@/components/solana-providers";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });

export const metadata: Metadata = {
  title: "TxSettle — markets that settle themselves",
  description:
    "Parimutuel World Cup markets on Solana devnet that settle trustlessly against TxODDS' published Merkle roots. No admin key, no trusted oracle: if the proof doesn't verify on-chain, the market cannot resolve.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-surface text-ink">
        <SolanaProviders>
          <div className="flex min-h-screen flex-col">
            <Nav />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </SolanaProviders>
      </body>
    </html>
  );
}
