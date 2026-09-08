
-- ROLES
CREATE TYPE public.app_role AS ENUM ('admin','auditor');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), COALESCE(NEW.email,''))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN (SELECT count(*) FROM public.user_roles) = 0 THEN 'admin'::public.app_role ELSE 'auditor'::public.app_role END)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(),'admin')) WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles admin insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "user_roles readable" ON public.user_roles FOR SELECT TO authenticated USING (true);

-- BRANCHES
CREATE TABLE public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name_ar text NOT NULL,
  name_en text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "branches read" ON public.branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "branches admin write" ON public.branches FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.branches (code, name_ar) VALUES
('BR-001','سوديك'),('BR-002','مول العرب'),('BR-003','العلمين'),('BR-004','مراسي'),('BR-005','مكرم'),
('BR-006','دريم'),('BR-007','واترواي'),('BR-008','مدينتي'),('BR-009','الشروق'),('BR-010','المخازن المركزية'),
('BR-011','شيراتون'),('BR-012','التجمع'),('BR-013','سيتي'),('BR-014','زايد'),('BR-015','ديستركت5'),
('BR-016','هايد بارك'),('BR-017','الحجاز'),('BR-018','الحكمة'),('BR-019','دارك ستور الكيت كات'),('BR-020','دارك ستور المعادي'),
('BR-021','دارك ستور زايد'),('BR-022','الدقي'),('BR-023','حسنين'),('BR-024','روكسي'),('BR-025','الجامعة'),
('BR-026','سفنكس'),('BR-027','سوديك إيست'),('BR-028','الطيران'),('BR-029','سوديك سيزر'),('BR-030','معادي2'),
('BR-031','المعادي1');

-- AUDIT TYPES
CREATE TABLE public.audit_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_types TO authenticated;
GRANT ALL ON public.audit_types TO service_role;
ALTER TABLE public.audit_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_types read" ON public.audit_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "audit_types admin write" ON public.audit_types FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.audit_types (code, name_ar, name_en) VALUES ('FS','سلامة الغذاء','Food Safety');

-- SECTIONS
CREATE TABLE public.sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_type_id uuid NOT NULL REFERENCES public.audit_types(id) ON DELETE CASCADE,
  name_ar text NOT NULL,
  name_en text,
  order_index integer NOT NULL DEFAULT 0,
  is_delivery boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (audit_type_id, name_ar)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sections TO authenticated;
GRANT ALL ON public.sections TO service_role;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sections read" ON public.sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "sections admin write" ON public.sections FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- HEADERS
CREATE TABLE public.headers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  label_ar text NOT NULL,
  label_en text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section_id, label_ar)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.headers TO authenticated;
GRANT ALL ON public.headers TO service_role;
ALTER TABLE public.headers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "headers read" ON public.headers FOR SELECT TO authenticated USING (true);
CREATE POLICY "headers admin write" ON public.headers FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- QUESTIONS
CREATE TABLE public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id text UNIQUE NOT NULL,
  audit_type_id uuid NOT NULL REFERENCES public.audit_types(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  header_id uuid REFERENCES public.headers(id) ON DELETE SET NULL,
  text_ar text NOT NULL,
  text_en text,
  max_score integer NOT NULL DEFAULT 4,
  item_order integer NOT NULL DEFAULT 0,
  requires_photo_if_below_max boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated;
GRANT ALL ON public.questions TO service_role;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "questions read" ON public.questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "questions admin write" ON public.questions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- AUDITS
CREATE TABLE public.audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_type_id uuid NOT NULL REFERENCES public.audit_types(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  branch_manager text,
  auditor_id uuid NOT NULL REFERENCES auth.users(id),
  created_by uuid NOT NULL REFERENCES auth.users(id) DEFAULT auth.uid(),
  audit_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audits TO authenticated;
GRANT ALL ON public.audits TO service_role;
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audits read own or admin" ON public.audits FOR SELECT TO authenticated
  USING (auditor_id = auth.uid() OR created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "audits insert" ON public.audits FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "audits update own or admin" ON public.audits FOR UPDATE TO authenticated
  USING (auditor_id = auth.uid() OR created_by = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (auditor_id = auth.uid() OR created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "audits delete own or admin" ON public.audits FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.can_edit_audit(_audit_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.audits a
    WHERE a.id = _audit_id
      AND (a.auditor_id = auth.uid() OR a.created_by = auth.uid() OR public.has_role(auth.uid(),'admin'))
  )
$$;

-- ANSWERS
CREATE TABLE public.audit_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  score integer,
  is_na boolean NOT NULL DEFAULT false,
  comment text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (audit_id, question_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_answers TO authenticated;
GRANT ALL ON public.audit_answers TO service_role;
ALTER TABLE public.audit_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "answers access" ON public.audit_answers FOR ALL TO authenticated
  USING (public.can_edit_audit(audit_id)) WITH CHECK (public.can_edit_audit(audit_id));

-- SECTION STATUS (section-level N/A)
CREATE TABLE public.audit_section_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  is_na boolean NOT NULL DEFAULT false,
  UNIQUE (audit_id, section_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_section_status TO authenticated;
GRANT ALL ON public.audit_section_status TO service_role;
ALTER TABLE public.audit_section_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "section status access" ON public.audit_section_status FOR ALL TO authenticated
  USING (public.can_edit_audit(audit_id)) WITH CHECK (public.can_edit_audit(audit_id));

-- DEDUCTIONS
CREATE TABLE public.audit_section_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  reason_text text NOT NULL DEFAULT '',
  percentage numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_section_deductions TO authenticated;
GRANT ALL ON public.audit_section_deductions TO service_role;
ALTER TABLE public.audit_section_deductions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "section deductions access" ON public.audit_section_deductions FOR ALL TO authenticated
  USING (public.can_edit_audit(audit_id)) WITH CHECK (public.can_edit_audit(audit_id));

CREATE TABLE public.audit_general_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  reason_text text NOT NULL DEFAULT '',
  percentage numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_general_deductions TO authenticated;
GRANT ALL ON public.audit_general_deductions TO service_role;
ALTER TABLE public.audit_general_deductions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "general deductions access" ON public.audit_general_deductions FOR ALL TO authenticated
  USING (public.can_edit_audit(audit_id)) WITH CHECK (public.can_edit_audit(audit_id));

-- PHOTOS
CREATE TABLE public.photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.photos TO authenticated;
GRANT ALL ON public.photos TO service_role;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "photos access" ON public.photos FOR ALL TO authenticated
  USING (public.can_edit_audit(audit_id)) WITH CHECK (public.can_edit_audit(audit_id));

-- REPORTS
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  pdf_path text,
  docx_path text,
  generated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports access" ON public.reports FOR ALL TO authenticated
  USING (public.can_edit_audit(audit_id)) WITH CHECK (public.can_edit_audit(audit_id));

-- APP SETTINGS (branding)
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings read" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings admin write" ON public.app_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_questions_section ON public.questions(section_id, item_order);
CREATE INDEX idx_answers_audit ON public.audit_answers(audit_id);
CREATE INDEX idx_photos_audit ON public.photos(audit_id, question_id);
