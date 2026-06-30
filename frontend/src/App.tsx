import React, { useState, useEffect, useRef } from 'react'
import { 
  Play, Square, Trash2, Plus, X, UploadCloud, Database, 
  LogOut, Lock, User, Terminal, Server, ShieldCheck, CheckCircle2, AlertCircle,
  Menu, Download
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
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const consoleEndRef = useRef<HTMLDivElement>(null)

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

  const pollTask = (taskId: number) => {
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
          proxies: userProxies
        })
      })

      if (!res.ok) {
        throw new Error(`Start request failed with status ${res.status}`)
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
    <div className="min-h-screen bg-transparent text-slate-200 flex flex-col md:flex-row selection:bg-cyan-500/30 selection:text-cyan-300 relative overflow-x-hidden">
      {/* Background Gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.012)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-cyan-500/5 blur-[160px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-[600px] h-[600px] bg-purple-500/5 blur-[160px] rounded-full pointer-events-none" />

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
          <div className="flex md:hidden items-center justify-between px-5 py-3.5 bg-slate-955/85 backdrop-blur-md border-b border-slate-900/60 sticky top-0 z-30 w-full shrink-0">
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
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 md:hidden animate-fade-in"
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
                <span className="font-tech text-[8px] text-slate-500 uppercase tracking-widest mt-2 ml-1">WEB ENGINE CLIENT v1.4.0</span>
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
                  <div className="w-7 h-7 rounded-lg bg-cyan-950 border border-cyan-800/40 flex items-center justify-center shrink-0">
                    <User className="w-3.5 h-3.5 text-cyan-455" />
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
        
        {/* Tab: LOGIN */}
        {tab === 'login' && (
          <div className="w-full flex flex-col gap-6 animate-slide-up">
            <div className="text-center flex flex-col gap-2.5 items-center">
              <Logo size="lg" className="justify-center" />
              <p className="text-[9.5px] tracking-wider text-slate-400 font-tech mt-1 uppercase">AUTHENTICATION REQUIRED</p>
            </div>

            <div className="glass-panel rounded-2xl p-6 shadow-2xl flex flex-col gap-6 hover:border-slate-800/60 transition-all duration-300">
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
                      className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all hover:shadow-[0_0_15px_rgba(6,182,212,0.3)] text-center no-underline cursor-pointer active:scale-95 duration-200"
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
                        <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                        <input 
                          type="text" 
                          placeholder="@yourusername"
                          value={mockUsername}
                          onChange={(e) => setMockUsername(e.target.value)}
                          className="w-full bg-slate-955/65 border border-slate-900 rounded-xl px-3 py-3 pl-10 text-sm text-slate-200 outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 transition-all placeholder:text-slate-600"
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
                    <label className="text-[10px] uppercase tracking-wider text-slate-550 font-bold">Admin Username</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                      <input 
                        type="text" 
                        placeholder="Username..."
                        value={adminUsername}
                        onChange={(e) => setAdminUsername(e.target.value)}
                        className="w-full bg-slate-955/65 border border-slate-900 rounded-xl px-3 py-3 pl-10 text-sm text-slate-200 outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20 transition-all placeholder:text-slate-600"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-slate-555 font-bold">Admin Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                      <input 
                        type="password" 
                        placeholder="Password..."
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        className="w-full bg-slate-955/65 border border-slate-900 rounded-xl px-3 py-3 pl-10 text-sm text-slate-200 outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20 transition-all placeholder:text-slate-600"
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
                
                <div className="flex gap-2.5 items-center">
                  <div className="grid grid-cols-2 bg-slate-950 border border-slate-900 p-1 rounded-xl text-[9px] font-tech font-bold flex-1 relative overflow-hidden select-none">
                    <div 
                      className={`absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-lg bg-white/10 border border-white/20 transition-all duration-300 ease-out-back ${
                        mode === 'sac' ? 'translate-x-0' : 'translate-x-full'
                      }`} 
                    />
                    
                    <button 
                      onClick={() => setMode('sac')}
                      className={`py-1.5 rounded-lg z-10 transition-all text-center ${
                        mode === 'sac' ? 'text-white' : 'text-slate-500 hover:text-slate-400'
                      }`}
                    >
                      SAC SINGLE
                    </button>
                    <button 
                      onClick={() => setMode('msac')}
                      className={`py-1.5 rounded-lg z-10 transition-all text-center ${
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
                  className="w-full h-36 bg-slate-955/20 border border-slate-900/60 rounded-xl p-3.5 font-mono text-[11px] text-slate-200 outline-none focus:border-white/30 resize-none transition-all placeholder:text-slate-600 disabled:opacity-50"
                />

                <div className="flex gap-2">
                  {!isRunning ? (
                    <button 
                      onClick={runChecker}
                      className="bg-white hover:bg-slate-250 text-slate-950 font-tech text-xs font-bold py-3 rounded-xl flex-1 flex items-center justify-center gap-1.5 transition-all duration-300 hover:shadow-[0_0_20px_rgba(255,255,255,0.12)] active:scale-[0.98]"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" /> RUN CHECKER
                    </button>
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
              <div className="glass-panel glass-panel-glow-cyan rounded-2xl p-5 hover:border-slate-800/80 transition-all duration-300 flex flex-col gap-4">
                <div className="font-tech text-[10.5px] font-bold text-slate-400 tracking-wider">
                  <span>[02] BULK SOURCE</span>
                </div>
                
                <div 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('file-input')?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-300 bg-slate-955/40 ${
                    dragOver ? 'border-cyan-400 bg-cyan-500/10 shadow-[0_0_15px_rgba(6,182,212,0.1)] scale-[1.01]' : 'border-slate-900 hover:border-cyan-500/30 hover:bg-slate-900/20'
                  }`}
                >
                  <UploadCloud className="w-6 h-6 text-slate-505 mx-auto mb-2" />
                  <div className="font-tech text-[9.5px] font-bold text-slate-300">DRAG & DROP CARDS FILE</div>
                  <span className="font-tech text-[8px] text-slate-500 mt-1 block">Plain text .txt / .csv list</span>
                  <input 
                    type="file" 
                    id="file-input" 
                    accept=".txt,.csv" 
                    className="hidden" 
                    onChange={handleFileChange}
                  />
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

              {/* Data Pools */}
              <div className="glass-panel glass-panel-glow-cyan rounded-2xl p-5 hover:border-slate-800/80 transition-all duration-300 flex flex-col gap-4">
                <div className="font-tech text-[10.5px] font-bold text-slate-400 tracking-wider">
                  <span>[03] DATA POOLS</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
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
            <div className="glass-panel rounded-2xl flex flex-col overflow-hidden hover:border-slate-800/60 transition-all duration-300">
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
              </div>

              {/* Console Logs Lists */}
              <div className="flex-1 min-h-[350px] md:min-h-[480px] bg-slate-950/15 p-3 overflow-y-auto flex flex-col font-mono text-[10px] md:text-[11px] select-text">
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
                        <div key={i} className="flex flex-wrap md:flex-nowrap items-center gap-x-2.5 md:gap-x-3.5 gap-y-1.5 px-3 py-2 border-b border-slate-900/30 hover:bg-slate-900/40 transition-all whitespace-normal md:whitespace-nowrap animate-slide-up">
                          <span className="text-slate-600 text-[9px] shrink-0 font-medium">[{timeVal}]</span>
                          <span className={`px-2 py-0.5 border text-[8px] font-bold rounded-lg uppercase shrink-0 ${statusBg}`}>
                            [{displayStatus}]
                          </span>
                          <span className="text-slate-200 shrink-0 font-semibold text-[10.5px] md:text-[11.5px] tracking-wide">{r.card}</span>
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
                    placeholder="https://example.com"
                    value={adminAddSiteInput}
                    onChange={(e) => setAdminAddSiteInput(e.target.value)}
                    className="flex-1 bg-slate-950/65 border border-slate-900 rounded-xl px-3 py-2 text-xs text-slate-250 outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/25 transition-all placeholder:text-slate-700"
                  />
                  <button type="submit" className="py-2 px-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1 transition-all active:scale-[0.98] duration-200 hover:shadow-[0_0_12px_rgba(6,182,212,0.35)]">
                    <Plus className="w-3.5 h-3.5" /> ADD
                  </button>
                </form>

                <div className="bg-slate-950/65 border border-slate-900 rounded-xl p-3 text-[11px] text-slate-400 h-64 overflow-y-auto flex flex-col gap-1 select-text font-mono">
                  {dbInfo.sites.length === 0 ? (
                    <div className="text-slate-600 italic text-center my-auto font-tech">// No sites loaded in database</div>
                  ) : (
                    dbInfo.sites.map((site, i) => (
                      <div key={i} className="flex justify-between items-center py-1.5 px-2.5 hover:bg-slate-900/30 rounded-lg transition-all duration-150">
                        <span className="truncate text-slate-300 font-medium">{site}</span>
                        <button 
                          onClick={() => handleAdminDeleteSite(site)}
                          className="text-slate-500 hover:text-red-400 transition-all p-1 hover:bg-slate-950 border border-transparent hover:border-slate-900 rounded-md"
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
                    placeholder="user:pass@ip:port"
                    value={adminAddProxyInput}
                    onChange={(e) => setAdminAddProxyInput(e.target.value)}
                    className="flex-1 bg-slate-950/65 border border-slate-900 rounded-xl px-3 py-2 text-xs text-slate-250 outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/25 transition-all placeholder:text-slate-700"
                  />
                  <button type="submit" className="py-2 px-4 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white text-xs font-bold rounded-xl flex items-center gap-1 transition-all active:scale-[0.98] duration-200 hover:shadow-[0_0_12px_rgba(168,85,247,0.35)]">
                    <Plus className="w-3.5 h-3.5" /> ADD
                  </button>
                </form>

                <div className="bg-slate-950/65 border border-slate-900 rounded-xl p-3 text-[11px] text-slate-400 h-64 overflow-y-auto flex flex-col gap-1 select-text font-mono">
                  {dbInfo.proxies.length === 0 ? (
                    <div className="text-slate-600 italic text-center my-auto font-tech">// No proxies loaded in database</div>
                  ) : (
                    dbInfo.proxies.map((proxy, i) => (
                      <div key={i} className="flex justify-between items-center py-1.5 px-2.5 hover:bg-slate-900/30 rounded-lg transition-all duration-150">
                        <span className="truncate text-slate-300 font-medium">{proxy}</span>
                        <button 
                          onClick={() => handleAdminDeleteProxy(proxy)}
                          className="text-slate-500 hover:text-red-400 transition-all p-1 hover:bg-slate-950 border border-transparent hover:border-slate-900 rounded-md"
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
          MLSN // CONSOLE RUNNER CLIENT v1.4.0 &copy; 2026
        </footer>
      </main>
    </div>
  )
}
