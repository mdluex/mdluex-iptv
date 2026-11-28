//! Web admin panel: login/sessions, JSON management API and the embedded panel files.
use crate::{db, epg, scan, xtream, State};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    async_trait,
    extract::{FromRequestParts, Path, Query, State as S},
    http::{header, request::Parts, HeaderMap, StatusCode},
    response::{IntoResponse, Redirect, Response},
    routing::{delete, get, post, put},
    Json, Router,
};
use rand::Rng;
use rusqlite::{params_from_iter, types::Value as SqlValue, OptionalExtension};
use rust_embed::RustEmbed;
use serde_json::{json, Map, Value};
use std::collections::HashMap;

#[derive(RustEmbed)]
#[folder = "admin/"]
struct Assets;

type ApiResult = Result<Json<Value>, (StatusCode, String)>;
fn bad(msg: impl ToString) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, msg.to_string())
}

/* ------------------------------------------------------------------ auth */

fn hash(pw: &str) -> String {
    Argon2::default().hash_password(pw.as_bytes(), &SaltString::generate(&mut OsRng)).unwrap().to_string()
}
fn verify(pw: &str, h: &str) -> bool {
    PasswordHash::new(h).map(|ph| Argon2::default().verify_password(pw.as_bytes(), &ph).is_ok()).unwrap_or(false)
}
fn random_text(n: usize) -> String {
    const CH: &[u8] = b"abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut r = rand::thread_rng();
    (0..n).map(|_| CH[r.gen_range(0..CH.len())] as char).collect()
}

/// First start: create "admin" with a random password (returned so it can be shown once).
pub fn ensure_admin(db: &db::Db) -> Option<String> {
    let c = db.lock();
    let n: i64 = c.query_row("SELECT COUNT(*) FROM admins", [], |r| r.get(0)).unwrap_or(0);
    if n > 0 {
        return None;
    }
    let pw = random_text(10);
    c.execute("INSERT INTO admins(username,password_hash) VALUES('admin',?1)", [hash(&pw)]).ok()?;
    Some(pw)
}

/// Signed-in panel user: (id, role) where role is "admin" or "reseller".
pub struct Admin(pub i64, pub String);
impl Admin {
    pub fn is_reseller(&self) -> bool {
        self.1 == "reseller"
    }
}

/// Pages a reseller may use; everything else in the API is admin-only.
fn reseller_allowed(path: &str) -> bool {
    ["/api/me", "/api/logout", "/api/password", "/api/dashboard", "/api/lines", "/api/packages", "/api/connections", "/api/credits"]
        .iter()
        .any(|p| path == *p || path.starts_with(&format!("{p}/")))
}

#[async_trait]
impl FromRequestParts<State> for Admin {
    type Rejection = (StatusCode, String);
    async fn from_request_parts(parts: &mut Parts, st: &State) -> Result<Self, Self::Rejection> {
        let token = cookie(&parts.headers, "mdx_session").ok_or((StatusCode::UNAUTHORIZED, "Please sign in".into()))?;
        let row: Option<(i64, String)> = st
            .db
            .lock()
            .query_row(
                "SELECT a.id, a.role FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token=?1 AND s.expires>?2 AND a.enabled=1",
                rusqlite::params![token, db::now()],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .ok()
            .flatten();
        let (id, role) = row.ok_or((StatusCode::UNAUTHORIZED, "Please sign in".into()))?;
        if role == "reseller" && !reseller_allowed(parts.uri.path()) {
            return Err((StatusCode::FORBIDDEN, "Resellers cannot open this page".into()));
        }
        Ok(Admin(id, role))
    }
}
fn cookie(h: &HeaderMap, name: &str) -> Option<String> {
    h.get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .filter_map(|kv| kv.trim().split_once('='))
        .find(|(k, _)| *k == name)
        .map(|(_, v)| v.to_string())
}

async fn login(S(st): S<State>, Json(b): Json<Value>) -> Response {
    let (u, p) = (b["username"].as_str().unwrap_or(""), b["password"].as_str().unwrap_or(""));
    let row: Option<(i64, String)> = st
        .db
        .lock()
        .query_row("SELECT id,password_hash FROM admins WHERE username=?1 AND enabled=1", [u], |r| Ok((r.get(0)?, r.get(1)?)))
        .optional()
        .ok()
        .flatten();
    match row {
        Some((id, h)) if verify(p, &h) => {
            let token = random_text(40);
            let _ = st.db.lock().execute(
                "INSERT INTO sessions(token,admin_id,expires) VALUES(?1,?2,?3)",
                rusqlite::params![token, id, db::now() + 30 * 86400],
            );
            (
                [(header::SET_COOKIE, format!("mdx_session={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000"))],
                Json(json!({"ok": true})),
            )
                .into_response()
        }
        _ => (StatusCode::UNAUTHORIZED, "Wrong username or password").into_response(),
    }
}
async fn logout(S(st): S<State>, h: HeaderMap) -> Response {
    if let Some(t) = cookie(&h, "mdx_session") {
        let _ = st.db.lock().execute("DELETE FROM sessions WHERE token=?1", [t]);
    }
    ([(header::SET_COOKIE, "mdx_session=; Path=/; Max-Age=0")], Json(json!({"ok": true}))).into_response()
}
async fn me(S(st): S<State>, a: Admin) -> ApiResult {
    let (name, credits): (String, f64) = st
        .db
        .lock()
        .query_row("SELECT username, credits FROM admins WHERE id=?1", [a.0], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap_or_default();
    Ok(Json(json!({"username": name, "role": a.1, "credits": credits})))
}
async fn change_password(S(st): S<State>, a: Admin, Json(b): Json<Value>) -> ApiResult {
    let (old, new) = (b["old"].as_str().unwrap_or(""), b["new"].as_str().unwrap_or(""));
    if new.len() < 6 {
        return Err(bad("The new password must have at least 6 characters"));
    }
    let h: String = st.db.lock().query_row("SELECT password_hash FROM admins WHERE id=?1", [a.0], |r| r.get(0)).map_err(bad)?;
    if !verify(old, &h) {
        return Err(bad("The current password is wrong"));
    }
    st.db.lock().execute("UPDATE admins SET password_hash=?2 WHERE id=?1", rusqlite::params![a.0, hash(new)]).map_err(bad)?;
    Ok(Json(json!({"ok": true})))
}

/* ------------------------------------------------------------------ generic table helpers */

fn to_sql(v: &Value) -> SqlValue {
    match v {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(*b as i64),
        Value::Number(n) => n.as_i64().map(SqlValue::Integer).unwrap_or_else(|| SqlValue::Real(n.as_f64().unwrap_or(0.0))),
        Value::String(s) => SqlValue::Text(s.clone()),
        other => SqlValue::Text(other.to_string()),
    }
}
fn rows(st: &State, sql: &str, args: Vec<SqlValue>) -> Result<Vec<Value>, (StatusCode, String)> {
    let c = st.db.lock();
    let mut q = c.prepare(sql).map_err(bad)?;
    let cols: Vec<String> = q.column_names().iter().map(|s| s.to_string()).collect();
    let out = q
        .query_map(params_from_iter(args), |r| {
            let mut m = Map::new();
            for (i, name) in cols.iter().enumerate() {
                let v = match r.get_ref(i)? {
                    rusqlite::types::ValueRef::Null => Value::Null,
                    rusqlite::types::ValueRef::Integer(x) => json!(x),
                    rusqlite::types::ValueRef::Real(x) => json!(x),
                    rusqlite::types::ValueRef::Text(t) => json!(String::from_utf8_lossy(t)),
                    rusqlite::types::ValueRef::Blob(_) => Value::Null,
                };
                m.insert(name.clone(), v);
            }
            Ok(Value::Object(m))
        })
        .map_err(bad)?
        .flatten()
        .collect();
    Ok(out)
}
fn insert(st: &State, table: &str, b: &Value, allowed: &[&str], extra: &[(&str, SqlValue)]) -> Result<i64, (StatusCode, String)> {
    let mut cols = vec![];
    let mut vals = vec![];
    for k in allowed {
        if let Some(v) = b.get(*k) {
            cols.push(k.to_string());
            vals.push(to_sql(v));
        }
    }
    for (k, v) in extra {
        cols.push(k.to_string());
        vals.push(v.clone());
    }
    let marks = (1..=cols.len()).map(|i| format!("?{i}")).collect::<Vec<_>>().join(",");
    let c = st.db.lock();
    c.execute(&format!("INSERT INTO {table}({}) VALUES({marks})", cols.join(",")), params_from_iter(vals)).map_err(bad)?;
    Ok(c.last_insert_rowid())
}
fn update(st: &State, table: &str, id: i64, b: &Value, allowed: &[&str]) -> ApiResult {
    let mut sets = vec![];
    let mut vals = vec![];
    for k in allowed {
        if let Some(v) = b.get(*k) {
            vals.push(to_sql(v));
            sets.push(format!("{k}=?{}", vals.len()));
        }
    }
    if sets.is_empty() {
        return Ok(Json(json!({"ok": true})));
    }
    vals.push(SqlValue::Integer(id));
    let sql = format!("UPDATE {table} SET {} WHERE id=?{}", sets.join(","), vals.len());
    st.db.lock().execute(&sql, params_from_iter(vals)).map_err(bad)?;
    Ok(Json(json!({"ok": true})))
}
fn remove(st: &State, table: &str, id: i64) -> ApiResult {
    st.db.lock().execute(&format!("DELETE FROM {table} WHERE id=?1"), [id]).map_err(bad)?;
    Ok(Json(json!({"ok": true})))
}

/* ------------------------------------------------------------------ dashboard */

/// Line ids owned by a reseller (to scope connections).
fn owned_lines(st: &State, owner: i64) -> std::collections::HashSet<i64> {
    let c = st.db.lock();
    let mut q = c.prepare("SELECT id FROM lines WHERE owner_id=?1").unwrap();
    q.query_map([owner], |r| r.get(0)).unwrap().flatten().collect()
}

async fn dashboard(S(st): S<State>, a: Admin, h: HeaderMap) -> ApiResult {
    let now = db::now();
    if a.is_reseller() {
        let mine = owned_lines(&st, a.0);
        let c = st.db.lock();
        let q = |sql: &str| -> i64 { c.query_row(sql, rusqlite::params![a.0, now], |r| r.get(0)).unwrap_or(0) };
        let credits: f64 = c.query_row("SELECT credits FROM admins WHERE id=?1", [a.0], |r| r.get(0)).unwrap_or(0.0);
        return Ok(Json(json!({
            "reseller": true, "credits": credits,
            "lines": q("SELECT COUNT(*) FROM lines WHERE owner_id=?1 AND ?2>0"),
            "lines_active": q("SELECT COUNT(*) FROM lines WHERE owner_id=?1 AND enabled=1 AND (exp_date IS NULL OR exp_date>?2)"),
            "lines_expiring": q("SELECT COUNT(*) FROM lines WHERE owner_id=?1 AND enabled=1 AND exp_date BETWEEN ?2 AND ?2+604800"),
            "connections": st.conns.list().iter().filter(|x| mine.contains(&x.line_id)).count(),
            "server_urls": crate::local_ips().iter().map(|ip| format!("http://{ip}")).collect::<Vec<_>>()
        })));
    }
    let n = |sql: &str| -> i64 { st.db.lock().query_row(sql, [], |r| r.get(0)).unwrap_or(0) };
    let lines_active = st.db.lock().query_row(
        "SELECT COUNT(*) FROM lines WHERE enabled=1 AND (exp_date IS NULL OR exp_date>?1)", [now], |r| r.get::<_, i64>(0)).unwrap_or(0);
    let expiring = st.db.lock().query_row(
        "SELECT COUNT(*) FROM lines WHERE enabled=1 AND exp_date BETWEEN ?1 AND ?2", [now, now + 7 * 86400], |r| r.get::<_, i64>(0)).unwrap_or(0);
    let port = h.get(header::HOST).and_then(|v| v.to_str().ok()).and_then(|v| v.rsplit_once(':')).map(|x| x.1.to_string()).unwrap_or("80".into());
    let recent = rows(&st, "SELECT id,title,poster,year,added FROM movies ORDER BY added DESC LIMIT 8", vec![])?;
    Ok(Json(json!({
        "lines": n("SELECT COUNT(*) FROM lines"), "lines_active": lines_active, "lines_expiring": expiring,
        "live": n("SELECT COUNT(*) FROM live_streams"), "movies": n("SELECT COUNT(*) FROM movies"),
        "series": n("SELECT COUNT(*) FROM series"), "episodes": n("SELECT COUNT(*) FROM episodes"),
        "epg_programs": n("SELECT COUNT(*) FROM epg_programs"),
        "connections": st.conns.list().len(), "uptime": now - st.started,
        "server_urls": crate::local_ips().iter().map(|ip| format!("http://{ip}:{port}")).collect::<Vec<_>>(),
        "local_name": format!("http://{}.local:{port}", crate::discover::MDNS_HOST),
        "server_code": if crate::discover::code_enabled(&st) { crate::discover::server_code(&st) } else { String::new() },
        "scan": st.scan.lock().clone(), "recent_movies": recent
    })))
}

/* ------------------------------------------------------------------ lines (accounts) */

const LINE_COLS: &[&str] = &["username", "password", "exp_date", "max_connections", "enabled", "is_trial", "notes"];
/// What a reseller may change directly (dates/screens only change through paid packages).
const LINE_COLS_RESELLER: &[&str] = &["password", "enabled", "notes"];

struct Package {
    name: String,
    months: i64,
    max_connections: i64,
    credits: f64,
    is_trial: bool,
    trial_hours: i64,
}
fn package(st: &State, id: i64) -> Result<Package, (StatusCode, String)> {
    st.db
        .lock()
        .query_row("SELECT name,months,max_connections,credits,is_trial,trial_hours FROM packages WHERE id=?1 AND enabled=1", [id], |r| {
            Ok(Package { name: r.get(0)?, months: r.get(1)?, max_connections: r.get(2)?, credits: r.get(3)?, is_trial: r.get::<_, i64>(4)? == 1, trial_hours: r.get(5)? })
        })
        .map_err(|_| bad("Choose a package"))
}
impl Package {
    /// New expiry starting from `from` (or now if already expired).
    fn extend(&self, from: Option<i64>) -> i64 {
        let base = from.filter(|e| *e > db::now()).unwrap_or_else(db::now);
        if self.is_trial {
            return base + self.trial_hours * 3600;
        }
        let d = chrono::DateTime::from_timestamp(base, 0).unwrap();
        d.checked_add_months(chrono::Months::new(self.months.max(0) as u32)).unwrap_or(d).timestamp()
    }
}
/// Take credits from a reseller inside a transaction; fails when the balance is too low.
fn charge(st: &State, admin_id: i64, cost: f64, reason: &str) -> Result<f64, (StatusCode, String)> {
    let mut c = st.db.lock();
    let tx = c.transaction().map_err(bad)?;
    let bal: f64 = tx.query_row("SELECT credits FROM admins WHERE id=?1", [admin_id], |r| r.get(0)).map_err(bad)?;
    if bal + 1e-9 < cost {
        return Err(bad(format!("Not enough credits: this costs {cost}, you have {bal}")));
    }
    let nb = bal - cost;
    tx.execute("UPDATE admins SET credits=?2 WHERE id=?1", rusqlite::params![admin_id, nb]).map_err(bad)?;
    tx.execute("INSERT INTO credit_log(admin_id,amount,balance,reason,created) VALUES(?1,?2,?3,?4,?5)", rusqlite::params![admin_id, -cost, nb, reason, db::now()]).map_err(bad)?;
    tx.commit().map_err(bad)?;
    Ok(nb)
}
fn line_owner(st: &State, id: i64) -> Option<i64> {
    st.db.lock().query_row("SELECT owner_id FROM lines WHERE id=?1", [id], |r| r.get::<_, Option<i64>>(0)).ok().flatten()
}
fn own_line(st: &State, a: &Admin, id: i64) -> Result<(), (StatusCode, String)> {
    if a.is_reseller() && line_owner(st, id) != Some(a.0) {
        return Err((StatusCode::FORBIDDEN, "This account belongs to someone else".into()));
    }
    Ok(())
}

async fn lines_list(S(st): S<State>, a: Admin) -> ApiResult {
    let mut v = rows(
        &st,
        "SELECT l.*, p.name AS package, o.username AS owner FROM lines l LEFT JOIN packages p ON p.id=l.package_id
         LEFT JOIN admins o ON o.id=l.owner_id WHERE (?1=0 OR l.owner_id=?1) ORDER BY l.id DESC",
        vec![SqlValue::Integer(if a.is_reseller() { a.0 } else { 0 })],
    )?;
    for l in v.iter_mut() {
        let id = l["id"].as_i64().unwrap_or(0);
        l["active_cons"] = json!(st.conns.count_for(id));
    }
    Ok(Json(Value::Array(v)))
}
async fn lines_add(S(st): S<State>, a: Admin, Json(mut b): Json<Value>) -> ApiResult {
    if b["username"].as_str().unwrap_or("").trim().is_empty() {
        b["username"] = json!(format!("user{}", random_text(5).to_lowercase()));
    }
    if b["password"].as_str().unwrap_or("").is_empty() {
        b["password"] = json!(random_text(8));
    }
    let pkg_id = b["package_id"].as_i64();
    if a.is_reseller() && pkg_id.is_none() {
        return Err(bad("Choose a package"));
    }
    let mut extra: Vec<(&str, SqlValue)> = vec![("created_at", SqlValue::Integer(db::now())), ("owner_id", SqlValue::Integer(a.0))];
    let mut cols: Vec<&str> = if a.is_reseller() { vec!["username", "password", "notes"] } else { LINE_COLS.to_vec() };
    if let Some(pid) = pkg_id {
        let p = package(&st, pid)?;
        if a.is_reseller() {
            let taken: i64 = st.db.lock().query_row("SELECT COUNT(*) FROM lines WHERE username=?1", [b["username"].as_str().unwrap_or("")], |r| r.get(0)).unwrap_or(0);
            if taken > 0 {
                return Err(bad("That username is already taken"));
            }
            if p.credits > 0.0 {
                charge(&st, a.0, p.credits, &format!("New account {} ({})", b["username"].as_str().unwrap_or(""), p.name))?;
            }
        }
        cols.retain(|c| !["exp_date", "max_connections", "is_trial"].contains(c));
        extra.push(("exp_date", SqlValue::Integer(p.extend(None))));
        extra.push(("max_connections", SqlValue::Integer(p.max_connections)));
        extra.push(("is_trial", SqlValue::Integer(p.is_trial as i64)));
        extra.push(("package_id", SqlValue::Integer(pid)));
    }
    let id = insert(&st, "lines", &b, &cols, &extra).map_err(|e| if e.1.contains("UNIQUE") { bad("That username is already taken") } else { e })?;
    Ok(Json(json!({"id": id})))
}
async fn lines_edit(S(st): S<State>, a: Admin, Path(id): Path<i64>, Json(b): Json<Value>) -> ApiResult {
    own_line(&st, &a, id)?;
    let r = update(&st, "lines", id, &b, if a.is_reseller() { LINE_COLS_RESELLER } else { LINE_COLS });
    if b.get("enabled") == Some(&json!(0)) || b.get("password").is_some() {
        st.conns.kick_line(id);
    }
    r
}
/// Extend an account with a package (resellers pay its credits).
async fn lines_extend(S(st): S<State>, a: Admin, Path(id): Path<i64>, Json(b): Json<Value>) -> ApiResult {
    own_line(&st, &a, id)?;
    let p = package(&st, b["package_id"].as_i64().unwrap_or(-1))?;
    let (user, exp): (String, Option<i64>) = st.db.lock().query_row("SELECT username, exp_date FROM lines WHERE id=?1", [id], |r| Ok((r.get(0)?, r.get(1)?))).map_err(bad)?;
    if a.is_reseller() && p.credits > 0.0 {
        charge(&st, a.0, p.credits, &format!("Extend {user} ({})", p.name))?;
    }
    let new_exp = p.extend(exp);
    st.db.lock().execute(
        "UPDATE lines SET exp_date=?2, max_connections=?3, package_id=?4, is_trial=?5, enabled=1 WHERE id=?1",
        rusqlite::params![id, new_exp, p.max_connections, b["package_id"].as_i64(), p.is_trial as i64],
    ).map_err(bad)?;
    Ok(Json(json!({"exp_date": new_exp})))
}
async fn lines_del(S(st): S<State>, a: Admin, Path(id): Path<i64>) -> ApiResult {
    own_line(&st, &a, id)?;
    st.conns.kick_line(id);
    remove(&st, "lines", id)
}

/* ------------------------------------------------------------------ packages, resellers, credits */

const PKG_COLS: &[&str] = &["name", "months", "max_connections", "credits", "is_trial", "trial_hours", "enabled"];
async fn pkg_list(S(st): S<State>, a: Admin) -> ApiResult {
    let sql = if a.is_reseller() { "SELECT * FROM packages WHERE enabled=1 ORDER BY is_trial DESC, months" } else { "SELECT * FROM packages ORDER BY is_trial DESC, months" };
    Ok(Json(Value::Array(rows(&st, sql, vec![])?)))
}
async fn pkg_add(S(st): S<State>, _a: Admin, Json(b): Json<Value>) -> ApiResult {
    Ok(Json(json!({"id": insert(&st, "packages", &b, PKG_COLS, &[])?})))
}
async fn pkg_edit(S(st): S<State>, _a: Admin, Path(id): Path<i64>, Json(b): Json<Value>) -> ApiResult {
    update(&st, "packages", id, &b, PKG_COLS)
}
async fn pkg_del(S(st): S<State>, _a: Admin, Path(id): Path<i64>) -> ApiResult {
    remove(&st, "packages", id)
}

async fn resellers_list(S(st): S<State>, _a: Admin) -> ApiResult {
    Ok(Json(Value::Array(rows(
        &st,
        "SELECT a.id,a.username,a.credits,a.enabled,a.notes,
           (SELECT COUNT(*) FROM lines l WHERE l.owner_id=a.id) AS accounts,
           (SELECT COUNT(*) FROM lines l WHERE l.owner_id=a.id AND l.enabled=1 AND (l.exp_date IS NULL OR l.exp_date>strftime('%s','now'))) AS active
         FROM admins a WHERE a.role='reseller' ORDER BY a.username",
        vec![],
    )?)))
}
async fn resellers_add(S(st): S<State>, a: Admin, Json(b): Json<Value>) -> ApiResult {
    let user = b["username"].as_str().unwrap_or("").trim().to_string();
    let pw = b["password"].as_str().unwrap_or("").to_string();
    if user.is_empty() || pw.len() < 6 {
        return Err(bad("Give a username and a password of at least 6 characters"));
    }
    let credits = b["credits"].as_f64().unwrap_or(0.0);
    let id = {
        let c = st.db.lock();
        c.execute(
            "INSERT INTO admins(username,password_hash,role,credits,notes) VALUES(?1,?2,'reseller',?3,?4)",
            rusqlite::params![user, hash(&pw), credits, b["notes"].as_str().unwrap_or("")],
        )
        .map_err(|e| if e.to_string().contains("UNIQUE") { bad("That username is already taken") } else { bad(e) })?;
        let id = c.last_insert_rowid();
        if credits != 0.0 {
            let _ = c.execute("INSERT INTO credit_log(admin_id,amount,balance,reason,created) VALUES(?1,?2,?2,?3,?4)", rusqlite::params![id, credits, format!("Starting credits (by admin #{})", a.0), db::now()]);
        }
        id
    };
    Ok(Json(json!({"id": id})))
}
async fn resellers_edit(S(st): S<State>, _a: Admin, Path(id): Path<i64>, Json(b): Json<Value>) -> ApiResult {
    if let Some(pw) = b["password"].as_str().filter(|p| !p.is_empty()) {
        if pw.len() < 6 {
            return Err(bad("The password must have at least 6 characters"));
        }
        st.db.lock().execute("UPDATE admins SET password_hash=?2 WHERE id=?1 AND role='reseller'", rusqlite::params![id, hash(pw)]).map_err(bad)?;
        let _ = st.db.lock().execute("DELETE FROM sessions WHERE admin_id=?1", [id]);
    }
    if b.get("enabled") == Some(&json!(0)) {
        let _ = st.db.lock().execute("DELETE FROM sessions WHERE admin_id=?1", [id]);
    }
    update(&st, "admins", id, &b, &["enabled", "notes"])
}
async fn resellers_del(S(st): S<State>, _a: Admin, Path(id): Path<i64>) -> ApiResult {
    let c = st.db.lock();
    let _ = c.execute("UPDATE lines SET owner_id=NULL WHERE owner_id=?1", [id]); // their customers stay, owned by admin
    let _ = c.execute("DELETE FROM sessions WHERE admin_id=?1", [id]);
    c.execute("DELETE FROM admins WHERE id=?1 AND role='reseller'", [id]).map_err(bad)?;
    Ok(Json(json!({"ok": true})))
}
/// Add (or remove, with a negative amount) credits.
async fn resellers_credits(S(st): S<State>, a: Admin, Path(id): Path<i64>, Json(b): Json<Value>) -> ApiResult {
    let amount = b["amount"].as_f64().ok_or(bad("Enter an amount"))?;
    let mut c = st.db.lock();
    let tx = c.transaction().map_err(bad)?;
    let bal: f64 = tx.query_row("SELECT credits FROM admins WHERE id=?1 AND role='reseller'", [id], |r| r.get(0)).map_err(bad)?;
    let nb = (bal + amount).max(0.0);
    tx.execute("UPDATE admins SET credits=?2 WHERE id=?1", rusqlite::params![id, nb]).map_err(bad)?;
    let reason = format!("{} (by admin #{})", b["reason"].as_str().filter(|s| !s.is_empty()).unwrap_or(if amount >= 0.0 { "Credits added" } else { "Credits removed" }), a.0);
    tx.execute("INSERT INTO credit_log(admin_id,amount,balance,reason,created) VALUES(?1,?2,?3,?4,?5)", rusqlite::params![id, nb - bal, nb, reason, db::now()]).map_err(bad)?;
    tx.commit().map_err(bad)?;
    Ok(Json(json!({"credits": nb})))
}
async fn credits_log(S(st): S<State>, a: Admin, Query(q): Query<HashMap<String, String>>) -> ApiResult {
    let who = if a.is_reseller() { a.0 } else { q.get("reseller").and_then(|v| v.parse().ok()).unwrap_or(0) };
    Ok(Json(Value::Array(rows(
        &st,
        "SELECT l.*, a.username FROM credit_log l JOIN admins a ON a.id=l.admin_id WHERE (?1=0 OR l.admin_id=?1) ORDER BY l.id DESC LIMIT 300",
        vec![SqlValue::Integer(who)],
    )?)))
}

/* ------------------------------------------------------------------ categories */

async fn cats_list(S(st): S<State>, _a: Admin, Query(q): Query<HashMap<String, String>>) -> ApiResult {
    let kind = q.get("kind").cloned().unwrap_or_default();
    let v = rows(
        &st,
        "SELECT c.*, CASE c.kind WHEN 'live' THEN (SELECT COUNT(*) FROM live_streams WHERE category_id=c.id)
           WHEN 'movie' THEN (SELECT COUNT(*) FROM movies WHERE category_id=c.id)
           ELSE (SELECT COUNT(*) FROM series WHERE category_id=c.id) END AS items
         FROM categories c WHERE (?1='' OR kind=?1) ORDER BY kind, sort, name",
        vec![SqlValue::Text(kind)],
    )?;
    Ok(Json(Value::Array(v)))
}
async fn cats_add(S(st): S<State>, _a: Admin, Json(b): Json<Value>) -> ApiResult {
    Ok(Json(json!({"id": insert(&st, "categories", &b, &["kind", "name", "sort"], &[])?})))
}
async fn cats_edit(S(st): S<State>, _a: Admin, Path(id): Path<i64>, Json(b): Json<Value>) -> ApiResult {
    update(&st, "categories", id, &b, &["name", "sort"])
}
async fn cats_del(S(st): S<State>, _a: Admin, Path(id): Path<i64>) -> ApiResult {
    for t in ["live_streams", "movies", "series"] {
        let _ = st.db.lock().execute(&format!("UPDATE {t} SET category_id=NULL WHERE category_id=?1"), [id]);
    }
    remove(&st, "categories", id)
}

/* ------------------------------------------------------------------ live channels */

const LIVE_COLS: &[&str] = &["name", "category_id", "source_url", "logo", "epg_channel_id", "sort", "enabled", "profile_id", "archive", "archive_days"];
async fn live_list(S(st): S<State>, _a: Admin) -> ApiResult {
    let mut v = rows(
        &st,
        "SELECT l.*, c.name AS category, p.name AS profile FROM live_streams l LEFT JOIN categories c ON c.id=l.category_id
         LEFT JOIN profiles p ON p.id=l.profile_id ORDER BY l.sort, l.name",
        vec![],
    )?;
    let rec = crate::archive::status(&st);
    for l in v.iter_mut() {
        let id = l["id"].as_i64().unwrap_or(0);
        if let Some(s) = rec.get(&id) {
            l["recording"] = json!(s);
        }
    }
    Ok(Json(Value::Array(v)))
}

/* ------------------------------------------------------------------ transcoding profiles */

const PROFILE_COLS: &[&str] = &["name", "video", "resolution", "video_bitrate", "preset", "audio", "audio_bitrate", "extra"];
async fn profiles_list(S(st): S<State>, _a: Admin) -> ApiResult {
    Ok(Json(Value::Array(rows(&st, "SELECT p.*, (SELECT COUNT(*) FROM live_streams l WHERE l.profile_id=p.id) AS channels FROM profiles p ORDER BY name", vec![])?)))
}
async fn profiles_add(S(st): S<State>, _a: Admin, Json(b): Json<Value>) -> ApiResult {
    Ok(Json(json!({"id": insert(&st, "profiles", &b, PROFILE_COLS, &[])?})))
}
async fn profiles_edit(S(st): S<State>, _a: Admin, Path(id): Path<i64>, Json(b): Json<Value>) -> ApiResult {
    update(&st, "profiles", id, &b, PROFILE_COLS)
}
async fn profiles_del(S(st): S<State>, _a: Admin, Path(id): Path<i64>) -> ApiResult {
    let _ = st.db.lock().execute("UPDATE live_streams SET profile_id=NULL WHERE profile_id=?1", [id]);
    remove(&st, "profiles", id)
}
async fn live_add(S(st): S<State>, _a: Admin, Json(b): Json<Value>) -> ApiResult {
    Ok(Json(json!({"id": insert(&st, "live_streams", &b, LIVE_COLS, &[("added", SqlValue::Integer(db::now()))])?})))
}
async fn live_edit(S(st): S<State>, _a: Admin, Path(id): Path<i64>, Json(b): Json<Value>) -> ApiResult {
    update(&st, "live_streams", id, &b, LIVE_COLS)
}
async fn live_del(S(st): S<State>, _a: Admin, Path(id): Path<i64>) -> ApiResult {
    remove(&st, "live_streams", id)
}
/// Import channels from M3U text or an M3U URL (#EXTINF with tvg-id / tvg-logo / group-title).
async fn live_import(S(st): S<State>, _a: Admin, Json(b): Json<Value>) -> ApiResult {
    let mut text = b["text"].as_str().unwrap_or("").to_string();
    if let Some(url) = b["url"].as_str().filter(|u| !u.is_empty()) {
        text = st.http.get(url).send().await.map_err(bad)?.text().await.map_err(bad)?;
    }
    if !text.contains("#EXTINF") {
        return Err(bad("This is not an M3U playlist"));
    }
    let attr = |line: &str, key: &str| -> String {
        line.find(&format!("{key}=\"")).map(|i| {
            let rest = &line[i + key.len() + 2..];
            rest[..rest.find('"').unwrap_or(rest.len())].to_string()
        }).unwrap_or_default()
    };
    let mut added = 0;
    let mut pending: Option<(String, String, String, String)> = None;
    for raw in text.lines() {
        let line = raw.trim();
        if line.starts_with("#EXTINF") {
            let name = line.rsplit_once(',').map(|x| x.1.trim().to_string()).unwrap_or_default();
            pending = Some((name, attr(line, "tvg-id"), attr(line, "tvg-logo"), attr(line, "group-title")));
        } else if !line.is_empty() && !line.starts_with('#') {
            if let Some((name, tvg, logo, group)) = pending.take() {
                let c = st.db.lock();
                let cat = db::category_id(&c, "live", if group.is_empty() { "Live TV" } else { &group }).ok();
                let _ = c.execute(
                    "INSERT INTO live_streams(name,category_id,source_url,logo,epg_channel_id,added) VALUES(?1,?2,?3,?4,?5,?6)",
                    rusqlite::params![if name.is_empty() { "Channel".to_string() } else { name }, cat, line, logo, tvg, db::now()],
                );
                added += 1;
            }
        }
    }
    Ok(Json(json!({"added": added})))
}

/* ------------------------------------------------------------------ movies / series */

const MOVIE_COLS: &[&str] = &["title", "category_id", "year", "plot", "poster", "backdrop", "rating", "genre", "cast_list", "director", "trailer", "enabled"];
async fn movies_list(S(st): S<State>, _a: Admin, Query(q): Query<HashMap<String, String>>) -> ApiResult {
    let search = format!("%{}%", q.get("q").cloned().unwrap_or_default());
    Ok(Json(Value::Array(rows(
        &st,
        "SELECT m.id,m.title,m.year,m.poster,m.rating,m.genre,m.ext,m.size,m.path,m.category_id,m.enabled,m.plot,m.backdrop,m.cast_list,m.director,m.trailer,m.tmdb_id,c.name AS category
         FROM movies m LEFT JOIN categories c ON c.id=m.category_id WHERE m.title LIKE ?1 ORDER BY m.added DESC LIMIT 2000",
        vec![SqlValue::Text(search)],
    )?)))
}
async fn movies_edit(S(st): S<State>, _a: Admin, Path(id): Path<i64>, Json(b): Json<Value>) -> ApiResult {
    update(&st, "movies", id, &b, MOVIE_COLS)
}
async fn movies_del(S(st): S<State>, _a: Admin, Path(id): Path<i64>) -> ApiResult {
    remove(&st, "movies", id)
}
/// Forget TMDB data so the next scan looks the title up again (after fixing a wrong title).
async fn movies_refresh(S(st): S<State>, _a: Admin, Path(id): Path<i64>) -> ApiResult {
    let _ = st.db.lock().execute("UPDATE movies SET tmdb_id=NULL WHERE id=?1", [id]);
    scan::start(st.clone());
    Ok(Json(json!({"ok": true})))
}

const SERIES_COLS: &[&str] = &["title", "category_id", "year", "plot", "poster", "backdrop", "rating", "genre", "cast_list", "trailer", "enabled"];
async fn series_list(S(st): S<State>, _a: Admin, Query(q): Query<HashMap<String, String>>) -> ApiResult {
    let search = format!("%{}%", q.get("q").cloned().unwrap_or_default());
    Ok(Json(Value::Array(rows(
        &st,
        "SELECT s.*, c.name AS category, (SELECT COUNT(*) FROM episodes e WHERE e.series_id=s.id) AS episodes,
           (SELECT COUNT(DISTINCT season) FROM episodes e WHERE e.series_id=s.id) AS seasons
         FROM series s LEFT JOIN categories c ON c.id=s.category_id WHERE s.title LIKE ?1 ORDER BY s.updated DESC LIMIT 2000",
        vec![SqlValue::Text(search)],
    )?)))
}
async fn series_edit(S(st): S<State>, _a: Admin, Path(id): Path<i64>, Json(b): Json<Value>) -> ApiResult {
    update(&st, "series", id, &b, SERIES_COLS)
}
async fn series_del(S(st): S<State>, _a: Admin, Path(id): Path<i64>) -> ApiResult {
    remove(&st, "series", id)
}
async fn series_refresh(S(st): S<State>, _a: Admin, Path(id): Path<i64>) -> ApiResult {
    let _ = st.db.lock().execute("UPDATE series SET tmdb_id=NULL WHERE id=?1", [id]);
    scan::start(st.clone());
    Ok(Json(json!({"ok": true})))
}
async fn episodes_list(S(st): S<State>, _a: Admin, Path(id): Path<i64>) -> ApiResult {
    Ok(Json(Value::Array(rows(&st, "SELECT * FROM episodes WHERE series_id=?1 ORDER BY season, episode", vec![SqlValue::Integer(id)])?)))
}
async fn episodes_edit(S(st): S<State>, _a: Admin, Path(id): Path<i64>, Json(b): Json<Value>) -> ApiResult {
    update(&st, "episodes", id, &b, &["season", "episode", "title", "plot", "still"])
}

/* ------------------------------------------------------------------ library / scan / EPG */

async fn lib_list(S(st): S<State>, _a: Admin) -> ApiResult {
    let mut v = rows(&st, "SELECT f.*, c.name AS category FROM library_folders f LEFT JOIN categories c ON c.id=f.category_id ORDER BY f.id", vec![])?;
    for f in v.iter_mut() {
        f["exists"] = json!(std::path::Path::new(f["path"].as_str().unwrap_or("")).is_dir());
    }
    Ok(Json(Value::Array(v)))
}
async fn lib_add(S(st): S<State>, _a: Admin, Json(b): Json<Value>) -> ApiResult {
    let path = b["path"].as_str().unwrap_or("").trim().to_string();
    if !std::path::Path::new(&path).is_dir() {
        return Err(bad("That folder does not exist on the server"));
    }
    Ok(Json(json!({"id": insert(&st, "library_folders", &json!({"path": path, "kind": b["kind"], "category_id": b["category_id"]}), &["path", "kind", "category_id"], &[])?})))
}
async fn lib_del(S(st): S<State>, _a: Admin, Path(id): Path<i64>) -> ApiResult {
    remove(&st, "library_folders", id)
}
async fn scan_start(S(st): S<State>, _a: Admin) -> ApiResult {
    Ok(Json(json!({"started": scan::start(st.clone())})))
}
async fn scan_status(S(st): S<State>, _a: Admin) -> ApiResult {
    Ok(Json(json!(st.scan.lock().clone())))
}
/// Folder picker for the server's disks.
async fn browse(_a: Admin, Query(q): Query<HashMap<String, String>>) -> ApiResult {
    let path = q.get("path").cloned().unwrap_or_default();
    if path.is_empty() {
        let roots: Vec<String> = if cfg!(windows) {
            (b'C'..=b'Z').map(|d| format!("{}:\\", d as char)).filter(|d| std::path::Path::new(d).is_dir()).collect()
        } else {
            vec!["/".into()]
        };
        return Ok(Json(json!({"path": "", "parent": null, "dirs": roots})));
    }
    let p = std::path::PathBuf::from(&path);
    let mut dirs: Vec<String> = std::fs::read_dir(&p)
        .map_err(bad)?
        .flatten()
        .filter(|e| e.path().is_dir())
        .filter_map(|e| e.file_name().to_str().map(String::from))
        .filter(|n| !n.starts_with('.') && !n.starts_with('$'))
        .collect();
    dirs.sort_by_key(|d| d.to_lowercase());
    Ok(Json(json!({"path": p.display().to_string(), "parent": p.parent().map(|x| x.display().to_string()), "dirs": dirs})))
}

async fn epg_list(S(st): S<State>, _a: Admin) -> ApiResult {
    Ok(Json(Value::Array(rows(&st, "SELECT * FROM epg_sources ORDER BY id", vec![])?)))
}
async fn epg_add(S(st): S<State>, _a: Admin, Json(b): Json<Value>) -> ApiResult {
    let id = insert(&st, "epg_sources", &b, &["url"], &[])?;
    let url = b["url"].as_str().unwrap_or("").to_string();
    let st2 = st.clone();
    tokio::spawn(async move { epg::import(&st2, id, &url).await; });
    Ok(Json(json!({"id": id})))
}
async fn epg_del(S(st): S<State>, _a: Admin, Path(id): Path<i64>) -> ApiResult {
    remove(&st, "epg_sources", id)
}
async fn epg_import(S(st): S<State>, _a: Admin) -> ApiResult {
    epg::import_all(&st).await;
    Ok(Json(Value::Array(rows(&st, "SELECT * FROM epg_sources ORDER BY id", vec![])?)))
}

/* ------------------------------------------------------------------ connections / settings */

async fn conns_list(S(st): S<State>, a: Admin) -> ApiResult {
    let mut list = st.conns.list();
    if a.is_reseller() {
        let mine = owned_lines(&st, a.0);
        list.retain(|c| mine.contains(&c.line_id));
    }
    Ok(Json(json!(list)))
}
async fn conns_kick(S(st): S<State>, a: Admin, Path(id): Path<u64>) -> ApiResult {
    if a.is_reseller() {
        let mine = owned_lines(&st, a.0);
        if !st.conns.list().iter().any(|c| c.id == id && mine.contains(&c.line_id)) {
            return Err((StatusCode::FORBIDDEN, "Not your customer".into()));
        }
    }
    Ok(Json(json!({"ok": st.conns.kick(id)})))
}

const SETTINGS: &[(&str, &str)] = &[("server_name", "Mdluex IPTV Server"), ("welcome", ""), ("port", "8080"), ("tmdb_key", ""), ("tmdb_lang", "en-US")];
async fn settings_get(S(st): S<State>, _a: Admin) -> ApiResult {
    let c = st.db.lock();
    let mut m = Map::new();
    for (k, d) in SETTINGS {
        m.insert(k.to_string(), json!(db::setting(&c, k, d)));
    }
    m.insert("data_dir".into(), json!(std::fs::canonicalize(&st.data_dir).map(|p| p.display().to_string()).unwrap_or_default()));
    m.insert("ffmpeg".into(), json!(std::process::Command::new(crate::thumbs::tool("ffmpeg")).arg("-version").output().is_ok()));
    Ok(Json(Value::Object(m)))
}
async fn settings_put(S(st): S<State>, _a: Admin, Json(b): Json<Value>) -> ApiResult {
    let c = st.db.lock();
    for (k, _) in SETTINGS {
        if let Some(v) = b.get(*k) {
            let v = v.as_str().map(String::from).unwrap_or_else(|| v.to_string());
            db::set_setting(&c, k, &v).map_err(bad)?;
        }
    }
    Ok(Json(json!({"ok": true})))
}
/// Quick check that a line works through the real Xtream API (used by the "Test" button).
async fn line_test(S(st): S<State>, _a: Admin, Path(id): Path<i64>) -> ApiResult {
    let (u, p): (String, String) = st.db.lock().query_row("SELECT username,password FROM lines WHERE id=?1", [id], |r| Ok((r.get(0)?, r.get(1)?))).map_err(bad)?;
    let line = xtream::auth(&st, &u, &p).ok_or(bad("not found"))?;
    Ok(Json(json!({"status": line.status(), "active_cons": st.conns.count_for(line.id), "max": line.max_connections})))
}

/* ------------------------------------------------------------------ static panel */

async fn panel_file(Path(path): Path<String>) -> Response {
    asset(&path)
}
async fn panel_index() -> Response {
    asset("index.html")
}
fn asset(path: &str) -> Response {
    let path = if path.is_empty() { "index.html" } else { path };
    match Assets::get(path) {
        Some(f) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            ([(header::CONTENT_TYPE, mime.as_ref().to_string()), (header::CACHE_CONTROL, "no-cache".to_string())], f.data.into_owned()).into_response()
        }
        None => asset("index.html"),
    }
}

pub fn router() -> Router<State> {
    Router::new()
        .route("/", get(|| async { Redirect::temporary("/admin/") }))
        .route("/admin", get(|| async { Redirect::temporary("/admin/") }))
        .route("/admin/", get(panel_index))
        .route("/admin/*path", get(panel_file))
        .route("/api/login", post(login))
        .route("/api/logout", post(logout))
        .route("/api/me", get(me))
        .route("/api/password", post(change_password))
        .route("/api/dashboard", get(dashboard))
        .route("/api/lines", get(lines_list).post(lines_add))
        .route("/api/lines/:id", put(lines_edit).delete(lines_del))
        .route("/api/lines/:id/extend", post(lines_extend))
        .route("/api/lines/:id/test", get(line_test))
        .route("/api/packages", get(pkg_list).post(pkg_add))
        .route("/api/packages/:id", put(pkg_edit).delete(pkg_del))
        .route("/api/resellers", get(resellers_list).post(resellers_add))
        .route("/api/resellers/:id", put(resellers_edit).delete(resellers_del))
        .route("/api/resellers/:id/credits", post(resellers_credits))
        .route("/api/credits", get(credits_log))
        .route("/api/servers", get(crate::balance::servers_list).post(crate::balance::servers_add))
        .route("/api/servers/:id", put(crate::balance::servers_edit).delete(crate::balance::servers_del))
        .route("/api/profiles", get(profiles_list).post(profiles_add))
        .route("/api/profiles/:id", put(profiles_edit).delete(profiles_del))
        .route("/api/categories", get(cats_list).post(cats_add))
        .route("/api/categories/:id", put(cats_edit).delete(cats_del))
        .route("/api/live", get(live_list).post(live_add))
        .route("/api/live/import", post(live_import))
        .route("/api/live/:id", put(live_edit).delete(live_del))
        .route("/api/movies", get(movies_list))
        .route("/api/movies/:id", put(movies_edit).delete(movies_del))
        .route("/api/movies/:id/refresh", post(movies_refresh))
        .route("/api/series", get(series_list))
        .route("/api/series/:id", put(series_edit).delete(series_del))
        .route("/api/series/:id/refresh", post(series_refresh))
        .route("/api/series/:id/episodes", get(episodes_list))
        .route("/api/episodes/:id", put(episodes_edit))
        .route("/api/library", get(lib_list).post(lib_add))
        .route("/api/library/:id", delete(lib_del))
        .route("/api/scan", get(scan_status).post(scan_start))
        .route("/api/browse", get(browse))
        .route("/api/epg", get(epg_list).post(epg_add))
        .route("/api/epg/import", post(epg_import))
        .route("/api/epg/:id", delete(epg_del))
        .route("/api/connections", get(conns_list))
        .route("/api/connections/:id", delete(conns_kick))
        .route("/api/settings", get(settings_get).put(settings_put))
}
