import type Database from 'better-sqlite3';
import { DEFAULT_TEAM_ID,LOCAL_OWNER_USER_ID } from './wi8Wi9Schema';

export function ensureOwnershipBootstrapSchema(connection:Database.Database):void{
  connection.exec(`
    CREATE TRIGGER IF NOT EXISTS organisation_default_ownership
    AFTER INSERT ON organisations
    WHEN new.owner_user_id IS NULL OR new.owner_team_id IS NULL
    BEGIN
      UPDATE organisations SET owner_user_id=coalesce(owner_user_id,'${LOCAL_OWNER_USER_ID}'),owner_team_id=coalesce(owner_team_id,'${DEFAULT_TEAM_ID}') WHERE id=new.id;
    END;

    CREATE TRIGGER IF NOT EXISTS engagement_default_ownership
    AFTER INSERT ON engagements
    WHEN new.owner_user_id IS NULL OR new.owner_team_id IS NULL
    BEGIN
      UPDATE engagements SET owner_user_id=coalesce(owner_user_id,'${LOCAL_OWNER_USER_ID}'),owner_team_id=coalesce(owner_team_id,'${DEFAULT_TEAM_ID}') WHERE id=new.id;
    END;

    CREATE TRIGGER IF NOT EXISTS task_default_ownership
    AFTER INSERT ON tasks
    WHEN new.owner_user_id IS NULL OR new.owner_team_id IS NULL
    BEGIN
      UPDATE tasks SET owner_user_id=coalesce(owner_user_id,'${LOCAL_OWNER_USER_ID}'),owner_team_id=coalesce(owner_team_id,'${DEFAULT_TEAM_ID}') WHERE id=new.id;
    END;
  `);
}
