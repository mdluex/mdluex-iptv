//! Catch-up / timeshift: record selected live channels in 5-minute pieces and play back any past period.
use crate::{db, stream, xtream, State};
use axum::{
    body::Body,
    extract::{ConnectInfo, Path, Query, State as S},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use chrono::TimeZone;
use futures_util::StreamExt;
use std::{collections::HashMap, net::SocketAddr, path::PathBuf};

pub const SEGMENT_SECS: i64 = 300;

pub struct Rec {
    task: tokio::task::JoinHandle<()>,
    src: String,
}

/// Live status text per channel id ("Recording", "Restarting…").
pub fn status(st: &State) -> HashMap<i64, String> {
    st.rec_status.lock().clone()
}

fn dir(st: &State, id: i64) -> PathBuf {
    st.data_dir.join("archive").join(id.to_string())
}

/// Pieces on disk for a channel: (start time, path), oldest first.
pub fn segments(st: &State, id: i64) -> Vec<(i64, PathBuf)> {
    let mut v: Vec<(i64, PathBuf)> = std::fs::read_dir(dir(st, id))
        .map(|rd| {
            rd.flatten()
                .filter_map(|e| {
                    let p = e.path();
                    let stem = p.file_stem()?.to_str()?.to_string();
                    let t = chrono::NaiveDateTime::parse_from_str(&stem, "%Y%m%d%H%M%S").ok()?;
                    let ts = chrono::Local.from_local_datetime(&t).single()?.timestamp();
                    Some((ts, p))
                })
                .collect()
        })
        .unwrap_or_default();
    v.sort_by_key(|x| x.0);
    v
}

/// Oldest recorded time for a channel (for the guide's "can be replayed" marks).
pub fn oldest(st: &State, id: i64) -> Option<i64> {
    segments(st, id).first().map(|x| x.0)
}

async fn record(st: State, id: i64, src: String) {
    let d = dir(&st, id);
    let _ = std::fs::create_dir_all(&d);
    loop {
        let pattern = d.join("%Y%m%d%H%M%S.ts").display().to_string();
        let mut args: Vec<String> = ["-hide_banner", "-loglevel", "error"].map(String::from).to_vec();
        if src.starts_with("http") {
            args.extend(["-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5"].map(String::from));
        }
        args.extend(["-i".into(), src.clone()]);
        args.extend(["-c", "copy", "-f", "segment", "-segment_time", "300", "-segment_atclocktime", "1", "-reset_timestamps", "1", "-strftime", "1"].map(String::from));
        args.push(pattern);
        match tokio::process::Command::new(crate::thumbs::tool("ffmpeg")).args(&args).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).kill_on_drop(true).spawn() {
            Ok(mut child) => {
                st.rec_status.lock().insert(id, "Recording".into());
                let _ = child.wait().await;
                st.rec_status.lock().insert(id, "Source stopped - retrying".into());
            }
            Err(_) => {
                st.rec_status.lock().insert(id, "ffmpeg is not installed".into());
            }
        }
        tokio::time::sleep(std::time::Duration::from_secs(15)).await;
    }
}

/// Keep recorders in line with the channel settings and delete pieces older than each channel's limit.
pub fn spawn_supervisor(st: State) {
    tokio::spawn(async move {
        loop {
            let wanted: Vec<(i64, String, i64)> = {
                let c = st.db.lock();
                let mut q = c.prepare("SELECT id, source_url, archive_days FROM live_streams WHERE archive=1 AND enabled=1").unwrap();
                q.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).unwrap().flatten().collect()
            };
            {
                let mut recs = st.recorders.lock();
                recs.retain(|id, r| {
                    let keep = wanted.iter().any(|w| w.0 == *id && w.1 == r.src);
                    if !keep {
                        r.task.abort(); // dropping the task kills its ffmpeg
                        st.rec_status.lock().remove(id);
                    }
                    keep
                });
                for (id, src, _) in &wanted {
                    if !recs.contains_key(id) {
                        let task = tokio::spawn(record(st.clone(), *id, src.clone()));
                        recs.insert(*id, Rec { task, src: src.clone() });
                    }
                }
            }
            // delete expired pieces (channels no longer archived keep 1 day)
            let days: HashMap<i64, i64> = wanted.iter().map(|w| (w.0, w.2.max(1))).collect();
            if let Ok(rd) = std::fs::read_dir(st.data_dir.join("archive")) {
                for e in rd.flatten() {
                    let Some(id) = e.file_name().to_str().and_then(|n| n.parse::<i64>().ok()) else { continue };
                    let keep_secs = days.get(&id).copied().unwrap_or(1) * 86400;
                    for (ts, p) in segments(&st, id) {
                        if ts < db::now() - keep_secs {
                            let _ = std::fs::remove_file(p);
                        }
                    }
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        }
    });
}

/* ------------------------------------------------------------------ playback */

/// "2026-11-25:20-00" (or "2026-11-25 20:00") in server local time -> timestamp
fn parse_start(s: &str) -> Option<i64> {
    let s = s.replace(' ', ":").replace('_', ":");
    let t = chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d:%H-%M")
        .or_else(|_| chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d:%H:%M"))
        .ok()?;
    chrono::Local.from_local_datetime(&t).single().map(|d| d.timestamp())
}

async fn play(st: State, ip: String, h: HeaderMap, u: &str, p: &str, stream_id: i64, start: &str, minutes: i64) -> Response {
    let Some(line) = xtream::auth(&st, u, p).filter(|l| l.active()) else { return (StatusCode::FORBIDDEN, "Invalid or expired account").into_response() };
    let Some(from) = parse_start(start) else { return (StatusCode::BAD_REQUEST, "Bad start time").into_response() };
    let to = from + minutes.clamp(1, 24 * 60) * 60;
    let pieces: Vec<PathBuf> = segments(&st, stream_id)
        .into_iter()
        .filter(|(ts, _)| *ts < to && ts + SEGMENT_SECS > from)
        .map(|x| x.1)
        .collect();
    if pieces.is_empty() {
        return (StatusCode::NOT_FOUND, "This period was not recorded").into_response();
    }
    let name: String = st.db.lock().query_row("SELECT name FROM live_streams WHERE id=?1", [stream_id], |r| r.get(0)).unwrap_or_default();
    let ua = h.get(header::USER_AGENT).and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let guard = match stream::acquire_pub(&st, &line, &ip, &ua, "catchup", stream_id, &format!("{name} (catch-up)")) {
        Ok(g) => g,
        Err(r) => return r,
    };
    // play the recorded pieces back to back (MPEG-TS can simply be joined)
    let s = futures_util::stream::iter(pieces)
        .then(|p| async move { tokio::fs::File::open(p).await.map(tokio_util::io::ReaderStream::new) })
        .filter_map(|r| async move { r.ok() })
        .flatten();
    Response::builder().header(header::CONTENT_TYPE, "video/mp2t").body(stream::guarded_pub(s, guard)).unwrap_or_else(|_| Body::empty().into_response())
}

/// /timeshift/{user}/{pass}/{minutes}/{YYYY-MM-DD:HH-MM}/{stream_id}.ts
pub async fn timeshift(
    S(st): S<State>, ConnectInfo(addr): ConnectInfo<SocketAddr>, h: HeaderMap,
    Path((u, p, minutes, start, file)): Path<(String, String, i64, String, String)>,
) -> Response {
    let id: i64 = file.split('.').next().unwrap_or("").parse().unwrap_or(-1);
    play(st.clone(), addr.ip().to_string(), h, &u, &p, id, &start, minutes).await
}

/// /streaming/timeshift.php?username=&password=&stream=&start=&duration=
pub async fn timeshift_php(S(st): S<State>, ConnectInfo(addr): ConnectInfo<SocketAddr>, h: HeaderMap, Query(q): Query<HashMap<String, String>>) -> Response {
    let g = |k: &str| q.get(k).cloned().unwrap_or_default();
    play(st.clone(), addr.ip().to_string(), h, &g("username"), &g("password"), g("stream").parse().unwrap_or(-1), &g("start"), g("duration").parse().unwrap_or(60)).await
}
