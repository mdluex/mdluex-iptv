//! Streaming endpoints and the live connection registry (who is watching, connection limits, kick).
use crate::{db, xtream, State};
use axum::{
    body::Body,
    extract::{ConnectInfo, Path, Request, State as S},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Redirect, Response},
};
use futures_util::StreamExt;
use parking_lot::Mutex;
use rusqlite::OptionalExtension;
use serde::Serialize;
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
};
use tower::ServiceExt;

/* ------------------------------------------------------------------ registry */

#[derive(Clone, Serialize)]
pub struct ConnInfo {
    pub server: String,
    pub id: u64,
    pub line_id: i64,
    pub username: String,
    pub ip: String,
    pub kind: String,
    pub stream_id: i64,
    pub title: String,
    pub user_agent: String,
    pub started: i64,
    pub last_seen: i64,
    pub bytes: u64,
}

struct Conn {
    info: ConnInfo,
    remote: Option<i64>, // edge server id when the stream is relayed by an edge
    open: u32,
    ended: i64,
    killed: Arc<AtomicBool>,
    bytes: Arc<AtomicU64>,
}

#[derive(Default)]
pub struct Registry {
    map: Mutex<HashMap<u64, Conn>>,
    next: AtomicU64,
}

/// Held by a streaming response body; releasing it marks the connection as ended.
pub struct Guard {
    reg: State,
    pub id: u64,
    pub killed: Arc<AtomicBool>,
    pub bytes: Arc<AtomicU64>,
    detached: bool,
}
impl Guard {
    /// The viewer is handed to an edge server: from now on its heartbeats keep the slot alive.
    pub fn detach(mut self, server_id: i64, server_name: &str) -> u64 {
        let mut m = self.reg.conns.map.lock();
        if let Some(c) = m.get_mut(&self.id) {
            c.remote = Some(server_id);
            c.open = c.open.saturating_sub(1);
            c.info.last_seen = db::now();
            c.info.server = server_name.to_string();
        }
        drop(m);
        self.detached = true;
        self.id
    }
}
impl Drop for Guard {
    fn drop(&mut self) {
        if self.detached {
            return;
        }
        let mut m = self.reg.conns.map.lock();
        if let Some(c) = m.get_mut(&self.id) {
            c.open = c.open.saturating_sub(1);
            if c.open == 0 {
                c.ended = db::now();
            }
        }
    }
}

impl Registry {
    pub fn list(&self) -> Vec<ConnInfo> {
        let m = self.map.lock();
        let mut v: Vec<ConnInfo> = m
            .values()
            .map(|c| {
                let mut i = c.info.clone();
                i.bytes = c.bytes.load(Ordering::Relaxed);
                i
            })
            .collect();
        v.sort_by_key(|c| -c.started);
        v
    }
    pub fn count_for(&self, line_id: i64) -> usize {
        self.map.lock().values().filter(|c| c.info.line_id == line_id).count()
    }
    pub fn kick(&self, id: u64) -> bool {
        let mut m = self.map.lock();
        if let Some(c) = m.remove(&id) {
            c.killed.store(true, Ordering::Relaxed);
            true
        } else {
            false
        }
    }
    pub fn exists(&self, id: u64) -> bool {
        self.map.lock().contains_key(&id)
    }
    /// Edge heartbeat: keep these viewers alive; returns ids the edge must stop (disconnected here).
    pub fn touch_remote(&self, ids: &[u64]) -> Vec<u64> {
        let mut m = self.map.lock();
        let now = db::now();
        let mut kick = vec![];
        for id in ids {
            match m.get_mut(id) {
                Some(c) => c.info.last_seen = now,
                None => kick.push(*id),
            }
        }
        kick
    }
    pub fn kick_line(&self, line_id: i64) {
        let mut m = self.map.lock();
        m.retain(|_, c| {
            if c.info.line_id == line_id {
                c.killed.store(true, Ordering::Relaxed);
                false
            } else {
                true
            }
        });
    }
}

/// Register a stream start. Re-uses the entry when the same device re-requests the same item
/// (players open several range requests); refuses when the line is at its connection limit.
fn acquire(
    st: &State, line: &xtream::Line, ip: &str, ua: &str, kind: &str, stream_id: i64, title: &str,
) -> Result<Guard, Response> {
    let mut m = st.conns.map.lock();
    let now = db::now();
    if let Some(c) = m.values_mut().find(|c| {
        c.info.line_id == line.id && c.info.ip == ip && c.info.kind == kind && c.info.stream_id == stream_id
    }) {
        c.open += 1;
        c.info.last_seen = now;
        return Ok(Guard { reg: st.clone(), id: c.info.id, killed: c.killed.clone(), bytes: c.bytes.clone(), detached: false });
    }
    // switching channel/film on the same device frees that device's previous slot
    m.retain(|_, c| !(c.info.line_id == line.id && c.info.ip == ip && c.open == 0 && c.remote.is_none()));
    let used = m.values().filter(|c| c.info.line_id == line.id).count() as i64;
    if used >= line.max_connections {
        return Err((StatusCode::FORBIDDEN, "Maximum connections reached for this account").into_response());
    }
    let id = st.conns.next.fetch_add(1, Ordering::Relaxed) + 1;
    let killed = Arc::new(AtomicBool::new(false));
    let bytes = Arc::new(AtomicU64::new(0));
    m.insert(
        id,
        Conn {
            info: ConnInfo {
                server: "main".into(), id, line_id: line.id, username: line.username.clone(), ip: ip.into(), kind: kind.into(), stream_id,
                title: title.into(), user_agent: ua.chars().take(120).collect(), started: now, last_seen: now, bytes: 0,
            },
            remote: None,
            open: 1,
            ended: 0,
            killed: killed.clone(),
            bytes: bytes.clone(),
        },
    );
    Ok(Guard { reg: st.clone(), id, killed, bytes, detached: false })
}
pub fn acquire_pub(st: &State, line: &xtream::Line, ip: &str, ua: &str, kind: &str, stream_id: i64, title: &str) -> Result<Guard, Response> {
    acquire(st, line, ip, ua, kind, stream_id, title)
}

/// Drop connections that ended more than 15 s ago (grace period for players that reconnect).
pub fn spawn_cleanup(st: State) {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            let now = db::now();
            let mut m = st.conns.map.lock();
            m.retain(|_, c| match c.remote {
                Some(_) => now - c.info.last_seen < 30, // edges report every 10 s
                None => c.open > 0 || now - c.ended < 15,
            });
            for c in m.values_mut() {
                if c.open > 0 && c.remote.is_none() {
                    c.info.last_seen = now;
                }
            }
        }
    });
}

/// Wrap a byte stream so it counts traffic, stops when kicked and releases the slot when done.
pub fn guarded_pub<St, E>(inner: St, guard: Guard) -> Body
where
    St: futures_util::Stream<Item = Result<bytes::Bytes, E>> + Send + 'static,
    E: std::fmt::Display + Send + 'static,
{
    guarded(inner, guard)
}
fn guarded<St, E>(inner: St, guard: Guard) -> Body
where
    St: futures_util::Stream<Item = Result<bytes::Bytes, E>> + Send + 'static,
    E: std::fmt::Display + Send + 'static,
{
    let s = inner.map(move |chunk| {
        if guard.killed.load(Ordering::Relaxed) {
            return Err(std::io::Error::new(std::io::ErrorKind::Other, "disconnected by admin"));
        }
        match chunk {
            Ok(b) => {
                guard.bytes.fetch_add(b.len() as u64, Ordering::Relaxed);
                Ok(b)
            }
            Err(e) => Err(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())),
        }
    });
    Body::from_stream(s)
}

/* ------------------------------------------------------------------ helpers */

fn split_file(file: &str) -> (i64, String) {
    let (id, ext) = file.rsplit_once('.').unwrap_or((file, ""));
    (id.parse().unwrap_or(-1), ext.to_lowercase())
}
fn ua(h: &HeaderMap) -> String {
    h.get(header::USER_AGENT).and_then(|v| v.to_str().ok()).unwrap_or("").to_string()
}
fn deny(msg: &str) -> Response {
    (StatusCode::FORBIDDEN, msg.to_string()).into_response()
}

/* ------------------------------------------------------------------ live */

pub async fn live_short(st: S<State>, ci: ConnectInfo<SocketAddr>, p: Path<(String, String, String)>, h: HeaderMap) -> Response {
    live(st, ci, p, h).await
}

pub async fn live(
    S(st): S<State>, ConnectInfo(addr): ConnectInfo<SocketAddr>, Path((u, p, file)): Path<(String, String, String)>,
    headers: HeaderMap,
) -> Response {
    let Some(line) = xtream::auth(&st, &u, &p).filter(|l| l.active()) else { return deny("Invalid or expired account") };
    let (id, ext) = split_file(&file);
    let row: Option<(String, String, Option<i64>)> = st
        .db
        .lock()
        .query_row("SELECT name, source_url, profile_id FROM live_streams WHERE id=?1 AND enabled=1", [id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .optional()
        .ok()
        .flatten();
    let Some((name, src, profile_id)) = row else { return (StatusCode::NOT_FOUND, "Channel not found").into_response() };
    let guard = match acquire(&st, &line, &addr.ip().to_string(), &ua(&headers), "live", id, &name) {
        Ok(g) => g,
        Err(r) => return r,
    };
    let src_is_hls = src.to_lowercase().contains(".m3u8");
    let profile = crate::transcode::load(&st, profile_id);

    // app asked for HLS, the source is HLS and no transcoding is needed: hand the player the source playlist
    if ext == "m3u8" && src_is_hls && profile.is_none() {
        drop(guard);
        return Redirect::temporary(&src).into_response();
    }
    // load balancing: let the least-busy edge server relay it
    if let Some(edge) = crate::balance::choose(&st) {
        let name: String = st.db.lock().query_row("SELECT name FROM servers WHERE id=?1", [edge.id], |r| r.get(0)).unwrap_or_default();
        let cid = guard.detach(edge.id, &name);
        return crate::balance::redirect(&edge, cid, "live", src, profile);
    }
    match crate::transcode::open_live(&st.http, &src, profile.as_ref()).await {
        Ok(s) => Response::builder().header(header::CONTENT_TYPE, "video/mp2t").body(guarded(s, guard)).unwrap(),
        Err(e) => (StatusCode::BAD_GATEWAY, e).into_response(),
    }
}

/* ------------------------------------------------------------------ files (movies / episodes) */

async fn serve_file(st: State, line: xtream::Line, ip: String, kind: &str, id: i64, title: String, path: String, req: Request) -> Response {
    if !std::path::Path::new(&path).exists() {
        return (StatusCode::NOT_FOUND, "File is missing on the server").into_response();
    }
    let guard = match acquire(&st, &line, &ip, &ua(req.headers()), kind, id, &title) {
        Ok(g) => g,
        Err(r) => return r,
    };
    if let Some(edge) = crate::balance::choose(&st) {
        let name: String = st.db.lock().query_row("SELECT name FROM servers WHERE id=?1", [edge.id], |r| r.get(0)).unwrap_or_default();
        let cid = guard.detach(edge.id, &name);
        return crate::balance::redirect(&edge, cid, "file", format!("{kind}:{id}"), None);
    }
    // ServeFile handles Range requests (seeking / resume)
    match tower_http::services::ServeFile::new(&path).oneshot(req).await {
        Ok(resp) => {
            let (mut parts, body) = resp.into_parts();
            let mime = mime_guess::from_path(&path).first_or_octet_stream();
            parts.headers.insert(header::CONTENT_TYPE, mime.as_ref().parse().unwrap());
            let stream = Body::new(body).into_data_stream();
            Response::from_parts(parts, guarded(stream, guard))
        }
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Could not read file").into_response(),
    }
}

pub async fn movie(
    S(st): S<State>, ConnectInfo(addr): ConnectInfo<SocketAddr>, Path((u, p, file)): Path<(String, String, String)>, req: Request,
) -> Response {
    let Some(line) = xtream::auth(&st, &u, &p).filter(|l| l.active()) else { return deny("Invalid or expired account") };
    let (id, _) = split_file(&file);
    let row: Option<(String, String)> = st
        .db
        .lock()
        .query_row("SELECT title, path FROM movies WHERE id=?1 AND enabled=1", [id], |r| Ok((r.get(0)?, r.get(1)?)))
        .optional()
        .ok()
        .flatten();
    match row {
        Some((title, path)) => serve_file(st.clone(), line, addr.ip().to_string(), "movie", id, title, path, req).await,
        None => (StatusCode::NOT_FOUND, "Movie not found").into_response(),
    }
}

pub async fn episode(
    S(st): S<State>, ConnectInfo(addr): ConnectInfo<SocketAddr>, Path((u, p, file)): Path<(String, String, String)>, req: Request,
) -> Response {
    let Some(line) = xtream::auth(&st, &u, &p).filter(|l| l.active()) else { return deny("Invalid or expired account") };
    let (id, _) = split_file(&file);
    let row: Option<(String, String)> = st
        .db
        .lock()
        .query_row(
            "SELECT s.title || ' S' || e.season || 'E' || e.episode, e.path FROM episodes e JOIN series s ON s.id=e.series_id WHERE e.id=?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .ok()
        .flatten();
    match row {
        Some((title, path)) => serve_file(st.clone(), line, addr.ip().to_string(), "episode", id, title, path, req).await,
        None => (StatusCode::NOT_FOUND, "Episode not found").into_response(),
    }
}

/// Local artwork found next to media files (poster.jpg etc.), served to apps.
pub async fn image(S(st): S<State>, Path((kind, id)): Path<(String, String)>, req: Request) -> Response {
    let id: i64 = id.split('.').next().unwrap_or("").parse().unwrap_or(-1);
    let (table, col) = match kind.as_str() {
        "movie" => ("movies", "poster"),
        "movie-bg" => ("movies", "backdrop"),
        "series" => ("series", "poster"),
        "series-bg" => ("series", "backdrop"),
        "episode" => ("episodes", "still"),
        _ => return StatusCode::NOT_FOUND.into_response(),
    };
    let path: Option<String> = st
        .db
        .lock()
        .query_row(&format!("SELECT {col} FROM {table} WHERE id=?1"), [id], |r| r.get(0))
        .optional()
        .ok()
        .flatten();
    let Some(path) = path.filter(|p| p.starts_with("file:")) else { return StatusCode::NOT_FOUND.into_response() };
    match tower_http::services::ServeFile::new(&path[5..]).oneshot(req).await {
        Ok(r) => r.map(Body::new).into_response(),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}
