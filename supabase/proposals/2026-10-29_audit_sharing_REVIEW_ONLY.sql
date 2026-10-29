-- REVIEW ONLY. Not executed. Additive feature; does not enable RLS on existing audit tables.
BEGIN;
CREATE TABLE public.audit_share_groups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
 created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE TABLE public.audit_share_members (
 group_id uuid NOT NULL REFERENCES public.audit_share_groups(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 PRIMARY KEY(group_id,user_id)
);
CREATE INDEX audit_share_members_user_idx ON public.audit_share_members(user_id,group_id);
ALTER TABLE public.audit_share_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_share_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_share_groups,public.audit_share_members FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.audit_share_groups,public.audit_share_members TO service_role;

CREATE FUNCTION public.sqop_share_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id
 WHERE p.id=auth.uid() AND p.active=true AND r.role='admin');
$$;
CREATE FUNCTION public.sqop_audit_sharing_context() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid(); peers jsonb; groups jsonb := '[]'::jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND active=true) THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(DISTINCT other.user_id ORDER BY other.user_id),'[]'::jsonb) INTO peers
 FROM public.audit_share_members own JOIN public.audit_share_members other ON other.group_id=own.group_id
 JOIN public.profiles p ON p.id=other.user_id AND p.active=true
 WHERE own.user_id=actor AND other.user_id<>actor;
 IF public.sqop_share_is_admin() THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'member_ids',
    coalesce((SELECT jsonb_agg(m.user_id ORDER BY m.user_id) FROM public.audit_share_members m WHERE m.group_id=g.id),'[]'::jsonb)) ORDER BY g.created_at,g.id),'[]'::jsonb)
  INTO groups FROM public.audit_share_groups g;
 END IF;
 RETURN jsonb_build_object('peers',peers,'groups',groups);
END $$;
CREATE FUNCTION public.sqop_set_audit_share_group(p_group_id uuid,p_name text,p_member_ids uuid[]) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE gid uuid; ids uuid[];
BEGIN
 IF NOT public.sqop_share_is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 SELECT array_agg(DISTINCT id) INTO ids FROM unnest(p_member_ids) AS id WHERE id IS NOT NULL;
 IF coalesce(cardinality(ids),0)<2 OR p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Choose at least two members and a group name'; END IF;
 IF (SELECT count(*) FROM public.profiles WHERE id=ANY(ids) AND active=true)<>cardinality(ids) THEN RAISE EXCEPTION 'All members must have active accounts'; END IF;
 IF p_group_id IS NULL THEN
  INSERT INTO public.audit_share_groups(name,created_by) VALUES(trim(p_name),auth.uid()) RETURNING id INTO gid;
 ELSE
  SELECT id INTO gid FROM public.audit_share_groups WHERE id=p_group_id FOR UPDATE;
  IF gid IS NULL THEN RAISE EXCEPTION 'Group no longer exists'; END IF;
  UPDATE public.audit_share_groups SET name=trim(p_name) WHERE id=gid;
 END IF;
 DELETE FROM public.audit_share_members WHERE group_id=gid;
 INSERT INTO public.audit_share_members(group_id,user_id) SELECT gid,id FROM unnest(ids) AS id;
 RETURN gid;
END $$;
CREATE FUNCTION public.sqop_delete_audit_share_group(p_group_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT public.sqop_share_is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 DELETE FROM public.audit_share_groups WHERE id=p_group_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Group no longer exists'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.sqop_share_is_admin(),public.sqop_audit_sharing_context(),public.sqop_set_audit_share_group(uuid,text,uuid[]),public.sqop_delete_audit_share_group(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sqop_share_is_admin(),public.sqop_audit_sharing_context(),public.sqop_set_audit_share_group(uuid,text,uuid[]),public.sqop_delete_audit_share_group(uuid) TO authenticated;
-- Exact verified accounts only. The two members have no role changes.
DO $$ BEGIN
 IF (SELECT count(*) FROM public.profiles WHERE active=true AND
   ((id='2735c9c6-07a2-4218-981f-a0467cf28e5b' AND full_name='م عبدالرحمن جمال') OR
    (id='5f508e7b-e372-4951-a191-7db1f219def7' AND full_name='إسلام توفيق')))<>2
 THEN RAISE EXCEPTION 'Verified initial members are missing or inactive; no changes applied'; END IF;
END $$;
INSERT INTO public.audit_share_groups(id,name) VALUES ('36ab7dc8-7f35-4d0b-969d-6d7fdcc01721','عبدالرحمن جمال وإسلام توفيق');
INSERT INTO public.audit_share_members(group_id,user_id) VALUES
 ('36ab7dc8-7f35-4d0b-969d-6d7fdcc01721','2735c9c6-07a2-4218-981f-a0467cf28e5b'),
 ('36ab7dc8-7f35-4d0b-969d-6d7fdcc01721','5f508e7b-e372-4951-a191-7db1f219def7');
COMMIT;
