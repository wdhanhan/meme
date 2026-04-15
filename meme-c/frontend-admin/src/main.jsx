import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

function fmtMs(v) {
  if (v === null || v === undefined) return '-'
  return `${v} ms`
}

function parseNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function SegmentBars({ tts = [], enc = [] }) {
  const totalArr = tts.map((v, i) => parseNum(v) + parseNum(enc[i]))
  const max = Math.max(1, ...totalArr)
  return (
    <div className="segment-bars">
      {totalArr.map((sum, i) => {
        const t = parseNum(tts[i])
        const e = parseNum(enc[i])
        const h = Math.max(8, Math.round((sum / max) * 100))
        const tPct = sum > 0 ? (t / sum) * 100 : 0
        return (
          <div className="seg" key={i} title={`第${i + 1}片 Fish ${t}ms + 编码 ${e}ms`}>
            <div className="seg-label">#{i + 1}</div>
            <div className="seg-bar" style={{ height: `${h}%` }}>
              <div className="seg-tts" style={{ height: `${tPct}%` }} />
              <div className="seg-enc" style={{ height: `${100 - tPct}%` }} />
            </div>
            <div className="seg-ms">{sum}ms</div>
          </div>
        )
      })}
    </div>
  )
}

function ProgressLine({ rec }) {
  const total = Math.max(1, parseNum(rec.total_ms))
  const first = Math.min(total, Math.max(0, parseNum(rec.first_audio_ms)))
  const pct = Math.round((first / total) * 100)
  return (
    <div className="progress-wrap" title={`首包 ${first}ms / 总计 ${total}ms`}>
      <div className="progress-track">
        <div className="progress-first" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-text">首包 {first}ms ({pct}%) / 总计 {total}ms</div>
    </div>
  )
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('memec_admin_token') || '')
  const [train, setTrain] = useState(null)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
    const r = await fetch('/api/admin/generations?limit=50', { headers })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || j.hint || `HTTP ${r.status}`)
    setRecords(Array.isArray(j.items) ? j.items : [])
  }

  async function refreshAll() {
    setLoading(true)
    setError('')
    try {
      await Promise.all([loadTraining(), loadGenerations()])
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
    }, 10000)
    return () => {
      clearInterval(t1)
      clearInterval(t2)
    }
  }, [headers])

  return (
    <main className="page">
      <header className="top">
        <div>
          <h1>Meme C 管理后台（React）</h1>
          <p>可视化每次多段分片生成：首包、每片耗时、总耗时与训练进度。</p>
        </div>
        <a className="link" href="/">返回首页</a>
      </header>

      <section className="card controls">
        <label>管理 Token（可选）</label>
        <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="MEMEC_ADMIN_TOKEN" />
        <button onClick={refreshAll} disabled={loading}>{loading ? '刷新中...' : '刷新数据'}</button>
      </section>

      {error && <section className="card error">{error}</section>}

      <section className="card">
        <h2>训练进度</h2>
        {train ? (
          <>
            <div className="train-row">
              <span>状态：<b>{train.state || 'unknown'}</b></span>
              <span>更新时间：{train.updated_at || '-'}</span>
            </div>
            <div className="train-row">
              <span>Epoch：{train.epoch ?? '-'} / {train.total_epochs ?? '-'}</span>
              <span>Step：{train.step ?? '-'} / {train.total_steps ?? '-'}</span>
              <span>Percent：{train.percent ?? '-'}%</span>
            </div>
            {train.message && <div className="muted">{train.message}</div>}
          </>
        ) : <div className="muted">暂无数据</div>}
      </section>

      <section className="card">
        <h2>多段生成记录（最近 50 条）</h2>
        {records.length === 0 ? (
          <div className="muted">暂无记录，先在首页触发“多卡断句流式”</div>
        ) : (
          <div className="list">
            {records.map((rec) => (
              <article className="item" key={rec.id}>
                <div className="item-head">
                  <div>
                    <strong>{rec.created_at?.replace('T', ' ').slice(0, 19) || rec.id}</strong>
                    <span className="muted"> 片数：{rec.segment_count} · 模式：{rec.mode} · 语速：{rec.speed}</span>
                  </div>
                  <div className={rec.success ? 'ok' : 'bad'}>{rec.success ? '成功' : '失败'}</div>
                </div>

                <ProgressLine rec={rec} />

                <div className="stats-grid">
                  <div>首 meta：<b>{fmtMs(rec.first_meta_ms)}</b></div>
                  <div>首包：<b>{fmtMs(rec.first_audio_ms)}</b></div>
                  <div>优化：<b>{fmtMs(rec.optimize_ms)}</b></div>
                  <div>断句 DS：<b>{fmtMs(rec.deepseek_segment_ms)}</b></div>
                  <div>总计：<b>{fmtMs(rec.total_ms)}</b></div>
                </div>

                <div className="seg-title">每个分片可视化（蓝=Fish, 橙=编码）</div>
                <SegmentBars tts={rec.tts_per_segment_ms || []} enc={rec.encode_per_segment_ms || []} />

                {rec.error && <div className="bad">错误：{rec.error}</div>}
                <div className="preview">{rec.text_preview || ''}</div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
