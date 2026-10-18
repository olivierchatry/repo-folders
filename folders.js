// Folder paths look like 'Backend' or 'Backend/Services'. Each one is an allowed value of the
// org's single-select `folder` custom property; a repository's value is the folder it lives in.

// GitHub custom property values: printable ASCII except the double quote.
function cleanPath(input) {
  const path = input.split('/').map(s => s.trim()).filter(Boolean).join('/')
  return /^[ -!#-~]+$/.test(path) ? path : null
}

const parents = path => path.split('/').map((_, i, all) => all.slice(0, i + 1).join('/'))
const within = (path, root) => path === root || path.startsWith(root + '/')
const moved = (path, from, to) => (within(path, from) ? to + path.slice(from.length) : path)

// Segment by segment, so a folder's subfolders sort right after it in GitHub's own dropdown too.
function bySegments(a, b) {
  const x = a.split('/'), y = b.split('/')
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const c = x[i].localeCompare(y[i])
    if (c) return c
  }
  return x.length - y.length
}

const sorted = paths => [...new Set(paths)].sort(bySegments)
const addFolder = (paths, path) => sorted([...paths, ...parents(path)])
const renameFolder = (paths, from, to) => sorted([...paths.map(p => moved(p, from, to)), ...parents(to)])
const removeFolder = (paths, root) => paths.filter(p => !within(p, root))

// Nested {name, path, children}; parents missing from the list (hand-edited property) are filled in.
function buildTree(paths) {
  const root = { children: [] }, nodes = new Map([['', root]])
  for (const path of sorted(paths.flatMap(parents))) {
    const i = path.lastIndexOf('/')
    const node = { name: path.slice(i + 1), path, children: [] }
    nodes.set(path, node)
    nodes.get(path.slice(0, Math.max(i, 0))).children.push(node)
  }
  return root.children
}

// Personal accounts have no custom properties: the same operations apply to { paths, repos: [{ name, folder }] },
// which only lists filed repositories.
function personalChange({ paths, repos }, msg) {
  switch (msg.op) {
    case 'create': {
      const path = cleanPath(msg.parent ? `${msg.parent}/${msg.name}` : msg.name)
      if (!path) throw new Error('Folder names must be printable ASCII without double quotes.')
      return { paths: addFolder(paths, path), repos }
    }
    case 'rename': return { paths: renameFolder(paths, msg.from, msg.to), repos: repos.map(r => ({ ...r, folder: moved(r.folder, msg.from, msg.to) })) }
    case 'remove': return { paths: removeFolder(paths, msg.path), repos: repos.filter(r => !within(r.folder, msg.path)) }
    case 'move': return { paths, repos: [...repos.filter(r => r.name !== msg.repo), ...(msg.folder ? [{ name: msg.repo, folder: msg.folder }] : [])] }
  }
  throw new Error('Unknown request.')
}

if (typeof module === 'object') module.exports = { cleanPath, within, moved, sorted, addFolder, renameFolder, removeFolder, buildTree, personalChange }
