const $ = id => document.getElementById(id)
$('version').textContent = chrome.runtime.getManifest().version

function show(signedIn) {
  $('signed-in').hidden = !signedIn
  $('signed-out').hidden = signedIn
}

chrome.storage.local.get('auth').then(({ auth }) => show(!!auth))

// Forget the sign-in and the cached folder trees.
$('sign-out').addEventListener('click', async () => {
  const keys = Object.keys(await chrome.storage.local.get(null)).filter(k => k === 'auth' || k.startsWith('cache:'))
  await chrome.storage.local.remove(keys)
  show(false)
})
