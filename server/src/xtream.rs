//! Xtream Codes compatible API: player_api.php, get.php (M3U) and xmltv.php.
use crate::{db, State};
use axum::{
    extract::{Query, State as S},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use base64::Engine;
use rusqlite::{params, OptionalExtension, Row};
use serde_json::{json, Value};
use std::collections::HashMap;

#[derive(Clone)]
pub struct Line {
    pub id: i64,
    pub username: String,
    pub password: String,
    pub exp_date: Option<i64>,
    pub max_connections: i64,
    pub enabled: bool,
    pub is_trial: bool,
    pub created_at: i64,
}
impl Line {
    pub fn expired(&self) -> bool {
        self.exp_date.map(|e| e < db::now()).unwrap_or(false)
    }
    pub fn active(&self) -> bool {
        self.enabled && !self.expired()
    }
    pub fn status(&self) -> &'static str {
        if !self.enabled { "Disabled" } else if self.expired() { "Expired" } else { "Active" }
    }
}

pub fn auth(st: &State, u: &str, p: &str) -> Option<Line> {
    st.db
        .lock()
        .query_row(
            "SELECT id,username,password,exp_date,max_connections,enabled,is_trial,created_at FROM lines WHERE username=?1 AND password=?2",
            params![u, p],
            |r| {
                Ok(Line {
                    id: r.get(0)?, username: r.get(1)?, password: r.get(2)?, exp_date: r.get(3)?, max_connections: r.get(4)?,
                    enabled: r.get::<_, i64>(5)? == 1, is_trial: r.get::<_, i64>(6)? == 1, created_at: r.get(7)?,
                })
            },
        )
        .optional()
        .ok()
        .flatten()
}

/// Base URL as the client sees it (from the Host header), e.g. http://192.168.1.10:8080
pub fn base_url(h: &HeaderMap) -> String {
    let host = h.get(header::HOST).and_then(|v| v.to_str().ok()).unwrap_or("localhost");
    let proto = h.get("x-forwarded-proto").and_then(|v| v.to_str().ok()).unwrap_or("http");
    format!("{proto}://{host}")
}
/// Artwork: absolute URLs stay; local files are served through /img/...
fn art(base: &str, kind: &str, id: i64, v: &str) -> String {
    if v.starts_with("file:") { format!("{base}/img/{kind}/{id}.jpg") } else { v.to_string() }
}
fn s(v: impl ToString) -> Value {
    Value::String(v.to_string())
}

fn user_info(st: &State, line: &Line, h: &HeaderMap) -> Value {
    let base = base_url(h);
    let host = h.get(header::HOST).and_then(|v| v.to_str().ok()).unwrap_or("localhost");
    let (hostname, port) = host.rsplit_once(':').unwrap_or((host, "80"));
    let now = chrono::Local::now();
    json!({
        "user_info": {
            "username": line.username, "password": line.password, "message": db::setting(&st.db.lock(), "welcome", ""),
            "auth": 1, "status": line.status(),
            "exp_date": line.exp_date.map(|e| s(e)).unwrap_or(Value::Null),
            "is_trial": if line.is_trial { "1" } else { "0" },
            "active_cons": s(st.conns.count_for(line.id)),
            "created_at": s(line.created_at), "max_connections": s(line.max_connections),
            "allowed_output_formats": ["m3u8", "ts"]
        },
        "server_info": {
            "url": hostname, "port": port, "https_port": "", "server_protocol": if base.starts_with("https") { "https" } else { "http" },
            "rtmp_port": "", "timezone": "UTC", "timestamp_now": now.timestamp(),
            "time_now": now.format("%Y-%m-%d %H:%M:%S").to_string(), "process": true
        }
    })
}

fn categories(st: &State, kind: &str) -> Value {
    let c = st.db.lock();
    let mut q = c.prepare("SELECT id,name FROM categories WHERE kind=?1 ORDER BY sort, name").unwrap();
    let rows: Vec<Value> = q
        .query_map([kind], |r| Ok(json!({"category_id": s(r.get::<_, i64>(0)?), "category_name": r.get::<_, String>(1)?, "parent_id": 0})))
        .unwrap()
        .filter_map(Result::ok)
        .collect();
    Value::Array(rows)
}

fn cat_filter(q: &HashMap<String, String>) -> Option<i64> {
    q.get("category_id").and_then(|v| v.parse().ok())
}

fn live_streams(st: &State, cat: Option<i64>) -> Value {
    let c = st.db.lock();
    let mut q = c
        .prepare("SELECT id,name,logo,epg_channel_id,added,category_id,archive,archive_days FROM live_streams WHERE enabled=1 AND (?1 IS NULL OR category_id=?1) ORDER BY sort, name")
        .unwrap();
    let mut n = 0;
    let rows: Vec<Value> = q
        .query_map([cat], |r| {
            Ok(json!({
                "num": 0, "name": r.get::<_, String>(1)?, "stream_type": "live", "stream_id": r.get::<_, i64>(0)?,
                "stream_icon": r.get::<_, String>(2)?, "epg_channel_id": r.get::<_, String>(3)?, "added": s(r.get::<_, i64>(4)?),
                "category_id": s(r.get::<_, Option<i64>>(5)?.unwrap_or(0)), "custom_sid": "", "tv_archive": r.get::<_, i64>(6)?,
                "direct_source": "", "tv_archive_duration": if r.get::<_, i64>(6)? == 1 { r.get::<_, i64>(7)? } else { 0 }
            }))
        })
        .unwrap()
        .filter_map(Result::ok)
        .map(|mut v| {
            n += 1;
            v["num"] = json!(n);
            v
        })
        .collect();
    Value::Array(rows)
}

fn vod_streams(st: &State, cat: Option<i64>, base: &str) -> Value {
    let c = st.db.lock();
    let mut q = c
        .prepare("SELECT id,title,poster,rating,added,category_id,ext,year FROM movies WHERE enabled=1 AND (?1 IS NULL OR category_id=?1) ORDER BY added DESC")
        .unwrap();
    let mut n = 0;
    let rows: Vec<Value> = q
        .query_map([cat], |r| {
            let id: i64 = r.get(0)?;
            let rating: f64 = r.get(3)?;
            Ok(json!({
                "num": 0, "name": r.get::<_, String>(1)?, "stream_type": "movie", "stream_id": id,
                "stream_icon": art(base, "movie", id, &r.get::<_, String>(2)?), "rating": format!("{rating:.1}"),
                "rating_5based": (rating / 2.0 * 10.0).round() / 10.0, "added": s(r.get::<_, i64>(4)?),
                "category_id": s(r.get::<_, Option<i64>>(5)?.unwrap_or(0)), "container_extension": r.get::<_, String>(6)?,
                "year": r.get::<_, Option<i64>>(7)?, "custom_sid": "", "direct_source": ""
            }))
        })
        .unwrap()
        .filter_map(Result::ok)
        .map(|mut v| {
            n += 1;
            v["num"] = json!(n);
            v
        })
        .collect();
    Value::Array(rows)
}

fn series_row(r: &Row, base: &str) -> rusqlite::Result<Value> {
    let id: i64 = r.get(0)?;
    let rating: f64 = r.get(5)?;
    let bd: String = r.get(4)?;
    Ok(json!({
        "num": 0, "name": r.get::<_, String>(1)?, "series_id": id, "cover": art(base, "series", id, &r.get::<_, String>(2)?),
        "plot": r.get::<_, String>(3)?, "cast": r.get::<_, String>(9)?, "director": "", "genre": r.get::<_, String>(6)?,
        "releaseDate": r.get::<_, Option<i64>>(7)?.map(|y| y.to_string()).unwrap_or_default(),
        "last_modified": s(r.get::<_, i64>(8)?), "rating": format!("{rating:.1}"), "rating_5based": (rating / 2.0 * 10.0).round() / 10.0,
        "backdrop_path": if bd.is_empty() { json!([]) } else { json!([art(base, "series-bg", id, &bd)]) },
        "youtube_trailer": r.get::<_, String>(10)?, "episode_run_time": "", "category_id": s(r.get::<_, Option<i64>>(11)?.unwrap_or(0))
    }))
}
const SERIES_COLS: &str = "id,title,poster,plot,backdrop,rating,genre,year,updated,cast_list,trailer,category_id";

fn series_list(st: &State, cat: Option<i64>, base: &str) -> Value {
    let c = st.db.lock();
    let mut q = c
        .prepare(&format!("SELECT {SERIES_COLS} FROM series WHERE enabled=1 AND (?1 IS NULL OR category_id=?1) ORDER BY updated DESC"))
        .unwrap();
    let mut n = 0;
    let rows: Vec<Value> = q
        .query_map([cat], |r| series_row(r, base))
        .unwrap()
        .filter_map(Result::ok)
        .map(|mut v| {
            n += 1;
            v["num"] = json!(n);
            v
        })
        .collect();
    Value::Array(rows)
}

fn vod_info(st: &State, id: i64, base: &str) -> Value {
    let c = st.db.lock();
    c.query_row(
        "SELECT id,title,poster,backdrop,plot,genre,cast_list,director,year,duration_secs,rating,trailer,tmdb_id,added,category_id,ext FROM movies WHERE id=?1",
        [id],
        |r| {
            let dur: i64 = r.get(9)?;
            let bd: String = r.get(3)?;
            let rating: f64 = r.get(10)?;
            let year: Option<i64> = r.get(8)?;
            Ok(json!({
                "info": {
                    "movie_image": art(base, "movie", id, &r.get::<_, String>(2)?), "tmdb_id": r.get::<_, Option<i64>>(12)?,
                    "name": r.get::<_, String>(1)?, "o_name": r.get::<_, String>(1)?, "plot": r.get::<_, String>(4)?,
                    "description": r.get::<_, String>(4)?, "genre": r.get::<_, String>(5)?, "cast": r.get::<_, String>(6)?,
                    "director": r.get::<_, String>(7)?, "releasedate": year.map(|y| y.to_string()).unwrap_or_default(),
                    "duration_secs": dur, "duration": format!("{:02}:{:02}:{:02}", dur / 3600, dur % 3600 / 60, dur % 60),
                    "rating": format!("{rating:.1}"), "youtube_trailer": r.get::<_, String>(11)?,
                    "backdrop_path": if bd.is_empty() { json!([]) } else { json!([art(base, "movie-bg", id, &bd)]) }
                },
                "movie_data": {
                    "stream_id": id, "name": r.get::<_, String>(1)?, "added": s(r.get::<_, i64>(13)?),
                    "category_id": s(r.get::<_, Option<i64>>(14)?.unwrap_or(0)), "container_extension": r.get::<_, String>(15)?,
                    "custom_sid": "", "direct_source": ""
                }
            }))
        },
    )
    .unwrap_or_else(|_| json!({"info": [], "movie_data": []}))
}

fn series_info(st: &State, id: i64, base: &str) -> Value {
    let c = st.db.lock();
    let Ok(info) = c.query_row(&format!("SELECT {SERIES_COLS} FROM series WHERE id=?1"), [id], |r| series_row(r, base)) else {
        return json!({"seasons": [], "info": [], "episodes": []});
    };
    let mut q = c
        .prepare("SELECT id,season,episode,title,ext,plot,still,duration_secs,added FROM episodes WHERE series_id=?1 ORDER BY season, episode")
        .unwrap();
    let mut episodes: serde_json::Map<String, Value> = serde_json::Map::new();
    let rows = q
        .query_map([id], |r| {
            let eid: i64 = r.get(0)?;
            let season: i64 = r.get(1)?;
            let ep: i64 = r.get(2)?;
            let title: String = r.get(3)?;
            let still: String = r.get(6)?;
            Ok((season, json!({
                "id": s(eid), "episode_num": ep, "season": season,
                "title": if title.is_empty() { format!("Episode {ep}") } else { title },
                "container_extension": r.get::<_, String>(4)?, "added": s(r.get::<_, i64>(8)?),
                "info": { "plot": r.get::<_, String>(5)?, "duration_secs": r.get::<_, i64>(7)?,
                          "movie_image": if still.is_empty() { String::new() } else { art(base, "episode", eid, &still) } }
            })))
        })
        .unwrap();
    for row in rows.flatten() {
        episodes.entry(row.0.to_string()).or_insert_with(|| json!([])).as_array_mut().unwrap().push(row.1);
    }
    let seasons: Vec<Value> = episodes
        .iter()
        .map(|(k, v)| json!({"season_number": k.parse::<i64>().unwrap_or(0), "name": format!("Season {k}"), "episode_count": v.as_array().map(|a| a.len()).unwrap_or(0), "cover": info["cover"]}))
        .collect();
    json!({"seasons": seasons, "info": info, "episodes": episodes})
}

fn short_epg(st: &State, stream_id: i64, limit: i64, all: bool) -> Value {
    let c = st.db.lock();
    let epg_id: String = c
        .query_row("SELECT epg_channel_id FROM live_streams WHERE id=?1", [stream_id], |r| r.get(0))
        .unwrap_or_default();
    if epg_id.is_empty() {
        return json!({"epg_listings": []});
    }
    let now = db::now();
    let since = if all { now - 86400 * 7 } else { now };
    // past programmes can be replayed when they are inside the recorded period
    let recorded_from = crate::archive::oldest(st, stream_id).unwrap_or(i64::MAX);
    let mut q = c
        .prepare("SELECT start,stop,title,descr FROM epg_programs WHERE channel_id=?1 AND stop>?2 ORDER BY start LIMIT ?3")
        .unwrap();
    let b64 = |t: &str| base64::engine::general_purpose::STANDARD.encode(t);
    let list: Vec<Value> = q
        .query_map(params![epg_id, since, limit], |r| {
            let (start, stop): (i64, i64) = (r.get(0)?, r.get(1)?);
            let fmt = |t: i64| chrono::DateTime::from_timestamp(t, 0).map(|d| d.format("%Y-%m-%d %H:%M:%S").to_string()).unwrap_or_default();
            Ok(json!({
                "id": s(start), "epg_id": "1", "title": b64(&r.get::<_, String>(2)?), "lang": "",
                "start": fmt(start), "end": fmt(stop), "description": b64(&r.get::<_, String>(3)?),
                "channel_id": epg_id, "start_timestamp": s(start), "stop_timestamp": s(stop),
                "now_playing": if start <= now && stop > now { 1 } else { 0 },
                "has_archive": if stop <= now && start >= recorded_from { 1 } else { 0 }
            }))
        })
        .unwrap()
        .filter_map(Result::ok)
        .collect();
    json!({"epg_listings": list})
}

/// GET/POST /player_api.php?username=..&password=..&action=..
pub async fn player_api(S(st): S<State>, h: HeaderMap, Query(q): Query<HashMap<String, String>>) -> Response {
    let (u, p) = (q.get("username").cloned().unwrap_or_default(), q.get("password").cloned().unwrap_or_default());
    let Some(line) = auth(&st, &u, &p) else {
        return Json(json!({"user_info": {"auth": 0}})).into_response();
    };
    let action = q.get("action").map(String::as_str).unwrap_or("");
    if action.is_empty() {
        return Json(user_info(&st, &line, &h)).into_response();
    }
    if !line.active() {
        return Json(json!([])).into_response();
    }
    let base = base_url(&h);
    let id = |k: &str| q.get(k).and_then(|v| v.parse::<i64>().ok()).unwrap_or(-1);
    let out = match action {
        "get_live_categories" => categories(&st, "live"),
        "get_vod_categories" => categories(&st, "movie"),
        "get_series_categories" => categories(&st, "series"),
        "get_live_streams" => live_streams(&st, cat_filter(&q)),
        "get_vod_streams" => vod_streams(&st, cat_filter(&q), &base),
        "get_series" => series_list(&st, cat_filter(&q), &base),
        "get_vod_info" => vod_info(&st, id("vod_id"), &base),
        "get_series_info" => series_info(&st, if id("series_id") >= 0 { id("series_id") } else { id("series") }, &base),
        "get_short_epg" => short_epg(&st, id("stream_id"), q.get("limit").and_then(|v| v.parse().ok()).unwrap_or(4), false),
        "get_simple_data_table" => short_epg(&st, id("stream_id"), 200, true),
        _ => json!([]),
    };
    Json(out).into_response()
}

/// GET /get.php?username=..&password=..&type=m3u_plus&output=ts|m3u8 -> M3U playlist
pub async fn m3u(S(st): S<State>, h: HeaderMap, Query(q): Query<HashMap<String, String>>) -> Response {
    let (u, p) = (q.get("username").cloned().unwrap_or_default(), q.get("password").cloned().unwrap_or_default());
    let Some(line) = auth(&st, &u, &p).filter(|l| l.active()) else { return (StatusCode::FORBIDDEN, "Invalid account").into_response() };
    let out = q.get("output").map(String::as_str).unwrap_or("ts");
    let out = if out == "hls" { "m3u8" } else { out };
    let base = base_url(&h);
    let (uu, pp) = (urlencoding::encode(&line.username).into_owned(), urlencoding::encode(&line.password).into_owned());
    let c = st.db.lock();
    let cats: HashMap<i64, String> = c
        .prepare("SELECT id,name FROM categories")
        .unwrap()
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap()
        .flatten()
        .collect();
    let cat = |id: Option<i64>| id.and_then(|i| cats.get(&i).cloned()).unwrap_or_default();
    let esc = |t: &str| t.replace('"', "'").replace(['\n', '\r'], " ");
    let mut m = format!("#EXTM3U url-tvg=\"{base}/xmltv.php?username={uu}&password={pp}\"\n");
    let mut q1 = c.prepare("SELECT id,name,logo,epg_channel_id,category_id FROM live_streams WHERE enabled=1 ORDER BY sort,name").unwrap();
    for r in q1
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, Option<i64>>(4)?)))
        .unwrap()
        .flatten()
    {
        m += &format!(
            "#EXTINF:-1 tvg-id=\"{}\" tvg-name=\"{}\" tvg-logo=\"{}\" group-title=\"{}\",{}\n{base}/live/{uu}/{pp}/{}.{out}\n",
            esc(&r.3), esc(&r.1), esc(&r.2), esc(&cat(r.4)), r.1, r.0
        );
    }
    let mut q2 = c.prepare("SELECT id,title,poster,category_id,ext FROM movies WHERE enabled=1 ORDER BY title").unwrap();
    for r in q2
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, Option<i64>>(3)?, r.get::<_, String>(4)?)))
        .unwrap()
        .flatten()
    {
        m += &format!(
            "#EXTINF:-1 tvg-name=\"{}\" tvg-logo=\"{}\" group-title=\"{}\",{}\n{base}/movie/{uu}/{pp}/{}.{}\n",
            esc(&r.1), art(&base, "movie", r.0, &r.2), esc(&cat(r.3)), r.1, r.0, r.4
        );
    }
    let mut q3 = c
        .prepare("SELECT e.id,s.title,e.season,e.episode,s.poster,s.category_id,e.ext,s.id FROM episodes e JOIN series s ON s.id=e.series_id WHERE s.enabled=1 ORDER BY s.title,e.season,e.episode")
        .unwrap();
    for r in q3
        .query_map([], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?, r.get::<_, i64>(3)?, r.get::<_, String>(4)?, r.get::<_, Option<i64>>(5)?, r.get::<_, String>(6)?, r.get::<_, i64>(7)?))
        })
        .unwrap()
        .flatten()
    {
        let name = format!("{} S{:02}E{:02}", r.1, r.2, r.3);
        m += &format!(
            "#EXTINF:-1 tvg-name=\"{}\" tvg-logo=\"{}\" group-title=\"{}\",{}\n{base}/series/{uu}/{pp}/{}.{}\n",
            esc(&name), art(&base, "series", r.7, &r.4), esc(&cat(r.5)), name, r.0, r.6
        );
    }
    (
        [(header::CONTENT_TYPE, "audio/x-mpegurl"), (header::CONTENT_DISPOSITION, "attachment; filename=\"playlist.m3u\"")],
        m,
    )
        .into_response()
}

/// GET /xmltv.php -> XMLTV guide for all channels
pub async fn xmltv(S(st): S<State>, Query(q): Query<HashMap<String, String>>) -> Response {
    let (u, p) = (q.get("username").cloned().unwrap_or_default(), q.get("password").cloned().unwrap_or_default());
    if auth(&st, &u, &p).filter(|l| l.active()).is_none() {
        return (StatusCode::FORBIDDEN, "Invalid account").into_response();
    }
    let x = |t: &str| t.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;");
    let c = st.db.lock();
    let mut out = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<tv generator-info-name=\"Mdluex IPTV Server\">\n");
    let mut q1 = c.prepare("SELECT DISTINCT epg_channel_id,name,logo FROM live_streams WHERE epg_channel_id<>'' AND enabled=1").unwrap();
    for r in q1.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?))).unwrap().flatten() {
        out += &format!("<channel id=\"{}\"><display-name>{}</display-name><icon src=\"{}\"/></channel>\n", x(&r.0), x(&r.1), x(&r.2));
    }
    let fmt = |t: i64| chrono::DateTime::from_timestamp(t, 0).map(|d| d.format("%Y%m%d%H%M%S +0000").to_string()).unwrap_or_default();
    let mut q2 = c
        .prepare("SELECT p.channel_id,p.start,p.stop,p.title,p.descr FROM epg_programs p WHERE p.stop>?1 AND p.channel_id IN (SELECT epg_channel_id FROM live_streams WHERE enabled=1) ORDER BY p.channel_id,p.start")
        .unwrap();
    for r in q2
        .query_map([db::now() - 86400], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?)))
        .unwrap()
        .flatten()
    {
        out += &format!(
            "<programme start=\"{}\" stop=\"{}\" channel=\"{}\"><title>{}</title><desc>{}</desc></programme>\n",
            fmt(r.1), fmt(r.2), x(&r.0), x(&r.3), x(&r.4)
        );
    }
    out += "</tv>\n";
    ([(header::CONTENT_TYPE, "application/xml; charset=utf-8")], out).into_response()
}
