import './style.css';

interface ConfessionItem {
  id: string;
  text: string;
  created_at: string;
}

const loginCard = document.getElementById('loginCard') as HTMLElement;
const panelView = document.getElementById('panelView') as HTMLElement;
const passwordInput = document.getElementById('passwordInput') as HTMLInputElement;
const loginBtn = document.getElementById('loginBtn') as HTMLButtonElement;
const logoutBtn = document.getElementById('logoutBtn') as HTMLButtonElement;
const loginStatus = document.getElementById('loginStatus') as HTMLParagraphElement;
const panelStatus = document.getElementById('panelStatus') as HTMLParagraphElement;
const refreshBtn = document.getElementById('refreshBtn') as HTMLButtonElement;
const countLabel = document.getElementById('countLabel') as HTMLParagraphElement;
const listEl = document.getElementById('list') as HTMLDivElement;

const SESSION_KEY = 'mss-panel-key';

function getKey(): string {
  return sessionStorage.getItem(SESSION_KEY) ?? '';
}

function setLoginStatus(msg: string, kind: '' | 'ok' | 'err' | 'busy'): void {
  loginStatus.textContent = msg;
  loginStatus.className = `status ${kind}`.trim();
}

function setPanelStatus(msg: string, kind: '' | 'ok' | 'err' | 'busy'): void {
  panelStatus.textContent = msg;
  panelStatus.className = `status ${kind}`.trim();
}

function showPanel(): void {
  loginCard.classList.add('hidden');
  panelView.classList.remove('hidden');
  logoutBtn.classList.remove('hidden');
}

function showLogin(): void {
  loginCard.classList.remove('hidden');
  panelView.classList.add('hidden');
  logoutBtn.classList.add('hidden');
  passwordInput.value = '';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function render(items: ConfessionItem[]): void {
  listEl.innerHTML = '';
  countLabel.textContent = `${items.length} confession${items.length === 1 ? '' : 's'}`;

  if (items.length === 0) {
    setPanelStatus('No confessions yet.', '');
    return;
  }

  for (const item of items) {
    const card = document.createElement('article');
    card.className = 'confession';

    const p = document.createElement('p');
    p.className = 'confession-text';
    p.textContent = item.text;

    const meta = document.createElement('div');
    meta.className = 'confession-meta';

    const date = document.createElement('span');
    date.textContent = formatDate(item.created_at);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn-danger';
    del.textContent = 'Delete';
    del.addEventListener('click', () => {
      void removeConfession(item.id, del);
    });

    meta.append(date, del);
    card.append(p, meta);
    listEl.appendChild(card);
  }
}

async function authHeaders(): Promise<HeadersInit> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getKey()}`
  };
}

async function load(): Promise<void> {
  setPanelStatus('Loading…', 'busy');
  refreshBtn.disabled = true;
  try {
    const res = await fetch('/api/confessions', { headers: await authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      sessionStorage.removeItem(SESSION_KEY);
      showLogin();
      setLoginStatus('Session expired. Enter the password again.', 'err');
      return;
    }
    if (!res.ok) throw new Error((data as { error?: string }).error ?? `Server ${res.status}`);
    const items = (data as { items?: ConfessionItem[] }).items ?? [];
    render(items);
    setPanelStatus('', '');
  } catch (err) {
    setPanelStatus(err instanceof Error ? err.message : 'Failed to load', 'err');
  } finally {
    refreshBtn.disabled = false;
  }
}

async function removeConfession(id: string, btn: HTMLButtonElement): Promise<void> {
  if (!window.confirm('Delete this confession permanently?')) return;
  btn.disabled = true;
  try {
    const res = await fetch(`/api/confessions?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: await authHeaders()
    });
    if (res.status === 401) {
      sessionStorage.removeItem(SESSION_KEY);
      showLogin();
      setLoginStatus('Session expired. Enter the password again.', 'err');
      return;
    }
    if (!res.ok) throw new Error('Delete failed');
    await load();
  } catch {
    setPanelStatus('Could not delete. Try again.', 'err');
    btn.disabled = false;
  }
}

async function login(): Promise<void> {
  const pw = passwordInput.value;
  if (!pw) {
    setLoginStatus('Enter the panel password.', 'err');
    return;
  }
  loginBtn.disabled = true;
  setLoginStatus('Checking…', 'busy');
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !(data as { ok?: boolean }).ok) {
      throw new Error((data as { error?: string }).error ?? 'Wrong password');
    }
    // Keep password only in sessionStorage (cleared when tab closes), never localStorage
    sessionStorage.setItem(SESSION_KEY, pw);
    setLoginStatus('', '');
    showPanel();
    await load();
  } catch (err) {
    setLoginStatus(err instanceof Error ? err.message : 'Login failed', 'err');
  } finally {
    loginBtn.disabled = false;
  }
}

loginBtn.addEventListener('click', () => {
  void login();
});

passwordInput.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    void login();
  }
});

refreshBtn.addEventListener('click', () => {
  void load();
});

logoutBtn.addEventListener('click', () => {
  sessionStorage.removeItem(SESSION_KEY);
  listEl.innerHTML = '';
  setPanelStatus('', '');
  showLogin();
});

// Auto-resume if tab still has session key
if (getKey()) {
  showPanel();
  void load();
}
