/** Cờ năng lực giúp giao diện giữ đủ bố cục mà không gọi API chưa tồn tại. */
// Khi backend làm xong từng hợp đồng trong HANDOFF.md, đổi cờ tương ứng thành true.
export const backendSupports = {
  featuredPosts: false,
  recommendations: false,
  postStats: false,
  popularSort: false,
  followingFeed: false,
  bookmarkState: false,
  autoTranslateFeed: false,
  userHandle: false,
  // Trang đọc bài: bài liên quan, thông tin địa điểm và tác giả nhúng trong bình luận.
  relatedPosts: false,
  postPlace: false,
  commentAuthors: false,
};
