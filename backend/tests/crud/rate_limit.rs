//! Chống spam: đăng bài và bình luận quá nhanh bị chặn bằng 409 `rate_limited` kèm số giây phải chờ.
//! Dùng `TestServer::start_with_rate_limits()` nên chạy theo mức mặc định (bài 30 giây, bình luận 10 giây),
//! trừ khi môi trường test đặt POST_MIN_INTERVAL_SECS / COMMENT_MIN_INTERVAL_SECS khác.

use reqwest::blocking::Response;
use serde_json::{Value, json};

use crate::common::{TestServer, TestUser, register_and_login};

fn post(user: &TestUser, server: &TestServer, title: &str) -> Response {
    user.client
        .post(server.url("/api/v1/posts"))
        .bearer_auth(&user.token)
        .json(&json!({"title": title, "content": "<p>nội dung</p>"}))
        .send()
        .unwrap()
}

fn comment(user: &TestUser, server: &TestServer, post_id: &str, parent: Option<&str>) -> Response {
    user.client
        .post(server.url(&format!("/api/v1/posts/{post_id}/comments")))
        .bearer_auth(&user.token)
        .json(&json!({"content": "bình luận", "parent_id": parent}))
        .send()
        .unwrap()
}

/// Kiểm tra phản hồi bị chặn: 409, mã `rate_limited`, header và trường `retry_after` > 0.
fn assert_limited(r: Response) {
    assert_eq!(r.status(), 409);
    let retry_header: u64 = r
        .headers()
        .get("Retry-After")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse().ok())
        .expect("Retry-After header");
    let body: Value = r.json().unwrap();
    assert_eq!(body["code"], "rate_limited");
    let retry = body["retry_after"].as_u64().unwrap();
    assert!(retry >= 1);
    assert_eq!(retry, retry_header);
}

#[test]
fn second_post_right_away_is_rate_limited() {
    let server = TestServer::start_with_rate_limits();
    let user = register_and_login(&server.base);
    let other = register_and_login(&server.base);

    assert_eq!(post(&user, &server, "Bài 1").status(), 201);
    assert_limited(post(&user, &server, "Bài 2"));
    // Người khác không bị ảnh hưởng.
    assert_eq!(post(&other, &server, "Bài của người khác").status(), 201);
}

#[test]
fn invalid_post_does_not_use_up_the_slot() {
    let server = TestServer::start_with_rate_limits();
    let user = register_and_login(&server.base);

    // Tiêu đề trống bị từ chối 400 và không tính lượt, nên bài hợp lệ ngay sau vẫn đăng được.
    assert_eq!(post(&user, &server, "   ").status(), 400);
    assert_eq!(post(&user, &server, "Bài hợp lệ").status(), 201);
}

#[test]
fn replies_and_comments_share_one_rate_limit() {
    let server = TestServer::start_with_rate_limits();
    let author = register_and_login(&server.base);
    let user = register_and_login(&server.base);

    let r = post(&author, &server, "Bài để bình luận");
    assert_eq!(r.status(), 201);
    let post_id = r.json::<Value>().unwrap()["id"].as_str().unwrap().to_string();

    let r = comment(&user, &server, &post_id, None);
    assert_eq!(r.status(), 201);
    let comment_id = r.json::<Value>().unwrap()["id"].as_str().unwrap().to_string();

    // Trả lời ngay sau đó cũng bị chặn (cùng giới hạn với bình luận gốc).
    assert_limited(comment(&user, &server, &post_id, Some(&comment_id)));
    assert_limited(comment(&user, &server, &post_id, None));
    // Tác giả bài chưa bình luận lần nào nên vẫn bình luận được.
    assert_eq!(comment(&author, &server, &post_id, Some(&comment_id)).status(), 201);
}
