-- Clara knowledge base fixes, prepared 14 Nov 2026.
-- NOT applied automatically: run only after Jake approves (prod data, Clara Supabase).
-- Workspace: Cloud Employee (09aa62df-5af6-4cec-b565-c335e907327d)
--
-- 1. Shortlist promise: "2-3 profiles" / "shortlist within a few days" -> two matched
--    profiles within seven working days (Evidence Bank fact time_to_shortlist).
--    Rows today: 715a28d9, e513f9d8, fddf3725.
-- 2. Pricing: the old "$3,000 to $6,000+" answer (f48254cc) is replaced with the
--    Evidence Bank fee statements copied verbatim (docs/seo/evidence/facts.json:
--    fee_ph, fee_latam, fee_ee at d4e4e8cc). No conversion, no other pricing change.

begin;

create table if not exists qa_pairs_backup_20261114 as
  select * from qa_pairs
  where workspace_id = '09aa62df-5af6-4cec-b565-c335e907327d'
    and (answer ~* '2\s*[-–]\s*3 (matched |vetted )?profiles'
      or answer ~* 'shortlist within a few'
      or id = 'f48254cc-0c96-493a-bb3e-0e91941c177a');

update qa_pairs
set answer = regexp_replace(
      regexp_replace(answer, '2\s*[-–]\s*3 (matched |vetted )?profiles', 'two matched profiles within seven working days', 'gi'),
      '(a )?shortlist within a few (working |business )?days', 'two matched profiles within seven working days', 'gi'),
    updated_at = now()
where workspace_id = '09aa62df-5af6-4cec-b565-c335e907327d'
  and (answer ~* '2\s*[-–]\s*3 (matched |vetted )?profiles' or answer ~* 'shortlist within a few');

update qa_pairs
set answer = 'Rates depend on the role, seniority and where the engineer is based. These are our published bands, exactly as they appear in our evidence bank:

- Philippines: A client pays $4,000 to $6,000 a month for a Philippines engineer, where the engineer falls depending on role and seniority.
- Latin America: LATAM senior band is $6,500-$15,000/month
- Eastern Europe: A client pays Cloud Employee, per month, for an Eastern Europe engineer: junior $4,500 to $5,500, mid $5,500 to $7,000, senior $7,000 to $9,000.

The team confirms the exact quote for your role on a call.

What kind of developer are you looking for?',
    updated_at = now()
where id = 'f48254cc-0c96-493a-bb3e-0e91941c177a'
  and workspace_id = '09aa62df-5af6-4cec-b565-c335e907327d';

-- Check before committing:
select id, question, answer from qa_pairs
where id in (select id from qa_pairs_backup_20261114);

commit;

-- Rollback:
-- update qa_pairs q set answer = b.answer, updated_at = now()
--   from qa_pairs_backup_20261114 b where q.id = b.id;
-- Note: embeddings are not regenerated here. Re-save each changed pair once in the
-- Clara dashboard (Knowledge > edit > save) to re-embed it. The prompt guard in
-- ce-sales-guard.ts already overrides the old wording until then.
