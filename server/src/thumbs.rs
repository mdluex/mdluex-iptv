//! Pictures for titles that have none: when neither a poster file next to the video nor TMDB gave a picture,
//! a frame is taken from the video itself with ffmpeg (about 20% in, the most typical-looking frame there, so not
//! a black fade or the opening logo). Movies get it as poster and backdrop, episodes as their picture, and a series
//! without a poster uses its first episode's. The files are named mdlxthumb-*, so a real poster from TMDB (added later)
//! replaces them. Uses ffmpeg.exe next to the server (the Windows download includes it), or ffmpeg from PATH.
use crate::State;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// ffmpeg: next to the server's own program first (bundled), then from PATH
pub fn tool(name: &str) -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for n in [format!("{name}.exe"), name.to_string()] {
                let p = dir.join(n);
                if p.exists() { return p; }
            }
        }
    }
    PathBuf::from(name)
}
pub fn has_ffmpeg() -> bool {
    std::process::Command::new(tool("ffmpeg")).arg("-version").output().map(|o| o.status.success()).unwrap_or(false)
}

/// Length of a video in seconds, read from ffmpeg's own report ("Duration: 01:42:07.36"), so no ffprobe is needed.
async fn duration(path: &str) -> Option<f64> {
    let out = tokio::time::timeout(Duration::from_secs(30), tokio::process::Command::new(tool("ffmpeg"))
        .args(["-nostdin", "-hide_banner", "-i", path]).kill_on_drop(true).output()).await.ok()?.ok()?;
    let text = String::from_utf8_lossy(&out.stderr);
    let d = text.split("Duration: ").nth(1)?.split(',').next()?.trim().to_string();
    let p: Vec<f64> = d.split(':').filter_map(|x| x.parse().ok()).collect();
    if p.len() != 3 { return None; }
    Some(p[0] * 3600.0 + p[1] * 60.0 + p[2]).filter(|x| *x > 0.0)
}

/// Save one representative frame of `video` as a JPEG at `out`.
async fn grab(video: &str, out: &Path) -> bool {
    let start = match duration(video).await { Some(d) => (d * 0.2).max(3.0).min(d - 1.0).max(0.0), None => 60.0 };
    for t in [start, 5.0, 0.0] {
        let run = tokio::process::Command::new(tool("ffmpeg"))
            .args(["-nostdin", "-v", "error", "-y", "-ss", &format!("{t:.1}"), "-i", video,
                   "-vf", "thumbnail=50,scale=780:-2", "-frames:v", "1", "-q:v", "4"])
            .arg(out).kill_on_drop(true).output();
        if let Ok(Ok(o)) = tokio::time::timeout(Duration::from_secs(90), run).await {
            if o.status.success() && std::fs::metadata(out).map(|m| m.len() > 2000).unwrap_or(false) { return true; }
        }
    }
    false
}

/// Fill in missing pictures; returns how many were made.
pub async fn fill(st: &State) -> usize {
    if !has_ffmpeg() { return 0; }
    let dir = st.data_dir.join("thumbs");
    if std::fs::create_dir_all(&dir).is_err() { return 0; }
    let movies: Vec<(i64, String)> = list(st, "SELECT id,path FROM movies WHERE poster='' ORDER BY added DESC");
    let episodes: Vec<(i64, String)> = list(st, "SELECT id,path FROM episodes WHERE still='' ORDER BY added DESC");
    let total = movies.len() + episodes.len();
    let mut made = 0;
    for (i, (id, path)) in movies.iter().enumerate() {
        progress(st, i, total);
        let out = dir.join(format!("mdlxthumb-movie-{id}.jpg"));
        if grab(path, &out).await {
            let f = format!("file:{}", out.display());
            let _ = st.db.lock().execute(
                "UPDATE movies SET poster=?2, backdrop=CASE WHEN backdrop='' THEN ?2 ELSE backdrop END WHERE id=?1 AND poster=''",
                rusqlite::params![id, f]);
            made += 1;
        }
    }
    for (i, (id, path)) in episodes.iter().enumerate() {
        progress(st, movies.len() + i, total);
        let out = dir.join(format!("mdlxthumb-episode-{id}.jpg"));
        if grab(path, &out).await {
            let _ = st.db.lock().execute("UPDATE episodes SET still=?2 WHERE id=?1 AND still=''",
                rusqlite::params![id, format!("file:{}", out.display())]);
            made += 1;
        }
    }
    // a series with no poster: its first episode's picture
    let _ = st.db.lock().execute_batch(
        "UPDATE series SET poster=(SELECT e.still FROM episodes e WHERE e.series_id=series.id AND e.still LIKE 'file:%' ORDER BY e.season, e.episode LIMIT 1)
           WHERE poster='' AND EXISTS (SELECT 1 FROM episodes e WHERE e.series_id=series.id AND e.still LIKE 'file:%');
         UPDATE series SET backdrop=poster WHERE backdrop='' AND poster LIKE 'file:%';");
    made
}

fn list(st: &State, sql: &str) -> Vec<(i64, String)> {
    let c = st.db.lock();
    let Ok(mut q) = c.prepare(sql) else { return vec![] };
    q.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).map(|it| it.filter_map(Result::ok).collect()).unwrap_or_default()
}
fn progress(st: &State, i: usize, total: usize) {
    st.scan.lock().message = format!("Making pictures from the videos… {} of {}", i + 1, total);
}
