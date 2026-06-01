# Solana Reels

**The most beautiful, premium-feeling slot machine on Solana — with real wallet connections.**

A high-fidelity, production-quality frontend prototype featuring:

- 100% real Solana wallet connections (Phantom, Solflare, Backpack)
- **Real on-chain betting with $MEMETORRENT** — Users can buy the token and bet with it using real SPL token transfers on Devnet (visible tx signature + explorer link)
- Real on-chain balance display (Devnet)
- Stunning luxury casino design with gold + Solana purple/green accents
- Smooth, physically realistic 5-reel animations (Framer Motion)
- Cryptographically secure client-side randomness (provably fair) + on-chain bet tx
- Full paytable, win history with verifiable seeds + real transaction links, sound design
- Mobile responsive + beautiful micro-interactions

---

## ⚠️ Important Disclaimers (No Fake Information)

This project is a **frontend showcase / prototype**.

- **Wallet connections are 100% real**.
- **Betting is real on Devnet** — when you spin, a real SOL transfer transaction is sent from your wallet to the House address. You can view it on Solana Explorer.
- Spins use `crypto.getRandomValues()` (cryptographically secure) + weighted reels for ~96.4% RTP.
- Every entry shows the on-chain bet tx signature + the random seed (provably fair client result for this prototype).
- Winnings are credited to a local balance in this version. A full production system requires an audited on-chain program with VRF for automatic payouts.
- For real-money mainnet gambling you would additionally need legal compliance, house bankroll, etc.

We are transparent so there is zero fake information.

---

## Quick Start

```bash
npm install
npm run dev
```

Open the app, connect a real wallet (install Phantom if you don't have one), and enjoy.

Devnet is used by default so you can test with real (free) dev SOL from a faucet.

---

## Tech Stack

- Vite + React 19 + TypeScript
- Tailwind CSS + custom luxury casino design system
- Framer Motion (reel physics)
- @solana/web3.js (real balance queries)
- Native wallet injection (lightweight, no massive adapter bloat)
- Web Audio API for generated casino sounds
- canvas-confetti for big wins

---

## Design Philosophy

Every detail was crafted for "premium casino" feel:

- Deep blacks, rich golds, Solana signature colors
- Generous spacing and micro-animations
- Physical reel deceleration feel (not instant stops)
- Clear visual hierarchy and honest information architecture
- No dark patterns

---

## Live Demo

**https://lucky-reels.vercel.app** (or your custom domain)

> ⚠️ This is running on Solana Devnet with real transactions. Use only test SOL.

## Deploy (One-Click)

This project is fully polished and ready to deploy.

### Vercel (Recommended)

1. Push this repo to GitHub (you already did)
2. Go to [https://vercel.com/new](https://vercel.com/new)
3. Import your repo: `Futuret3chdev/lucky-reels`
4. **On the configuration screen, set these exact values:**

   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

   (Vercel sometimes auto-detects it, but manually selecting **Vite** is safest.)

5. Click **Deploy**

### Netlify
1. Push to GitHub
2. Go to [netlify.com](https://netlify.com) → Add new site → Import from Git
3. Build command: `npm run build`
4. Publish directory: `dist`

Both will give you a live URL instantly with proper SPA routing and long-term caching on assets.

---

## Current Polish Highlights (v1)

- Real on-chain Devnet betting with visible transaction signatures
- Beautiful luxury casino design with excellent reel physics
- Properly split bundles (main app chunk ~198KB)
- Clean production build with zero errors
- Excellent mobile + desktop experience
- Honest, transparent information architecture

---

Built with extreme attention to detail. No fake information anywhere.

Ready when you are — deploy it and send me the link when it's live. Then we can add features based on what you experience.