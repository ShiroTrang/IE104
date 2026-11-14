/** Bình luận của bài viết: đọc, gửi, xoá và dịch, dùng cho trang đọc bài. */
import { request } from '/services/api/client.js';
import { backendSupports } from '/services/api/capabilities.js';

/**
 * Lấy mọi bình luận đang hiện của bài (API chưa phân trang, sắp cũ trước).
 * @param {string} postId Mã bài viết.
 * @returns {Promise<Array>} CommentResponse: id, parent_id, user_id, content, is_deleted, created_at.
 */
export function listComments(postId) {
  return request('/posts/' + encodeURIComponent(postId) + '/comments');
}

/**
 * Gửi bình luận mới; parentId để trả lời một bình luận khác.
 * @param {string} postId Mã bài viết.
 * @param {string} content Nội dung người dùng nhập.
 * @param {string|null} parentId Bình luận cha, mặc định null.
 * @returns {Promise<object>} Bình luận vừa tạo.
 */
export function createComment(postId, content, parentId = null) {
  return request('/posts/' + encodeURIComponent(postId) + '/comments', {
    method: 'POST',
    body: { content, parent_id: parentId },
  });
}

/**
 * Xoá mềm bình luận của chính mình (backend kiểm tra quyền).
 * @param {string} commentId Mã bình luận.
 * @returns {Promise<null>} Phản hồi rỗng khi thành công.
 */
export function deleteComment(commentId) {
  return request('/comments/' + encodeURIComponent(commentId), { method: 'DELETE' });
}

/**
 * Dịch một bình luận sang ngôn ngữ giao diện của người đang đăng nhập (cần JWT).
 * @param {string} commentId Mã bình luận.
 * @returns {Promise<object>} { language, source_language, content, translated }.
 */
export function translateComment(commentId) {
  return request('/comments/' + encodeURIComponent(commentId) + '/translate', { method: 'POST' });
}

// CẦN BACKEND: GET /posts/{id}/comments nhúng author { id, username, avatar_url, native } vào mỗi bình luận, để trang không phải gọi GET /users/{id} cho từng người.
/**
 * Lấy tác giả đã nhúng trong bình luận nếu backend hỗ trợ; null thì trang tự tải hồ sơ.
 * @param {object} comment Bình luận từ API.
 * @returns {object|null} Tác giả nhúng hoặc null.
 */
export function getEmbeddedAuthor(comment) {
  return backendSupports.commentAuthors && comment?.author ? comment.author : null;
}
