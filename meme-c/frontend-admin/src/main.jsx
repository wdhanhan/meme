import React, { useEffect, useMemo, useState } from 'react'
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

function avg(arr) {
  const valid = arr.filter(Number.isFinite)
  if (!valid.length) return null
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
}

// ── StatsCard ─────────────────────────────────────────────────────────────────
function StatsCard({ label, value, sub, accent }) {
  return (
    <div className={`stat-card ${accent || ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

// ── TrainingCard ──────────────────────────────────────────────────────────────
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

// ── LatencyTimeline ───────────────────────────────────────────────────────────
// Shows a proportional horizontal bar of key milestones relative to total_ms
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
            <div
              key={key}
              className="timeline-marker"
              style={{ left: `${pct}%`, '--mc': color }}
              title={`${label}: ${fmtMs(ms)}`}
            >
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

// ── SegmentChart ──────────────────────────────────────────────────────────────
// Horizontal stacked bars, one per segment
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

// ── RecordCard ────────────────────────────────────────────────────────────────
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
        <div className="metric">
          <div className="metric-val">{fmtMs(rec.first_audio_ms)}</div>
          <div className="metric-key">首包延迟</div>
        </div>
        <div className="metric">
          <div className="metric-val">{fmtMs(rec.first_meta_ms)}</div>
          <div className="metric-key">断句完成</div>
        </div>
        <div className="metric">
          <div className="metric-val">{dsMs ? fmtMs(dsMs) : '—'}</div>
          <div className="metric-key">DeepSeek</div>
        </div>
        <div className="metric">
          <div className="metric-val">{fmtMs(rec.total_ms)}</div>
          <div className="metric-key">总耗时</div>
        </div>
      </div>

      <LatencyTimeline rec={rec} />

      {open && (
        <div className="rec-detail">
          {rec.error && <div className="error-msg">错误：{rec.error}</div>}
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

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  const [token, setToken] = useState(localStorage.getItem('memec_admin_token') || '')
  const [train, setTrain] = useState(null)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastRefresh, setLastRefresh] = useState(null)
  const [filterMode, setFilterMode] = useState('all')
  const [sortKey, setSortKey] = useState('time')

  const headers = useMemo(() => {
    const h = {}
    if (token.trim()) h['X-Admin-Token'] = token.trim()
    return h
  }, [token])

  useEffect(() => {
    localStorage.setItem('memec_admin_token', token)
  }, [token])

  async function loadTraining() {
    const r = await fetch('/api/admin/training', { headers })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
    setTrain(j)
  }

  async function loadGenerations() {
    const r = await fetch('/api/admin/generations?limit=100', { headers })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || j.hint || `HTTP ${r.status}`)
    setRecords(Array.isArray(j.items) ? j.items : [])
  }

  async function refreshAll() {
    setLoading(true)
    setError('')
    try {
      await Promise.all([loadTraining(), loadGenerations()])
      setLastRefresh(new Date())
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshAll()
    const t1 = setInterval(() => {
      loadTraining().catch((e) => setError(e.message || String(e)))
    }, 4000)
    const t2 = setInterval(() => {
      loadGenerations().catch((e) => setError(e.message || String(e)))
      setLastRefresh(new Date())
    }, 10000)
    return () => { clearInterval(t1); clearInterval(t2) }
  }, [headers])

  // aggregate stats
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
    <div className="page">
      {/* ── top bar ── */}
      <header className="topbar">
        <div className="topbar-left">
          <div className="topbar-logo">M</div>
          <div>
            <h1 className="topbar-title">Meme C 管理后台</h1>
            <p className="topbar-sub">多段分片 TTS 监控 · 训练进度</p>
          </div>
        </div>
        <div className="topbar-right">
          {lastRefresh && (
            <span className="refresh-time">
              上次刷新 {lastRefresh.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button className="btn-refresh" onClick={refreshAll} disabled={loading}>
            {loading ? '刷新中…' : '立即刷新'}
          </button>
          <a className="btn-link" href="/">返回首页</a>
        </div>
      </header>

      <div className="content">
        {/* ── token ── */}
        <div className="token-row">
          <label className="token-label">管理 Token（可选）</label>
          <input
            className="token-input"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="MEMEC_ADMIN_TOKEN"
            type="password"
          />
        </div>

        {error && <div className="alert-error">{error}</div>}

        {/* ── aggregate stats ── */}
        {stats && (
          <div className="stats-row">
            <StatsCard label="总请求数" value={stats.total} sub={`${stats.sleepCount} 睡前 / ${stats.normalCount} 普通`} />
            <StatsCard label="成功率" value={`${stats.succRate}%`} sub={stats.failCount ? `${stats.failCount} 次失败` : '无失败'} accent={stats.succRate >= 90 ? 'accent-green' : 'accent-red'} />
            <StatsCard label="平均首包" value={stats.avgFirstAudio ? fmtMs(stats.avgFirstAudio) : '—'} sub="首段音频就绪" accent="accent-blue" />
            <StatsCard label="平均总耗时" value={stats.avgTotal ? fmtMs(stats.avgTotal) : '—'} sub="全部播放完成" />
            <StatsCard label="平均 DeepSeek" value={stats.avgDs ? fmtMs(stats.avgDs) : '—'} sub="断句 API 耗时" accent="accent-purple" />
            <StatsCard label="平均分片数" value={stats.avgSegs ?? '—'} sub="每次请求" />
          </div>
        )}

        {/* ── training ── */}
        <TrainingCard train={train} />

        {/* ── records ── */}
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
            <div className="muted center">暂无记录，先在首页触发"多卡断句流式"</div>
          ) : (
            <div className="rec-list">
              {filteredRecords.map((rec) => (
                <RecordCard key={rec.id} rec={rec} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
