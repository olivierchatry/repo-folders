// Service worker: holds the GitHub sign-in and makes every GitHub call. Content scripts run inside
// github.com's renderer, so they never see a token: they get a few requests that only read and change
// the org's `folder` property, and every request is checked against the page that sent it.
importScripts('folders.js')

const PROP = 'folder'
const API = 'https://api.github.com'
// GitHub App "Repo Folders": device flow, no client secret, so the client ID is public by design.
const CLIENT_ID = 'Iv23liuPf6RkVvxT89lx'
const ORG_PAGE = /^\/orgs\/([A-Za-z0-9-]{1,39})\/repositories\/?$/
const REPO = /^[A-Za-z0-9._-]{1,100}$/

// Tokens and caches live in storage.local, which content scripts can read unless told otherwise.
const lock = () => chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {})
lock()
chrome.runtime.onStartup.addListener(lock)
chrome.runtime.onInstalled.addListener(() => {
  lock()
  chrome.storage.local.remove('token') // pasted classic token from versions before 0.3.0
})

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  handle(msg, sender).then(reply, e => reply({ error: e.message, status: e.status }))
  return true // replies asynchronously
})

async function handle(msg, sender) {
  const org = sender.id === chrome.runtime.id && sender.origin === 'https://github.com' && sender.url && new URL(sender.url).pathname.match(ORG_PAGE)?.[1]
  if (!org || msg?.org !== org) throw new Error('Refused: requests must come from that organization\'s Repositories page.')
  switch (msg.op) {
    case 'cached': return (await auth()) ? (await chrome.storage.local.get(cacheKey(org)))[cacheKey(org)] || null : null
    case 'load': return load(org)
    case 'create': {
      const name = folderPath(msg.name)
      return change(org, t => create(t, msg.parent == null ? name : folderPath(`${folderPath(msg.parent)}/${name}`)))
    }
    case 'rename': return change(org, t => rename(t, folderPath(msg.from), folderPath(msg.to)))
    case 'remove': return change(org, t => remove(t, folderPath(msg.path)))
    case 'move': return move(org, repoName(msg.repo), msg.folder == null ? null : folderPath(msg.folder))
    case 'signinStart': return signinStart()
    case 'signinPoll': return signinPoll()
  }
  throw new Error('Unknown request.')
}

const refuse = what => { throw new Error(`Refused: invalid ${what}.`) }
const folderPath = v => (typeof v === 'string' && cleanPath(v)) || refuse('folder name (printable ASCII without double quotes)')
const repoName = v => (typeof v === 'string' && REPO.test(v) && v) || refuse('repository name')

// ---- sign-in (device flow) ----

const auth = async () => (await chrome.storage.local.get('auth')).auth
const fresh = a => a.expires == null || Date.now() < a.expires - 60e3
const signedOut = () => Object.assign(new Error('Signed out. Sign in again.'), { status: 401 })

async function oauth(path, params) {
  const res = await fetch(`https://github.com/login/${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, ...params }),
  })
  return res.json()
}

async function saveAuth(res) {
  const a = { token: res.access_token, refresh: res.refresh_token, expires: res.expires_in ? Date.now() + res.expires_in * 1000 : null }
  await chrome.storage.local.set({ auth: a })
  return a.token
}

// User tokens last 8 hours and refresh without a client secret. Refresh tokens are single-use: one refresh at a time.
let refreshing = null
async function token() {
  const a = await auth()
  if (!a) throw signedOut()
  if (fresh(a)) return a.token
  refreshing ??= oauth('oauth/access_token', { grant_type: 'refresh_token', refresh_token: a.refresh })
    .then(res => (res.access_token ? saveAuth(res) : signOut()))
    .finally(() => { refreshing = null })
  return refreshing
}

async function signOut() {
  await chrome.storage.local.remove('auth')
  throw signedOut()
}

// The device code stays here; the page only gets the user code it must show.
let pending = null
async function signinStart() {
  const code = await oauth('device/code', {})
  if (!code.device_code) throw new Error(code.error_description || code.error || 'GitHub refused the sign-in.')
  pending = { device: code.device_code, interval: code.interval, end: Date.now() + code.expires_in * 1000 }
  return { code: code.user_code, url: code.verification_uri, interval: code.interval }
}

async function signinPoll() {
  if (!pending || Date.now() > pending.end) throw new Error('The sign-in code expired. Try again.')
  const res = await oauth('oauth/access_token', { device_code: pending.device, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' })
  if (res.access_token) {
    pending = null
    await saveAuth(res)
    return { done: true }
  }
  if (res.error === 'slow_down') pending.interval = res.interval || pending.interval + 5
  else if (res.error !== 'authorization_pending') {
    pending = null
    throw new Error(res.error_description || res.error)
  }
  return { done: false, interval: pending.interval }
}

// ---- GitHub API ----

async function api(path, method = 'GET', body) {
  const res = await fetch(API + path, {
    method,
    cache: 'no-cache', // GitHub sends max-age=60; revalidate so a read right after a write sees it (304s are free)
    headers: { Authorization: `Bearer ${await token()}`, Accept: 'application/vnd.github+json' },
    body: body && JSON.stringify(body),
  })
  if (!res.ok) {
    if (res.status === 401) await chrome.storage.local.remove('auth') // revoked on GitHub
    const message = (await res.json().catch(() => ({}))).message || res.statusText
    const hint = method !== 'GET' && [403, 404].includes(res.status) ? ' (only organization owners can change folders)' : ''
    throw Object.assign(new Error(`${method} ${path.split('?')[0]}: ${res.status} ${message}${hint}`), { status: res.status })
  }
  return res.status === 204 ? null : res.json()
}

// ---- folders of one organization ----

const cacheKey = org => `cache:${org.toLowerCase()}`
const view = t => ({ paths: t.paths, repos: t.repos })
const save = t => chrome.storage.local.set({ [cacheKey(t.org)]: view(t) })

async function tree(org) {
  const cached = (await chrome.storage.local.get(cacheKey(org)))[cacheKey(org)]
  return { org, prop: null, paths: [], repos: [], ...cached }
}

const setProp = (t, prop) => Object.assign(t, { prop, paths: prop ? prop.allowed_values : [] })

async function readSchema(t) {
  const prop = (await api(`/orgs/${t.org}/properties/schema`)).find(p => p.property_name === PROP) || null
  if (prop && prop.value_type !== 'single_select') throw new Error(`The organization property "${PROP}" exists but is not single-select.`)
  setProp(t, prop)
}

// ponytail: sequential pages, fine for a few hundred repositories
async function readRepos(t) {
  const all = []
  for (let page = 1; ; page++) {
    const batch = await api(`/orgs/${t.org}/properties/values?per_page=100&page=${page}`)
    all.push(...batch.map(r => ({ name: r.repository_name, folder: r.properties.find(p => p.property_name === PROP)?.value ?? null })))
    if (batch.length < 100) return (t.repos = all)
  }
}

const refresh = t => Promise.all([readSchema(t), readRepos(t)])

// Signed out, or signed in but the app isn't installed on this organization (GitHub answers 403/404).
async function load(org) {
  if (!(await auth())) return { signedIn: false }
  const t = await tree(org)
  try {
    await refresh(t)
  } catch (e) {
    if (e.status === 401) return { signedIn: false }
    if ([403, 404].includes(e.status) && !/SAML/.test(e.message)) return { signedIn: true, notInstalled: true }
    throw e
  }
  await save(t)
  return { signedIn: true, ...view(t) }
}

async function change(org, fn) {
  const t = await tree(org)
  await fn(t)
  await save(t)
  return view(t)
}

// PUT replaces the whole definition, so carry over what an admin may have set by hand.
async function savePaths(t, next) {
  const url = `/orgs/${t.org}/properties/schema/${PROP}`
  if (!next.length) return setProp(t, await api(url, 'DELETE')) // a single-select needs at least one value
  const { description = 'Repository folder (Repo Folders extension)', required = false, default_value = null, values_editable_by = 'org_actors' } = t.prop || {}
  setProp(t, await api(url, 'PUT', { value_type: 'single_select', allowed_values: next, description, required, default_value, values_editable_by }))
}

async function setFolder(t, repos, folder) {
  for (let i = 0; i < repos.length; i += 30) { // API limit: 30 repositories per request
    const batch = repos.slice(i, i + 30)
    await api(`/orgs/${t.org}/properties/values`, 'PATCH', { repository_names: batch.map(r => r.name), properties: [{ property_name: PROP, value: folder }] })
    for (const r of batch) r.folder = folder
  }
}

// ponytail: read-modify-write on the definition, a concurrent edit by someone else can be lost; add an ETag check if that bites
async function create(t, path) {
  await readSchema(t)
  await savePaths(t, addFolder(t.paths, path))
}

async function rename(t, from, to) {
  if (to === from) return
  await refresh(t)
  const renamed = renameFolder(t.paths, from, to)
  await savePaths(t, sorted([...t.paths, ...renamed])) // new paths first, so repositories can move into them
  const affected = t.repos.filter(r => r.folder && within(r.folder, from))
  for (const [folder, list] of Map.groupBy(affected, r => moved(r.folder, from, to))) await setFolder(t, list, folder)
  await savePaths(t, renamed)
}

async function remove(t, path) {
  await refresh(t)
  await setFolder(t, t.repos.filter(r => r.folder && within(r.folder, path)), null)
  await savePaths(t, removeFolder(t.paths, path))
}

// GitHub itself rejects a folder that isn't one of the property's allowed values.
async function move(org, repo, folder) {
  await api(`/orgs/${org}/properties/values`, 'PATCH', { repository_names: [repo], properties: [{ property_name: PROP, value: folder }] })
  const t = await tree(org)
  const cached = t.repos.find(r => r.name === repo)
  if (cached) {
    cached.folder = folder
    await save(t)
  }
  return {}
}
