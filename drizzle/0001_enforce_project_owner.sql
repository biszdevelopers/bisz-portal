CREATE FUNCTION enforce_project_exactly_one_owner() RETURNS trigger AS $$
DECLARE
  checked_project_id uuid;
  owner_count integer;
BEGIN
  IF TG_TABLE_NAME = 'projects' THEN
    checked_project_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    checked_project_id := OLD.project_id;
  ELSE
    checked_project_id := NEW.project_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM projects WHERE id = checked_project_id) THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO owner_count
  FROM project_members
  WHERE project_id = checked_project_id AND role = 'owner';

  IF owner_count <> 1 THEN
    RAISE EXCEPTION 'project % must have exactly one owner', checked_project_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER projects_require_owner
AFTER INSERT OR UPDATE ON projects
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_project_exactly_one_owner();

CREATE CONSTRAINT TRIGGER project_members_require_owner
AFTER INSERT OR UPDATE OR DELETE ON project_members
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_project_exactly_one_owner();
