# HANDOFF.md – Etsubi front end

> **Read [`AGENTS.md`](AGENTS.md) first and follow it.** It holds the binding rules: pure HTML/CSS/JS, tokens, header/footer reuse, minimal animation, Vietnamese comments on every block, no em dash, back-end contract.

Last update: 2026-11-14 · branch `feat/fe-forum` (from `feat/fe-reading`, which is from `feat/fe-auth-search`; fork `ShiroTrang/IE104`).

## 1. What is done (batch 1)

| Page / part | Files | Figma frame (personal file `LukhEp2hUOnbb9SYkv80ks`) |
|---|---|---|
| Design tokens, base styles, shared components (button, input, checkbox, radio card, card, alert, avatar, kbd) | `frontend/styles/tokens.css`, `base.css`, `components.css`, `main.css` | Button set `125:81`, Radio Card `125:47` |
| Shared header (4 tabs, logo with white ring, lang badge, bell + avatar menu, mobile menu, search-bar slot, `/` shortcut) | `frontend/components/header/` | Navbar `140:200`, search header in `168:1084` |
| Shared footer (`slim` for auth pages, `full` for content pages, mobile one-liner) | `frontend/components/footer/` | Footer `140:276`, `168:1084` |
| Auth illustration (sun, clouds, torii, petals, waves) | `frontend/components/auth-scene/`, `styles/pages/auth.css` | `256:2242` |
| API client (base URL override, Bearer token, request queue for the 4 req/s rate limit, 429 retry) + services | `frontend/services/api/` | – |
| Session, routes, errors (VI messages), DOM/format helpers | `frontend/utils/` | – |
| **Login** | `frontend/pages/profile/login.html` + `login.js` | Login 3a `256:2242` |
| **Register** | `frontend/pages/profile/register.html` + `register.js` | Register 1a `256:2355` |
| **Register Advanced** (profile completion, native language single choice) | `frontend/pages/profile/register-advanced.html` + `.js`, `styles/pages/register-advanced.css`, `assets/avatars/` | Register Advanced 2 `159:524` (and `126:2`) |
| **Search** (empty + results, tag chips, tag filter, mobile) | `frontend/pages/search.html` + `search.js`, `styles/pages/search.css`, `components/search-bar/`, `components/tag-chip/`, `components/postcard/` | `267:2576`, `168:1084`, `204:1448`, states `168:869` |
| **Home (Trang chủ), implementation done**: hero, featured placeholders/pagination, recommendations, real latest/question feed, tabs, bookmark/follow, opt-in header search | `frontend/pages/index.html` + `index.js`, `styles/pages/home.css`, `components/featured-card/`, feed export in `components/postcard/`, capability-gated API services | Home 4 `140:135`, Navbar `140:200`, PostCard `139:157` |
| **Reading page (Đọc bài), batch 2**: author row with flag, translate button, paragraphs + quote blocks, like/save/share pills, discussion (sort, replies, own-comment delete, per-comment translate, locked/muted states), sidebar (Về tác giả with real post/follower counts and follow, Địa điểm văn hoá, Bài viết liên quan, Chủ đề liên quan), petals, not-found state | `frontend/pages/post.html` + `post.js`, `styles/pages/post.css`, `services/api/comment.js`, additions in `posts.js`, `reactions.js`, `bookmarks.js`, `follows.js`, `capabilities.js`, `utils/errors.js`, assets `icons/flag-vn.svg`, `icons/flag-jp.svg`, `icons/external-link.svg`, `illustrations/culture-map.svg` | shared file Reading Page `1:1337` (personal `234:1679`) |
| **Diễn đàn (forum), batch 2**: heading, 4 feed tabs (Mới nhất, Phổ biến, Đang theo dõi, Hỏi đáp), compose box (expands to title + topic chips, posts via `POST /posts` then `POST /posts/{id}/tags/{tag}`), shared feed PostCard, "Tải thêm bài viết" paging, `?compose=1` opens the compose box | `frontend/pages/forum.html` + `forum.js`, `styles/pages/forum.css`, `createPost`/`addPostTag`/`uploadAttachment`/`supportsPolls` in `services/api/posts.js`, flags `postAttachments`/`postPolls`, post error messages in `utils/errors.js`, icons `compose-camera.svg`, `compose-attachment.svg`, `compose-poll.svg` | shared file Diễn đàn `1:1587` (personal `236:1725`) |
| Demo data script | `frontend/dev/seed-demo.sh` | – |
| Figma reference renders | `design-ref/*.png` | – |

## 2. What is left (next batches)

Frame IDs below are in the personal file. The shared team file (source of truth) has its own IDs, listed in AGENTS.md §7.

| Page | Figma frame | Notes |
|---|---|---|
| Hỗ trợ | `243:1848` / `247:2088` | `/pages/support.html`; red icon set + StatusBadge in `242:1843`. |
| Giới thiệu | `245:1956` | `/pages/about.html`; Flag set `256:2489`. |
| Profile | board `226:1544` | `/pages/profile/index.html` (file exists, empty). Uses `GET /my`, `GET /users/{id}`, follows, bookmarks. |
| Mod/Admin views | board `260:1891` | `/manage/*` endpoints; staff badge colour `--color-staff`. RBAC summary in AGENTS.md §8. |
| i18n (VI/JA/EN) | – | Header language badge only stores `localStorage.etsubi_lang`; no dictionaries yet. |

## 3. How to run locally

```bash
# API + database (Docker). First build compiles Rust, takes several minutes.
docker compose --profile full up -d --build postgres backend
# Demo users and posts (password for all demo users is in the script header)
bash frontend/dev/seed-demo.sh
# Static front end on the CORS-allowed port 12321
cd frontend && python -m http.server 12321      # or: npx live-server --port=12321 .
```

Later restarts (containers already built, data kept):

```bash
docker compose --profile full start postgres backend   # stop: docker compose --profile full stop
cd frontend && python -m http.server 12321
```

Always open the site through `http://localhost:12321`. Other origins (VS Code Live Server on 5500, `file://`) are blocked by the back end's CORS and show "Không kết nối được máy chủ".

Open `http://localhost:12321/pages/profile/login.html?api=http://localhost:21432/api/v1` once: the `?api=` value is saved in `localStorage` so every page talks to the Docker API (port 21432). `?api=reset` goes back to the default `http://localhost:11432/api/v1` (back end run with `cargo run`).

Pages: `/pages/profile/login.html`, `/pages/profile/register.html`, `/pages/profile/register-advanced.html` (needs login), `/pages/search.html`, e.g. `/pages/search.html?q=onsen&tag=question&tag=general`.

Contract test (no dependencies): `node frontend/dev/tests/auth-foundation.mjs`.

## 4. Known issues and decisions

- **Search has no socket (deferred by the team).** The back-end dev has not implemented the socket yet, so it is skipped for now; the back end only has `GET /api/v1/posts?q=&tags=`. `services/api/posts.js#searchPosts` is the single transport point to swap later.
- **Search data gaps:** the API returns no author name, tags, comment/like/view counts, or total. Cards fetch author and tags progressively (rate limit 4 req/s); counts are not shown; the result count is the number loaded ("10+" when another page may exist); sort is "Mới nhất" only (server order) plus a client-side "Cũ nhất".
- **Login is by email only** (back end `LoginRequest { email, password }`); username login is not supported.
- **Register "Họ và tên" is stored as `username`** (unique, ≥ 3 bytes). Native language is set to `vi` at register and chosen on Register Advanced.
- **No avatar upload endpoint:** Register Advanced stores a preset path or a small 256×256 JPEG data URL in `avatar_url`.
- **No email verification (skipped for now by the team)** – the back end has none, so the 4th step "Xác thực email" of frame `126:2` is not built; the 3-step frame `159:524` is the implemented version.
- **"Quên mật khẩu?"** has no back-end endpoint: shows an info message.
- **Back end on Windows:** `backend/docker/entrypoint.sh` is checked out with CRLF when `core.autocrlf=true`, and the container then fails with `exec /entrypoint.sh failed: No such file or directory`. Convert it to LF before `docker compose build` (`sed -i 's/\r$//' backend/docker/entrypoint.sh`), or add a `.gitattributes` rule `*.sh text eol=lf` in a back-end PR.
- A failed login (`401`) or a taken email (`409`) logs a network error line in the browser console. That is the browser's own request log, not a JS error – expected.
- `python -m http.server` lets the browser cache ES modules. After editing a `.js` file, hard-reload (Ctrl+Shift+R) or disable cache in DevTools, otherwise you may test old code.
- Search tag counts in "Tag phổ biến" come from one capped search per tag (max 50, shown as "50+").
- Fixed after review (2026-11-13): on mobile the search heading now takes its own row above the sort/"Viết bài" buttons. The password eye icon was squashed by the Figma export, so it was replaced with the Lucide original, and Edge's own reveal button is hidden (`::-ms-reveal`).
- Search result cards now always show the comment, like and view slots as in Figma `1:2927`, with "–" until `GET /posts` returns the counts (see §5). The result total still shows "10+" when there may be more pages, until the API returns a total.

- **Home and `services/api/capabilities.js`:** every Home feature the API lacks (featured posts, recommendations, post stats, popular sort, following feed, bookmark state, feed translation, display name, unread notifications) is behind a flag in `backendSupports`. A `false` flag means no request is sent and the UI shows neutral placeholders ("–", grey bars). When the back end ships an endpoint from §5, flip its flag to `true` and test.
- **Home decisions:** the Figma "Bài viết mới" header has a "Xem thêm →" link; it is left out because the team agreed on "no Xem thêm bài viết". The hero photo from Figma (2400px, 1.35 MB) was resized to 1920px JPEG (`assets/images/home-hero.jpg`, ~0.6 MB).

- **Figma review, 2026-11-13** (shared file `HFYjrrtGqo86EpOX1Bdg88`, following AGENTS.md §7 "Final review procedure"):
  - Home feed card: the "Xem chi tiết" row sat too close to the divider. Its top padding is now 18px, so the button is 19px below the line as in Figma. Detail buttons are now exactly 34px tall.
  - Home header search: now the translucent pill from Figma instead of a cream pill. The square focus box inside it was removed, and the whole pill shows the focus state instead.
  - Home hero: height reduced from 480 to 336px on the team's request, so the three featured cards fit in the first screen at 1920×947. This is an intentional difference from Figma.
  - Home "Bài viết mới": added the "Xem thêm →" link to the forum page, as in Figma.
  - Header: the right side is now in Figma order, bell → language badge → avatar. Login/Register no longer show the search icon.
  - Search result cards: comment, like and view slots restored with "–" placeholders.
  - Checked and matching Figma within a few px: Login (signed out), Register, Register Advanced 2, and both Search states.
  - Intentional differences:
    - The terms checkbox starts unchecked (Figma draws it checked), because consent must be the user's own action.
    - The Figma sun "theme toggle" is not built, because there is no dark theme yet.
    - Register Advanced shows the bell and avatar, because the user is already signed in at that step.

- **Reading page (2026-11-14)**, checked against shared file frame `1:1337` with the AGENTS.md §7 procedure (backend in Docker, demo data, signed out, signed in as a reader and as the author, 1920×1080 and 375×812):
  - Measured in the browser: article card top 156px, author row 56px, title 50px, translate button 41px, action pills 42px, "Thảo luận" heading 31px, comment send/follow buttons 50px, sidebar 403px with 20px gaps. These match Figma. Buttons on this page use 19-20px line-heights instead of the shared 1.5/1.4, so their heights match Figma.
  - Everything shown is real API data:
    - Likes are the total of `GET /posts/{id}/reactions/summary`. The like button sends the ❤️ reaction.
    - Comment count is the number of visible comments.
    - The author's post count is the length of `GET /users/{id}/posts`. Follower count is the length of `GET /users/{id}/followers`.
    - Reading time is computed from the content (200 words/min, 500 Japanese characters/min).
  - Fixed during the check:
    - The follow button lost its reference after `await`.
    - Comment dates showed "14-11" instead of "14/11".
    - The sidebar ignored `hidden`.
    - Locked posts invited people to write the first comment.
  - Intentional differences from Figma:
    - **Content:** the post body has no image, because posts have no image field and there is no upload endpoint. A paragraph whose lines all start with `>` becomes the pink quote block.
    - **Địa điểm văn hoá card:**
      - Shown only when the post has `latitude`/`longitude`.
      - The map is a static illustration made from the Figma vectors, without the sample place labels. The label chip shows the real coordinates. "Mở trong Maps" and "Xem trên Google Maps" open Google Maps at those coordinates.
      - Place name, address and opening hours show grey bars until the back end sends `place`.
    - **Bài viết liên quan:** until `GET /posts/{id}/related` exists, it lists real posts that share the post's first tag. The comment count shows "–".
    - **Extra comment features (not in the frame):**
      - Replies (`parent_id`) are indented under their parent.
      - The comment author sees "Xoá", with a second click to confirm.
      - A locked post or a muted viewer gets an info message instead of the form.
    - **Gửi button:** stays at opacity .4 while the input is empty, the same rule as the search Submit. Figma draws it enabled.
    - **Not built:**
      - The sun "theme toggle", as on other pages.
      - Post status and lock toggles. They belong to the Mod/Admin batch.
    - **Fonts:** the page's Google Fonts link adds Be Vietnam Pro italic 400 for the quote block.
  - Back-end behaviour seen while testing:
    - `POST /posts/{id}/translate` returns 503 when no translation provider is configured. The page shows "Dịch vụ dịch chưa sẵn sàng".
    - Comments are stored with the author's UI language, so translating returns `translated: false` and the page says the comment is already in the viewer's language.
  - Shared code touched, all additive: new exported functions in the services listed in §1, three new flags in `capabilities.js` (`relatedPosts`, `postPlace`, `commentAuthors`), `translationErrorMessage()` in `utils/errors.js`, and a new reading-page token block in `tokens.css`. Header, footer, postcard, featured-card, tag-chip and search-bar are unchanged.
- **Diễn đàn (2026-11-14)**, checked against shared file frame `1:1587` with the AGENTS.md §7 procedure (signed out, signed in as Kenji, 1920×1080 and 375×812):
  - Measured in the browser: heading top 125px and 71px high, tabs top 216px and 38px high, compose box top 274px and 155px high (divider 83px from its top, action row 40px), first card top 449px, 20px between cards. These match Figma.
  - The feed cards are the shared `createFeedPostCard` from Home, so the Home review of the card applies. Comment and share counts show "–" until `GET /posts` returns them. The like count is the total of the reaction summary.
  - Tested:
    - Tabs: Phổ biến shows "sẽ có khi máy chủ hỗ trợ". Đang theo dõi asks signed-out users to sign in, and tells signed-in users it is not supported yet. Hỏi đáp only lists posts tagged `question`.
    - Compose box: clicking it while signed out goes to Login with `redirect=/pages/forum.html?compose=1`. Signed in, it expands. Đăng stays disabled until both title and content are filled. Posting with a topic puts the new post at the top of Mới nhất with a "Xem bài" link. Huỷ clears the draft.
    - Ảnh, Tệp and Thăm dò show a "sẽ có khi máy chủ hỗ trợ" message and send no request.
    - Bookmarking from a card works. "Tải thêm bài viết" appends the 11th post and then hides itself.
  - Fixed during the check:
    - The Huỷ button and the "Tải thêm" row ignored `hidden`.
    - The loading card had a square avatar.
    - `?compose=1` did not expand the box when the browser window was not focused.
    - The signed-out placeholder wrapped onto two lines on mobile.
  - Intentional differences from Figma:
    - The compose box expands to add a required **Tiêu đề** field and topic chips, because `POST /posts` requires a title and posts are tagged after creation. Figma only shows the collapsed box.
    - Huỷ appears only while the box is open.
    - **"Tải thêm bài viết"** (10 posts per page) is not in the frame. It was added so older posts can still be reached. The Home "no Xem thêm" decision applies only to Home.
    - A signed-out user sees a grey avatar and "Đăng nhập để chia sẻ…" instead of a name.
    - The sun theme toggle is not built.
  - Home has the same square loading avatar bug in `createFeedPlaceholder()` in `pages/index.js`: the placeholder span is missing the `avatar` class. It is not changed on this branch.
  - Shared code touched, all additive: new functions in `services/api/posts.js`, two new flags in `capabilities.js`, new messages in `utils/errors.js`, and a forum token block in `tokens.css`. The petal rotation tokens of the reading page are reused. Header, footer, postcard, featured-card, tag-chip and search-bar are unchanged.
- **Docker on Windows without editing `backend/`:** besides converting `entrypoint.sh` to LF, you can mount an LF copy over it with an extra compose file that has `services.backend.volumes: ["<path>/entrypoint.sh:/entrypoint.sh:ro"]` and run `docker compose -f docker-compose.yml -f <that file> --profile full up -d --build postgres backend`.

## 5. Yêu cầu cho backend (requests for the back-end dev)

The back end will be adjusted to the front end. Every agent adds a row here when a screen needs data the API does not return yet. Status: `cần làm` → `đã có` once the back end ships it.

| Needed by | Endpoint / change | Fields or behaviour the front end expects | Status |
|---|---|---|---|
| Search results, Home, Forum | `GET /posts` (and `GET /posts/{id}`) | add `author: { id, username, avatar_url, native }`, `tags: [{ id, name }]`, `comment_count`, `repost_count`, `like_count`, `view_count` to each post, so cards need no extra requests; Home `getPostStats(postId, post)` reads list fields behind `postStats` | cần làm |
| Search results | `GET /posts?q=&tags=` | total match count, e.g. `{ items: [...], total }` or header `X-Total-Count` | cần làm |
| Search results, Home tab Phổ biến | `GET /posts?sort=` | `sort=relevance`, `newest`, `oldest`, `popular` ("Liên quan nhất" in Figma); Home `listPosts({ sort: 'popular' })` gated by `popularSort` | cần làm |
| Search "Tag phổ biến" | `GET /tags` | `post_count` per tag | cần làm |
| Home "Bài viết nổi bật" | `GET /posts/featured?limit=9` | `getFeaturedPosts({limit=9})`: array ordered by rank (staff pick / most reactions this week), each `{...post, author:{id,username,avatar_url,native}, tags:[{id,name}], comment_count}`; flag `featuredPosts` | cần làm |
| Home "Có thể bạn quan tâm" | `GET /my/recommendations` (JWT); users: chủ đề quan tâm | `getMyRecommendations()` returns `{topics:[{id,name}], posts:[{id,title,comment_count,tag:{id,name}}], members:[{id,username,avatar_url,institute,address}]}` based on registration topics. Add a stored interested-topics field on users and support saving it at registration/profile update; flag `recommendations` | cần làm |
| Home tab Đang theo dõi | `GET /my/feed?limit=&offset=` (JWT) | `listFollowingFeed({limit,offset})`: posts from followed users with the same shape as GET /posts; flag `followingFeed` | cần làm |
| Home bookmark icon | `GET /posts` for signed-in viewer | `is_bookmarked: boolean` per post, read by `getBookmarkState(post)` behind `bookmarkState`; do not add a request per post. Existing POST/DELETE /posts/{id}/bookmark are already used for real saves | cần làm |
| Home feed translation | `GET /posts?lang=vi` | translated `title`/`content`, `original_language`, `is_translated`; `listPosts({lang})` behind `autoTranslateFeed`. Until supported, show source language and link to post detail with `&translate=1` | cần làm |
| Home author name and handle | users and embedded `author` in `GET /posts` | `display_name` (Họ và tên) separate from unique `username` (@handle); `getAuthorDisplayName(author)` behind `userHandle`. Today both labels use the real username | cần làm |
| Home header bell | unread notification count endpoint (backend to define) | `unread_count: number` for the signed-in user; the 8px `site-header__bell-dot` remains hidden until real data is available, no request sent today | cần làm |
| Login "Quên mật khẩu?" | new password-reset endpoints | request reset by email, set new password with a token | cần làm |
| Register Advanced avatar | new upload endpoint | upload an image, return a URL for `avatar_url` (today: preset path or small data URL) | cần làm |
| Reading page "Bài viết liên quan" | `GET /posts/{id}/related?limit=3` | ranked related posts, each with `comment_count` and `tags: [{ id, name }]`; read by `getRelatedPosts()` behind flag `relatedPosts` (until then: real posts with the same first tag, count "–") | cần làm |
| Reading page "Địa điểm văn hoá" | `GET /posts/{id}` (and `POST`/`PATCH /posts`) | `place: { name, address, opening_hours, phone }` for posts with coordinates; read by `getPostPlace()` behind flag `postPlace` (grey bars until then) | cần làm |
| Reading page comments | `GET /posts/{id}/comments` | embed `author: { id, username, avatar_url, native }` in each comment, so the page does not call `GET /users/{id}` per commenter; read by `getEmbeddedAuthor()` behind flag `commentAuthors` | cần làm |
| Reading page author card | `GET /users/{id}` | `post_count` and `follower_count`, so the page does not download the full post and follower lists just to count them | cần làm |
| Reading page translate | comment language | store each comment's own language (detected or chosen) instead of the author's UI language, so `POST /comments/{id}/translate` can translate a Japanese comment for a Vietnamese reader | cần làm |
| Diễn đàn compose: Ảnh, Tệp | `POST /uploads` (multipart `file`) + `attachments` on posts | upload returns `{ url, name, mime_type, size }`; `POST /posts` accepts `attachments: [{ type: "image" \| "file", url, name }]` and `GET /posts` returns them so cards can show the image; `uploadAttachment()` behind flag `postAttachments` (`client.js` must then send `FormData` as is) | cần làm |
| Diễn đàn compose: Thăm dò | poll on posts | `POST /posts` accepts `poll: { question, options: [string], closes_at? }`; `GET /posts/{id}` returns the poll with per-option votes and the viewer's choice; `POST /posts/{id}/poll/votes { option_index }`; `supportsPolls()` behind flag `postPolls` | cần làm |
| Diễn đàn feed paging | `GET /posts` | total count (same request as Search) so "Tải thêm bài viết" can hide exactly at the end instead of guessing from a short page | cần làm |
| Search | socket transport | deferred by team, HTTP stays for now | hoãn |
| Register | email verification | deferred by team | hoãn |
