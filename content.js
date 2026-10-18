// Folders for GitHub repository lists.
// - An organization's Repositories page: a Folders section in the left sidebar. Folders live in the org's `folder`
//   custom property; clicking one runs props.folder:"<path>" in GitHub's own search box. Every GitHub call goes
//   through the service worker (background.js), which holds the sign-in and checks each request; no tokens here.
// - Your own profile's Repositories tab: a Folders box above the list. Personal accounts have no custom properties,
//   so these folders live in the browser's synced storage and each folder lists its repositories.
// In both, dropping a repository link (GitHub's list rows are draggable links) on a folder files the repository.
const PROP = 'folder'
const UNFILED = `no:props.${PROP}`
const ID = 'ghf-folders'
const REPO = /^[A-Za-z0-9._-]{1,100}$/
const INSTALL = 'https://github.com/apps/repo-folders/installations/new'
const FOLDER_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/></svg>'
const REPO_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/></svg>'

// One state per page (organization or your account). An operation keeps the state it started with, so moving
// to another page mid-operation can't apply its result to the wrong one.
let state = null

function page() {
  const org = location.pathname.match(/^\/orgs\/([A-Za-z0-9-]{1,39})\/repositories\/?$/)?.[1]
  if (org) return { mode: 'org', owner: org, anchor: document.querySelector('nav[aria-label="Repository views"]'), place: (a, box) => a.after(box) }
  const user = location.pathname.match(/^\/([A-Za-z0-9-]{1,39})\/?$/)?.[1]
  const me = document.querySelector('meta[name="user-login"]')?.content
  if (!user || user.toLowerCase() !== me?.toLowerCase() || new URLSearchParams(location.search).get('tab') !== 'repositories') return null
  return { mode: 'user', owner: user, anchor: document.getElementById('user-repositories-list'), place: (a, box) => a.before(box) }
}

function check() {
  const p = page()
  const key = p && `${p.mode}:${p.owner}`
  const box = document.getElementById(ID)
  if (box && box.dataset.key === key) {
    if (box.dataset.search !== location.search) render()
    return
  }
  box?.remove()
  if (!p?.anchor) return
  const nav = document.createElement('nav')
  nav.id = ID
  nav.dataset.key = key
  nav.setAttribute('aria-label', 'Folders')
  if (p.mode === 'user') nav.className = 'ghf-personal'
  p.place(p.anchor, nav)
  if (state?.key === key) render()
  else load(p.mode, p.owner, key)
}

async function send(msg) {
  if (!chrome.runtime?.id) throw new Error('Repo Folders was updated. Reload the page.')
  const res = await chrome.runtime.sendMessage(msg)
  if (res?.error) throw Object.assign(new Error(res.error), { status: res.status })
  return res
}

// Personal folders, one synced-storage item per account: { paths: ['A', 'A/B'], repos: [['r1'], ['r2', 'r3']] },
// repos[i] being the repositories filed in paths[i].
// ponytail: one sync item holds 8 KB (roughly 400 filed repositories); split it by folder if someone hits that
const personalKey = login => `personal:${login.toLowerCase()}`

async function readPersonal(login) {
  const d = (await chrome.storage.sync.get(personalKey(login)))[personalKey(login)] || { paths: [], repos: [] }
  return { paths: d.paths, repos: d.paths.flatMap((path, i) => (d.repos[i] || []).map(name => ({ name, folder: path }))) }
}

async function writePersonal(login, { paths, repos }) {
  await chrome.storage.sync.set({ [personalKey(login)]: { paths, repos: paths.map(p => repos.filter(r => r.folder === p).map(r => r.name)) } })
  return { paths, repos }
}

// One change, made on GitHub (organizations) or in the browser's storage (your account).
async function request(st, msg) {
  if (st.mode === 'org') return send({ ...msg, org: st.owner })
  return writePersonal(st.owner, personalChange(await readPersonal(st.owner), msg))
}

const reload = st => (st.mode === 'org' ? send({ op: 'load', org: st.owner }) : readPersonal(st.owner))

// Draw the last known tree at once, then refresh it in the background.
async function load(mode, owner, key) {
  const st = state = { mode, owner, key, paths: [], repos: [], signedIn: mode === 'user', notInstalled: false, loading: true, error: '', busy: false, toggled: new Set(), editing: null, confirming: null, signIn: null }
  if (mode === 'org') {
    const cached = await send({ op: 'cached', org: owner }).catch(() => null)
    if (state !== st) return
    if (cached) Object.assign(st, cached, { signedIn: true })
    render()
  }
  try {
    Object.assign(st, mode === 'org' ? { signedIn: false, notInstalled: false } : {}, await reload(st))
  } catch (e) {
    st.error = e.message
  }
  st.loading = false
  render()
}

// Device flow: the service worker keeps the device code; this page only shows the user code and asks it to poll.
async function signIn() {
  const st = state
  st.error = ''
  try {
    const start = await send({ op: 'signinStart', org: st.owner })
    const pending = st.signIn = { code: start.code, url: start.url, copied: false }
    navigator.clipboard?.writeText(start.code).then(() => { pending.copied = true; render() }, () => {})
    render()
    for (let interval = start.interval; ;) {
      await new Promise(r => setTimeout(r, interval * 1000))
      const res = await send({ op: 'signinPoll', org: st.owner })
      if (res.done) return load(st.mode, st.owner, st.key)
      interval = res.interval
    }
  } catch (e) {
    st.error = e.message
    st.signIn = null
    render()
  }
}

async function run(msg) {
  const st = state
  if (!st || st.busy) return
  st.busy = true
  st.error = ''
  render()
  try {
    Object.assign(st, await request(st, msg))
  } catch (e) {
    st.error = e.message
    await reload(st).then(res => Object.assign(st, res), () => {})
  }
  st.busy = false
  render()
}

// Run a query in GitHub's own search box: the list updates in place, without reloading the page.
function search(q) {
  const input = document.querySelector('#repos-list-filter-input')
  if (!input) return location.assign('?q=' + encodeURIComponent(q))
  input.value = q
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }))
}

// GitHub's sidebar is one screen tall, sticky, and clips what doesn't fit, so the folder list scrolls on its own and
// ends above GitHub's sticky footer. It sits `top` px down the page when not scrolled; 100vh follows window resizes.
function sizeList(box, list) {
  const aside = box.closest('aside')
  if (!aside) return
  const footer = [...aside.children].find(c => getComputedStyle(c).position === 'sticky')
  const top = aside.parentElement.getBoundingClientRect().top + scrollY + list.getBoundingClientRect().top - aside.getBoundingClientRect().top
  box.style.setProperty('--ghf-top', `${Math.round(top)}px`)
  box.style.setProperty('--ghf-bottom', `${(footer?.offsetHeight ?? 0) + 8}px`)
}

// editing: { parent } while naming a new folder ('' = top level), { rename: path } while renaming one
function edit(editing) {
  Object.assign(state, { editing, confirming: null })
  render()
}

function invalid() {
  state.error = 'Folder names must be printable ASCII without double quotes.'
  render()
}

function create(parent, input) {
  if (!cleanPath(parent ? `${parent}/${input}` : input)) return invalid()
  run({ op: 'create', parent: parent || null, name: input })
}

function rename(from, input) {
  const to = cleanPath(input)
  if (!to) return invalid()
  if (to === from) return render()
  run({ op: 'rename', from, to })
}

function remove(path) {
  state.confirming = null
  run({ op: 'remove', path })
}

// Shown at once; undone if the change fails. In an organization's folder view the moved repository no longer
// matches, so its row is hidden now and the search re-run once GitHub's index has the move (~3 s behind the API).
function drop(name, folder) {
  const st = state, before = st.repos.find(r => r.name === name)?.folder ?? null
  if (before === folder) return
  const snapshot = st.repos
  const q = new URLSearchParams(location.search).get('q') || ''
  const listRow = st.mode === 'org' && q.includes(`props.${PROP}`) && document.querySelector(`main a[href="/${st.owner}/${name}" i]`)?.closest('li')
  if (listRow) listRow.hidden = true
  st.error = ''
  st.repos = [...st.repos.filter(r => r.name !== name), ...(folder || st.mode === 'org' ? [{ name, folder }] : [])]
  render()
  request(st, { op: 'move', repo: name, folder }).then(
    () => { if (listRow) setTimeout(() => new URLSearchParams(location.search).get('q') === q && search(q), 3500) },
    e => {
      if (listRow) listRow.hidden = false
      st.repos = snapshot
      st.error = e.message
      render()
    })
}

function repoFromDrag(e) {
  try {
    const line = e.dataTransfer.getData('text/uri-list').split('\n').find(l => l.trim() && !l.startsWith('#'))
    const url = new URL(line.trim(), location.href)
    const [, owner, name] = url.pathname.split('/')
    if (url.host !== location.host || owner.toLowerCase() !== state.owner.toLowerCase() || !REPO.test(name ?? '')) return null
    // Organizations: only repositories GitHub listed for the org, under their exact name.
    return state.mode === 'org' ? state.repos.find(r => r.name.toLowerCase() === name.toLowerCase())?.name : name
  } catch {
    return null
  }
}

function h(tag, attrs, ...children) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else el.setAttribute(k, v === true ? '' : v)
  }
  el.append(...children.filter(c => c != null && c !== false))
  return el
}

function button(label, text, onclick) {
  return h('button', { type: 'button', title: label, 'aria-label': label, onclick: e => { e.preventDefault(); e.stopPropagation(); onclick() } }, text)
}

// A real link (open in new tab, copy link) whose plain click searches in place.
function searchLink(q, attrs, text) {
  const onclick = e => {
    if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    search(q)
  }
  return h('a', { ...attrs, href: '?q=' + encodeURIComponent(q), onclick }, text)
}

function render() {
  const box = document.getElementById(ID), st = state
  if (!box || !st) return
  const org = st.mode === 'org'
  box.dataset.search = location.search
  box.dataset.signedIn = st.signedIn
  box.dataset.version = chrome.runtime.getManifest().version
  box.classList.toggle('ghf-busy', st.busy)
  const q = new URLSearchParams(location.search).get('q') || ''
  const m = q.match(new RegExp(`props\\.${PROP}:(?:"([^"]*)"|(\\S+))`))
  const active = !org ? undefined : q.split(/\s+/).includes(UNFILED) ? null : m ? m[1] ?? m[2] : undefined
  const counts = new Map()
  for (const r of st.repos) counts.set(r.folder, (counts.get(r.folder) || 0) + 1)
  const usable = st.signedIn && !st.notInstalled
  const head = h('div', { class: 'ghf-head' }, h('span', { title: `Repo Folders ${box.dataset.version}` }, st.loading ? 'Folders …' : 'Folders'),
    h('span', { class: 'ghf-head-actions' }, usable && button('New folder', '+', () => edit({ parent: '' }))))
  const error = st.error && h('div', { class: 'ghf-error', role: 'alert' }, st.error)
  const note = st.signIn
    ? [h('p', {}, 'Enter ', h('code', { class: 'ghf-code' }, st.signIn.code), st.signIn.copied ? ' (copied)' : '', ' at ', h('a', { href: st.signIn.url, target: '_blank' }, 'github.com/login/device'), '.'), h('p', {}, 'Waiting for GitHub…')]
    : st.notInstalled
      ? [h('p', {}, `Repo Folders isn't installed on ${st.owner}. `, h('a', { href: INSTALL, target: '_blank' }, 'Install it'), ' (organization owners).')]
      : !st.signedIn && !st.loading && [h('button', { type: 'button', class: 'ghf-signin', onclick: signIn }, 'Sign in with GitHub')]
  const notes = note && h('div', { class: 'ghf-note' }, ...note)
  if (!usable) return box.replaceChildren(...[head, error, notes].filter(Boolean))

  const icon = (svg = FOLDER_ICON) => Object.assign(h('span', { class: 'ghf-icon' }), { innerHTML: svg })

  // Enter or leaving the field saves, Escape cancels; an empty name cancels too.
  function editor(value, label, save) {
    const input = h('input', { class: 'ghf-input', value, placeholder: label, 'aria-label': label, spellcheck: 'false' })
    let done = false
    const finish = keep => {
      if (done) return
      done = true
      st.editing = null
      if (keep && input.value.trim()) save(input.value)
      else render()
    }
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') finish(true)
      else if (e.key === 'Escape') finish(false)
    })
    input.addEventListener('blur', () => document.hasFocus() && finish(true)) // not when switching windows
    queueMicrotask(() => input.focus())
    return h('li', {}, h('div', { class: 'ghf-row' }, h('span', { class: 'ghf-chevron' }), icon(), input))
  }

  function actions(path) {
    if (st.confirming !== path) {
      return h('span', { class: 'ghf-actions' },
        button(`New folder in ${path}`, '+', () => edit({ parent: path })),
        button(`Rename or move ${path}`, '✎', () => edit({ rename: path })),
        button(`Delete ${path}`, '×', () => { Object.assign(st, { editing: null, confirming: path }); render() }))
    }
    const count = st.repos.filter(r => r.folder && within(r.folder, path)).length
    return h('span', { class: 'ghf-confirm' }, count ? `Delete, unfile ${count}?` : 'Delete?',
      button(`Confirm delete ${path}`, 'Yes', () => remove(path)),
      button('Cancel delete', 'No', () => { st.confirming = null; render() }))
  }

  // node.path null = Unfiled. Organization folders filter GitHub's list; your own folders open to list their repositories.
  function row(tag, node, hasChildren) {
    const el = h(tag, { class: 'ghf-row', 'aria-current': org && node.path === active ? 'page' : null },
      h('span', { class: 'ghf-chevron' }, hasChildren ? '›' : ''),
      icon(),
      org
        ? searchLink(node.path ? `props.${PROP}:"${node.path}"` : UNFILED, { class: 'ghf-name', title: node.path || 'Repositories without a folder' }, node.name)
        : h('span', { class: 'ghf-name', title: node.path }, node.name),
      !(node.path && st.confirming === node.path) && h('span', { class: 'ghf-count' }, String(counts.get(node.path) || '')),
      node.path && actions(node.path))
    el.addEventListener('dragover', e => {
      if (!e.dataTransfer.types.includes('text/uri-list')) return
      e.preventDefault()
      el.classList.add('ghf-drop')
    })
    el.addEventListener('dragleave', () => el.classList.remove('ghf-drop'))
    el.addEventListener('drop', e => {
      e.preventDefault()
      el.classList.remove('ghf-drop')
      const name = repoFromDrag(e)
      if (name) return drop(name, node.path)
      st.error = `Drop a repository of ${st.owner} here.`
      render()
    })
    return el
  }

  const repoItem = r => h('li', {}, h('div', { class: 'ghf-row' }, h('span', { class: 'ghf-chevron' }), icon(REPO_ICON),
    h('a', { class: 'ghf-name', href: `/${st.owner}/${r.name}` }, r.name),
    h('span', { class: 'ghf-actions' }, button(`Take ${r.name} out of ${r.folder}`, '×', () => drop(r.name, null)))))

  const adding = parent => st.editing?.parent === parent && editor('', parent ? `New folder in ${parent}` : 'New folder', v => create(parent, v))

  // Editors never go inside <summary>, where clicks and the space key would toggle the folder.
  // `toggled` holds the folders closed by hand (organizations, open by default) or opened by hand (your account).
  function item(node) {
    if (st.editing?.rename === node.path) return editor(node.path, `Rename or move ${node.path}`, v => rename(node.path, v))
    const repos = org ? [] : st.repos.filter(r => r.folder === node.path).sort((a, b) => a.name.localeCompare(b.name)).map(repoItem)
    const children = [adding(node.path), ...node.children.map(item), ...repos].filter(Boolean)
    if (!children.length) return h('li', {}, row('div', node, false))
    const open = st.editing?.parent === node.path || st.toggled.has(node.path) !== org
    const details = h('details', { open }, row('summary', node, true), h('ul', {}, ...children))
    details.addEventListener('toggle', () => {
      if (details.open !== org) st.toggled.add(node.path)
      else st.toggled.delete(node.path)
    })
    return h('li', {}, details)
  }

  // Redrawing replaces the list: keep its scroll (read it before the old list leaves the page, where it reads 0),
  // or on the first draw bring the active folder into view.
  const scrolled = box.querySelector(':scope > ul')?.scrollTop
  const list = h('ul', {}, adding(''), ...buildTree(st.paths).map(item), org && h('li', {}, row('div', { name: 'Unfiled', path: null }, false)))
  box.replaceChildren(...[head, error, notes].filter(Boolean), list)
  if (org) sizeList(box, list)
  if (scrolled != null) list.scrollTop = scrolled
  else list.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' })
}

// Startup stays last: it runs check() → load() at once, which needs every const above to exist.
// GitHub is a single-page app: re-add the section whenever it re-renders or we land on the page.
new MutationObserver(check).observe(document.documentElement, { childList: true, subtree: true })
check()
