-- Run only against the dedicated spike_s20 database.
DROP TABLE IF EXISTS public.catalog_items CASCADE;
DROP TABLE IF EXISTS public.model_runs CASCADE;
DROP TABLE IF EXISTS public.organizations CASCADE;

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL
);

INSERT INTO public.organizations (id, name) VALUES
  ('00000000-0000-4000-8000-00000000000a', 'Organization A'),
  ('00000000-0000-4000-8000-00000000000b', 'Organization B');

CREATE TABLE public.catalog_items (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  item_key text NOT NULL,
  payload jsonb NOT NULL,
  UNIQUE (organization_id, item_key)
);

CREATE TABLE public.model_runs (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  model text NOT NULL,
  created_at timestamptz NOT NULL,
  input_tokens integer NOT NULL,
  output_tokens integer NOT NULL
);

INSERT INTO public.catalog_items (organization_id, item_key, payload)
SELECT org.id, 'item-' || n, jsonb_build_object('owner', org.name, 'n', n)
FROM public.organizations AS org
CROSS JOIN generate_series(1, 5000) AS n;

INSERT INTO public.model_runs (organization_id, model, created_at, input_tokens, output_tokens)
SELECT org.id, 'mock-model', now() - (n || ' seconds')::interval, 1200, 350
FROM public.organizations AS org
CROSS JOIN generate_series(1, 50000) AS n;

CREATE INDEX catalog_items_org_idx ON public.catalog_items (organization_id, id);
CREATE INDEX model_runs_org_created_idx ON public.model_runs (organization_id, created_at);
ANALYZE public.catalog_items;
ANALYZE public.model_runs;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'spike_s20_app') THEN
    CREATE ROLE spike_s20_app LOGIN PASSWORD 's20-local-only'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;
ALTER ROLE spike_s20_app LOGIN PASSWORD 's20-local-only'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

REVOKE ALL ON DATABASE spike_s20 FROM PUBLIC;
GRANT CONNECT ON DATABASE spike_s20 TO spike_s20_app;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO spike_s20_app;
REVOKE ALL ON public.organizations FROM spike_s20_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_items, public.model_runs TO spike_s20_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO spike_s20_app;

ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.model_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY organization_isolation ON public.catalog_items
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);
CREATE POLICY organization_isolation ON public.model_runs
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);
