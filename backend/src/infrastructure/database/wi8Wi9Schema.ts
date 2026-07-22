import type Database from 'better-sqlite3';

export const LOCAL_OWNER_USER_ID='00000000-0000-4000-8000-000000000001';
export const DEFAULT_TEAM_ID='00000000-0000-4000-8000-000000000020';

const ROLE_IDS={
  owner:'00000000-0000-4000-8000-000000000010',
  administrator:'00000000-0000-4000-8000-000000000011',
  manager:'00000000-0000-4000-8000-000000000012',
  member:'00000000-0000-4000-8000-000000000013',
  viewer:'00000000-0000-4000-8000-000000000014',
} as const;

export const WI89_PERMISSIONS=[
  ['crm.read','CRM','Read CRM records'],
  ['crm.write','CRM','Create and update CRM records'],
  ['crm.delete','CRM','Archive or delete CRM records'],
  ['reports.read','Reporting','View reports and dashboards'],
  ['reports.manage','Reporting','Create and manage saved reports and dashboards'],
  ['reports.export','Reporting','Export report data'],
  ['users.manage','Administration','Create, update and disable users'],
  ['roles.manage','Administration','Assign roles and manage permission mappings'],
  ['audit.read','Administration','Review immutable audit events'],
  ['settings.manage','Administration','Change business and system settings'],
  ['operations.manage','Administration','Run maintenance, backup and reconciliation operations'],
] as const;

function hasColumn(connection:Database.Database,table:string,column:string):boolean{
  return (connection.prepare(`PRAGMA table_info(${table})`).all() as Array<{name:string}>).some((entry)=>entry.name===column);
}
function addColumn(connection:Database.Database,table:string,column:string,definition:string):void{
  if(!hasColumn(connection,table,column))connection.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function ensureWi8Wi9Schema(connection:Database.Database):void{
  connection.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(email))>3),
      display_name TEXT NOT NULL CHECK(length(trim(display_name))>0),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','invited','disabled')),
      password_hash TEXT,
      password_salt TEXT,
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT,
      CHECK((password_hash IS NULL AND password_salt IS NULL) OR (password_hash IS NOT NULL AND password_salt IS NOT NULL))
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK(length(trim(name))>0),
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS team_memberships (
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY(team_id,user_id)
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY NOT NULL,
      key TEXT NOT NULL UNIQUE CHECK(length(trim(key))>0),
      name TEXT NOT NULL CHECK(length(trim(name))>0),
      description TEXT,
      system_role INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS permissions (
      key TEXT PRIMARY KEY NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY(role_id,permission_key)
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY(user_id,role_id)
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      revoked_at TEXT,
      ip_address TEXT,
      user_agent TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY NOT NULL,
      actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      organisation_id TEXT REFERENCES organisations(id) ON DELETE SET NULL,
      request_id TEXT NOT NULL,
      route TEXT NOT NULL,
      method TEXT NOT NULL,
      before_json TEXT CHECK(before_json IS NULL OR json_valid(before_json)),
      after_json TEXT CHECK(after_json IS NULL OR json_valid(after_json)),
      metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
      occurred_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saved_reports (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL CHECK(length(trim(name))>0),
      description TEXT,
      report_key TEXT NOT NULL CHECK(report_key IN ('executive','revenue','pipeline','activity','workload','concentration','operations')),
      filters_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(filters_json)),
      visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','team','all')),
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      owner_team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS report_dashboards (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL CHECK(length(trim(name))>0),
      description TEXT,
      visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','team','all')),
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      owner_team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS dashboard_widgets (
      id TEXT PRIMARY KEY NOT NULL,
      dashboard_id TEXT NOT NULL REFERENCES report_dashboards(id) ON DELETE CASCADE,
      widget_key TEXT NOT NULL CHECK(widget_key IN ('executive_kpis','revenue_trend','pipeline_status','activity_mix','workload','concentration','operations')),
      title TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0 CHECK(position>=0),
      config_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(config_json)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(dashboard_id,widget_key,position)
    );

    CREATE TABLE IF NOT EXISTS report_schedules (
      id TEXT PRIMARY KEY NOT NULL,
      saved_report_id TEXT NOT NULL REFERENCES saved_reports(id) ON DELETE CASCADE,
      cadence TEXT NOT NULL CHECK(cadence IN ('daily','weekly','monthly')),
      delivery_mode TEXT NOT NULL DEFAULT 'download_queue' CHECK(delivery_mode IN ('download_queue')),
      enabled INTEGER NOT NULL DEFAULT 1,
      next_run_at TEXT NOT NULL,
      last_run_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS user_status_idx ON users(status,email);
    CREATE INDEX IF NOT EXISTS team_membership_user_idx ON team_memberships(user_id,team_id);
    CREATE INDEX IF NOT EXISTS session_user_expiry_idx ON auth_sessions(user_id,expires_at,revoked_at);
    CREATE INDEX IF NOT EXISTS audit_occurred_idx ON audit_events(occurred_at DESC);
    CREATE INDEX IF NOT EXISTS audit_actor_idx ON audit_events(actor_user_id,occurred_at DESC);
    CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_events(entity_type,entity_id,occurred_at DESC);
    CREATE INDEX IF NOT EXISTS saved_report_owner_idx ON saved_reports(owner_user_id,owner_team_id,updated_at DESC);
    CREATE INDEX IF NOT EXISTS dashboard_owner_idx ON report_dashboards(owner_user_id,owner_team_id,updated_at DESC);
    CREATE INDEX IF NOT EXISTS report_schedule_due_idx ON report_schedules(enabled,next_run_at);

    CREATE TRIGGER IF NOT EXISTS audit_events_immutable_update
    BEFORE UPDATE ON audit_events BEGIN
      SELECT RAISE(ABORT,'Audit events are immutable');
    END;
    CREATE TRIGGER IF NOT EXISTS audit_events_immutable_delete
    BEFORE DELETE ON audit_events BEGIN
      SELECT RAISE(ABORT,'Audit events are immutable');
    END;
  `);

  addColumn(connection,'organisations','owner_user_id','TEXT REFERENCES users(id) ON DELETE SET NULL');
  addColumn(connection,'organisations','owner_team_id','TEXT REFERENCES teams(id) ON DELETE SET NULL');
  addColumn(connection,'engagements','owner_user_id','TEXT REFERENCES users(id) ON DELETE SET NULL');
  addColumn(connection,'engagements','owner_team_id','TEXT REFERENCES teams(id) ON DELETE SET NULL');
  addColumn(connection,'tasks','owner_user_id','TEXT REFERENCES users(id) ON DELETE SET NULL');
  addColumn(connection,'tasks','owner_team_id','TEXT REFERENCES teams(id) ON DELETE SET NULL');

  const timestamp=new Date().toISOString();
  const business=connection.prepare(`SELECT business_name,email FROM settings WHERE id='default'`).get() as {business_name?:string;email?:string}|undefined;
  const ownerEmail=(business?.email&&business.email.includes('@')?business.email:'owner@local.crm').toLowerCase();
  const businessName=business?.business_name||'Local CRM';
  connection.prepare(`INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES(?,?,?,'active',?,?) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,updated_at=excluded.updated_at`).run(LOCAL_OWNER_USER_ID,ownerEmail,businessName,timestamp,timestamp);
  connection.prepare(`INSERT INTO teams(id,name,description,created_at,updated_at) VALUES(?,?,?, ?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,updated_at=excluded.updated_at`).run(DEFAULT_TEAM_ID,businessName,'Default operating team',timestamp,timestamp);
  connection.prepare(`INSERT OR IGNORE INTO team_memberships(team_id,user_id,created_at) VALUES(?,?,?)`).run(DEFAULT_TEAM_ID,LOCAL_OWNER_USER_ID,timestamp);

  const roles=[
    [ROLE_IDS.owner,'owner','Owner','Full control of the local CRM',1],
    [ROLE_IDS.administrator,'administrator','Administrator','User, audit and operational administration',1],
    [ROLE_IDS.manager,'manager','Manager','CRM management, reporting and exports',1],
    [ROLE_IDS.member,'member','Member','CRM read and write access',1],
    [ROLE_IDS.viewer,'viewer','Viewer','Read-only CRM and reporting access',1],
  ] as const;
  const roleStatement=connection.prepare(`INSERT INTO roles(id,key,name,description,system_role,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET name=excluded.name,description=excluded.description,updated_at=excluded.updated_at`);
  for(const role of roles)roleStatement.run(role[0],role[1],role[2],role[3],role[4],timestamp,timestamp);

  const permissionStatement=connection.prepare(`INSERT INTO permissions(key,category,description) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET category=excluded.category,description=excluded.description`);
  for(const permission of WI89_PERMISSIONS)permissionStatement.run(...permission);

  const allPermissions=WI89_PERMISSIONS.map((permission)=>permission[0]);
  const mappings:Record<keyof typeof ROLE_IDS,readonly string[]>={
    owner:allPermissions,
    administrator:allPermissions,
    manager:['crm.read','crm.write','crm.delete','reports.read','reports.manage','reports.export','audit.read'],
    member:['crm.read','crm.write','reports.read'],
    viewer:['crm.read','reports.read'],
  };
  const mappingStatement=connection.prepare(`INSERT OR IGNORE INTO role_permissions(role_id,permission_key,created_at) VALUES(?,?,?)`);
  for(const [roleKey,permissionKeys] of Object.entries(mappings) as Array<[keyof typeof ROLE_IDS,readonly string[]]>)for(const permission of permissionKeys)mappingStatement.run(ROLE_IDS[roleKey],permission,timestamp);
  connection.prepare(`INSERT OR IGNORE INTO user_roles(user_id,role_id,created_at) VALUES(?,?,?)`).run(LOCAL_OWNER_USER_ID,ROLE_IDS.owner,timestamp);

  connection.prepare(`UPDATE organisations SET owner_user_id=?,owner_team_id=? WHERE owner_user_id IS NULL OR owner_team_id IS NULL`).run(LOCAL_OWNER_USER_ID,DEFAULT_TEAM_ID);
  connection.prepare(`UPDATE engagements SET owner_user_id=?,owner_team_id=? WHERE owner_user_id IS NULL OR owner_team_id IS NULL`).run(LOCAL_OWNER_USER_ID,DEFAULT_TEAM_ID);
  connection.prepare(`UPDATE tasks SET owner_user_id=?,owner_team_id=? WHERE owner_user_id IS NULL OR owner_team_id IS NULL`).run(LOCAL_OWNER_USER_ID,DEFAULT_TEAM_ID);

  const dashboardId='00000000-0000-4000-8000-000000000100';
  connection.prepare(`INSERT OR IGNORE INTO report_dashboards(id,name,description,visibility,owner_user_id,owner_team_id,is_default,created_at,updated_at) VALUES(?,'Executive dashboard','Default operating view','all',?,?,1,?,?)`).run(dashboardId,LOCAL_OWNER_USER_ID,DEFAULT_TEAM_ID,timestamp,timestamp);
  const widgetStatement=connection.prepare(`INSERT OR IGNORE INTO dashboard_widgets(id,dashboard_id,widget_key,title,position,config_json,created_at,updated_at) VALUES(?,?,?,?,?,'{}',?,?)`);
  const widgetKeys=['executive_kpis','revenue_trend','pipeline_status','activity_mix','workload','concentration'] as const;
  widgetKeys.forEach((key,index)=>widgetStatement.run(`00000000-0000-4000-8000-${String(200+index).padStart(12,'0')}`,dashboardId,key,key.split('_').map((part)=>part[0].toUpperCase()+part.slice(1)).join(' '),index,timestamp,timestamp));
}
