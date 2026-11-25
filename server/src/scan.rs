//! Media library scanner (movies + series folders) and optional TMDB metadata enrichment.
use crate::{db, State};
use once_cell::sync::Lazy;
use regex::Regex;
use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};

#[derive(Default, Clone, Serialize)]
pub struct ScanStatus {
    pub running: bool,
    pub message: String,
    pub movies: usize,
    pub series: usize,
    pub episodes: usize,
    pub removed: usize,
    pub enriched: usize,
    pub finished: i64,
}

const VIDEO: &[&str] = &["mp4", "mkv", "avi", "m4v", "mov", "ts", "webm", "wmv", "mpg", "mpeg", "flv"];
static YEAR: Lazy<Regex> = Lazy::new(|| Regex::new(r"[\s._(\[-]((?:19|20)\d{2})(?:[\s._)\]-]|$)").unwrap());
static JUNK: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)[\s._-](2160p|1080p|720p|480p|4k|uhd|bluray|blu-ray|brrip|bdrip|web-?dl|webrip|hdrip|dvdrip|hdtv|x264|x265|h\.?264|h\.?265|hevc|hdr|10bit|aac|dts|remux|proper|repack)\b.*$").unwrap()
});
static SXE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)s(\d{1,2})[\s._-]?e(\d{1,3})").unwrap());
static NXN: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)\b(\d{1,2})x(\d{2,3})\b").unwrap());
static SEASON_DIR: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)(?:season|saison|s)[\s._-]*(\d{1,2})").unwrap());
static EP_ONLY: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)(?:e|ep|episode)[\s._-]*(\d{1,3})|^(\d{1,3})\b").unwrap());

fn is_video(p: &Path) -> bool {
    p.extension().and_then(|e| e.to_str()).map(|e| VIDEO.contains(&e.to_lowercase().as_str())).unwrap_or(false)
}

/// "The.Matrix.1999.1080p.BluRay" -> ("The Matrix", Some(1999))
pub fn parse_title(raw: &str) -> (String, Option<i64>) {
    let mut name = raw.to_string();
    let mut year = None;
    if let Some(m) = YEAR.captures(&name) {
        year = m[1].parse().ok();
        let cut = m.get(0).unwrap().start();
        if cut > 0 {
            name.truncate(cut);
        }
    }
    let name = JUNK.replace(&name, "").to_string();
    let clean = name.replace(['.', '_'], " ").replace("  ", " ");
    let clean = clean.trim().trim_matches(|c: char| c == '-' || c == '(' || c == '[').trim().to_string();
    (if clean.is_empty() { raw.to_string() } else { clean }, year)
}

fn find_art(dir: &Path, stem: Option<&str>, names: &[&str]) -> String {
    let mut cands: Vec<PathBuf> = vec![];
    if let Some(s) = stem {
        for n in names {
            cands.push(dir.join(format!("{s}-{n}.jpg")));
        }
        if names.contains(&"poster") {
            cands.push(dir.join(format!("{s}.jpg")));
        }
    }
    for n in names {
        cands.push(dir.join(format!("{n}.jpg")));
        cands.push(dir.join(format!("{n}.png")));
    }
    cands.into_iter().find(|p| p.exists()).map(|p| format!("file:{}", p.display())).unwrap_or_default()
}

pub fn start(st: State) -> bool {
    {
        let mut s = st.scan.lock();
        if s.running {
            return false;
        }
        *s = ScanStatus { running: true, message: "Scanning folders…".into(), ..Default::default() };
    }
    tokio::spawn(async move {
        let st2 = st.clone();
        let _ = tokio::task::spawn_blocking(move || scan_folders(&st2)).await;
        enrich(&st).await;
        let mut s = st.scan.lock();
        s.running = false;
        s.finished = db::now();
        s.message = format!(
            "Done: {} movies, {} series, {} episodes found{}{}",
            s.movies, s.series, s.episodes,
            if s.removed > 0 { format!(", {} missing files removed", s.removed) } else { String::new() },
            if s.enriched > 0 { format!(", {} titles got TMDB details", s.enriched) } else { String::new() }
        );
    });
    true
}

fn scan_folders(st: &State) {
    let folders: Vec<(String, String, Option<i64>)> = {
        let c = st.db.lock();
        let mut q = c.prepare("SELECT path,kind,category_id FROM library_folders").unwrap();
        q.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).unwrap().flatten().collect()
    };
    for (root, kind, cat) in folders {
        let rootp = PathBuf::from(&root);
        if !rootp.is_dir() {
            st.scan.lock().message = format!("Folder not found: {root}");
            continue;
        }
        if kind == "movie" {
            scan_movies(st, &rootp, cat);
        } else {
            scan_series(st, &rootp, cat);
        }
    }
    // forget files that no longer exist
    let c = st.db.lock();
    let mut removed = 0;
    for table in ["movies", "episodes"] {
        let gone: Vec<i64> = c
            .prepare(&format!("SELECT id,path FROM {table}"))
            .unwrap()
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
            .unwrap()
            .flatten()
            .filter(|(_, p)| !Path::new(p).exists())
            .map(|(id, _)| id)
            .collect();
        for id in gone {
            let _ = c.execute(&format!("DELETE FROM {table} WHERE id=?1"), [id]);
            removed += 1;
        }
    }
    let _ = c.execute("DELETE FROM series WHERE id NOT IN (SELECT DISTINCT series_id FROM episodes)", []);
    st.scan.lock().removed = removed;
}

fn scan_movies(st: &State, root: &Path, cat: Option<i64>) {
    let cat = cat.or_else(|| db::category_id(&st.db.lock(), "movie", "Movies").ok());
    for e in walkdir::WalkDir::new(root).into_iter().flatten() {
        let p = e.path();
        if !e.file_type().is_file() || !is_video(p) {
            continue;
        }
        let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        if stem.to_lowercase().contains("sample") || stem.to_lowercase().contains("trailer") {
            continue;
        }
        let dir = p.parent().unwrap_or(root);
        // folder named like the movie ("Movie (2020)/file.mkv") gives a cleaner title
        let raw = if dir != root { dir.file_name().and_then(|s| s.to_str()).unwrap_or(stem) } else { stem };
        let (title, year) = parse_title(raw);
        let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("mp4").to_lowercase();
        let size = e.metadata().map(|m| m.len() as i64).unwrap_or(0);
        let poster = find_art(dir, Some(stem), &["poster", "folder", "cover"]);
        let backdrop = find_art(dir, Some(stem), &["fanart", "backdrop", "background"]);
        let c = st.db.lock();
        let path = p.display().to_string();
        let exists: Option<i64> = c.query_row("SELECT id FROM movies WHERE path=?1", [&path], |r| r.get(0)).optional().ok().flatten();
        if let Some(id) = exists {
            let _ = c.execute("UPDATE movies SET size=?2 WHERE id=?1", params![id, size]);
            if !poster.is_empty() {
                let _ = c.execute("UPDATE movies SET poster=?2 WHERE id=?1 AND poster=''", params![id, poster]);
            }
        } else {
            let _ = c.execute(
                "INSERT INTO movies(title,category_id,path,ext,size,year,poster,backdrop,added) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![title, cat, path, ext, size, year, poster, backdrop, db::now()],
            );
        }
        st.scan.lock().movies += 1;
    }
}

fn scan_series(st: &State, root: &Path, cat: Option<i64>) {
    let cat = cat.or_else(|| db::category_id(&st.db.lock(), "series", "Series").ok());
    let Ok(entries) = std::fs::read_dir(root) else { return };
    for show in entries.flatten() {
        let sdir = show.path();
        if !sdir.is_dir() {
            continue;
        }
        let (title, year) = parse_title(show.file_name().to_str().unwrap_or(""));
        let folder = sdir.display().to_string();
        let series_id: i64 = {
            let c = st.db.lock();
            match c.query_row("SELECT id FROM series WHERE folder=?1", [&folder], |r| r.get(0)).optional().ok().flatten() {
                Some(id) => id,
                None => {
                    let poster = find_art(&sdir, None, &["poster", "folder", "cover"]);
                    let backdrop = find_art(&sdir, None, &["fanart", "backdrop", "background"]);
                    let now = db::now();
                    let _ = c.execute(
                        "INSERT INTO series(title,category_id,folder,year,poster,backdrop,added,updated) VALUES(?1,?2,?3,?4,?5,?6,?7,?7)",
                        params![title, cat, folder, year, poster, backdrop, now],
                    );
                    c.last_insert_rowid()
                }
            }
        };
        let mut new_eps = 0;
        for e in walkdir::WalkDir::new(&sdir).into_iter().flatten() {
            let p = e.path();
            if !e.file_type().is_file() || !is_video(p) {
                continue;
            }
            let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
            let (season, episode) = if let Some(m) = SXE.captures(stem).or_else(|| NXN.captures(stem)) {
                (m[1].parse().unwrap_or(1), m[2].parse().unwrap_or(0))
            } else {
                let season = p
                    .parent()
                    .and_then(|d| d.file_name())
                    .and_then(|n| n.to_str())
                    .and_then(|n| SEASON_DIR.captures(n))
                    .and_then(|m| m[1].parse().ok())
                    .unwrap_or(1);
                let ep = EP_ONLY
                    .captures(stem)
                    .and_then(|m| m.get(1).or_else(|| m.get(2)))
                    .and_then(|m| m.as_str().parse().ok())
                    .unwrap_or(0);
                (season, ep)
            };
            let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("mp4").to_lowercase();
            let path = p.display().to_string();
            let c = st.db.lock();
            let changed = c
                .execute(
                    "INSERT OR IGNORE INTO episodes(series_id,season,episode,path,ext,added) VALUES(?1,?2,?3,?4,?5,?6)",
                    params![series_id, season, episode, path, ext, db::now()],
                )
                .unwrap_or(0);
            new_eps += changed;
            st.scan.lock().episodes += 1;
        }
        if new_eps > 0 {
            let _ = st.db.lock().execute("UPDATE series SET updated=?2 WHERE id=?1", params![series_id, db::now()]);
        }
        st.scan.lock().series += 1;
    }
}

/* ------------------------------------------------------------------ TMDB */

const IMG: &str = "https://image.tmdb.org/t/p/";

async fn tmdb(st: &State, key: &str, lang: &str, path: &str, extra: &str) -> Option<Value> {
    let url = format!("https://api.themoviedb.org/3/{path}?api_key={key}&language={lang}{extra}");
    let r = st.http.get(url).send().await.ok()?;
    if !r.status().is_success() {
        return None;
    }
    r.json().await.ok()
}
fn trailer(v: &Value) -> String {
    v["videos"]["results"]
        .as_array()
        .and_then(|a| a.iter().find(|x| x["site"] == "YouTube" && x["type"] == "Trailer").or_else(|| a.iter().find(|x| x["site"] == "YouTube")))
        .and_then(|x| x["key"].as_str())
        .unwrap_or("")
        .to_string()
}
fn names(v: &Value, take: usize) -> String {
    v.as_array().map(|a| a.iter().take(take).filter_map(|x| x["name"].as_str()).collect::<Vec<_>>().join(", ")).unwrap_or_default()
}
fn img(v: &Value, size: &str) -> String {
    v.as_str().map(|p| format!("{IMG}{size}{p}")).unwrap_or_default()
}

/// Fill in posters, plots, ratings, cast and YouTube trailers for titles not looked up yet.
pub async fn enrich(st: &State) {
    let (key, lang) = {
        let c = st.db.lock();
        (db::setting(&c, "tmdb_key", ""), db::setting(&c, "tmdb_lang", "en-US"))
    };
    if key.trim().is_empty() {
        return;
    }
    let key = key.trim().to_string();
    st.scan.lock().message = "Getting posters and details from TMDB…".into();
    let movies: Vec<(i64, String, Option<i64>)> = {
        let c = st.db.lock();
        let mut q = c.prepare("SELECT id,title,year FROM movies WHERE tmdb_id IS NULL").unwrap();
        q.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).unwrap().flatten().collect()
    };
    for (id, title, year) in movies {
        let q = format!("&query={}{}", urlencoding::encode(&title), year.map(|y| format!("&year={y}")).unwrap_or_default());
        let hit = tmdb(st, &key, &lang, "search/movie", &q).await.and_then(|v| v["results"][0]["id"].as_i64());
        let Some(tid) = hit else {
            let _ = st.db.lock().execute("UPDATE movies SET tmdb_id=0 WHERE id=?1", [id]);
            continue;
        };
        if let Some(d) = tmdb(st, &key, &lang, &format!("movie/{tid}"), "&append_to_response=videos,credits&include_video_language=en,null").await {
            let director = d["credits"]["crew"]
                .as_array()
                .and_then(|a| a.iter().find(|x| x["job"] == "Director"))
                .and_then(|x| x["name"].as_str())
                .unwrap_or("")
                .to_string();
            let year2: Option<i64> = d["release_date"].as_str().and_then(|s| s.get(0..4)).and_then(|y| y.parse().ok());
            let _ = st.db.lock().execute(
                "UPDATE movies SET tmdb_id=?2, plot=?3, rating=?4, genre=?5, cast_list=?6, director=?7, duration_secs=?8, trailer=?9,
                 poster=CASE WHEN poster='' THEN ?10 ELSE poster END, backdrop=CASE WHEN backdrop='' THEN ?11 ELSE backdrop END,
                 year=COALESCE(year, ?12) WHERE id=?1",
                params![
                    id, tid, d["overview"].as_str().unwrap_or(""), d["vote_average"].as_f64().unwrap_or(0.0), names(&d["genres"], 3),
                    names(&d["credits"]["cast"], 5), director, d["runtime"].as_i64().unwrap_or(0) * 60, trailer(&d),
                    img(&d["poster_path"], "w500"), img(&d["backdrop_path"], "w1280"), year2
                ],
            );
            st.scan.lock().enriched += 1;
        }
    }
    let shows: Vec<(i64, String, Option<i64>)> = {
        let c = st.db.lock();
        let mut q = c.prepare("SELECT id,title,year FROM series WHERE tmdb_id IS NULL").unwrap();
        q.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).unwrap().flatten().collect()
    };
    for (id, title, year) in shows {
        let q = format!("&query={}{}", urlencoding::encode(&title), year.map(|y| format!("&first_air_date_year={y}")).unwrap_or_default());
        let hit = tmdb(st, &key, &lang, "search/tv", &q).await.and_then(|v| v["results"][0]["id"].as_i64());
        let Some(tid) = hit else {
            let _ = st.db.lock().execute("UPDATE series SET tmdb_id=0 WHERE id=?1", [id]);
            continue;
        };
        let Some(d) = tmdb(st, &key, &lang, &format!("tv/{tid}"), "&append_to_response=videos,credits&include_video_language=en,null").await else { continue };
        let year2: Option<i64> = d["first_air_date"].as_str().and_then(|s| s.get(0..4)).and_then(|y| y.parse().ok());
        let _ = st.db.lock().execute(
            "UPDATE series SET tmdb_id=?2, plot=?3, rating=?4, genre=?5, cast_list=?6, trailer=?7,
             poster=CASE WHEN poster='' THEN ?8 ELSE poster END, backdrop=CASE WHEN backdrop='' THEN ?9 ELSE backdrop END,
             year=COALESCE(year, ?10) WHERE id=?1",
            params![
                id, tid, d["overview"].as_str().unwrap_or(""), d["vote_average"].as_f64().unwrap_or(0.0), names(&d["genres"], 3),
                names(&d["credits"]["cast"], 5), trailer(&d), img(&d["poster_path"], "w500"), img(&d["backdrop_path"], "w1280"), year2
            ],
        );
        // episode names, plots and pictures
        let seasons: Vec<i64> = {
            let c = st.db.lock();
            let mut q = c.prepare("SELECT DISTINCT season FROM episodes WHERE series_id=?1").unwrap();
            q.query_map([id], |r| r.get(0)).unwrap().flatten().collect()
        };
        for sn in seasons {
            if let Some(sd) = tmdb(st, &key, &lang, &format!("tv/{tid}/season/{sn}"), "").await {
                for ep in sd["episodes"].as_array().cloned().unwrap_or_default() {
                    let _ = st.db.lock().execute(
                        "UPDATE episodes SET title=CASE WHEN title='' THEN ?4 ELSE title END, plot=?5,
                         still=CASE WHEN still='' THEN ?6 ELSE still END, duration_secs=CASE WHEN duration_secs=0 THEN ?7 ELSE duration_secs END
                         WHERE series_id=?1 AND season=?2 AND episode=?3",
                        params![
                            id, sn, ep["episode_number"].as_i64().unwrap_or(-1), ep["name"].as_str().unwrap_or(""),
                            ep["overview"].as_str().unwrap_or(""), img(&ep["still_path"], "w300"), ep["runtime"].as_i64().unwrap_or(0) * 60
                        ],
                    );
                }
            }
        }
        st.scan.lock().enriched += 1;
    }
}
