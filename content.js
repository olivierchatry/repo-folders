// Folders section in the left sidebar of github.com/orgs/<org>/repositories.
// Clicking a folder runs props.folder:"<path>" in GitHub's own search box; dropping a repository
// link (GitHub's list rows are draggable links) on a folder moves the repository there.
// No tokens here: every GitHub call goes through the service worker (background.js), which checks
// that each request comes from this organization's page.
const PROP = 'folder'
const UNFILED = `no:props.${PROP}`
const ID = 'ghf-folders'
const INSTALL = 'https://github.com/apps/repo-folders/installations/new'
const FOLDER_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/></svg>'

// One state per organization. An operation keeps the state it started with, so moving to
// another org's page mid-operation can't apply its result to the wrong org.
let state = null

function check() {
  const org = location.pathname.match(/^\/orgs\/([A-Za-z0-9-]{1,39})\/repositories\/?$/)?.[1]
  const box = document.getElementById(ID)
  if (box && box.dataset.org === org) {
    if (box.dataset.search !== location.search) render()
    return
  }
  box?.remove()
  const views = org && document.querySelector('nav[aria-label="Repository views"]')
  if (!views) return
  const nav = document.createElement('nav')
  nav.id = ID
  nav.dataset.org = org
  nav.setAttribute('aria-label', 'Folders')
  views.after(nav)
  if (state?.org === org) render()
  else load(org)
}

async function send(msg) {
  if (!chrome.runtime?.id) throw new Error('Repo Folders was updated. Reload the page.')
  const res = await chrome.runtime.sendMessage(msg)
  if (res?.error) throw Object.assign(new Error(res.error), { status: res.status })
  return res
}

// Draw the last known tree at once, then refresh it in the background.
async function load(org) {
  const st = state = { org, paths: [], repos: [], signedIn: false, notInstalled: false, loading: true, error: '', busy: false, closed: new Set(), editing: null, confirming: null, signIn: null }
  const cached = await send({ op: 'cached', org }).catch(() => null)
  if (state !== st) return
  if (cached) Object.assign(st, cached, { signedIn: true })
  render()
  try {
    Object.assign(st, { signedIn: false, notInstalled: false }, await send({ op: 'load', org }))
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
    const start = await send({ op: 'signinStart', org: st.org })
    const pending = st.signIn = { code: start.code, url: start.url, copied: false }
    navigator.clipboard?.writeText(start.code).then(() => { pending.copied = true; render() }, () => {})
    render()
    for (let interval = start.interval; ;) {
      await new Promise(r => setTimeout(r, interval * 1000))
      const res = await send({ op: 'signinPoll', org: st.org })
      if (res.done) return load(st.org)
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
    Object.assign(st, await send({ ...msg, org: st.org }))
  } catch (e) {
    st.error = e.message
    await send({ op: 'load', org: st.org }).then(res => Object.assign(st, res), () => {})
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

// Shown at once; undone if GitHub refuses. In a folder view the moved repository no longer matches, so its row
// is hidden now and the search re-run once GitHub's search index has the move (measured ~3 s behind the API).
function drop(name, folder) {
  const st = state, repo = st.repos.find(r => r.name === name), before = repo.folder
  if (before === folder) return
  const q = new URLSearchParams(location.search).get('q') || ''
  const listRow = q.includes(`props.${PROP}`) && document.querySelector(`main a[href="/${st.org}/${name}" i]`)?.closest('li')
  if (listRow) listRow.hidden = true
  st.error = ''
  repo.folder = folder
  render()
  send({ op: 'move', org: st.org, repo: name, folder }).then(
    () => { if (listRow) setTimeout(() => new URLSearchParams(location.search).get('q') === q && search(q), 3500) },
    e => {
      if (listRow) listRow.hidden = false
      repo.folder = before
      st.error = e.message
      render()
    })
}

function repoFromDrag(e) {
  try {
    const line = e.dataTransfer.getData('text/uri-list').split('\n').find(l => l.trim() && !l.startsWith('#'))
    const url = new URL(line.trim(), location.href)
    const [, owner, name] = url.pathname.split('/')
    return url.host === location.host && owner.toLowerCase() === state.org.toLowerCase() && state.repos.find(r => r.name.toLowerCase() === name?.toLowerCase())?.name
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
  box.dataset.search = location.search
  box.dataset.signedIn = st.signedIn
  box.dataset.version = chrome.runtime.getManifest().version
  box.classList.toggle('ghf-busy', st.busy)
  const q = new URLSearchParams(location.search).get('q') || ''
  const m = q.match(new RegExp(`props\\.${PROP}:(?:"([^"]*)"|(\\S+))`))
  const active = q.split(/\s+/).includes(UNFILED) ? null : m ? m[1] ?? m[2] : undefined
  const counts = new Map()
  for (const r of st.repos) counts.set(r.folder, (counts.get(r.folder) || 0) + 1)
  const usable = st.signedIn && !st.notInstalled
  const head = h('div', { class: 'ghf-head' }, h('span', { title: `Repo Folders ${box.dataset.version}` }, st.loading ? 'Folders …' : 'Folders'),
    h('span', { class: 'ghf-head-actions' }, usable && button('New folder', '+', () => edit({ parent: '' }))))
  const error = st.error && h('div', { class: 'ghf-error', role: 'alert' }, st.error)
  const note = st.signIn
    ? [h('p', {}, 'Enter ', h('code', { class: 'ghf-code' }, st.signIn.code), st.signIn.copied ? ' (copied)' : '', ' at ', h('a', { href: st.signIn.url, target: '_blank' }, 'github.com/login/device'), '.'), h('p', {}, 'Waiting for GitHub…')]
    : st.notInstalled
      ? [h('p', {}, `Repo Folders isn't installed on ${st.org}. `, h('a', { href: INSTALL, target: '_blank' }, 'Install it'), ' (organization owners).')]
      : !st.signedIn && !st.loading && [h('button', { type: 'button', class: 'ghf-signin', onclick: signIn }, 'Sign in with GitHub')]
  const notes = note && h('div', { class: 'ghf-note' }, ...note)
  if (!usable) return box.replaceChildren(...[head, error, notes].filter(Boolean))

  const icon = () => Object.assign(h('span', { class: 'ghf-icon' }), { innerHTML: FOLDER_ICON })

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

  // node.path null = Unfiled
  function row(tag, node, hasChildren) {
    const el = h(tag, { class: 'ghf-row', 'aria-current': node.path === active ? 'page' : null },
      h('span', { class: 'ghf-chevron' }, hasChildren ? '›' : ''),
      icon(),
      searchLink(node.path ? `props.${PROP}:"${node.path}"` : UNFILED, { class: 'ghf-name', title: node.path || 'Repositories without a folder' }, node.name),
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
      st.error = `Drop a repository of ${st.org} here.`
      render()
    })
    return el
  }

  const adding = parent => st.editing?.parent === parent && editor('', parent ? `New folder in ${parent}` : 'New folder', v => create(parent, v))

  // Editors never go inside <summary>, where clicks and the space key would toggle the folder.
  function item(node) {
    if (st.editing?.rename === node.path) return editor(node.path, `Rename or move ${node.path}`, v => rename(node.path, v))
    const children = [adding(node.path), ...node.children.map(item)].filter(Boolean)
    if (!children.length) return h('li', {}, row('div', node, false))
    const details = h('details', { open: st.editing?.parent === node.path || !st.closed.has(node.path) }, row('summary', node, true), h('ul', {}, ...children))
    details.addEventListener('toggle', () => (details.open ? st.closed.delete(node.path) : st.closed.add(node.path)))
    return h('li', {}, details)
  }

  box.replaceChildren(...[head, error, notes].filter(Boolean),
    h('ul', {}, adding(''), ...buildTree(st.paths).map(item), h('li', {}, row('div', { name: 'Unfiled', path: null }, false))))
}

// Startup stays last: it runs check() → load() at once, which needs every const above to exist.
// GitHub is a single-page app: re-add the section whenever React re-renders the sidebar or we land on the page.
new MutationObserver(check).observe(document.documentElement, { childList: true, subtree: true })
check()
