import React, { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

/**
 * 解析 NDJSON 流并严格串行播放每个分片。
 *
 * 关键设计：
 *  - ctx 必须在调用此函数前已在用户手势同步栈中创建并 resume，
 *    否则 ctx.currentTime 会在 suspended 状态下停滞，导致所有分片
 *    计算出相同的 startAt 时间点而同步播放。
 *  - scheduleAt 累加每段时长，保证下一段紧接上一段结束后播放。
 *  - decodeChain 是串行 Promise 链，防止并发 decode 破坏 scheduleAt 顺序。
 */
async function playMultiSegmentStream(response, session, onStatus) {
  const { ctx } = session
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let carry = ''
  let scheduleAt = ctx.currentTime
  let decodeChain = Promise.resolve()

  const enqueueChunk = (obj) => {
    decodeChain = decodeChain.then(async () => {
      if (session.cancelled) return
      const bytes = Uint8Array.from(atob(obj.mp3_b64), (c) => c.charCodeAt(0))
      const audioBuf = await ctx.decodeAudioData(bytes.buffer)
      if (session.cancelled) return
      const src = ctx.createBufferSource()
      src.buffer = audioBuf
      src.connect(ctx.destination)
      // 严格串行：startAt >= scheduleAt（上一段结束时刻），不提前
      const startAt = Math.max(scheduleAt, ctx.currentTime + 0.05)
      src.start(startAt)
      scheduleAt = startAt + audioBuf.duration
      onStatus(
        `播放进度：第 ${obj.index + 1}/${obj.total} 段（${obj.upstream || ''}）`,
        'loading',
        { current: obj.index + 1, total: obj.total }
      )
    })
    return decodeChain
  }

  while (true) {
    const { done, value } = await reader.read()
    carry += decoder.decode(value || new Uint8Array(), { stream: !done })
    let nl
    while ((nl = carry.indexOf('\n')) >= 0) {
      const line = carry.slice(0, nl).trim()
      carry = carry.slice(nl + 1)
      if (!line) continue
      let obj
      try {
        obj = JSON.parse(line)
      } catch {
        throw new Error('NDJSON 解析失败: ' + line.slice(0, 120))
      }
      if (obj.type === 'meta') {
        onStatus(
          `断句 ${obj.count} 段，正在合成…（上游：${(obj.upstream_plan || []).join(' → ')}）`,
          'loading',
          { current: 0, total: obj.count }
        )
      } else if (obj.type === 'error') {
        throw new Error(obj.message || '合成错误')
      } else if (obj.type === 'done') {
        await decodeChain
        if (!session.cancelled) {
          const waitMs = Math.max(0, (scheduleAt - ctx.currentTime) * 1000)
          if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs + 100))
        }
        return
      } else if (obj.type === 'chunk' && obj.mp3_b64) {
        await enqueueChunk(obj)
      }
    }
    if (done) break
  }
  await decodeChain
}

function App() {
  const [text, setText] = useState('你好，这是 Meme C 的前端测试。')
  const [refId, setRefId] = useState('')
  const [mode, setMode] = useState('normal')
  const [speed, setSpeed] = useState('0.85')
  const [status, setStatus] = useState({ msg: '等待操作', type: 'idle', progress: null })
  const [busy, setBusy] = useState(false)
  const sessionRef = useRef(null)

  const setMsg = (msg, type = 'idle', progress = null) =>
    setStatus({ msg, type, progress })

  async function handleGenerate() {
    // ★ 关键：AudioContext 必须在点击处理器同步栈最开始创建，
    //    在任何 await 之前调用，确保处于浏览器"用户手势激活"窗口内。
    //    若在 await fetch(...) 之后创建，ctx.currentTime 会因 autoplay
    //    策略而处于 suspended 状态，导致所有分片同时播放。
    const ctx = new AudioContext()

    // 取消并关闭上一个 session
    if (sessionRef.current) {
      sessionRef.current.cancelled = true
      try { await sessionRef.current.ctx.close() } catch (_) {}
    }

    // 确保新 context 处于 running 状态
    if (ctx.state === 'suspended') await ctx.resume()

    const session = { ctx, cancelled: false }
    sessionRef.current = session

    const trimText = text.trim()
    if (!trimText) {
      setMsg('文本不能为空', 'err')
      return
    }

    setBusy(true)
    setMsg('请求断句与多段合成…', 'loading')

    try {
      const resp = await fetch('/api/tts/multi-segment-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: trimText,
          reference_id: refId.trim() || undefined,
          mode,
          speed: Number(speed) || 1.0,
        }),
      })
      if (!resp.ok) {
        const t = await resp.text()
        throw new Error(`HTTP ${resp.status}\n${t}`)
      }
      if (!resp.body) throw new Error('无响应体')
      await playMultiSegmentStream(resp, session, setMsg)
      if (!session.cancelled) setMsg('多段流式播放结束。', 'ok')
    } catch (e) {
      if (!session.cancelled) setMsg('失败:\n' + (e.message || String(e)), 'err')
    } finally {
      setBusy(false)
    }
  }

  const progressPct =
    status.progress && status.progress.total > 0
      ? Math.round((status.progress.current / status.progress.total) * 100)
      : 0

  return (
    <main className="page">
      <header>
        <h1>Meme C 声音复刻服务</h1>
        <p>
          公网访问地址：<b>http://147.139.141.118/</b>
          {' · '}
          <a href="/admin/">管理后台</a>
        </p>
      </header>

      <div className="card">
        <div className="row">
          <label>文本</label>
          <textarea
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="输入你要合成的文本"
          />
        </div>

        <div className="row">
          <label>参考音色 ID</label>
          <input
            type="text"
            value={refId}
            onChange={(e) => setRefId(e.target.value)}
            placeholder="例如 my_voice_001（留空使用默认音色）"
          />
        </div>

        <div className="row">
          <label>生成模式</label>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="normal">普通模式</option>
            <option value="sleep">睡前模式（自动加气口）</option>
          </select>
        </div>

        <div className="row">
          <label>语速（1.0 = 正常，0.85 = 慢一点）</label>
          <input
            type="number"
            step={0.05}
            min={0.5}
            max={2.0}
            value={speed}
            onChange={(e) => setSpeed(e.target.value)}
          />
        </div>

        <div className="row">
          <button className="gen-btn" onClick={handleGenerate} disabled={busy}>
            {busy ? '合成中…' : '多卡断句流式（DeepSeek 分句 + GPU 轮流）'}
          </button>
          <p className="hint">
            先由 DeepSeek 返回断句数组，再按句轮流分配到各 Fish GPU；严格串行播放，不会同时出声。
          </p>
        </div>
      </div>

      <div className={`status-box status-${status.type}`}>
        {status.msg}
        {status.type === 'loading' && status.progress && status.progress.total > 0 && (
          <div className="progress-bar-wrap">
            <div
              className="progress-bar-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
