import { useEffect, useRef, useState, type FormEvent } from 'react';
import { NoticeAdminGate } from './notice-accounts';
import { boardApi, NoticeError, noticeRequest } from './notice-client';
import { maxOriginalPhotoBytes, noticePhotoTypes, prepareNoticePhoto } from './notice-image';
import './apartment-notices.css';

type Notice = { id: number; title: string; body: string; createdAt: number; photoUrl: string | null };
type ManagedNotice = Notice & { revision: number };
type NoticePage<T> = { posts: T[]; hasNext: boolean };
type Draft = { title: string; body: string };
const blankDraft = { title: '', body: '' };
const adminApi = `${boardApi}/admin`;
const dateFormat = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });

function useNoticePage<T extends Notice>(endpoint: string) {
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<NoticePage<T> | null>(null);
  const [error, setError] = useState<NoticeError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    noticeRequest<NoticePage<T>>(`${endpoint}?page=${page}`, { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return;
        if (!result.posts.length && page > 1) {
          setPage(page - 1);
          return;
        }
        setData(result);
        setLoading(false);
      })
      .catch(cause => {
        if (controller.signal.aborted) return;
        setData(null);
        setError(cause instanceof NoticeError ? cause : new NoticeError('request_failed'));
        setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint, page, version]);

  return { page, setPage, data, error, loading, reload: () => setVersion(value => value + 1) };
}

function NoticeDate({ value }: { value: number }) {
  return <time className="notice-date" dateTime={new Date(value).toISOString()}>{dateFormat.format(value)}</time>;
}

function NoticePager({ page, hasNext, disabled, changePage }: { page: number; hasNext: boolean; disabled: boolean; changePage: (page: number) => void }) {
  if (page === 1 && !hasNext) return null;
  return <nav className="notice-pager" aria-label="아파트 공지사항 페이지">
    <button className="notice-button" type="button" disabled={disabled || page === 1} onClick={() => changePage(page - 1)}>이전</button>
    <span aria-current="page">{page}페이지</span>
    <button className="notice-button" type="button" disabled={disabled || !hasNext} onClick={() => changePage(page + 1)}>다음</button>
  </nav>;
}

export function ApartmentNotices() {
  const notices = useNoticePage<Notice>(boardApi);
  const heading = useRef<HTMLHeadingElement>(null);

  return <section className="notice-board" aria-labelledby="apartment-notices-title">
    <div className="section-heading">
      <h2 id="apartment-notices-title" ref={heading} tabIndex={-1}>아파트 공지사항</h2>
      <a className="notice-link" href="/admin">공지 관리</a>
    </div>
    {notices.loading && <p className="notice-state" role="status">공지를 불러오는 중입니다.</p>}
    {notices.error && <div className="notice-state" role="alert">
      <p>공지를 불러오지 못했습니다.</p>
      <button className="notice-button" type="button" onClick={notices.reload}>다시 시도</button>
    </div>}
    {notices.data?.posts.length === 0 && !notices.loading && <p className="notice-state">등록된 공지가 없습니다.</p>}
    {Boolean(notices.data?.posts.length) && <ul className="notice-list" aria-busy={notices.loading}>
      {notices.data?.posts.map(post => <li key={post.id}>
        <details>
          <summary><span className="notice-summary"><span>{post.title}</span><NoticeDate value={post.createdAt} /></span></summary>
          <p className="notice-body">{post.body}</p>
          {post.photoUrl && <img className="notice-photo" src={post.photoUrl} alt={`${post.title} 첨부 사진`} loading="lazy" />}
        </details>
      </li>)}
    </ul>}
    {notices.data && <NoticePager page={notices.page} hasNext={notices.data.hasNext} disabled={notices.loading}
      changePage={page => {
        notices.setPage(page);
        heading.current?.focus();
      }} />}
  </section>;
}

export function NoticeAdmin() {
  return <NoticeAdminGate>{onExpired => <NoticeEditor onExpired={onExpired} />}</NoticeAdminGate>;
}

function NoticeEditor({ onExpired }: { onExpired: () => void }) {
  const notices = useNoticePage<ManagedNotice>(adminApi);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [editing, setEditing] = useState<ManagedNotice | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [photoNote, setPhotoNote] = useState('');
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [writeError, setWriteError] = useState('');
  const titleInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const photoTask = useRef<AbortController | null>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const displayedPhoto = photoPreview || (!removePhoto ? editing?.photoUrl : null);

  useEffect(() => {
    const url = photo ? URL.createObjectURL(photo) : null;
    setPhotoPreview(url);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [photo]);

  useEffect(() => {
    if (notices.error?.code === 'sign_in_required') onExpired();
  }, [notices.error, onExpired]);

  useEffect(() => () => photoTask.current?.abort(), []);

  function clearPhoto(removed = false) {
    photoTask.current?.abort();
    photoTask.current = null;
    setPreparingPhoto(false);
    setPhoto(null);
    setRemovePhoto(removed);
    setPhotoError('');
    setPhotoNote('');
    if (photoInput.current) photoInput.current.value = '';
  }

  async function selectPhoto(file: File | null) {
    if (!file) return;
    photoTask.current?.abort();
    setPhoto(null);
    setPhotoNote('');
    setPhotoError('');
    if ((!noticePhotoTypes.includes(file.type) && !(!file.type && /\.(jpe?g|png|webp)$/i.test(file.name)))
      || !file.size || file.size > maxOriginalPhotoBytes) {
      clearPhoto(removePhoto);
      setPhotoError('20MB 이하의 JPG, PNG 또는 WebP 사진을 선택해 주세요.');
      return;
    }
    const task = new AbortController();
    photoTask.current = task;
    setPreparingPhoto(true);
    try {
      const prepared = await prepareNoticePhoto(file, task.signal);
      if (task.signal.aborted) return;
      setPhoto(prepared);
      setRemovePhoto(false);
      if (prepared !== file) {
        const size = prepared.size < 1024 * 1024 ? `${Math.ceil(prepared.size / 1024)}KB` : `${(prepared.size / 1024 / 1024).toFixed(1)}MB`;
        setPhotoNote(prepared.size < file.size ? `사진을 ${size}로 줄였습니다.` : `사진 크기를 조정했습니다. 첨부 파일은 ${size}입니다.`);
      }
    } catch {
      if (task.signal.aborted) return;
      setPhotoError('사진을 변환하지 못했습니다. 다른 파일을 선택해 주세요.');
      if (photoInput.current) photoInput.current.value = '';
    } finally {
      if (photoTask.current === task) {
        photoTask.current = null;
        setPreparingPhoto(false);
      }
    }
  }

  function startEditing(post: ManagedNotice) {
    setEditing(post);
    setDraft({ title: post.title, body: post.body });
    clearPhoto();
    setMessage('');
    setWriteError('');
    titleInput.current?.focus();
  }

  function clearDraft() {
    setEditing(null);
    setDraft(blankDraft);
    clearPhoto();
    setWriteError('');
  }

  async function saveNotice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || preparingPhoto || photoError) return;
    if (!draft.title.trim() || !draft.body.trim()) {
      setWriteError('제목과 내용을 모두 입력해 주세요.');
      return;
    }
    const result = await changeNotice(editing ? 'PUT' : 'POST', editing, draft);
    if (!result) return;
    clearDraft();
    if (!editing) notices.setPage(1);
  }

  async function deleteNotice(post: ManagedNotice) {
    if (pending || !window.confirm(`‘${post.title}’ 공지를 삭제할까요?`)) return;
    const result = await changeNotice('DELETE', post);
    if (result && post.id === editing?.id) clearDraft();
  }

  async function changeNotice(method: 'POST' | 'PUT' | 'DELETE', post: ManagedNotice | null, values?: Draft) {
    setPending(true);
    setWriteError('');
    setMessage('');
    try {
      const options: RequestInit = { method };
      if (values && photo) {
        const form = new FormData();
        form.set('title', values.title);
        form.set('body', values.body);
        form.set('photo', photo);
        if (post) form.set('revision', String(post.revision));
        options.body = form;
      } else {
        options.headers = { 'Content-Type': 'application/json' };
        options.body = JSON.stringify({ ...values, revision: post?.revision, removePhoto });
      }
      await noticeRequest(post ? `${adminApi}/${post.id}` : adminApi, options);
      setMessage(method === 'POST' ? '공지를 게시했습니다.' : method === 'PUT' ? '공지를 수정했습니다.' : '공지를 삭제했습니다.');
      notices.reload();
      return true;
    } catch (cause) {
      const code = cause instanceof NoticeError ? cause.code : '';
      if (code === 'post_changed') {
        setWriteError('다른 곳에서 공지가 바뀌었습니다. 목록에서 최신 글을 다시 열어 주세요.');
        notices.reload();
      } else if (code === 'sign_in_required') {
        onExpired();
      } else if (code === 'photo_invalid') {
        setWriteError('사진을 올리지 못했습니다. 20MB 이하의 JPG, PNG 또는 WebP 사진을 다시 선택해 주세요.');
      } else if (code === 'photo_store_unavailable') {
        setWriteError('사진을 저장할 수 없습니다. 잠시 후 다시 시도해 주세요.');
      } else {
        setWriteError('공지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
      return false;
    } finally {
      setPending(false);
    }
  }

  if (notices.error) return <div className="notice-access" role="alert">
    <p>게시한 공지를 불러오지 못했습니다.</p>
    <button className="notice-button" type="button" onClick={notices.reload}>다시 시도</button>
  </div>;
  if (!notices.data) return <p className="notice-state" role="status">공지 관리 화면을 불러오는 중입니다.</p>;

  return <div className="notice-admin">
    <section aria-labelledby="notice-editor-title">
      <h2 id="notice-editor-title">{editing ? '공지 수정' : '새 공지 작성'}</h2>
      <form className="notice-form" onSubmit={saveNotice}>
        <fieldset disabled={pending}>
          <label>제목
            <input ref={titleInput} type="text" value={draft.title} maxLength={120} required
              onChange={event => setDraft({ ...draft, title: event.currentTarget.value })} />
          </label>
          <label>내용
            <textarea value={draft.body} maxLength={6000} rows={7} required
              onChange={event => setDraft({ ...draft, body: event.currentTarget.value })} />
          </label>
          <div className="notice-photo-field">
            <label>사진 첨부
              <input ref={photoInput} type="file" accept={noticePhotoTypes.join(',')} aria-describedby="notice-photo-hint"
                onChange={event => void selectPhoto(event.currentTarget.files?.[0] ?? null)} />
            </label>
            <p id="notice-photo-hint" className="secondary">JPG, PNG, WebP · 원본 20MB 이하 1장. 큰 사진은 자동으로 줄입니다.</p>
            <p className="secondary notice-photo-status" role="status">{preparingPhoto ? '사진을 준비하는 중입니다.' : photoNote}</p>
            {photoError && <div className="notice-actions">
              <p className="notice-error" role="alert">{photoError}</p>
              <button className="notice-button" type="button" onClick={() => clearPhoto(removePhoto)}>사진 선택 취소</button>
            </div>}
            {displayedPhoto && <div className="notice-photo-preview">
              <img src={displayedPhoto} alt="첨부 사진 미리보기" />
              <button className="notice-button" type="button" onClick={() => clearPhoto(Boolean(editing?.photoUrl))}>사진 빼기</button>
            </div>}
          </div>
          <div className="notice-actions">
            <button type="submit" className="notice-button notice-primary" disabled={preparingPhoto || Boolean(photoError)}>{editing ? '수정 저장' : '공지 게시'}</button>
            {editing && <button type="button" className="notice-button" onClick={clearDraft}>수정 취소</button>}
          </div>
        </fieldset>
      </form>
    </section>
    <section aria-labelledby="notice-admin-list">
      <h2 id="notice-admin-list" tabIndex={-1} ref={listHeading}>게시한 공지</h2>
      <p className="notice-feedback" role="status">{pending ? '처리 중입니다.' : message}</p>
      {writeError && <p className="notice-feedback notice-error" role="alert">{writeError}</p>}
      {notices.data.posts.length === 0 && <p className="notice-state">게시한 공지가 없습니다.</p>}
      {notices.data.posts.length > 0 && <ul className="notice-list" aria-busy={notices.loading}>
        {notices.data.posts.map(post => <li key={post.id} className="notice-admin-row">
          <div><p className="notice-admin-title">{post.title}</p><NoticeDate value={post.createdAt} /></div>
          <div className="notice-actions">
            <button type="button" className="notice-button" aria-label={`${post.title} 수정`} disabled={pending || notices.loading} onClick={() => startEditing(post)}>수정</button>
            <button type="button" className="notice-button notice-danger" aria-label={`${post.title} 삭제`} disabled={pending || notices.loading} onClick={() => void deleteNotice(post)}>삭제</button>
          </div>
        </li>)}
      </ul>}
      <NoticePager page={notices.page} hasNext={notices.data.hasNext} disabled={pending || notices.loading}
        changePage={page => {
          notices.setPage(page);
          listHeading.current?.focus();
        }} />
    </section>
  </div>;
}
