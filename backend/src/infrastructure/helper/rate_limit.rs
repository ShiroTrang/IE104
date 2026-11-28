//! Giới hạn tần suất theo người dùng (chống spam đăng bài, bình luận).
//!
//! Đếm trong bộ nhớ của tiến trình: khởi động lại thì xoá sạch, chạy một backend là đủ cho đồ án.
//! Hai điều kiện cùng lúc: cách lần trước ít nhất `min_interval`, và không quá `max_per_window`
//! lần trong `window` gần nhất.

use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

use uuid::Uuid;

/// Một quy tắc giới hạn. `min_interval` = 0 hoặc `max_per_window` = 0 nghĩa là bỏ điều kiện đó.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RateRule {
    pub min_interval: Duration,
    pub window: Duration,
    pub max_per_window: usize,
}

impl RateRule {
    /// Quy tắc không chặn gì (dùng trong test hoặc khi đặt cả hai giá trị về 0).
    pub const fn off() -> Self {
        Self {
            min_interval: Duration::ZERO,
            window: Duration::ZERO,
            max_per_window: 0,
        }
    }

    fn is_off(&self) -> bool {
        self.min_interval.is_zero() && (self.max_per_window == 0 || self.window.is_zero())
    }
}

pub struct RateLimiter {
    rule: RateRule,
    hits: Mutex<HashMap<Uuid, Vec<Instant>>>,
}

impl RateLimiter {
    pub fn new(rule: RateRule) -> Self {
        Self {
            rule,
            hits: Mutex::new(HashMap::new()),
        }
    }

    /// Kiểm tra và ghi nhận một lần thao tác của `user_id`.
    ///
    /// Trả `Err(thời gian còn phải chờ)` nếu vượt giới hạn; khi đó lần này không được tính.
    /// Gọi sau khi dữ liệu đã hợp lệ để lỗi nhập liệu không ăn mất lượt.
    pub fn acquire(&self, user_id: Uuid) -> Result<(), Duration> {
        self.acquire_at(user_id, Instant::now())
    }

    fn acquire_at(&self, user_id: Uuid, now: Instant) -> Result<(), Duration> {
        if self.rule.is_off() {
            return Ok(());
        }
        // Khoá chỉ hỏng khi một luồng khác panic lúc đang giữ; dữ liệu đếm vẫn dùng được.
        let mut hits = self.hits.lock().unwrap_or_else(|e| e.into_inner());
        let keep = self.rule.window.max(self.rule.min_interval);

        // Dọn mốc cũ của mọi người để bộ nhớ không tăng mãi.
        hits.retain(|_, list| {
            list.retain(|at| now.duration_since(*at) < keep);
            !list.is_empty()
        });

        let list = hits.entry(user_id).or_default();
        if let Some(last) = list.last() {
            let since = now.duration_since(*last);
            if since < self.rule.min_interval {
                return Err(self.rule.min_interval - since);
            }
        }
        if self.rule.max_per_window > 0 && !self.rule.window.is_zero() {
            let in_window: Vec<&Instant> = list
                .iter()
                .filter(|at| now.duration_since(**at) < self.rule.window)
                .collect();
            if in_window.len() >= self.rule.max_per_window {
                // Chờ tới khi mốc cũ nhất trong cửa sổ hết hạn.
                let oldest = in_window[0];
                return Err(self.rule.window - now.duration_since(*oldest));
            }
        }
        list.push(now);
        Ok(())
    }
}

/// Đổi thời gian chờ ra số giây làm tròn lên (ít nhất 1) để gửi cho front end.
pub fn retry_after_secs(wait: Duration) -> u64 {
    let secs = wait.as_secs() + u64::from(wait.subsec_nanos() > 0);
    secs.max(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rule(gap: u64, window: u64, max: usize) -> RateRule {
        RateRule {
            min_interval: Duration::from_secs(gap),
            window: Duration::from_secs(window),
            max_per_window: max,
        }
    }

    #[test]
    fn blocks_actions_closer_than_min_interval() {
        let limiter = RateLimiter::new(rule(30, 3600, 10));
        let user = Uuid::new_v4();
        let t0 = Instant::now();
        assert!(limiter.acquire_at(user, t0).is_ok());
        let wait = limiter.acquire_at(user, t0 + Duration::from_secs(10)).unwrap_err();
        assert_eq!(wait, Duration::from_secs(20));
        assert!(limiter.acquire_at(user, t0 + Duration::from_secs(30)).is_ok());
    }

    #[test]
    fn blocks_after_window_limit_until_oldest_expires() {
        let limiter = RateLimiter::new(rule(0, 100, 3));
        let user = Uuid::new_v4();
        let t0 = Instant::now();
        for i in 0..3 {
            assert!(limiter.acquire_at(user, t0 + Duration::from_secs(i)).is_ok());
        }
        let wait = limiter.acquire_at(user, t0 + Duration::from_secs(10)).unwrap_err();
        assert_eq!(wait, Duration::from_secs(90));
        assert!(limiter.acquire_at(user, t0 + Duration::from_secs(100)).is_ok());
    }

    #[test]
    fn users_are_counted_separately_and_rejections_are_free() {
        let limiter = RateLimiter::new(rule(60, 0, 0));
        let (a, b) = (Uuid::new_v4(), Uuid::new_v4());
        let t0 = Instant::now();
        assert!(limiter.acquire_at(a, t0).is_ok());
        assert!(limiter.acquire_at(b, t0).is_ok());
        assert!(limiter.acquire_at(a, t0 + Duration::from_secs(30)).is_err());
        // Lần bị chặn không được ghi, nên mốc vẫn là t0.
        assert!(limiter.acquire_at(a, t0 + Duration::from_secs(60)).is_ok());
    }

    #[test]
    fn off_rule_never_blocks() {
        let limiter = RateLimiter::new(RateRule::off());
        let user = Uuid::new_v4();
        let t0 = Instant::now();
        for _ in 0..100 {
            assert!(limiter.acquire_at(user, t0).is_ok());
        }
    }

    #[test]
    fn retry_after_rounds_up() {
        assert_eq!(retry_after_secs(Duration::from_millis(1)), 1);
        assert_eq!(retry_after_secs(Duration::from_millis(1500)), 2);
        assert_eq!(retry_after_secs(Duration::from_secs(20)), 20);
    }
}
