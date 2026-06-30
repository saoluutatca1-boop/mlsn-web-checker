import React, { useState, useEffect, useRef } from 'react'
import { 
  Play, Pause, Square, Trash2, Plus, X, UploadCloud, Database, 
  LogOut, Lock, User, Terminal, Server, ShieldCheck, CheckCircle2, AlertCircle
} from 'lucide-react'

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

export default function App() {
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
  
  // Checking State
  const [isRunning, setIsRunning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [progressPct, setProgressPct] = useState(0)
  const [progressStatus, setProgressStatus] = useState('PREPARING ENVIRONMENT...')
  const [progressText, setProgressText] = useState('0 / 0 CHECKED (0%)')
  
  // Console Results & Filters
  const [results, setResults] = useState<CheckResult[]>([])
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [counters, setCounters] = useState({
    all: 0, charged: 0, live: 0, fraud: 0, dead: 0, otp: 0, low: 0, err: 0
  })

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

  const consoleEndRef = useRef<HTMLDivElement>(null)

  // Core checking execution logic (batch queue)
  const isStoppedRef = useRef(false)
  const isPausedRef = useRef(false)
  const resumeResolverRef = useRef<(() => void) | null>(null)


  // Run on startup
  useEffect(() => {
    checkAuth()
    loadLocalProxies()
  }, [])

  // Auto scroll console to bottom
  useEffect(() => {
    if (isRunning && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'auto' }) // ponytail: use 'auto' scroll behavior to prevent smooth-scrolling CPU lag on mobile
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

  const stopChecking = () => {
    if (!isRunning) return
    isStoppedRef.current = true
    if (isPaused) {
      setIsPaused(false)
      isPausedRef.current = false
      if (resumeResolverRef.current) {
        resumeResolverRef.current()
        resumeResolverRef.current = null
      }
    }
    showToast("Stopping checker...", "err")
  }

  const togglePauseChecking = () => {
    if (!isRunning) return
    const nextPaused = !isPaused
    setIsPaused(nextPaused)
    isPausedRef.current = nextPaused
    
    if (nextPaused) {
      setProgressStatus('EXECUTION PAUSED')
      showToast("Checking suspended")
    } else {
      setProgressStatus('RESUMING...')
      showToast("Checking resumed")
      if (resumeResolverRef.current) {
        resumeResolverRef.current()
        resumeResolverRef.current = null
      }
    }
  }

  const runChecker = async () => {
    if (isRunning) return
    
    let rawText = ''
    if (uploadedFileContent) {
      rawText = uploadedFileContent
    } else {
      rawText = cardInput.trim()
    }

    if (!rawText) {
      showToast("Input buffer empty", "err")
      return
    }

    const cards = parseCardsString(rawText)
    if (cards.length === 0) {
      showToast("No valid card numbers identified", "err")
      return
    }

    setIsRunning(true)
    setIsPaused(false)
    isStoppedRef.current = false
    isPausedRef.current = false
    
    setResults([])
    setCounters({
      all: cards.length, charged: 0, live: 0, fraud: 0, dead: 0, otp: 0, low: 0, err: 0
    })
    setProgressPct(0)
    setProgressStatus('INITIALIZING STREAM...')
    setProgressText(`0 / ${cards.length} CHECKED (0%)`)

    const batchSize = 200
    const totalBatches = Math.ceil(cards.length / batchSize)
    let accumulated: CheckResult[] = []

    // Run batch loops
    for (let currentBatch = 0; currentBatch < totalBatches; currentBatch++) {
      if (isStoppedRef.current) break

      if (isPausedRef.current) {
        setProgressStatus('EXECUTION PAUSED')
        await new Promise<void>(resolve => {
          resumeResolverRef.current = resolve
        })
      }

      if (isStoppedRef.current) break

      const startIdx = currentBatch * batchSize
      const endIdx = Math.min(startIdx + batchSize, cards.length)
      setProgressStatus(`CHECKING BATCH ${currentBatch + 1}/${totalBatches}...`)

      const batch = cards.slice(startIdx, endIdx)

      try {
        const res = await fetch('/api/check_batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cards: batch,
            concurrency: concurrency,
            proxies: userProxies
          })
        })

        if (!res.ok) {
          throw new Error(`Batch request failed with status ${res.status}`)
        }

        const data = await res.json()
        const batchResults: CheckResult[] = data.results || []
        
        const timestamp = new Date().toTimeString().split(' ')[0]
        batchResults.forEach(r => r.timestamp = timestamp)

        accumulated = accumulated.concat(batchResults)
        setResults(prev => prev.concat(batchResults))
        
        // Update stats counters
        const currentStats = {
          all: cards.length,
          charged: accumulated.filter(r => r.status === 'CHARGED').length,
          live: accumulated.filter(r => r.status === 'LIVE').length,
          fraud: accumulated.filter(r => r.status === 'FRAUD').length,
          dead: accumulated.filter(r => r.status === 'DEAD').length,
          otp: accumulated.filter(r => r.status === 'OTP_REQUIRED').length,
          low: accumulated.filter(r => r.status === 'LOW_BALANCE').length,
          err: accumulated.filter(r => ['ERROR', 'TIMEOUT', 'EXCEPTION'].includes(r.status)).length
        }
        setCounters(currentStats)

        const pct = Math.round((accumulated.length / cards.length) * 100)
        setProgressPct(pct)
        setProgressText(`${accumulated.length} / ${cards.length} CHECKED (${pct}%)`)

      } catch (err: any) {
        showToast(err.message, "err")
        await new Promise(resolve => setTimeout(resolve, 3000))
      }
    }

    // Finish check
    setIsRunning(false)
    setIsPaused(false)
    setProgressStatus(isStoppedRef.current ? 'TERMINATED' : 'DONE')
    showToast(isStoppedRef.current ? 'Checking stopped manually' : 'Checking batch completed successfully')
    
    // Clear input forms
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

  const clearResults = () => {
    if (isRunning) {
      showToast("Engine is busy running", "err")
      return
    }
    setResults([])
    setCounters({
      all: 0, charged: 0, live: 0, fraud: 0, dead: 0, otp: 0, low: 0, err: 0
    })
    showToast("Console log buffer cleared")
  }

  const filterR = (f: string | null) => {
    setActiveFilter(f)
  }

  // Filter logs logic
  const filteredResults = activeFilter ? results.filter(r => {
    if (activeFilter === 'ERR') return ['ERROR', 'TIMEOUT', 'EXCEPTION'].includes(r.status)
    return r.status === activeFilter
  }) : results

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-300">
      {/* Background Gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-cyan-500/5 blur-[160px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-[600px] h-[600px] bg-purple-500/5 blur-[160px] rounded-full pointer-events-none" />

      {/* Toast Notifications */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div 
            key={t.id} 
            className={`pointer-events-auto w-80 px-4 py-3 bg-slate-900 border-l-4 rounded shadow-2xl flex items-center gap-3 font-mono text-xs animate-slide-up ${
              t.type === 'err' ? 'border-red-500' : 'border-cyan-500'
            }`}
          >
            {t.type === 'err' ? (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
            )}
            <span className="text-slate-200">{t.message}</span>
          </div>
        ))}
      </div>

      {/* Navigation Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row gap-3 justify-between items-center">
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 w-full sm:w-auto">
            <div className="font-mono font-bold text-base sm:text-lg tracking-wider text-white">
              MLSN <span className="text-cyan-400">//</span> WEB CHECKER
            </div>
            
            {user && (
              <nav className="flex gap-1">
                <button 
                  onClick={() => { setTab('checker'); window.history.pushState({}, '', '/'); }} 
                  className={`px-3 py-1.5 rounded text-xs font-mono font-semibold transition-all ${
                    tab === 'checker' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  CHECKER
                </button>
                {isAdmin && (
                  <button 
                    onClick={() => { setTab('admin'); window.history.pushState({}, '', '/vanlinh'); }} 
                    className={`px-3 py-1.5 rounded text-xs font-mono font-semibold transition-all flex items-center gap-1.5 ${
                      tab === 'admin' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Database className="w-3 h-3" /> DATABASE
                  </button>
                )}
              </nav>
            )}
          </div>

          <div className="flex items-center gap-6 w-full sm:w-auto justify-center sm:justify-end">
            {/* Status indicators */}
            <div className="flex flex-wrap justify-center items-center gap-3 sm:gap-5 font-mono text-[10px] text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full shadow-[0_0_8px_#00ffd1]" />
                <span>SITES: <strong className="text-slate-200">{statsData.sites_count}</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full shadow-[0_0_8px_#d946ef]" />
                <span>PROXIES: <strong className="text-slate-200">{userProxies.length > 0 ? userProxies.length : statsData.proxies_count}</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${apiOnline ? 'bg-cyan-400 shadow-[0_0_8px_#00ffd1]' : 'bg-red-500 shadow-[0_0_8px_#ff3e6c]'}`} />
                <span>API: <strong className={apiOnline ? 'text-cyan-400' : 'text-red-400'}>{apiOnline ? 'ONLINE' : 'OFFLINE'}</strong></span>
              </div>
            </div>

            {user && (
              <button 
                onClick={handleLogout}
                className="text-xs font-mono font-bold text-red-400 hover:text-red-300 transition-all flex items-center gap-1.5"
                title="Sign out current session"
              >
                <LogOut className="w-3.5 h-3.5" /> LOGOUT
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main View Area */}
      <main className="max-w-[1600px] w-full mx-auto p-6 flex-1 flex flex-col">
        {tab === 'login' && (
          <div className="max-w-md w-full mx-auto my-auto py-12 flex flex-col gap-6 animate-slide-up">
            <div className="text-center flex flex-col gap-2">
              <div className="font-mono font-bold text-2xl tracking-widest text-white">
                MLSN <span className="text-cyan-400">//</span> AUTHENTICATION
              </div>
              <p className="text-xs text-slate-400 font-mono">Access requires secure authorization credentials</p>
            </div>

            <div className="bg-slate-900/30 border border-slate-900 rounded-lg p-6 backdrop-blur-md shadow-2xl flex flex-col gap-6">
              {/* Tab selector */}
              <div className="grid grid-cols-2 bg-slate-950 p-1 rounded-md border border-slate-900 text-xs font-mono font-semibold">
                <button 
                  onClick={() => setActiveLoginTab('telegram')}
                  className={`py-2 rounded transition-all ${activeLoginTab === 'telegram' ? 'bg-cyan-500/10 text-cyan-400' : 'text-slate-400'}`}
                >
                  TELEGRAM ACCESS
                </button>
                <button 
                  onClick={() => setActiveLoginTab('admin')}
                  className={`py-2 rounded transition-all ${activeLoginTab === 'admin' ? 'bg-purple-500/10 text-purple-400' : 'text-slate-400'}`}
                >
                  ADMIN PORTAL
                </button>
              </div>

              {activeLoginTab === 'telegram' ? (
                statsData.bot_username ? (
                  <div className="flex flex-col gap-4 font-mono text-center">
                    <div className="border border-slate-900 bg-cyan-950/20 rounded p-4 text-xs text-cyan-400 flex flex-col gap-3 text-left">
                      <div className="flex items-center gap-2 font-bold text-white">
                        <Server className="w-4 h-4 text-cyan-400" /> TELEGRAM BOT SYSTEM ACTIVE
                      </div>
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        To log in securely, message your Telegram bot and send the <code className="text-cyan-300">/login</code> or <code className="text-cyan-300">/start</code> command. The bot will send you a secure button to log in here.
                      </p>
                    </div>
                    
                    <a 
                      href={`https://t.me/${statsData.bot_username}?start=login`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold rounded flex items-center justify-center gap-2 transition-all hover:shadow-[0_0_15px_rgba(0,255,209,0.3)] text-center no-underline cursor-pointer"
                    >
                      <Terminal className="w-4 h-4" /> START LOGIN SECURELY
                    </a>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 font-mono">
                    <div className="border border-slate-900 bg-slate-950/40 rounded p-3 text-[10px] text-yellow-400/80 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-yellow-500 shrink-0" />
                      <span>Using mock login as fallback since Telegram Widget is restricted to static hostname bindings in this environment.</span>
                    </div>
                    
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] uppercase tracking-wider text-slate-400">Telegram Username</label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                        <input 
                          type="text" 
                          placeholder="@yourusername"
                          value={mockUsername}
                          onChange={(e) => setMockUsername(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-900 rounded px-3 py-2.5 pl-10 text-sm text-slate-200 outline-none focus:border-cyan-500/50 transition-all placeholder:text-slate-600"
                        />
                      </div>
                    </div>
                    
                    <button 
                      onClick={handleMockLogin}
                      className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold rounded flex items-center justify-center gap-2 transition-all hover:shadow-[0_0_15px_rgba(0,255,209,0.3)]"
                    >
                      <Terminal className="w-4 h-4" /> LOG IN VIA TELEGRAM
                    </button>
                  </div>
                )
              ) : (
                <form onSubmit={handleAdminLogin} className="flex flex-col gap-4 font-mono">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-slate-400">Admin Username</label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                      <input 
                        type="text" 
                        placeholder="Username..."
                        value={adminUsername}
                        onChange={(e) => setAdminUsername(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-900 rounded px-3 py-2.5 pl-10 text-sm text-slate-200 outline-none focus:border-purple-500/50 transition-all placeholder:text-slate-600"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-slate-400">Admin Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                      <input 
                        type="password" 
                        placeholder="Password..."
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-900 rounded px-3 py-2.5 pl-10 text-sm text-slate-200 outline-none focus:border-purple-500/50 transition-all placeholder:text-slate-600"
                      />
                    </div>
                  </div>

                  <button 
                    type="submit"
                    className="w-full py-2.5 bg-purple-500 hover:bg-purple-400 text-white text-xs font-bold rounded flex items-center justify-center gap-2 transition-all hover:shadow-[0_0_15px_rgba(168,85,247,0.3)]"
                  >
                    <ShieldCheck className="w-4 h-4" /> AUTHORIZE ADMINISTRATIVE SESSION
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {tab === 'checker' && (
          <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6 flex-1 animate-slide-up">
            {/* Sidebar Controls */}
            <div className="flex flex-col gap-5">
              {/* Card Engine */}
              <div className="bg-slate-900/30 border border-slate-900 rounded-lg p-5 backdrop-blur-md hover:border-slate-800 transition-all flex flex-col gap-4">
                <div className="font-mono text-xs font-bold text-slate-400 tracking-wider flex justify-between">
                  <span>[01] CARD ENGINE</span>
                </div>
                
                <div className="flex gap-2 items-center">
                  <div className="grid grid-cols-2 bg-slate-950 border border-slate-900 p-0.5 rounded text-[10px] font-mono font-bold flex-1">
                    <button 
                      onClick={() => setMode('sac')}
                      className={`py-1.5 rounded transition-all ${mode === 'sac' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-slate-500'}`}
                    >
                      SAC SINGLE
                    </button>
                    <button 
                      onClick={() => setMode('msac')}
                      className={`py-1.5 rounded transition-all ${mode === 'msac' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-slate-500'}`}
                    >
                      MSAC MASS
                    </button>
                  </div>
                  
                  <div className="bg-slate-950 border border-slate-900 rounded px-2 py-1.5 h-8 flex items-center justify-between gap-1 w-24 shrink-0 font-mono">
                    <span className="text-[9px] text-slate-500 tracking-tight">LIMIT</span>
                    <input 
                      type="number" 
                      value={concurrency}
                      onChange={(e) => setConcurrency(parseInt(e.target.value) || 1000)}
                      min="1" 
                      max="2000"
                      className="bg-transparent border-none text-right outline-none text-cyan-400 text-xs font-bold w-12"
                    />
                  </div>
                </div>

                <textarea 
                  placeholder="cc|mm|yy|cvv&#10;cc/mm/yy/cvv&#10;cc mm yy cvv&#10;&#10;One card per line"
                  value={cardInput}
                  onChange={(e) => {
                    setCardInput(e.target.value)
                    if (uploadedFileName) {
                      setUploadedFileName('')
                      setUploadedFileContent('')
                    }
                  }}
                  disabled={isRunning}
                  className="w-full h-32 bg-slate-950 border border-slate-900 rounded-md p-3 font-mono text-[11px] text-slate-200 outline-none focus:border-cyan-500/40 resize-none transition-all placeholder:text-slate-600 disabled:opacity-50"
                />

                <div className="flex gap-2">
                  {!isRunning ? (
                    <button 
                      onClick={runChecker}
                      className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono text-xs font-bold py-2.5 rounded flex-1 flex items-center justify-center gap-1.5 transition-all hover:shadow-[0_0_15px_rgba(0,255,209,0.3)]"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" /> RUN CHECKER
                    </button>
                  ) : (
                    <>
                      <button 
                        onClick={togglePauseChecking}
                        className={`font-mono text-xs font-bold py-2.5 rounded flex-1 flex items-center justify-center gap-1.5 transition-all border ${
                          isPaused 
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20' 
                            : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20'
                        }`}
                      >
                        <Pause className="w-3.5 h-3.5" /> {isPaused ? 'RESUME' : 'PAUSE'}
                      </button>
                      <button 
                        onClick={stopChecking}
                        className="bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-400 font-mono text-xs font-bold py-2.5 rounded shrink-0 px-4 flex items-center justify-center gap-1.5 transition-all"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" /> STOP
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Bulk Source */}
              <div className="bg-slate-900/30 border border-slate-900 rounded-lg p-5 backdrop-blur-md hover:border-slate-800 transition-all flex flex-col gap-4">
                <div className="font-mono text-xs font-bold text-slate-400 tracking-wider">
                  <span>[02] BULK SOURCE</span>
                </div>
                
                <div 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('file-input')?.click()}
                  className={`border border-dashed rounded-md p-6 text-center cursor-pointer transition-all bg-slate-950/60 ${
                    dragOver ? 'border-cyan-400 bg-cyan-500/5' : 'border-slate-800/80 hover:border-cyan-500/40'
                  }`}
                >
                  <UploadCloud className="w-6 h-6 text-slate-500 mx-auto mb-2" />
                  <div className="font-mono text-[10px] font-bold text-slate-300">DRAG & DROP CARDS FILE</div>
                  <span className="font-mono text-[8px] text-slate-500 mt-1 block">Plain text .txt / .csv list</span>
                  <input 
                    type="file" 
                    id="file-input" 
                    accept=".txt,.csv" 
                    className="hidden" 
                    onChange={handleFileChange}
                  />
                </div>
                
                {uploadedFileName && (
                  <div className="font-mono text-[10px] text-cyan-400 flex items-center justify-between bg-cyan-950/20 border border-cyan-950 px-3 py-1.5 rounded">
                    <span>LOADED: <strong>{uploadedFileName.toUpperCase()}</strong></span>
                    <button 
                      onClick={() => {
                        setUploadedFileName('')
                        setUploadedFileContent('')
                      }}
                      className="text-slate-500 hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Data Pools */}
              <div className="bg-slate-900/30 border border-slate-900 rounded-lg p-5 backdrop-blur-md hover:border-slate-800 transition-all flex flex-col gap-4">
                <div className="font-mono text-xs font-bold text-slate-400 tracking-wider">
                  <span>[03] DATA POOLS</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Sites pool */}
                  <div className="flex flex-col gap-2 font-mono">
                    <span className="text-[9px] uppercase tracking-wide text-slate-500">SITES</span>
                    <div className="flex gap-1">
                      <label className="flex-1 py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-900 rounded text-[9px] font-bold text-slate-300 cursor-pointer flex items-center justify-center gap-1 transition-all">
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
                        className="py-1.5 px-2 bg-red-950/20 hover:bg-red-950/40 border border-red-950 text-red-400 rounded text-[9px] font-bold flex items-center justify-center gap-1 transition-all"
                      >
                        <X className="w-3 h-3" /> CLR
                      </button>
                    </div>
                    <div className="bg-slate-950/80 border border-slate-900 rounded p-2 text-[10px] text-slate-400 h-16 overflow-y-auto flex flex-col justify-center">
                      {statsData.sites_count > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="text-emerald-400 font-bold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                            {statsData.sites_count} AUTO-DATABASE
                          </div>
                          <span className="text-[9px] text-slate-500">Synced with Telegram Bot</span>
                        </div>
                      ) : (
                        <div className="text-slate-600 italic text-center">EMPTY POOL</div>
                      )}
                    </div>
                  </div>

                  {/* Proxies pool */}
                  <div className="flex flex-col gap-2 font-mono">
                    <span className="text-[9px] uppercase tracking-wide text-slate-500">PROXIES</span>
                    <div className="flex gap-1">
                      <label className="flex-1 py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-900 rounded text-[9px] font-bold text-slate-300 cursor-pointer flex items-center justify-center gap-1 transition-all">
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
                        className="py-1.5 px-2 bg-red-950/20 hover:bg-red-950/40 border border-red-950 text-red-400 rounded text-[9px] font-bold flex items-center justify-center gap-1 transition-all"
                      >
                        <X className="w-3 h-3" /> CLR
                      </button>
                    </div>
                    <div className="bg-slate-950/80 border border-slate-900 rounded p-2 text-[10px] text-slate-400 h-16 overflow-y-auto flex flex-col justify-center">
                      {userProxies.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="text-cyan-400 font-bold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full" />
                            {userProxies.length} CUSTOM ACTIVE
                          </div>
                          <span className="text-[9px] text-slate-500">Using uploaded proxy list</span>
                        </div>
                      ) : statsData.proxies_count > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="text-emerald-400 font-bold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                            {statsData.proxies_count} AUTO-DATABASE
                          </div>
                          <span className="text-[9px] text-slate-500">Synced with Telegram Bot</span>
                        </div>
                      ) : (
                        <div className="text-slate-600 italic text-center">0 ACTIVE (NO PROXY)</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Console Log Runner Panel */}
            <div className="bg-slate-900/20 border border-slate-900 rounded-lg flex flex-col overflow-hidden hover:border-slate-800 transition-all">
              <div className="px-5 py-4 bg-slate-950/60 border-b border-slate-900 flex justify-between items-center shrink-0">
                <div className="font-mono text-xs font-bold text-white tracking-wider flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-cyan-400" /> RUNNER CONSOLE
                </div>
                <button 
                  onClick={clearResults}
                  disabled={isRunning}
                  className="py-1.5 px-3 bg-red-950/20 hover:bg-red-950/40 border border-red-950 disabled:opacity-30 disabled:pointer-events-none text-red-400 rounded font-mono text-[9px] font-bold flex items-center gap-1 transition-all"
                >
                  <Trash2 className="w-3 h-3" /> CLEAR LOGS
                </button>
              </div>

              {/* Concurrency Progress Indicator */}
              <div className={`px-5 py-3.5 bg-slate-950/20 border-b border-slate-900 shrink-0 ${isRunning ? 'block' : 'hidden'}`}>
                <div className="flex justify-between items-center font-mono text-[10px] mb-1.5">
                  <span className="text-cyan-400 font-bold">{progressStatus}</span>
                  <span className="text-slate-400">{progressText}</span>
                </div>
                <div className="h-1 bg-slate-950 rounded-full overflow-hidden border border-slate-900">
                  <div 
                    className="h-full bg-cyan-400 shadow-[0_0_8px_#00ffd1] transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {/* Filter Badges */}
              <div className="px-5 py-3 bg-slate-950/40 border-b border-slate-900 flex gap-2 flex-wrap shrink-0 font-mono text-[10px]">
                <button 
                  onClick={() => filterR(null)}
                  className={`px-2.5 py-1.5 border rounded flex items-center gap-1.5 transition-all ${
                    activeFilter === null ? 'bg-cyan-500/10 border-cyan-400 text-cyan-400 shadow-[0_0_10px_rgba(0,255,209,0.05)]' : 'border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  ALL: <span className="font-bold">{counters.all}</span>
                </button>
                <button 
                  onClick={() => filterR('CHARGED')}
                  className={`px-2.5 py-1.5 border rounded flex items-center gap-1.5 transition-all ${
                    activeFilter === 'CHARGED' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.05)]' : 'border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  CHARGED: <span className="font-bold">{counters.charged}</span>
                </button>
                <button 
                  onClick={() => filterR('LIVE')}
                  className={`px-2.5 py-1.5 border rounded flex items-center gap-1.5 transition-all ${
                    activeFilter === 'LIVE' ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400 shadow-[0_0_10px_rgba(0,255,209,0.05)]' : 'border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  LIVE: <span className="font-bold">{counters.live}</span>
                </button>
                <button 
                  onClick={() => filterR('FRAUD')}
                  className={`px-2.5 py-1.5 border rounded flex items-center gap-1.5 transition-all ${
                    activeFilter === 'FRAUD' ? 'bg-orange-500/10 border-orange-500 text-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.05)]' : 'border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  FRAUD: <span className="font-bold">{counters.fraud}</span>
                </button>
                <button 
                  onClick={() => filterR('DEAD')}
                  className={`px-2.5 py-1.5 border rounded flex items-center gap-1.5 transition-all ${
                    activeFilter === 'DEAD' ? 'bg-rose-500/10 border-rose-500 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.05)]' : 'border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  DEAD: <span className="font-bold">{counters.dead}</span>
                </button>
                <button 
                  onClick={() => filterR('OTP_REQUIRED')}
                  className={`px-2.5 py-1.5 border rounded flex items-center gap-1.5 transition-all ${
                    activeFilter === 'OTP_REQUIRED' ? 'bg-blue-500/10 border-blue-500 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.05)]' : 'border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  3DS: <span className="font-bold">{counters.otp}</span>
                </button>
                <button 
                  onClick={() => filterR('LOW_BALANCE')}
                  className={`px-2.5 py-1.5 border rounded flex items-center gap-1.5 transition-all ${
                    activeFilter === 'LOW_BALANCE' ? 'bg-purple-500/10 border-purple-500 text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.05)]' : 'border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  LOW: <span className="font-bold">{counters.low}</span>
                </button>
                <button 
                  onClick={() => filterR('ERR')}
                  className={`px-2.5 py-1.5 border rounded flex items-center gap-1.5 transition-all ${
                    activeFilter === 'ERR' ? 'bg-amber-500/10 border-amber-500 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.05)]' : 'border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  ERR: <span className="font-bold">{counters.err}</span>
                </button>
              </div>

              {/* Console Logs Lists */}
              <div className="flex-1 min-h-[350px] md:min-h-[480px] bg-slate-950 p-2 overflow-y-auto flex flex-col font-mono text-[10px] md:text-[11px]">
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
                      let statusBg = 'bg-slate-900 border-slate-800 text-slate-400'

                      if (r.status === 'CHARGED') {
                        colorClass = 'text-emerald-400'
                        statusBg = 'bg-emerald-950/20 border-emerald-900 text-emerald-400'
                      } else if (r.status === 'LIVE') {
                        colorClass = 'text-cyan-400'
                        statusBg = 'bg-cyan-950/20 border-cyan-950 text-cyan-400'
                      } else if (r.status === 'FRAUD') {
                        colorClass = 'text-orange-400'
                        statusBg = 'bg-orange-950/20 border-orange-900 text-orange-400'
                      } else if (r.status === 'DEAD') {
                        colorClass = 'text-rose-500'
                        statusBg = 'bg-rose-950/20 border-rose-900 text-rose-500'
                      } else if (r.status === 'OTP_REQUIRED') {
                        colorClass = 'text-blue-400'
                        statusBg = 'bg-blue-950/20 border-blue-900 text-blue-400'
                      } else if (r.status === 'LOW_BALANCE') {
                        colorClass = 'text-purple-400'
                        statusBg = 'bg-purple-950/20 border-purple-900 text-purple-400'
                      } else if (['ERROR', 'TIMEOUT', 'EXCEPTION'].includes(r.status)) {
                        colorClass = 'text-amber-500'
                        statusBg = 'bg-amber-950/20 border-amber-900 text-amber-500'
                      }

                      return (
                        <div key={i} className="flex flex-wrap md:flex-nowrap items-center gap-x-2 md:gap-x-3 gap-y-1 px-3 py-2 border-b border-slate-900/50 hover:bg-slate-900/20 transition-all whitespace-normal md:whitespace-nowrap animate-slide-up">
                          <span className="text-slate-600 text-[9px] shrink-0">[{timeVal}]</span>
                          <span className={`px-1.5 py-0.5 border text-[8px] font-bold rounded uppercase shrink-0 ${statusBg}`}>
                            [{displayStatus}]
                          </span>
                          <span className="text-slate-200 shrink-0 font-medium text-[10px] md:text-[11px]">{r.card}</span>
                          <span className="text-slate-400 text-[10px] overflow-hidden text-ellipsis flex-1 min-w-[150px] md:min-w-0">&gt; {r.msg}</span>
                          <span className={`font-bold shrink-0 text-[10px] md:text-[11px] ${colorClass}`}>{r.price}</span>
                          <span className="text-slate-600 text-[9px] shrink-0">{r.gateway}</span>
                          <span className="text-cyan-500/70 text-[9px] shrink-0">{r.site}</span>
                        </div>
                      )
                    })}
                    <div ref={consoleEndRef} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'admin' && isAdmin && dbInfo && (
          <div className="flex flex-col gap-6 animate-slide-up font-mono">
            {/* Database Status Panel */}
            <div className="bg-slate-900/30 border border-slate-900 rounded-lg p-5 backdrop-blur-md">
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs font-bold text-white tracking-wider flex items-center gap-2">
                  <Database className="w-4 h-4 text-purple-400" /> DATABASE CONNECTION ENVIRONMENT
                </div>
                <div className={`px-2 py-0.5 border rounded text-[9px] font-bold ${
                  dbInfo.db_status.includes("Active") ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400' : 'border-red-500/30 bg-red-500/10 text-red-400'
                }`}>
                  {dbInfo.db_status}
                </div>
              </div>
              
              <div className="bg-slate-950 border border-slate-900 rounded p-3 text-xs flex justify-between items-center text-slate-300 select-all">
                <span>{dbInfo.db_url}</span>
                <span className="text-[9px] text-slate-500 select-none">SSL REQUIRED</span>
              </div>
            </div>

            {/* Sites Pool and Proxies Database Management */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Site database control */}
              <div className="bg-slate-900/30 border border-slate-900 rounded-lg p-5 backdrop-blur-md flex flex-col gap-4">
                <div className="text-xs font-bold text-white tracking-wider flex items-center gap-2">
                  <Server className="w-4 h-4 text-cyan-400" /> GLOBAL SITES LIST (DATABASE)
                </div>

                <form onSubmit={handleAdminAddSite} className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="https://example.com"
                    value={adminAddSiteInput}
                    onChange={(e) => setAdminAddSiteInput(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-900 rounded px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-500/50 transition-all placeholder:text-slate-700"
                  />
                  <button type="submit" className="py-1.5 px-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold rounded flex items-center gap-1 transition-all">
                    <Plus className="w-3.5 h-3.5" /> ADD
                  </button>
                </form>

                <div className="bg-slate-950/80 border border-slate-900 rounded p-2 text-[11px] text-slate-400 h-64 overflow-y-auto flex flex-col gap-1">
                  {dbInfo.sites.length === 0 ? (
                    <div className="text-slate-600 italic text-center my-auto">No sites loaded in DB</div>
                  ) : (
                    dbInfo.sites.map((site, i) => (
                      <div key={i} className="flex justify-between items-center py-1 px-2 hover:bg-slate-900/30 rounded">
                        <span>{site}</span>
                        <button 
                          onClick={() => handleAdminDeleteSite(site)}
                          className="text-slate-500 hover:text-red-400 transition-all"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Proxy database control */}
              <div className="bg-slate-900/30 border border-slate-900 rounded-lg p-5 backdrop-blur-md flex flex-col gap-4">
                <div className="text-xs font-bold text-white tracking-wider flex items-center gap-2">
                  <Server className="w-4 h-4 text-purple-400" /> GLOBAL PROXIES LIST (DATABASE)
                </div>

                <form onSubmit={handleAdminAddProxy} className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="user:pass@ip:port"
                    value={adminAddProxyInput}
                    onChange={(e) => setAdminAddProxyInput(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-900 rounded px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-purple-500/50 transition-all placeholder:text-slate-700"
                  />
                  <button type="submit" className="py-1.5 px-3 bg-purple-500 hover:bg-purple-400 text-white text-xs font-bold rounded flex items-center gap-1 transition-all">
                    <Plus className="w-3.5 h-3.5" /> ADD
                  </button>
                </form>

                <div className="bg-slate-950/80 border border-slate-900 rounded p-2 text-[11px] text-slate-400 h-64 overflow-y-auto flex flex-col gap-1">
                  {dbInfo.proxies.length === 0 ? (
                    <div className="text-slate-600 italic text-center my-auto">No proxies loaded in DB</div>
                  ) : (
                    dbInfo.proxies.map((proxy, i) => (
                      <div key={i} className="flex justify-between items-center py-1 px-2 hover:bg-slate-900/30 rounded">
                        <span>{proxy}</span>
                        <button 
                          onClick={() => handleAdminDeleteProxy(proxy)}
                          className="text-slate-500 hover:text-red-400 transition-all"
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
      </main>

      <footer className="text-center py-5 text-slate-600 font-mono text-[10px] border-t border-slate-900 bg-slate-950/40 shrink-0">
        MLSN // CONSOLE RUNNER CLIENT v1.4.0 &copy; 2026
      </footer>
    </div>
  )
}
