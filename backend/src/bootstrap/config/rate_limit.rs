use std::{env, time::Duration};

use crate::infrastructure::helper::rate_limit::RateRule;

/// Giới hạn chống spam khi đăng bài và bình luận, chỉnh được qua biến môi trường.
/// Đặt khoảng cách và số lượt về 0 để tắt hẳn một loại.
#[derive(Debug, Clone, Copy)]
pub struct RateLimitConfig {
    pub post: RateRule,
    pub comment: RateRule,
}

const HOUR: Duration = Duration::from_secs(3600);

impl RateLimitConfig {
    pub fn from_env() -> Self {
        Self {
            // Mặc định: bài mới cách nhau 30 giây, tối đa 10 bài mỗi giờ.
            post: RateRule {
                min_interval: Duration::from_secs(read("POST_MIN_INTERVAL_SECS", 30)),
                window: HOUR,
                max_per_window: read("POST_LIMIT_PER_HOUR", 10) as usize,
            },
            // Mặc định: bình luận (kể cả trả lời) cách nhau 10 giây, tối đa 60 mỗi giờ.
            comment: RateRule {
                min_interval: Duration::from_secs(read("COMMENT_MIN_INTERVAL_SECS", 10)),
                window: HOUR,
                max_per_window: read("COMMENT_LIMIT_PER_HOUR", 60) as usize,
            },
        }
    }

    /// Không giới hạn gì; test tích hợp dùng để tạo nhiều bài liên tiếp.
    pub fn off() -> Self {
        Self {
            post: RateRule::off(),
            comment: RateRule::off(),
        }
    }
}

fn read(key: &str, default: u64) -> u64 {
    env::var(key)
        .ok()
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(default)
}
