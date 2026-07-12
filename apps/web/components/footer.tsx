import { explorerAddressUrl, MOCK_USDC_MINT, PROGRAM_ID, REPO_URL, TXORACLE_PROGRAM_ID } from "@/lib/config";

const LINKS: Array<{ label: string; href: string; mono?: string }> = [
  { label: "GitHub", href: REPO_URL },
  { label: "Market program", href: explorerAddressUrl(PROGRAM_ID.toBase58()), mono: PROGRAM_ID.toBase58() },
  { label: "txoracle verifier", href: explorerAddressUrl(TXORACLE_PROGRAM_ID.toBase58()), mono: TXORACLE_PROGRAM_ID.toBase58() },
  { label: "Mock-USDC mint", href: explorerAddressUrl(MOCK_USDC_MINT.toBase58()), mono: MOCK_USDC_MINT.toBase58() },
];

export function Footer() {
  return (
    <footer className="border-t border-edge bg-panel">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-2">
        <div className="max-w-md space-y-3">
          <p className="text-sm leading-relaxed text-ink-dim">
            TxSettle markets settle against Merkle roots TxODDS publishes on Solana — anyone can submit the proof of the final score, and the
            program verifies it on-chain before a single token moves. No admin key, no trusted oracle: if the proof doesn&apos;t verify, the market
            cannot resolve.
          </p>
          <p className="font-mono text-[11px] uppercase tracking-widest text-ink-faint">
            TxODDS × Solana World Cup Hackathon 2026 · devnet only · mock USDC — no real-money wagering
          </p>
        </div>
        <ul className="space-y-2 md:justify-self-end">
          {LINKS.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex flex-wrap items-baseline gap-x-2 text-sm text-ink-dim transition-colors hover:text-accent"
              >
                <span>{link.label} ↗</span>
                {link.mono ? <span className="font-mono text-xs text-ink-faint group-hover:text-accent-dim">{link.mono}</span> : null}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
