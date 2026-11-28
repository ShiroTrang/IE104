use actix_web::{HttpResponse, ResponseError, http::StatusCode};
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum CommentError {
    #[error("Comment not found")]
    NotFound,

    #[error("Content cannot be empty")]
    EmptyContent,

    #[error("Content too long")]
    ContentTooLong,

    #[error("Invalid status")]
    InvalidStatus,

    #[error("Not allowed")]
    Forbidden,

    #[error("Post is locked")]
    PostLocked,

    #[error("User not found")]
    UserNotFound,

    #[error("Post is not available")]
    PostUnavailable,

    #[error("Parent comment is not available")]
    ParentUnavailable,

    #[error("Requires moderator or admin role")]
    RequiresStaff,

    #[error("You are commenting too fast, try again in {retry_after} seconds")]
    RateLimited { retry_after: u64 },

    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl ResponseError for CommentError {
    fn status_code(&self) -> StatusCode {
        match self {
            CommentError::NotFound
            | CommentError::UserNotFound
            | CommentError::PostUnavailable
            | CommentError::ParentUnavailable => StatusCode::NOT_FOUND,

            CommentError::EmptyContent
            | CommentError::ContentTooLong
            | CommentError::InvalidStatus => StatusCode::BAD_REQUEST,

            CommentError::Forbidden | CommentError::PostLocked | CommentError::RequiresStaff => {
                StatusCode::FORBIDDEN
            }

            // 409 thay vì 429: client.js tự gửi lại mọi lỗi 429, không hợp với lỗi chống spam.
            CommentError::RateLimited { .. } => StatusCode::CONFLICT,

            CommentError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn error_response(&self) -> HttpResponse {
        if let CommentError::RateLimited { retry_after } = self {
            return HttpResponse::build(self.status_code())
                .insert_header(("Retry-After", retry_after.to_string()))
                .json(json!({
                    "error": self.to_string(),
                    "code": "rate_limited",
                    "retry_after": retry_after,
                }));
        }
        HttpResponse::build(self.status_code()).json(json!({
            "error": self.to_string(),
        }))
    }
}
