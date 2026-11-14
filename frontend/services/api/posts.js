/**
 * Điểm truy cập bài viết cho trang tìm kiếm.
 * Khi có WebSocket, chỉ cần đổi lớp vận chuyển tại đây thay vì sửa trang.
 */
import { request } from '/services/api/client.js';
import { backendSupports } from '/services/api/capabilities.js';

/**
 * Tìm bài qua HTTP sau khi người dùng gửi biểu mẫu tìm kiếm.
 * @param {object} options Từ khoá, mã thẻ, phân trang và tín hiệu huỷ.
 * @returns {Promise<Array>} Danh sách bài viết chưa bổ sung tác giả và thẻ.
 */
export function searchPosts({ q, tagIds = [], limit = 10, offset = 0, signal } = {}) {
  return request('/posts', {
    query: { q, tags: tagIds.join(','), limit, offset },
    signal,
  });
}

/**
 * Lấy thẻ để bổ sung vào kết quả ở trang tìm kiếm và trang đọc bài.
 * @param {string} postId Mã bài viết.
 * @returns {Promise<Array>} Các thẻ gắn với bài viết.
 */
export function getPostTags(postId) {
  return request('/posts/' + encodeURIComponent(postId) + '/tags');
}

// CẦN BACKEND: GET /posts?sort=popular xếp theo độ phổ biến; GET /posts?lang=vi trả title/content đã dịch, original_language và is_translated. Cờ tắt trả null cho tuỳ chọn chưa hỗ trợ, không gửi yêu cầu.
/** Lấy bài mới hoặc hỏi đáp thật; chỉ thêm sort và lang khi backend đã hỗ trợ. */
export async function listPosts({ limit = 5, offset = 0, tagIds = [], sort = 'newest', lang, signal } = {}) {
  if ((sort === 'popular' && !backendSupports.popularSort)
    || (lang && !backendSupports.autoTranslateFeed)) {
    return null;
  }
  return request('/posts', {
    query: { limit, offset, tags: tagIds.join(','), sort: sort === 'popular' ? sort : undefined, lang },
    signal,
  });
}

// CẦN BACKEND: GET /posts/featured?limit=9 trả bài theo thứ hạng tuần, kèm author{id,username,avatar_url,native}, tags[{id,name}] và comment_count.
/** Đọc bài nổi bật theo thứ hạng; chưa hỗ trợ thì giữ khung chờ dữ liệu trung tính. */
export async function getFeaturedPosts({ limit = 9 } = {}) {
  if (!backendSupports.featuredPosts) {
    return null;
  }
  return request('/posts/featured', { query: { limit } });
}

// CẦN BACKEND: GET /posts và GET /posts/{id} bổ sung comment_count, repost_count, like_count; dùng lại bài đã tải, không tạo endpoint thống kê riêng.
/** Đọc thống kê từ bài hoặc từ trang chi tiết khi chưa có bài truyền vào. */
export async function getPostStats(postId, post = null) {
  if (!backendSupports.postStats) {
    return null;
  }
  const source = post || await request('/posts/' + encodeURIComponent(postId));
  return {
    comment_count: source.comment_count ?? null,
    repost_count: source.repost_count ?? null,
    like_count: source.like_count ?? null,
  };
}

// CẦN BACKEND: GET /my/feed?limit=&offset= có xác thực trả danh sách bài từ người đang theo dõi, cùng cấu trúc GET /posts.
/** Lấy bảng tin theo dõi khi backend hỗ trợ; không gửi yêu cầu tới đường dẫn chưa có. */
export async function listFollowingFeed({ limit = 5, offset = 0, signal } = {}) {
  if (!backendSupports.followingFeed) {
    return null;
  }
  return request('/my/feed', { query: { limit, offset }, signal });
}

/**
 * Lấy một bài viết cho trang đọc bài; API trả 404 khi bài bị ẩn, bị xoá hoặc không tồn tại.
 * @param {string} postId Mã bài viết lấy từ tham số id trên URL.
 * @returns {Promise<object>} PostResponse gồm tiêu đề, nội dung, ngôn ngữ, toạ độ và comments_locked.
 */
export function getPost(postId) {
  return request('/posts/' + encodeURIComponent(postId));
}

/**
 * Lấy toàn bộ bài đã đăng của một tác giả; trang đọc bài đếm số phần tử để hiện "Bài viết".
 * @param {string} userId Mã tác giả.
 * @returns {Promise<Array>} Danh sách PostResponse (API hiện không phân trang endpoint này).
 */
export function listUserPosts(userId) {
  return request('/users/' + encodeURIComponent(userId) + '/posts');
}

/**
 * Dịch bài sang ngôn ngữ giao diện của người đang đăng nhập (POST /posts/{id}/translate, cần JWT).
 * @param {string} postId Mã bài viết.
 * @returns {Promise<object>} { language, source_language, title, content, translated }.
 */
export function translatePost(postId) {
  return request('/posts/' + encodeURIComponent(postId) + '/translate', { method: 'POST' });
}

// CẦN BACKEND: GET /posts/{id}/related?limit=3 trả bài liên quan đã xếp hạng, mỗi bài kèm comment_count và tags[{id,name}]. Chưa có thì trang tự tìm bài cùng tag đầu tiên bằng GET /posts?tags= (dữ liệu thật, chỉ thiếu số bình luận).
/**
 * Lấy tối đa 3 bài liên quan cho thẻ "Bài viết liên quan" của trang đọc bài.
 * @param {object} post Bài đang đọc.
 * @param {Array} postTags Thẻ thật của bài, dùng cho cách dự phòng khi backend chưa có endpoint.
 * @returns {Promise<Array>} Mỗi phần tử có id, title, comment_count (null nếu chưa biết) và tag {id,name}.
 */
export async function getRelatedPosts(post, postTags = []) {
  if (backendSupports.relatedPosts) {
    const items = await request('/posts/' + encodeURIComponent(post.id) + '/related', { query: { limit: 3 } });
    return (items || []).map(item => ({ ...item, tag: item.tag || item.tags?.[0] || null }));
  }
  const tag = postTags[0];
  if (!tag) {
    return [];
  }
  // Lấy 4 bài để còn đủ 3 bài sau khi bỏ chính bài đang đọc.
  const posts = await searchPosts({ tagIds: [tag.id], limit: 4 });
  return (posts || [])
    .filter(item => item.id !== post.id)
    .slice(0, 3)
    .map(item => ({ ...item, comment_count: item.comment_count ?? null, tag }));
}

// CẦN BACKEND: GET /posts/{id} trả place: { name, address, opening_hours, phone } cho bài có toạ độ (latitude/longitude đã có sẵn).
/**
 * Đọc thông tin địa điểm văn hoá của bài; null nghĩa là chưa biết, trang hiện thanh xám.
 * @param {object} post Bài đang đọc.
 * @returns {object|null} Thông tin địa điểm hoặc null khi backend chưa hỗ trợ.
 */
export function getPostPlace(post) {
  return backendSupports.postPlace && post?.place ? post.place : null;
}

// CẦN BACKEND: users có display_name riêng với username là @handle duy nhất; tác giả nhúng cũng cần display_name. Chưa có thì dùng username thật ở cả hai vị trí.
/** Chọn tên hiển thị thật từ hồ sơ đã tải, không phát sinh yêu cầu hồ sơ bổ sung. */
export function getAuthorDisplayName(author) {
  return backendSupports.userHandle ? author?.display_name || author?.username : author?.username;
}
