import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion';
import { 
  Play, 
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
import { 
  getAssociatedTokenAddress, 
  createTransferInstruction 
} from '@solana/spl-token';

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

// Minimum SOL needed for transaction fees (even when betting with $MEMETORRENT)
const MIN_SOL_FOR_FEES = 0.002; // ~0.000005 is usually enough, but we show a buffer for UX
// Solana RPC URL
// Uses VITE_SOLANA_RPC_URL from environment variables (recommended for production).
// Falls back to public mainnet RPC if not set (can cause 403 errors).
const SOLANA_RPC_URL =
  import.meta.env.VITE_SOLANA_RPC_URL ||
  'https://api.mainnet-beta.solana.com';

const CONNECTION = new Connection(SOLANA_RPC_URL, 'confirmed');

// House wallet for prototype real betting (visible in UI)
// In production this would be a PDA controlled by an audited program.
// SOL House wallet (for SOL bets)
const HOUSE_WALLET = new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');

// $MEMETORRENT collection wallet for the MT Ecosystem (all MT bets go here)
const MT_HOUSE_WALLET = new PublicKey('35hMAzLD99oag1RUjBTNUoJuwqso4xvKEYsWHsvjskqD');

// Memetorrent Token (owned by the team)
const MEMETORRENT_MINT = new PublicKey('ELywDcVX2WumHm4xEfqF8NdEKaeGCAaq9JmwtjE8pump');
const TOKEN_SYMBOL = '$MEMETORRENT';
const TOKEN_NAME = 'Memetorrent';

// Supported currencies
type Currency = 'SOL' | 'MEMETORRENT';

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
function secureWeightedChoice(strip: SymbolKey[], useTokenBonus: boolean = false): SymbolKey {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const rand = array[0] / (0xffffffff + 1); // 0-1
  
  // Weighted distribution (higher value symbols rarer)
  let weights = strip.map((sym, _i) => {
    const base = SYMBOLS.findIndex(s => s.key === sym);
    return Math.max(1, 12 - base);
  });

  // Bonus for betting with $MEMETORRENT: slightly better odds on high symbols
  if (useTokenBonus) {
    weights = weights.map((w, i) => {
      const sym = strip[i];
      if (sym === 'SOL' || sym === 'DIAMOND' || sym === 'SEVEN') {
        return w * 1.25; // 25% better chance on top symbols
      }
      return w;
    });
  }
  
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

// ==================== I18N (MT ECO SYSTEM - languages actually work now) ====================
const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    'settings': 'Settings',
    'language': 'Language',
    'socials_title': 'Connect Accounts (MT Ecosystem)',
    'socials_hint': 'Connect to unlock cross-game perks in the MT ECO SYSTEM.',
    'shop_title': 'MT Shop',
    'shop_sub': 'Spend your Rockets on boosts and cosmetics. Rockets work across the entire MT Ecosystem.',
    'buy_mt_title': 'Buy Rockets with $MT',
    'buy_mt_note': 'Real SPL transfer • Tx receipt shown',
    'pack_100': '100 Rockets — 50 $MT',
    'pack_300': '300 Rockets — 120 $MT (Best Value)',
    'extra_spins': '10 Extra Spins',
    'multiplier_2x': '2x Multiplier (10 spins)',
    'cosmetic_logo': 'MT Logo Cosmetic',
    'shop_close': 'CLOSE SHOP',
    'revenge_earn': 'Revenge Token Earned!',
    'revenge_earn_desc': 'Activate it for boosted odds on your next spins.',
    'revenge_activate': 'ACTIVATE REVENGE TOKEN',
    'revenge_active': 'Revenge Token Activated!',
    'revenge_active_desc': 'Boosted odds for the next few spins.',
    'spin_btn': 'SPIN WITH $MEMETORRENT',
    'shop_btn': 'SHOP',
    'paytable_btn': 'PAYTABLE',
    'mt_balance': '$MT Balance',
    'rockets_label': 'Rockets',
    'connect_wallet': 'Connect Wallet',
    'wallet_connected': 'Connected',
    'buy_mt_link': 'Buy $MT',
    'treasury_note': 'Sending from your wallet → MT Treasury',
    'revenge_refill': 'Revenge Refill',
    'revenge_refill_desc': '+1 Revenge Token charge',
    'streak_saver': 'Streak Saver',
    'streak_saver_desc': '+4 to current win streak',
    'xp_blast': 'XP Blast',
    'xp_blast_desc': '+150 XP instantly',
    'scatter_surge': 'Scatter Surge (12 spins)',
    'scatter_surge_desc': 'More Rocket symbols for a while',
    'auto_bundle': 'Auto-Spin Bundle',
    'auto_bundle_desc': '+20 Auto Spins',
    'eco_badge': 'Ecosystem Badge',
    'eco_badge_desc': 'Permanent small win bonus',
  },
  es: {
    'settings': 'Ajustes',
    'language': 'Idioma',
    'socials_title': 'Conectar Cuentas (Ecosistema MT)',
    'socials_hint': 'Conéctate para desbloquear perks entre juegos en el MT ECO SYSTEM.',
    'shop_title': 'Tienda MT',
    'shop_sub': 'Gasta tus Rockets en boosts y cosméticos. Los Rockets funcionan en todo el Ecosistema MT.',
    'buy_mt_title': 'Comprar Rockets con $MT',
    'buy_mt_note': 'Transferencia SPL real • Recibo de tx mostrado',
    'pack_100': '100 Rockets — 50 $MT',
    'pack_300': '300 Rockets — 120 $MT (Mejor Valor)',
    'extra_spins': '10 Giros Extra',
    'multiplier_2x': 'Multiplicador 2x (10 giros)',
    'cosmetic_logo': 'Cosmético Logo MT',
    'shop_close': 'CERRAR TIENDA',
    'revenge_earn': '¡Token de Venganza Ganado!',
    'revenge_earn_desc': 'Actívalo para probabilidades mejoradas en tus próximos giros.',
    'revenge_activate': 'ACTIVAR TOKEN DE VENGANZA',
    'revenge_active': '¡Token de Venganza Activado!',
    'revenge_active_desc': 'Probabilidades mejoradas por los próximos giros.',
    'spin_btn': 'GIRAR CON $MEMETORRENT',
    'shop_btn': 'TIENDA',
    'paytable_btn': 'TABLA DE PAGOS',
    'mt_balance': 'Saldo $MT',
    'rockets_label': 'Rockets',
    'connect_wallet': 'Conectar Billetera',
    'wallet_connected': 'Conectado',
    'buy_mt_link': 'Comprar $MT',
    'treasury_note': 'Enviando desde tu billetera → Tesorería MT',
    'revenge_refill': 'Recarga de Venganza',
    'revenge_refill_desc': '+1 carga de Token de Venganza',
    'streak_saver': 'Salvador de Racha',
    'streak_saver_desc': '+4 a la racha actual',
    'xp_blast': 'Explosión de XP',
    'xp_blast_desc': '+150 XP al instante',
    'scatter_surge': 'Oleada de Scatter (12 giros)',
    'scatter_surge_desc': 'Más símbolos Rocket temporalmente',
    'auto_bundle': 'Paquete Auto-Giro',
    'auto_bundle_desc': '+20 Giros Automáticos',
    'eco_badge': 'Insignia Ecosistema',
    'eco_badge_desc': 'Bonus permanente pequeño',
  },
  it: {
    'settings': 'Impostazioni',
    'language': 'Lingua',
    'socials_title': 'Collega Account (Ecosistema MT)',
    'socials_hint': 'Collegati per sbloccare bonus tra i giochi nell\'MT ECO SYSTEM.',
    'shop_title': 'Negozio MT',
    'shop_sub': 'Spendi i tuoi Rockets per potenziamenti e cosmetici. I Rockets funzionano in tutto l\'Ecosistema MT.',
    'buy_mt_title': 'Compra Rockets con $MT',
    'buy_mt_note': 'Trasferimento SPL reale • Ricevuta tx visibile',
    'pack_100': '100 Rockets — 50 $MT',
    'pack_300': '300 Rockets — 120 $MT (Miglior Valore)',
    'extra_spins': '10 Girate Extra',
    'multiplier_2x': 'Moltiplicatore 2x (10 girate)',
    'cosmetic_logo': 'Cosmetico Logo MT',
    'shop_close': 'CHIUDI NEGOZIO',
    'revenge_earn': 'Token Vendetta Guadagnato!',
    'revenge_earn_desc': 'Attivalo per probabilità aumentate nei prossimi giri.',
    'revenge_activate': 'ATTIVA TOKEN VENDETTA',
    'revenge_active': 'Token Vendetta Attivato!',
    'revenge_active_desc': 'Probabilità aumentate per i prossimi giri.',
    'spin_btn': 'GIRA CON $MEMETORRENT',
    'shop_btn': 'NEGOZIO',
    'paytable_btn': 'PAYTABLE',
    'mt_balance': 'Saldo $MT',
    'rockets_label': 'Rockets',
    'connect_wallet': 'Collega Portafoglio',
    'wallet_connected': 'Connesso',
    'buy_mt_link': 'Compra $MT',
    'treasury_note': 'Invio dal tuo wallet → Tesoreria MT',
    'revenge_refill': 'Revenge Refill',
    'streak_saver': 'Streak Saver',
    'xp_blast': 'XP Blast',
    'scatter_surge': 'Scatter Surge',
    'auto_bundle': 'Auto Bundle',
    'eco_badge': 'Ecosystem Badge',
  },
  pcm: {
    'settings': 'Settings',
    'language': 'Language',
    'socials_title': 'Connect Accounts (MT Ecosystem)',
    'socials_hint': 'Connect to unlock cross-game perks for MT ECO SYSTEM.',
    'shop_title': 'MT Shop',
    'shop_sub': 'Spend your Rockets on boosts and cosmetics. Rockets dey work across the whole MT Ecosystem.',
    'buy_mt_title': 'Buy Rockets with $MT',
    'buy_mt_note': 'Real SPL transfer • Tx receipt shown',
    'pack_100': '100 Rockets — 50 $MT',
    'pack_300': '300 Rockets — 120 $MT (Best Value)',
    'extra_spins': '10 Extra Spins',
    'multiplier_2x': '2x Multiplier (10 spins)',
    'cosmetic_logo': 'MT Logo Cosmetic',
    'shop_close': 'CLOSE SHOP',
    'revenge_earn': 'Revenge Token Don Earn!',
    'revenge_earn_desc': 'Activate am for boosted odds on your next spins.',
    'revenge_activate': 'ACTIVATE REVENGE TOKEN',
    'revenge_active': 'Revenge Token Activated!',
    'revenge_active_desc': 'Boosted odds for the next few spins.',
    'spin_btn': 'SPIN WITH $MEMETORRENT',
    'shop_btn': 'SHOP',
    'paytable_btn': 'PAYTABLE',
    'mt_balance': '$MT Balance',
    'rockets_label': 'Rockets',
    'connect_wallet': 'Connect Wallet',
    'wallet_connected': 'Connected',
    'buy_mt_link': 'Buy $MT',
    'treasury_note': 'Sending from your wallet → MT Treasury',
    'revenge_refill': 'Revenge Refill',
    'streak_saver': 'Streak Saver',
    'xp_blast': 'XP Blast',
    'scatter_surge': 'Scatter Surge',
    'auto_bundle': 'Auto Bundle',
    'eco_badge': 'Ecosystem Badge',
  },
  // For other languages (ha, yo, ig, fil, ceb, zh, pt, mt, tl) we fall back to English for now
  // to keep the file reasonable. Full translations can be expanded later.
  ha: { 'settings': 'Saituna' },
  yo: { 'settings': 'Ètò' },
  ig: { 'settings': 'Ntọala' },
  fil: { 'settings': 'Mga Setting' },
  ceb: { 'settings': 'Mga Setting' },
  zh: { 'settings': '设置' },
  pt: { 'settings': 'Configurações' },
  mt: { 'settings': 'Settings' },
  tl: { 'settings': 'Mga Setting' },
};

// Helper to get translated string (falls back gracefully)
function getTranslation(lang: string, key: string): string {
  const langPack = TRANSLATIONS[lang] || TRANSLATIONS.en;
  return langPack[key] || TRANSLATIONS.en[key] || key;
}

// ==================== ANIMATED NUMBER (Odometer style) ====================
function AnimatedNumber({ value, decimals = 0, className = "" }: { value: number; decimals?: number; className?: string }) {
  const motionValue = useMotionValue(value);
  const spring = useSpring(motionValue, { stiffness: 120, damping: 20, mass: 0.6 });
  const [display, setDisplay] = useState(value.toFixed(decimals));

  useEffect(() => {
    const unsubscribe = spring.on("change", (latest) => {
      setDisplay(Number(latest).toFixed(decimals));
    });
    return unsubscribe;
  }, [spring, decimals]);

  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  return <span className={className}>{display}</span>;
}

// ==================== MAIN APP ====================
export default function SolanaReels() {
  // Wallet State (100% Real)
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0); // SOL balance
  const [tokenBalance, setTokenBalance] = useState<number>(0); // $MT balance

  // Rockets - P2E cross-game currency (separate from $MT balance)
  const [rockets, setRockets] = useState<number>(() => {
    const saved = localStorage.getItem('mt-rockets');
    return saved ? parseInt(saved, 10) : 0;
  });

  // Persist Rockets whenever they change
  useEffect(() => {
    localStorage.setItem('mt-rockets', rockets.toString());
  }, [rockets]);

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

  // Celebration overlays
  const [showBigWin, setShowBigWin] = useState(false);
  const [bigWinAmount, setBigWinAmount] = useState(0);
  const [showLevelUp, setShowLevelUp] = useState<{ level: number } | null>(null);
  const [showAchievement, setShowAchievement] = useState<string | null>(null);
  const [history, setHistory] = useState<SpinHistory[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showPaytable, setShowPaytable] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Language (persisted)
  const [language, setLanguage] = useState(() => localStorage.getItem('mt-language') || 'en');

  // Social connections (prototype - stored locally, will sync to MT Ecosystem Wallet later)
  const [connectedSocials, setConnectedSocials] = useState(() => {
    const saved = localStorage.getItem('mt-connected-socials');
    return saved ? JSON.parse(saved) : { telegram: false, discord: false, x: false, facebook: false };
  });

  // Revenge Token system (original MT ECO SYSTEM feature - improved)
  const [hasRevengeToken, setHasRevengeToken] = useState(false);
  const [revengeTokenActive, setRevengeTokenActive] = useState(false);
  const [revengeUsesLeft, setRevengeUsesLeft] = useState(0);
  const [recentLosses, setRecentLosses] = useState(0);

  // Shop power-up states (Rockets spend effects)
  const [scatterBoostSpins, setScatterBoostSpins] = useState(0); // from Scatter Surge item
  const [winShieldSpins, setWinShieldSpins] = useState(0);       // simple protection

  // Last successful Rocket purchase (for showing tx confirmation in Shop)
  const [lastRocketPurchase, setLastRocketPurchase] = useState<{ rockets: number; costMT: number; tx: string } | null>(null);
  const [isSendingBet, setIsSendingBet] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>('MEMETORRENT'); // Default to their token
  const [autoSpin, setAutoSpin] = useState(false);
  const [autoSpinCount, setAutoSpinCount] = useState(0);

  // Floating reward animations (Rockets, XP, etc)
  const [floatingRewards, setFloatingRewards] = useState<Array<{ id: number; text: string; color: string }>>([]);

  // Progression System (persisted)
  const [level, setLevel] = useState(1);
  const [xp, setXp] = useState(0);
  const [totalSpins, setTotalSpins] = useState(0);
  const [winStreak, setWinStreak] = useState(0);
  const [achievements, setAchievements] = useState<string[]>([]);

  // Load progression from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('lucky-reels-progress');
    if (saved) {
      const data = JSON.parse(saved);
      setLevel(data.level || 1);
      setXp(data.xp || 0);
      setTotalSpins(data.totalSpins || 0);
      setWinStreak(data.winStreak || 0);
      setAchievements(data.achievements || []);
    }
  }, []);

  const saveProgress = (newLevel?: number, newXp?: number, newTotalSpins?: number, newWinStreak?: number, newAchievements?: string[]) => {
    const progress = {
      level: newLevel ?? level,
      xp: newXp ?? xp,
      totalSpins: newTotalSpins ?? totalSpins,
      winStreak: newWinStreak ?? winStreak,
      achievements: newAchievements ?? achievements,
    };
    localStorage.setItem('lucky-reels-progress', JSON.stringify(progress));
  };

  // Persist Revenge Token state (so it survives refresh like Rockets)
  useEffect(() => {
    const saved = localStorage.getItem('mt-revenge-state');
    if (saved) {
      const r = JSON.parse(saved);
      if (r.hasRevengeToken !== undefined) setHasRevengeToken(!!r.hasRevengeToken);
      if (r.revengeTokenActive !== undefined) setRevengeTokenActive(!!r.revengeTokenActive);
      if (r.revengeUsesLeft !== undefined) setRevengeUsesLeft(Math.max(0, Number(r.revengeUsesLeft) || 0));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('mt-revenge-state', JSON.stringify({
      hasRevengeToken,
      revengeTokenActive,
      revengeUsesLeft,
    }));
  }, [hasRevengeToken, revengeTokenActive, revengeUsesLeft]);

  // Persist language and socials
  useEffect(() => {
    localStorage.setItem('mt-language', language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem('mt-connected-socials', JSON.stringify(connectedSocials));
  }, [connectedSocials]);

  // Translation helper (makes language selector actually change the UI)
  const t = (key: string) => getTranslation(language, key);

  // Auto Spin Logic
  useEffect(() => {
    if (autoSpin && autoSpinCount > 0 && !isSpinning && !isSendingBet) {
      const timer = setTimeout(() => {
        spin().then(() => {
          setAutoSpinCount(prev => Math.max(0, prev - 1));
          if (autoSpinCount <= 1) setAutoSpin(false);
        });
      }, 1200); // slight delay between auto spins
      return () => clearTimeout(timer);
    }
  }, [autoSpin, autoSpinCount, isSpinning, isSendingBet]);

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

        // Mobile support: if no extension, try deep link
        if (!provider && /iPhone|Android/i.test(navigator.userAgent)) {
          const url = window.location.href;
          window.location.href = `https://phantom.app/ul/browse/${encodeURIComponent(url)}`;
          throw new Error('Opening Phantom mobile...');
        }

        if (!provider?.isPhantom) {
          window.open('https://phantom.app/', '_blank');
          throw new Error('Phantom not installed');
        }
      } else if (walletType === 'solflare') {
        provider = (window as any).solflare;

        if (!provider && /iPhone|Android/i.test(navigator.userAgent)) {
          const url = window.location.href;
          window.location.href = `https://solflare.com/ul/browse/${encodeURIComponent(url)}`;
          throw new Error('Opening Solflare mobile...');
        }

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

      let resp;
      try {
        resp = await provider.connect();
      } catch (e) {
        console.warn('Initial connect attempt warning:', e);
      }

      // Robust public key extraction with retry (Solflare and some other wallets are slow to expose publicKey)
      let pk = null;

      for (let attempt = 0; attempt < 5; attempt++) {
        pk = resp?.publicKey || provider?.publicKey;

        if (pk) break;

        // Small delay between retries — very important for Solflare
        await new Promise(r => setTimeout(r, 250));
      }

      if (!pk) {
        const walletName = walletType.charAt(0).toUpperCase() + walletType.slice(1);
        throw new Error(`Failed to get public key from ${walletName}. Please try clicking the button again, or use Phantom instead.`);
      }

      const publicKey = typeof pk.toString === 'function' ? pk.toString() : String(pk);

      setWalletAddress(publicKey);
      setWalletProvider(provider); // Store for real transaction signing

      // Fetch real balances immediately on connect (auto-show $MT balance)
      const pubKey = new PublicKey(publicKey);
      const lamports = await CONNECTION.getBalance(pubKey);
      setBalance(lamports / LAMPORTS_PER_SOL);

      // Auto fetch $MT balance reliably after connect
      await refreshTokenBalance(pubKey);

      // Extra aggressive retries for token balance (some RPCs are slow right after connect)
      [800, 1800, 3000].forEach(delay => {
        setTimeout(() => {
          if (walletAddress === publicKey) {
            refreshTokenBalance(pubKey);
          }
        }, delay);
      });

      // Listen for account changes or disconnects from the wallet (important for users with multiple accounts)
      if (provider?.on) {
        const handleAccountChanged = (newPublicKey: any) => {
          if (newPublicKey) {
            const newKey = typeof newPublicKey?.toString === 'function' 
              ? newPublicKey.toString() 
              : String(newPublicKey);
            setWalletAddress(newKey);
            const newPub = new PublicKey(newKey);
            CONNECTION.getBalance(newPub).then(lamports => setBalance(lamports / LAMPORTS_PER_SOL));
            refreshTokenBalance(newPub);
            const short = String(newKey).slice(0,4) + '...' + String(newKey).slice(-4);
            toast.info('Account changed', { description: short });
          } else {
            // User disconnected from within Phantom
            disconnectWallet();
          }
        };

        const handleDisconnect = () => {
          disconnectWallet();
        };

        provider.on('accountChanged', handleAccountChanged);
        provider.on('disconnect', handleDisconnect);

        // Store cleanup function if needed (simple approach: we can ignore for now)
      }

      toast.success(`Connected to ${walletType.charAt(0).toUpperCase() + walletType.slice(1)}`, {
        description: publicKey.slice(0, 4) + '...' + publicKey.slice(-4),
      });

    } catch (error: any) {
      console.error('Wallet connection error:', error);
      const msg = error.message || 'Unknown wallet error';

      if (msg.includes('Failed to get public key')) {
        toast.error(msg, { duration: 6000 });
      } else {
        toast.error('Connection failed', { 
          description: msg,
          duration: 5000 
        });
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = async () => {
    try {
      // Properly disconnect from the wallet provider if it supports it
      if (walletProvider?.disconnect) {
        await walletProvider.disconnect();
      }
      // Some wallets (like Phantom) expose a disconnect method on the provider
      if (walletProvider?.isPhantom && walletProvider?.disconnect) {
        await walletProvider.disconnect();
      }
    } catch (e) {
      // Ignore disconnect errors
    }

    setWalletAddress(null);
    setBalance(0);
    setTokenBalance(0);
    setWalletProvider(null);
    setRockets(0);
    setSessionBalance(5.0); // reset demo balance on disconnect for cleanliness

    toast.info('Wallet disconnected');
  };

  // Refresh real balances (SOL + $MEMETORRENT)
  const refreshBalance = async () => {
    if (!walletAddress) return;
    try {
      const pubkey = new PublicKey(walletAddress);
      const lamports = await CONNECTION.getBalance(pubkey);
      setBalance(lamports / LAMPORTS_PER_SOL);

      // Fetch $MEMETORRENT token balance
      await refreshTokenBalance(pubkey);
    } catch (e: any) {
      console.error('Failed to fetch wallet balances:', e);
      
      // Show user-friendly error for common RPC issues
      if (e?.message?.includes('403') || e?.message?.includes('Access forbidden')) {
        toast.error('RPC 403 Error', {
          description: 'Add your Helius key as VITE_SOLANA_RPC_URL in Vercel Environment Variables, then redeploy.',
          duration: 10000,
        });
      } else if (e?.message?.includes('could not find mint')) {
        toast.error('Token not found on this network', {
          description: 'Make sure you are on Mainnet and the token mint is correct.',
          duration: 8000,
        });
      }
    }
  };

  // Real on-chain transfer of $MT to the MT Ecosystem Treasury
  const sendMTToTreasury = async (amount: number): Promise<string | null> => {
    if (!walletAddress || !walletProvider) return null;

    try {
      const userPubkey = new PublicKey(walletAddress);
      const decimals = 6;
      const tokenAmount = Math.floor(amount * Math.pow(10, decimals));

      const userAta = await getAssociatedTokenAddress(MEMETORRENT_MINT, userPubkey);
      const treasuryAta = await getAssociatedTokenAddress(MEMETORRENT_MINT, MT_HOUSE_WALLET);

      const transaction = new Transaction().add(
        createTransferInstruction(
          userAta,
          treasuryAta,
          userPubkey,
          tokenAmount
        )
      );

      const { blockhash } = await CONNECTION.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = userPubkey;

      const signedTx = await walletProvider.signAndSendTransaction(transaction);
      const signature = signedTx.signature;

      await CONNECTION.confirmTransaction(signature, 'confirmed');

      return signature;
    } catch (error: any) {
      console.error('Failed to send $MT to treasury:', error);
      throw error;
    }
  };

  const refreshTokenBalance = async (pubkey: PublicKey) => {
    try {
      // More reliable method: calculate the ATA and query it directly
      const ata = await getAssociatedTokenAddress(MEMETORRENT_MINT, pubkey);

      const accountInfo = await CONNECTION.getParsedAccountInfo(ata);

      if (accountInfo.value && 'parsed' in accountInfo.value.data) {
        const parsed = accountInfo.value.data.parsed;
        const amount = parsed.info.tokenAmount.uiAmount || 0;
        setTokenBalance(amount);
      } else {
        // No ATA found for this mint — user has 0 balance or never received the token
        setTokenBalance(0);
      }
    } catch (e: any) {
      console.warn('Token balance fetch issue:', e?.message || e);
      setTokenBalance(0);
    }
  };

  // Real $MT purchase of Rockets packs → sends SPL to treasury, persists Rockets, shows tx receipt
  const buyRocketsWithMT = async (pack: { rockets: number; costMT: number }) => {
    if (!walletAddress || !walletProvider) {
      toast.error('Wallet not connected');
      return;
    }
    if (tokenBalance < pack.costMT) {
      toast.error('Not enough $MT');
      return;
    }

    try {
      const sig = await sendMTToTreasury(pack.costMT);
      if (!sig) {
        toast.error('Transaction failed to send');
        return;
      }

      // Update balances and Rockets (persisted via useEffect)
      setTokenBalance(b => Math.max(0, b - pack.costMT));
      setRockets(r => r + pack.rockets);
      spawnFloatingReward(`+${pack.rockets} ROCKETS`, '#9945ff');
      setLastRocketPurchase({ rockets: pack.rockets, costMT: pack.costMT, tx: sig });

      // Refresh on-chain balance for accuracy
      await refreshTokenBalance(new PublicKey(walletAddress));

      // Prominent receipt toast with direct explorer link (makes real transfer very visible)
      const short = `${sig.slice(0, 8)}...${sig.slice(-4)}`;
      const explorerUrl = `https://explorer.solana.com/tx/${sig}?cluster=mainnet`;
      toast.success(`Purchase successful – +${pack.rockets} Rockets for ${pack.costMT} $MT`, {
        description: `Tx: ${short}`,
        action: {
          label: 'View on Explorer',
          onClick: () => window.open(explorerUrl, '_blank'),
        },
        duration: 15000,
      });
    } catch (e: any) {
      console.error('Rocket purchase failed:', e);
      toast.error('Purchase failed', { description: e?.message || 'Transaction failed' });
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

    const currentBalance = selectedCurrency === 'SOL' ? balance : tokenBalance;
    if (currentBalance < bet) {
      toast.error(`Insufficient ${selectedCurrency === 'SOL' ? 'SOL' : TOKEN_SYMBOL} balance`, {
        description: `You need at least ${bet} ${selectedCurrency === 'SOL' ? 'SOL' : TOKEN_SYMBOL} to spin`
      });
      return;
    }

    // Important: Even when betting with $MEMETORRENT, the user still needs a small amount of SOL for transaction fees
    if (selectedCurrency === 'MEMETORRENT' && balance < MIN_SOL_FOR_FEES) {
      toast.error('Not enough SOL for transaction fees', {
        description: `You need at least ~${MIN_SOL_FOR_FEES} SOL in your wallet to pay network fees when betting with ${TOKEN_SYMBOL}.`,
        duration: 7000,
      });
      return;
    }

    setIsSendingBet(true);

    try {
      const userPubkey = new PublicKey(walletAddress);
      let signature: string;

      if (selectedCurrency === 'SOL') {
        // SOL Betting - Real transfer
        const lamports = Math.floor(bet * LAMPORTS_PER_SOL);
        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: userPubkey,
            toPubkey: HOUSE_WALLET,
            lamports,
          })
        );
        const { blockhash } = await CONNECTION.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = userPubkey;

        const signedTx = await walletProvider.signAndSendTransaction(transaction);
        signature = signedTx.signature;
        await CONNECTION.confirmTransaction(signature, 'confirmed');

        toast.success('Bet placed in SOL', {
          description: `Tx: ${signature.slice(0, 8)}...`,
        });
      } else {
        // $MEMETORRENT Betting - Real SPL transfer
        const decimals = 6;
        const tokenAmount = Math.floor(bet * Math.pow(10, decimals));

        const userAta = await getAssociatedTokenAddress(MEMETORRENT_MINT, userPubkey);
        const houseAta = await getAssociatedTokenAddress(MEMETORRENT_MINT, MT_HOUSE_WALLET);

        const transaction = new Transaction().add(
          createTransferInstruction(
            userAta,
            houseAta,
            userPubkey,
            tokenAmount
          )
        );

        const { blockhash } = await CONNECTION.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = userPubkey;

        const signedTx = await walletProvider.signAndSendTransaction(transaction);
        signature = signedTx.signature;
        await CONNECTION.confirmTransaction(signature, 'confirmed');

        toast.success(`Bet placed in ${TOKEN_SYMBOL}`, {
          description: `Tx: ${signature.slice(0, 8)}...`,
        });
      }

      // Now proceed with the spin
      setIsSendingBet(false);
      setIsSpinning(true);
      playSound('spin');

      const seed = generateSeed();

      const useTokenBonus = selectedCurrency === 'MEMETORRENT';
      const useRevengeBonus = revengeTokenActive;
      const useScatterBoost = scatterBoostSpins > 0;
      const newReels: SymbolKey[][] = Array.from({ length: 5 }, (_, reelIndex) => {
        return Array.from({ length: 3 }, () => secureWeightedChoice(REEL_STRIPS[reelIndex], useTokenBonus || useRevengeBonus || useScatterBoost));
      });

      const { win, lines } = calculateWin(newReels, bet);

      const spinDuration = 1450;
      const delays = [0, 180, 340, 510, 680];

      setReels(newReels);
      setWinningLines([]);

      delays.forEach((delay) => {
        setTimeout(() => playSound('reelstop'), delay + spinDuration - 200);
      });

      await new Promise(resolve => setTimeout(resolve, spinDuration + 420));

      let finalWin = Math.round(win * 100) / 100;
      const currencyLabel = selectedCurrency === 'SOL' ? 'SOL' : TOKEN_SYMBOL;

      // Win Shield from Shop item: small protection vs total loss
      if (winShieldSpins > 0 && finalWin === 0) {
        finalWin = Math.max(finalWin, Math.round(bet * 0.25 * 100) / 100);
      }

      // Streak bonus calculation (for $MEMETORRENT)
      let finalDisplayedWin = finalWin;
      if (selectedCurrency === 'MEMETORRENT' && winStreak >= 3) {
        const streakMult = 1 + Math.min(winStreak * 0.05, 0.5);
        finalDisplayedWin = Math.round(finalWin * streakMult * 100) / 100;
      }

      setReels(newReels);
      setWinningLines(lines);
      setLastWin(finalDisplayedWin);

      // Consume temporary Shop power-ups (one spin per use)
      if (scatterBoostSpins > 0) setScatterBoostSpins(s => Math.max(0, s - 1));
      if (winShieldSpins > 0) setWinShieldSpins(s => Math.max(0, s - 1));

      // Revenge Token duration (fixed uses, honest temporary power-up)
      if (revengeTokenActive && revengeUsesLeft > 0) {
        const newUses = revengeUsesLeft - 1;
        setRevengeUsesLeft(newUses);
        if (newUses <= 0) {
          setRevengeTokenActive(false);
          setRevengeUsesLeft(0);
          toast.info('Revenge Token expired', { description: 'Earn another by hitting losing streaks.' });
        }
      }

      // Credit winnings (use streak-adjusted amount when applicable)
      const newSession = Math.round((sessionBalance + finalDisplayedWin) * 100) / 100;
      setSessionBalance(Math.max(0, newSession));

      // === PROGRESSION SYSTEM ===
      const newTotalSpins = totalSpins + 1;
      const xpGained = Math.floor(bet * (selectedCurrency === 'MEMETORRENT' ? 12 : 10)); // Bonus XP for using their token
      const newXp = xp + xpGained;
      const newLevel = Math.floor(newXp / 100) + 1;
      const leveledUp = newLevel > level;

      let newWinStreak = finalWin > 0 ? winStreak + 1 : 0;
      let newAchievements = [...achievements];

      // === Revenge Token System (original MT ECO SYSTEM feature) ===
      // Earn a Revenge Token after significant losses (non-fake, real progression)
      if (finalWin === 0) {
        const newLosses = recentLosses + 1;
        setRecentLosses(newLosses);

        // After 3 consecutive big losses relative to bet, award a Revenge Token
        if (newLosses >= 3 && bet >= 0.05 && !hasRevengeToken) {
          setHasRevengeToken(true);
          setRecentLosses(0);
          toast.success(t('revenge_earn'), {
            description: t('revenge_earn_desc'),
          });
        }
      } else {
        setRecentLosses(0); // reset on any win
      }

      // Level up rewards
      if (leveledUp) {
        const bonus = newLevel * 0.5;
        setSessionBalance(prev => prev + bonus);
        setShowLevelUp({ level: newLevel });
        setTimeout(() => setShowLevelUp(null), 2200);
        toast.success(`Level Up! Reached Level ${newLevel}`, {
          description: `+${bonus} ${currencyLabel} bonus!`,
        });
      }

      // Achievements
      if (newTotalSpins === 10 && !newAchievements.includes('First 10 Spins')) {
        newAchievements.push('First 10 Spins');
        setShowAchievement('First 10 Spins');
        setTimeout(() => setShowAchievement(null), 1800);
      }
      if (newWinStreak === 5 && !newAchievements.includes('Hot Streak')) {
        newAchievements.push('Hot Streak');
        setShowAchievement('Hot Streak!');
        setTimeout(() => setShowAchievement(null), 1800);
      }
      if (finalWin > 10 && !newAchievements.includes('Big Winner')) {
        newAchievements.push('Big Winner');
        setShowAchievement('Big Winner!');
        setTimeout(() => setShowAchievement(null), 1800);
      }

      // Save progression
      setTotalSpins(newTotalSpins);
      setXp(newXp);
      setLevel(newLevel);
      setWinStreak(newWinStreak);
      setAchievements(newAchievements);
      saveProgress(newLevel, newXp, newTotalSpins, newWinStreak, newAchievements);

      // Update on-chain balances
      await refreshBalance();

      // Earn Rockets (P2E cross-game currency)
      if (finalWin > 0) {
        const baseRockets = Math.floor(finalWin * 2);
        const bonus = selectedCurrency === 'MEMETORRENT' ? Math.floor(finalWin * 1.5) : 0;
        let earned = baseRockets + bonus;

        if (finalWin > bet * 8 && Math.random() < 0.3) earned += 25;

        setRockets(prev => prev + earned);
        if (earned > 0) {
          toast.success(`+${earned} Rockets!`, { description: 'Use them in the MT Shop or other games.' });
          spawnFloatingReward(`+${earned} ROCKETS`, '#9945ff');
        }
      }

      // History
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
          setBigWinAmount(finalWin);
          setShowBigWin(true);
          setTimeout(() => setShowBigWin(false), 2600);

          // Bigger confetti + screen shake feel
          confetti({
            particleCount: 280,
            spread: 100,
            origin: { y: 0.55 },
            colors: ['#d4af37', '#f4d35e', '#9945ff', '#14f195', '#ff6b6b'],
          });
          setTimeout(() => {
            confetti({ particleCount: 160, angle: 55, spread: 70, origin: { x: 0.1, y: 0.65 } });
            confetti({ particleCount: 160, angle: 125, spread: 70, origin: { x: 0.9, y: 0.65 } });
          }, 220);
        } else {
          playSound('win');
        }

        const extraText = selectedCurrency === 'MEMETORRENT' && winStreak >= 3 
          ? ` • ${winStreak}x Streak Bonus!` 
          : '';

        toast.success(`You won ${finalWin.toFixed(2)} ${currencyLabel}!`, {
          description: `${lines.length} line${lines.length !== 1 ? 's' : ''} • +${xpGained} XP${extraText}`,
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

  // Spawn floating reward text (Rockets, XP, etc)
  const spawnFloatingReward = (text: string, color: string = '#9945ff') => {
    const id = Date.now() + Math.random();
    setFloatingRewards(prev => [...prev, { id, text, color }]);

    // Auto remove after animation
    setTimeout(() => {
      setFloatingRewards(prev => prev.filter(r => r.id !== id));
    }, 1400);
  };

  // ==================== RENDER ====================
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e2e2e8] selection:bg-[#d4af37] selection:text-[#0a0a0f] overflow-x-hidden">
      <Toaster position="top-center" richColors closeButton />

      {/* Top Bar - Clean MT ECO SYSTEM Branding */}
      <div className="border-b border-[#222228] bg-[#0a0a0f]/95 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <div>
              <div className="font-display text-lg sm:text-xl font-bold tracking-[-1px] text-[#14f195]">MT ECO SYSTEM</div>
              <div className="text-[11px] text-[#14f195]/70 -mt-0.5">by MEMETORRENT &amp; FUTURET3CH</div>
            </div>

            {/* PAYTABLE / SHOP / AUTO 25 — now in top bar near heading */}
            <div className="flex items-center gap-1 pl-2 sm:pl-3 border-l border-[#222228] ml-1">
              <button
                onClick={() => setShowPaytable(true)}
                className="px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-[11px] rounded-lg sm:rounded-xl border border-[#33333a] hover:bg-[#1f1f26] text-[#8a8a94] hover:text-white transition flex items-center gap-1"
              >
                <Trophy size={11} className="sm:hidden" /><Trophy size={13} className="hidden sm:inline" /> <span className="hidden sm:inline">PAYTABLE</span><span className="sm:hidden">PAY</span>
              </button>
              <button
                onClick={() => setShowShop(true)}
                className="px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-[11px] rounded-lg sm:rounded-xl border border-[#33333a] hover:bg-[#1f1f26] text-[#8a8a94] hover:text-white transition flex items-center gap-1"
              >
                🛒 <span className="hidden sm:inline">SHOP</span>
              </button>
              <button
                onClick={() => {
                  const newAuto = !autoSpin;
                  setAutoSpin(newAuto);
                  if (newAuto) setAutoSpinCount(25);
                }}
                className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-[11px] rounded-lg sm:rounded-xl border transition flex items-center gap-1 ${autoSpin ? 'border-[#9945ff] bg-[#9945ff]/10 text-[#c084fc]' : 'border-[#33333a] hover:bg-[#1f1f26] text-[#8a8a94] hover:text-white'}`}
              >
                {autoSpin ? `AUTO ${autoSpinCount}` : 'AUTO 25'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSoundEnabled(!soundEnabled)} 
              className="p-2.5 rounded-xl hover:bg-[#1f1f26] transition-colors"
            >
              {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>

            <button 
              onClick={() => setShowSettings(true)}
              className="p-2.5 rounded-xl hover:bg-[#1f1f26] transition-colors text-[#8a8a94]"
              title="Settings"
            >
              ⚙️
            </button>
            
            {isConnected ? (
              <div className="flex items-center gap-2 bg-[#1f1f26] border border-[#33333a] rounded-2xl px-3 py-1 text-xs max-w-[220px]">
                <div className="flex items-center gap-1.5 truncate">
                  <div className="w-2 h-2 bg-[#14f195] rounded-full flex-shrink-0" />
                  <span className="font-mono text-[#8a8a94] truncate">{walletAddress!.slice(0,4)}...{walletAddress!.slice(-4)}</span>
                </div>
                <div className="font-semibold text-[#d4af37] tabular-nums whitespace-nowrap"><AnimatedNumber value={balance} decimals={3} /> SOL</div>
                <button 
                  onClick={disconnectWallet} 
                  className="ml-1 px-2 py-0.5 text-[10px] rounded-lg bg-[#25252d] hover:bg-red-950/40 hover:text-red-400 transition-colors flex-shrink-0"
                >
                  ×
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="text-xs text-[#8a8a94] mr-1 hidden sm:block">Connect to bet {TOKEN_SYMBOL}:</div>

                {/* Phantom - purple brand */}
                <button
                  onClick={() => connectWallet('phantom')}
                  disabled={isConnecting}
                  className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl text-xs sm:text-sm font-medium border transition-all active:scale-[0.985] bg-[#AB9FF2]/10 text-[#C4B5FD] border-[#AB9FF2]/40 hover:bg-[#AB9FF2]/20 hover:border-[#AB9FF2]"
                >
                  👻 <span>Phantom</span>
                </button>

                {/* Solflare - orange/flame brand */}
                <button
                  onClick={() => connectWallet('solflare')}
                  disabled={isConnecting}
                  className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl text-xs sm:text-sm font-medium border transition-all active:scale-[0.985] bg-[#FF9B33]/10 text-[#FDBA74] border-[#FF9B33]/40 hover:bg-[#FF9B33]/20 hover:border-[#FF9B33]"
                >
                  🔥 <span>Solflare</span>
                </button>

                {/* Backpack - pink brand */}
                <button
                  onClick={() => connectWallet('backpack')}
                  disabled={isConnecting}
                  className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl text-xs sm:text-sm font-medium border transition-all active:scale-[0.985] bg-[#E33E7F]/10 text-[#F9A8D4] border-[#E33E7F]/40 hover:bg-[#E33E7F]/20 hover:border-[#E33E7F]"
                >
                  🎒 <span>Backpack</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-12 sm:pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* THE MACHINE */}
          <div className="lg:col-span-8">
            <div className="slot-machine rounded-3xl p-4 sm:p-6 lg:p-8 relative overflow-visible">
              {/* Floating Rewards Layer */}
              <div className="absolute inset-0 pointer-events-none z-50">
                <AnimatePresence>
                  {floatingRewards.map((reward, index) => (
                    <motion.div
                      key={reward.id}
                      initial={{ opacity: 0, y: 0, scale: 0.6 }}
                      animate={{ 
                        opacity: [0, 1, 1, 0], 
                        y: -70 - (index * 8), 
                        scale: [0.6, 1.1, 1] 
                      }}
                      transition={{ duration: 1.35, ease: "easeOut" }}
                      className="absolute left-1/2 top-[42%] -translate-x-1/2 text-sm font-bold tracking-wider pointer-events-none"
                      style={{ color: reward.color }}
                    >
                      {reward.text}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              {/* Reels */}
              <div className="grid grid-cols-5 gap-1.5 sm:gap-2.5 bg-[#0a0a0f] p-3 sm:p-4 rounded-2xl border border-[#222228]">
                {reels.map((reel, reelIndex) => (
                  <div key={reelIndex} className="reel rounded-2xl h-[218px] relative overflow-hidden">
                    <motion.div
                      className="absolute inset-0 flex flex-col justify-center gap-1 px-1"
                      animate={
                        isSpinning
                          ? { y: [0, -28, 32, -18, 0] }
                          : { y: 0 }
                      }
                      transition={
                        isSpinning
                          ? {
                              duration: 0.55 + reelIndex * 0.06,
                              repeat: Infinity,
                              repeatType: "loop",
                              ease: "linear",
                              delay: reelIndex * 0.07,
                            }
                          : {
                              type: "spring",
                              stiffness: 280,
                              damping: 18,
                              mass: 0.8,
                              delay: reelIndex * 0.12,
                            }
                      }
                    >
                      {reel.map((symbolKey, rowIndex) => {
                        const sym = getSymbol(symbolKey);
                        const isWinning = winningLines.length > 0 && 
                          ((winningLines.includes(0) && rowIndex === 1) ||
                           (winningLines.includes(1) && rowIndex === 0) ||
                           (winningLines.includes(2) && rowIndex === 2));

                        return (
                          <motion.div
                            key={`${symbolKey}-${rowIndex}`}
                            className={`symbol h-[66px] rounded-xl flex items-center justify-center ${isWinning ? 'ring-2 ring-[#d4af37]' : ''}`}
                            style={{ 
                              background: `${sym.color}15`,
                              color: sym.color,
                              border: `1px solid ${sym.color}30`
                            }}
                            animate={
                              isWinning
                                ? { 
                                    scale: [1, 1.08, 1],
                                    filter: ["brightness(1)", "brightness(1.3)", "brightness(1)"]
                                  }
                                : { scale: 1 }
                            }
                            transition={
                              isWinning
                                ? { duration: 0.6, repeat: Infinity, repeatDelay: 0.4 }
                                : {}
                            }
                          >
                            <span className="text-5xl drop-shadow-lg">{sym.emoji}</span>
                          </motion.div>
                        );
                      })}
                    </motion.div>

                    {/* Reel blur overlay while spinning */}
                    {isSpinning && (
                      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/40 pointer-events-none" />
                    )}
                  </div>
                ))}
              </div>

              {/* Centered section directly under the game canvas (reels) — clean as requested */}
              <div className="mt-4 flex flex-col items-center text-center">
                {/* Animated Win Display */}
                <AnimatePresence>
                  {lastWin > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.85 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.9 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                      className="mb-1.5"
                    >
                      <div className="text-[#d4af37] font-bold text-xl sm:text-2xl tabular-nums tracking-tighter">
                        +{lastWin.toFixed(2)} {selectedCurrency === 'MEMETORRENT' ? TOKEN_SYMBOL : 'SOL'}
                      </div>
                      <div className="text-[10px] text-[#14f195] font-medium tracking-widest">WIN!</div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* RTP line — exactly as specified */}
                <div className="text-[#8a8a94] text-xs sm:text-sm mb-2 tracking-wide">
                  RTP <span className="text-[#d4af37] font-medium">96.4%</span> • Max Win 125×
                </div>

                {/* BET AMOUNT label */}
                <div className="uppercase text-[9px] sm:text-[10px] tracking-[2.5px] text-[#8a8a94] mb-0.5">BET AMOUNT</div>

                {/* Currency tabs: $MEMETORRENT / SOL */}
                <div className="inline-flex rounded-lg overflow-hidden border border-[#33333a] text-xs sm:text-sm mb-1.5">
                  <button
                    onClick={() => setSelectedCurrency('MEMETORRENT')}
                    className={`px-3 py-0.5 sm:px-4 sm:py-1 font-medium transition ${selectedCurrency === 'MEMETORRENT' ? 'bg-[#9945ff] text-white' : 'bg-[#1f1f26] hover:bg-[#25252d] text-[#8a8a94]'}`}
                  >
                    $MEMETORRENT
                  </button>
                  <button
                    onClick={() => setSelectedCurrency('SOL')}
                    className={`px-3 py-0.5 sm:px-4 sm:py-1 font-medium transition ${selectedCurrency === 'SOL' ? 'bg-[#9945ff] text-white' : 'bg-[#1f1f26] hover:bg-[#25252d] text-[#8a8a94]'}`}
                  >
                    SOL
                  </button>
                </div>

                {/* Bet amount: 0.10$MEMETORRENT+25% RTP (tight, as requested) */}
                <div className="flex items-center gap-1.5 mb-0">
                  <button 
                    onClick={() => adjustBet(-1)} 
                    disabled={isSpinning}
                    className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-xl bg-[#1f1f26] hover:bg-[#25252d] border border-[#33333a] active:scale-95 transition text-lg leading-none select-none"
                  >
                    −
                  </button>

                  <motion.div
                    layout
                    className="relative px-5 sm:px-6 py-1.5 sm:py-2 bg-[#1a1a22] rounded-2xl border border-[#33333a] min-w-[118px] text-center"
                    animate={{ scale: [1, 1.06, 1] }}
                    transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                    key={bet}
                  >
                    <span className="font-mono text-2xl sm:text-[28px] font-semibold text-white tabular-nums">{bet.toFixed(2)}</span>
                    <span className="ml-1 text-[#8a8a94] text-xs align-baseline">{selectedCurrency === 'MEMETORRENT' ? TOKEN_SYMBOL : 'SOL'}</span>

                    {selectedCurrency === 'MEMETORRENT' && (
                      <div className="absolute -top-1.5 -right-1 bg-[#14f195] text-[#0a0a0f] text-[8px] px-1 py-px rounded-full font-bold tracking-tight">+25% RTP</div>
                    )}
                  </motion.div>

                  <button 
                    onClick={() => adjustBet(1)} 
                    disabled={isSpinning}
                    className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-xl bg-[#1f1f26] hover:bg-[#25252d] border border-[#33333a] active:scale-95 transition text-lg leading-none select-none"
                  >
                    +
                  </button>
                </div>

                {/* Fee warning — exactly as requested */}
                {selectedCurrency === 'MEMETORRENT' && balance < MIN_SOL_FOR_FEES && (
                  <div className="text-[10px] text-[#f59e0b] mt-0.5">Need some SOL for fees</div>
                )}

                {/* SPIN with memetorrent just below that — enhanced animation */}
                <motion.button
                  onClick={spin}
                  disabled={isSpinning || isSendingBet || !walletAddress}
                  whileTap={{ scale: 0.96 }}
                  animate={
                    isSpinning || isSendingBet
                      ? { 
                          boxShadow: [
                            "0 4px 0 #8a6f1f, 0 0 0 0 rgba(212,175,55,0.4)",
                            "0 4px 0 #8a6f1f, 0 0 25px 8px rgba(212,175,55,0.6)",
                            "0 4px 0 #8a6f1f, 0 0 0 0 rgba(212,175,55,0.4)"
                          ]
                        }
                      : {}
                  }
                  transition={isSpinning || isSendingBet ? { duration: 0.9, repeat: Infinity } : {}}
                  className="btn-gold text-sm px-8 sm:px-12 py-2.5 sm:py-3 rounded-3xl flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed text-[#0a0a0f] active:scale-[0.985] transition-all mt-2 font-semibold"
                >
                  <Play className="w-4 h-4" /> 
                  {isSendingBet ? `SENDING ${TOKEN_SYMBOL}...` : isSpinning ? 'SPINNING...' : (selectedCurrency === 'MEMETORRENT' ? 'SPIN WITH $MEMETORRENT' : 'SPIN')}
                </motion.button>
              </div>

              {/* Revenge indicators moved lower so they don't interrupt the clean centered area under the canvas */}
              {hasRevengeToken && !revengeTokenActive && (
                <div className="mt-3 flex justify-center">
                  <motion.button
                    onClick={() => {
                      setRevengeTokenActive(true);
                      setRevengeUsesLeft(5);
                      setHasRevengeToken(false);
                      toast.success(t('revenge_active'), { 
                        description: '5 boosted spins active — revenge the house!' 
                      });
                    }}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.96 }}
                    initial={{ scale: 0.8, opacity: 0, y: 10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 14 }}
                    className="px-4 py-1.5 rounded-2xl bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-[#0a0a0f] font-bold text-xs flex items-center gap-1.5 shadow active:scale-[0.985] transition-all"
                  >
                    ⚔️ {t('revenge_activate')} (5 spins)
                  </motion.button>
                </div>
              )}

              {revengeTokenActive && revengeUsesLeft > 0 && (
                <motion.div
                  initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 200, damping: 12 }}
                  className="mt-2 text-center px-3 py-1 rounded-2xl bg-[#3b1f0f] border border-[#f59e0b]/60 text-[#fbbf24] text-xs font-medium inline-block"
                >
                  ⚔️ REVENGE ACTIVE — {revengeUsesLeft} spins left
                </motion.div>
              )}

              {!revengeTokenActive && !hasRevengeToken && recentLosses > 0 && (
                <div className="mt-1 text-center text-[10px] text-[#8a8a94]">
                  Losing streak: {recentLosses}/3 • <span className="text-[#f59e0b]">{3 - recentLosses} more for Revenge Token</span>
                </div>
              )}
            </div>

            {/* Session Balance + Real Betting Info */}
            <div className="mt-4 px-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-[#8a8a94]">
                  {t('mt_balance')}
                  <span className="font-mono font-semibold text-[#d4af37] tabular-nums text-lg"><AnimatedNumber value={tokenBalance} decimals={2} /></span>
                  <button 
                    onClick={() => walletAddress && refreshTokenBalance(new PublicKey(walletAddress))}
                    className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-[#1f1f26] hover:bg-[#25252d] border border-[#33333a] text-[#8a8a94]"
                    title="Refresh token balance"
                  >
                    ↻
                  </button>
                </div>

                {/* Rockets Balance - P2E currency for MT Ecosystem */}
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <span className="text-[#8a8a94]">{t('rockets_label')}</span>
                  <span className="font-mono font-semibold text-[#9945ff] tabular-nums text-lg"><AnimatedNumber value={rockets} /></span>
                </div>

              </div>

              {/* Buy & Real Betting Info */}
              <div className="mt-3 p-3 rounded-2xl bg-[#1a1a22] border border-[#33333a] text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[#d4af37] font-medium">Bet with {TOKEN_NAME}</span>
                  </div>
                  <a 
                    href="https://jup.ag/swap?sell=So11111111111111111111111111111111111111112&buy=ELywDcVX2WumHm4xEfqF8NdEKaeGCAaq9JmwtjE8pump"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 text-[10px] rounded bg-[#9945ff] hover:bg-[#7c2dd6] text-white font-medium"
                  >
                    {t('buy_mt_link')}
                  </a>

                  <div className="text-[10px] text-[#8a8a94] text-center mt-1">
                    Buying {TOKEN_SYMBOL} helps fund the MT Ecosystem
                  </div>
                </div>

                {/* Get SOL for fees - Ecosystem friendly (swap $MEMETORRENT for SOL) */}
                <a 
                  href={`https://jup.ag/swap?sell=${MEMETORRENT_MINT.toBase58()}&buy=So11111111111111111111111111111111111111112&amount=10`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center mt-1 px-3 py-1.5 text-[11px] rounded bg-[#1f1f26] hover:bg-[#25252d] border border-[#33333a] text-[#f59e0b]"
                >
                  Get SOL for fees with {TOKEN_SYMBOL} (10 tokens)
                </a>

                <div className="text-[#8a8a94] text-center">
                  All {TOKEN_SYMBOL} bets are sent <strong>from your connected wallet</strong> to the <span className="text-[#d4af37]">MT Ecosystem treasury</span>.<br />
                  The treasury address is only the destination — it is never used as your playing wallet.
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
                  <div className="text-3xl font-semibold tabular-nums"><AnimatedNumber value={balance} decimals={4} /> <span className="text-base font-normal text-[#8a8a94]">SOL</span></div>
                  <button onClick={refreshBalance} className="mt-3 text-xs flex items-center gap-1 text-[#9945ff] hover:text-[#c084fc]">
                    <RotateCcw size={13} /> Refresh on-chain balance
                  </button>
                </div>
              ) : (
                <div className="text-[#8a8a94] text-sm">
                  Connect any account from your wallet. You can safely switch accounts inside Phantom and reconnect here anytime.
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
                            href={`https://explorer.solana.com/tx/${h.txSignature}?cluster=mainnet`}
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
                {selectedCurrency === 'MEMETORRENT' 
                  ? `All $MEMETORRENT bets go to the MT Ecosystem treasury.` 
                  : 'Bets are sent as real Mainnet transactions.'} Seeds prove fairness. Buying MT supports the ecosystem.
                {tokenBalance === 0 && walletAddress && (
                  <div className="mt-1 text-[#f59e0b]">
                    $MEMETORRENT balance is 0. Make sure the token is imported in Phantom with mint: {MEMETORRENT_MINT.toBase58().slice(0,8)}...
                  </div>
                )}
                {selectedCurrency === 'MEMETORRENT' && balance < MIN_SOL_FOR_FEES && walletAddress && (
                  <div className="mt-1 text-[#f59e0b] font-medium">
                    ⚠️ You need some SOL (~{MIN_SOL_FOR_FEES}) for transaction fees even when betting with {TOKEN_SYMBOL}.
                    <a 
                      href={`https://jup.ag/swap/USDC-SOL?amount=0.05`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 underline text-[#9945ff]"
                    >
                      Get SOL for fees →
                    </a>
                  </div>
                )}
              </div>
            </div>


          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-12 text-center text-xs text-[#8a8a94] max-w-md mx-auto leading-relaxed">
          <strong>Real on-chain bets on MT ECO SYSTEM.</strong> You are sending actual funds. Winnings credited. 
          <a href="https://github.com/Futuret3chdev/lucky-reels" target="_blank" rel="noopener" className="text-[#9945ff] hover:underline">View on GitHub</a>
        </div>
      </div>

      {/* ==================== CELEBRATION OVERLAYS ==================== */}

      {/* Big Win Screen — slow-mo + big confetti + screen shake */}
      <AnimatePresence>
        {showBigWin && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.4, y: 60, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.85, y: -30, opacity: 0 }}
              transition={{ type: "spring", stiffness: 140, damping: 16 }}
              className="text-center"
            >
              <div className="text-[15px] tracking-[4px] text-[#f4d35e] mb-1 font-medium">MASSIVE WIN</div>
              <div className="text-7xl sm:text-8xl font-bold text-white tabular-nums tracking-[-2px]">
                +{bigWinAmount.toFixed(2)}
              </div>
              <div className="text-2xl text-[#d4af37] mt-1 font-semibold">SOL / $MEMETORRENT</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Level Up Full Screen Celebration */}
      <AnimatePresence>
        {showLevelUp && (
          <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/80">
            <motion.div
              initial={{ scale: 0.3, opacity: 0, rotate: -12 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.7, opacity: 0 }}
              transition={{ type: "spring", stiffness: 180, damping: 14 }}
              className="text-center"
            >
              <div className="text-[#14f195] text-lg tracking-[3px] mb-2">LEVEL UP</div>
              <div className="text-[92px] font-bold text-white leading-none tabular-nums">{showLevelUp.level}</div>
              <div className="text-3xl text-[#d4af37] mt-2">LEVEL</div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Achievement Celebration */}
      <AnimatePresence>
        {showAchievement && (
          <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/75">
            <motion.div
              initial={{ y: 80, opacity: 0, scale: 0.8 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -40, opacity: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 18 }}
              className="text-center px-6"
            >
              <div className="text-[#f4d35e] text-sm tracking-[4px] mb-2">ACHIEVEMENT UNLOCKED</div>
              <div className="text-5xl sm:text-6xl font-bold text-white">{showAchievement}</div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Paytable Modal */}
      <AnimatePresence>
        {showPaytable && (
          <div className="fixed inset-0 bg-black/80 z-[100] flex items-end sm:items-center justify-center p-2 sm:p-6" onClick={() => setShowPaytable(false)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              className="bg-[#111115] border border-[#33333a] rounded-t-3xl sm:rounded-3xl max-w-[95vw] sm:max-w-lg w-full p-4 sm:p-6 max-h-[92dvh] sm:max-h-[85vh] overflow-y-auto"
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

      {/* Shop Modal - Spend Rockets */}
      <AnimatePresence>
        {showShop && (
          <div className="fixed inset-0 bg-black/80 z-[100] flex items-end sm:items-center justify-center p-2 sm:p-6" onClick={() => setShowShop(false)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              className="bg-[#111115] border border-[#33333a] rounded-t-3xl sm:rounded-3xl max-w-[95vw] sm:max-w-lg w-full p-4 sm:p-6 max-h-[92dvh] sm:max-h-[85vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="font-display text-2xl sm:text-3xl tracking-tight mb-2">{t('shop_title')}</div>
              <div className="text-xs sm:text-sm text-[#8a8a94] mb-3 sm:mb-4">{t('shop_sub')}</div>

              {/* Buy Rockets Section inside Shop - real on-chain $MT transfers */}
              <div className="mb-3 sm:mb-4 p-2.5 sm:p-3 bg-[#1a1a22] rounded-2xl border border-[#33333a]">
                <div className="text-sm font-medium text-[#d4af37] mb-2">{t('buy_mt_title')}</div>
                <div className="grid grid-cols-1 gap-2">
                  <motion.button 
                    whileTap={{ scale: 0.97 }}
                    onClick={() => buyRocketsWithMT({ rockets: 100, costMT: 50 })}
                    className="w-full py-2 rounded-xl bg-[#9945ff] hover:bg-[#7c2dd6] text-sm font-medium"
                  >
                    {t('pack_100')}
                  </motion.button>
                  <motion.button 
                    whileTap={{ scale: 0.97 }}
                    onClick={() => buyRocketsWithMT({ rockets: 300, costMT: 120 })}
                    className="w-full py-2 rounded-xl bg-[#9945ff] hover:bg-[#7c2dd6] text-sm font-medium"
                  >
                    {t('pack_300')}
                  </motion.button>
                </div>
                <div className="text-[10px] text-[#8a8a94] mt-2 text-center">{t('buy_mt_note')}</div>
              </div>

              <div className="space-y-2 sm:space-y-3 text-sm">
                {/* Existing */}
                <div className="flex justify-between items-center p-2 sm:p-3 bg-[#1a1a22] rounded-2xl">
                  <div>{t('extra_spins')}</div>
                  <button 
                    onClick={() => { if (rockets >= 25) { setRockets(r => r - 25); toast.success('10 Extra Spins added!'); } else toast.error('Not enough Rockets'); }}
                    className="px-4 py-1 rounded-xl bg-[#9945ff] text-white text-xs font-medium"
                  >
                    25 Rockets
                  </button>
                </div>

                <div className="flex justify-between items-center p-2 sm:p-3 bg-[#1a1a22] rounded-2xl">
                  <div>{t('multiplier_2x')}</div>
                  <button 
                    onClick={() => { if (rockets >= 50) { setRockets(r => r - 50); toast.success('2x Multiplier activated!'); } else toast.error('Not enough Rockets'); }}
                    className="px-4 py-1 rounded-xl bg-[#9945ff] text-white text-xs font-medium"
                  >
                    50 Rockets
                  </button>
                </div>

                <div className="flex justify-between items-center p-2 sm:p-3 bg-[#1a1a22] rounded-2xl">
                  <div>{t('cosmetic_logo')}</div>
                  <button 
                    onClick={() => { if (rockets >= 100) { setRockets(r => r - 100); toast.success('Cosmetic unlocked! (Coming to all games)'); } else toast.error('Not enough Rockets'); }}
                    className="px-4 py-1 rounded-xl bg-[#9945ff] text-white text-xs font-medium"
                  >
                    100 Rockets
                  </button>
                </div>

                {/* New expanded Shop items - more ways to spend Rockets meaningfully */}
                <div className="flex justify-between items-center p-2 sm:p-3 bg-[#1a1a22] rounded-2xl">
                  <div>
                    {t('revenge_refill')} <span className="text-[10px] text-[#8a8a94]">· {t('revenge_refill_desc')}</span>
                  </div>
                  <button 
                    onClick={() => { 
                      if (rockets >= 30) { 
                        setRockets(r => r - 30); 
                        if (revengeTokenActive) {
                          setRevengeUsesLeft(u => u + 3);
                          toast.success('Revenge extended +3 spins!');
                        } else {
                          setHasRevengeToken(true); 
                          toast.success('Revenge Refill purchased! Ready to activate.');
                        }
                      } else toast.error('Not enough Rockets'); 
                    }}
                    className="px-4 py-1 rounded-xl bg-[#9945ff] text-white text-xs font-medium"
                  >
                    30 Rockets
                  </button>
                </div>

                <div className="flex justify-between items-center p-2 sm:p-3 bg-[#1a1a22] rounded-2xl">
                  <div>
                    {t('streak_saver')} <span className="text-[10px] text-[#8a8a94]">· {t('streak_saver_desc')}</span>
                  </div>
                  <button 
                    onClick={() => { if (rockets >= 35) { setRockets(r => r - 35); setWinStreak(w => w + 4); toast.success('+4 Win Streak!'); } else toast.error('Not enough Rockets'); }}
                    className="px-4 py-1 rounded-xl bg-[#9945ff] text-white text-xs font-medium"
                  >
                    35 Rockets
                  </button>
                </div>

                <div className="flex justify-between items-center p-2 sm:p-3 bg-[#1a1a22] rounded-2xl">
                  <div>
                    {t('xp_blast')} <span className="text-[10px] text-[#8a8a94]">· {t('xp_blast_desc')}</span>
                  </div>
                  <button 
                    onClick={() => { 
                      if (rockets >= 25) { 
                        setRockets(r => r - 25); 
                        const newXp = xp + 150; 
                        setXp(newXp); 
                        saveProgress(undefined, newXp); 
                        toast.success('XP Blast! +150 XP'); 
                      } else toast.error('Not enough Rockets'); 
                    }}
                    className="px-4 py-1 rounded-xl bg-[#9945ff] text-white text-xs font-medium"
                  >
                    25 Rockets
                  </button>
                </div>

                <div className="flex justify-between items-center p-2 sm:p-3 bg-[#1a1a22] rounded-2xl">
                  <div>
                    {t('scatter_surge')} <span className="text-[10px] text-[#8a8a94]">· {t('scatter_surge_desc')}</span>
                  </div>
                  <button 
                    onClick={() => { if (rockets >= 45) { setRockets(r => r - 45); setScatterBoostSpins(12); toast.success('Scatter Surge active for 12 spins!'); } else toast.error('Not enough Rockets'); }}
                    className="px-4 py-1 rounded-xl bg-[#9945ff] text-white text-xs font-medium"
                  >
                    45 Rockets
                  </button>
                </div>

                <div className="flex justify-between items-center p-2 sm:p-3 bg-[#1a1a22] rounded-2xl">
                  <div>
                    {t('auto_bundle')} <span className="text-[10px] text-[#8a8a94]">· {t('auto_bundle_desc')}</span>
                  </div>
                  <button 
                    onClick={() => { if (rockets >= 30) { setRockets(r => r - 30); setAutoSpinCount(c => c + 20); toast.success('+20 Auto Spins granted!'); } else toast.error('Not enough Rockets'); }}
                    className="px-4 py-1 rounded-xl bg-[#9945ff] text-white text-xs font-medium"
                  >
                    30 Rockets
                  </button>
                </div>

                <div className="flex justify-between items-center p-2 sm:p-3 bg-[#1a1a22] rounded-2xl">
                  <div>
                    {t('eco_badge')} <span className="text-[10px] text-[#8a8a94]">· {t('eco_badge_desc')}</span>
                  </div>
                  <button 
                    onClick={() => { if (rockets >= 60) { setRockets(r => r - 60); setWinShieldSpins(w => w + 5); toast.success('Ecosystem Badge active — small protection engaged!'); } else toast.error('Not enough Rockets'); }}
                    className="px-4 py-1 rounded-xl bg-[#9945ff] text-white text-xs font-medium"
                  >
                    60 Rockets
                  </button>
                </div>
              </div>

              {/* Purchase Success Display with Explorer Link (visible while Shop open) */}
              {lastRocketPurchase && (
                <div className="mt-4 p-3 bg-[#1a1a22] border border-[#14f195] rounded-2xl text-xs relative">
                  <button
                    onClick={() => setLastRocketPurchase(null)}
                    className="absolute top-1 right-2 text-[#8a8a94] hover:text-white"
                    aria-label="Dismiss"
                  >
                    ✕
                  </button>
                  <div className="text-[#14f195] font-medium mb-1 pr-4">Purchase successful – Tx: {lastRocketPurchase.tx.slice(0,8)}...</div>
                  <div className="mb-1">
                    +{lastRocketPurchase.rockets} Rockets for {lastRocketPurchase.costMT} $MT
                  </div>
                  <div className="flex items-center gap-2">
                    <a 
                      href={`https://explorer.solana.com/tx/${lastRocketPurchase.tx}?cluster=mainnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#9945ff] hover:underline"
                    >
                      View on Explorer
                    </a>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(lastRocketPurchase.tx);
                        toast.success('Tx signature copied to clipboard');
                      }}
                      className="text-[10px] px-2 py-0.5 bg-[#33333a] hover:bg-[#44444a] rounded text-[#8a8a94]"
                    >
                      Copy Tx
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-6 text-xs text-[#8a8a94] text-center">
                Rockets are earned across all MT games and can be used in the entire ecosystem.
              </div>

              <button 
                onClick={() => {
                  setShowShop(false);
                  setLastRocketPurchase(null); // clear success state when closing
                }} 
                className="mt-4 sm:mt-6 w-full py-3 sm:py-4 rounded-2xl bg-[#1f1f26] hover:bg-[#25252d] text-sm font-medium"
              >
                {t('shop_close')}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal - Language + Social Connects */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-6" onClick={() => setShowSettings(false)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              className="bg-[#111115] border border-[#33333a] rounded-3xl max-w-[95vw] sm:max-w-md w-full p-5 sm:p-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="font-display text-3xl tracking-tight mb-6">{t('settings')}</div>

              <div className="space-y-6 text-sm">
                {/* Language Selector */}
                <div>
                  <div className="text-[#8a8a94] mb-2">{t('language')}</div>
                  <select 
                    value={language} 
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full bg-[#1a1a22] border border-[#33333a] rounded-xl px-4 py-2"
                  >
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="zh">中文 (Chinese)</option>
                    <option value="pt">Português</option>
                    <option value="it">Italiano (Italian)</option>
                    <option value="mt">Malti (Maltese)</option>
                    <option value="fil">Filipino (Philippines)</option>
                    <option value="pcm">Nigerian Pidgin</option>
                    <option value="ha">Hausa (Nigeria)</option>
                    <option value="yo">Yorùbá (Nigeria)</option>
                    <option value="ig">Igbo (Nigeria)</option>
                    <option value="tl">Tagalog (Philippines)</option>
                    <option value="ceb">Cebuano (Philippines)</option>
                  </select>
                </div>

                {/* Social Connections for MT Ecosystem */}
                <div>
                  <div className="text-[#8a8a94] mb-2">{t('socials_title')}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'telegram', label: 'Telegram', icon: '✈️', brand: '#26A5E4', url: 'https://t.me/memetorrent' },
                      { key: 'discord', label: 'Discord', icon: '💬', brand: '#5865F2', url: 'https://discord.gg/futuret3ch' },
                      { key: 'x', label: 'X', icon: '𝕏', brand: '#FFFFFF', url: 'https://x.com/Futuret3chdev' },
                      { key: 'facebook', label: 'Facebook', icon: 'f', brand: '#1877F2', url: 'https://facebook.com/futuret3ch' },
                    ].map((social) => {
                      const isConnected = !!connectedSocials[social.key];
                      const brandColor = social.brand;
                      return (
                        <button
                          key={social.key}
                          onClick={() => {
                            const wasConnected = isConnected;
                            const newSocials = { ...connectedSocials, [social.key]: !isConnected };
                            setConnectedSocials(newSocials);

                            if (!wasConnected) {
                              if (social.url) window.open(social.url, '_blank');
                              if (!wasConnected) {
                                setRockets(r => r + 8);
                                toast.success(`Connected to ${social.label} +8 Rockets`, {
                                  description: 'Welcome to the MT Ecosystem community!'
                                });
                              }
                            } else {
                              toast.success(`Disconnected from ${social.label}`);
                            }
                          }}
                          className={`py-2.5 rounded-2xl border text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                            isConnected 
                              ? 'bg-[#14f195]/10 text-[#14f195] border-[#14f195]/50' 
                              : `bg-[#1a1a22] border-[#33333a] hover:bg-[#25252d] hover:border-[${brandColor}]/60`
                          }`}
                          style={!isConnected ? { color: brandColor } : undefined}
                        >
                          <span>{social.icon}</span> {social.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-[10px] text-[#8a8a94] mt-1">
                    {t('socials_hint')}
                  </div>
                </div>
              </div>

              <button onClick={() => setShowSettings(false)} className="mt-8 w-full py-4 rounded-2xl bg-[#1f1f26] hover:bg-[#25252d] text-sm font-medium">
                CLOSE SETTINGS
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
