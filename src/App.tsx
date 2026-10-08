import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Copyright,
  Download,
  FileText,
  Flame,
  LayoutDashboard,
  MoreHorizontal,
  Printer,
  Sparkles,
  Target,
  Trophy,
  X,
} from 'lucide-react'

type Range = 20 | 50 | 100
type Mode = '混合运算' | '加法强化' | '减法强化'
type Question = { expression: string; answer: number; difficulty: string }
type AnswerKey = { answers: number[]; page: number; range: number }

const QUESTIONS_PER_PAGE = 60
const QUESTIONS_PER_COLUMN = 20
const PAGE_OPTIONS = [1, 3, 5, 10] as const

function makeAnswerUrl(answers: number[], page: number, range: Range): string {
  const url = new URL(window.location.href)
  url.hash = new URLSearchParams({
    answers: answers.map((answer) => answer.toString(36)).join('.'),
    page: String(page),
    range: String(range),
  }).toString()
  return url.toString()
}

function readAnswerKey(): AnswerKey | null {
  const params = new URLSearchParams(window.location.hash.slice(1))
  const answers = params.get('answers')?.split('.').map((value) => Number.parseInt(value, 36))
  const page = Number(params.get('page'))
  const range = Number(params.get('range'))
  if (!answers || answers.length !== QUESTIONS_PER_PAGE || answers.some(Number.isNaN) || !Number.isInteger(page) || page < 1 || ![20, 50, 100].includes(range)) return null
  return { answers, page, range }
}

function AnswerQr({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (canvasRef.current) QRCode.toCanvas(canvasRef.current, url, { errorCorrectionLevel: 'M', margin: 1, width: 170 })
  }, [url])

  return <canvas ref={canvasRef} aria-label="扫码查看本页答案" />
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

function toBytes(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.split(',')[1])
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function createPdf(images: Uint8Array[], width: number, height: number): Blob {
  const pageWidth = 595.28
  const pageHeight = 841.89
  const pageIds = images.map((_, index) => 3 + index * 3)
  const objects: Uint8Array[] = []
  const encoder = new TextEncoder()
  const text = (value: string) => encoder.encode(value)

  objects[1] = text('<< /Type /Catalog /Pages 2 0 R >>')
  objects[2] = text(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${images.length} >>`)

  images.forEach((image, index) => {
    const pageId = 3 + index * 3
    const contentId = pageId + 1
    const imageId = pageId + 2
    objects[pageId] = text(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`)
    const content = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`
    objects[contentId] = text(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    objects[imageId] = new Uint8Array([...text(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`), ...image, ...text('\nendstream')])
  })

  const chunks: Uint8Array[] = [text('%PDF-1.4\n%\xff\xff\xff\xff\n')]
  const offsets = [0]
  let byteLength = chunks[0].length
  objects.forEach((object, index) => {
    if (!object) return
    const chunk = new Uint8Array([...text(`${index} 0 obj\n`), ...object, ...text('\nendobj\n')])
    offsets[index] = byteLength
    chunks.push(chunk)
    byteLength += chunk.length
  })

  const xrefOffset = byteLength
  const xref = [`xref`, `0 ${objects.length}`, `0000000000 65535 f `]
  for (let index = 1; index < objects.length; index += 1) xref.push(`${String(offsets[index]).padStart(10, '0')} 00000 n `)
  xref.push(`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`)
  chunks.push(text(`${xref.join('\n')}\n`))
  return new Blob(chunks as BlobPart[], { type: 'application/pdf' })
}

async function createWorksheetPdf(questions: Question[], range: Range): Promise<Blob> {
  await document.fonts.ready
  const renderScale = 2
  const pageWidth = 794
  const pageHeight = 1123
  const canvasWidth = pageWidth * renderScale
  const canvasHeight = pageHeight * renderScale
  const pixelsPerMm = 3.78
  const images = await Promise.all(Array.from({ length: Math.ceil(questions.length / QUESTIONS_PER_PAGE) }, async (_, pageIndex) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvasWidth
    canvas.height = canvasHeight
    const context = canvas.getContext('2d')!
    context.scale(renderScale, renderScale)
    const pageQuestions = questions.slice(pageIndex * QUESTIONS_PER_PAGE, (pageIndex + 1) * QUESTIONS_PER_PAGE)
    const answerUrl = makeAnswerUrl(pageQuestions.map((question) => question.answer), pageIndex + 1, range)
    const qrCanvas = document.createElement('canvas')
    await QRCode.toCanvas(qrCanvas, answerUrl, { errorCorrectionLevel: 'M', margin: 1, width: 340 })
    const qr = await loadImage(qrCanvas.toDataURL())

    context.fillStyle = '#fff'
    context.fillRect(0, 0, pageWidth, pageHeight)
    context.fillStyle = '#111'
    context.textAlign = 'center'
    context.font = '700 25px "Noto Sans SC", sans-serif'
    context.fillText(`${range}以内的连加连减混合`, pageWidth / 2, 110)
    const qrLeft = (200 - 12.35 - 27.8) * pixelsPerMm
    context.drawImage(qr, qrLeft, 18 * pixelsPerMm, 25 * pixelsPerMm, 25 * pixelsPerMm)
    context.font = '9.33px "Noto Sans SC", sans-serif'
    context.fillStyle = '#222'
    context.textAlign = 'center'
    context.fillText('扫码查看答案', qrLeft + 13.9 * pixelsPerMm, 18 * pixelsPerMm + 29 * pixelsPerMm)
    context.font = '12px "Noto Sans SC", sans-serif'
    context.fillStyle = '#666'
    context.textAlign = 'left'
    const fieldWidth = (123.4 - 3 * 9.9) / 4
    ;['姓名', '日期', '用时', '成绩'].forEach((label, index) => {
      const x = (29.3 + index * (fieldWidth + 9.9)) * pixelsPerMm
      context.fillText(label, x, 145)
      context.fillRect(x + 27, 146, fieldWidth * pixelsPerMm - 27, 1)
    })

    const columnXs = [15.2, 15.2 + 45 + 20, 15.2 + (45 + 20) * 2].map((value) => value * pixelsPerMm)
    const rowHeight = (205 * pixelsPerMm) / QUESTIONS_PER_COLUMN
    context.fillStyle = '#111'
    context.font = '400 21.33px "Century Custom", serif'
    pageQuestions.forEach((question, index) => {
      const column = Math.floor(index / QUESTIONS_PER_COLUMN)
      const row = index % QUESTIONS_PER_COLUMN
      const number = row * 3 + column + 1
      const y = 49.3 * pixelsPerMm + (row + 0.5) * rowHeight
      context.textAlign = 'right'
      context.font = '10.67px Arial, sans-serif'
      context.fillStyle = '#f2f2f2'
      context.fillText(`(${number})`, columnXs[column] + 8.3 * pixelsPerMm, y)
      context.textAlign = 'left'
      context.font = '400 21.33px "Century Custom", serif'
      context.fillStyle = '#111'
      context.fillText(`${question.expression} =`, columnXs[column] + 10 * pixelsPerMm, y)
    })

    context.textAlign = 'center'
    context.font = '9.33px "Noto Sans SC", sans-serif'
    context.fillStyle = '#777'
    context.fillText('微信搜索「魔力娃口算」，在线口算学习训练，下载打印', pageWidth / 2, (287 - 12) * pixelsPerMm)
    context.textAlign = 'right'
    context.fillText(`第(${pageIndex + 1})页`, pageWidth - 12 * pixelsPerMm, (287 - 12) * pixelsPerMm)
    return toBytes(canvas.toDataURL('image/jpeg', 0.95))
  }))
  return createPdf(images, canvasWidth, canvasHeight)
}

function AnswerKeyView({ answerKey }: { answerKey: AnswerKey }) {
  return <main className="answer-key-page"><header><p className="eyebrow">ANSWER KEY</p><h1>{answerKey.range} 以内练习答案</h1><p>第 {answerKey.page} 页 · 共 60 题</p></header><section className="answer-key-grid">{Array.from({ length: 3 }, (_, column) => <div key={column}>{answerKey.answers.slice(column * QUESTIONS_PER_COLUMN, (column + 1) * QUESTIONS_PER_COLUMN).map((answer, index) => <p key={index}><span>第 {index * 3 + column + 1} 题</span><strong>{answer}</strong></p>)}</div>)}</section><a href={window.location.pathname}>返回练习</a></main>
}

function makeQuestions(range: Range, mode: Mode, amount: number, seedOffset = 0): Question[] {
  const items: Question[] = []
  let pageExpressions = new Set<string>()

  for (let index = 0; index < amount; index += 1) {
    const pageIndex = Math.floor(index / QUESTIONS_PER_PAGE)
    if (index % QUESTIONS_PER_PAGE === 0) pageExpressions = new Set<string>()

    let attempt = 0
    let question: Question
    do {
      const seed = Math.floor(Math.random() * 1_000_000_000) + index * 37 + pageIndex * 104729 + attempt * 7919 + range * 11 + mode.length * 7 + seedOffset * 104729
      const consecutiveSubtraction = mode === '减法强化' || (mode === '混合运算' && Math.random() < 0.5)

      if (consecutiveSubtraction) {
        const first = (seed % (range - 5)) + 6
        const second = ((seed * 3) % (first - 3)) + 2
        const third = ((seed * 5) % (first - second - 1)) + 2
        question = {
          expression: `${first} − ${second} − ${third}`,
          answer: first - second - third,
          difficulty: index % 4 === 0 ? '需要专注' : '基础巩固',
        }
      } else {
        const first = (seed % (range - 5)) + 2
        const second = ((seed * 3) % (range - first - 3)) + 2
        const third = ((seed * 5) % (range - first - second - 1)) + 2
        question = {
          expression: `${first} + ${second} + ${third}`,
          answer: first + second + third,
          difficulty: index % 4 === 0 ? '需要专注' : '基础巩固',
        }
      }
      attempt += 1
    } while (pageExpressions.has(question.expression))

    pageExpressions.add(question.expression)
    items.push(question)
  }

  return items
}

function App() {
  const [range, setRange] = useState<Range>(20)
  const [mode, setMode] = useState<Mode>('混合运算')
  const [pageCount, setPageCount] = useState<number>(1)
  const [activeView, setActiveView] = useState('今日练习')
  const [showGenerator, setShowGenerator] = useState(false)
  const [showAnswerInfo, setShowAnswerInfo] = useState(false)
  const [showOnlinePractice, setShowOnlinePractice] = useState(false)
  const [isSavingPdf, setIsSavingPdf] = useState(false)
  const [generationSeed, setGenerationSeed] = useState(0)
  const practiceRef = useRef<HTMLElement>(null)
  const [generated, setGenerated] = useState<Question[]>(() => makeQuestions(20, '混合运算', QUESTIONS_PER_PAGE, Date.now()))
  const [answerKey] = useState<AnswerKey | null>(() => readAnswerKey())

  const totalPages = Math.ceil(generated.length / QUESTIONS_PER_PAGE)

  const generate = () => {
    const nextSeed = generationSeed + 1
    setGenerationSeed(nextSeed)
    setGenerated(makeQuestions(range, mode, pageCount * QUESTIONS_PER_PAGE, nextSeed))
    setShowGenerator(false)
    setActiveView('今日练习')
  }

  const viewPractice = () => setShowOnlinePractice(true)

  useEffect(() => {
    if (showOnlinePractice) practiceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [showOnlinePractice])

  const savePdf = async () => {
    setIsSavingPdf(true)
    try {
      const blob = await createWorksheetPdf(generated, range)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `小算研习所-${range}以内-${new Date().toISOString().slice(0, 10)}.pdf`
      link.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsSavingPdf(false)
    }
  }

  if (answerKey) return <AnswerKeyView answerKey={answerKey} />

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark"><span>算</span><div><strong>小算研习所</strong><small>DAILY MATH LAB</small></div></div>
        <div className="profile-card"><div className="avatar">小</div><div><strong>小朋友</strong><span>一年级 · 连续 6 天</span></div><MoreHorizontal size={18} /></div>
        <nav className="main-nav" aria-label="主导航">
          <button className={activeView === '今日练习' ? 'active' : ''} onClick={() => setActiveView('今日练习')}><LayoutDashboard size={18} />今日练习</button>
          <button className={activeView === '错题本' ? 'active' : ''} onClick={() => setActiveView('错题本')}><FileText size={18} />错题本<span className="nav-badge">12</span></button>
          <button className={activeView === '学习报告' ? 'active' : ''} onClick={() => setActiveView('学习报告')}><BarChart3 size={18} />学习报告</button>
        </nav>
        <div className="sidebar-bottom"><div className="streak"><Flame size={18} /><div><strong>6 天</strong><span>本周连续练习</span></div></div><button className="help-button"><CircleHelp size={18} />使用帮助</button></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div><p className="eyebrow">DAILY MATH LAB</p><h1>{activeView === '今日练习' ? '今天也来算一算。' : activeView}</h1></div>
          <div className="top-actions"><button className="icon-button" title="查看成就"><Trophy size={19} /></button><button className="primary-button compact export-button" title={`导出 ${totalPages} 页 PDF`} onClick={() => window.print()}><Printer size={16} />导出 PDF</button></div>
        </header>

        {activeView === '今日练习' && <>
          <section className="hero-grid">
            <article className="focus-card"><div className="card-kicker"><span className="status-dot" />今日练习</div><h2>{range} 以内{mode}</h2><p>每页 60 题，共 {totalPages} 页，生成后即可在线练习。</p><div className="progress-line"><span style={{ width: '100%' }} /></div><div className="card-footer"><span>已生成 {generated.length} 题</span><button onClick={viewPractice}>在线查看题目 <ArrowRight size={15} /></button></div></article>
            <article className="score-card"><div className="score-top"><div><span className="muted-label">本次练习</span><strong>{generated.length}<small>题</small></strong></div><div className="score-ring"><Target size={20} /></div></div><div className="mini-stats"><span><Clock3 size={14} />共 {totalPages} 页</span><span><Check size={14} />每页 60 题</span></div></article>
          </section>

          <section className="section-heading"><div><p className="eyebrow">QUICK ACTIONS</p><h2>想做什么？</h2></div><button className="text-button" onClick={() => setShowGenerator(true)}>更多设置 <ArrowRight size={15} /></button></section>
          <section className="action-grid">
            <button className="action-card mint" onClick={() => setShowGenerator(true)}><div className="action-icon"><Sparkles size={22} /></div><div><strong>自动出题</strong><span>按范围和页数定制练习</span></div><ArrowRight size={18} /></button>
            <button className="action-card peach" onClick={() => setShowAnswerInfo(true)}><div className="action-icon"><Check size={22} /></div><div><strong>扫码看答案</strong><span>微信或支付宝扫描试卷右上角二维码</span></div><ArrowRight size={18} /></button>
            <button className="action-card blue" onClick={savePdf} disabled={isSavingPdf}><div className="action-icon"><Download size={22} /></div><div><strong>{isSavingPdf ? '正在保存' : '保存 PDF'}</strong><span>直接另存为 PDF 文件</span></div><ArrowRight size={18} /></button>
          </section>

          {showOnlinePractice && <section ref={practiceRef} className="online-practice" aria-label="在线题目">
            <div className="section-heading"><div><p className="eyebrow">ONLINE PRACTICE</p><h2>在线查看题目</h2></div><span className="practice-meta">共 {generated.length} 题</span></div>
            <div className="question-grid">{generated.map((question, index) => <article className="question-tile" key={`${question.expression}-${index}`}><div className="question-head"><span>第 {index + 1} 题</span><small>{question.difficulty}</small></div><strong>{question.expression} =</strong></article>)}</div>
          </section>}

        </>}

        {activeView === '错题本' && <section className="empty-view"><div className="empty-icon"><FileText size={30} /></div><p className="eyebrow">MISTAKE NOTEBOOK</p><h2>把错题变成下一次的得分点。</h2><p>完成几组练习后，这里会收集需要再练习的题目。</p></section>}
        {activeView === '学习报告' && <section className="empty-view"><div className="empty-icon"><BarChart3 size={30} /></div><p className="eyebrow">WEEKLY REPORT</p><h2>这周的计算状态</h2><p>稳定练习比一次做很多题更重要。</p></section>}
        <footer className="site-footer"><Copyright size={14} /><span>2026 小算研习所 · 保留所有权利</span></footer>
      </main>

      <section className="print-pages" aria-label="打印练习纸">
        {Array.from({ length: totalPages }, (_, pageIndex) => {
          const pageQuestions = generated.slice(pageIndex * QUESTIONS_PER_PAGE, (pageIndex + 1) * QUESTIONS_PER_PAGE)
          const answerUrl = makeAnswerUrl(pageQuestions.map((question) => question.answer), pageIndex + 1, range)
          return <article className="print-page" key={pageIndex}><div className="print-qr"><AnswerQr url={answerUrl} /><span>扫码查看答案</span></div><header className="print-header"><h1>{range}以内的连加连减混合</h1><p><span className="print-field">姓名<i /></span><span className="print-field">日期<i /></span><span className="print-field">用时<i /></span><span className="print-field">成绩<i /></span></p></header><div className="print-columns">{Array.from({ length: 3 }, (_, columnIndex) => <div className="print-column" key={columnIndex}>{pageQuestions.slice(columnIndex * QUESTIONS_PER_COLUMN, (columnIndex + 1) * QUESTIONS_PER_COLUMN).map((question, index) => <div key={`${question.expression}-${columnIndex}-${index}`}><small>({index * 3 + columnIndex + 1})</small><strong>{question.expression} =</strong><em /></div>)}</div>)}</div><footer><span>微信搜索「魔力娃口算」，在线口算学习训练，下载打印</span><strong>第({pageIndex + 1})页</strong></footer></article>
        })}
      </section>

      {showGenerator && <div className="modal-backdrop" onClick={() => setShowGenerator(false)}><section className="modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowGenerator(false)}><X size={19} /></button><p className="eyebrow">MAKE A NEW SET</p><h2>生成一套新练习</h2><p className="modal-intro">每页固定 60 题，生成后可通过右上角按钮保存为 PDF。</p><label>数字范围<div className="segmented">{([20, 50, 100] as Range[]).map((item) => <button className={range === item ? 'selected' : ''} key={item} onClick={() => setRange(item)}>{item} 以内</button>)}</div></label><label>练习模式<div className="select-field"><select value={mode} onChange={(event) => setMode(event.target.value as Mode)}><option>混合运算</option><option>加法强化</option><option>减法强化</option></select><ChevronDown size={16} /></div></label><label>练习页数<div className="segmented">{PAGE_OPTIONS.map((item) => <button className={pageCount === item ? 'selected' : ''} key={item} onClick={() => setPageCount(item)}>{item} 页 · {item * QUESTIONS_PER_PAGE} 题</button>)}</div></label><button className="primary-button full" onClick={generate}><Sparkles size={17} />生成并开始</button></section></div>}
      {showAnswerInfo && <div className="modal-backdrop" onClick={() => setShowAnswerInfo(false)}><section className="modal answer-info-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowAnswerInfo(false)}><X size={19} /></button><p className="eyebrow">ANSWER GUIDE</p><h2>扫码查看答案</h2><p className="modal-intro">打印或保存练习纸后，请使用微信或支付宝扫描试卷右上角的二维码。打开答案页后，可以对照题目自主批改。</p><button className="primary-button full" onClick={() => setShowAnswerInfo(false)}>知道了</button></section></div>}
    </div>
  )
}

export default App