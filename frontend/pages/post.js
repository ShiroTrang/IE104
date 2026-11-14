/** Trang đọc bài (Figma Reading Page): tải bài, tác giả, thảo luận và sidebar từ API thật. */
import { mountHeader } from '/components/header/header.js';
import { mountFooter } from '/components/footer/footer.js';
import { getPost, getPostTags, listUserPosts, translatePost, getRelatedPosts, getPostPlace } from '/services/api/posts.js';
import { listComments, createComment, deleteComment, translateComment, getEmbeddedAuthor } from '/services/api/comment.js';
import { getReactionSummary, getMyReaction, reactToPost, removeReaction } from '/services/api/reactions.js';
import { bookmarkPost, unbookmarkPost, isPostBookmarked } from '/services/api/bookmarks.js';
import { followUser, unfollowUser, isFollowing, listFollowers } from '/services/api/follows.js';
import { getUser } from '/services/api/users.js';
import { fetchCurrentUser, getCachedUser, requireAuth } from '/utils/auth.js';
import { el, qs } from '/utils/dom.js';
import { initials } from '/utils/format.js';
import { wrapJapanese } from '/utils/text.js';
import { toVietnameseMessage, translationErrorMessage } from '/utils/errors.js';
import { routes, searchUrl } from '/utils/routes.js';

// Header có tab Diễn đàn đang chọn và ô tìm kiếm trong suốt như frame Figma; footer đầy đủ.
mountHeader(qs('[data-component="header"]'), { active: 'forum', searchForm: true });
mountFooter();

// Kanji trang trí cho ô vuông của bài liên quan, chọn theo tên tag (giống Trang chủ).
const TAG_KANJI = { general: '総', question: '問', discussion: '談', announcement: '告', showcase: '作' };

// Trạng thái trang: bài đang đọc, người xem, tác giả, bình luận và các bộ đếm thật.
const postId = new URLSearchParams(location.search).get('id');
const state = {
  post: null,
  viewer: getCachedUser(),
  author: null,
  tags: [],
  comments: [],
  commentAuthors: new Map(),
  likeCount: null,
  myEmoji: null,
  bookmarked: false,
  following: false,
  postCount: null,
  followerCount: null,
  translated: null,
  showTranslation: false,
};

/* ===== Tiện ích hiển thị ===== */

/** Thanh chờ tĩnh dùng khi dữ liệu chưa có, không giả nội dung. */
function placeholder(extraClass = '') {
  return el('span', { className: 'u-placeholder-bar ' + extraClass, 'aria-hidden': 'true' });
}

/** Báo lỗi chung của trang bằng vùng alert, không dùng alert() của trình duyệt. */
function showPageError(message) {
  const box = qs('[data-page-error]');
  box.textContent = message;
  box.hidden = false;
}

/** Hiện thông báo ngắn dưới nhóm nút thao tác (đã sao chép, lỗi lưu bài...). */
function showActionStatus(message, isError = false) {
  const status = qs('[data-action-status]');
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

/** Đổi ngày ISO thành "25/03/2026" theo giờ máy người xem. */
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Đổi thời gian bình luận thành "25/03 · 14:20"; thêm năm khi khác năm hiện tại. */
function formatCommentTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  // Tự ghép số có 2 chữ số vì toLocaleDateString của vi-VN trả "14-11" khi bỏ năm.
  const pad = number => String(number).padStart(2, '0');
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const day = pad(date.getDate()) + '/' + pad(date.getMonth() + 1) + (sameYear ? '' : '/' + date.getFullYear());
  return day + ' · ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

/** Ước lượng thời gian đọc từ nội dung thật: 200 từ mỗi phút, chữ Nhật tính 500 ký tự mỗi phút. */
function readingMinutes(content) {
  const text = String(content || '');
  const japanese = (text.match(/[぀-ヿ㐀-鿿]/gu) || []).length;
  const words = text.replace(/[぀-ヿ㐀-鿿]/gu, ' ').split(/\s+/u).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200 + japanese / 500));
}

/** Cờ theo tiếng mẹ đẻ (vi → VN, ja → JP, en → nhãn EN) như mô tả component Flag trong Figma. */
function createFlag(native, small = false) {
  const sizeClass = 'post-flag' + (small ? ' post-flag--sm' : '');
  if (native === 'vi' || native === 'ja') {
    const country = native === 'vi' ? 'vn' : 'jp';
    return el('img', {
      className: sizeClass,
      src: '/assets/icons/flag-' + country + '.svg',
      alt: native === 'vi' ? 'Việt Nam' : 'Nhật Bản',
      width: small ? 26 : 29,
      height: small ? 18 : 20,
    });
  }
  if (native === 'en') {
    return el('span', { className: sizeClass + ' post-flag--label', title: 'Tiếng Anh' }, 'EN');
  }
  return null;
}

/** Avatar tròn: ảnh thật nếu có, hỏng ảnh thì quay về chữ đầu tên. */
function fillAvatar(avatar, user) {
  avatar.replaceChildren(initials(user.username));
  if (user.avatar_url) {
    const image = el('img', { src: user.avatar_url, alt: '', loading: 'lazy' });
    /** Ảnh lỗi thì hiện lại chữ đầu tên để không còn khung trống. */
    function useInitials() {
      avatar.replaceChildren(initials(user.username));
    }
    image.addEventListener('error', useInitials, { once: true });
    avatar.replaceChildren(image);
  }
  return avatar;
}

/** Đưa người chưa đăng nhập tới trang đăng nhập; trả về true nếu đã có phiên. */
async function ensureSignedIn() {
  return requireAuth();
}

/* ===== Cánh hoa ===== */

/** Mười cánh hoa tĩnh hai bên lề; vị trí và góc nằm trong token CSS, không inline style. */
function mountPetals() {
  // Mỗi cánh dùng đúng file SVG có kích thước khớp với Figma (đã đối chiếu khung bao).
  const files = [1, 3, 5, 1, 3, 11, 2, 6, 4, 12];
  const layer = qs('[data-petals]');
  files.forEach((file, index) => {
    layer.append(el('img', {
      className: 'post-petal post-petal--' + (index + 1),
      src: '/assets/illustrations/sakura-' + file + '.svg',
      alt: '',
    }));
  });
}

/* ===== Bài viết ===== */

/** Điền hàng tác giả: avatar, tên (liên kết hồ sơ), cờ, ngày đăng và thời gian đọc. */
function renderAuthorRow() {
  const { post, author } = state;
  const row = qs('[data-author]');
  const avatar = el('span', { className: 'post-author__avatar', 'aria-hidden': 'true' });
  const info = el('div', { className: 'post-author__info' });
  if (author) {
    fillAvatar(avatar, author);
    info.append(el('a', { className: 'post-author__name', href: routes.profile + '?id=' + encodeURIComponent(author.id) },
      wrapJapanese(author.username), createFlag(author.native)));
  } else {
    avatar.classList.add('post-author__avatar--placeholder');
    info.append(placeholder('u-placeholder-bar--title post-author__bar'));
  }
  info.append(el('p', { className: 'post-author__meta' },
    formatDate(post.created_at) + ' · ' + readingMinutes(post.content) + ' phút đọc'));
  row.replaceChildren(avatar, info);
}

/** Tách nội dung thành đoạn văn; đoạn mà mọi dòng bắt đầu bằng ">" thành khối trích dẫn. */
function renderBody(content, language) {
  const body = qs('[data-body]');
  const blocks = String(content || '').replace(/\r\n/g, '\n').split(/\n\s*\n/u).map(block => block.trim()).filter(Boolean);
  if (!blocks.length) {
    body.replaceChildren(el('p', { className: 'post-body__empty' }, 'Bài viết chưa có nội dung.'));
    return;
  }
  const nodes = blocks.map(block => {
    const lines = block.split('\n');
    if (lines.every(line => line.trim().startsWith('>'))) {
      const text = lines.map(line => line.trim().replace(/^>\s?/u, '')).join('\n');
      return el('blockquote', { className: 'post-body__quote' }, wrapJapanese(text));
    }
    return el('p', { className: 'post-body__paragraph' }, wrapJapanese(block));
  });
  body.lang = language === 'ja' ? 'ja' : language === 'en' ? 'en' : 'vi';
  body.replaceChildren(...nodes);
}

/** Hiện tiêu đề và thân bài theo bản gốc hoặc bản dịch đang chọn. */
function renderContent() {
  const { post, translated, showTranslation } = state;
  const useTranslation = showTranslation && translated;
  const title = useTranslation ? translated.title : post.title;
  const titleNode = qs('[data-title]');
  titleNode.replaceChildren(wrapJapanese(title));
  titleNode.lang = useTranslation ? translated.language : post.language === 'ja' ? 'ja' : '';
  if (!titleNode.lang) {
    titleNode.removeAttribute('lang');
  }
  renderBody(useTranslation ? translated.content : post.content, useTranslation ? translated.language : post.language);
  const button = qs('[data-translate]');
  button.setAttribute('aria-pressed', String(Boolean(useTranslation)));
  qs('[data-translate-label]').textContent = useTranslation ? 'Xem bản gốc' : 'Dịch bài viết';
}

/** Bấm "Dịch bài viết": gọi API một lần, lần sau chỉ đổi qua lại giữa bản gốc và bản dịch. */
async function toggleTranslation() {
  const status = qs('[data-translate-status]');
  status.classList.remove('is-error');
  if (state.showTranslation) {
    state.showTranslation = false;
    status.textContent = '';
    renderContent();
    return;
  }
  if (!state.translated) {
    if (!await ensureSignedIn()) {
      return;
    }
    const button = qs('[data-translate]');
    button.disabled = true;
    status.textContent = 'Đang dịch…';
    try {
      state.translated = await translatePost(state.post.id);
    } catch (error) {
      status.textContent = translationErrorMessage(error);
      status.classList.add('is-error');
      return;
    } finally {
      button.disabled = false;
    }
  }
  state.showTranslation = true;
  // API báo translated=false khi bài đã ở đúng ngôn ngữ của người xem.
  status.textContent = state.translated.translated ? 'Đang xem bản dịch.' : 'Bài viết đã ở ngôn ngữ của bạn.';
  renderContent();
}

/* ===== Thích, lưu, chia sẻ ===== */

/** Cập nhật pill thích: số lượt thật từ tổng cảm xúc, trạng thái đã thích của người xem. */
function renderLike() {
  const button = qs('[data-like]');
  button.setAttribute('aria-pressed', String(Boolean(state.myEmoji)));
  qs('[data-like-count]').textContent = state.likeCount ?? '–';
}

/** Bấm thích: thả tim nếu chưa có cảm xúc, bỏ cảm xúc nếu đã có; số đếm chỉ đổi khi API thành công. */
async function toggleLike() {
  if (!await ensureSignedIn()) {
    return;
  }
  const button = qs('[data-like]');
  button.disabled = true;
  try {
    if (state.myEmoji) {
      await removeReaction(state.post.id);
      state.myEmoji = null;
      state.likeCount = Math.max(0, (state.likeCount ?? 1) - 1);
    } else {
      const reaction = await reactToPost(state.post.id);
      state.myEmoji = reaction?.emoji || '❤️';
      state.likeCount = (state.likeCount ?? 0) + 1;
    }
    renderLike();
    showActionStatus('');
  } catch (error) {
    showActionStatus(toVietnameseMessage(error), true);
  } finally {
    button.disabled = false;
  }
}

/** Cập nhật pill lưu bài: "Lưu" hoặc "Đã lưu" kèm aria-pressed. */
function renderBookmark() {
  qs('[data-bookmark]').setAttribute('aria-pressed', String(state.bookmarked));
  qs('[data-bookmark-label]').textContent = state.bookmarked ? 'Đã lưu' : 'Lưu';
}

/** Bấm lưu: gọi POST hoặc DELETE /posts/{id}/bookmark rồi đổi trạng thái. */
async function toggleBookmark() {
  if (!await ensureSignedIn()) {
    return;
  }
  const button = qs('[data-bookmark]');
  button.disabled = true;
  try {
    if (state.bookmarked) {
      await unbookmarkPost(state.post.id);
    } else {
      await bookmarkPost(state.post.id);
    }
    state.bookmarked = !state.bookmarked;
    renderBookmark();
    showActionStatus(state.bookmarked ? 'Đã lưu bài viết.' : 'Đã bỏ lưu bài viết.');
  } catch (error) {
    showActionStatus(toVietnameseMessage(error), true);
  } finally {
    button.disabled = false;
  }
}

/** Chia sẻ: dùng bảng chia sẻ của thiết bị nếu có, nếu không thì sao chép liên kết. */
async function sharePost() {
  const url = location.origin + routes.post(state.post.id);
  try {
    if (navigator.share) {
      await navigator.share({ title: state.post.title, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    showActionStatus('Đã sao chép liên kết bài viết.');
  } catch (error) {
    // Người dùng tự đóng bảng chia sẻ thì không cần báo lỗi.
    if (error?.name !== 'AbortError') {
      showActionStatus('Không sao chép được, hãy sao chép địa chỉ trên thanh trình duyệt.', true);
    }
  }
}

/* ===== Thảo luận ===== */

/** Cập nhật số bình luận thật trong tiêu đề "Thảo luận (n)" (không tính bình luận đã xoá). */
function renderCommentCount() {
  const visible = state.comments.filter(comment => !comment.is_deleted).length;
  qs('[data-comment-count]').textContent = visible;
}

/** Bấm "Dịch" của một bình luận: tải bản dịch một lần, sau đó đổi qua lại với bản gốc. */
async function toggleCommentTranslation(comment, button, textNode, note) {
  if (comment.showTranslation) {
    comment.showTranslation = false;
    textNode.replaceChildren(wrapJapanese(comment.content));
    button.textContent = 'Dịch';
    note.textContent = '';
    return;
  }
  if (!comment.translation) {
    if (!await ensureSignedIn()) {
      return;
    }
    button.disabled = true;
    note.classList.remove('is-error');
    note.textContent = 'Đang dịch…';
    try {
      comment.translation = await translateComment(comment.id);
    } catch (error) {
      note.textContent = translationErrorMessage(error);
      note.classList.add('is-error');
      return;
    } finally {
      button.disabled = false;
    }
  }
  comment.showTranslation = true;
  textNode.replaceChildren(wrapJapanese(comment.translation.content));
  button.textContent = 'Bản gốc';
  note.classList.remove('is-error');
  note.textContent = comment.translation.translated ? 'Đang xem bản dịch.' : 'Bình luận đã ở ngôn ngữ của bạn.';
}

/** Xoá bình luận của chính mình: bấm lần đầu đổi thành "Xác nhận xoá", bấm lần hai mới gọi API. */
async function handleDelete(comment, button, note) {
  if (button.dataset.confirm !== 'true') {
    button.dataset.confirm = 'true';
    button.textContent = 'Xác nhận xoá';
    return;
  }
  button.disabled = true;
  try {
    await deleteComment(comment.id);
    state.comments = state.comments.filter(item => item.id !== comment.id);
    renderComments();
  } catch (error) {
    button.disabled = false;
    note.textContent = toVietnameseMessage(error);
    note.classList.add('is-error');
  }
}

/** Dựng một bình luận: avatar, tên, thời gian, nút Dịch/Xoá, nội dung và các trả lời bên dưới. */
function createCommentNode(comment, replies = []) {
  const author = state.commentAuthors.get(comment.user_id);
  const avatar = el('span', { className: 'avatar post-comment__avatar', 'aria-hidden': 'true' });
  if (author) {
    fillAvatar(avatar, author);
  } else {
    avatar.classList.add('post-comment__avatar--placeholder');
  }
  const who = el('div', { className: 'post-comment__who' },
    author ? el('span', { className: 'post-comment__name' }, wrapJapanese(author.username))
      : placeholder('post-comment__name-bar'),
    el('time', { className: 'post-comment__time', datetime: comment.created_at }, formatCommentTime(comment.created_at)));
  const text = el('p', { className: 'post-comment__text' + (comment.is_deleted ? ' post-comment__text--deleted' : '') },
    comment.is_deleted ? 'Bình luận đã bị xoá.' : wrapJapanese(comment.showTranslation ? comment.translation.content : comment.content));
  const note = el('p', { className: 'post-comment__note', role: 'status' });
  const tools = el('div', { className: 'post-comment__tools' });
  if (!comment.is_deleted) {
    const translateButton = el('button', { type: 'button', className: 'post-comment__tool' },
      comment.showTranslation ? 'Bản gốc' : 'Dịch');
    translateButton.addEventListener('click', () => toggleCommentTranslation(comment, translateButton, text, note));
    tools.append(translateButton);
    // Chỉ người viết mới thấy nút xoá; backend vẫn kiểm tra quyền lần nữa.
    if (state.viewer && state.viewer.id === comment.user_id) {
      const deleteButton = el('button', { type: 'button', className: 'post-comment__tool post-comment__tool--muted' }, 'Xoá');
      deleteButton.addEventListener('click', () => handleDelete(comment, deleteButton, note));
      tools.append(deleteButton);
    }
  }
  const node = el('div', { className: 'post-comment' },
    el('div', { className: 'post-comment__row' }, avatar,
      el('div', { className: 'post-comment__content' },
        el('div', { className: 'post-comment__head' }, who, tools), text, note)));
  if (replies.length) {
    node.append(el('div', { className: 'post-comment__replies' },
      replies.map(reply => createCommentNode(reply))));
  }
  return node;
}

/** Vẽ lại danh sách: bình luận gốc theo thứ tự đã chọn, trả lời luôn cũ trước dưới bình luận cha. */
function renderComments() {
  const box = qs('[data-comments]');
  renderCommentCount();
  if (!state.comments.length) {
    // Bài đã khoá bình luận thì không mời người đọc viết bình luận đầu tiên.
    box.replaceChildren(el('p', { className: 'post-comments__note' }, state.post.comments_locked
      ? 'Chưa có bình luận nào.' : 'Chưa có bình luận nào. Hãy là người đầu tiên chia sẻ cảm nhận.'));
    return;
  }
  const order = qs('[data-comment-sort]').value;
  const byTime = (a, b) => new Date(a.created_at) - new Date(b.created_at);
  const ids = new Set(state.comments.map(comment => comment.id));
  // Trả lời có cha không còn trong danh sách được coi như bình luận gốc để không bị mất.
  const roots = state.comments.filter(comment => !comment.parent_id || !ids.has(comment.parent_id)).sort(byTime);
  if (order === 'newest') {
    roots.reverse();
  }
  box.replaceChildren(...roots.map(root => createCommentNode(root,
    state.comments.filter(comment => comment.parent_id === root.id).sort(byTime))));
}

/** Tải hồ sơ người bình luận lần lượt (tôn trọng giới hạn 4 yêu cầu/giây), vẽ lại sau mỗi người. */
async function loadCommentAuthors() {
  for (const comment of state.comments) {
    const embedded = getEmbeddedAuthor(comment);
    if (embedded) {
      state.commentAuthors.set(comment.user_id, embedded);
    }
  }
  const missing = [...new Set(state.comments.map(comment => comment.user_id))]
    .filter(id => !state.commentAuthors.has(id));
  for (const id of missing) {
    try {
      state.commentAuthors.set(id, await getUser(id));
      renderComments();
    } catch {
      // Hồ sơ lỗi thì giữ thanh xám ở vị trí tên, không bịa tên.
    }
  }
}

/** Tải danh sách bình luận thật của bài. */
async function loadComments() {
  try {
    state.comments = await listComments(state.post.id) || [];
    renderComments();
    await loadCommentAuthors();
  } catch (error) {
    qs('[data-comments]').replaceChildren(el('p', { className: 'post-comments__note' },
      'Chưa tải được bình luận: ' + toVietnameseMessage(error)));
  }
}

/** Bật nút Gửi khi ô nhập có chữ, và xoá gợi ý lỗi cũ khi người dùng gõ lại. */
function syncCommentForm() {
  const input = qs('[data-comment-input]');
  qs('[data-comment-submit]').disabled = !input.value.trim();
  input.removeAttribute('aria-invalid');
  const hint = qs('[data-comment-hint]');
  hint.textContent = '';
  hint.classList.remove('field__hint--error');
}

/** Gửi bình luận: kiểm tra phiên, gọi API, thêm bình luận mới vào danh sách khi thành công. */
async function submitComment(event) {
  event.preventDefault();
  const input = qs('[data-comment-input]');
  const button = qs('[data-comment-submit]');
  const hint = qs('[data-comment-hint]');
  const content = input.value.trim();
  if (!content || !await ensureSignedIn()) {
    return;
  }
  state.viewer = getCachedUser();
  button.disabled = true;
  button.classList.add('is-loading');
  button.textContent = 'Đang gửi…';
  try {
    const comment = await createComment(state.post.id, content);
    state.comments.push(comment);
    if (state.viewer && !state.commentAuthors.has(state.viewer.id)) {
      state.commentAuthors.set(state.viewer.id, { id: state.viewer.id, username: state.viewer.username, avatar_url: state.viewer.avatarUrl });
    }
    input.value = '';
    renderComments();
  } catch (error) {
    input.setAttribute('aria-invalid', 'true');
    hint.textContent = toVietnameseMessage(error);
    hint.classList.add('field__hint--error');
  } finally {
    button.classList.remove('is-loading');
    button.textContent = 'Gửi';
    button.disabled = !input.value.trim();
  }
}

/** Khoá bình luận hoặc người xem đang bị cấm viết thì ẩn ô viết và nói rõ lý do. */
function applyCommentPermissions() {
  const form = qs('[data-comment-form]');
  const notice = qs('[data-comment-notice]');
  const mutedUntil = state.viewer?.mutedUntil ? new Date(state.viewer.mutedUntil) : null;
  let message = '';
  if (state.post.comments_locked) {
    message = 'Bình luận của bài viết này đã bị khoá.';
  } else if (mutedUntil && mutedUntil.getTime() > Date.now()) {
    message = 'Tài khoản của bạn đang bị tạm khoá chức năng viết đến ' + mutedUntil.toLocaleString('vi-VN') + '.';
  }
  form.hidden = Boolean(message);
  notice.hidden = !message;
  notice.textContent = message;
}

/* ===== Sidebar ===== */

/** Thẻ "Về tác giả": tên, cờ, giới thiệu, số bài và người theo dõi thật, nút theo dõi. */
function renderSideAuthor() {
  const { author, viewer } = state;
  const body = qs('[data-side-author]');
  if (!author) {
    body.replaceChildren(el('p', { className: 'post-side-card__note' }, 'Chưa tải được thông tin tác giả.'));
    return;
  }
  const stats = el('dl', { className: 'post-side-author__stats' },
    el('div', { className: 'post-side-author__stat' }, el('dt', {}, 'Bài viết'), el('dd', { 'data-stat-posts': '' }, state.postCount ?? '–')),
    el('div', { className: 'post-side-author__stat' }, el('dt', {}, 'Người theo dõi'), el('dd', { 'data-stat-followers': '' }, state.followerCount ?? '–')));
  let action;
  if (viewer && viewer.id === author.id) {
    // Bài của chính mình: thay nút theo dõi bằng lối tắt tới hồ sơ.
    action = el('a', { className: 'btn btn--secondary btn--block post-side-author__action', href: routes.profile }, 'Chỉnh sửa hồ sơ');
  } else {
    action = el('button', {
      type: 'button',
      className: 'btn btn--block post-side-author__action ' + (state.following ? 'btn--secondary' : 'btn--primary'),
      'aria-pressed': String(state.following),
      'data-follow': '',
    }, state.following ? 'Đang theo dõi' : '+  Theo dõi');
    action.addEventListener('click', toggleFollow);
  }
  body.replaceChildren(
    el('p', { className: 'post-side-author__name' }, wrapJapanese(author.username), createFlag(author.native, true)),
    author.bio
      ? el('p', { className: 'post-side-author__bio' }, wrapJapanese(author.bio))
      : el('p', { className: 'post-side-author__bio post-side-author__bio--empty' }, 'Tác giả chưa viết giới thiệu.'),
    el('hr', { className: 'post-divider' }),
    stats,
    el('hr', { className: 'post-divider' }),
    action);
}

/** Bấm theo dõi/bỏ theo dõi tác giả; số người theo dõi chỉ đổi khi API thành công. */
async function toggleFollow(event) {
  // Lấy nút trước lệnh await: sau khi sự kiện kết thúc, event.currentTarget trở thành null.
  const button = event.currentTarget;
  if (!await ensureSignedIn()) {
    return;
  }
  button.disabled = true;
  try {
    if (state.following) {
      await unfollowUser(state.author.id);
      state.followerCount = Math.max(0, (state.followerCount ?? 1) - 1);
    } else {
      await followUser(state.author.id);
      state.followerCount = (state.followerCount ?? 0) + 1;
    }
    state.following = !state.following;
    renderSideAuthor();
    qs('[data-follow]')?.focus();
  } catch (error) {
    button.disabled = false;
    showActionStatus(toVietnameseMessage(error), true);
  }
}

/** Thẻ "Địa điểm văn hoá": chỉ hiện khi bài có toạ độ; tên, địa chỉ, giờ mở cửa chờ backend. */
function renderPlace() {
  const { post } = state;
  const card = qs('[data-side-place-card]');
  const hasLocation = Number.isFinite(post.latitude) && Number.isFinite(post.longitude);
  card.hidden = !hasLocation;
  if (!hasLocation) {
    return;
  }
  const coords = post.latitude.toFixed(4) + ', ' + post.longitude.toFixed(4);
  const mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(post.latitude + ',' + post.longitude);
  const place = getPostPlace(post);
  const info = el('div', { className: 'post-place' });
  if (place) {
    info.append(el('p', { className: 'post-place__name' }, wrapJapanese(place.name || '')),
      el('p', { className: 'post-place__line' }, wrapJapanese(place.address || '–')),
      el('p', { className: 'post-place__line post-place__line--small' },
        [place.opening_hours, place.phone].filter(Boolean).join(' · ') || '–'));
  } else {
    info.append(placeholder('u-placeholder-bar--title'), placeholder(), placeholder('u-placeholder-bar--short'));
  }
  qs('[data-side-place]').replaceChildren(
    el('div', { className: 'post-map' },
      el('img', { className: 'post-map__image', src: '/assets/illustrations/culture-map.svg', alt: '', width: 355, height: 182 }),
      el('a', { className: 'post-map__open', href: mapsUrl, target: '_blank', rel: 'noopener' },
        'Mở trong Maps', el('img', { src: '/assets/icons/external-link.svg', alt: '', width: 14, height: 14 })),
      el('span', { className: 'post-map__label' }, coords)),
    info,
    el('a', { className: 'post-place__link', href: mapsUrl, target: '_blank', rel: 'noopener' }, 'Xem trên Google Maps  ↗'));
}

/** Một dòng bài liên quan: ô kanji theo tag, tiêu đề hai dòng và dòng phụ số bình luận · chủ đề. */
function createRelatedItem(item) {
  const thumb = el('span', {
    className: 'post-related__thumb' + (item ? '' : ' post-related__thumb--placeholder'),
    'aria-hidden': 'true',
    lang: 'ja',
  }, TAG_KANJI[item?.tag?.name] || '越');
  const text = el('div', { className: 'post-related__text' });
  if (item) {
    text.append(el('a', { className: 'post-related__title', href: routes.post(item.id) }, wrapJapanese(item.title)),
      el('p', { className: 'post-related__meta' },
        (Number.isFinite(item.comment_count) ? item.comment_count : '–') + ' bình luận',
        item.tag ? wrapJapanese(' · ' + item.tag.name) : null));
  } else {
    text.append(placeholder('u-placeholder-bar--title'), placeholder('u-placeholder-bar--short'));
  }
  return el('div', { className: 'post-related__item' }, thumb, text);
}

/** Thẻ "Bài viết liên quan": bài thật cùng chủ đề; không có bài nào thì báo rõ. */
async function loadRelated() {
  const box = qs('[data-side-related]');
  box.replaceChildren(createRelatedItem(null), createRelatedItem(null), createRelatedItem(null));
  try {
    const items = await getRelatedPosts(state.post, state.tags);
    box.replaceChildren(...(items.length ? items.map(createRelatedItem)
      : [el('p', { className: 'post-side-card__note' }, 'Chưa có bài viết cùng chủ đề.')]));
  } catch {
    box.replaceChildren(el('p', { className: 'post-side-card__note' }, 'Chưa tải được bài viết liên quan.'));
  }
}

/** Thẻ "Chủ đề liên quan": tag thật của bài, mỗi tag mở trang tìm kiếm với tag đó. */
function renderTopics() {
  const box = qs('[data-side-topics]');
  if (!state.tags.length) {
    box.replaceChildren(el('p', { className: 'post-side-card__note' }, 'Bài viết chưa gắn chủ đề.'));
    return;
  }
  box.replaceChildren(...state.tags.map(tag => el('a', {
    className: 'post-topic',
    href: searchUrl({ tags: [tag.name] }),
  }, wrapJapanese('#' + tag.name))));
}

/* ===== Khởi tạo ===== */

/** Bài không tồn tại hoặc thiếu id: thay khung bài bằng thông báo và lối quay về Diễn đàn. */
function showNotFound(message) {
  const article = qs('[data-article]');
  article.setAttribute('aria-busy', 'false');
  article.replaceChildren(
    el('h1', { className: 't-display post-article__title' }, 'Không tìm thấy bài viết'),
    el('p', { className: 'post-body__empty' }, message),
    el('a', { className: 'btn btn--primary', href: routes.forum }, 'Về Diễn đàn'));
  qs('[data-breadcrumb-title]').textContent = 'Không tìm thấy';
  document.title = 'Không tìm thấy bài viết · Etsubi';
  qs('.post-sidebar').hidden = true;
}

/** Tải các phần cần đăng nhập: cảm xúc của mình, trạng thái lưu và theo dõi. */
async function loadViewerState() {
  if (!state.viewer) {
    return;
  }
  try {
    state.myEmoji = (await getMyReaction(state.post.id))?.emoji || null;
    renderLike();
    state.bookmarked = await isPostBookmarked(state.post.id);
    renderBookmark();
    if (state.author && state.author.id !== state.viewer.id) {
      state.following = await isFollowing(state.author.id);
      renderSideAuthor();
    }
  } catch {
    // Lỗi đọc trạng thái phụ không chặn việc đọc bài; nút vẫn hoạt động khi bấm.
  }
}

/** Tải số bài và số người theo dõi thật của tác giả cho thẻ "Về tác giả". */
async function loadAuthorStats() {
  if (!state.author) {
    return;
  }
  try {
    state.postCount = (await listUserPosts(state.author.id) || []).length;
    state.followerCount = (await listFollowers(state.author.id) || []).length;
  } catch {
    // Không lấy được thì giữ "–", không đoán số.
  }
  renderSideAuthor();
}

/** Trình tự tải trang: bài → tác giả, tag → nội dung → trạng thái người xem → thảo luận → sidebar. */
async function initialize() {
  mountPetals();
  if (!postId) {
    showNotFound('Đường dẫn thiếu mã bài viết.');
    return;
  }
  try {
    state.post = await getPost(postId);
  } catch (error) {
    if (error.status === 404 || error.status === 400) {
      showNotFound('Bài viết có thể đã bị xoá, bị ẩn hoặc đường dẫn không đúng.');
    } else {
      showNotFound(toVietnameseMessage(error));
    }
    return;
  }
  const { post } = state;
  document.title = post.title + ' · Etsubi';
  qs('[data-breadcrumb-title]').replaceChildren(wrapJapanese(post.title));
  qs('[data-article]').setAttribute('aria-busy', 'false');
  renderContent();
  renderPlace();
  applyCommentPermissions();
  // Bật các nút sau khi đã có bài để không gửi thao tác cho bài chưa xác định.
  for (const selector of ['[data-translate]', '[data-like]', '[data-bookmark]', '[data-share]']) {
    qs(selector).disabled = false;
  }

  // Phiên người xem được tải song song với tác giả; hàng đợi trong client.js giữ đúng giới hạn tốc độ.
  const [viewer, author, tags, summary] = await Promise.all([
    fetchCurrentUser().catch(() => null),
    getUser(post.author_id).catch(() => null),
    getPostTags(post.id).catch(() => []),
    getReactionSummary(post.id).catch(() => null),
  ]);
  state.viewer = viewer;
  state.author = author;
  state.tags = tags || [];
  state.likeCount = Array.isArray(summary) ? summary.reduce((total, item) => total + (Number(item.count) || 0), 0) : null;
  renderAuthorRow();
  renderLike();
  renderBookmark();
  renderSideAuthor();
  renderTopics();
  applyCommentPermissions();

  // Từ Trang chủ có thể mở thẳng bản dịch bằng tham số translate=1.
  if (new URLSearchParams(location.search).get('translate') === '1' && viewer) {
    toggleTranslation();
  }
  await loadViewerState();
  await loadComments();
  await loadAuthorStats();
  await loadRelated();
}

// Gắn sự kiện một lần cho các điều khiển tĩnh trong HTML.
qs('[data-translate]').addEventListener('click', toggleTranslation);
qs('[data-like]').addEventListener('click', toggleLike);
qs('[data-bookmark]').addEventListener('click', toggleBookmark);
qs('[data-share]').addEventListener('click', sharePost);
qs('[data-comment-sort]').addEventListener('change', renderComments);
qs('[data-comment-input]').addEventListener('input', syncCommentForm);
qs('[data-comment-form]').addEventListener('submit', submitComment);

initialize().catch(error => showPageError(toVietnameseMessage(error)));
