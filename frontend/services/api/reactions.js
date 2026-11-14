/** Đọc thống kê cảm xúc thật để số lượt thích của bảng tin không phải dữ liệu giả. */
import { request } from '/services/api/client.js';

// Trang đọc bài dùng một cảm xúc duy nhất cho nút thích trong Figma.
export const LIKE_EMOJI = '❤️';

/** Lấy từng loại cảm xúc và số lượng; trang cộng count tuần tự sau tác giả và tag. */
export function getReactionSummary(postId) {
  return request('/posts/' + encodeURIComponent(postId) + '/reactions/summary');
}

/**
 * Đọc cảm xúc của người đang đăng nhập với bài; trả null khi chưa thả (API báo 404).
 * @param {string} postId Mã bài viết.
 * @returns {Promise<object|null>} { emoji, reacted_at } hoặc null.
 */
export async function getMyReaction(postId) {
  try {
    return await request('/posts/' + encodeURIComponent(postId) + '/reactions/me');
  } catch (error) {
    // 404 nghĩa là người dùng chưa thả cảm xúc, không phải lỗi cần báo.
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Thả hoặc đổi cảm xúc cho bài (cần JWT).
 * @param {string} postId Mã bài viết.
 * @param {string} emoji Biểu tượng cảm xúc, mặc định là tim.
 * @returns {Promise<object>} Cảm xúc đã lưu.
 */
export function reactToPost(postId, emoji = LIKE_EMOJI) {
  return request('/posts/' + encodeURIComponent(postId) + '/reactions', { method: 'POST', body: { emoji } });
}

/**
 * Bỏ cảm xúc của mình khỏi bài (cần JWT).
 * @param {string} postId Mã bài viết.
 * @returns {Promise<null>} Phản hồi rỗng khi thành công.
 */
export function removeReaction(postId) {
  return request('/posts/' + encodeURIComponent(postId) + '/reactions', { method: 'DELETE' });
}
