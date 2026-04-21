import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

// ── helpers ──────────────────────────────────────────────────────────────────
function fmtMs(v) {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(2)}s`
  return `${n}ms`
}
function parseNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const pad = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
function fmtShortTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const pad = (x) => String(x).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
function fmtElapsed(sec) {
  if (sec < 0) sec = 0
  if (sec < 60) return `${sec.toFixed(1)}s`
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}m${String(s).padStart(2, '0')}s`
}
function avg(arr) {
  const valid = arr.filter(Number.isFinite)
  if (!valid.length) return null
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
}

// ── auth helpers ─────────────────────────────────────────────────────────────
const JWT_KEY = 'memec_admin_jwt'
const USER_KEY = 'memec_admin_user'
function getJwt() { return localStorage.getItem(JWT_KEY) || '' }
function setJwt(t) {
  if (t) localStorage.setItem(JWT_KEY, t)
  else localStorage.removeItem(JWT_KEY)
}
function getAdminUser() { return localStorage.getItem(USER_KEY) || '' }
function setAdminUser(u) {
  if (u) localStorage.setItem(USER_KEY, u)
  else localStorage.removeItem(USER_KEY)
}

async function adminFetch(url, opts = {}) {
  const headers = { ...(opts.headers || {}) }
  const jwt = getJwt()
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`
  const r = await fetch(url, { ...opts, headers })
  if (r.status === 401) {
    // 仅当使用过 JWT 时才清空登录状态。
    if (jwt) { setJwt(''); setAdminUser('') }
    const err = new Error('unauthorized')
    err.status = 401
    throw err
  }
  return r
}

// ── Login ────────────────────────────────────────────────────────────────────
function LoginScreen({ onLoggedIn }) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      const r = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setJwt(j.token)
      setAdminUser(j.user?.username || username)
      onLoggedIn()
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">M</div>
        <h1 className="login-title">Meme C 管理后台</h1>
        <p className="login-sub">请使用管理员账号登录</p>
        <label className="login-label">账号</label>
        <input className="login-input" value={username} onChange={(e) => setUsername(e.target.value)}
          autoFocus autoComplete="username" />
        <label className="login-label">密码</label>
        <input className="login-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password" />
        {err && <div className="alert-error" style={{ marginTop: 10, marginBottom: 0 }}>{err}</div>}
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  )
}

// ── GPU Dashboard ────────────────────────────────────────────────────────────
function nodeStatusBadge(status) {
  if (status === 'active') return { cls: 'badge-green', label: '活跃' }
  if (status === 'static') return { cls: 'badge-blue', label: '本地' }
  if (status === 'stale') return { cls: 'badge-amber', label: '离线中' }
  if (status === 'dead') return { cls: 'badge-red', label: '离线' }
  return { cls: 'badge-gray', label: status || 'unknown' }
}

function GPUCardView({ gpu, now }) {
  const { node_status } = gpu
  const probed = !!gpu.last_check_at
  const unreachable = probed && !gpu.healthy
  const dotClass = unreachable ? 'dot-fail'
    : gpu.busy ? 'dot-busy'
    : (node_status === 'active' || node_status === 'static') ? 'dot-ok'
    : node_status === 'stale' ? 'dot-stale' : 'dot-fail'
  const qPct = gpu.queue_cap > 0 ? Math.min(100, Math.round((gpu.queue_len / gpu.queue_cap) * 100)) : 0
  const inf = gpu.in_flight
  let elapsedSec = 0
  let progressPct = 0
  if (inf) {
    const started = new Date(inf.started_at).getTime()
    elapsedSec = Math.max(0, (now - started) / 1000)
    if (inf.seg_total > 0) {
      progressPct = Math.min(100, Math.round(((inf.seg_index + 0.5) / inf.seg_total) * 100))
    }
  }
  return (
    <div className={`gpu-card ${gpu.busy ? 'gpu-busy' : ''} ${unreachable ? 'gpu-down' : ''}`}>
      <div className="gpu-head">
        <span className={`status-dot ${dotClass}`} />
        <span className="gpu-title">{gpu.node_id}{gpu.gpu_index !== undefined ? ` · GPU#${gpu.gpu_index}` : ''}</span>
        {unreachable
          ? <span className="badge badge-red">连接失败</span>
          : <span className={`badge ${nodeStatusBadge(node_status).cls}`}>{nodeStatusBadge(node_status).label}</span>
        }
      </div>
      <div className="gpu-upstream" title={gpu.upstream}>{gpu.upstream}</div>
      <div className="gpu-meta-row">
        <span className="gpu-meta">队列 {gpu.queue_len}/{gpu.queue_cap}</span>
        {gpu.region && <span className="gpu-meta">{gpu.region}</span>}
        {gpu.last_check_at && (
          <span className={`gpu-meta ${unreachable ? 'txt-red' : 'muted'}`}>
            探活 {fmtShortTime(gpu.last_check_at)}
          </span>
        )}
      </div>
      {unreachable && gpu.last_error && (
        <div className="gpu-down-msg" title={gpu.last_error}>{gpu.last_error}</div>
      )}
      <div className="queue-track">
        <div className={`queue-fill ${qPct > 60 ? 'queue-fill-hot' : ''}`} style={{ width: `${qPct}%` }} />
      </div>

      {inf ? (
        <div className="gpu-task">
          <div className="gpu-task-head">
            <span className="badge badge-blue">{inf.task_kind || 'tts'}</span>
            <span className="gpu-task-id" title={inf.task_id}>
              任务 {String(inf.task_id || '').slice(-8)}
            </span>
            <span className="gpu-task-elapsed">{fmtElapsed(elapsedSec)}</span>
          </div>
          {inf.seg_total > 0 && (
            <div className="gpu-task-seg">
              分片 {inf.seg_index + 1}/{inf.seg_total}
              <div className="progress-track progress-sm">
                <div className="progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}
          {inf.text_preview && (
            <div className="gpu-task-text">{inf.text_preview}</div>
          )}
        </div>
      ) : (
        <div className="gpu-idle">空闲</div>
      )}
    </div>
  )
}

function NodeSummaryCard({ node }) {
  const st = nodeStatusBadge(node.status)
  return (
    <div className="node-card">
      <div className="node-head">
        <span className="node-title">{node.node_id}</span>
        <span className={`badge ${st.cls}`}>{st.label}</span>
      </div>
      <div className="node-meta">
        {node.region && <span>{node.region}</span>}
        {node.tailscale_ip && <span>{node.tailscale_ip}</span>}
      </div>
      <div className="node-nums">
        <div><b>{node.gpu_total}</b><span>配置</span></div>
        <div><b>{node.gpu_healthy}</b><span>健康</span></div>
        <div><b>{node.gpu_busy}</b><span>忙碌</span></div>
        <div className={node.gpu_unreachable ? 'num-red' : ''}>
          <b>{node.gpu_unreachable}</b><span>失联</span>
        </div>
      </div>
    </div>
  )
}

function GPUPanel() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const aliveRef = useRef(true)

  async function load() {
    try {
      const r = await adminFetch('/api/admin/gpus')
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      if (aliveRef.current) { setData(j); setError('') }
    } catch (e) {
      if (e.status !== 401 && aliveRef.current) setError(e.message || String(e))
    }
  }

  useEffect(() => {
    aliveRef.current = true
    load()
    const poll = setInterval(load, 2000)
    const tick = setInterval(() => setNow(Date.now()), 500)
    return () => { aliveRef.current = false; clearInterval(poll); clearInterval(tick) }
  }, [])

  const nodes = data?.nodes || []
  const gpus = data?.gpus || []

  return (
    <>
      {error && <div className="alert-error">{error}</div>}
      <div className="stats-row">
        <div className="stat-card accent-blue">
          <div className="stat-value">{data ? data.total_gpus : '—'}</div>
          <div className="stat-label">配置的 GPU</div>
          <div className="stat-sub">{nodes.length} 个节点 · 含离线</div>
        </div>
        <div className="stat-card accent-green">
          <div className="stat-value">{data ? data.healthy_gpus : '—'}</div>
          <div className="stat-label">健康 GPU</div>
          <div className="stat-sub">探活通过</div>
        </div>
        <div className="stat-card accent-purple">
          <div className="stat-value">{data ? data.busy_gpus : '—'}</div>
          <div className="stat-label">正在处理</div>
          <div className="stat-sub">当前 in-flight</div>
        </div>
        <div className={`stat-card ${data && data.unreachable_gpus ? 'accent-red' : ''}`}>
          <div className="stat-value">{data ? data.unreachable_gpus : '—'}</div>
          <div className="stat-label">连接失败</div>
          <div className="stat-sub">env 配了但连不上</div>
        </div>
      </div>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">节点概览</h2>
        </div>
        {nodes.length === 0 ? (
          <div className="muted center">暂无节点信息</div>
        ) : (
          <div className="node-grid">
            {nodes.map((n) => <NodeSummaryCard key={n.node_id} node={n} />)}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">GPU 任务看板</h2>
          <span className="muted" style={{ fontSize: 12 }}>
            {data ? `更新于 ${fmtShortTime(data.updated_at)}` : '加载中…'} · 2s 自动刷新
          </span>
        </div>
        {gpus.length === 0 ? (
          <div className="muted center">当前 UpstreamPool 中没有可用 GPU</div>
        ) : (
          <div className="gpu-grid">
            {gpus.map((g) => <GPUCardView key={g.upstream} gpu={g} now={now} />)}
          </div>
        )}
      </section>
    </>
  )
}

// ── TrainingCard ─────────────────────────────────────────────────────────────
function TrainingCard({ train }) {
  if (!train) return (
    <section className="card">
      <h2 className="card-title">训练进度</h2>
      <div className="muted center">暂无训练数据</div>
    </section>
  )
  const pct = Math.min(100, Math.max(0, parseNum(train.percent)))
  const stateColor = { running: 'badge-blue', done: 'badge-green', error: 'badge-red', idle: 'badge-gray' }
  const sc = stateColor[train.state] || 'badge-gray'
  return (
    <section className="card">
      <div className="card-header">
        <h2 className="card-title">训练进度</h2>
        <span className={`badge ${sc}`}>{train.state || 'unknown'}</span>
      </div>
      <div className="train-progress-wrap">
        <div className="train-progress-track">
          <div className="train-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="train-progress-label">{pct}%</div>
      </div>
      <div className="train-meta">
        <span>Epoch <b>{train.epoch ?? '—'}</b> / {train.total_epochs ?? '—'}</span>
        <span>Step <b>{train.step ?? '—'}</b> / {train.total_steps ?? '—'}</span>
        {train.updated_at && <span className="muted">更新于 {fmtTime(train.updated_at)}</span>}
      </div>
      {train.message && <div className="train-msg">{train.message}</div>}
    </section>
  )
}

// ── LatencyTimeline ──────────────────────────────────────────────────────────
function LatencyTimeline({ rec }) {
  const total = Math.max(1, parseNum(rec.total_ms))
  const milestones = [
    { key: 'first_meta_ms', label: '断句', color: '#a78bfa' },
    { key: 'first_audio_ms', label: '首包', color: '#3b82f6' },
    { key: 'total_ms', label: '结束', color: '#10b981' },
  ]
  return (
    <div className="timeline-wrap">
      <div className="timeline-track">
        {milestones.map(({ key, label, color }) => {
          const ms = parseNum(rec[key])
          if (!ms) return null
          const pct = Math.min(100, Math.round((ms / total) * 100))
          return (
            <div key={key} className="timeline-marker" style={{ left: `${pct}%`, '--mc': color }}
              title={`${label}: ${fmtMs(ms)}`}>
              <div className="timeline-dot" />
              <div className="timeline-tick-label">{label}<br />{fmtMs(ms)}</div>
            </div>
          )
        })}
        <div className="timeline-bar" />
      </div>
    </div>
  )
}

// ── SegmentChart ─────────────────────────────────────────────────────────────
function SegmentChart({ tts = [], enc = [], texts = [] }) {
  const totals = tts.map((v, i) => parseNum(v) + parseNum(enc[i]))
  const maxVal = Math.max(1, ...totals)
  if (!totals.length) return null
  return (
    <div className="seg-chart">
      {totals.map((sum, i) => {
        const t = parseNum(tts[i])
        const e = parseNum(enc[i])
        const tPct = sum > 0 ? (t / sum) * 100 : 0
        const barW = Math.max(8, Math.round((sum / maxVal) * 100))
        const tip = `第 ${i+1} 片 · Fish TTS ${t}ms · 编码 ${e}ms · 合计 ${sum}ms${texts[i] ? '\n' + texts[i].slice(0, 60) : ''}`
        return (
          <div className="seg-row" key={i} title={tip}>
            <div className="seg-row-label">#{i + 1}</div>
            <div className="seg-row-bar-wrap">
              <div className="seg-row-bar" style={{ width: `${barW}%` }}>
                <div className="seg-row-tts" style={{ width: `${tPct}%` }} />
                <div className="seg-row-enc" style={{ width: `${100 - tPct}%` }} />
              </div>
              <span className="seg-row-ms">{fmtMs(sum)}</span>
            </div>
          </div>
        )
      })}
      <div className="seg-legend">
        <span><span className="legend-dot" style={{ background: '#3b82f6' }} />Fish TTS</span>
        <span><span className="legend-dot" style={{ background: '#f59e0b' }} />编码</span>
      </div>
    </div>
  )
}

// ── RecordCard ───────────────────────────────────────────────────────────────
function RecordCard({ rec }) {
  const [open, setOpen] = useState(false)
  const modeLabel = rec.mode === 'sleep' ? '睡前' : '普通'
  const modeClass = rec.mode === 'sleep' ? 'badge-purple' : 'badge-blue'
  const ttsList = rec.tts_per_segment_ms || []
  const encList = rec.encode_per_segment_ms || []
  const dsMs = parseNum(rec.deepseek_segment_ms)

  return (
    <article className={`rec-card ${rec.success ? '' : 'rec-fail'}`}>
      <div className="rec-head" onClick={() => setOpen((v) => !v)} role="button" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setOpen((v) => !v)}>
        <div className="rec-head-left">
          <span className="rec-time">{fmtTime(rec.created_at)}</span>
          <span className={`badge ${modeClass}`}>{modeLabel}</span>
          <span className="badge badge-gray">×{rec.segment_count} 片</span>
          {rec.speed && rec.speed !== 1 && (
            <span className="badge badge-gray">×{rec.speed} 速</span>
          )}
        </div>
        <div className="rec-head-right">
          <span className={`status-dot ${rec.success ? 'dot-ok' : 'dot-fail'}`} />
          <span className="rec-total">{fmtMs(rec.total_ms)}</span>
          <span className="rec-chevron">{open ? '▲' : '▼'}</span>
        </div>
      </div>
      <div className="rec-preview">{rec.text_preview || ''}</div>
      <div className="rec-metrics">
        <div className="metric"><div className="metric-val">{fmtMs(rec.first_audio_ms)}</div><div className="metric-key">首包延迟</div></div>
        <div className="metric"><div className="metric-val">{fmtMs(rec.first_meta_ms)}</div><div className="metric-key">断句完成</div></div>
        <div className="metric">
          <div className="metric-val">{dsMs ? fmtMs(dsMs) : (parseNum(rec.optimize_ms) ? fmtMs(rec.optimize_ms) : '—')}</div>
          <div className="metric-key">分段准备</div>
        </div>
        <div className="metric"><div className="metric-val">{fmtMs(rec.total_ms)}</div><div className="metric-key">总耗时</div></div>
      </div>
      <LatencyTimeline rec={rec} />
      {open && (
        <div className="rec-detail">
          {rec.error && <div className="error-msg">错误：{rec.error}</div>}
          {rec.final_input_text && (
            <>
              <div className="detail-label">最终送入 GPU 文本</div>
              <pre className="train-msg" style={{ whiteSpace: 'pre-wrap' }}>{rec.final_input_text}</pre>
            </>
          )}
          <div className="detail-label">各分片耗时</div>
          <SegmentChart tts={ttsList} enc={encList} />
          {rec.optimize_ms > 0 && (
            <div className="detail-row">
              <span className="muted">优化耗时：</span>{fmtMs(rec.optimize_ms)}
            </div>
          )}
        </div>
      )}
    </article>
  )
}

// ── RecordsPanel ─────────────────────────────────────────────────────────────
function RecordsPanel() {
  const [records, setRecords] = useState([])
  const [train, setTrain] = useState(null)
  const [error, setError] = useState('')
  const [filterMode, setFilterMode] = useState('all')
  const [sortKey, setSortKey] = useState('time')
  const aliveRef = useRef(true)

  async function loadGen() {
    try {
      const r = await adminFetch('/api/admin/generations?limit=100')
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      if (aliveRef.current) setRecords(Array.isArray(j.items) ? j.items : [])
    } catch (e) {
      if (e.status !== 401 && aliveRef.current) setError(e.message || String(e))
    }
  }
  async function loadTrain() {
    try {
      const r = await adminFetch('/api/admin/training')
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      if (aliveRef.current) setTrain(j)
    } catch (e) {
      if (e.status !== 401 && aliveRef.current) setError(e.message || String(e))
    }
  }

  useEffect(() => {
    aliveRef.current = true
    loadGen(); loadTrain()
    const t1 = setInterval(loadTrain, 4000)
    const t2 = setInterval(loadGen, 10000)
    return () => { aliveRef.current = false; clearInterval(t1); clearInterval(t2) }
  }, [])

  const stats = useMemo(() => {
    if (!records.length) return null
    const succ = records.filter((r) => r.success)
    const fail = records.filter((r) => !r.success)
    const firstAudios = succ.map((r) => parseNum(r.first_audio_ms)).filter(Boolean)
    const totals = succ.map((r) => parseNum(r.total_ms)).filter(Boolean)
    const dsArr = succ.map((r) => parseNum(r.deepseek_segment_ms)).filter(Boolean)
    const segCounts = succ.map((r) => parseNum(r.segment_count)).filter(Boolean)
    return {
      total: records.length,
      succRate: Math.round((succ.length / records.length) * 100),
      failCount: fail.length,
      avgFirstAudio: avg(firstAudios),
      avgTotal: avg(totals),
      avgDs: avg(dsArr),
      avgSegs: segCounts.length ? (segCounts.reduce((a, b) => a + b, 0) / segCounts.length).toFixed(1) : null,
      sleepCount: records.filter((r) => r.mode === 'sleep').length,
      normalCount: records.filter((r) => r.mode !== 'sleep').length,
    }
  }, [records])

  const filteredRecords = useMemo(() => {
    let list = [...records]
    if (filterMode === 'sleep') list = list.filter((r) => r.mode === 'sleep')
    if (filterMode === 'normal') list = list.filter((r) => r.mode !== 'sleep')
    if (filterMode === 'fail') list = list.filter((r) => !r.success)
    if (sortKey === 'first_audio') list.sort((a, b) => parseNum(a.first_audio_ms) - parseNum(b.first_audio_ms))
    else if (sortKey === 'total') list.sort((a, b) => parseNum(a.total_ms) - parseNum(b.total_ms))
    else list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    return list
  }, [records, filterMode, sortKey])

  return (
    <>
      {error && <div className="alert-error">{error}</div>}
      {stats && (
        <div className="stats-row">
          <div className="stat-card"><div className="stat-value">{stats.total}</div><div className="stat-label">总请求数</div><div className="stat-sub">{stats.sleepCount} 睡前 / {stats.normalCount} 普通</div></div>
          <div className={`stat-card ${stats.succRate >= 90 ? 'accent-green' : 'accent-red'}`}><div className="stat-value">{stats.succRate}%</div><div className="stat-label">成功率</div><div className="stat-sub">{stats.failCount ? `${stats.failCount} 次失败` : '无失败'}</div></div>
          <div className="stat-card accent-blue"><div className="stat-value">{stats.avgFirstAudio ? fmtMs(stats.avgFirstAudio) : '—'}</div><div className="stat-label">平均首包</div><div className="stat-sub">首段音频就绪</div></div>
          <div className="stat-card"><div className="stat-value">{stats.avgTotal ? fmtMs(stats.avgTotal) : '—'}</div><div className="stat-label">平均总耗时</div><div className="stat-sub">全部播放完成</div></div>
          <div className="stat-card accent-purple"><div className="stat-value">{stats.avgDs ? fmtMs(stats.avgDs) : '—'}</div><div className="stat-label">平均 DeepSeek</div><div className="stat-sub">断句 API 耗时</div></div>
          <div className="stat-card"><div className="stat-value">{stats.avgSegs ?? '—'}</div><div className="stat-label">平均分片数</div><div className="stat-sub">每次请求</div></div>
        </div>
      )}
      <TrainingCard train={train} />
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">生成记录（最近 100 条）</h2>
          <div className="filter-row">
            <select className="filter-select" value={filterMode} onChange={(e) => setFilterMode(e.target.value)}>
              <option value="all">全部模式</option>
              <option value="sleep">睡前模式</option>
              <option value="normal">普通模式</option>
              <option value="fail">仅失败</option>
            </select>
            <select className="filter-select" value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
              <option value="time">按时间排序</option>
              <option value="first_audio">按首包延迟</option>
              <option value="total">按总耗时</option>
            </select>
          </div>
        </div>
        {filteredRecords.length === 0 ? (
          <div className="muted center">暂无记录，先在首页触发“多卡断句流式”</div>
        ) : (
          <div className="rec-list">
            {filteredRecords.map((rec) => <RecordCard key={rec.id} rec={rec} />)}
          </div>
        )}
      </section>
    </>
  )
}

// ── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [loggedIn, setLoggedIn] = useState(!!getJwt())
  const [tab, setTab] = useState('gpu')

  function logout() {
    setJwt(''); setAdminUser(''); setLoggedIn(false)
  }

  // 每次渲染前校验 JWT 是否还在；其他 adminFetch 里会处理 401。
  useEffect(() => {
    function onStorage() { setLoggedIn(!!getJwt()) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  if (!loggedIn) {
    return <LoginScreen onLoggedIn={() => setLoggedIn(true)} />
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-left">
          <div className="topbar-logo">M</div>
          <div>
            <h1 className="topbar-title">Meme C 管理后台</h1>
            <p className="topbar-sub">GPU 调度 · 生成记录 · 训练进度</p>
          </div>
        </div>
        <div className="topbar-right">
          <span className="refresh-time">{getAdminUser() && `已登录 ${getAdminUser()}`}</span>
          <a className="btn-link" href="/">返回首页</a>
          <button className="btn-link" onClick={logout}>退出登录</button>
        </div>
      </header>

      <div className="tabs">
        <button className={`tab ${tab === 'gpu' ? 'tab-active' : ''}`} onClick={() => setTab('gpu')}>GPU 调度</button>
        <button className={`tab ${tab === 'records' ? 'tab-active' : ''}`} onClick={() => setTab('records')}>生成记录 · 训练</button>
      </div>

      <div className="content">
        {tab === 'gpu' ? <GPUPanel /> : <RecordsPanel />}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
