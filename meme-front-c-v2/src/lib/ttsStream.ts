/**
 * 解析 NDJSON 流并严格串行播放每个分片（与 meme-c 前端一致）。
 * AudioContext 须在用户手势同步栈内创建并 resume 后再调用本函数。
 */

export type StreamStatusKind = 'idle' | 'loading' | 'ok' | 'err';

export interface StreamSession {
  ctx: AudioContext;
  cancelled: boolean;
}

export type StreamProgress = { current: number; total: number };

export type OnStreamStatus = (
  msg: string,
  type: StreamStatusKind,
  progress?: StreamProgress | null
) => void;

interface NdjsonObj {
  type: string;
  count?: number;
  upstream_plan?: string[];
  message?: string;
  index?: number;
  total?: number;
  upstream?: string;
  mp3_b64?: string;
}

export async function playMultiSegmentStream(
  response: Response,
  session: StreamSession,
  onStatus: OnStreamStatus
): Promise<void> {
  const body = response.body;
  if (!body) throw new Error('无响应体');

  const { ctx } = session;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let carry = '';
  let scheduleAt = ctx.currentTime;
  let decodeChain: Promise<void> = Promise.resolve();

  const enqueueChunk = (obj: NdjsonObj): Promise<void> => {
    decodeChain = decodeChain.then(async () => {
      if (session.cancelled) return;
      const b64 = obj.mp3_b64;
      if (!b64) return;
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const audioBuf = await ctx.decodeAudioData(bytes.buffer.slice(0));
      if (session.cancelled) return;
      const src = ctx.createBufferSource();
      src.buffer = audioBuf;
      src.connect(ctx.destination);
      const startAt = Math.max(scheduleAt, ctx.currentTime + 0.05);
      src.start(startAt);
      scheduleAt = startAt + audioBuf.duration;
      onStatus(
        `播放进度：第 ${(obj.index ?? 0) + 1}/${obj.total ?? 0} 段（${obj.upstream || ''}）`,
        'loading',
        obj.total
          ? { current: (obj.index ?? 0) + 1, total: obj.total }
          : null
      );
    });
    return decodeChain;
  };

  while (true) {
    const { done, value } = await reader.read();
    carry += decoder.decode(value || new Uint8Array(), { stream: !done });
    let nl: number;
    while ((nl = carry.indexOf('\n')) >= 0) {
      const line = carry.slice(0, nl).trim();
      carry = carry.slice(nl + 1);
      if (!line) continue;
      let obj: NdjsonObj;
      try {
        obj = JSON.parse(line) as NdjsonObj;
      } catch {
        throw new Error(`NDJSON 解析失败: ${line.slice(0, 120)}`);
      }
      if (obj.type === 'meta') {
        onStatus(
          `断句 ${obj.count ?? 0} 段，正在合成…（计划上游：${(obj.upstream_plan || []).join(' → ')}）`,
          'loading',
          obj.count ? { current: 0, total: obj.count } : null
        );
      } else if (obj.type === 'error') {
        throw new Error(obj.message || '合成错误');
      } else if (obj.type === 'done') {
        await decodeChain;
        if (!session.cancelled) {
          const waitMs = Math.max(0, (scheduleAt - ctx.currentTime) * 1000);
          if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs + 100));
        }
        return;
      } else if (obj.type === 'chunk' && obj.mp3_b64) {
        await enqueueChunk(obj);
      }
    }
    if (done) break;
  }
  await decodeChain;
}
