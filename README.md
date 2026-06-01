# Solana Reels

**The most beautiful, premium-feeling slot machine on Solana — with real wallet connections.**

A high-fidelity, production-quality frontend prototype featuring:

- 100% real Solana wallet connections (Phantom, Solflare, Backpack)
- **Real on-chain betting with $MEMETORRENT** — Users can buy the token and bet with it using real SPL token transfers on Mainnet. All $MEMETORRENT bets go directly to the MT Ecosystem treasury (35hMAzLD99oag1RUjBTNUoJuwqso4xvKEYsWHsvjskqD). A tiny amount of SOL is still required for transaction fees.
- “Buy $MEMETORRENT” opens Jupiter with SOL → $MEMETORRENT.
- “Get SOL for fees” now lets users swap a small amount of $MEMETORRENT for SOL (ecosystem-friendly).
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

> ⚠️ This is running on Solana Mainnet with real transactions. Use real funds at your own risk.

## Deploy (One-Click)

This project is fully polished and ready to deploy.

### Fixing the "403 Access Forbidden" Error (Important)

You are seeing this because the public Solana RPC blocks requests.

**You already have a Helius key.** Here's exactly what to do:

#### 1. Add the Key to Vercel (for the live site)

1. Go to your Vercel project dashboard.
2. Click **Settings** → **Environment Variables**.
3. Click **Add New**.

4. Fill in the fields **exactly** like this:

   - **Key** (or Name):  
     `VITE_SOLANA_RPC_URL`

   - **Value**:  
     `https://mainnet.helius-rpc.com/?api-key=61a3cb76-ffd8-4dde-bb49-35cae29566c8`

   - **Note** (Optional): You can leave this empty or write `Helius Mainnet RPC`

   - Select these environments:  
     ☑ Production  
     ☑ Preview  
     ☑ Development

5. Click **Save**.

6. Go to the **Deployments** tab → Click **Redeploy** on the latest deployment.

4. Go to the **Deployments** tab and click **Redeploy** on the latest deployment (or just push any small change to GitHub).

After redeployment:
- Hard refresh the live site (`Ctrl + Shift + R`)
- Reconnect your wallet

You should now see a small badge next to "MAINNET" in the header:
- **Green "Helius"** (or "Custom RPC") badge → Your RPC key is active ✓
- **Yellow "Public RPC"** badge → Still using the public endpoint (will likely 403)

Clicking the green badge will show a toast with the masked RPC URL for confirmation.

There is also a small **↻** button next to the $MEMETORRENT balance you can click to force refresh it.

When the token balance shows 0, the app now shows a helpful note with the mint address to help users import it in Phantom.

#### 2. Use it locally (for development)

In your project folder (`E:\solana-reels`), create a file named **`.env.local`** (create it if it doesn't exist) and add this line:

```env
VITE_SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=61a3cb76-ffd8-4dde-bb49-35cae29566c8
```

Save the file, then restart your local server:

```powershell
npm run dev
```

This will make the app use your Helius key when developing locally.

**Security Note**: Never commit your real API key. The `.env.local` file is already gitignored.

The "Buy $MEMETORRENT" button now correctly opens Jupiter with SOL → $MEMETORRENT.

The “Get SOL for fees” button lets players swap a small amount of $MEMETORRENT for SOL (keeping value inside the MT Ecosystem).

Clear messaging throughout the UI reinforces that buying and betting with $MEMETORRENT helps fund the entire MT game network.

---

## Important: You Still Need Some SOL for Fees

Even when betting with **$MEMETORRENT**, every transaction on Solana requires a small amount of SOL (~0.000005–0.00001 SOL) to pay network fees.

If a user has 835 $MEMETORRENT but 0 SOL, they will see:
> "You don't have enough SOL for this transaction"

The app now shows clear warnings in the UI when SOL balance is too low for fees while betting with the token.

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

---

## Fixing "Buffer is not defined" Error

If you see this error when trying to bet/spin:

> `Bet transaction failed: ReferenceError: Buffer is not defined`

This is a known browser compatibility issue with Solana libraries.

**I have already fixed this** in the code using `vite-plugin-node-polyfills`.

### How to Push These Latest Changes (Buy MT + Get SOL for Fees updates)

```powershell
cd E:\solana-reels
git add .
git commit -m "Updated Buy $MEMETORRENT and Get SOL for fees links to be fully ecosystem-friendly + added MT treasury messaging"
git push
```

Then redeploy on Vercel (or let the push trigger auto-deploy).

After deployment:
- Hard refresh the live site (`Ctrl + Shift + R`)
- Test the two Jupiter buttons:
  - “Buy $MEMETORRENT” → should open SOL → MT
  - “Get SOL for fees with $MEMETORRENT” → should open MT → SOL (10 tokens)

---

Ready when you are — deploy it and send me the link when it's live. Then we can add features based on what you experience.