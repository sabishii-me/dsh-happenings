import type { Env } from './env';
import type { EventRecord, Judgement } from '../domain/types';
import { listForJudging, saveJudgement } from './store';

const MODEL = '@cf/meta/llama-3.1-8b-instruct';

interface JudgePayload {
  relevance?: number;
  fit?: 'high' | 'medium' | 'low';
  why?: string;
  audience?: string[];
  risks?: string[];
  confidence?: number;
  aiStatus?: 'allowed' | 'restricted' | 'forbidden' | 'unknown';
  aiDetail?: string | null;
}

function buildPrompt(record: EventRecord): string {
  return [
    '你是活动情报的判断模块。只输出一行 JSON，不要解释。',
    '字段：relevance(0..1 与「AI 游戏 / vibe coding」读者的相关度)、fit(high|medium|low)、',
    'why(中文，≤80字，具体，不要营销话术)、confidence(0..1)、',
    'aiStatus(allowed|restricted|forbidden|unknown，只有下方证据明确写了规则才填，否则 unknown)、aiDetail(≤120字，可空)。',
    '',
    `标题：${record.title}`,
    `日期：${record.startDate}${record.endDate !== record.startDate ? ` 〜 ${record.endDate}` : ''}`,
    `形式：${record.mode} / 地区：${record.region}`,
    `地点：${record.venue ?? '未注明'}`,
    `主题：${record.topics.join(', ')}`,
    `来源：${record.sourceName ?? record.sourceUrl}`,
  ].join('\n');
}

function coerce(text: string, record: EventRecord): { judgement: Judgement; aiStatus: EventRecord['aiStatus']; aiDetail: string | null } | null {
  const match = /\{[\s\S]*\}/u.exec(text);
  if (!match) return null;
  let payload: JudgePayload;
  try {
    payload = JSON.parse(match[0]) as JudgePayload;
  } catch {
    return null;
  }
  const relevance = typeof payload.relevance === 'number' ? Math.max(0, Math.min(1, payload.relevance)) : null;
  const why = typeof payload.why === 'string' ? payload.why.slice(0, 220) : null;
  if (relevance == null || !why) return null;

  return {
    judgement: {
      relevance,
      fit: payload.fit ?? 'medium',
      why,
      audience: Array.isArray(payload.audience) ? payload.audience.slice(0, 4) : undefined,
      risks: Array.isArray(payload.risks) ? payload.risks.slice(0, 3) : undefined,
      confidence: typeof payload.confidence === 'number' ? payload.confidence : null,
      model: MODEL,
      judgedAt: new Date().toISOString(),
    },
    aiStatus: payload.aiStatus && payload.aiStatus !== 'unknown' ? payload.aiStatus : record.aiStatus,
    aiDetail: payload.aiDetail ? String(payload.aiDetail).slice(0, 600) : record.aiDetail,
  };
}

/**
 * AI slot. Runs on Workers AI when the binding exists; otherwise it is a no-op so
 * the site keeps working without a model.
 */
export async function judgePending(env: Env, options: { now?: Date; limit?: number } = {}): Promise<number> {
  if (!env.AI) return 0;
  const now = options.now ?? new Date();
  const pending = await listForJudging(env.DB, options.limit ?? 5);
  let judged = 0;

  for (const record of pending) {
    try {
      const response = (await env.AI.run(MODEL, {
        messages: [
          { role: 'system', content: '你只输出 JSON。' },
          { role: 'user', content: buildPrompt(record) },
        ],
        max_tokens: 400,
      })) as { response?: string };
      const text = response.response ?? '';
      const result = coerce(text, record);
      if (!result) continue;
      await saveJudgement(env.DB, record.id, result.judgement, result.aiStatus, result.aiDetail, now);
      judged += 1;
    } catch {
      // one failed judgement must not break the refresh
      break;
    }
  }
  return judged;
}
