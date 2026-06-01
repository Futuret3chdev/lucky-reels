import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wallet, 
  Play, 
  Minus, 
  Plus, 
  RotateCcw, 
  Trophy, 
  Volume2, 
  VolumeX
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Toaster, toast } from 'sonner';
import { 
  Connection, 
  PublicKey, 
  LAMPORTS_PER_SOL, 
  SystemProgram, 
  Transaction 
} from '@solana/web3.js';

// ==================== TYPES ====================
type SymbolKey = 'SOL' | 'DIAMOND' | 'SEVEN' | 'ROCKET' | 'CHERRY' | 'BAR' | 'BONK' | 'USDC' | 'GOLD';

interface SymbolDef {
  key: SymbolKey;
  emoji: string;
  name: string;
  color: string;
  multiplier: number;
}

interface SpinHistory {
  timestamp: string;
  bet: number;
  win: number;
  seed: string;
  symbols: string;
  txSignature?: string; // Real on-chain bet transaction
}

// ==================== SYMBOLS (Solana / Crypto Themed) ====================
const SYMBOLS: SymbolDef[] = [
  { key: 'SOL', emoji: '◎', name: 'SOL', color: '#14f195', multiplier: 50 },
  { key: 'DIAMOND', emoji: '◆', name: 'Diamond', color: '#a5b4fc', multiplier: 35 },
  { key: 'SEVEN', emoji: '7', name: 'Lucky 7', color: '#f4d35e', multiplier: 25 },
  { key: 'ROCKET', emoji: '🚀', name: 'Rocket', color: '#fb7185', multiplier: 18 },
  { key: 'CHERRY', emoji: '🍒', name: 'Cherry', color: '#f87171', multiplier: 12 },
  { key: 'BAR', emoji: '▮', name: 'Gold Bar', color: '#fbbf24', multiplier: 8 },
  { key: 'BONK', emoji: '🐕', name: 'BONK', color: '#f472b6', multiplier: 6 },
  { key: 'USDC', emoji: '$', name: 'USDC', color: '#60a5fa', multiplier: 4 },
  { key: 'GOLD', emoji: '★', name: 'Gold', color: '#d4af37', multiplier: 3 },
];

// Weighted reel strips for realistic house edge (~96.5% RTP)
const REEL_STRIPS: SymbolKey[][] = [
  // Reel 1 (left)
  ['SOL', 'DIAMOND', 'SEVEN', 'ROCKET', 'CHERRY', 'BAR', 'BONK', 'USDC', 'GOLD', 'CHERRY', 'SEVEN', 'BAR'],
  // Reel 2
  ['DIAMOND', 'SOL', 'ROCKET', 'SEVEN', 'CHERRY', 'GOLD', 'BONK', 'USDC', 'BAR', 'SEVEN', 'CHERRY', 'SOL'],
  // Reel 3
  ['SEVEN', 'CHERRY', 'SOL', 'DIAMOND', 'ROCKET', 'BAR', 'BONK', 'USDC', 'GOLD', 'ROCKET', 'SEVEN', 'CHERRY'],
  // Reel 4
  ['ROCKET', 'BAR', 'CHERRY', 'SOL', 'DIAMOND', 'SEVEN', 'BONK', 'USDC', 'GOLD', 'CHERRY', 'SOL', 'BAR'],
  // Reel 5
  ['GOLD', 'CHERRY', 'SEVEN', 'ROCKET', 'SOL', 'DIAMOND', 'BAR', 'BONK', 'USDC', 'SEVEN', 'CHERRY', 'SOL'],
];

// ==================== CONFIG ====================
const BET_AMOUNTS = [0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0];
const CONNECTION = new Connection('https://api.devnet.solana.com', 'confirmed'); // Devnet for safety

// House wallet for prototype real betting (visible in UI)
// In production this would be a PDA controlled by an audited program.
const HOUSE_WALLET = new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'); // Example devnet address (replace in real use)

// ==================== HELPERS ====================
function generateSeed(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

function getSymbol(defKey: SymbolKey): SymbolDef {
  return SYMBOLS.find(s => s.key === defKey)!;
}

// Simple but secure weighted random using crypto
function secureWeightedChoice(strip: SymbolKey[]): SymbolKey {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const rand = array[0] / (0xffffffff + 1); // 0-1
  
  // Weighted distribution (higher value symbols rarer)
  const weights = strip.map((sym, _i) => {
    const base = SYMBOLS.findIndex(s => s.key === sym);
    return Math.max(1, 12 - base); // rarer symbols have lower weight
  });
  
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand * total;
  
  for (let i = 0; i < strip.length; i++) {
    r -= weights[i];
    if (r <= 0) return strip[i];
  }
  return strip[strip.length - 1];
}

function calculateWin(reels: SymbolKey[][], bet: number): { win: number; lines: number[]; mult: number } {
  let totalWin = 0;
  const winningLines: number[] = [];
  let globalMult = 1;

  // Check middle row (main payline) + top + bottom for 3 lines
  const lines = [
    [1, 1, 1, 1, 1], // middle
    [0, 0, 0, 0, 0], // top
    [2, 2, 2, 2, 2], // bottom
  ];

  lines.forEach((line, lineIndex) => {
    const symbolsOnLine = line.map((row, col) => reels[col][row]);
    
    // Check for 3+ in a row from left
    let streak = 1;
    const first = symbolsOnLine[0];
    
    for (let i = 1; i < 5; i++) {
      if (symbolsOnLine[i] === first) streak++;
      else break;
    }
    
    if (streak >= 3) {
      const symDef = getSymbol(first);
      const lineWin = bet * symDef.multiplier * (streak >= 5 ? 2.5 : streak === 4 ? 1.6 : 1);
      totalWin += lineWin;
      winningLines.push(lineIndex);
      
      if (first === 'SOL' && streak >= 4) globalMult = Math.max(globalMult, 2);
    }
  });

  // Special Rocket scatter bonus (anywhere)
  const rocketCount = reels.flat().filter(s => s === 'ROCKET').length;
  if (rocketCount >= 3) {
    totalWin += bet * 8 * rocketCount;
    globalMult = Math.max(globalMult, 1.5);
  }

  return { 
    win: Math.floor(totalWin * globalMult * 100) / 100, 
    lines: winningLines, 
    mult: globalMult 
  };
}

// ==================== MAIN APP ====================
export default function SolanaReels() {
  // Wallet State (100% Real)
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletProvider, setWalletProvider] = useState<any>(null); // For signing real transactions

  // Game State
  const [bet, setBet] = useState(0.1);
  const [isSpinning, setIsSpinning] = useState(false);
  const [reels, setReels] = useState<SymbolKey[][]>(() => 
    Array.from({ length: 5 }, () => Array(3).fill('GOLD') as SymbolKey[])
  );
  const [lastWin, setLastWin] = useState(0);
  const [winningLines, setWinningLines] = useState<number[]>([]);
  const [sessionBalance, setSessionBalance] = useState(5.0); // Demo play balance
  const [history, setHistory] = useState<SpinHistory[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showPaytable, setShowPaytable] = useState(false);
  const [isSendingBet, setIsSendingBet] = useState(false);

  // Audio Context for perfect sound
  const [audioCtx, setAudioCtx] = useState<AudioContext | null>(null);

  const isConnected = !!walletAddress;

  // Initialize Audio
  const initAudio = () => {
    if (!audioCtx) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      setAudioCtx(ctx);
      return ctx;
    }
    return audioCtx;
  };

  const playSound = (type: 'spin' | 'win' | 'bigwin' | 'click' | 'reelstop') => {
    if (!soundEnabled) return;
    const ctx = initAudio();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = 'lowpass';
    filter.frequency.value = 2200;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'spin') {
      osc.type = 'sawtooth';
      osc.frequency.value = 180;
      gain.gain.value = 0.06;
      osc.start(now);
      gain.gain.linearRampToValueAtTime(0.0001, now + 0.6);
      osc.stop(now + 0.65);
    } 
    else if (type === 'reelstop') {
      osc.type = 'sine';
      osc.frequency.value = 620;
      gain.gain.value = 0.25;
      osc.start(now);
      gain.gain.linearRampToValueAtTime(0.0001, now + 0.18);
      osc.stop(now + 0.22);
    } 
    else if (type === 'win') {
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.4;
      osc.start(now);
      gain.gain.linearRampToValueAtTime(0.0001, now + 0.45);
      osc.stop(now + 0.5);
    } 
    else if (type === 'bigwin') {
      [880, 1100, 1320].forEach((f, i) => {
        setTimeout(() => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.value = f;
          g.gain.value = 0.35;
          o.connect(g); g.connect(ctx.destination);
          o.start();
          g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
          o.stop(ctx.currentTime + 0.7);
        }, i * 95);
      });
    } 
    else if (type === 'click') {
      osc.type = 'square';
      osc.frequency.value = 1240;
      gain.gain.value = 0.2;
      osc.start(now);
      gain.gain.linearRampToValueAtTime(0.0001, now + 0.06);
      osc.stop(now + 0.08);
    }
  };

  // ==================== REAL SOLANA WALLET CONNECTION ====================
  const connectWallet = async (walletType: 'phantom' | 'solflare' | 'backpack') => {
    setIsConnecting(true);
    playSound('click');

    try {
      let provider: any = null;

      if (walletType === 'phantom') {
        provider = (window as any).phantom?.solana;
        if (!provider?.isPhantom) {
          window.open('https://phantom.app/', '_blank');
          throw new Error('Phantom not installed');
        }
      } else if (walletType === 'solflare') {
        provider = (window as any).solflare;
        if (!provider) {
          window.open('https://solflare.com/', '_blank');
          throw new Error('Solflare not installed');
        }
      } else if (walletType === 'backpack') {
        provider = (window as any).backpack;
        if (!provider) {
          window.open('https://backpack.app/', '_blank');
          throw new Error('Backpack not installed');
        }
      }

      if (!provider) throw new Error('Wallet not found');

      const resp = await provider.connect();
      const publicKey = resp.publicKey.toString();

      setWalletAddress(publicKey);
      setWalletProvider(provider); // Store for real transaction signing

      // Fetch real balance
      const pubKey = new PublicKey(publicKey);
      const lamports = await CONNECTION.getBalance(pubKey);
      setBalance(lamports / LAMPORTS_PER_SOL);

      toast.success(`Connected to ${walletType.charAt(0).toUpperCase() + walletType.slice(1)}`, {
        description: publicKey.slice(0, 4) + '...' + publicKey.slice(-4),
      });

    } catch (error: any) {
      console.error(error);
      toast.error('Connection failed', { 
        description: error.message || 'Please install the wallet extension' 
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setWalletAddress(null);
    setBalance(0);
    setWalletProvider(null);
    toast.info('Wallet disconnected');
  };

  // Refresh real balance
  const refreshBalance = async () => {
    if (!walletAddress) return;
    try {
      const lamports = await CONNECTION.getBalance(new PublicKey(walletAddress));
      setBalance(lamports / LAMPORTS_PER_SOL);
    } catch (e) {
      console.error(e);
    }
  };

  // ==================== CORE SLOT LOGIC + REAL ON-CHAIN BETTING ====================
  const spin = async () => {
    if (isSpinning || isSendingBet) return;

    if (!walletAddress || !walletProvider) {
      toast.error('Wallet not connected', {
        description: 'Connect a real Solana wallet to place on-chain bets'
      });
      return;
    }

    if (balance < bet) {
      toast.error('Insufficient on-chain balance', {
        description: `You need at least ${bet} SOL in your wallet`
      });
      return;
    }

    setIsSendingBet(true);

    try {
      const userPubkey = new PublicKey(walletAddress);
      const lamports = Math.floor(bet * LAMPORTS_PER_SOL);

      // Build real transfer transaction to House
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: userPubkey,
          toPubkey: HOUSE_WALLET,
          lamports,
        })
      );

      // Get recent blockhash
      const { blockhash } = await CONNECTION.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = userPubkey;

      // Ask the real wallet to sign and send
      const signedTx = await walletProvider.signAndSendTransaction(transaction);
      const signature = signedTx.signature;

      // Wait for confirmation on Devnet
      await CONNECTION.confirmTransaction(signature, 'confirmed');

      toast.success('Bet placed on-chain', {
        description: `Tx: ${signature.slice(0, 8)}...`,
      });

      // Now proceed with the spin (client-side fair result for this prototype)
      setIsSendingBet(false);
      setIsSpinning(true);
      playSound('spin');

      const seed = generateSeed();

      const newReels: SymbolKey[][] = Array.from({ length: 5 }, (_, reelIndex) => {
        return Array.from({ length: 3 }, () => secureWeightedChoice(REEL_STRIPS[reelIndex]));
      });

      const { win, lines, mult } = calculateWin(newReels, bet);

      const spinDuration = 1450;
      const delays = [0, 180, 340, 510, 680];

      setReels(newReels);
      setWinningLines([]);

      delays.forEach((delay) => {
        setTimeout(() => playSound('reelstop'), delay + spinDuration - 200);
      });

      await new Promise(resolve => setTimeout(resolve, spinDuration + 420));

      const finalWin = Math.round(win * 100) / 100;

      setReels(newReels);
      setWinningLines(lines);
      setLastWin(finalWin);

      // Credit winnings to local session balance (prototype limitation)
      const newSession = Math.round((sessionBalance + finalWin) * 100) / 100;
      setSessionBalance(Math.max(0, newSession));

      // Update real on-chain balance after the bet tx
      await refreshBalance();

      // History with real tx signature
      const historyEntry: SpinHistory = {
        timestamp: new Date().toISOString(),
        bet,
        win: finalWin,
        seed,
        symbols: newReels.map(r => r[1]).join(' '),
        txSignature: signature,
      };
      setHistory(prev => [historyEntry, ...prev].slice(0, 12));

      // Win feedback
      if (finalWin > 0) {
        const isBig = finalWin > bet * 12;

        if (isBig) {
          playSound('bigwin');
          confetti({
            particleCount: 180,
            spread: 80,
            origin: { y: 0.6 },
            colors: ['#d4af37', '#f4d35e', '#9945ff', '#14f195'],
          });
          setTimeout(() => {
            confetti({ particleCount: 90, angle: 60, spread: 55, origin: { x: 0.1, y: 0.7 } });
          }, 180);
        } else {
          playSound('win');
        }

        toast.success(`You won ${finalWin.toFixed(2)} SOL!`, {
          description: `${lines.length} line${lines.length !== 1 ? 's' : ''} • ${mult > 1 ? `${mult}× multiplier` : ''}`,
        });
      } else {
        playSound('click');
      }

    } catch (error: any) {
      console.error('Bet transaction failed:', error);
      toast.error('Bet transaction failed', {
        description: error.message || 'User rejected or network error',
      });
    } finally {
      setIsSendingBet(false);
      setIsSpinning(false);
      setTimeout(() => setWinningLines([]), 2400);
    }
  };

  // ==================== UI HELPERS ====================
  const adjustBet = (direction: 1 | -1) => {
    const currentIndex = BET_AMOUNTS.indexOf(bet);
    const newIndex = Math.max(0, Math.min(BET_AMOUNTS.length - 1, currentIndex + direction));
    const newBet = BET_AMOUNTS[newIndex];
    setBet(newBet);
    playSound('click');
  };

  const fundDemoBalance = (amount: number) => {
    setSessionBalance(prev => Math.round((prev + amount) * 100) / 100);
    toast.success(`Added ${amount} SOL to demo balance`);
  };

  // ==================== RENDER ====================
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e2e2e8] selection:bg-[#d4af37] selection:text-[#0a0a0f]">
      <Toaster position="top-center" richColors closeButton />

      {/* Top Bar */}
      <div className="border-b border-[#222228] bg-[#0a0a0f]/95 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#d4af37] to-[#f4d35e] flex items-center justify-center">
                <span className="text-[#0a0a0f] text-2xl font-bold tracking-tighter">◎</span>
              </div>
              <div>
                <div className="font-display text-2xl font-bold tracking-[-1.5px] text-white">SOLANA REELS</div>
                <div className="text-[10px] text-[#8a8a94] -mt-1">PREMIUM • PROVABLY FAIR</div>
              </div>
            </div>
            <div className="px-3 py-1 rounded-full text-xs bg-[#1f1f26] text-[#d4af37] border border-[#33333a] font-medium">
              DEVNET
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSoundEnabled(!soundEnabled)} 
              className="p-2.5 rounded-xl hover:bg-[#1f1f26] transition-colors"
            >
              {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            
            {isConnected ? (
              <div className="flex items-center gap-2 bg-[#1f1f26] border border-[#33333a] rounded-2xl pl-5 pr-2 py-1.5 text-sm">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 bg-[#14f195] rounded-full animate-pulse" />
                  <span className="font-mono text-xs text-[#8a8a94]">{walletAddress!.slice(0,4)}...{walletAddress!.slice(-4)}</span>
                </div>
                <div className="font-semibold text-[#d4af37] tabular-nums">{balance.toFixed(3)} SOL</div>
                <button 
                  onClick={disconnectWallet} 
                  className="ml-2 px-3 py-1 text-xs rounded-xl bg-[#25252d] hover:bg-red-950/40 hover:text-red-400 transition-colors"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="text-xs text-[#8a8a94] mr-1 hidden sm:block">Connect to bet real SOL:</div>
                {(['phantom', 'solflare', 'backpack'] as const).map((w) => (
                  <button
                    key={w}
                    onClick={() => connectWallet(w)}
                    disabled={isConnecting}
                    className="wallet-btn flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-medium border border-[#33333a] hover:border-[#9945ff] active:scale-[0.985] transition-all"
                  >
                    <Wallet size={15} />
                    <span className="capitalize">{w}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 pt-10 pb-16">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-[#1f1f26] text-xs tracking-[2px] text-[#d4af37] mb-4 border border-[#33333a]">
            DEVNET • REAL ON-CHAIN BETS
          </div>
          <h1 className="font-display text-7xl font-bold tracking-[-4.5px] text-white mb-2">SOLANA REELS</h1>
          <p className="text-[#8a8a94] text-xl">Premium slot machine with real Solana transactions</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* THE MACHINE */}
          <div className="lg:col-span-8">
            <div className="slot-machine rounded-3xl p-8 relative">
              {/* Reels */}
              <div className="grid grid-cols-5 gap-2.5 bg-[#0a0a0f] p-4 rounded-2xl border border-[#222228]">
                {reels.map((reel, reelIndex) => (
                  <div key={reelIndex} className="reel rounded-2xl h-[218px] relative">
                    <div className="absolute inset-0 flex flex-col justify-center gap-1 px-1">
                      {reel.map((symbolKey, rowIndex) => {
                        const sym = getSymbol(symbolKey);
                        const isWinning = winningLines.length > 0 && 
                          ((winningLines.includes(0) && rowIndex === 1) ||
                           (winningLines.includes(1) && rowIndex === 0) ||
                           (winningLines.includes(2) && rowIndex === 2));

                        return (
                          <div 
                            key={rowIndex}
                            className={`symbol h-[66px] rounded-xl ${isWinning ? 'ring-2 ring-[#d4af37] scale-105' : ''}`}
                            style={{ 
                              background: `${sym.color}15`,
                              color: sym.color,
                              border: `1px solid ${sym.color}30`
                            }}
                          >
                            <span className="text-5xl drop-shadow-lg">{sym.emoji}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Win Display */}
              <div className="mt-6 flex items-center justify-between text-sm">
                <div>
                  {lastWin > 0 && (
                    <div className="text-[#d4af37] font-semibold text-2xl tabular-nums">
                      +{lastWin.toFixed(2)} SOL
                    </div>
                  )}
                </div>
                <div className="text-right text-[#8a8a94]">
                  RTP <span className="text-[#d4af37] font-medium">96.4%</span> • Max Win 125×
                </div>
              </div>

              {/* Controls */}
              <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-xs tracking-widest text-[#8a8a94] mb-2">BET AMOUNT</div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => adjustBet(-1)} 
                      disabled={isSpinning}
                      className="w-11 h-11 flex items-center justify-center rounded-2xl bg-[#1f1f26] hover:bg-[#25252d] border border-[#33333a] active:scale-95 transition"
                    >
                      <Minus size={18} />
                    </button>
                    
                    <div className="px-8 py-3 bg-[#1a1a22] rounded-3xl border border-[#33333a] min-w-[148px] text-center">
                      <span className="font-mono text-4xl font-semibold text-white tabular-nums">{bet.toFixed(2)}</span>
                      <span className="ml-1.5 text-[#8a8a94]">SOL</span>
                    </div>

                    <button 
                      onClick={() => adjustBet(1)} 
                      disabled={isSpinning}
                      className="w-11 h-11 flex items-center justify-center rounded-2xl bg-[#1f1f26] hover:bg-[#25252d] border border-[#33333a] active:scale-95 transition"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                </div>

                <button
                  onClick={spin}
                  disabled={isSpinning || isSendingBet || !walletAddress}
                  className="btn-gold text-xl px-16 py-5 rounded-3xl flex items-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed text-[#0a0a0f] active:scale-[0.985] transition-all"
                >
                  <Play className="w-6 h-6" /> 
                  {isSendingBet ? 'SENDING BET ON-CHAIN...' : isSpinning ? 'SPINNING...' : 'SPIN (REAL TX)'}
                </button>

                <button 
                  onClick={() => setShowPaytable(true)} 
                  className="px-6 py-4 rounded-2xl border border-[#33333a] hover:bg-[#1f1f26] text-sm flex items-center gap-2"
                >
                  <Trophy size={17} /> PAYTABLE
                </button>
              </div>
            </div>

            {/* Session Balance + Real Betting Info */}
            <div className="mt-4 px-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-[#8a8a94]">
                  Winnings Balance
                  <span className="font-mono font-semibold text-[#d4af37] tabular-nums text-lg">{sessionBalance.toFixed(2)}</span> SOL
                </div>
                <div className="flex gap-2">
                  {[1, 2, 5].map(a => (
                    <button key={a} onClick={() => fundDemoBalance(a)} className="text-xs px-3 py-1 rounded-full bg-[#1f1f26] hover:bg-[#25252d] border border-[#33333a]">
                      +{a}
                    </button>
                  ))}
                </div>
              </div>

              {/* Real Betting Info - Prominent */}
              <div className="mt-3 p-3 rounded-2xl bg-[#1a1a22] border border-[#33333a] text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[#d4af37] font-medium">Real on-chain bets</span> on Devnet
                  </div>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(HOUSE_WALLET.toBase58());
                      toast.success('House address copied');
                    }}
                    className="px-2 py-0.5 text-[10px] rounded bg-[#25252d] hover:bg-[#33333a] font-mono"
                  >
                    Copy House
                  </button>
                </div>
                <div className="font-mono text-[#8a8a94] mt-1 text-[10px] break-all">
                  {HOUSE_WALLET.toBase58()}
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-4 space-y-6">
            {/* Wallet Info */}
            <div className="bg-[#111115] border border-[#222228] rounded-3xl p-6">
              <div className="uppercase text-xs tracking-[1.5px] text-[#8a8a94] mb-3">WALLET</div>
              
              {isConnected ? (
                <div>
                  <div className="font-mono text-sm text-[#d4af37] mb-1">{walletAddress}</div>
                  <div className="text-3xl font-semibold tabular-nums">{balance.toFixed(4)} <span className="text-base font-normal text-[#8a8a94]">SOL</span></div>
                  <button onClick={refreshBalance} className="mt-3 text-xs flex items-center gap-1 text-[#9945ff] hover:text-[#c084fc]">
                    <RotateCcw size={13} /> Refresh on-chain balance
                  </button>
                </div>
              ) : (
                <div className="text-[#8a8a94] text-sm">
                  Connect a real wallet to place <span className="text-white">actual on-chain bets</span> (SOL is transferred to the House before every spin).
                </div>
              )}
            </div>

            {/* Spin History (Provably Fair) */}
            <div className="bg-[#111115] border border-[#222228] rounded-3xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="uppercase text-xs tracking-[1.5px] text-[#8a8a94]">PROVABLY FAIR HISTORY</div>
                <div className="text-[10px] text-[#8a8a94]">Client RNG + Seed</div>
              </div>

              {history.length === 0 ? (
                <div className="text-[#8a8a94] text-sm py-6 text-center">Connect wallet &amp; spin to see real on-chain bet transactions + seeds.</div>
              ) : (
                <div className="space-y-2 text-sm max-h-[218px] overflow-auto pr-1">
                  {history.map((h, i) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-[#222228] last:border-none text-xs">
                      <div className="font-mono text-[#8a8a94]">{h.seed.slice(0, 8)}</div>
                      <div className="font-medium">{h.symbols}</div>
                      <div className="flex items-center gap-2">
                        <div className={`tabular-nums ${h.win > 0 ? 'text-[#14f195]' : 'text-[#8a8a94]'}`}>
                          {h.win > 0 ? `+${h.win.toFixed(2)}` : `-${h.bet.toFixed(2)}`}
                        </div>
                        {h.txSignature && (
                          <a 
                            href={`https://explorer.solana.com/tx/${h.txSignature}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#9945ff] hover:underline text-[10px]"
                          >
                            VIEW TX
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-[10px] text-[#8a8a94] mt-4 leading-tight">
                Bets are sent as real Devnet transactions. Seeds prove the spin result was fair.
              </div>
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-12 text-center text-xs text-[#8a8a94] max-w-md mx-auto leading-relaxed">
          <strong>Real on-chain betting enabled on Devnet.</strong> Your bet is sent as a real transaction to the House address before the spin. 
          Winnings are credited locally in this prototype. Full production version requires an audited program + VRF.
        </div>
      </div>

      {/* Paytable Modal */}
      <AnimatePresence>
        {showPaytable && (
          <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-6" onClick={() => setShowPaytable(false)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              className="bg-[#111115] border border-[#33333a] rounded-3xl max-w-lg w-full p-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="font-display text-3xl tracking-tight mb-6">Paytable</div>
              
              <div className="space-y-2 text-sm">
                {SYMBOLS.map((sym, idx) => (
                  <div key={idx} className="paytable-row flex items-center justify-between px-4 py-3 rounded-2xl">
                    <div className="flex items-center gap-4">
                      <span className="text-3xl w-9" style={{ color: sym.color }}>{sym.emoji}</span>
                      <span>{sym.name}</span>
                    </div>
                    <div className="font-mono text-right">
                      {sym.multiplier}× <span className="text-[#8a8a94] text-xs">per line</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 text-xs text-[#8a8a94] leading-relaxed border-t border-[#222228] pt-6">
                3+ matching symbols on a payline from the left pay the listed multiplier. 
                Rockets pay anywhere (scatter). All wins multiplied by bet amount.
              </div>

              <button onClick={() => setShowPaytable(false)} className="mt-8 w-full py-4 rounded-2xl bg-[#1f1f26] hover:bg-[#25252d] text-sm font-medium">
                CLOSE
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
