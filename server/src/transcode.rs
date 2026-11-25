//! Transcoding profiles and the shared live-stream pipeline (direct relay, HLS->TS remux, or ffmpeg transcode).
use bytes::Bytes;
use futures_util::{Stream, StreamExt};
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use std::pin::Pin;

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Profile {
    pub video: String,         // "copy" or "h264"
    pub resolution: String,    // "", "720", "1280x720"
    pub video_bitrate: String, // e.g. "2500k"
    pub preset: String,        // x264 preset, e.g. "veryfast"
    pub audio: String,         // "copy" or "aac"
    pub audio_bitrate: String, // e.g. "128k"
    pub extra: String,         // extra ffmpeg output options
}

pub fn load(st: &crate::State, id: Option<i64>) -> Option<Profile> {
    let id = id?;
    st.db
        .lock()
        .query_row("SELECT video,resolution,video_bitrate,preset,audio,audio_bitrate,extra FROM profiles WHERE id=?1", [id], |r| {
            Ok(Profile { video: r.get(0)?, resolution: r.get(1)?, video_bitrate: r.get(2)?, preset: r.get(3)?, audio: r.get(4)?, audio_bitrate: r.get(5)?, extra: r.get(6)? })
        })
        .optional()
        .ok()
        .flatten()
}

/// ffmpeg arguments that read `src` and write MPEG-TS to stdout.
pub fn ffmpeg_args(src: &str, p: Option<&Profile>) -> Vec<String> {
    let mut a: Vec<String> = ["-hide_banner", "-loglevel", "error"].iter().map(|s| s.to_string()).collect();
    if src.starts_with("http") {
        a.extend(["-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5"].map(String::from));
    }
    a.extend(["-i".to_string(), src.to_string()]);
    match p {
        Some(p) if p.video != "copy" => {
            a.extend(["-c:v", "libx264", "-preset", if p.preset.is_empty() { "veryfast" } else { p.preset.as_str() }, "-g", "50", "-pix_fmt", "yuv420p"].map(String::from));
            if !p.video_bitrate.is_empty() {
                let b = &p.video_bitrate;
                a.extend(["-b:v".into(), b.clone(), "-maxrate".into(), b.clone(), "-bufsize".into(), double(b)]);
            }
            let res = p.resolution.trim();
            if !res.is_empty() {
                let scale = match res.split_once('x') {
                    Some((w, h)) => format!("scale={w}:{h}:force_original_aspect_ratio=decrease"),
                    None => format!("scale=-2:{res}"),
                };
                a.extend(["-vf".into(), scale]);
            }
        }
        _ => a.extend(["-c:v", "copy"].map(String::from)),
    }
    match p {
        Some(p) if p.audio != "copy" => {
            a.extend(["-c:a", "aac", "-b:a", if p.audio_bitrate.is_empty() { "128k" } else { p.audio_bitrate.as_str() }].map(String::from));
        }
        _ => a.extend(["-c:a", "copy"].map(String::from)),
    }
    if let Some(p) = p {
        a.extend(p.extra.split_whitespace().map(String::from));
    }
    a.extend(["-f", "mpegts", "pipe:1"].map(String::from));
    a
}
fn double(b: &str) -> String {
    let digits: String = b.chars().take_while(|c| c.is_ascii_digit()).collect();
    let unit: String = b.chars().skip_while(|c| c.is_ascii_digit()).collect();
    digits.parse::<u64>().map(|n| format!("{}{unit}", n * 2)).unwrap_or_else(|_| b.to_string())
}

pub type ByteStream = Pin<Box<dyn Stream<Item = Result<Bytes, std::io::Error>> + Send>>;

/// Open a live source: direct HTTP relay when possible, otherwise ffmpeg (HLS sources or a transcoding profile).
pub async fn open_live(http: &reqwest::Client, src: &str, profile: Option<&Profile>) -> Result<ByteStream, String> {
    let is_hls = src.to_lowercase().contains(".m3u8");
    if profile.is_some() || is_hls || !src.starts_with("http") {
        let mut child = tokio::process::Command::new("ffmpeg")
            .args(ffmpeg_args(src, profile))
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .map_err(|_| "ffmpeg is not installed on the server".to_string())?;
        let out = child.stdout.take().unwrap();
        let s = tokio_util::io::ReaderStream::new(out).map(move |c| {
            let _keep_alive = &child; // ffmpeg lives as long as the stream
            c
        });
        return Ok(Box::pin(s));
    }
    let resp = http.get(src).send().await.map_err(|e| format!("Source unreachable: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Source answered {}", resp.status()));
    }
    Ok(Box::pin(resp.bytes_stream().map(|r| r.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))))
}
