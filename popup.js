const RPC_URL = 'http://localhost:8545';
const NUM_ACCOUNTS = 10;
const DEFAULT_MNEMONIC = 'test test test test test test test test test test test junk';

const provider = new ethers.JsonRpcProvider(RPC_URL);
let wallets = [];

const $ = (id) => document.getElementById(id);
const mnemonicEl = $('mnemonic');
const accountsEl = $('accounts');
const fromEl = $('from');
const toEl = $('to');
const toListEl = $('toList');
const amountEl = $('amount');

function msg(id, text, cls = '') {
  const el = $(id);
  el.textContent = text;
  el.className = 'msg ' + cls;
}

const short = (a) => `${a.slice(0, 8)}…${a.slice(-6)}`;
const fmt = (wei) => {
  const s = ethers.formatEther(wei);
  const [i, f = ''] = s.split('.');
  return f.replace(/0+$/, '') ? `${i}.${f.slice(0, 4)}` : i;
};

function deriveWallets(mnemonic) {
  const root = ethers.HDNodeWallet.fromPhrase(mnemonic.trim(), '', "m/44'/60'/0'/0");
  return Array.from({ length: NUM_ACCOUNTS }, (_, i) =>
    new ethers.Wallet(root.deriveChild(i).privateKey, provider)
  );
}

function renderAccounts() {
  accountsEl.innerHTML = '';
  fromEl.innerHTML = '';
  toListEl.innerHTML = '';
  wallets.forEach((w, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>#${i}</td><td class="addr" title="${w.address}">${short(w.address)}</td><td class="bal" id="bal${i}">…</td>`;
    accountsEl.appendChild(tr);

    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `#${i} ${short(w.address)}`;
    fromEl.appendChild(opt);

    const dl = document.createElement('option');
    dl.value = w.address;
    dl.label = `#${i}`;
    toListEl.appendChild(dl);
  });
}

async function refreshBalances() {
  await Promise.all(wallets.map(async (w, i) => {
    const el = $('bal' + i);
    try {
      el.textContent = fmt(await provider.getBalance(w.address)) + ' ETH';
    } catch {
      el.textContent = 'error';
    }
  }));
}

async function loadAccounts(mnemonic) {
  wallets = deriveWallets(mnemonic);
  renderAccounts();
  await refreshBalances();
}

// --- Cifrado del mnemónico (WebCrypto: PBKDF2 + AES-GCM) ---
const PBKDF2_ITERATIONS = 600000;
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(password, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

async function encryptMnemonic(mnemonic, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(mnemonic)));
  return { salt: b64(salt), iv: b64(iv), ct: b64(ct), iterations: PBKDF2_ITERATIONS };
}

async function decryptMnemonic(vault, password) {
  const key = await deriveKey(password, unb64(vault.salt));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(vault.iv) }, key, unb64(vault.ct));
  return new TextDecoder().decode(pt);
}

// --- Estados de la interfaz ---
function setState(state) {
  $('setup').hidden = state !== 'setup';
  $('unlock').hidden = state !== 'locked';
  $('unlocked').hidden = state !== 'unlocked';
  $('main').hidden = state !== 'unlocked';
}

async function unlockWith(mnemonic) {
  await loadAccounts(mnemonic);
  // storage.session vive solo en memoria y se borra al cerrar el navegador
  await chrome.storage.session.set({ mnemonic });
  setState('unlocked');
}

$('saveMnemonic').addEventListener('click', async () => {
  const mnemonic = mnemonicEl.value.trim();
  const password = $('newPassword').value;
  if (password.length < 8) return msg('mnemonicMsg', 'La contraseña debe tener al menos 8 caracteres.', 'error');
  try {
    deriveWallets(mnemonic); // valida el mnemónico antes de guardar
  } catch (e) {
    return msg('mnemonicMsg', `Mnemónico no válido: ${e.message}`, 'error');
  }
  msg('mnemonicMsg', 'Cifrando…');
  const vault = await encryptMnemonic(mnemonic, password);
  await chrome.storage.local.set({ vault });
  await chrome.storage.local.remove('mnemonic'); // elimina el texto plano de versiones anteriores
  $('newPassword').value = '';
  mnemonicEl.value = '';
  await unlockWith(mnemonic);
  msg('mnemonicMsg', 'Mnemónico cifrado y guardado.', 'ok');
});

async function doUnlock() {
  const { vault } = await chrome.storage.local.get('vault');
  msg('mnemonicMsg', 'Descifrando…');
  let mnemonic;
  try {
    mnemonic = await decryptMnemonic(vault, $('password').value);
  } catch {
    return msg('mnemonicMsg', 'Contraseña incorrecta.', 'error');
  }
  $('password').value = '';
  await unlockWith(mnemonic);
  msg('mnemonicMsg', '');
}
$('unlockBtn').addEventListener('click', doUnlock);
$('password').addEventListener('keydown', (e) => { if (e.key === 'Enter') doUnlock(); });

$('lockBtn').addEventListener('click', async () => {
  await chrome.storage.session.remove('mnemonic');
  wallets = [];
  setState('locked');
  msg('mnemonicMsg', 'Bloqueado.');
});

$('wipeBtn').addEventListener('click', async () => {
  if (!confirm('¿Borrar el mnemónico cifrado? Tendrás que volver a introducirlo.')) return;
  await chrome.storage.local.remove(['vault', 'mnemonic']);
  await chrome.storage.session.remove('mnemonic');
  mnemonicEl.value = DEFAULT_MNEMONIC;
  setState('setup');
  msg('mnemonicMsg', 'Mnemónico borrado.');
});

$('refresh').addEventListener('click', refreshBalances);

$('send').addEventListener('click', async () => {
  const to = toEl.value.trim();
  const amount = amountEl.value.trim();
  if (!ethers.isAddress(to)) return msg('sendMsg', 'Destino no válido.', 'error');
  let value;
  try {
    value = ethers.parseEther(amount);
    if (value <= 0n) throw new Error();
  } catch {
    return msg('sendMsg', 'Cantidad no válida.', 'error');
  }
  const wallet = wallets[Number(fromEl.value)];
  msg('sendMsg', 'Enviando…');
  try {
    const tx = await wallet.sendTransaction({ to, value });
    await tx.wait();
    msg('sendMsg', `Confirmada: ${tx.hash}`, 'ok');
    amountEl.value = '';
    await refreshBalances();
  } catch (e) {
    msg('sendMsg', `Error: ${e.shortMessage || e.message}`, 'error');
  }
});

(async () => {
  const { vault, mnemonic: legacy } = await chrome.storage.local.get(['vault', 'mnemonic']);
  const { mnemonic: session } = await chrome.storage.session.get('mnemonic');

  if (vault && session) {
    try { return await unlockWith(session); } catch { /* sigue al desbloqueo manual */ }
  }
  if (vault) return setState('locked');

  // Sin vault: pide mnemónico y contraseña (precarga el antiguo en claro si existía)
  mnemonicEl.value = legacy || DEFAULT_MNEMONIC;
  if (legacy) msg('mnemonicMsg', 'Tienes un mnemónico sin cifrar: ponle una contraseña para protegerlo.', 'error');
  setState('setup');
})();
