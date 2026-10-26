/**
 * Local smoke test against vite preview (http://127.0.0.1:4173)
 */
import { spawn } from 'node:child_process'
import { once } from 'node:events'

const CHROME =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://127.0.0.1:4173'
const PORT = 9222

async function rpc(method, params = {}) {
  const targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) =>
    r.json(),
  )
  const page = targets.find((t) => t.type === 'page') || targets[0]
  if (!page?.webSocketDebuggerUrl) throw new Error('No Chrome page target')

  const pageWs = new WebSocket(page.webSocketDebuggerUrl)
  await once(pageWs, 'open')
  const pagePending = new Map()
  let pageId = 0
  pageWs.addEventListener('message', (ev) => {
    const msg = JSON.parse(String(ev.data))
    if (msg.id && pagePending.has(msg.id)) {
      pagePending.get(msg.id)(msg)
      pagePending.delete(msg.id)
    }
  })
  function pageSend(method, params = {}) {
    const thisId = ++pageId
    pageWs.send(JSON.stringify({ id: thisId, method, params }))
    return new Promise((resolve, reject) => {
      pagePending.set(thisId, (msg) => {
        if (msg.error) reject(new Error(JSON.stringify(msg.error)))
        else resolve(msg.result)
      })
    })
  }

  await pageSend('Runtime.enable')
  await pageSend('Page.enable')
  await pageSend('Page.navigate', { url: BASE + '/' })
  await new Promise((r) => setTimeout(r, 2500))

  async function evaluate(expression) {
    const result = await pageSend('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (result.exceptionDetails) {
      throw new Error(
        JSON.stringify(result.exceptionDetails, null, 2) || 'evaluate failed',
      )
    }
    return result.result?.value
  }

  const checks = {}
  checks.homeReady = await evaluate(`document.body.innerText.includes('本地词库已就绪')`)
  checks.hasCapture = await evaluate(`!!document.querySelector('.capture-btn')`)

  await evaluate(`document.querySelector('.capture-btn').click()`)
  await new Promise((r) => setTimeout(r, 400))
  await evaluate(`(() => {
    const el = document.querySelector('.modal input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, 'look forward to');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  await new Promise((r) => setTimeout(r, 1200))
  checks.enrichVisible = await evaluate(`document.body.innerText.includes('自动补全')`)
  checks.phoneticOrDef = await evaluate(
    `document.body.innerText.includes('look forward') || document.body.innerText.includes('excited') || document.body.innerText.includes('/lʊk')`,
  )
  await evaluate(`(() => {
    const btns = [...document.querySelectorAll('.modal button')];
    const save = btns.find(b => b.textContent.includes('保存'));
    save.click();
  })()`)
  await new Promise((r) => setTimeout(r, 800))
  checks.savedOnHome = await evaluate(`document.body.innerText.includes('look forward to')`)

  await evaluate(`(() => {
    const tabs = [...document.querySelectorAll('.tab')];
    tabs.find(t => t.textContent.includes('词库')).click();
  })()`)
  await new Promise((r) => setTimeout(r, 400))
  await evaluate(`(() => {
    const el = document.querySelector('.page input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, 'the');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  await new Promise((r) => setTimeout(r, 500))
  checks.libraryHit = await evaluate(`document.body.innerText.includes('非常常用') || document.body.innerText.includes('the')`)

  await evaluate(`(() => {
    const tabs = [...document.querySelectorAll('.tab')];
    tabs.find(t => t.textContent.includes('设置')).click();
  })()`)
  await new Promise((r) => setTimeout(r, 400))
  checks.settingsExport = await evaluate(
    `document.body.innerText.includes('导出 Markdown') && document.body.innerText.includes('导出 JSON')`,
  )
  checks.cloudConfigured = await evaluate(
    `!document.body.innerText.includes('云端尚未接入')`,
  )

  console.log(JSON.stringify(checks, null, 2))
  pageWs.close()
  return checks
}

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=/tmp/english-clip-chrome-profile',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

await new Promise((r) => setTimeout(r, 1200))
try {
  const checks = await rpc()
  const failed = Object.entries(checks).filter(([, v]) => !v)
  if (failed.length) {
    console.error('FAIL', failed.map(([k]) => k))
    process.exitCode = 1
  } else {
    console.log('ALL CHECKS PASSED')
  }
} catch (e) {
  console.error(e)
  process.exitCode = 1
} finally {
  chrome.kill('SIGKILL')
}
