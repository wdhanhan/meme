/**
 * gen-stories.ts
 * 调用 DeepSeek API 逐篇生成 100 篇儿童睡前童话故事。
 * 每生成一篇立即写入 src/stories/ 目录，生成完成后汇总到 src/stories-data.ts。
 *
 * 运行：npx tsx scripts/gen-stories.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── 配置 ────────────────────────────────────────────────────
const API_KEY = 'sk-f96a655e607b4fe2a224748ec250d4f5';
const API_URL = 'https://api.deepseek.com/chat/completions';
const STORIES_DIR = path.resolve(__dirname, '../src/stories');
const OUT_PATH    = path.resolve(__dirname, '../src/stories-data.ts');

// ── DeepSeek 封装 ────────────────────────────────────────────
interface Message { role: 'user' | 'assistant' | 'system'; content: string; }

async function callDeepSeek(messages: Message[], maxTokens = 2000): Promise<string> {
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      max_tokens: maxTokens,
      temperature: 0.85,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`DeepSeek HTTP ${resp.status}: ${body}`);
  }
  const data = (await resp.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content.trim();
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/** 根据字数估算朗读时长（中文约 150 字/分钟） */
function estimateDuration(content: string): string {
  const mins = Math.max(2, Math.round(content.replace(/\s/g, '').length / 150));
  return `${String(mins).padStart(2, '0')}:00`;
}

// ── 步骤 1：生成 100 个题目 ──────────────────────────────────
async function fetchTitles(): Promise<string[]> {
  console.log('📋  Step 1/2  生成 100 个故事题目…');
  const text = await callDeepSeek([
    {
      role: 'user',
      content: `请为儿童睡前故事 APP 生成恰好 100 个原创中文童话故事题目。
要求：
- 适合 3-10 岁儿童
- 题目富有想象力和诗意
- 覆盖多种类型：动物故事、魔法奇遇、自然探索、友情成长、古风传说、科幻幻想
- 每行一个题目，不要序号，不要任何额外说明`,
    },
  ], 2000);

  const titles = text
    .split('\n')
    .map((t) => t.replace(/^[\d\.\、\s·\-]+/, '').trim())
    .filter((t) => t.length >= 2);

  if (titles.length < 100) {
    console.warn(`  ⚠️  只拿到 ${titles.length} 个题目，将重复补足`);
    while (titles.length < 100) titles.push(...titles.slice(0, 100 - titles.length));
  }
  return titles.slice(0, 100);
}

// ── 步骤 2：逐篇生成故事 ────────────────────────────────────
async function fetchOneStory(id: number, title: string): Promise<string> {
  const content = await callDeepSeek([
    {
      role: 'user',
      content: `请以《${title}》为题，创作一篇完整的儿童睡前故事。

要求：
- 400-600 字（汉字）
- 语言温暖舒缓，画面感强，适合大声朗读给孩子听
- 故事结构完整：开始 → 经历 → 温馨结局
- 结局让孩子感到安心、幸福，自然引导入睡
- 不出现暴力、恐怖、悲剧内容
- 只输出故事正文，不要标题，不要任何额外说明`,
    },
  ], 1500);
  return content;
}

// ── 主流程 ──────────────────────────────────────────────────
async function main() {
  console.log('🌙  梦幻粉色庇护所 — 故事生成脚本\n');

  // 准备输出目录
  fs.mkdirSync(STORIES_DIR, { recursive: true });

  // 扫描已生成的文件，支持断点续跑
  const existing = new Set(
    fs.readdirSync(STORIES_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => parseInt(f.split('-')[0], 10))
      .filter((n) => !isNaN(n)),
  );
  if (existing.size > 0) {
    console.log(`  💾  检测到 ${existing.size} 篇已生成的故事，跳过续跑\n`);
  }

  // 1. 拿题目
  const titles = await fetchTitles();
  console.log(`  ✅  共 ${titles.length} 个题目\n`);

  // 2. 逐篇生成
  console.log(`📖  Step 2/2  逐篇生成故事正文…\n`);

  for (let i = 0; i < titles.length; i++) {
    const id = i + 1;
    const title = titles[i];
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');
    const filename = `${String(id).padStart(3, '0')}-${safeTitle}.json`;
    const filepath = path.join(STORIES_DIR, filename);

    // 已存在则跳过
    if (existing.has(id)) {
      console.log(`  [${id}/100]  ⏭️  跳过（已存在）：${title}`);
      continue;
    }

    process.stdout.write(`  [${id}/100]  生成《${title}》… `);

    let content = '';
    try {
      content = await fetchOneStory(id, title);
    } catch (e) {
      console.log(`❌  失败：${(e as Error).message}`);
      content = '（故事内容生成失败，请重新运行脚本续跑）';
    }

    const storyObj = {
      id: String(id),
      title,
      content,
      duration: estimateDuration(content),
      imageUrl: `/assets/story-${((id - 1) % 5) + 1}.jpg`,
    };

    fs.writeFileSync(filepath, JSON.stringify(storyObj, null, 2), 'utf-8');
    console.log(`✅  已保存 → src/stories/${filename}`);

    // 请求间隔，避免触发限流
    if (i < titles.length - 1) await sleep(300);
  }

  // 3. 汇总所有 JSON 文件 → stories-data.ts
  console.log('\n📦  汇总故事数据 → src/stories-data.ts…');

  const files = fs.readdirSync(STORIES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  const allStories = files.map((f) => {
    const raw = fs.readFileSync(path.join(STORIES_DIR, f), 'utf-8');
    return JSON.parse(raw) as {
      id: string; title: string; content: string; duration: string; imageUrl: string;
    };
  });

  const tsContent = `// ⚠️  此文件由 scripts/gen-stories.ts 自动生成，请勿手动修改
// 生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
// 共 ${allStories.length} 篇故事，单篇源文件在 src/stories/ 目录

export interface StoryData {
  id: string;
  title: string;
  content: string;
  duration: string;
  imageUrl: string;
}

export const STORIES_DATA: StoryData[] = ${JSON.stringify(allStories, null, 2)};
`;

  fs.writeFileSync(OUT_PATH, tsContent, 'utf-8');

  console.log(`\n🎉  完成！共 ${allStories.length} 篇故事`);
  console.log(`📁  单篇文件：src/stories/*.json`);
  console.log(`📄  汇总文件：src/stories-data.ts`);
  console.log('\n💡  在 src/constants.ts 中替换 STORIES：');
  console.log(`    import { STORIES_DATA as STORIES } from './stories-data';`);
}

main().catch((e) => {
  console.error('\n💥  脚本出错：', e);
  process.exit(1);
});
