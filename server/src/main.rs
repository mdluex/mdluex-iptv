//! Mdluex IPTV Server - self-hosted IPTV media server.
//! Xtream Codes compatible API + M3U + XMLTV, streaming with connection limits, web admin panel.
mod admin;
mod archive;
mod balance;
mod db;
mod discover;
mod transcode;
mod epg;
mod scan;
mod stream;
mod thumbs;
mod xtream;

use axum::{routing::get, Router};
use std::{net::SocketAddr, path::PathBuf, sync::Arc};

pub struct AppState {
    pub db: db::Db,
    pub conns: stream::Registry,
    pub scan: parking_lot::Mutex<scan::ScanStatus>,
    pub http: reqwest::Client,
    pub data_dir: PathBuf,
    pub started: i64,
    pub port: u16,
    pub recorders: parking_lot::Mutex<std::collections::HashMap<i64, archive::Rec>>,
    pub rec_status: parking_lot::Mutex<std::collections::HashMap<i64, String>>,
}
pub type State = Arc<AppState>;

fn arg(name: &str) -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    args.iter().position(|a| a == name).and_then(|i| args.get(i + 1).cloned())
}

#[tokio::main]
async fn main() {
    // edge mode: mdluex-server --edge --main http://main-server:8080 --secret <secret> [--port 8080]
    if std::env::args().any(|a| a == "--edge") {
        let main_url = arg("--main").unwrap_or_else(|| { eprintln!("--main <main server address> is required"); std::process::exit(1) });
        let secret = arg("--secret").unwrap_or_else(|| { eprintln!("--secret <server secret> is required"); std::process::exit(1) });
        let port = arg("--port").and_then(|p| p.parse().ok()).unwrap_or(8080);
        balance::run_edge(main_url, secret, port).await;
        return;
    }
    let data_dir = PathBuf::from(arg("--data").unwrap_or_else(|| "mdluex-data".into()));
    std::fs::create_dir_all(&data_dir).expect("cannot create data folder");
    let db = db::open(&data_dir.join("mdluex.db")).expect("cannot open database");

    // first start: create the admin account and print its password
    let first_password = admin::ensure_admin(&db);
    let port: u16 = arg("--port")
        .or_else(|| Some(db::setting(&db.lock(), "port", "8080")))
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);

    let state: State = Arc::new(AppState {
        db,
        conns: stream::Registry::default(),
        scan: parking_lot::Mutex::new(scan::ScanStatus::default()),
        http: reqwest::Client::builder()
            .user_agent("Mdluex-IPTV-Server/1.0")
            .connect_timeout(std::time::Duration::from_secs(10))
            .build()
            .unwrap(),
        data_dir,
        started: db::now(),
        port,
        recorders: Default::default(),
        rec_status: Default::default(),
    });
    stream::spawn_cleanup(state.clone());
    discover::spawn(state.clone());
    archive::spawn_supervisor(state.clone());
    epg::spawn_daily_import(state.clone());

    // Xtream Codes compatible endpoints (what IPTV apps talk to); open to web-based players too
    let xtream_routes = Router::new()
        .route("/player_api.php", get(xtream::player_api).post(xtream::player_api))
        .route("/mdluex.json", get(discover::info))
        .route("/get.php", get(xtream::m3u))
        .route("/xmltv.php", get(xtream::xmltv))
        .route("/live/:u/:p/:file", get(stream::live))
        .route("/movie/:u/:p/:file", get(stream::movie))
        .route("/series/:u/:p/:file", get(stream::episode))
        .route("/:u/:p/:file", get(stream::live_short))
        .route("/img/:kind/:id", get(stream::image))
        // catch-up (standard Xtream timeshift links)
        .route("/timeshift/:u/:p/:minutes/:start/:file", get(archive::timeshift))
        .route("/streaming/timeshift.php", get(archive::timeshift_php))
        // load balancer: edge servers
        .route("/api/edge/heartbeat", axum::routing::post(balance::heartbeat))
        .route("/internal/file", get(balance::internal_file))
        .layer(tower_http::cors::CorsLayer::permissive());
    let app = Router::new()
        .merge(xtream_routes)
        // admin panel + its JSON API (same-origin only)
        .merge(admin::router())
        .with_state(state.clone());
    let code = discover::code_enabled(&state).then(|| discover::server_code(&state));

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap_or_else(|e| {
        eprintln!("Port {port} is busy ({e}). Start with --port <number>.");
        std::process::exit(1);
    });
    let local = format!("http://localhost:{port}/admin");
    println!("==============================================");
    println!("  Mdluex IPTV Server is running");
    println!("  Admin panel : {local}");
    for ip in local_ips() {
        println!("  On your TV  : server http://{ip}:{port}");
    }
    println!("  Easy name   : http://{}.local:{port}", discover::MDNS_HOST);
    if let Some(code) = &code {
        println!("  Server code : {code}   (TV app: Add playlist > Find my server)");
    }
    if let Some(pw) = &first_password {
        println!("  First login : admin / {pw}   (change it in Settings)");
    }
    println!("==============================================");
    // in the background: the Windows permission prompt may wait for the user, the server serves meanwhile
    if !std::env::args().any(|a| a == "--no-firewall") { std::thread::spawn(move || open_firewall(port)); }
    if arg("--no-browser").is_none() && !std::env::args().any(|a| a == "--no-browser") {
        let _ = open::that(&local);
    }
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        .await
        .unwrap();
}

/// Windows: TVs and phones can only reach the server if Windows Firewall lets the port in. Windows' own prompt
/// allows only one network type, and when it is dismissed it adds a BLOCK rule for the program (blocks win over
/// allows). So once, with the user's permission (one Windows prompt), remove those and allow the server on every
/// network type. Without permission, explain how to do it by hand.
#[cfg(windows)]
fn open_firewall(port: u16) {
    use std::process::Command;
    let name = format!("Mdluex IPTV Server (TCP {port})");
    let has = || Command::new("netsh").args(["advfirewall", "firewall", "show", "rule", &format!("name={name}")]).output()
        .map(|o| o.status.success() && String::from_utf8_lossy(&o.stdout).contains(&name)).unwrap_or(false);
    if has() { return; }
    let exe = std::env::current_exe().map(|p| p.display().to_string()).unwrap_or_default();
    let script = [
        "@echo off".to_string(),
        format!("netsh advfirewall firewall delete rule name=all program=\"{exe}\" dir=in >nul"),
        format!("netsh advfirewall firewall add rule name=\"{name}\" dir=in action=allow protocol=TCP localport={port} profile=any >nul"),
        format!("netsh advfirewall firewall add rule name=\"{name}\" dir=in action=allow program=\"{exe}\" profile=any >nul"),
    ].join("\r\n") + "\r\n";
    let file = std::env::temp_dir().join("mdluex-server-firewall.cmd");
    if std::fs::write(&file, script).is_err() { return; }
    // already running as administrator: just do it
    let direct = Command::new("cmd").args(["/c", &file.display().to_string()]).output().map(|o| o.status.success()).unwrap_or(false);
    if !(direct && has()) {
        println!("  Windows will ask to let Mdluex IPTV Server through the firewall - click Yes.");
        let ps = format!("Start-Process -FilePath '{}' -Verb RunAs -WindowStyle Hidden -Wait", file.display());
        let _ = Command::new("powershell").args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps]).output();
    }
    let _ = std::fs::remove_file(&file);
    if has() {
        println!("  Windows Firewall: port {port} is open - TVs and phones on your network can connect.");
    } else {
        println!("  The firewall was NOT changed, so TVs may not connect. To fix it: run mdluex-server.exe once as");
        println!("  administrator, or allow 'mdluex-server' in Windows Security > Firewall > Allow an app (Private + Public).");
    }
}
#[cfg(not(windows))]
fn open_firewall(_port: u16) {}

/// LAN addresses of this machine (for the "use this on your TV" hint).
pub fn local_ips() -> Vec<String> {
    let mut out = vec![];
    if let Ok(sock) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if sock.connect("8.8.8.8:80").is_ok() {
            if let Ok(a) = sock.local_addr() {
                out.push(a.ip().to_string());
            }
        }
    }
    out
}
