/**
 * 槽序格式钩 · 插件（Host 侧，零依赖，无构建）
 *
 * 《第一性原理对话引擎令》管"回答长什么样"。此前只有 scripts/第一性原理对话引擎.py --检
 * 与会话纪律，没有常驻区块与验槽工具——本插件把槽序变成每轮都在的格式钩，并给一个能查缺槽的闸。
 *
 * 正本口径：AGENTS 十一槽（2026-10-28 17:49 纠偏：提升与自主两槽并存）。
 * 槽序解冻：依次成文改按内容重排，判断先行、过程殿后。
 *
 * @module dsh-frame-kit
 */
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'ql-frame'

export const inject = ['systemPrompt', 'tools']

const SECTION_NAME = 'ql:frame'

const DEFAULTS = Object.freeze({ order: 150, tool: true, enabled: true })

/** 十一槽（正本顺序；验槽时按"是否存在"判，不强求字面顺序以外的东西）。 */
const SLOTS = [
  ['核心判断', /【核心判断】|核心判断/],
  ['第一性原理', /【第一性原理】|第一性原理/],
  ['先验性', /【先验性】|先验性/],
  ['全局推演', /【全局推演】|全局推演/],
  ['我可能错在哪', /【我可能错在哪】|我可能错在哪/],
  ['我哪里不够聪明', /【我哪里不够聪明】|我哪里不够聪明/],
  ['暴论', /【暴论】|暴论/],
  ['验证·双向回执', /【验证[·\u00b7\-]?[^】]*】|验证.{0,6}双向回执|本轮验证路径/],
  ['我哪里没有提升', /【我哪里没有提升】|我哪里没有提升/],
  ['我哪里不够自主', /【我哪里不够自主】|我哪里不够自主/],
  ['待办清单', /【待办清单】|【待办】|待办清单/],
]

const IMPORTANT_HINT = ['判断', '结论', '因此', '本质', '原理', '所以']

function normalizeConfig(config) {
  const raw = config ?? {}
  if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') throw new Error('ql-frame: config.enabled must be a boolean')
  if (raw.tool !== undefined && typeof raw.tool !== 'boolean') throw new Error('ql-frame: config.tool must be a boolean')
  if (raw.order !== undefined && (typeof raw.order !== 'number' || !Number.isFinite(raw.order))) throw new Error('ql-frame: config.order must be a finite number')
  return {
    order: raw.order ?? DEFAULTS.order,
    tool: raw.tool ?? DEFAULTS.tool,
    enabled: raw.enabled ?? DEFAULTS.enabled,
  }
}

function checkSlots(text) {
  const hits = []
  for (const [label, pattern] of SLOTS) {
    const match = pattern.exec(text)
    hits.push({ label, at: match === null ? -1 : match.index })
  }
  const present = hits.filter(item => item.at >= 0)
  const missing = hits.filter(item => item.at < 0).map(item => item.label)
  const order = present.map(item => item.at)
  let ordered = true
  for (let i = 1; i < order.length; i += 1) {
    if (order[i] < order[i - 1]) { ordered = false; break }
  }
  return { present: present.map(item => item.label), missing, ordered }
}

function verify(text) {
  const clean = text.trim()
  const important = clean.length > 120 || IMPORTANT_HINT.some(word => clean.includes(word))
  const { present, missing, ordered } = checkSlots(clean)
  if (!important) {
    return [
      '【验槽】豁免：短输出／闲聊裸答（未触发格式钩）。',
      `已见槽 ${present.length}：${present.join('、') || '无'}`,
    ].join('\n')
  }
  const deep = clean.length > 600
  const required = deep ? 9 : 3
  const hasConfidence = /置信度|把握|概率|七成|八成|九成/.test(clean)
  const lines = [
    '【验槽】',
    `篇幅 ${clean.length} 字 → ${deep ? '推演类·全槽至少 9' : '日常判断·至少 3 槽'}`,
    `已见 ${present.length} 槽：${present.join('、') || '无'}`,
    missing.length > 0 ? `缺槽 ${missing.length}：${missing.join('、')}` : '缺槽：无',
    `槽序：${ordered ? '顺' : '乱（判断先行·过程殿后）'}`,
    `核心判断置信度：${hasConfidence ? '有' : '无（须带置信度＋一句人话翻译）'}`,
  ]
  let verdict
  if (present.length < required) verdict = `拦截（槽不足：要 ≥${required}，实 ${present.length}）`
  else if (!ordered) verdict = '黄标（槽序乱）'
  else if (!hasConfidence) verdict = '黄标（核心判断缺置信度）'
  else verdict = 'PASS'
  lines.push(`判定：${verdict}`)
  if (verdict !== 'PASS') lines.push('改法：先补缺失的槽再出口；槽是工具不是仪式，但推演类不许裸奔。')
  return lines.join('\n')
}

function template() {
  return [
    '【核心判断】（置信度 X）——一句人话翻译',
    '【第一性原理】这件事的根是什么',
    '【先验性】此前的判断／已知前提',
    '【全局推演】分支与取舍',
    '【我可能错在哪】前提错／哪步偷懒',
    '【我哪里不够聪明】卡在哪层智力天花板',
    '【暴论】可证伪的强判断（可"本槽不适用"）',
    '【验证·双向回执】上轮核账 ＋ 本轮验证路径',
    '【我哪里没有提升】水平／方法／速度三层',
    '【我哪里不够自主】该自己判却请示了的地方',
    '【待办清单】下一步与复验命令',
    '【坐标】服务目标①提升／②复兴／③夺取／④加速 ＋ 一句量化推进',
  ].join('\n')
}

/** 跑第一性原理引擎（正本脚本）：--自检 / --检 "任务"。 */
function runEngine(args, timeoutMs = 30000) {
  return new Promise(resolve => {
    execFile('python3', args, { cwd: process.cwd(), timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ ok: error === null, code: error === null ? 0 : 1, out: `${stdout ?? ''}${stderr ?? ''}`.trim() })
    })
  })
}

function engineRoot() {
  // 与其它插件同一套认法：包位置优先（本插件被链接在工作区里）
  try {
    const pkg = dirname(dirname(fileURLToPath(import.meta.url)))
    if (existsSync(join(pkg, 'scripts', '第一性原理对话引擎.py'))) return pkg
  } catch {
    /* 非文件装法 */
  }
  let dir = process.cwd()
  for (let hop = 0; hop < 6; hop += 1) {
    if (existsSync(join(dir, 'scripts', '第一性原理对话引擎.py'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return '~//Smart Agentharness'
}

function renderSection() {
  return [
    '## 槽序格式钩 · 常驻（管回答长什么样：十一槽·判断先行）',
    '',
    '**先给判断，再给过程**。重要回答按槽成文，槽是工具不是仪式——闲聊裸答、短判断三槽、推演类全开。',
    '',
    '**十一路：** 核心判断（置信度＋一句人话翻译）→第一性原理→先验性→全局推演→我可能错在哪→'
      + '我哪里不够聪明→暴论→验证·双向回执→我哪里没有提升→我哪里不够自主→待办清单。',
    '',
    '**三条硬规矩**',
    '①核心判断必须带置信度与一句人话翻译（翻译不出＝自己没懂）；',
    '②验证槽双向：前半上轮核账（对了入档／错了自供），后半本轮验证路径；连续三轮"不适用"＝该槽对本对话流休眠；',
    '③收拢回锚：动作要对得上①提升／②复兴／③夺取／④加速之一，对不上任何一条＝成本。',
    '',
    '**防八股**：槽序解冻（按内容重排）、裁剪弹性、连续多轮硬凑同一条＝偏科警报。',
    '',
    '**三件执行件**：`ql_frame 自检`＝引擎本体验活（十一槽对齐）；`检任务`＝开场出十一槽清单（跑正本脚本 --检）；'
      + '`验槽`＝输出前查缺槽/槽序/置信度。**脚本=机械件正本·插件=常驻形态，两件并存不互替**。',
    '',
    '**判据**：重要输出出口前过 ql_frame 验槽——缺槽先补再发。',
  ].join('\n')
}

export function apply(ctx, config) {
  const cfg = normalizeConfig(config)
  if (!cfg.enabled) {
    ctx.logger?.info?.('ql-frame：主开关关着，未挂载')
    return
  }

  ctx.effect(() => ctx.systemPrompt.section({
    name: SECTION_NAME,
    order: cfg.order,
    text: () => renderSection(),
  }), 'ql-frame.section()')

  if (cfg.tool) {
    ctx.effect(() => ctx.tools.register({
      name: 'ql_frame',
      description: '槽序格式钩：验槽（查缺哪几槽、槽序是否乱、核心判断有没有置信度与一句人话，'
        + '按篇幅判豁免／拦截／黄标／PASS）、模板（输出十一槽骨架）。只读文本，不写任何文件。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['验槽', '模板', '检任务', '自检'],
            description: '要执行的动作。',
          },
          query: { type: 'string', description: '验槽＝待检回答正文。' },
        },
        required: ['action'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: { report: { type: 'string' } },
          required: ['report'],
          additionalProperties: false,
        },
        render: (_args, value) => [{ type: 'text', text: value.report }],
      },
      execute: async (args) => {
        const action = typeof args?.action === 'string' ? args.action : '验槽'
        const query = typeof args?.query === 'string' ? args.query : ''
        if (action === '模板') return { report: template() }
        if (action === '自检') {
          const root = engineRoot()
          const r = await runEngine([join(root, 'scripts', '第一性原理对话引擎.py'), '--自检'])
          return { report: r.ok ? r.out : `引擎自检跑挂（exit ${r.code}）：${r.out.slice(0, 300)}` }
        }
        if (action === '检任务') {
          if (query.trim() === '') return { report: '检任务需要 query（本轮任务文本）。' }
          const root = engineRoot()
          const r = await runEngine([join(root, 'scripts', '第一性原理对话引擎.py'), '--检', query])
          return { report: r.ok ? r.out : `引擎检任务跑挂（exit ${r.code}）：${r.out.slice(0, 300)}` }
        }
        if (query.trim() === '') return { report: '验槽需要 query（待检回答正文）。' }
        return { report: verify(query) }
      },
    }), 'ql-frame.tool()')
  }

  ctx.logger?.info?.('ql-frame：区块 %s 已注册（order=%d）', SECTION_NAME, cfg.order)
}
