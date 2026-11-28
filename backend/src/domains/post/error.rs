use actix_web::{HttpResponse, ResponseError, http::StatusCode};
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum PostError {
    #[error("Post not found")]
    NotFound,

    #[error("Title cannot be empty")]
    EmptyTitle,

    #[error("Title too long")]
    TitleTooLong,

    #[error("Content too long")]
    ContentTooLong,

    #[error("Invalid status")]
    InvalidStatus,

    #[error("Not allowed")]
    Forbidden,

    #[error("Post is hidden, cannot edit")]
    HiddenCannotEdit,

    #[error("user not found")]
    UserNotFound,

    #[error(
        "Invalid location: latitude and longitude must be both present or both absent, latitude in [-90,90], longitude in [-180,180]"
    )]
    InvalidLocation,

    #[error("Search query is too long (max 200 characters)")]
    QueryTooLong,

    #[error("You are posting too fast, try again in {retry_after} seconds")]
    RateLimited { retry_after: u64 },

    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl ResponseError for PostError {
    fn status_code(&self) -> StatusCode {
        match self {
            PostError::UserNotFound | PostError::NotFound => StatusCode::NOT_FOUND,

            PostError::EmptyTitle
            | PostError::TitleTooLong
            | PostError::ContentTooLong
            | PostError::InvalidLocation
            | PostError::InvalidStatus
            | PostError::QueryTooLong => StatusCode::BAD_REQUEST,

            PostError::Forbidden | PostError::HiddenCannotEdit => StatusCode::FORBIDDEN,

            // 409 thay vì 429: client.js tự gửi lại mọi lỗi 429, không hợp với lỗi chống spam.
            PostError::RateLimited { .. } => StatusCode::CONFLICT,

            PostError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn error_response(&self) -> HttpResponse {
        if let PostError::RateLimited { retry_after } = self {
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
