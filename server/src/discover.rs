//! Finding the server from a TV without typing an IP address.
//!  - GET /mdluex.json says "this is a Mdluex IPTV Server" (the app's network search looks for it)
//!  - mDNS / Bonjour: the server answers to http://mdluex-iptv.local:<port> on the home network
//!  - a short server code: the server posts its home-network address to the public ntfy.sh relay under that code,
//!    the app reads it back when the code is typed in. Only the local address (like 192.168.1.20:8080) is posted.
use crate::{db, State};
use axum::{extract::State as S, response::IntoResponse, Json};
use rand::Rng;
use serde_json::json;

pub const MDNS_HOST: &str = "mdluex-iptv";
const RELAY: &str = "https://ntfy.sh/";
const CODE_ABC: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";   // no 0/O, 1/I/L: easy to read and type on a remote

/// The server's code (made once, kept in the database).
pub fn server_code(st: &State) -> String {
    let c = st.db.lock();
    let mut code = db::setting(&c, "server_code", "");
    if code.len() != 6 {
        let mut r = rand::thread_rng();
        code = (0..6).map(|_| CODE_ABC[r.gen_range(0..CODE_ABC.len())] as char).collect();
        let _ = db::set_setting(&c, "server_code", &code);
    }
    code
}
/// Off with --no-code (then nothing is posted to the relay; the network search and the easy name still work).
pub fn code_enabled(st: &State) -> bool {
    !std::env::args().any(|a| a == "--no-code") && db::setting(&st.db.lock(), "server_code_on", "1") == "1"
}

/// Addresses a TV on the same network can use.
pub fn urls(port: u16) -> Vec<String> {
    crate::local_ips().iter().map(|ip| format!("http://{ip}:{port}")).collect()
}

/// GET /mdluex.json
pub async fn info(S(st): S<State>) -> impl IntoResponse {
    let port = st.port;
    // read one at a time: both take the database lock
    let name = db::setting(&st.db.lock(), "server_name", "Mdluex IPTV Server");
    let id = server_code(&st);   // the same server seen through two network cards is listed once
    Json(json!({
        "app": "mdluex-iptv-server", "version": env!("CARGO_PKG_VERSION"), "name": name,
        "port": port, "urls": urls(port), "local_name": format!("http://{MDNS_HOST}.local:{port}"), "id": id
    }))
}

/// Start mDNS and the code announcer.
pub fn spawn(st: State) {
    let port = st.port;
    // mDNS: keep the daemon alive for the whole run
    std::thread::spawn(move || {
        let Ok(daemon) = mdns_sd::ServiceDaemon::new() else { return };
        let ips: Vec<std::net::IpAddr> = crate::local_ips().iter().filter_map(|i| i.parse().ok()).collect();
        if ips.is_empty() { return; }
        let props = [("path", "/mdluex.json")];
        if let Ok(info) = mdns_sd::ServiceInfo::new("_http._tcp.local.", "Mdluex IPTV Server", &format!("{MDNS_HOST}.local."), &ips[..], port, &props[..]) {
            let _ = daemon.register(info);
        }
        loop { std::thread::sleep(std::time::Duration::from_secs(3600)); }
    });
    // the code: post the address now and every 3 hours (the relay keeps messages for 12 hours)
    tokio::spawn(async move {
        loop {
            if code_enabled(&st) {
                let topic = format!("{RELAY}mdlx-srv-{}", server_code(&st).to_lowercase());
                let body = json!({ "v": 1, "app": "mdluex-iptv-server", "urls": urls(port) }).to_string();
                let _ = st.http.post(&topic).body(body).timeout(std::time::Duration::from_secs(15)).send().await;
            }
            tokio::time::sleep(std::time::Duration::from_secs(3 * 3600)).await;
        }
    });
}
