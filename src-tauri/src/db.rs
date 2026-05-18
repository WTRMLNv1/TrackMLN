use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use chrono::{DateTime, Duration, Local, LocalResult, NaiveDate, TimeZone};
use rusqlite::{params, Connection};

use crate::models::{AppTotal, HourlyData, WeekData, WeekDay};

pub type SharedDb = Arc<Mutex<Connection>>;

pub fn default_db_path(base_dir: impl AsRef<Path>) -> PathBuf {
    base_dir.as_ref().join("trackmln.db")
}

pub fn open_shared_database(path: impl AsRef<Path>) -> Result<SharedDb, String> {
    let path = path.as_ref();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    let connection = Connection::open(path).map_err(|err| err.to_string())?;
    init_schema(&connection).map_err(|err| err.to_string())?;
    Ok(Arc::new(Mutex::new(connection)))
}

pub fn init_schema(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app_identity TEXT,
            exe_name TEXT,
            app_name TEXT NOT NULL,
            start INTEGER NOT NULL,
            end INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app_name TEXT NOT NULL UNIQUE,
            daily_limit INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions(start);
        CREATE INDEX IF NOT EXISTS idx_sessions_app_name ON sessions(app_name);
        ",
    )?;

    ensure_column(connection, "sessions", "app_identity", "TEXT")?;
    ensure_column(connection, "sessions", "exe_name", "TEXT")?;
    Ok(())
}

pub fn log_session(
    connection: &Connection,
    app_identity: Option<&str>,
    exe_name: Option<&str>,
    app_name: &str,
    start: DateTime<Local>,
    end: DateTime<Local>,
) -> rusqlite::Result<()> {
    let duration = end.timestamp() - start.timestamp();
    if duration < 1 {
        return Ok(());
    }

    connection.execute(
        "INSERT INTO sessions (app_identity, exe_name, app_name, start, end) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![app_identity, exe_name, app_name, start.timestamp(), end.timestamp()],
    )?;
    Ok(())
}

fn ensure_column(
    connection: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> rusqlite::Result<()> {
    let mut statement = connection.prepare(&format!("PRAGMA table_info({table})"))?;
    let mut rows = statement.query([])?;

    while let Some(row) = rows.next()? {
        let existing: String = row.get(1)?;
        if existing == column {
            return Ok(());
        }
    }

    connection.execute(
        &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
        [],
    )?;
    Ok(())
}

pub fn get_today_totals(connection: &Connection) -> rusqlite::Result<Vec<AppTotal>> {
    let mut statement = connection.prepare(
        "
        SELECT CASE
                   WHEN COALESCE(TRIM(app_identity), '') != '' THEN app_identity
                   ELSE LOWER(app_name)
               END AS app_identity,
               MIN(app_name) AS app_name,
               COALESCE(SUM(end - start), 0) AS total
        FROM sessions
        WHERE date(start, 'unixepoch', 'localtime') = date('now', 'localtime')
          AND CASE
                  WHEN COALESCE(TRIM(app_identity), '') != '' THEN app_identity
                  ELSE LOWER(app_name)
              END NOT IN ('idle', 'unknown')
        GROUP BY app_identity
        ORDER BY total DESC, app_identity ASC
        ",
    )?;

    let totals = statement
        .query_map([], |row| {
            Ok(AppTotal {
                app_identity: row.get(0)?,
                app_name: row.get(1)?,
                total: row.get(2)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(totals)
}

pub fn get_hourly_today(connection: &Connection) -> rusqlite::Result<Vec<HourlyData>> {
    let mut buckets: Vec<HourlyData> = (0..24)
        .map(|hour| HourlyData { hour, total: 0 })
        .collect();

    let today = Local::now().date_naive();
    let day_start = local_date_to_unix(today, 0, 0, 0);
    let day_end = local_date_to_unix(today, 23, 59, 59);

    let mut statement = connection.prepare(
        "
        SELECT start, end FROM sessions
        WHERE end >= ?1 AND start <= ?2
          AND CASE
                  WHEN COALESCE(TRIM(app_identity), '') != '' THEN app_identity
                  ELSE LOWER(app_name)
              END NOT IN ('idle', 'unknown')
        ",
    )?;

    for row in statement.query_map(params![day_start, day_end], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
    })? {
        let (raw_start, raw_end) = row?;

        // clamp to today's boundaries
        let start = raw_start.max(day_start);
        let end = raw_end.min(day_end + 1);

        // split across hour buckets
        let start_hour = ((start - day_start) / 3600) as usize;
        let end_hour = ((end - day_start - 1).max(0) / 3600) as usize;

        for hour in start_hour..=end_hour {
            if hour >= 24 { break; }
            let bucket_start = day_start + (hour as i64 * 3600);
            let bucket_end = bucket_start + 3600;
            let overlap = end.min(bucket_end) - start.max(bucket_start);
            if overlap > 0 {
                buckets[hour].total += overlap;
            }
        }
    }

    Ok(buckets)
}

pub fn get_goal(connection: &Connection, app_name: &str) -> rusqlite::Result<Option<i64>> {
    let mut statement =
        connection.prepare("SELECT daily_limit FROM goals WHERE app_name = ?1 LIMIT 1")?;
    let mut rows = statement.query(params![app_name])?;
    match rows.next()? {
        Some(row) => Ok(Some(row.get(0)?)),
        None => Ok(None),
    }
}

pub fn set_goal(connection: &Connection, app_name: &str, daily_limit: i64) -> rusqlite::Result<()> {
    connection.execute(
        "
        INSERT INTO goals (app_name, daily_limit)
        VALUES (?1, ?2)
        ON CONFLICT(app_name) DO UPDATE SET daily_limit = excluded.daily_limit
        ",
        params![app_name, daily_limit],
    )?;
    Ok(())
}

pub fn get_today_total_for(connection: &Connection, app_name: &str) -> rusqlite::Result<i64> {
    connection.query_row(
        "
        SELECT COALESCE(SUM(end - start), 0)
        FROM sessions
        WHERE date(start, 'unixepoch', 'localtime') = date('now', 'localtime')
          AND app_name = ?1
        ",
        params![app_name],
        |row| row.get(0),
    )
}

pub fn get_week_dashboard(connection: &Connection) -> rusqlite::Result<WeekData> {
    let today = Local::now().date_naive();
    let week_days: Vec<NaiveDate> = (0..7)
        .map(|offset| today - Duration::days((6 - offset) as i64))
        .collect();
    let week_start = week_days.first().copied().unwrap();
    let week_end = week_days.last().copied().unwrap();
    let last_week_start = week_start - Duration::days(7);
    let last_week_end = week_end - Duration::days(7);

    let mut daily_totals = HashMap::<String, i64>::new();
    let mut daily_apps = HashMap::<String, Vec<AppTotal>>::new();

    let mut day_totals_statement = connection.prepare(
        "
        SELECT date(start, 'unixepoch', 'localtime') AS day,
               COALESCE(SUM(end - start), 0) AS total
        FROM sessions
        WHERE date(start, 'unixepoch', 'localtime') BETWEEN ?1 AND ?2
          AND CASE
                  WHEN COALESCE(TRIM(app_identity), '') != '' THEN app_identity
                  ELSE LOWER(app_name)
              END NOT IN ('idle', 'unknown')
        GROUP BY day
        ORDER BY day ASC
        ",
    )?;

    for row in day_totals_statement.query_map(
        params![week_start.to_string(), week_end.to_string()],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
    )? {
        let (day, total) = row?;
        daily_totals.insert(day, total);
    }

    let mut day_apps_statement = connection.prepare(
        "
        SELECT date(start, 'unixepoch', 'localtime') AS day,
               CASE
                   WHEN COALESCE(TRIM(app_identity), '') != '' THEN app_identity
                   ELSE LOWER(app_name)
               END AS app_identity,
               MIN(app_name) AS app_name,
               COALESCE(SUM(end - start), 0) AS total
        FROM sessions
        WHERE date(start, 'unixepoch', 'localtime') BETWEEN ?1 AND ?2
          AND CASE
                  WHEN COALESCE(TRIM(app_identity), '') != '' THEN app_identity
                  ELSE LOWER(app_name)
              END NOT IN ('idle', 'unknown')
        GROUP BY day, app_identity
        ORDER BY day ASC, total DESC, app_identity ASC
        ",
    )?;

    for row in day_apps_statement.query_map(
        params![week_start.to_string(), week_end.to_string()],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                AppTotal {
                    app_identity: row.get(1)?,
                    app_name: row.get(2)?,
                    total: row.get(3)?,
                },
            ))
        },
    )? {
        let (day, app) = row?;
        daily_apps.entry(day).or_default().push(app);
    }

    let mut week_apps_statement = connection.prepare(
        "
        SELECT CASE
                   WHEN COALESCE(TRIM(app_identity), '') != '' THEN app_identity
                   ELSE LOWER(app_name)
               END AS app_identity,
               MIN(app_name) AS app_name,
               COALESCE(SUM(end - start), 0) AS total
        FROM sessions
        WHERE date(start, 'unixepoch', 'localtime') BETWEEN ?1 AND ?2
          AND CASE
                  WHEN COALESCE(TRIM(app_identity), '') != '' THEN app_identity
                  ELSE LOWER(app_name)
              END NOT IN ('idle', 'unknown')
        GROUP BY app_identity
        ORDER BY total DESC, app_identity ASC
        ",
    )?;

    let week_apps: Vec<AppTotal> = week_apps_statement
        .query_map(
            params![week_start.to_string(), week_end.to_string()],
            |row| {
                Ok(AppTotal {
                    app_identity: row.get(0)?,
                    app_name: row.get(1)?,
                    total: row.get(2)?,
                })
            },
        )?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let previous_week_total: i64 = connection.query_row(
        "
        SELECT COALESCE(SUM(end - start), 0)
        FROM sessions
        WHERE date(start, 'unixepoch', 'localtime') BETWEEN ?1 AND ?2
          AND CASE
                  WHEN COALESCE(TRIM(app_identity), '') != '' THEN app_identity
                  ELSE LOWER(app_name)
              END NOT IN ('idle', 'unknown')
        ",
        params![last_week_start.to_string(), last_week_end.to_string()],
        |row| row.get(0),
    )?;

    let days: Vec<WeekDay> = week_days
        .iter()
        .map(|day| {
            let key = day.to_string();
            WeekDay {
                date: key.clone(),
                total: *daily_totals.get(&key).unwrap_or(&0),
                apps: daily_apps.remove(&key).unwrap_or_default(),
            }
        })
        .collect();

    let week_total = days.iter().map(|day| day.total).sum::<i64>();

    Ok(WeekData {
        days,
        apps: week_apps.clone(),
        week_total,
        current_week_average: week_total as f64 / 7.0,
        previous_week_average: previous_week_total as f64 / 7.0,
        top_app: week_apps.first().cloned(),
    })
}

pub fn unix_to_local(timestamp: i64) -> Option<DateTime<Local>> {
    Some(DateTime::from_timestamp(timestamp, 0)?.with_timezone(&Local))
}

pub fn local_date_to_unix(date: NaiveDate, hour: u32, minute: u32, second: u32) -> i64 {
    let naive = date
        .and_hms_opt(hour, minute, second)
        .expect("valid test timestamp");
    match Local.from_local_datetime(&naive) {
        LocalResult::Single(dt) => dt.timestamp(),
        LocalResult::Ambiguous(dt, _) => dt.timestamp(),
        LocalResult::None => panic!("invalid local datetime for test data"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_connection() -> Connection {
        let connection = Connection::open_in_memory().expect("in-memory db");
        init_schema(&connection).expect("schema init");
        connection
    }

    #[test]
    fn ignores_subsecond_sessions() {
        let connection = test_connection();
        let start = Local::now();
        let end = start + Duration::milliseconds(500);

        log_session(&connection, None, None, "Chrome", start, end).expect("session write");

        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0))
            .expect("count rows");
        assert_eq!(count, 0);
    }

    #[test]
    fn computes_today_totals_and_hourly_buckets() {
        let connection = test_connection();
        let today = Local::now().date_naive();
        let start = unix_to_local(local_date_to_unix(today, 9, 0, 0)).unwrap();
        let end = unix_to_local(local_date_to_unix(today, 9, 30, 0)).unwrap();
        let start_2 = unix_to_local(local_date_to_unix(today, 10, 0, 0)).unwrap();
        let end_2 = unix_to_local(local_date_to_unix(today, 10, 15, 0)).unwrap();

        log_session(&connection, None, None, "Chrome", start, end).expect("session write");
        log_session(&connection, None, None, "Chrome", start_2, end_2).expect("session write");

        let totals = get_today_totals(&connection).expect("today totals");
        assert_eq!(
            totals,
            vec![AppTotal {
                app_identity: "chrome".into(),
                app_name: "Chrome".into(),
                total: 2_700
            }]
        );

        let hourly = get_hourly_today(&connection).expect("hourly totals");
        assert_eq!(hourly[9].total, 1_800);
        assert_eq!(hourly[10].total, 900);
    }

    #[test]
    fn computes_week_dashboard() {
        let connection = test_connection();
        let today = Local::now().date_naive();
        let this_week_day = today - Duration::days(1);
        let last_week_day = today - Duration::days(8);

        let this_start = unix_to_local(local_date_to_unix(this_week_day, 14, 0, 0)).unwrap();
        let this_end = unix_to_local(local_date_to_unix(this_week_day, 15, 0, 0)).unwrap();
        let last_start = unix_to_local(local_date_to_unix(last_week_day, 14, 0, 0)).unwrap();
        let last_end = unix_to_local(local_date_to_unix(last_week_day, 14, 30, 0)).unwrap();

        log_session(&connection, None, None, "VS Code", this_start, this_end).expect("session write");
        log_session(&connection, None, None, "VS Code", last_start, last_end).expect("session write");

        let dashboard = get_week_dashboard(&connection).expect("week dashboard");
        assert_eq!(dashboard.week_total, 3_600);
        assert_eq!(dashboard.previous_week_average, 1800.0 / 7.0);
        assert_eq!(
            dashboard.top_app,
            Some(AppTotal {
                app_identity: "vs code".into(),
                app_name: "VS Code".into(),
                total: 3_600
            })
        );
    }
}
