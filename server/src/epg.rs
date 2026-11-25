//! TV guide: import XMLTV sources (plain or .gz) into the database.
use crate::{db, State};
use quick_xml::events::Event;
use rusqlite::params;
use std::collections::HashSet;
use std::io::Read;

fn parse_time(s: &str) -> Option<i64> {
    let s = s.trim();
    chrono::DateTime::parse_from_str(s, "%Y%m%d%H%M%S %z")
        .map(|d| d.timestamp())
        .ok()
        .or_else(|| chrono::NaiveDateTime::parse_from_str(s.get(0..14)?, "%Y%m%d%H%M%S").ok().map(|d| d.and_utc().timestamp()))
}

struct Prog {
    ch: String,
    start: i64,
    stop: i64,
    title: String,
    desc: String,
}

fn parse(xml: &[u8]) -> Vec<Prog> {
    let mut r = quick_xml::Reader::from_reader(xml);
    r.config_mut().trim_text(true);
    let (lo, hi) = (db::now() - 86400, db::now() + 8 * 86400);
    let mut out = vec![];
    let mut buf = vec![];
    let mut cur: Option<Prog> = None;
    let mut field = 0u8; // 1 title, 2 desc
    loop {
        match r.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => match e.name().as_ref() {
                b"programme" => {
                    let mut p = Prog { ch: String::new(), start: 0, stop: 0, title: String::new(), desc: String::new() };
                    for a in e.attributes().flatten() {
                        let v = a.unescape_value().map(|v| v.to_string()).unwrap_or_default();
                        match a.key.as_ref() {
                            b"channel" => p.ch = v,
                            b"start" => p.start = parse_time(&v).unwrap_or(0),
                            b"stop" => p.stop = parse_time(&v).unwrap_or(0),
                            _ => {}
                        }
                    }
                    cur = Some(p);
                }
                b"title" => field = 1,
                b"desc" => field = 2,
                _ => {}
            },
            Ok(Event::Text(t)) => {
                if let Some(p) = cur.as_mut() {
                    let txt = t.unescape().map(|v| v.to_string()).unwrap_or_default();
                    if field == 1 && p.title.is_empty() {
                        p.title = txt;
                    } else if field == 2 && p.desc.is_empty() {
                        p.desc = txt;
                    }
                }
            }
            Ok(Event::End(e)) => match e.name().as_ref() {
                b"programme" => {
                    if let Some(p) = cur.take() {
                        if p.stop > lo && p.start < hi && !p.ch.is_empty() {
                            out.push(p);
                        }
                    }
                }
                b"title" | b"desc" => field = 0,
                _ => {}
            },
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    out
}

/// Import one source; returns a status message.
pub async fn import(st: &State, id: i64, url: &str) -> String {
    let status = match st.http.get(url).send().await {
        Ok(r) if r.status().is_success() => match r.bytes().await {
            Ok(b) => {
                let mut data = b.to_vec();
                if data.starts_with(&[0x1f, 0x8b]) {
                    let mut out = vec![];
                    if flate2::read::GzDecoder::new(&data[..]).read_to_end(&mut out).is_ok() {
                        data = out;
                    }
                }
                let progs = tokio::task::spawn_blocking(move || parse(&data)).await.unwrap_or_default();
                let n = progs.len();
                let mut c = st.db.lock();
                let tx = c.transaction().unwrap();
                let chans: HashSet<&str> = progs.iter().map(|p| p.ch.as_str()).collect();
                let _ = tx.execute("DELETE FROM epg_programs WHERE stop < ?1", [db::now() - 86400]);
                for ch in &chans {
                    let _ = tx.execute("DELETE FROM epg_programs WHERE channel_id=?1", [ch]);
                }
                {
                    let mut ins = tx.prepare("INSERT INTO epg_programs(channel_id,start,stop,title,descr) VALUES(?1,?2,?3,?4,?5)").unwrap();
                    for p in &progs {
                        let _ = ins.execute(params![p.ch, p.start, p.stop, p.title, p.desc]);
                    }
                }
                let _ = tx.commit();
                format!("OK: {n} programmes for {} channels", chans.len())
            }
            Err(e) => format!("Download failed: {e}"),
        },
        Ok(r) => format!("Server answered {}", r.status()),
        Err(e) => format!("Could not reach the guide: {e}"),
    };
    let _ = st.db.lock().execute("UPDATE epg_sources SET last_import=?2, status=?3 WHERE id=?1", params![id, db::now(), status]);
    status
}

pub async fn import_all(st: &State) {
    let sources: Vec<(i64, String)> = {
        let c = st.db.lock();
        let mut q = c.prepare("SELECT id,url FROM epg_sources").unwrap();
        q.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).unwrap().flatten().collect()
    };
    for (id, url) in sources {
        import(st, id, &url).await;
    }
}

pub fn spawn_daily_import(st: State) {
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(20)).await;
        loop {
            import_all(&st).await;
            tokio::time::sleep(std::time::Duration::from_secs(12 * 3600)).await;
        }
    });
}
