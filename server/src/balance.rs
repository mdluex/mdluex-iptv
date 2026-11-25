//! Load balancing: extra "edge" servers relay streams; the main server sends each viewer to the
//! least-busy online edge with a short-lived signed link. Edges report their viewers every 10 s so
//! connection limits and "Disconnect" keep working everywhere.
use crate::{db, transcode, State};
use axum::{
    body::Body,
    extract::{Path, Query, Request, State as S},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use futures_util::StreamExt;
use hmac::{Hmac, Mac};
use parking_lot::Mutex;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::Sha256;
use std::{
    collections::HashMap,
    sync::{atomic::{AtomicBool, Ordering}, Arc},
};
use tower::ServiceExt;

/* ------------------------------------------------------------------ signed links */

#[derive(Serialize, Deserialize, Clone)]
pub struct Token {
    pub cid: u64,        // connection id on the main server
    pub sid: i64,        // edge server id
    pub k: String,       // "live" or "file"
    pub src: String,     // live: source URL; file: "movie:ID" / "episode:ID"
    pub prof: Option<transcode::Profile>,
    pub exp: i64,        // link must be opened before this time
}

fn mac(secret: &str, data: &[u8]) -> Vec<u8> {
    let mut m = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
    m.update(data);
    m.finalize().into_bytes().to_vec()
}
pub fn sign(t: &Token, secret: &str) -> String {
    let body = serde_json::to_vec(t).unwrap();
    format!("{}.{}", B64.encode(&body), B64.encode(mac(secret, &body)))
}
pub fn verify(t: &str, secret: &str) -> Option<Token> {
    let (b, s) = t.split_once('.')?;
    let body = B64.decode(b).ok()?;
    let sig = B64.decode(s).ok()?;
    let mut m = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).ok()?;
    m.update(&body);
    m.verify_slice(&sig).ok()?;
    serde_json::from_slice(&body).ok()
}

/* ------------------------------------------------------------------ main side */

pub struct Edge {
    pub id: i64,
    pub url: String,
    pub secret: String,
}

/// Least-busy online edge server, if any (edges report every 10 s; offline after 30 s).
pub fn choose(st: &State) -> Option<Edge> {
    let c = st.db.lock();
    c.query_row(
        "SELECT id,url,secret FROM servers WHERE enabled=1 AND last_seen>?1 AND active<max_clients
         ORDER BY CAST(active AS REAL)/max_clients, active LIMIT 1",
        [db::now() - 30],
        |r| Ok(Edge { id: r.get(0)?, url: r.get::<_, String>(1)?.trim_end_matches('/').to_string(), secret: r.get(2)? }),
    )
    .optional()
    .ok()
    .flatten()
}

/// Build the redirect to an edge for a connection that main has already accepted.
pub fn redirect(edge: &Edge, cid: u64, kind: &str, src: String, prof: Option<transcode::Profile>) -> Response {
    let t = Token { cid, sid: edge.id, k: kind.into(), src, prof, exp: db::now() + 60 };
    // one more viewer on that edge until its next report
    axum::response::Redirect::temporary(&format!("{}/edge/stream?t={}", edge.url, sign(&t, &edge.secret))).into_response()
}

/// POST /api/edge/heartbeat  {secret, conns:[ids], version}  ->  {kick:[ids]}
pub async fn heartbeat(S(st): S<State>, Json(b): Json<Value>) -> Response {
    let secret = b["secret"].as_str().unwrap_or("");
    let id: Option<i64> = st.db.lock().query_row("SELECT id FROM servers WHERE secret=?1", [secret], |r| r.get(0)).optional().ok().flatten();
    let Some(id) = id else { return (StatusCode::UNAUTHORIZED, "unknown server").into_response() };
    let conns: Vec<u64> = b["conns"].as_array().map(|a| a.iter().filter_map(|v| v.as_u64()).collect()).unwrap_or_default();
    let kick = st.conns.touch_remote(&conns);
    let _ = st.db.lock().execute(
        "UPDATE servers SET last_seen=?2, active=?3, version=?4 WHERE id=?1",
        rusqlite::params![id, db::now(), conns.len() as i64, b["version"].as_str().unwrap_or("")],
    );
    Json(json!({"kick": kick})).into_response()
}

/// GET /internal/file?t=...  - edges fetch movie/episode files from main with a valid signed link.
pub async fn internal_file(S(st): S<State>, Query(q): Query<HashMap<String, String>>, req: Request) -> Response {
    let raw = q.get("t").cloned().unwrap_or_default();
    // find which edge signed it: try every server secret
    let secrets: Vec<String> = {
        let c = st.db.lock();
        let mut s = c.prepare("SELECT secret FROM servers WHERE enabled=1").unwrap();
        s.query_map([], |r| r.get(0)).unwrap().flatten().collect()
    };
    let Some(t) = secrets.iter().find_map(|s| verify(&raw, s)) else { return StatusCode::FORBIDDEN.into_response() };
    // file links stay valid for the whole connection (seeking makes new requests)
    if !st.conns.exists(t.cid) {
        return (StatusCode::FORBIDDEN, "connection ended").into_response();
    }
    let (kind, id) = t.src.split_once(':').unwrap_or(("", "0"));
    let id: i64 = id.parse().unwrap_or(-1);
    let sql = if kind == "movie" { "SELECT path FROM movies WHERE id=?1" } else { "SELECT path FROM episodes WHERE id=?1" };
    let path: Option<String> = st.db.lock().query_row(sql, [id], |r| r.get(0)).optional().ok().flatten();
    let Some(path) = path else { return StatusCode::NOT_FOUND.into_response() };
    match tower_http::services::ServeFile::new(&path).oneshot(req).await {
        Ok(r) => r.map(Body::new).into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

/* admin API for servers */
fn rows(st: &State) -> Vec<Value> {
    let c = st.db.lock();
    let mut q = c.prepare("SELECT id,name,url,secret,enabled,max_clients,last_seen,active,version FROM servers ORDER BY id").unwrap();
    let now = db::now();
    q.query_map([], |r| {
        let last: Option<i64> = r.get(6)?;
        Ok(json!({
            "id": r.get::<_, i64>(0)?, "name": r.get::<_, String>(1)?, "url": r.get::<_, String>(2)?, "secret": r.get::<_, String>(3)?,
            "enabled": r.get::<_, i64>(4)?, "max_clients": r.get::<_, i64>(5)?, "last_seen": last, "active": r.get::<_, i64>(7)?,
            "version": r.get::<_, String>(8)?, "online": last.map(|l| now - l < 30).unwrap_or(false)
        }))
    })
    .unwrap()
    .flatten()
    .collect()
}
pub async fn servers_list(S(st): S<State>, _a: crate::admin::Admin) -> Json<Value> {
    Json(Value::Array(rows(&st)))
}
pub async fn servers_add(S(st): S<State>, _a: crate::admin::Admin, Json(b): Json<Value>) -> Response {
    let url = b["url"].as_str().unwrap_or("").trim().trim_end_matches('/').to_string();
    if !url.starts_with("http") {
        return (StatusCode::BAD_REQUEST, "Enter the public address of the server, e.g. http://203.0.113.5:8080").into_response();
    }
    let secret: String = {
        use rand::Rng;
        let mut r = rand::thread_rng();
        (0..32).map(|_| format!("{:x}", r.gen_range(0..16))).collect()
    };
    let c = st.db.lock();
    let _ = c.execute(
        "INSERT INTO servers(name,url,secret,max_clients) VALUES(?1,?2,?3,?4)",
        rusqlite::params![b["name"].as_str().unwrap_or("Edge server"), url, secret, b["max_clients"].as_i64().unwrap_or(500)],
    );
    Json(json!({"id": c.last_insert_rowid(), "secret": secret})).into_response()
}
pub async fn servers_edit(S(st): S<State>, _a: crate::admin::Admin, Path(id): Path<i64>, Json(b): Json<Value>) -> Response {
    let c = st.db.lock();
    for (k, v) in [("name", &b["name"]), ("url", &b["url"])] {
        if let Some(s) = v.as_str() {
            let _ = c.execute(&format!("UPDATE servers SET {k}=?2 WHERE id=?1"), rusqlite::params![id, s.trim().trim_end_matches('/')]);
        }
    }
    for k in ["enabled", "max_clients"] {
        if let Some(n) = b[k].as_i64() {
            let _ = c.execute(&format!("UPDATE servers SET {k}=?2 WHERE id=?1"), rusqlite::params![id, n]);
        }
    }
    Json(json!({"ok": true})).into_response()
}
pub async fn servers_del(S(st): S<State>, _a: crate::admin::Admin, Path(id): Path<i64>) -> Response {
    let _ = st.db.lock().execute("DELETE FROM servers WHERE id=?1", [id]);
    Json(json!({"ok": true})).into_response()
}

/* ------------------------------------------------------------------ edge side */

pub struct EdgeState {
    main: String,
    secret: String,
    http: reqwest::Client,
    conns: Mutex<HashMap<u64, (Arc<AtomicBool>, u32)>>, // connection id -> (kill flag, open streams)
}
type ES = Arc<EdgeState>;

struct EdgeGuard {
    st: ES,
    cid: u64,
    kill: Arc<AtomicBool>,
}
impl Drop for EdgeGuard {
    fn drop(&mut self) {
        // range requests for the same viewer share the id; forget it when its last stream ends
        let mut m = self.st.conns.lock();
        let gone = match m.get_mut(&self.cid) {
            Some(e) => { e.1 = e.1.saturating_sub(1); e.1 == 0 }
            None => false,
        };
        if gone { m.remove(&self.cid); }
    }
}

async fn edge_stream(S(es): S<ES>, Query(q): Query<HashMap<String, String>>, headers: HeaderMap) -> Response {
    let raw = q.get("t").cloned().unwrap_or_default();
    let Some(t) = verify(&raw, &es.secret) else { return (StatusCode::FORBIDDEN, "Invalid link").into_response() };
    if t.k == "live" && t.exp < db::now() {
        return (StatusCode::FORBIDDEN, "Link expired").into_response();
    }
    let kill = {
        let mut m = es.conns.lock();
        let e = m.entry(t.cid).or_insert_with(|| (Arc::new(AtomicBool::new(false)), 0));
        e.1 += 1;
        e.0.clone()
    };
    let guard = EdgeGuard { st: es.clone(), cid: t.cid, kill: kill.clone() };
    let (status, mut out_headers, stream): (StatusCode, HeaderMap, transcode::ByteStream) = if t.k == "live" {
        match transcode::open_live(&es.http, &t.src, t.prof.as_ref()).await {
            Ok(s) => {
                let mut h = HeaderMap::new();
                h.insert(header::CONTENT_TYPE, "video/mp2t".parse().unwrap());
                (StatusCode::OK, h, s)
            }
            Err(e) => return (StatusCode::BAD_GATEWAY, e).into_response(),
        }
    } else {
        // movie / episode: fetch from the main server (passing seeking requests through)
        let mut req = es.http.get(format!("{}/internal/file?t={}", es.main, urlencoding::encode(&raw)));
        if let Some(r) = headers.get(header::RANGE) {
            req = req.header(header::RANGE, r.clone());
        }
        match req.send().await {
            Ok(resp) => {
                let status = StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
                let mut h = HeaderMap::new();
                for k in [header::CONTENT_TYPE, header::CONTENT_LENGTH, header::CONTENT_RANGE, header::ACCEPT_RANGES] {
                    if let Some(v) = resp.headers().get(k.as_str()) {
                        if let Ok(v) = header::HeaderValue::from_bytes(v.as_bytes()) {
                            h.insert(k, v);
                        }
                    }
                }
                let s = resp.bytes_stream().map(|r| r.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string())));
                (status, h, Box::pin(s))
            }
            Err(e) => return (StatusCode::BAD_GATEWAY, format!("Main server unreachable: {e}")).into_response(),
        }
    };
    let body = stream.map(move |c| {
        let _g = &guard;
        if kill.load(Ordering::Relaxed) {
            return Err(std::io::Error::new(std::io::ErrorKind::Other, "disconnected by admin"));
        }
        c
    });
    out_headers.insert("access-control-allow-origin", "*".parse().unwrap());
    let mut resp = Response::new(Body::from_stream(body));
    *resp.status_mut() = status;
    *resp.headers_mut() = out_headers;
    resp
}

/// Run this program as an edge server (relay only, no database or admin panel).
pub async fn run_edge(main_url: String, secret: String, port: u16) {
    let es: ES = Arc::new(EdgeState {
        main: main_url.trim_end_matches('/').to_string(),
        secret,
        http: reqwest::Client::builder().user_agent("Mdluex-IPTV-Edge/1.1").build().unwrap(),
        conns: Mutex::new(HashMap::new()),
    });
    let hb = es.clone();
    tokio::spawn(async move {
        loop {
            let ids: Vec<u64> = hb.conns.lock().keys().cloned().collect();
            let body = json!({"secret": hb.secret, "conns": ids, "version": env!("CARGO_PKG_VERSION")});
            match hb.http.post(format!("{}/api/edge/heartbeat", hb.main)).json(&body).send().await {
                Ok(r) if r.status().is_success() => {
                    if let Ok(v) = r.json::<Value>().await {
                        let m = hb.conns.lock();
                        for id in v["kick"].as_array().cloned().unwrap_or_default().iter().filter_map(|x| x.as_u64()) {
                            if let Some(k) = m.get(&id) {
                                k.0.store(true, Ordering::Relaxed);
                            }
                        }
                    }
                }
                Ok(r) => eprintln!("Main server refused this edge ({}): check --secret", r.status()),
                Err(e) => eprintln!("Cannot reach the main server: {e}"),
            }
            tokio::time::sleep(std::time::Duration::from_secs(10)).await;
        }
    });
    let app = Router::new()
        .route("/edge/stream", get(edge_stream))
        .route("/", get(|| async { "Mdluex IPTV edge server" }))
        .with_state(es);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await.unwrap_or_else(|e| {
        eprintln!("Port {port} is busy ({e}).");
        std::process::exit(1);
    });
    println!("Mdluex IPTV edge server on port {port}, reporting to {main_url}");
    axum::serve(listener, app).await.unwrap();
}
