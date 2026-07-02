import React, { useState, useEffect, useRef } from 'react'
import { 
  Play, Square, Trash2, Plus, X, UploadCloud, Database, Scissors, 
  LogOut, Lock, User, Terminal, Server, ShieldCheck, CheckCircle2, AlertCircle,
  Menu, Download, Copy, ChevronDown, Check
} from 'lucide-react'
import { PixelAvatar, AvatarCustomizer, AVATAR_TEMPLATES } from './PixelAvatars'
// Types based on the Go backend API
interface Card {
  cc: string
  mm: string
  yy: string
  cvv: string
  formatted: string
}

interface CheckResult {
  status: string
  msg: string
  emoji: string
  price: string
  gateway: string
  site: string
  receipt_id: string
  time: string
  card: string
  timestamp?: string
  bin_brand?: string
  bin_type?: string
  bin_class?: string
  bin_bank?: string
  bin_country?: string
}

interface Stats {
  sites_count: number
  proxies_count: number
  api_url: string
  bot_username?: string
}

interface DBInfo {
  db_status: string
  db_url: string
  sites: string[]
  proxies: string[]
}

interface Toast {
  id: number
  message: string
  type: 'ok' | 'err'
}

const validateLuhn = (cc: string): boolean => {
  let sum = 0
  let shouldDouble = false
  for (let i = cc.length - 1; i >= 0; i--) {
    let digit = parseInt(cc.charAt(i), 10)
    if (isNaN(digit)) return false
    if (shouldDouble) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    shouldDouble = !shouldDouble
  }
  return sum % 10 === 0
}

const validateExpiry = (mmStr: string, yyStr: string): boolean => {
  const mm = parseInt(mmStr, 10)
  let yy = parseInt(yyStr, 10)
  if (isNaN(mm) || isNaN(yy) || mm < 1 || mm > 12) {
    return false
  }
  
  if (yyStr.length === 2) {
    yy += 2000
  } else if (yyStr.length === 4) {
    // keep yy
  } else {
    return false
  }
  
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  
  if (yy < currentYear) {
    return false
  }
  if (yy === currentYear && mm < currentMonth) {
    return false
  }
  return true
}

interface CleanResult {
  cleanedText: string
  validCards: Card[]
  invalidCount: number
  expiredCount: number
  luhnCount: number
  formatCount: number
}

const cleanCardsList = (text: string): CleanResult => {
  const lines = text.split('\n')
  const validCards: Card[] = []
  let invalidCount = 0
  let expiredCount = 0
  let luhnCount = 0
  let formatCount = 0
  
  const cardReg1 = /(\d{13,19})\s*[|/]\s*(\d{1,2})\s*[|/]\s*(\d{2,4})\s*[|/]\s*(\d{3,4})/
  const cardReg2 = /(\d{13,19})\s+(\d{1,2})\s+(\d{2,4})\s+(\d{3,4})/
  
  const cleanedLines: string[] = []
  
  for (let line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine) continue
    
    let match = trimmedLine.replace(/\s+/g, ' ').match(cardReg1)
    if (!match) {
      match = trimmedLine.replace(/\s+/g, ' ').match(cardReg2)
    }
    
    if (match) {
      const cc = match[1]
      const mm = match[2].padStart(2, '0')
      const yyRaw = match[3]
      const yy = yyRaw.slice(-2)
      const cvv = match[4]
      
      const isLuhnValid = validateLuhn(cc)
      const isExpValid = validateExpiry(mm, yyRaw)
      
      if (!isLuhnValid) {
        luhnCount++
        invalidCount++
      } else if (!isExpValid) {
        expiredCount++
        invalidCount++
      } else {
        const cardObj = {
          cc,
          mm,
          yy,
          formatted: `${cc}|${mm}|${yyRaw}|${cvv}`
        }
        validCards.push({
          ...cardObj,
          cvv
        })
        cleanedLines.push(`${cc}|${mm}|${yyRaw}|${cvv}`)
      }
    } else {
      formatCount++
      invalidCount++
    }
  }
  
  return {
    cleanedText: cleanedLines.join('\n'),
    validCards,
    invalidCount,
    expiredCount,
    luhnCount,
    formatCount
  }
}

const Logo = ({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg', className?: string }) => {
  const textSvgStyles = {
    sm: 'h-[16px] w-[61px]',
    md: 'h-[20px] w-[76px]',
    lg: 'h-[28px] w-[106px]'
  }

  return (
    <div className={`flex items-center gap-2 select-none ${className}`}>
      {/* Text Logotype: Custom SVG Stencil letters matching MIMO */}
      <div className="flex items-center gap-2">
        <svg className={`text-white ${textSvgStyles[size]}`} viewBox="0 0 182 48" fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round">
          {/* M */}
          <path d="M 10 40 L 10 8" />
          <path d="M 18 19 L 26 30 L 42 8 L 42 40" strokeLinejoin="round" />
          
          {/* L */}
          <path d="M 62 8 L 62 40 L 82 40" strokeLinejoin="round" />
          
          {/* S */}
          <path d="M 120 9 L 102 9 L 102 23 L 110 23" strokeLinejoin="round" />
          <path d="M 112 25 L 120 25 L 120 39 L 102 39" strokeLinejoin="round" />
          
          {/* N */}
          <path d="M 140 40 L 140 8" />
          <path d="M 148 16 L 172 40 L 172 8" strokeLinejoin="round" />
        </svg>
        
        <span className={`font-tech font-light text-cyan-400 ${size === 'lg' ? 'text-xl' : size === 'md' ? 'text-sm' : 'text-xs'}`}>//</span>
        <span className={`font-tech font-medium text-slate-400 ${size === 'lg' ? 'text-lg tracking-widest' : size === 'md' ? 'text-xs tracking-wider' : 'text-[10px] tracking-wide'}`}>ENGINE</span>
      </div>
    </div>
  )
}

function VisualAnalytics({ results, counters, cpmHistory }: { 
  results: CheckResult[], 
  counters: any, 
  cpmHistory: { time: string, cpm: number }[] 
}) {
  const total = (counters.charged || 0) + (counters.live || 0) + (counters.fraud || 0) + (counters.dead || 0) + (counters.otp || 0) + (counters.low || 0) + (counters.err || 0);
  
  const segments = [
    { label: 'CHARGED', count: counters.charged || 0, color: '#10b981' },
    { label: 'LIVE', count: counters.live || 0, color: '#06b6d4' },
    { label: 'FRAUD', count: counters.fraud || 0, color: '#f97316' },
    { label: 'DEAD', count: counters.dead || 0, color: '#f43f5e' },
    { label: '3DS', count: counters.otp || 0, color: '#60a5fa' },
    { label: 'LOW BAL', count: counters.low || 0, color: '#a855f7' },
    { label: 'ERROR', count: counters.err || 0, color: '#f59e0b' }
  ];

  let accumulatedPercent = 0;

  // Render line chart for CPM speed
  const maxCpm = Math.max(...cpmHistory.map(h => h.cpm), 10);
  const linePoints = cpmHistory.map((h, i) => {
    const x = 40 + (i * (240 / Math.max(cpmHistory.length - 1, 1)));
    const y = 130 - ((h.cpm / maxCpm) * 110);
    return `${x},${y}`;
  });
  
  const linePath = linePoints.length > 0 ? `M ${linePoints.join(' L ')}` : '';
  const fillPath = linePoints.length > 0 ? `${linePath} L ${40 + ((cpmHistory.length - 1) * (240 / Math.max(cpmHistory.length - 1, 1)))},130 L 40,130 Z` : '';

  // Render bar chart for Latency
  const siteStatsMap: { [site: string]: { totalTime: number, count: number } } = {};
  results.forEach(r => {
    if (!r.site) return;
    const t = parseFloat(r.time);
    if (isNaN(t)) return;
    if (!siteStatsMap[r.site]) {
      siteStatsMap[r.site] = { totalTime: 0, count: 0 };
    }
    siteStatsMap[r.site].totalTime += t;
    siteStatsMap[r.site].count += 1;
  });

  const siteStats = Object.keys(siteStatsMap).map(site => {
    const cleanName = site.replace('https://', '').replace('.myshopify.com', '').split('/')[0];
    return {
      site: cleanName,
      avgLatency: siteStatsMap[site].totalTime / siteStatsMap[site].count
    };
  }).sort((a, b) => a.avgLatency - b.avgLatency).slice(0, 5);

  const maxLatency = Math.max(...siteStats.map(s => s.avgLatency), 2.0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-4 md:p-6 bg-slate-950/20 text-slate-200 rounded-b-2xl font-tech">
      <div className="double-bezel-card glow-cyan min-h-[220px]">
        <div className="double-bezel-inner flex flex-col items-center justify-between !p-4">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 self-start flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" /> RESULT DISTRIBUTION
          </div>
          
          {total === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-slate-600 text-[10px] italic">
              <svg className="w-24 h-24 text-slate-800" viewBox="0 0 200 200">
                <circle cx="100" cy="100" r="50" fill="transparent" stroke="currentColor" strokeWidth="10" strokeDasharray="314.16" />
              </svg>
              <span className="mt-2">// Waiting for card check results</span>
            </div>
          ) : (
            <div className="flex items-center justify-center w-full gap-4 flex-wrap md:flex-nowrap">
              <svg className="w-32 h-32 drop-shadow-[0_0_8px_rgba(6,182,212,0.15)]" viewBox="0 0 200 200">
                <circle cx="100" cy="100" r="50" fill="transparent" stroke="#0f172a" strokeWidth="15" />
                {segments.map((s, idx) => {
                  const percent = s.count / total;
                  const dasharray = `${percent * 314.16} 314.16`;
                  const dashoffset = -accumulatedPercent * 314.16;
                  accumulatedPercent += percent;
                  return (
                    <circle
                      key={idx}
                      cx="100"
                      cy="100"
                      r="50"
                      fill="transparent"
                      stroke={s.color}
                      strokeWidth="15"
                      strokeDasharray={dasharray}
                      strokeDashoffset={dashoffset}
                      transform="rotate(-90 100 100)"
                      className="transition-all duration-500"
                    />
                  );
                })}
                <text x="100" y="95" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="bold" letterSpacing="1">TOTAL</text>
                <text x="100" y="115" textAnchor="middle" fill="#ffffff" fontSize="16" fontWeight="bold">{total}</text>
              </svg>
              
              <div className="flex flex-col gap-1.5 text-[9px] font-bold text-slate-400 min-w-[100px]">
                {segments.map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      <span>{s.label}</span>
                    </div>
                    <span className="text-white">{s.count} ({Math.round(s.count/total*100)}%)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="double-bezel-card glow-purple min-h-[220px]">
        <div className="double-bezel-inner flex flex-col justify-between !p-4">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" /> SPEED (CARDS / MINUTE)
          </div>

          {cpmHistory.length < 2 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-600 text-[10px] italic">
              // Chart initializing (sampling CPM speed every 5s)...
            </div>
          ) : (
            <div className="w-full h-full flex flex-col">
              <svg className="w-full h-32" viewBox="0 0 300 150">
                <defs>
                  <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <line x1="40" y1="20" x2="280" y2="20" stroke="#1e293b" strokeDasharray="3 3" />
                <line x1="40" y1="75" x2="280" y2="75" stroke="#1e293b" strokeDasharray="3 3" />
                <line x1="40" y1="130" x2="280" y2="130" stroke="#334155" />
                
                {fillPath && <path d={fillPath} fill="url(#lineGrad)" />}
                {linePath && <path d={linePath} fill="transparent" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
                
                <text x="35" y="23" textAnchor="end" fill="#64748b" fontSize="8" fontWeight="bold">{Math.round(maxCpm)}</text>
                <text x="35" y="78" textAnchor="end" fill="#64748b" fontSize="8" fontWeight="bold">{Math.round(maxCpm/2)}</text>
                <text x="35" y="133" textAnchor="end" fill="#64748b" fontSize="8" fontWeight="bold">0</text>
                
                <text x="280" y="15" textAnchor="end" fill="#06b6d4" fontSize="9" fontWeight="bold">
                  CPM: {cpmHistory[cpmHistory.length - 1].cpm}
                </text>
              </svg>
              <div className="flex justify-between px-10 text-[7.5px] text-slate-500 font-bold">
                <span>{cpmHistory[0].time}</span>
                <span>Timeline (5s ticks)</span>
                <span>{cpmHistory[cpmHistory.length - 1].time}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="double-bezel-card glow-emerald min-h-[220px]">
        <div className="double-bezel-inner flex flex-col justify-between !p-4">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" /> GATEWAY LATENCY (SEC)
          </div>

          {siteStats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-600 text-[10px] italic">
              // No latency data collected yet
            </div>
          ) : (
            <div className="w-full h-full flex flex-col">
              <svg className="w-full h-32" viewBox="0 0 300 150">
                <line x1="50" y1="120" x2="280" y2="120" stroke="#334155" />
                {siteStats.map((s, idx) => {
                  const w = 220 / siteStats.length;
                  const x = 60 + idx * w;
                  const h = (s.avgLatency / maxLatency) * 90;
                  const barHeight = Math.max(h, 5);
                  const barWidth = Math.min(w - 15, 25);
                  
                  return (
                    <g key={idx}>
                      <rect
                        x={x + (w - barWidth)/2}
                        y={120 - barHeight}
                        width={barWidth}
                        height={barHeight}
                        fill="#22d3ee"
                        opacity="0.15"
                        rx="3"
                        filter="blur(4px)"
                      />
                      <rect
                        x={x + (w - barWidth)/2}
                        y={120 - barHeight}
                        width={barWidth}
                        height={barHeight}
                        fill="url(#barGrad)"
                        rx="3"
                      />
                      <text
                        x={x + (w/2)}
                        y={115 - barHeight}
                        textAnchor="middle"
                        fill="#22d3ee"
                        fontSize="7.5"
                        fontWeight="bold"
                      >
                        {s.avgLatency.toFixed(2)}s
                      </text>
                      <text
                        x={x + (w/2)}
                        y="135"
                        textAnchor="middle"
                        fill="#64748b"
                        fontSize="7.5"
                        fontWeight="bold"
                      >
                        {s.site.length > 8 ? s.site.slice(0, 7) + '..' : s.site}
                      </text>
                    </g>
                  );
                })}
                <defs>
                  <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  // Mobile performance mode
  const [mobileMode, setMobileMode] = useState<'standard' | 'lite'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mlsn_mobile_mode')
      if (saved === 'standard' || saved === 'lite') {
        return saved
      }
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      return isMobile ? 'lite' : 'standard'
    }
    return 'standard'
  })

  const handleMobileModeChange = (newMode: 'standard' | 'lite') => {
    setMobileMode(newMode)
    localStorage.setItem('mlsn_mobile_mode', newMode)
  }

  useEffect(() => {
    if (mobileMode === 'lite') {
      document.body.classList.add('mode-lite')
    } else {
      document.body.classList.remove('mode-lite')
    }
  }, [mobileMode])

  // Navigation & Auth
  const [tab, setTab] = useState<'checker' | 'admin' | 'login'>(() => {
    if (typeof window !== 'undefined') {
      if (window.location.pathname === '/vanlinh') return 'admin'
      if (window.location.pathname === '/login') return 'login'
    }
    return 'login'
  })
  const [user, setUser] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  // Login form
  const [adminUsername, setAdminUsername] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [mockUsername, setMockUsername] = useState('')
  const [activeLoginTab, setActiveLoginTab] = useState<'telegram' | 'admin'>('telegram')

  // Stats & Configs
  const [statsData, setStatsData] = useState<Stats>({ sites_count: 0, proxies_count: 0, api_url: '-' })
  const [apiOnline, setApiOnline] = useState(true)
  const [concurrency, setConcurrency] = useState(1000)
  const [cardInput, setCardInput] = useState('')
  const [mode, setMode] = useState<'sac' | 'msac'>('sac')
  const [userProxies, setUserProxies] = useState<string[]>([])
  const [gateway, setGateway] = useState<'shopify' | 'payflow'>('shopify')
  const [isGatewayDropdownOpen, setIsGatewayDropdownOpen] = useState(false)
  
  // Checking State
  const [isRunning, setIsRunning] = useState(false)
  const [progressPct, setProgressPct] = useState(0)
  const [progressStatus, setProgressStatus] = useState('PREPARING ENVIRONMENT...')
  const [progressText, setProgressText] = useState('0 / 0 CHECKED (0%)')
  
  // Console Results & Filters
  const [results, setResults] = useState<CheckResult[]>([])
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [counters, setCounters] = useState({
    all: 0, charged: 0, live: 0, fraud: 0, dead: 0, otp: 0, low: 0, err: 0
  })

  // Visual Analytics & Proxy Testing States
  const [isTestingProxies, setIsTestingProxies] = useState(false)
  const [consoleTab, setConsoleTab] = useState<'log' | 'analytics'>('log')
  const [cpmHistory, setCpmHistory] = useState<{ time: string, cpm: number }[]>([])
  const lastCheckedCountRef = useRef(0)

  const [customAvatarIndex, setCustomAvatarIndex] = useState<number | null>(null)
  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false)

  const loadCustomAvatar = (username: string) => {
    try {
      const stored = localStorage.getItem(`mlsn_avatar_${username}`)
      if (stored !== null) {
        setCustomAvatarIndex(parseInt(stored))
      } else {
        setCustomAvatarIndex(null)
      }
    } catch (e) {
      setCustomAvatarIndex(null)
    }
  }

  useEffect(() => {
    if (user) {
      loadCustomAvatar(user)
    }
  }, [user])

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const dropdown = document.getElementById('gateway-selector')
      if (dropdown && !dropdown.contains(e.target as Node)) {
        setIsGatewayDropdownOpen(false)
      }
    }
    document.addEventListener('click', handleOutsideClick)
    return () => document.removeEventListener('click', handleOutsideClick)
  }, [])

  useEffect(() => {
    if (!isRunning) {
      lastCheckedCountRef.current = 0
      return
    }

    lastCheckedCountRef.current = results.length
    setCpmHistory([{ time: new Date().toTimeString().split(' ')[0], cpm: 0 }])

    const interval = setInterval(() => {
      setResults(currentResults => {
        const count = currentResults.length
        const diff = count - lastCheckedCountRef.current
        const cpm = Math.max(diff * 12, 0)
        lastCheckedCountRef.current = count

        setCpmHistory(prev => {
          const timestamp = new Date().toTimeString().split(' ')[0]
          const next = [...prev, { time: timestamp, cpm }]
          if (next.length > 20) {
            return next.slice(1)
          }
          return next
        })

        return currentResults
      })
    }, 5000)

    return () => clearInterval(interval)
  }, [isRunning])

  // Admin DB info state
  const [dbInfo, setDBInfo] = useState<DBInfo | null>(null)
  const [adminAddSiteInput, setAdminAddSiteInput] = useState('')
  const [adminAddProxyInput, setAdminAddProxyInput] = useState('')

  // Toasts UI
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastIdRef = useRef(0)

  // Drag and drop state
  const [dragOver, setDragOver] = useState(false)
  const [uploadedFileName, setUploadedFileName] = useState('')
  const [uploadedFileContent, setUploadedFileContent] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const consoleEndRef = useRef<HTMLDivElement>(null)
  const consoleContainerRef = useRef<HTMLDivElement>(null)

  // Core checking execution logic (batch queue)


  // Run on startup
  useEffect(() => {
    checkAuth()
    loadLocalProxies()

    const checkActiveTask = async () => {
      try {
        const res = await fetch('/api/tasks/active')
        if (res.ok) {
          const data = await res.json()
          if (data.active && data.task) {
            const task = data.task
            const taskResults = task.results || []
            setResults(taskResults)
            setCounters({
              all: task.total_cards,
              charged: taskResults.filter((r: any) => r.status === 'CHARGED').length,
              live: taskResults.filter((r: any) => r.status === 'LIVE').length,
              fraud: taskResults.filter((r: any) => r.status === 'FRAUD').length,
              dead: taskResults.filter((r: any) => r.status === 'DEAD').length,
              otp: taskResults.filter((r: any) => r.status === 'OTP_REQUIRED').length,
              low: taskResults.filter((r: any) => r.status === 'LOW_BALANCE').length,
              err: taskResults.filter((r: any) => ['ERROR', 'TIMEOUT', 'EXCEPTION'].includes(r.status)).length
            })
            const pct = Math.round((task.checked_cards / task.total_cards) * 100)
            setProgressPct(pct)
            setProgressText(`${task.checked_cards} / ${task.total_cards} CHECKED (${pct}%)`)

            if (task.status === 'running') {
              pollTask(task.id)
            } else {
              setCurrentTaskId(task.id)
              setProgressStatus(task.status === 'completed' ? 'DONE' : task.status === 'cancelled' ? 'TERMINATED' : 'FAILED')
            }
          }
        }
      } catch (err) {}
    }

    const timer = setTimeout(checkActiveTask, 500)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [])

  // Auto scroll console to bottom
  useEffect(() => {
    if (isRunning && consoleContainerRef.current) {
      const container = consoleContainerRef.current
      const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150
      if (isAtBottom) {
        container.scrollTop = container.scrollHeight
      }
    }
  }, [results, isRunning])

  const showToast = (message: string, type: 'ok' | 'err' = 'ok') => {
    const id = toastIdRef.current++
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }

  const loadLocalProxies = () => {
    try {
      const stored = localStorage.getItem('mlsn_user_proxies')
      if (stored) {
        setUserProxies(JSON.parse(stored))
      }
    } catch (e) {
      setUserProxies([])
    }
  }

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/stats')
      if (res.ok) {
        const data = await res.json()
        setStatsData(data)
        setApiOnline(true)
        
        if (data.authenticated) {
          const dbRes = await fetch('/api/admin/db_info')
          if (dbRes.ok) {
            setIsAdmin(true)
            setUser(data.user || "vanlinhcute")
            if (window.location.pathname === '/vanlinh') {
              setTab("admin")
            } else {
              setTab("checker")
            }
          } else {
            setIsAdmin(false)
            setUser(data.user || "User")
            setTab("checker")
          }
        } else {
          setTab("login")
        }
      } else {
        setTab("login")
      }
    } catch (e) {
      setApiOnline(false)
      setTab("login")
    }
  }

  const fetchSites = async () => {
    try {
      const res = await fetch('/api/stats')
      if (res.ok) {
        const d = await res.json()
        setStatsData(d)
      }
    } catch (e) {}
  }

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/login/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: adminUsername, password: adminPassword })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setUser("vanlinhcute")
        setIsAdmin(true)
        setTab("checker")
        showToast("Logged in as Admin")
        fetchSites()
      } else {
        showToast(data.error || "Login failed", "err")
      }
    } catch (err) {
      showToast("Server connection error", "err")
    }
  }

  const handleMockLogin = async () => {
    const uname = mockUsername.trim()
    if (!uname) {
      showToast("Please enter a username", "err")
      return
    }
    try {
      const res = await fetch('/api/login/mock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: uname })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setUser(uname)
        if (uname === "vanlinhcute") {
          setIsAdmin(true)
        }
        setTab("checker")
        showToast(`Logged in as ${uname}`)
        fetchSites()
      } else {
        showToast(data.error || "Login failed", "err")
      }
    } catch (err) {
      showToast("Server connection error", "err")
    }
  }

  const handleLogout = async () => {
    await fetch('/logout')
    setUser(null)
    setIsAdmin(false)
    setTab("login")
    showToast("Logged out successfully")
  }

  // Parse CC strings
  const parseCardsString = (text: string): Card[] => {
    const cards: Card[] = []
    const lines = text.split('\n')
    const cardReg1 = /(\d{13,19})\s*[|/]\s*(\d{1,2})\s*[|/]\s*(\d{2,4})\s*[|/]\s*(\d{3,4})/
    const cardReg2 = /(\d{13,19})\s+(\d{1,2})\s+(\d{2,4})\s+(\d{3,4})/

    for (let line of lines) {
      line = line.trim()
      if (!line) continue
      line = line.replace(/\s+/g, ' ')
      
      let match = line.match(cardReg1)
      if (match) {
        const mm = match[2].padStart(2, '0')
        cards.push({
          cc: match[1],
          mm: mm,
          yy: match[3].slice(-2),
          cvv: match[4],
          formatted: `${match[1]}|${mm}|${match[3]}|${match[4]}`
        })
        continue
      }
      
      match = line.match(cardReg2)
      if (match) {
        const mm = match[2].padStart(2, '0')
        cards.push({
          cc: match[1],
          mm: mm,
          yy: match[3].slice(-2),
          cvv: match[4],
          formatted: `${match[1]}|${mm}|${match[3]}|${match[4]}`
        })
      }
    }
    return cards
  }

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }
  const handleDragLeave = () => {
    setDragOver(false)
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0])
    }
  }
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0])
    }
  }

  const processFile = (file: File) => {
    setUploadedFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      if (e.target && typeof e.target.result === 'string') {
        setUploadedFileContent(e.target.result)
        showToast(`File ${file.name} loaded successfully`)
      }
    }
    reader.readAsText(file)
  }

  const [currentTaskId, setCurrentTaskId] = useState<number | null>(null)
  const taskIdRef = useRef<number | null>(null)
  const pollIntervalRef = useRef<any>(null)

  const stopChecking = async () => {
    if (!isRunning || !taskIdRef.current) return
    showToast("Stopping checker...", "err")
    try {
      await fetch(`/api/tasks/cancel?id=${taskIdRef.current}`, {
        method: 'POST'
      })
    } catch (e) {
      console.error(e)
    }
  }

  const wsRef = useRef<WebSocket | null>(null)

  const connectWebSocket = (taskId: number) => {
    if (wsRef.current) {
      wsRef.current.close()
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }

    taskIdRef.current = taskId
    setCurrentTaskId(taskId)
    setIsRunning(true)
    setProgressStatus('CHECKING CARDS...')

    const loc = window.location
    const wsProto = loc.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${wsProto}//${loc.host}/api/ws`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.task_id !== taskId) return

        if (msg.type === 'card_checked') {
          const res = msg.result
          const timestamp = new Date().toTimeString().split(' ')[0]
          res.timestamp = timestamp

          setResults(prev => {
            const nextResults = [...prev, res]
            
            const charged = nextResults.filter(r => r.status === 'CHARGED').length
            const live = nextResults.filter(r => r.status === 'LIVE').length
            const fraud = nextResults.filter(r => r.status === 'FRAUD').length
            const dead = nextResults.filter(r => r.status === 'DEAD').length
            const otp = nextResults.filter(r => r.status === 'OTP_REQUIRED').length
            const low = nextResults.filter(r => r.status === 'LOW_BALANCE').length
            const err = nextResults.filter(r => ['ERROR', 'TIMEOUT', 'EXCEPTION'].includes(r.status)).length

            setCounters({
              all: msg.total_cards,
              charged,
              live,
              fraud,
              dead,
              otp,
              low,
              err
            })

            const pct = Math.round((msg.checked_cards / msg.total_cards) * 100)
            setProgressPct(pct)
            setProgressText(`${msg.checked_cards} / ${msg.total_cards} CHECKED (${pct}%)`)

            return nextResults
          })

        } else if (msg.type === 'task_status') {
          const status = msg.status
          if (status === 'completed') {
            setProgressStatus('DONE')
            setIsRunning(false)
            showToast('Checking completed successfully')
            ws.close()
          } else if (status === 'cancelled') {
            setProgressStatus('TERMINATED')
            setIsRunning(false)
            showToast('Checking stopped manually', 'err')
            ws.close()
          } else if (status === 'failed') {
            setProgressStatus('FAILED')
            setIsRunning(false)
            showToast('Checking task failed', 'err')
            ws.close()
          }
        }
      } catch (err) {
        console.error("WebSocket message error:", err)
      }
    }

    ws.onclose = () => {
      console.log('WebSocket connection closed. Checking fallback...')
      setTimeout(() => {
        setIsRunning(currentRunning => {
          if (currentRunning) {
            console.log('Falling back to polling for task:', taskId)
            pollTaskFallback(taskId)
          }
          return currentRunning
        })
      }, 1000)
    }

    ws.onerror = (err) => {
      console.error('WebSocket error:', err)
      ws.close()
    }
  }

  const pollTaskFallback = (taskId: number) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }
    taskIdRef.current = taskId
    setCurrentTaskId(taskId)
    setIsRunning(true)

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/tasks/details?id=${taskId}`)
        if (!res.ok) {
          throw new Error('Failed to fetch task details')
        }
        const data = await res.json()
        
        const taskResults = data.results || []
        const timestamp = new Date().toTimeString().split(' ')[0]
        taskResults.forEach((r: any) => {
          if (!r.timestamp) r.timestamp = timestamp
        })

        setResults(taskResults)

        const currentStats = {
          all: data.total_cards,
          charged: taskResults.filter((r: any) => r.status === 'CHARGED').length,
          live: taskResults.filter((r: any) => r.status === 'LIVE').length,
          fraud: taskResults.filter((r: any) => r.status === 'FRAUD').length,
          dead: taskResults.filter((r: any) => r.status === 'DEAD').length,
          otp: taskResults.filter((r: any) => r.status === 'OTP_REQUIRED').length,
          low: taskResults.filter((r: any) => r.status === 'LOW_BALANCE').length,
          err: taskResults.filter((r: any) => ['ERROR', 'TIMEOUT', 'EXCEPTION'].includes(r.status)).length
        }
        setCounters(currentStats)

        const pct = Math.round((data.checked_cards / data.total_cards) * 100)
        setProgressPct(pct)
        setProgressText(`${data.checked_cards} / ${data.total_cards} CHECKED (${pct}%)`)
        
        if (data.status === 'running') {
          setProgressStatus('CHECKING CARDS...')
        } else if (data.status === 'completed') {
          setProgressStatus('DONE')
          setIsRunning(false)
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          showToast('Checking completed successfully')
        } else if (data.status === 'cancelled') {
          setProgressStatus('TERMINATED')
          setIsRunning(false)
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          showToast('Checking stopped manually', 'err')
        } else if (data.status === 'failed') {
          setProgressStatus('FAILED')
          setIsRunning(false)
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          showToast('Checking task failed', 'err')
        }
      } catch (err: any) {
        console.error(err)
      }
    }, 1500)
  }

  const pollTask = (taskId: number) => {
    connectWebSocket(taskId)
  }

  const handleTestProxies = async () => {
    if (isTestingProxies) return
    setIsTestingProxies(true)
    showToast("Starting proxy testing...", "ok")
    try {
      const res = await fetch("/api/proxies/test", {
        method: "POST"
      })
      if (!res.ok) {
        throw new Error("Proxy testing failed")
      }
      const data = await res.json()
      if (data.success) {
        const results = data.results || []
        const total = results.length
        const alive = results.filter((p: any) => p.status === "alive").length
        const dead = total - alive
        showToast(`Test complete: ${alive}/${total} alive, ${dead} dead proxies.`, alive > 0 ? "ok" : "err")
        
        if (userProxies.length > 0) {
          const aliveProxies = results.filter((p: any) => p.status === "alive").map((p: any) => p.proxy)
          setUserProxies(aliveProxies)
          localStorage.setItem('mlsn_user_proxies', JSON.stringify(aliveProxies))
        }
        
        fetchSites()
        fetchDBInfo()
      } else {
        throw new Error(data.message || "Failed to test proxies")
      }
    } catch (err: any) {
      showToast(err.message || "Error testing proxies", "err")
    } finally {
      setIsTestingProxies(false)
    }
  }

  // Smart Card Splitter States
  const [splitFile, setSplitFile] = useState<File | null>(null)
  const [splitMode, setSplitMode] = useState<'cards' | 'size'>('cards')
  const [splitValue, setSplitValue] = useState<number>(5000)
  const [splitResults, setSplitResults] = useState<{
    name: string
    content: string
    cardCount: number
    sizeBytes: number
  }[]>([])
  const [splitDragOver, setSplitDragOver] = useState(false)

  const handleSplitFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setSplitDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSplitFile(e.dataTransfer.files[0])
      setSplitResults([])
    }
  }

  const handleSplitFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSplitFile(e.target.files[0])
      setSplitResults([])
    }
  }

  const handleExecuteSplit = () => {
    if (!splitFile) {
      showToast("Please load a file first", "err")
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      if (!text) {
        showToast("Empty file content", "err")
        return
      }

      const lines = text.split(/\r?\n/)
      const validLines = lines.filter(l => l.trim() !== '')

      if (validLines.length === 0) {
        showToast("No text lines found in file", "err")
        return
      }

      const results: { name: string; content: string; cardCount: number; sizeBytes: number }[] = []
      const baseName = splitFile.name.replace(/\.[^/.]+$/, "")

      if (splitMode === 'cards') {
        const chunkSize = splitValue <= 0 ? 5000 : splitValue
        let partIdx = 1
        for (let i = 0; i < validLines.length; i += chunkSize) {
          const chunk = validLines.slice(i, i + chunkSize)
          const content = chunk.join('\n')
          const byteSize = new Blob([content]).size
          results.push({
            name: `${baseName}_part_${partIdx}.txt`,
            content: content,
            cardCount: chunk.length,
            sizeBytes: byteSize
          })
          partIdx++
        }
      } else {
        const maxBytes = (splitValue <= 0 ? 500 : splitValue) * 1024
        let partIdx = 1
        let currentChunk: string[] = []
        let currentBytes = 0

        for (let i = 0; i < validLines.length; i++) {
          const line = validLines[i]
          const lineBytes = new Blob([line + '\n']).size
          
          if (currentChunk.length > 0 && currentBytes + lineBytes > maxBytes) {
            const content = currentChunk.join('\n')
            results.push({
              name: `${baseName}_part_${partIdx}.txt`,
              content: content,
              cardCount: currentChunk.length,
              sizeBytes: new Blob([content]).size
            })
            partIdx++
            currentChunk = [line]
            currentBytes = lineBytes
          } else {
            currentChunk.push(line)
            currentBytes += lineBytes
          }
        }

        if (currentChunk.length > 0) {
          const content = currentChunk.join('\n')
          results.push({
            name: `${baseName}_part_${partIdx}.txt`,
            content: content,
            cardCount: currentChunk.length,
            sizeBytes: new Blob([content]).size
          })
        }
      }

      setSplitResults(results)
      showToast(`Successfully split into ${results.length} files`)
    }
    reader.readAsText(splitFile)
  }

  const handleDownloadPart = (part: typeof splitResults[0]) => {
    const blob = new Blob([part.content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = part.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleCheckPart = (part: typeof splitResults[0]) => {
    runChecker(part.content)
  }

  const handleCleanInputCards = () => {
    let rawText = ''
    if (uploadedFileContent) {
      rawText = uploadedFileContent
    } else {
      rawText = cardInput.trim()
    }
    
    if (!rawText) {
      showToast("No cards input to clean!", "err")
      return
    }
    
    const cleanRes = cleanCardsList(rawText)
    
    if (cleanRes.invalidCount === 0) {
      showToast("All cards are valid!", "ok")
      // Reformat
      if (uploadedFileContent) {
        setUploadedFileContent(cleanRes.cleanedText)
      } else {
        setCardInput(cleanRes.cleanedText)
      }
      return
    }
    
    const parts = []
    if (cleanRes.formatCount > 0) parts.push(`${cleanRes.formatCount} invalid format`)
    if (cleanRes.expiredCount > 0) parts.push(`${cleanRes.expiredCount} expired/invalid date`)
    if (cleanRes.luhnCount > 0) parts.push(`${cleanRes.luhnCount} invalid Luhn`)
    const detailsStr = parts.join(', ')
    
    showToast(`Cleaned! Removed ${cleanRes.invalidCount} invalid cards: ${detailsStr}`, 'err')
    
    if (uploadedFileContent) {
      setUploadedFileContent(cleanRes.cleanedText)
    } else {
      setCardInput(cleanRes.cleanedText)
    }
  }

  const runChecker = async (overrideContent?: string) => {
    if (isRunning) return
    
    let rawText = ''
    if (overrideContent !== undefined) {
      rawText = overrideContent
      setCardInput(overrideContent)
      setUploadedFileName('')
      setUploadedFileContent('')
    } else if (uploadedFileContent) {
      rawText = uploadedFileContent
    } else {
      rawText = cardInput.trim()
    }

    if (!rawText) {
      showToast("Input buffer empty", "err")
      return
    }

    // Scan and automatically remove invalid, expired, or failed Luhn cards
    const cleanRes = cleanCardsList(rawText)
    const cleanedText = cleanRes.cleanedText
    
    if (cleanRes.invalidCount > 0) {
      const parts = []
      if (cleanRes.formatCount > 0) parts.push(`${cleanRes.formatCount} invalid format`)
      if (cleanRes.expiredCount > 0) parts.push(`${cleanRes.expiredCount} expired/invalid date`)
      if (cleanRes.luhnCount > 0) parts.push(`${cleanRes.luhnCount} invalid Luhn`)
      const detailsStr = parts.join(', ')
      showToast(`Automatically removed ${cleanRes.invalidCount} invalid cards: ${detailsStr}`, 'err')
    }
    
    if (!cleanedText.trim()) {
      showToast("No valid cards found after cleaning filter!", "err")
      return
    }
    
    rawText = cleanedText
    
    // Update input states
    if (overrideContent !== undefined) {
      setCardInput(cleanedText)
    } else if (uploadedFileContent) {
      setUploadedFileContent(cleanedText)
    } else {
      setCardInput(cleanedText)
    }

    const cards = parseCardsString(rawText)
    if (cards.length === 0) {
      showToast("No valid card numbers identified", "err")
      return
    }

    setIsRunning(true)
    
    setResults([])
    setCounters({
      all: cards.length, charged: 0, live: 0, fraud: 0, dead: 0, otp: 0, low: 0, err: 0
    })
    setProgressPct(0)
    setProgressStatus('INITIALIZING TASK...')
    setProgressText(`0 / ${cards.length} CHECKED (0%)`)

    try {
      const res = await fetch('/api/check/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cards: rawText,
          concurrency: concurrency,
          proxies: userProxies,
          gateway: gateway
        })
      })

      if (!res.ok) {
        let errMsg = `Start request failed with status ${res.status}`
        try {
          const errData = await res.json()
          if (errData && errData.error) {
            errMsg = errData.error
          }
        } catch (_) {}
        throw new Error(errMsg)
      }

      const data = await res.json()
      if (data.success && data.task_id) {
        pollTask(data.task_id)
        showToast('Checking task started successfully')
      } else {
        throw new Error(data.error || 'Failed to start checking task')
      }

    } catch (err: any) {
      showToast(err.message, "err")
      setIsRunning(false)
    }

    setCardInput('')
    setUploadedFileName('')
    setUploadedFileContent('')
  }

  // Data Pools uploading
  const handleSiteListUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const fd = new FormData()
      fd.append('file', e.target.files[0])
      try {
        const res = await fetch('/api/sites/upload', {
          method: 'POST',
          body: fd
        })
        const data = await res.json()
        if (res.ok) {
          showToast(`Successfully uploaded ${data.loaded} sites`)
          fetchSites()
        } else {
          showToast(data.error || "Upload failed", "err")
        }
      } catch (e) {
        showToast("Site list sync error", "err")
      }
    }
  }

  const handleProxyListUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader()
      reader.onload = (event) => {
        if (event.target && typeof event.target.result === 'string') {
          const lines = event.target.result.split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0)
          
          const uniqueProxies = Array.from(new Set(lines))
          setUserProxies(uniqueProxies)
          localStorage.setItem('mlsn_user_proxies', JSON.stringify(uniqueProxies))
          showToast(`Loaded ${uniqueProxies.length} private proxies`)
        }
      }
      reader.readAsText(e.target.files[0])
    }
  }

  const clearSitesPool = async () => {
    await fetch('/api/sites/clear', { method: 'POST' })
    showToast("Sites pool reset complete")
    fetchSites()
  }

  const clearProxiesPool = () => {
    setUserProxies([])
    localStorage.removeItem('mlsn_user_proxies')
    showToast("Private proxies reset complete")
  }

  // Admin DB info handlers
  const fetchDBInfo = async () => {
    if (!isAdmin) return
    try {
      const res = await fetch('/api/admin/db_info')
      if (res.ok) {
        const data = await res.json()
        setDBInfo(data)
      }
    } catch (e) {}
  }

  useEffect(() => {
    if (tab === 'admin') {
      fetchDBInfo()
    }
  }, [tab])

  const handleAdminAddSite = async (e: React.FormEvent) => {
    e.preventDefault()
    const url = adminAddSiteInput.trim()
    if (!url) return
    try {
      const res = await fetch('/api/admin/site/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })
      if (res.ok) {
        showToast("Site added successfully")
        setAdminAddSiteInput('')
        fetchDBInfo()
        fetchSites()
      }
    } catch (err) {}
  }

  const handleAdminDeleteSite = async (url: string) => {
    try {
      const res = await fetch('/api/admin/site/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })
      if (res.ok) {
        showToast("Site deleted successfully")
        fetchDBInfo()
        fetchSites()
      }
    } catch (err) {}
  }

  const handleAdminAddProxy = async (e: React.FormEvent) => {
    e.preventDefault()
    const proxy = adminAddProxyInput.trim()
    if (!proxy) return
    try {
      const res = await fetch('/api/admin/proxy/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxy })
      })
      if (res.ok) {
        showToast("Proxy added successfully")
        setAdminAddProxyInput('')
        fetchDBInfo()
      }
    } catch (err) {}
  }

  const handleAdminDeleteProxy = async (proxy: string) => {
    try {
      const res = await fetch('/api/admin/proxy/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxy })
      })
      if (res.ok) {
        showToast("Proxy deleted successfully")
        fetchDBInfo()
      }
    } catch (err) {}
  }

  const clearResults = async () => {
    if (isRunning) {
      showToast("Engine is busy running", "err")
      return
    }

    if (currentTaskId) {
      try {
        const res = await fetch(`/api/tasks/clear?id=${currentTaskId}`, {
          method: 'POST'
        })
        if (res.ok) {
          showToast("Task history deleted from server.")
          setCurrentTaskId(null)
          taskIdRef.current = null
        }
      } catch (e) {
        console.error("Failed to delete task history:", e)
      }
    }

    setResults([])
    setCounters({
      all: 0, charged: 0, live: 0, fraud: 0, dead: 0, otp: 0, low: 0, err: 0
    })
    setProgressPct(0)
    setProgressText('0 / 0 CHECKED (0%)')
    setProgressStatus('PREPARING ENVIRONMENT...')
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      showToast(`Copied card: ${text.slice(0, 16)}...`)
    }).catch(err => {
      console.error('Failed to copy to clipboard:', err)
      showToast("Failed to copy to clipboard", "err")
    })
  }

  const copyAllCardsByStatus = (status: string) => {
    // If status is a category, we map matching records:
    let filtered = results
    if (status === 'CHARGED') {
      filtered = results.filter(r => r.status === 'CHARGED')
    } else if (status === 'LIVE') {
      filtered = results.filter(r => r.status === 'LIVE')
    } else if (status === 'OTP_REQUIRED') {
      filtered = results.filter(r => r.status === 'OTP_REQUIRED')
    } else if (status === 'LOW_BALANCE') {
      filtered = results.filter(r => r.status === 'LOW_BALANCE')
    } else if (status === 'ALL_SUCCESS') {
      // All successful (non-error, non-declined, non-fraud)
      filtered = results.filter(r => ['CHARGED', 'LIVE', 'OTP_REQUIRED', 'LOW_BALANCE'].includes(r.status))
    }

    const cardsText = filtered.map(r => r.card).join('\n')
    if (!cardsText) {
      showToast("No cards to copy for this status.", "err")
      return
    }

    navigator.clipboard.writeText(cardsText).then(() => {
      showToast(`Copied ${filtered.length} cards to clipboard!`)
    }).catch(err => {
      console.error('Failed to copy cards:', err)
      showToast("Failed to copy cards", "err")
    })
  }

  const filterR = (f: string | null) => {
    setActiveFilter(f)
  }

  // Filter logs logic
  const filteredResults = activeFilter ? results.filter(r => {
    if (activeFilter === 'ERR') return ['ERROR', 'TIMEOUT', 'EXCEPTION'].includes(r.status)
    return r.status === activeFilter
  }) : results

  const hasProxy = userProxies.length > 0 || statsData.proxies_count > 0

  return (
    <div className="min-h-screen bg-transparent text-slate-200 flex flex-col md:flex-row selection:bg-cyan-500/30 selection:text-cyan-300 relative overflow-x-hidden">
      {/* Background Gradients */}
      {mobileMode !== 'lite' && (
        <>
          <div className="bg-grid-animation" />
          <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-cyan-500/5 blur-[160px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 left-1/4 w-[600px] h-[600px] bg-purple-500/5 blur-[160px] rounded-full pointer-events-none" />
        </>
      )}
      {mobileMode === 'lite' && (
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.005)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
      )}

      {/* Toast Notifications */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div 
            key={t.id} 
            className={`pointer-events-auto w-80 px-4 py-3 bg-slate-900 border border-slate-800/80 border-l-4 rounded-xl shadow-2xl flex items-center gap-3 font-mono text-xs animate-slide-up ${
              t.type === 'err' ? 'border-l-red-500 text-red-200' : 'border-l-cyan-500 text-cyan-200'
            }`}
          >
            {t.type === 'err' ? (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
            )}
            <span className="text-slate-200 truncate">{t.message}</span>
          </div>
        ))}
      </div>

      {/* Left Sidebar (Navigation Island) */}
      {user && (
        <>
          {/* Mobile Sticky Header */}
          <div className={`flex md:hidden items-center justify-between px-5 py-3.5 border-b border-slate-900/60 sticky top-0 z-30 w-full shrink-0 ${
            mobileMode === 'lite' ? 'bg-slate-950/95' : 'bg-slate-955/85 backdrop-blur-md'
          }`}>
            <Logo size="sm" />
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 font-tech text-[10px] text-slate-400">
                <span className={`w-1.5 h-1.5 rounded-full ${apiOnline ? 'bg-cyan-400 shadow-[0_0_6px_#00ffd1]' : 'bg-red-505'}`} />
                <span>API</span>
              </div>
              <button 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-1.5 bg-slate-900 border border-slate-800 text-slate-300 rounded-lg hover:text-white transition-all focus:outline-none"
              >
                <Menu className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mobile Sidebar Overlay */}
          {sidebarOpen && (
            <div 
              onClick={() => setSidebarOpen(false)}
              className={`fixed inset-0 bg-slate-955/70 z-40 md:hidden animate-fade-in ${
                mobileMode === 'lite' ? '' : 'backdrop-blur-sm'
              }`}
            />
          )}

          {/* Sidebar Drawer Container */}
          <aside className={`
            fixed top-0 bottom-0 left-0 z-50 md:z-30 w-72 
            md:sticky md:top-6 md:h-[calc(100vh-3rem)] md:my-6 md:ml-6
            transition-transform duration-300 ease-out
            flex flex-col glass-panel rounded-r-2xl md:rounded-2xl border-r border-y md:border-x border-slate-900/80 p-5 shrink-0
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          `}>
            {/* Header: Logo */}
            <div className="flex items-center justify-between pb-5 border-b border-slate-900/60 mb-6 shrink-0">
              <div className="flex flex-col">
                <Logo size="md" />
                <span className="font-tech text-[8px] text-slate-500 uppercase tracking-widest mt-2 ml-1">WEB ENGINE CLIENT v0.1.220511</span>
              </div>
              
              <button 
                onClick={() => setSidebarOpen(false)}
                className="md:hidden p-1.5 bg-slate-955 border border-slate-900 rounded-lg hover:text-red-400 transition-all text-slate-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Navigation Tabs (Vertical List) */}
            <nav className="flex-1 flex flex-col gap-1.5 relative select-none">
              {/* Tab: CHECKER */}
              <button 
                onClick={() => { 
                  setTab('checker'); 
                  window.history.pushState({}, '', '/');
                  setSidebarOpen(false);
                }} 
                className={`w-full px-4 py-3.5 rounded-xl font-tech text-[10px] font-bold transition-all duration-300 flex items-center gap-3 border relative overflow-hidden group ${
                  tab === 'checker' 
                    ? 'bg-white/10 border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.04)]' 
                    : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 hover:border-slate-900/40'
                }`}
              >
                {/* Active Indicator Glow Pip */}
                {tab === 'checker' && <span className="absolute left-0 top-3 bottom-3 w-1 bg-white rounded-r-md" />}
                <Terminal className="w-4 h-4 text-slate-200 group-hover:scale-110 transition-transform" />
                <span>RUNNER CHECKER</span>
              </button>

              {/* Tab: DATABASE (Admin Only) */}
              {isAdmin && (
                <button 
                  onClick={() => { 
                    setTab('admin'); 
                    window.history.pushState({}, '', '/vanlinh'); 
                    setSidebarOpen(false);
                  }} 
                  className={`w-full px-4 py-3.5 rounded-xl font-tech text-[10px] font-bold transition-all duration-300 flex items-center gap-3 border relative overflow-hidden group ${
                    tab === 'admin' 
                      ? 'bg-white/10 border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.04)]' 
                      : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 hover:border-slate-900/40'
                  }`}
                >
                  {tab === 'admin' && <span className="absolute left-0 top-3 bottom-3 w-1 bg-white rounded-r-md" />}
                  <Database className="w-4 h-4 text-slate-200 group-hover:scale-110 transition-transform" />
                  <span>DATABASE POOLS</span>
                </button>
              )}
            </nav>

            {/* Sidebar Footer: Real-time Stats & User details */}
            <div className="mt-auto pt-5 border-t border-slate-900/60 flex flex-col gap-4 shrink-0 font-mono">
              {/* Stats Indicators inside Sidebar */}
              <div className="flex flex-col gap-2 bg-slate-950/50 rounded-xl p-3 border border-slate-900/50 text-[10px]">
                <div className="flex items-center justify-between text-slate-400 border-b border-slate-900/30 pb-1.5 mb-1.5">
                  <span className="uppercase tracking-wider text-[8px] font-bold text-slate-500">System Monitors</span>
                  <span className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${apiOnline ? 'bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
                    <span className={apiOnline ? 'text-emerald-400' : 'text-red-400'}>{apiOnline ? 'ONLINE' : 'OFFLINE'}</span>
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-slate-505">DATABASE SITES:</span>
                  <span className="text-slate-200 font-bold">{statsData.sites_count}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-slate-505">ACTIVE PROXIES:</span>
                  <span className="text-slate-200 font-bold">
                    {userProxies.length > 0 ? userProxies.length : statsData.proxies_count}
                  </span>
                </div>
              </div>

              {/* User Session card */}
              <div className="flex items-center justify-between bg-slate-900/30 border border-slate-905/40 rounded-xl p-2.5">
                <div className="flex items-center gap-2 overflow-hidden">
                  <div 
                    onClick={() => setIsCustomizerOpen(true)}
                    className="cursor-pointer transition-all hover:scale-105 active:scale-95 group relative select-none shrink-0"
                    title="Click to customize avatar"
                  >
                    <PixelAvatar 
                      username={user || "guest"} 
                      size={28} 
                      customIndex={customAvatarIndex !== null ? customAvatarIndex : undefined} 
                    />
                    <div className="absolute inset-0 bg-cyan-500/30 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center transition-opacity">
                      <span className="text-[6.5px] text-white font-bold uppercase tracking-wider bg-slate-950/85 px-1 py-0.5 rounded border border-cyan-500/40 scale-75">
                        EDIT
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-[10px] text-slate-250 font-bold truncate uppercase">{user}</span>
                    <span className="text-[8px] text-slate-500 truncate">{isAdmin ? 'ADMIN' : 'USER'}</span>
                  </div>
                </div>

                <button 
                  onClick={handleLogout}
                  className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-950/20 border border-transparent hover:border-red-950/40 rounded-lg transition-all"
                  title="Logout current session"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* Main View Area */}
      <main className={`flex-1 p-4 md:p-6 flex flex-col min-w-0 ${user ? 'w-full' : 'max-w-md w-full mx-auto my-auto py-12'}`}>
        
        {/* Mobile Performance Toggle (Only on Mobile) */}
        <div className="block md:hidden bg-slate-950/60 border border-slate-900/60 rounded-xl p-2.5 mb-4 shadow-lg backdrop-blur-none shrink-0 select-none">
          <div className="flex items-center justify-between">
            <div className="flex flex-col pl-1">
              <span className="font-tech text-[9.5px] font-bold text-white tracking-wider">MOBILE PERFORMANCE</span>
              <span className="text-[8px] text-slate-500 font-mono">
                {mobileMode === 'lite' ? 'Lite Mode: Optimized & Smooth' : 'Standard Mode: Glass UI Effects'}
              </span>
            </div>
            <div className="flex bg-slate-955 border border-slate-900/60 p-0.5 rounded-lg text-[9px] font-tech font-bold relative overflow-hidden w-36 h-6 items-center">
              <div 
                className={`absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-1px)] rounded-md bg-white/10 border border-white/20 transition-all duration-300 ${
                  mobileMode === 'standard' ? 'translate-x-0' : 'translate-x-full'
                }`} 
              />
              <button 
                type="button"
                onClick={() => handleMobileModeChange('standard')}
                className={`flex-1 h-full rounded-md z-10 transition-all text-center text-[9px] font-bold ${
                  mobileMode === 'standard' ? 'text-white' : 'text-slate-500'
                }`}
              >
                STD
              </button>
              <button 
                type="button"
                onClick={() => handleMobileModeChange('lite')}
                className={`flex-1 h-full rounded-md z-10 transition-all text-center text-[9px] font-bold ${
                  mobileMode === 'lite' ? 'text-cyan-400' : 'text-slate-500'
                }`}
              >
                LITE
              </button>
            </div>
          </div>
        </div>
        
        {/* Tab: LOGIN */}
        {tab === 'login' && (
          <div className="w-full flex flex-col gap-6 animate-slide-up">
            <div className="text-center flex flex-col gap-2.5 items-center">
              <Logo size="lg" className="justify-center" />
              <p className="text-[9.5px] tracking-wider text-slate-400 font-tech mt-1 uppercase">AUTHENTICATION REQUIRED</p>
            </div>

            <div className={`double-bezel-card ${activeLoginTab === 'telegram' ? 'glow-cyan' : 'glow-purple'}`}>
              <div className="double-bezel-inner flex flex-col gap-6">
                {/* Tab selector */}
                <div className="grid grid-cols-2 bg-slate-950/85 p-1.5 rounded-xl border border-slate-900 text-[10px] font-tech font-bold relative overflow-hidden select-none">
                  <div 
                    className={`absolute top-1.5 bottom-1.5 left-1.5 w-[calc(50%-6px)] rounded-lg transition-all duration-300 ease-out-back ${
                      activeLoginTab === 'telegram' 
                        ? 'bg-cyan-500/10 border border-cyan-500/20 translate-x-0' 
                        : 'bg-purple-500/10 border border-purple-500/20 translate-x-full'
                    }`} 
                  />
                  
                  <button 
                    type="button"
                    onClick={() => setActiveLoginTab('telegram')}
                    className={`py-2 rounded-lg z-10 transition-all text-center ${
                      activeLoginTab === 'telegram' ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-405'
                    }`}
                  >
                    TELEGRAM ACCESS
                  </button>
                  <button 
                    type="button"
                    onClick={() => setActiveLoginTab('admin')}
                    className={`py-2 rounded-lg z-10 transition-all text-center ${
                      activeLoginTab === 'admin' ? 'text-purple-400' : 'text-slate-500 hover:text-slate-455'
                    }`}
                  >
                    ADMIN PORTAL
                  </button>
                </div>

                {activeLoginTab === 'telegram' ? (
                  statsData.bot_username ? (
                    <div className="flex flex-col gap-4 font-mono text-center">
                      <div className="border border-cyan-500/10 bg-cyan-950/10 rounded-xl p-4 text-xs text-cyan-400 flex flex-col gap-3 text-left">
                        <div className="flex items-center gap-2 font-bold text-white">
                          <Server className="w-4 h-4 text-cyan-400" /> TELEGRAM BOT SYSTEM ACTIVE
                        </div>
                        <p className="text-slate-300 text-[11px] leading-relaxed">
                          To log in securely, message your Telegram bot and send the <code className="text-cyan-300 bg-cyan-950/40 px-1 py-0.5 rounded">/login</code> or <code className="text-cyan-300 bg-cyan-950/40 px-1 py-0.5 rounded">/start</code> command. The bot will send you a secure button to log in here.
                        </p>
                      </div>
                      
                      <a 
                        href={`https://t.me/${statsData.bot_username}?start=login`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-955 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all hover:shadow-[0_0_15px_rgba(6,182,212,0.3)] text-center no-underline cursor-pointer active:scale-95 duration-200"
                      >
                        <Terminal className="w-4 h-4" /> START LOGIN SECURELY
                      </a>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4 font-mono">
                      <div className="border border-yellow-500/15 bg-yellow-500/5 rounded-xl p-3 text-[10px] text-yellow-400/80 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                        <span>Using mock login as fallback since Telegram Widget is restricted to static hostname bindings in this environment.</span>
                      </div>
                      
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Telegram Username</label>
                        <div className="relative">
                          <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-505" />
                          <input 
                            type="text" 
                            placeholder="@yourusername"
                            value={mockUsername}
                            onChange={(e) => setMockUsername(e.target.value)}
                            className="w-full tech-input rounded-xl px-3 py-3 pl-10 text-sm text-slate-200 outline-none placeholder:text-slate-650"
                          />
                        </div>
                      </div>
                      
                      <button 
                        onClick={handleMockLogin}
                        className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-955 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all hover:shadow-[0_0_15px_rgba(6,182,212,0.3)] active:scale-95 duration-200"
                      >
                        <Terminal className="w-4 h-4" /> LOG IN VIA TELEGRAM
                      </button>
                    </div>
                  )
                ) : (
                  <form onSubmit={handleAdminLogin} className="flex flex-col gap-4 font-mono">
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="admin-username" className="text-[10px] uppercase tracking-wider text-slate-550 font-bold cursor-pointer">Admin Username</label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-505" />
                        <input 
                          id="admin-username"
                          name="username"
                          autoComplete="username"
                          spellCheck={false}
                          type="text" 
                          placeholder="Username…"
                          value={adminUsername}
                          onChange={(e) => setAdminUsername(e.target.value)}
                          className="w-full tech-input rounded-xl px-3 py-3 pl-10 text-sm text-slate-200 outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/30 placeholder:text-slate-650"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="admin-password" className="text-[10px] uppercase tracking-wider text-slate-555 font-bold cursor-pointer">Admin Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-505" />
                        <input 
                          id="admin-password"
                          name="password"
                          autoComplete="current-password"
                          type="password" 
                          placeholder="Password…"
                          value={adminPassword}
                          onChange={(e) => setAdminPassword(e.target.value)}
                          className="w-full tech-input rounded-xl px-3 py-3 pl-10 text-sm text-slate-200 outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/30 placeholder:text-slate-650"
                        />
                      </div>
                    </div>

                    <button 
                      type="submit"
                      className="w-full py-3 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all hover:shadow-[0_0_15px_rgba(168,85,247,0.3)] active:scale-95 duration-200"
                    >
                      <ShieldCheck className="w-4 h-4" /> AUTHORIZE ADMINISTRATIVE SESSION
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Tab: CHECKER */}
        {tab === 'checker' && (
          <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6 flex-1 tab-content-active">
            {/* Sidebar Controls */}
            <div className="flex flex-col gap-5">
              {/* Card Engine */}
              <div className="glass-panel glass-panel-glow-cyan rounded-2xl p-5 hover:border-slate-800/80 transition-all duration-300 flex flex-col gap-4">
                <div className="font-tech text-[10.5px] font-bold text-slate-400 tracking-wider flex justify-between">
                  <span>[01] CARD ENGINE</span>
                </div>
                
                {gateway === 'shopify' && (
                  <div className="flex gap-2.5 items-center select-none">
                    <div className="grid grid-cols-2 bg-slate-950 border border-slate-900 p-1 rounded-xl text-[9px] font-tech font-bold flex-1 relative overflow-hidden">
                      <div 
                        className={`absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-lg bg-white/10 border border-white/20 transition-all duration-300 ease-out-back ${
                          mode === 'sac' ? 'translate-x-0' : 'translate-x-full'
                        }`} 
                      />
                      
                      <button 
                        onClick={() => setMode('sac')}
                        className={`py-1.5 rounded-lg z-10 transition-all text-center cursor-pointer ${
                          mode === 'sac' ? 'text-white' : 'text-slate-500 hover:text-slate-400'
                        }`}
                      >
                        SAC SINGLE
                      </button>
                      <button 
                        onClick={() => setMode('msac')}
                        className={`py-1.5 rounded-lg z-10 transition-all text-center cursor-pointer ${
                          mode === 'msac' ? 'text-white' : 'text-slate-500 hover:text-slate-400'
                        }`}
                      >
                        MSAC MASS
                      </button>
                    </div>
                    
                    <div className="bg-slate-955/70 border border-slate-900 rounded-xl px-2.5 py-1.5 h-9 flex items-center justify-between gap-1.5 w-28 shrink-0 font-tech focus-within:border-white/25 transition-all">
                      <span className="text-[9px] text-slate-500 tracking-tight uppercase font-bold">LIMIT</span>
                      <input 
                        type="number" 
                        value={concurrency}
                        onChange={(e) => setConcurrency(parseInt(e.target.value) || 1000)}
                        min="1" 
                        max="2000"
                        className="bg-transparent border-none text-right outline-none text-white text-xs font-bold w-14"
                      />
                    </div>
                  </div>
                )}

                {/* Gateway Dropdown Selector */}
                <div className="relative mb-2.5 font-tech select-none" id="gateway-selector">
                  <span className="text-[9px] text-slate-505 uppercase tracking-wider block mb-1 font-bold">GATEWAY TARGET</span>
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => setIsGatewayDropdownOpen(!isGatewayDropdownOpen)}
                    className="w-full bg-slate-955/70 border border-slate-900 rounded-xl px-3.5 py-2 flex items-center justify-between text-[10.5px] text-slate-200 hover:border-white/20 focus:border-cyan-500/40 transition-all outline-none disabled:opacity-50 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${gateway === 'payflow' ? 'bg-purple-400 animate-pulse' : 'bg-cyan-400 animate-pulse'}`} />
                      <span className="font-bold tracking-wide">
                        {gateway === 'shopify' ? 'SHOPIFY PAYMENTS (MASS)' : 'PAYFLOW V2 (SINGLE CHECK)'}
                      </span>
                    </div>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-300 ${isGatewayDropdownOpen ? 'rotate-180 text-cyan-400' : ''}`} />
                  </button>

                  {/* Dropdown Menu */}
                  {isGatewayDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-slate-950/95 border border-slate-800/80 rounded-xl overflow-hidden shadow-2xl z-20 backdrop-blur-xl animate-slide-up">
                      <button
                        type="button"
                        onClick={() => {
                          setGateway('shopify')
                          setIsGatewayDropdownOpen(false)
                        }}
                        className={`w-full text-left px-3.5 py-2.5 text-[10px] font-bold hover:bg-cyan-950/20 hover:text-cyan-400 flex items-center justify-between border-b border-slate-900/60 transition-colors cursor-pointer ${
                          gateway === 'shopify' ? 'text-cyan-400 bg-cyan-950/10' : 'text-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-1 h-1 rounded-full bg-cyan-400" />
                          <span>SHOPIFY PAYMENTS (MASS)</span>
                        </div>
                        {gateway === 'shopify' && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setGateway('payflow')
                          setIsGatewayDropdownOpen(false)
                          setUploadedFileName('')
                          setUploadedFileContent('')
                          const cards = parseCardsString(cardInput)
                          if (cards.length > 1) {
                            setCardInput(cards[0].formatted)
                            showToast("Payflow V2 only supports single check. Keeping first card.", "err")
                          }
                        }}
                        className={`w-full text-left px-3.5 py-2.5 text-[10px] font-bold hover:bg-purple-955/20 hover:text-purple-400 flex items-center justify-between transition-colors cursor-pointer ${
                          gateway === 'payflow' ? 'text-purple-400 bg-purple-955/10' : 'text-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-1 h-1 rounded-full bg-purple-400" />
                          <span>PAYFLOW V2 (SINGLE CHECK)</span>
                        </div>
                        {gateway === 'payflow' && <Check className="w-3.5 h-3.5 text-purple-400" />}
                      </button>
                    </div>
                  )}
                </div>

                <textarea 
                  placeholder={gateway === 'payflow' ? "cc|mm|yy|cvv - Enter a single card (Proxy required)" : "cc|mm|yy|cvv\ncc/mm/yy/cvv\ncc mm yy cvv\n\nOne card per line"}
                  value={cardInput}
                  onChange={(e) => {
                    let val = e.target.value
                    if (gateway === 'payflow') {
                      const parsed = parseCardsString(val)
                      if (parsed.length > 1) {
                        showToast("Payflow V2 only supports single card checking!", "err")
                        val = parsed[0].formatted
                      }
                    }
                    setCardInput(val)
                    if (uploadedFileName) {
                      setUploadedFileName('')
                      setUploadedFileContent('')
                    }
                  }}
                  disabled={isRunning}
                  className="w-full h-36 bg-slate-955/20 border border-slate-900/60 rounded-xl p-3.5 font-mono text-[11px] text-slate-200 outline-none focus:border-white/30 resize-none transition-all placeholder:text-slate-600 disabled:opacity-50"
                />

                {gateway === 'payflow' && !hasProxy && (
                  <div className="text-[9.5px] text-red-400 font-tech font-semibold bg-red-950/20 border border-red-500/20 px-3 py-2 rounded-xl flex items-center gap-1.5 animate-pulse-glow">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-400" /> Proxy configuration required to check with Payflow V2!
                  </div>
                )}

                <div className="flex gap-2">
                  {!isRunning ? (
                    <>
                      <button 
                        onClick={() => {
                          if (gateway === 'payflow' && !hasProxy) {
                            showToast("Proxy configuration required to check with Payflow V2!", "err")
                            return
                          }
                          runChecker()
                        }}
                        disabled={gateway === 'payflow' && !hasProxy}
                        className={`font-tech text-xs font-bold py-3 rounded-xl flex-[2] flex items-center justify-center gap-1.5 transition-all duration-300 active:scale-[0.98] ${
                          gateway === 'payflow' && !hasProxy
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-900 opacity-40'
                            : 'bg-white hover:bg-slate-250 text-slate-950 hover:shadow-[0_0_20px_rgba(255,255,255,0.12)]'
                        }`}
                      >
                        <Play className="w-3.5 h-3.5 fill-current" /> RUN CHECKER
                      </button>
                      <button 
                        onClick={() => handleCleanInputCards()}
                        disabled={gateway === 'payflow'}
                        className={`font-tech text-xs font-bold py-3 rounded-xl flex-1 flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] duration-200 ${
                          gateway === 'payflow'
                            ? 'bg-slate-950 text-slate-700 border border-slate-900 cursor-not-allowed opacity-30'
                            : 'bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:border-slate-700 text-slate-300'
                        }`}
                        title="Clean and filter invalid, expired, or failed Luhn cards"
                      >
                        <Scissors className={`w-3.5 h-3.5 ${gateway === 'payflow' ? 'text-slate-700' : 'text-cyan-400'}`} /> CLEAN
                      </button>
                    </>
                  ) : (
                    <button 
                      onClick={stopChecking}
                      className="bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-400 font-tech text-xs font-bold py-3 rounded-xl flex-1 flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] duration-200"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" /> STOP CHECKING / CANCEL
                    </button>
                  )}
                </div>
              </div>

              {/* Bulk Source */}
              <div className={`glass-panel glass-panel-glow-cyan rounded-2xl p-5 hover:border-slate-800/80 transition-all duration-300 flex flex-col gap-4 ${gateway === 'payflow' ? 'opacity-40 pointer-events-none' : ''}`}>
                <div className="font-tech text-[10.5px] font-bold text-slate-400 tracking-wider">
                  <span>[02] BULK SOURCE</span>
                </div>
                
                <div 
                  onDragOver={gateway !== 'payflow' ? handleDragOver : undefined}
                  onDragLeave={gateway !== 'payflow' ? handleDragLeave : undefined}
                  onDrop={gateway !== 'payflow' ? handleDrop : undefined}
                  onClick={gateway !== 'payflow' ? () => document.getElementById('file-input')?.click() : undefined}
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition-all duration-300 bg-slate-955/40 ${
                    gateway === 'payflow'
                      ? 'border-red-950/20 bg-red-955/5 cursor-not-allowed'
                      : dragOver ? 'border-cyan-400 bg-cyan-500/10 shadow-[0_0_15px_rgba(6,182,212,0.1)] scale-[1.01] cursor-pointer' : 'border-slate-900 hover:border-cyan-500/30 hover:bg-slate-900/20 cursor-pointer'
                  }`}
                >
                  <UploadCloud className={`w-6 h-6 mx-auto mb-2 ${gateway === 'payflow' ? 'text-red-500/40' : 'text-slate-505'}`} />
                  <div className="font-tech text-[9.5px] font-bold text-slate-300">
                    {gateway === 'payflow' ? 'BULK UPLOAD DISABLED' : 'DRAG & DROP CARDS FILE'}
                  </div>
                  <span className="font-tech text-[8px] text-slate-500 mt-1 block">
                    {gateway === 'payflow' ? 'Payflow V2 only supports single card' : 'Plain text .txt / .csv list'}
                  </span>
                  {gateway !== 'payflow' && (
                    <input 
                      type="file" 
                      id="file-input" 
                      accept=".txt,.csv" 
                      className="hidden" 
                      onChange={handleFileChange}
                    />
                  )}
                </div>
                
                {uploadedFileName && (
                  <div className="font-tech text-[9px] font-bold text-cyan-400 flex items-center justify-between bg-cyan-950/30 border border-cyan-500/20 px-3.5 py-2 rounded-xl animate-slide-up">
                    <span>LOADED: <strong>{uploadedFileName.toUpperCase()}</strong></span>
                    <button 
                      onClick={() => {
                        setUploadedFileName('')
                        setUploadedFileContent('')
                      }}
                      className="text-slate-500 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Smart Card Splitter */}
              <div className={`double-bezel-card glow-cyan flex flex-col overflow-hidden font-tech transition-opacity duration-300 ${gateway === 'payflow' ? 'opacity-30 pointer-events-none' : ''}`}>
                <div className="double-bezel-inner flex flex-col gap-4">
                  <div className="text-[10.5px] font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" /> [03] SMART CARD SPLITTER
                  </div>

                  {/* Drag drop zone */}
                  <div 
                    onDragOver={(e) => { e.preventDefault(); setSplitDragOver(true); }}
                    onDragLeave={() => setSplitDragOver(false)}
                    onDrop={handleSplitFileDrop}
                    onClick={() => document.getElementById('split-file-input')?.click()}
                    className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-305 bg-slate-955/40 ${
                      splitDragOver ? 'border-cyan-400 bg-cyan-500/10 shadow-[0_0_15px_rgba(6,182,212,0.1)] scale-[1.01]' : 'border-slate-900 hover:border-cyan-500/30 hover:bg-slate-900/20'
                    }`}
                  >
                    <UploadCloud className="w-5 h-5 text-slate-505 mx-auto mb-1.5 animate-pulse" />
                    <div className="text-[9px] font-bold text-slate-300">
                      {splitFile ? `LOADED: ${splitFile.name.toUpperCase()}` : "DRAG & DROP FILE TO SPLIT"}
                    </div>
                    <span className="text-[7.5px] text-slate-505 mt-0.5 block">
                      {splitFile ? `${(splitFile.size / 1024).toFixed(1)} KB` : "Plain text .txt / .csv list"}
                    </span>
                    <input 
                      type="file" 
                      id="split-file-input" 
                      accept=".txt,.csv" 
                      className="hidden" 
                      onChange={handleSplitFileChange}
                    />
                  </div>

                  {splitFile && (
                    <>
                      {/* Split parameters */}
                      <div className="flex flex-col gap-3 p-3 bg-slate-950/60 rounded-xl border border-slate-900">
                        {/* Mode Selector */}
                        <div className="grid grid-cols-2 bg-slate-955 p-1 rounded-lg text-[8.5px] font-bold relative overflow-hidden select-none">
                          <div 
                            className={`absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded bg-white/10 border border-white/20 transition-all duration-300 ease-out-back ${
                              splitMode === 'cards' ? 'translate-x-0' : 'translate-x-full'
                            }`} 
                          />
                          <button 
                            type="button"
                            onClick={() => { setSplitMode('cards'); setSplitValue(5000); }}
                            className={`py-1 rounded z-10 text-center transition-all ${
                              splitMode === 'cards' ? 'text-white' : 'text-slate-505 hover:text-slate-300'
                            }`}
                          >
                            BY CARD COUNT
                          </button>
                          <button 
                            type="button"
                            onClick={() => { setSplitMode('size'); setSplitValue(500); }}
                            className={`py-1 rounded z-10 text-center transition-all ${
                              splitMode === 'size' ? 'text-white' : 'text-slate-505 hover:text-slate-300'
                            }`}
                          >
                            BY FILE SIZE
                          </button>
                        </div>

                        {/* Value Input */}
                        <div className="flex items-center justify-between gap-2 text-[9px] font-bold">
                          <span className="text-slate-400 uppercase">
                            {splitMode === 'cards' ? "CARDS PER PART" : "SIZE PER PART (KB)"}
                          </span>
                          <input 
                            type="number"
                            value={splitValue}
                            onChange={(e) => setSplitValue(parseInt(e.target.value) || 0)}
                            className="w-20 bg-slate-955 border border-slate-900 rounded px-2 py-1 text-right text-white font-bold outline-none focus:border-cyan-500/50"
                          />
                        </div>

                        <button 
                          onClick={handleExecuteSplit}
                          className="w-full py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-955 text-[9.5px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all hover:shadow-[0_0_10px_rgba(6,182,212,0.2)] active:scale-95 duration-200"
                        >
                          <Scissors className="w-3.5 h-3.5" /> EXECUTE SMART SPLIT
                        </button>
                      </div>

                      {/* Split Results */}
                      {splitResults.length > 0 && (
                        <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
                          <div className="text-[8px] text-slate-500 font-bold uppercase tracking-wider mb-1">
                            SPLIT PARTS ({splitResults.length})
                          </div>
                          {splitResults.map((part, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-slate-950/40 border border-slate-900/60 p-2.5 rounded-lg text-[9px] font-bold hover:border-slate-800 transition-all">
                              <div className="flex flex-col gap-0.5 max-w-[55%]">
                                <span className="text-slate-200 truncate">{part.name}</span>
                                <span className="text-[7.5px] text-slate-505">
                                  {part.cardCount.toLocaleString()} cards • {(part.sizeBytes / 1024).toFixed(1)} KB
                                </span>
                              </div>
                              <div className="flex gap-1.5 shrink-0">
                                <button 
                                  onClick={() => handleDownloadPart(part)}
                                  className="px-2 py-1 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded flex items-center gap-1 transition-all active:scale-95"
                                  title="Download Part"
                                >
                                  <Download className="w-3 h-3" />
                                </button>
                                <button 
                                  onClick={() => handleCheckPart(part)}
                                  className="px-2 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 hover:border-cyan-500/40 text-cyan-400 hover:text-cyan-300 rounded flex items-center gap-1 transition-all active:scale-95"
                                  title="Check Cards in this Part"
                                >
                                  <Play className="w-3 h-3 fill-current" /> CHECK
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Data Pools */}
              <div className="glass-panel glass-panel-glow-cyan rounded-2xl p-5 hover:border-slate-800/80 transition-all duration-300 flex flex-col gap-4">
                <div className="font-tech text-[10.5px] font-bold text-slate-400 tracking-wider">
                  <span>[04] DATA POOLS</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Sites pool */}
                  <div className="flex flex-col gap-2 font-tech">
                    <span className="text-[9px] uppercase tracking-wide text-slate-505 font-bold">SITES</span>
                    <div className="flex gap-1">
                      <label className="flex-1 py-2 bg-slate-950 hover:bg-slate-900 border border-slate-900 rounded-lg text-[8.5px] font-bold text-slate-350 cursor-pointer flex items-center justify-center gap-1 transition-all active:scale-[0.98]">
                        <Plus className="w-3 h-3" /> ADD
                        <input 
                          type="file" 
                          accept=".txt,.csv" 
                          className="hidden" 
                          onChange={handleSiteListUpload}
                        />
                      </label>
                      <button 
                        onClick={clearSitesPool}
                        className="py-2 px-2.5 bg-red-955/20 hover:bg-red-955/40 border border-red-955 text-red-400 rounded-lg text-[8.5px] font-bold flex items-center justify-center gap-1 transition-all active:scale-[0.98]"
                      >
                        <X className="w-3 h-3" /> CLR
                      </button>
                    </div>
                    <div className="bg-slate-950/20 border border-slate-900/60 rounded-xl p-3 text-[10px] text-slate-400 h-20 overflow-y-auto flex flex-col justify-center transition-all">
                      {statsData.sites_count > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="text-emerald-400 font-bold flex items-center gap-1 font-tech text-[9.5px]">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                            {statsData.sites_count} SYNCED
                          </div>
                          <span className="text-[8px] text-slate-500 font-tech">Database Pool</span>
                        </div>
                      ) : (
                        <div className="text-slate-600 italic text-center font-tech text-[9px]">EMPTY POOL</div>
                      )}
                    </div>
                  </div>

                  {/* Proxies pool */}
                  <div className="flex flex-col gap-2 font-tech">
                    <span className="text-[9px] uppercase tracking-wide text-slate-505 font-bold">PROXIES</span>
                    <div className="flex gap-1">
                      <label className="flex-1 py-2 bg-slate-950 hover:bg-slate-900 border border-slate-900 rounded-lg text-[8.5px] font-bold text-slate-350 cursor-pointer flex items-center justify-center gap-1 transition-all active:scale-[0.98]">
                        <Plus className="w-3 h-3" /> ADD
                        <input 
                          type="file" 
                          accept=".txt,.csv" 
                          className="hidden" 
                          onChange={handleProxyListUpload}
                        />
                      </label>
                      <button 
                        onClick={clearProxiesPool}
                        className="py-2 px-2.5 bg-red-955/20 hover:bg-red-955/40 border border-red-955 text-red-400 rounded-lg text-[8.5px] font-bold flex items-center justify-center gap-1 transition-all active:scale-[0.98]"
                      >
                        <X className="w-3 h-3" /> CLR
                      </button>
                    </div>
                    <button 
                      onClick={handleTestProxies}
                      disabled={isTestingProxies}
                      className="w-full py-1.5 bg-cyan-955/20 hover:bg-cyan-500/10 border border-cyan-950 hover:border-cyan-500/30 text-cyan-400 rounded-lg text-[8.5px] font-bold flex items-center justify-center gap-1 transition-all active:scale-[0.98] disabled:opacity-40"
                    >
                      {isTestingProxies ? "TESTING PROXIES..." : "TEST ALL PROXIES"}
                    </button>
                    <div className="bg-slate-950/20 border border-slate-900/60 rounded-xl p-3 text-[10px] text-slate-400 h-20 overflow-y-auto flex flex-col justify-center transition-all">
                      {userProxies.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="text-cyan-400 font-bold flex items-center gap-1 font-tech text-[9.5px]">
                            <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full" />
                            {userProxies.length} CUSTOM
                          </div>
                          <span className="text-[8px] text-slate-500 font-tech">Active Private List</span>
                        </div>
                      ) : statsData.proxies_count > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="text-emerald-400 font-bold flex items-center gap-1 font-tech text-[9.5px]">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                            {statsData.proxies_count} SYNCED
                          </div>
                          <span className="text-[8px] text-slate-500 font-tech">Database Pool</span>
                        </div>
                      ) : (
                        <div className="text-slate-600 italic text-center font-tech text-[9px]">0 ACTIVE (NO PROXY)</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Console Log Runner Panel */}
            <div className="double-bezel-card glow-cyan flex flex-col overflow-hidden">
              <div className="double-bezel-inner flex flex-col !p-0">
              <div className="px-5 py-4 bg-slate-950/80 border-b border-slate-900/80 flex justify-between items-center shrink-0">
                <div className="font-tech text-[10.5px] font-bold text-white tracking-wider flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-slate-400" /> RUNNER CONSOLE
                </div>
                <div className="flex gap-2">
                  {currentTaskId && !isRunning && (
                    <a 
                      href={`/api/tasks/download?id=${currentTaskId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-2 px-3 bg-cyan-950/20 hover:bg-cyan-500/10 border border-cyan-950/30 hover:border-cyan-500/30 text-cyan-400 rounded-lg font-tech text-[8.5px] font-bold flex items-center gap-1.5 transition-all no-underline"
                    >
                      <Download className="w-3.5 h-3.5" /> DOWNLOAD REPORT (24H)
                    </a>
                  )}
                  <button 
                    onClick={clearResults}
                    disabled={isRunning}
                    className="py-2 px-3 bg-red-950/5 hover:bg-red-500/10 border border-red-950/30 hover:border-red-500/30 disabled:opacity-30 disabled:pointer-events-none text-red-400/80 hover:text-red-400 rounded-lg font-tech text-[8.5px] font-bold flex items-center gap-1.5 transition-all active:scale-[0.98]"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> CLEAR LOGS
                  </button>
                </div>
              </div>

              {/* Concurrency Progress Indicator */}
              <div className={`px-5 py-4 bg-slate-955/30 border-b border-slate-900/80 shrink-0 transition-all duration-300 ${isRunning ? 'block' : 'hidden'}`}>
                <div className="flex justify-between items-center font-tech text-[9px] mb-2">
                  <span className="text-cyan-400 font-bold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                    {progressStatus}
                  </span>
                  <span className="text-slate-350 font-mono">{progressText}</span>
                </div>
                <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-900/85 p-[1px]">
                  <div 
                    className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.5)] transition-all duration-300 progress-animated"
                  style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {/* Tab Selector inside Runner Console */}
              <div className="flex bg-slate-950/40 border-b border-slate-900/60 font-tech text-[10px] font-bold shrink-0">
                <button
                  onClick={() => setConsoleTab('log')}
                  className={`px-5 py-3 border-r border-slate-900/60 transition-all flex items-center gap-1.5 outline-none ${
                    consoleTab === 'log' ? 'bg-slate-950/80 text-cyan-400 border-b-2 border-b-cyan-500' : 'text-slate-500 hover:text-slate-350'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" /> LIVE CONSOLE
                </button>
                <button
                  onClick={() => setConsoleTab('analytics')}
                  className={`px-5 py-3 border-r border-slate-900/60 transition-all flex items-center gap-1.5 outline-none ${
                    consoleTab === 'analytics' ? 'bg-slate-950/80 text-cyan-400 border-b-2 border-b-cyan-500' : 'text-slate-500 hover:text-slate-350'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" /> VISUAL ANALYTICS
                </button>
              </div>

              {consoleTab === 'log' ? (
                <>
                  {/* Filter Badges */}
                  <div className="px-5 py-3 bg-slate-955/50 border-b border-slate-900/80 flex gap-2 flex-wrap shrink-0 font-tech text-[9px] font-bold">
                <button 
                  onClick={() => filterR(null)}
                  className={`px-3 py-1.5 border rounded-lg flex items-center gap-1.5 transition-all duration-200 active:scale-95 ${
                    activeFilter === null 
                      ? 'bg-white/10 border-white/20 text-white shadow-[0_0_10px_rgba(255,255,255,0.04)]' 
                      : 'border-slate-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-800'
                  }`}
                >
                  ALL: <span className="font-bold">{counters.all}</span>
                </button>
                <button 
                  onClick={() => filterR('CHARGED')}
                  className={`px-3 py-1.5 border rounded-lg flex items-center gap-1.5 transition-all duration-200 active:scale-95 ${
                    activeFilter === 'CHARGED' 
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]' 
                      : 'border-slate-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-800'
                  }`}
                >
                  CHARGED: <span className="font-bold">{counters.charged}</span>
                  {counters.charged > 0 && (
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyAllCardsByStatus('CHARGED');
                      }}
                      className="ml-1 p-0.5 hover:bg-emerald-500/20 rounded transition-colors cursor-pointer border border-transparent focus-visible:border-emerald-500/30 outline-none"
                      title="Copy all CHARGED cards"
                      aria-label="Copy all CHARGED cards"
                    >
                      <Copy className="w-2.5 h-2.5" />
                    </button>
                  )}
                </button>
                <button 
                  onClick={() => filterR('LIVE')}
                  className={`px-3 py-1.5 border rounded-lg flex items-center gap-1.5 transition-all duration-200 active:scale-95 ${
                    activeFilter === 'LIVE' 
                      ? 'bg-cyan-500/10 border-cyan-500/35 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.1)]' 
                      : 'border-slate-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-800'
                  }`}
                >
                  LIVE: <span className="font-bold">{counters.live}</span>
                  {counters.live > 0 && (
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyAllCardsByStatus('LIVE');
                      }}
                      className="ml-1 p-0.5 hover:bg-cyan-500/20 rounded transition-colors cursor-pointer border border-transparent focus-visible:border-cyan-500/30 outline-none"
                      title="Copy all LIVE cards"
                      aria-label="Copy all LIVE cards"
                    >
                      <Copy className="w-2.5 h-2.5" />
                    </button>
                  )}
                </button>
                <button 
                  onClick={() => filterR('FRAUD')}
                  className={`px-3 py-1.5 border rounded-lg flex items-center gap-1.5 transition-all duration-200 active:scale-95 ${
                    activeFilter === 'FRAUD' 
                      ? 'bg-orange-500/10 border-orange-500/30 text-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.1)]' 
                      : 'border-slate-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-800'
                  }`}
                >
                  FRAUD: <span className="font-bold">{counters.fraud}</span>
                </button>
                <button 
                  onClick={() => filterR('DEAD')}
                  className={`px-3 py-1.5 border rounded-lg flex items-center gap-1.5 transition-all duration-200 active:scale-95 ${
                    activeFilter === 'DEAD' 
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.1)]' 
                      : 'border-slate-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-800'
                  }`}
                >
                  DEAD: <span className="font-bold">{counters.dead}</span>
                </button>
                <button 
                  onClick={() => filterR('OTP_REQUIRED')}
                  className={`px-3 py-1.5 border rounded-lg flex items-center gap-1.5 transition-all duration-200 active:scale-95 ${
                    activeFilter === 'OTP_REQUIRED' 
                      ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.1)]' 
                      : 'border-slate-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-800'
                  }`}
                >
                  3DS: <span className="font-bold">{counters.otp}</span>
                  {counters.otp > 0 && (
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyAllCardsByStatus('OTP_REQUIRED');
                      }}
                      className="ml-1 p-0.5 hover:bg-blue-500/20 rounded transition-colors cursor-pointer border border-transparent focus-visible:border-blue-500/30 outline-none"
                      title="Copy all 3DS cards"
                      aria-label="Copy all 3DS cards"
                    >
                      <Copy className="w-2.5 h-2.5" />
                    </button>
                  )}
                </button>
                <button 
                  onClick={() => filterR('LOW_BALANCE')}
                  className={`px-3 py-1.5 border rounded-lg flex items-center gap-1.5 transition-all duration-200 active:scale-95 ${
                    activeFilter === 'LOW_BALANCE' 
                      ? 'bg-purple-500/10 border-purple-500/30 text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.1)]' 
                      : 'border-slate-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-800'
                  }`}
                >
                  LOW: <span className="font-bold">{counters.low}</span>
                  {counters.low > 0 && (
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyAllCardsByStatus('LOW_BALANCE');
                      }}
                      className="ml-1 p-0.5 hover:bg-purple-500/20 rounded transition-colors cursor-pointer border border-transparent focus-visible:border-purple-500/30 outline-none"
                      title="Copy all LOW balance cards"
                      aria-label="Copy all LOW balance cards"
                    >
                      <Copy className="w-2.5 h-2.5" />
                    </button>
                  )}
                </button>
                <button 
                  onClick={() => filterR('ERR')}
                  className={`px-3 py-1.5 border rounded-lg flex items-center gap-1.5 transition-all duration-200 active:scale-95 ${
                    activeFilter === 'ERR' 
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-405 shadow-[0_0_10px_rgba(245,158,11,0.1)]' 
                      : 'border-slate-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-800'
                  }`}
                >
                  ERR: <span className="font-bold">{counters.err}</span>
                </button>

                {(counters.charged > 0 || counters.live > 0 || counters.otp > 0 || counters.low > 0) && (
                  <button 
                    onClick={() => copyAllCardsByStatus('ALL_SUCCESS')}
                    className="px-2.5 py-1 bg-cyan-950/20 hover:bg-cyan-500/15 border border-cyan-500/25 text-cyan-400 rounded-lg flex items-center gap-1 transition-all duration-200 active:scale-95 cursor-pointer ml-auto text-[8px]"
                    title="Copy all approved cards (Charged, Live, 3DS, Low)"
                  >
                    <Copy className="w-2.5 h-2.5" /> COPY ALL APPROVED
                  </button>
                )}
              </div>

              {/* Console Logs Lists */}
              <div ref={consoleContainerRef} className="flex-1 min-h-[350px] md:min-h-[480px] bg-slate-950/15 p-3 overflow-y-auto flex flex-col font-mono text-[10px] md:text-[11px] select-text">
                {filteredResults.length === 0 ? (
                  <div className="text-slate-600 italic text-center my-auto py-12">
                    // Console is idle. Waiting for checking input...
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {filteredResults.slice(-200).map((r, i) => { // ponytail: slice latest 200 items to prevent DOM lag on mobile
                      const timeVal = r.timestamp || '--:--:--'
                      let displayStatus = r.status
                      if (displayStatus === 'OTP_REQUIRED') displayStatus = '3DS'
                      if (displayStatus === 'LOW_BALANCE') displayStatus = 'LOW'

                      let colorClass = 'text-slate-400'
                      let statusBg = 'bg-slate-900/60 border-slate-850 text-slate-400'

                      if (r.status === 'CHARGED') {
                        colorClass = 'text-emerald-400 font-bold'
                        statusBg = 'bg-emerald-950/30 border-emerald-900/50 text-emerald-400'
                      } else if (r.status === 'LIVE') {
                        colorClass = 'text-cyan-400 font-bold'
                        statusBg = 'bg-cyan-950/30 border-cyan-950/50 text-cyan-400'
                      } else if (r.status === 'FRAUD') {
                        colorClass = 'text-orange-400 font-bold'
                        statusBg = 'bg-orange-950/30 border-orange-900/50 text-orange-400'
                      } else if (r.status === 'DEAD') {
                        colorClass = 'text-rose-500'
                        statusBg = 'bg-rose-955/30 border-rose-900/50 text-rose-500'
                      } else if (r.status === 'OTP_REQUIRED') {
                        colorClass = 'text-blue-400 font-bold'
                        statusBg = 'bg-blue-955/30 border-blue-900/50 text-blue-400'
                      } else if (r.status === 'LOW_BALANCE') {
                        colorClass = 'text-purple-405 font-bold'
                        statusBg = 'bg-purple-955/30 border-purple-900/50 text-purple-400'
                      } else if (['ERROR', 'TIMEOUT', 'EXCEPTION'].includes(r.status)) {
                        colorClass = 'text-amber-500'
                        statusBg = 'bg-amber-955/30 border-amber-900/50 text-amber-500'
                      }

                      return (
                        <div key={i} className="flex flex-wrap md:flex-nowrap items-center gap-x-2.5 md:gap-x-3.5 gap-y-1.5 px-3 py-2 border-b border-slate-900/30 hover:bg-slate-900/40 transition-all whitespace-normal md:whitespace-nowrap result-item-cascade">
                          <span className="text-slate-600 text-[9px] shrink-0 font-medium">[{timeVal}]</span>
                          <span className={`px-2 py-0.5 border text-[8px] font-bold rounded-lg uppercase shrink-0 ${statusBg}`}>
                            [{displayStatus}]
                          </span>
                          <button 
                            type="button"
                            onClick={() => copyToClipboard(r.card)}
                            className="flex flex-col shrink-0 min-w-[130px] cursor-pointer hover:text-cyan-400 text-left active:scale-95 duration-100 transition-[color,transform] select-none outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/30 rounded-lg"
                            title="Click to copy card"
                            aria-label={`Copy card ${r.card}`}
                          >
                            <span className="text-slate-200 font-semibold text-[10.5px] md:text-[11.5px] tracking-wide hover:underline">{r.card}</span>
                            {r.bin_brand && (
                              <span className="text-[7.5px] text-cyan-400/90 font-bold uppercase tracking-wide mt-0.5">
                                {r.bin_brand} • {r.bin_type || "N/A"} • {r.bin_class || "CLASSIC"} • {r.bin_bank || "BANK"} ({r.bin_country || "N/A"})
                              </span>
                            )}
                          </button>
                          <span className="text-slate-400 text-[10.5px] overflow-hidden text-ellipsis flex-1 min-w-[150px] md:min-w-0">&gt; {r.msg}</span>
                          <span className={`shrink-0 text-[10.5px] md:text-[11.5px] ${colorClass}`}>{r.price}</span>
                          <span className="text-slate-500 text-[9.5px] shrink-0 font-semibold">{r.gateway}</span>
                          <span className="text-cyan-500/70 text-[9.5px] shrink-0 font-semibold">{r.site}</span>
                        </div>
                      )
                    })}
                    <div ref={consoleEndRef} />
                  </div>
                )}
              </div>
            </>
          ) : (
            <VisualAnalytics results={results} counters={counters} cpmHistory={cpmHistory} />
          )}
            </div>
          </div>
        </div>
      )}

        {/* Tab: DATABASE */}
        {tab === 'admin' && isAdmin && dbInfo && (
          <div className="flex flex-col gap-6 animate-slide-up font-tech tab-content-active">
            {/* Database Status Panel */}
            <div className="glass-panel glass-panel-glow-purple rounded-2xl p-5 hover:border-slate-800/80 transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[10.5px] font-bold text-white tracking-wider flex items-center gap-2">
                  <Database className="w-4 h-4 text-purple-400" /> DATABASE CONNECTION ENVIRONMENT
                </div>
                <div className={`px-2.5 py-0.5 border rounded-lg text-[9px] font-bold ${
                  dbInfo.db_status.includes("Active") ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400' : 'border-red-500/30 bg-red-500/10 text-red-400'
                }`}>
                  {dbInfo.db_status}
                </div>
              </div>
              
              <div className="bg-slate-950/60 border border-slate-900/80 rounded-xl p-3 text-xs flex justify-between items-center text-slate-355 select-all">
                <span className="truncate mr-3 font-mono">{dbInfo.db_url}</span>
                <span className="text-[8px] text-slate-500 border border-slate-900 bg-slate-950 px-1.5 py-0.5 rounded uppercase select-none shrink-0 font-bold">SSL REQUIRED</span>
              </div>
            </div>

            {/* Sites Pool and Proxies Database Management */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Site database control */}
              <div className="glass-panel glass-panel-glow-cyan rounded-2xl p-5 hover:border-slate-800/80 transition-all duration-300 flex flex-col gap-4">
                <div className="text-[10.5px] font-bold text-white tracking-wider flex items-center gap-2">
                  <Server className="w-4 h-4 text-cyan-400" /> GLOBAL SITES LIST (DATABASE)
                </div>

                <form onSubmit={handleAdminAddSite} className="flex gap-2">
                  <input 
                    type="text" 
                    name="site_url"
                    aria-label="Site URL to add"
                    placeholder="https://example.com"
                    value={adminAddSiteInput}
                    onChange={(e) => setAdminAddSiteInput(e.target.value)}
                    className="flex-1 bg-slate-950/65 border border-slate-900 rounded-xl px-3 py-2 text-xs text-slate-250 outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/25 transition-colors placeholder:text-slate-700"
                  />
                  <button type="submit" className="py-2 px-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1 transition-[background-color,box-shadow,transform] active:scale-[0.98] duration-200 hover:shadow-[0_0_12px_rgba(6,182,212,0.35)]">
                    <Plus className="w-3.5 h-3.5" /> ADD
                  </button>
                </form>

                <div className="bg-slate-950/65 border border-slate-900 rounded-xl p-3 text-[11px] text-slate-400 h-64 overflow-y-auto flex flex-col gap-1 select-text font-mono">
                  {dbInfo.sites.length === 0 ? (
                    <div className="text-slate-600 italic text-center my-auto font-tech">// No sites loaded in database</div>
                  ) : (
                    dbInfo.sites.map((site, i) => (
                      <div key={i} className="flex justify-between items-center py-1.5 px-2.5 hover:bg-slate-900/30 rounded-lg transition-colors duration-150">
                        <span className="truncate text-slate-300 font-medium">{site}</span>
                        <button 
                          onClick={() => handleAdminDeleteSite(site)}
                          aria-label={`Delete site ${site}`}
                          className="text-slate-500 hover:text-red-400 transition-colors p-1 hover:bg-slate-950 border border-transparent hover:border-slate-900 rounded-md"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Proxy database control */}
              <div className="glass-panel glass-panel-glow-purple rounded-2xl p-5 hover:border-slate-800/80 transition-all duration-300 flex flex-col gap-4">
                <div className="text-[10.5px] font-bold text-white tracking-wider flex items-center gap-2">
                  <Server className="w-4 h-4 text-purple-400" /> GLOBAL PROXIES LIST (DATABASE)
                </div>

                <form onSubmit={handleAdminAddProxy} className="flex gap-2">
                  <input 
                    type="text" 
                    name="proxy"
                    aria-label="Proxy address to add"
                    placeholder="user:pass@ip:port"
                    value={adminAddProxyInput}
                    onChange={(e) => setAdminAddProxyInput(e.target.value)}
                    className="flex-1 bg-slate-950/65 border border-slate-900 rounded-xl px-3 py-2 text-xs text-slate-250 outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/25 transition-colors placeholder:text-slate-700"
                  />
                  <button type="submit" className="py-2 px-4 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white text-xs font-bold rounded-xl flex items-center gap-1 transition-[background-color,box-shadow,transform] active:scale-[0.98] duration-200 hover:shadow-[0_0_12px_rgba(168,85,247,0.35)]">
                    <Plus className="w-3.5 h-3.5" /> ADD
                  </button>
                </form>

                <div className="bg-slate-950/65 border border-slate-900 rounded-xl p-3 text-[11px] text-slate-400 h-64 overflow-y-auto flex flex-col gap-1 select-text font-mono">
                  {dbInfo.proxies.length === 0 ? (
                    <div className="text-slate-600 italic text-center my-auto font-tech">// No proxies loaded in database</div>
                  ) : (
                    dbInfo.proxies.map((proxy, i) => (
                      <div key={i} className="flex justify-between items-center py-1.5 px-2.5 hover:bg-slate-900/30 rounded-lg transition-colors duration-150">
                        <span className="truncate text-slate-300 font-medium">{proxy}</span>
                        <button 
                          onClick={() => handleAdminDeleteProxy(proxy)}
                          aria-label={`Delete proxy ${proxy}`}
                          className="text-slate-500 hover:text-red-400 transition-colors p-1 hover:bg-slate-950 border border-transparent hover:border-slate-900 rounded-md"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footnote */}
        <footer className="text-center mt-auto pt-6 pb-2 text-slate-600 font-mono text-[9px] shrink-0 border-t border-slate-900/40">
          MLSN // CONSOLE RUNNER CLIENT v0.1.220511 &copy; 2026
        </footer>

        {isCustomizerOpen && (
          <AvatarCustomizer 
            username={user || "guest"}
            onClose={() => setIsCustomizerOpen(false)}
            currentIndex={customAvatarIndex !== null ? customAvatarIndex : (() => {
              const name = user ? user.trim() : "guest"
              let hash = 0
              for (let i = 0; i < name.length; i++) {
                hash = name.charCodeAt(i) + ((hash << 5) - hash)
              }
              return Math.abs(hash) % AVATAR_TEMPLATES.length
            })()}
            onSave={(index) => {
              setCustomAvatarIndex(index)
              localStorage.setItem(`mlsn_avatar_${user}`, index.toString())
              setIsCustomizerOpen(false)
              showToast("Avatar customized successfully!")
            }}
          />
        )}
      </main>
    </div>
  )
}
