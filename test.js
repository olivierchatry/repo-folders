// node test.js
const assert = require('node:assert/strict')
const { cleanPath, moved, addFolder, renameFolder, removeFolder, buildTree, personalChange } = require('./folders.js')

assert.equal(cleanPath(' Team / Api  Tools /'), 'Team/Api  Tools')
assert.equal(cleanPath('Équipe'), null)
assert.equal(cleanPath('say "hi"'), null)
assert.equal(cleanPath('//'), null)

assert.deepEqual(addFolder(['b'], 'A/x/y'), ['A', 'A/x', 'A/x/y', 'b'])
assert.deepEqual(addFolder(['A B', 'A'], 'A/B'), ['A', 'A/B', 'A B'])

const paths = ['Api', 'Api/Old', 'Api/Old/v1', 'Apix', 'Web']
assert.deepEqual(renameFolder(paths, 'Api/Old', 'Legacy/Api'), ['Api', 'Apix', 'Legacy', 'Legacy/Api', 'Legacy/Api/v1', 'Web'])
assert.deepEqual(renameFolder(paths, 'Api', 'Web'), ['Apix', 'Web', 'Web/Old', 'Web/Old/v1'])
assert.equal(moved('Apix', 'Api', 'X'), 'Apix')
assert.equal(moved('Api/Old/v1', 'Api', 'X'), 'X/Old/v1')

assert.deepEqual(removeFolder(paths, 'Api'), ['Apix', 'Web'])

const tree = buildTree(['web', 'Api/Old/v1', 'Api'])
assert.deepEqual(tree.map(n => n.path), ['Api', 'web'])
assert.deepEqual(tree[0].children[0].children.map(n => n.path), ['Api/Old/v1'])

// Personal folders: the same operations on { paths, repos } (only filed repositories are listed).
let mine = { paths: [], repos: [] }
mine = personalChange(mine, { op: 'create', parent: null, name: 'Tools / CLI' })
mine = personalChange(mine, { op: 'move', repo: 'dotfiles', folder: 'Tools/CLI' })
mine = personalChange(mine, { op: 'move', repo: 'blog', folder: 'Tools' })
assert.deepEqual(mine.paths, ['Tools', 'Tools/CLI'])
mine = personalChange(mine, { op: 'rename', from: 'Tools', to: 'Dev/Tools' })
assert.deepEqual(mine.paths, ['Dev', 'Dev/Tools', 'Dev/Tools/CLI'])
assert.deepEqual(mine.repos, [{ name: 'dotfiles', folder: 'Dev/Tools/CLI' }, { name: 'blog', folder: 'Dev/Tools' }])
mine = personalChange(mine, { op: 'move', repo: 'blog', folder: null })
assert.deepEqual(mine.repos.map(r => r.name), ['dotfiles'])
mine = personalChange(mine, { op: 'remove', path: 'Dev/Tools' })
assert.deepEqual(mine, { paths: ['Dev'], repos: [] })
assert.throws(() => personalChange(mine, { op: 'create', name: 'say "hi"' }))

// content.js boots on a page whose sidebar is already there and asks the service worker for its tree.
// (Regression: a const declared below the startup call threw, so every load looked signed out.)
const vm = require('node:vm'), fs = require('node:fs')
const plain = x => JSON.parse(JSON.stringify(x)) // objects from a vm context have that context's prototypes
const run = (files, context) => { for (const f of files) vm.runInContext(fs.readFileSync(`${__dirname}/${f}`, 'utf8'), context, { filename: f }) }
const stub = () => ({ dataset: {}, setAttribute() {}, after() {} })
const sent = []
const page = vm.createContext({
  location: { pathname: '/orgs/acme/repositories', search: '' },
  document: { documentElement: {}, getElementById: () => null, querySelector: stub, createElement: stub },
  MutationObserver: class { observe() {} },
  chrome: { runtime: { id: 'ext', sendMessage: async msg => (sent.push(msg), null) } },
})
run(['folders.js', 'content.js'], page)
assert.deepEqual(plain(sent[0]), { op: 'cached', org: 'acme' }, 'content.js did not ask for its tree on startup')

// On your own profile's Repositories tab it reads your folders from synced storage and never messages the worker.
const userCalls = { sync: 0, sent: 0 }
const profile = vm.createContext({
  URLSearchParams,
  location: { pathname: '/Me', search: '?tab=repositories' },
  document: {
    documentElement: {},
    getElementById: id => (id === 'user-repositories-list' ? { before() {} } : null),
    querySelector: sel => (sel === 'meta[name="user-login"]' ? { content: 'me' } : null),
    createElement: stub,
  },
  MutationObserver: class { observe() {} },
  chrome: {
    runtime: { id: 'ext', sendMessage: async () => (userCalls.sent++, null) },
    storage: { sync: { get: async () => (userCalls.sync++, {}) } },
  },
})
run(['folders.js', 'content.js'], profile)
assert.deepEqual(userCalls, { sync: 1, sent: 0 }, 'personal mode must read synced storage and not message the worker')

// The service worker refuses anything that doesn't come from that organization's Repositories page,
// and never lets a request reach GitHub with a crafted repository or folder name.
const store = { auth: { token: 'ghu_test', expires: null } }
const calls = []
let onMessage, accessLevel
const worker = vm.createContext({
  URL,
  importScripts: f => run([f], worker),
  fetch: async (url, init) => (calls.push({ url, ...init }), { ok: true, status: 204, json: async () => null }),
  chrome: {
    runtime: { id: 'ext', onMessage: { addListener: fn => (onMessage = fn) }, onStartup: { addListener() {} }, onInstalled: { addListener() {} } },
    storage: { local: {
      get: async keys => Object.fromEntries([keys].flat().filter(k => k in store).map(k => [k, store[k]])),
      set: async o => Object.assign(store, o),
      remove: async k => [k].flat().forEach(x => delete store[x]),
      setAccessLevel: async o => (accessLevel = o.accessLevel),
    } },
  },
})
run(['background.js'], worker)
assert.equal(accessLevel, 'TRUSTED_CONTEXTS', 'storage must be locked away from content scripts')

const acme = { id: 'ext', origin: 'https://github.com', url: 'https://github.com/orgs/acme/repositories?q=x' }
const ask = (msg, sender = acme) => new Promise(resolve => onMessage(msg, sender, resolve))
const refused = async (msg, sender) => {
  const before = calls.length
  const res = await ask(msg, sender)
  assert.match(res?.error ?? '', /Refused|Unknown/, `not refused: ${JSON.stringify(msg)}`)
  assert.equal(calls.length, before, `reached the network: ${JSON.stringify(msg)}`)
}
;(async () => {
  await refused({ op: 'cached', org: 'acme' }, { ...acme, origin: 'https://evil.example', url: 'https://evil.example/orgs/acme/repositories' })
  await refused({ op: 'cached', org: 'acme' }, { ...acme, url: 'https://github.com/settings/tokens' })
  await refused({ op: 'cached', org: 'acme' }, { ...acme, id: 'other-extension' })
  await refused({ op: 'load', org: 'other' })
  await refused({ op: 'move', org: 'acme', repo: '../../user', folder: null })
  await refused({ op: 'move', org: 'acme', repo: 'demo', folder: 'a"b' })
  await refused({ op: 'create', org: 'acme', parent: null, name: { toString: () => 'x' } })
  await refused({ op: 'rename', org: 'acme', from: 'A', to: '' })
  await refused({ op: 'steal', org: 'acme' })

  assert.deepEqual(plain(await ask({ op: 'move', org: 'acme', repo: 'demo', folder: 'Team/App' })), {})
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.github.com/orgs/acme/properties/values')
  assert.equal(calls[0].method, 'PATCH')
  assert.equal(calls[0].headers.Authorization, 'Bearer ghu_test')
  assert.deepEqual(plain(JSON.parse(calls[0].body)), { repository_names: ['demo'], properties: [{ property_name: 'folder', value: 'Team/App' }] })

  delete store.auth
  assert.equal(await ask({ op: 'cached', org: 'acme' }), null, 'no cached tree when signed out')
  // Firefox: folders.js loads as a background script (no importScripts), setAccessLevel may be missing, and
  // MessageSender has no origin, so the page URL decides.
  let ffMessage
  const ffCalls = []
  const firefox = vm.createContext({
    URL,
    fetch: async (url, init) => (ffCalls.push(url), { ok: true, status: 204, json: async () => null }),
    chrome: {
      runtime: { id: 'ext', onMessage: { addListener: fn => (ffMessage = fn) }, onStartup: { addListener() {} }, onInstalled: { addListener() {} } },
      storage: { local: { get: async () => ({ auth: { token: 'ghu_ff', expires: null } }), set: async () => {}, remove: async () => {} } },
    },
  })
  run(['folders.js', 'background.js'], firefox)
  const ffAsk = (msg, sender) => new Promise(resolve => ffMessage(msg, sender, resolve))
  const move = { op: 'move', org: 'acme', repo: 'demo', folder: null }
  assert.match((await ffAsk(move, { id: 'ext', url: 'https://evil.example/orgs/acme/repositories' })).error, /Refused/)
  assert.match((await ffAsk(move, { id: 'ext', origin: 'https://evil.example', url: 'https://github.com/orgs/acme/repositories' })).error, /Refused/)
  assert.equal(ffCalls.length, 0)
  assert.deepEqual(plain(await ffAsk(move, { id: 'ext', url: 'https://github.com/orgs/acme/repositories' })), {})
  assert.deepEqual(ffCalls, ['https://api.github.com/orgs/acme/properties/values'])

  console.log('ok')
})().catch(e => { console.error(e); process.exit(1) })
