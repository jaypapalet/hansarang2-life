import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { NoticeError, noticeAuthApi, noticeJsonRequest, noticeRequest } from './notice-client';

type User = { username: string; role: 'owner' | 'editor' };
type Account = User & { enabled: boolean };
type AuthState = { user: User | null; setup: 'available' | 'unconfigured' | 'complete' };
type Credential = { username: string; password: string };
const usersApi = `${noticeAuthApi}/users`;
const usernamePattern = '[a-zA-Z0-9][a-zA-Z0-9_\\-]{2,31}';
const accountErrors: Record<string, string> = {
  invalid_credentials: '아이디 또는 비밀번호를 확인해 주세요.',
  invalid_setup_password: '처음 설정할 때 등록한 비밀번호를 확인해 주세요.',
  invalid_username: '아이디는 영문, 숫자, 밑줄, 하이픈을 써서 3~32자로 입력해 주세요.',
  id_taken: '이미 등록된 아이디입니다.',
  owner_required: '운영자 계정으로 로그인해 주세요.',
};

function accountError(cause: unknown) {
  return cause instanceof NoticeError ? accountErrors[cause.code] ?? '처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' : '서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

function LoginForm({ setup, onSignIn, refresh }: { setup: boolean; onSignIn: (user: User) => void; refresh: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const { user } = await noticeJsonRequest<{ user: User }>(`${noticeAuthApi}/${setup ? 'setup' : 'login'}`, 'POST', { username, password });
      onSignIn(user);
    } catch (cause) {
      if (cause instanceof NoticeError && cause.code === 'setup_unavailable') refresh();
      else setError(accountError(cause));
    } finally {
      setPending(false);
    }
  }

  return <section className="notice-auth" aria-labelledby="notice-auth-title">
    <h2 id="notice-auth-title">{setup ? '첫 운영자 등록' : '관리자 로그인'}</h2>
    {setup && <p className="notice-state">사용할 아이디와 사이트 설정에 등록한 초기 비밀번호를 입력해 주세요.</p>}
    <form className="notice-form" onSubmit={submit}>
      <fieldset disabled={pending}>
        <label>아이디
          <input type="text" value={username} pattern={usernamePattern} maxLength={32} required autoComplete="username" autoCapitalize="none" spellCheck={false}
            onChange={event => setUsername(event.currentTarget.value)} />
        </label>
        <label>{setup ? '초기 비밀번호' : '비밀번호'}
          <input type="password" value={password} maxLength={64} required autoComplete={setup ? 'new-password' : 'current-password'}
            onChange={event => setPassword(event.currentTarget.value)} />
        </label>
        <div className="notice-actions"><button className="notice-button notice-primary" type="submit">{pending ? '확인 중' : setup ? '운영자 등록' : '로그인'}</button></div>
      </fieldset>
    </form>
    {error && <p className="notice-feedback notice-error" role="alert">{error}</p>}
  </section>;
}

function AccountList({ onExpired }: { onExpired: () => void }) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [username, setUsername] = useState('');
  const [credential, setCredential] = useState<Credential | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const passwordInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    noticeRequest<{ users: Account[] }>(usersApi, { signal: controller.signal })
      .then(({ users }) => { if (!controller.signal.aborted) setAccounts(users); })
      .catch(cause => {
        if (controller.signal.aborted) return;
        if (cause instanceof NoticeError && cause.code === 'sign_in_required') onExpired();
        else setError(accountError(cause));
      });
    return () => controller.abort();
  }, [refresh, onExpired]);

  async function changeAccount(path: string, method: 'POST' | 'PATCH', data: object, success: string) {
    if (pending) return;
    setPending(true);
    setError('');
    setMessage('');
    try {
      const issued = await noticeJsonRequest<Credential | undefined>(path, method, data);
      if (issued?.password) setCredential(issued);
      setMessage(success);
      setRefresh(value => value + 1);
      return true;
    } catch (cause) {
      if (cause instanceof NoticeError && cause.code === 'sign_in_required') onExpired();
      else setError(accountError(cause));
      return false;
    } finally {
      setPending(false);
    }
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await changeAccount(usersApi, 'POST', { username }, '편집자 계정을 등록했습니다.')) setUsername('');
  }

  async function copyPassword() {
    if (!credential) return;
    try {
      await navigator.clipboard.writeText(credential.password);
      setMessage('비밀번호를 복사했습니다.');
    } catch {
      passwordInput.current?.select();
      setMessage('선택한 비밀번호를 복사해 주세요.');
    }
  }

  return <section className="notice-account-list" aria-labelledby="notice-users-title">
    <h2 id="notice-users-title">편집자 계정</h2>
    <form className="notice-form" onSubmit={register}>
      <fieldset disabled={pending}>
        <label>새 편집자 아이디
          <input type="text" value={username} pattern={usernamePattern} required maxLength={32} autoComplete="off" autoCapitalize="none" spellCheck={false}
            onChange={event => setUsername(event.currentTarget.value)} />
        </label>
        <div className="notice-actions"><button className="notice-button notice-primary" type="submit">편집자 등록</button></div>
      </fieldset>
    </form>
    {credential && <div className="notice-issued">
      <label><strong>{credential.username} 계정의 비밀번호</strong>
        <input ref={passwordInput} type="text" value={credential.password} readOnly autoComplete="off" spellCheck={false} />
      </label>
      <p>비밀번호는 이 화면에서 한 번만 볼 수 있습니다.</p>
      <div className="notice-actions">
        <button className="notice-button" type="button" onClick={copyPassword}>복사</button>
        <button className="notice-button" type="button" onClick={() => setCredential(null)}>닫기</button>
      </div>
    </div>}
    <p className="notice-feedback" role="status">{pending ? '처리 중입니다.' : message}</p>
    {error && <p className="notice-feedback notice-error" role="alert">{error}</p>}
    {!accounts && !error && <p className="notice-state">계정을 불러오는 중입니다.</p>}
    {accounts && <ul className="notice-list">
      {accounts.map(account => <li key={account.username} className="notice-admin-row">
        <div><p className="notice-admin-title">{account.username}</p>
          <span className="secondary">{account.role === 'owner' ? '운영자' : account.enabled ? '편집자' : '편집자 · 사용 중지'}</span></div>
        {account.role === 'editor' && <div className="notice-actions">
          <button className="notice-button" type="button" aria-label={`${account.username} 비밀번호 재발급`} disabled={pending} onClick={() => {
            if (window.confirm(`${account.username} 계정의 비밀번호를 다시 발급할까요?`)) {
              void changeAccount(`${usersApi}/${account.username}/reset`, 'POST', {}, '비밀번호를 다시 발급했습니다.');
            }
          }}>비밀번호 재발급</button>
          <button className="notice-button" type="button" aria-label={`${account.username} ${account.enabled ? '사용 중지' : '사용 재개'}`} disabled={pending} onClick={() => {
            const enabled = !account.enabled;
            void changeAccount(`${usersApi}/${account.username}`, 'PATCH', { enabled }, enabled ? '계정 사용을 재개했습니다.' : '계정 사용을 중지했습니다.');
          }}>{account.enabled ? '사용 중지' : '사용 재개'}</button>
        </div>}
      </li>)}
    </ul>}
  </section>;
}

export function NoticeAdminGate({ children }: { children: (onExpired: () => void) => ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [version, setVersion] = useState(0);
  const [view, setView] = useState<'notices' | 'accounts'>('notices');
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const onExpired = useRef(() => {
    setAuth({ user: null, setup: 'complete' });
    setView('notices');
    setError('로그인 시간이 지났습니다. 다시 로그인해 주세요.');
  }).current;

  function refresh() {
    setError('');
    setVersion(value => value + 1);
  }

  useEffect(() => {
    const controller = new AbortController();
    noticeRequest<AuthState>(noticeAuthApi, { signal: controller.signal })
      .then(state => { if (!controller.signal.aborted) setAuth(state); })
      .catch(() => { if (!controller.signal.aborted) setError('관리자 화면을 불러오지 못했습니다.'); });
    return () => controller.abort();
  }, [version]);

  async function logout() {
    setSigningOut(true);
    setError('');
    try {
      await noticeJsonRequest(`${noticeAuthApi}/logout`, 'POST');
      setAuth({ user: null, setup: 'complete' });
      setView('notices');
    } catch (cause) {
      setError(accountError(cause));
    } finally {
      setSigningOut(false);
    }
  }

  if (!auth) return error ? <div className="notice-access" role="alert">
    <p>{error}</p><button className="notice-button" type="button" onClick={refresh}>다시 시도</button>
  </div> : <p className="notice-state" role="status">관리자 화면을 불러오는 중입니다.</p>;

  if (!auth.user) return auth.setup === 'unconfigured'
    ? <p className="notice-state">첫 운영자를 등록하려면 사이트 설정에 초기 비밀번호를 추가해 주세요.</p>
    : <>
      {error && <p className="notice-feedback notice-error" role="alert">{error}</p>}
      <LoginForm key={auth.setup} setup={auth.setup === 'available'} refresh={refresh} onSignIn={user => {
        setAuth({ user, setup: 'complete' });
        setError('');
      }} />
    </>;

  return <div className="notice-console">
    <div className="notice-console-heading">
      <p className="secondary">{auth.user.username} · {auth.user.role === 'owner' ? '운영자' : '편집자'}</p>
      <button className="notice-button" type="button" onClick={logout} disabled={signingOut}>로그아웃</button>
    </div>
    {error && <p className="notice-feedback notice-error" role="alert">{error}</p>}
    {auth.user.role === 'owner' && <div className="notice-console-nav" role="group" aria-label="관리 메뉴">
      <button type="button" aria-pressed={view === 'notices'} onClick={() => setView('notices')}>공지 관리</button>
      <button type="button" aria-pressed={view === 'accounts'} onClick={() => setView('accounts')}>계정 관리</button>
    </div>}
    <div hidden={view !== 'notices'}>{children(onExpired)}</div>
    {view === 'accounts' && <AccountList onExpired={onExpired} />}
  </div>;
}
