-- Run after migration + demo seed as postgres, ONLY on a disposable database.
-- Claims are simulated at the trusted SQL boundary, not through an HTTP client.
begin;
create function pg_temp.assert_true(p_value boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_value is distinct from true then raise exception 'FAIL: %', p_label; end if;
  raise notice 'PASS: %', p_label;
end;
$$;
create function pg_temp.expect_error(p_statement text, p_state text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_statement;
  exception when others then
    if sqlstate <> p_state then raise exception 'FAIL: % (expected %, got %: %)', p_label, p_state, sqlstate, sqlerrm; end if;
    raise notice 'PASS: %', p_label;
    return;
  end;
  raise exception 'FAIL: % (statement unexpectedly succeeded)', p_label;
end;
$$;

insert into auth.users(id, email, email_confirmed_at) values
  ('10000000-0000-0000-0000-000000000001', 'Member1@Example.Invalid', now()),
  ('10000000-0000-0000-0000-000000000002', 'member2@example.invalid', now()),
  ('10000000-0000-0000-0000-000000000003', 'member3@example.invalid', now()),
  ('10000000-0000-0000-0000-000000000005', 'member5@example.invalid', null),
  ('10000000-0000-0000-0000-000000000099', 'outsider@example.invalid', now()),
  ('10000000-0000-0000-0000-000000000098', 'member1@example.invalid', now());

select pg_temp.assert_true((select count(*) = 4 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('members', 'expense_tabs', 'expenses', 'expense_shares') and c.relrowsecurity), 'RLS enabled on every app table');

set local role anon;
select pg_temp.expect_error('select * from public.members', '42501', 'anonymous cannot read members');
select pg_temp.expect_error('select * from public.expense_tabs', '42501', 'anonymous cannot read tabs');
select pg_temp.expect_error('select * from public.expenses', '42501', 'anonymous cannot read expenses');
select pg_temp.expect_error('select * from public.expense_shares', '42501', 'anonymous cannot read shares');
select pg_temp.expect_error('select public.link_current_member()', '42501', 'anonymous cannot link a member');
select pg_temp.expect_error('select public.mark_paid(''00000000-0000-0000-0000-000000000302'')', '42501', 'anonymous cannot invoke payment RPC');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000099","email":"member1@example.invalid"}', true);
select pg_temp.assert_true((select count(*) = 0 from public.members), 'non-member sees no members');
select pg_temp.assert_true((select count(*) = 0 from public.expense_tabs), 'non-member sees no tabs');
select pg_temp.assert_true((select count(*) = 0 from public.expenses), 'non-member sees no expenses');
select pg_temp.assert_true((select count(*) = 0 from public.expense_shares), 'non-member sees no shares');
select pg_temp.expect_error('select public.link_current_member()', '42501', 'forged JWT email cannot link an outsider');
select pg_temp.expect_error('select public.create_expense_tab(''forbidden'')', '42501', 'non-member cannot create tabs');
select pg_temp.expect_error('select public.save_expense(null, null, null, null, null, null, null)', '42501', 'non-member cannot save expenses');
select pg_temp.expect_error('select public.delete_expense(''00000000-0000-0000-0000-000000000201'')', '42501', 'non-member cannot delete expenses');
select pg_temp.expect_error('select public.mark_paid(''00000000-0000-0000-0000-000000000302'')', '42501', 'non-member cannot mark paid');
select pg_temp.expect_error('select public.confirm_received(''00000000-0000-0000-0000-000000000302'')', '42501', 'non-member cannot confirm');
select pg_temp.expect_error('select private.allocate_shares(1, null, ''equal'', ''[]'')', '42501', 'allocation helper is not client-callable');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005"}', true);
select pg_temp.expect_error('select public.link_current_member()', '42501', 'unverified allowlisted email cannot link');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001"}', true);
select pg_temp.assert_true((select count(*) = 0 from public.members), 'allowlisted but unlinked user has no table access');
select pg_temp.assert_true(public.link_current_member() = '00000000-0000-0000-0000-000000000001', 'verified email links first login case-insensitively');
select pg_temp.assert_true(public.link_current_member() = '00000000-0000-0000-0000-000000000001', 'member linking is idempotent');
select pg_temp.assert_true((select count(*) = 5 from public.members), 'linked member can read all five members');
select pg_temp.assert_true((select count(*) = 2 from public.expenses), 'linked member can read both seeded expenses');
select pg_temp.assert_true((select bool_and(amount_cents = 100000) from public.expense_shares), 'seed matches both spreadsheet examples');
select pg_temp.assert_true((select bool_and(status = 'settled') from public.expense_shares where member_id = '00000000-0000-0000-0000-000000000001'), 'payee own shares are settled');
select pg_temp.expect_error('select public.confirm_received(''00000000-0000-0000-0000-000000000302'')', 'P0001', 'payee cannot confirm before payor marks paid');
select pg_temp.expect_error('select public.mark_paid(''00000000-0000-0000-0000-000000000302'')', '42501', 'payee cannot mark another member paid');
select pg_temp.expect_error('update public.expense_shares set payor_marked_paid = true', '42501', 'member cannot directly change paid flags');
select pg_temp.expect_error('update public.expense_shares set payee_confirmed = true', '42501', 'member cannot directly change confirmed flags');
select pg_temp.expect_error('insert into public.members(name, email) values (''Injected'', ''x@example.invalid'')', '42501', 'member cannot expand allowlist');
select pg_temp.expect_error('update public.members set auth_user_id = null', '42501', 'member cannot relink identities directly');
select pg_temp.expect_error('insert into public.expense_shares(expense_id, member_id, amount_cents) values (''00000000-0000-0000-0000-000000000201'', ''00000000-0000-0000-0000-000000000003'', 0)', '42501', 'direct share inserts blocked');
select pg_temp.expect_error('delete from public.expense_shares', '42501', 'direct share deletion blocked');
select pg_temp.expect_error('update public.expenses set total_cents = 1', '42501', 'direct expense update blocked');
select pg_temp.expect_error('delete from public.expenses', '42501', 'direct expense deletion blocked');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000098"}', true);
select pg_temp.expect_error('select public.link_current_member()', '42501', 'second identity cannot take an already linked email');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002"}', true);
select public.link_current_member();
select pg_temp.expect_error('select public.confirm_received(''00000000-0000-0000-0000-000000000302'')', '42501', 'payor cannot confirm for payee');
select public.mark_paid('00000000-0000-0000-0000-000000000302');
select public.mark_paid('00000000-0000-0000-0000-000000000302');
select pg_temp.assert_true((select status = 'awaiting-confirmation' from public.expense_shares where id = '00000000-0000-0000-0000-000000000302'), 'mark paid is idempotent and awaits confirmation');
select pg_temp.expect_error('select public.mark_paid(''00000000-0000-0000-0000-000000000305'')', '42501', 'payor cannot mark another payor paid');
select pg_temp.expect_error('select public.delete_expense(''00000000-0000-0000-0000-000000000201'')', '42501', 'participant cannot delete someone else expense');
select pg_temp.expect_error($test$select public.save_expense('00000000-0000-0000-0000-000000000101', 'Unauthorized edit', 1, 'USD', '00000000-0000-0000-0000-000000000001', 'equal', '[{"member_id":"00000000-0000-0000-0000-000000000002"}]', '00000000-0000-0000-0000-000000000201')$test$, '42501', 'participant cannot edit someone else expense');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003"}', true);
select public.link_current_member();
select pg_temp.expect_error('select public.confirm_received(''00000000-0000-0000-0000-000000000302'')', '42501', 'unrelated member cannot confirm');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001"}', true);
select public.confirm_received('00000000-0000-0000-0000-000000000302');
select public.confirm_received('00000000-0000-0000-0000-000000000302');
select pg_temp.assert_true((select status = 'settled' from public.expense_shares where id = '00000000-0000-0000-0000-000000000302'), 'payee confirmation settles and is idempotent');

select public.save_expense('00000000-0000-0000-0000-000000000101', 'Description only', 200000, 'USD', '00000000-0000-0000-0000-000000000001', 'equal',
  '[{"member_id":"00000000-0000-0000-0000-000000000002"},{"member_id":"00000000-0000-0000-0000-000000000001"}]', '00000000-0000-0000-0000-000000000201');
select pg_temp.assert_true((select status = 'settled' from public.expense_shares where id = '00000000-0000-0000-0000-000000000302'), 'metadata-only edit preserves confirmations and share IDs');
select public.save_expense('00000000-0000-0000-0000-000000000101', 'Amount changed', 10000, 'USD', '00000000-0000-0000-0000-000000000001', 'equal',
  '[{"member_id":"00000000-0000-0000-0000-000000000001"},{"member_id":"00000000-0000-0000-0000-000000000002"},{"member_id":"00000000-0000-0000-0000-000000000003"}]', '00000000-0000-0000-0000-000000000201');
select pg_temp.assert_true((select amount_cents = 3334 and status = 'settled' from public.expense_shares where expense_id = '00000000-0000-0000-0000-000000000201' and member_id = '00000000-0000-0000-0000-000000000001'), 'participating payee receives rounding cent and own share stays settled');
select pg_temp.assert_true((select bool_and(not payor_marked_paid and not payee_confirmed) from public.expense_shares where expense_id = '00000000-0000-0000-0000-000000000201' and member_id <> '00000000-0000-0000-0000-000000000001'), 'amount/participant edit resets other payment flags');
select pg_temp.expect_error('select public.confirm_received(''00000000-0000-0000-0000-000000000302'')', '42501', 'stale share ID cannot confirm an edited split');

-- Use transaction-local settings to carry generated IDs between role changes.
select set_config('test.expense_id', public.save_expense('00000000-0000-0000-0000-000000000101', 'Payee outside split', 2, 'USD', '00000000-0000-0000-0000-000000000001', 'equal',
  '[{"member_id":"00000000-0000-0000-0000-000000000004"},{"member_id":"00000000-0000-0000-0000-000000000002"},{"member_id":"00000000-0000-0000-0000-000000000003"}]')::text, true);
select pg_temp.assert_true((select array_agg(amount_cents order by member_id) = array[1,1,0]::bigint[] from public.expense_shares where expense_id = current_setting('test.expense_id')::uuid), 'absent payee remainder spreads in stable member ID order');
select pg_temp.assert_true((select count(*) = 0 from public.expense_shares where expense_id = current_setting('test.expense_id')::uuid and member_id = '00000000-0000-0000-0000-000000000001'), 'payee is never forced to participate');

-- Prove amount-only, participant-only, currency-only, and payee-only resets.
-- This helper runs as the current test role and uses only the public payment RPCs.
create function pg_temp.settle_test_share() returns void language plpgsql as $$
declare share_id uuid;
begin
  select id into share_id from public.expense_shares
    where expense_id = current_setting('test.expense_id')::uuid and member_id = '00000000-0000-0000-0000-000000000002';
  perform set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002"}', true);
  perform public.mark_paid(share_id);
  perform set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001"}', true);
  perform public.confirm_received(share_id);
end;
$$;
select pg_temp.settle_test_share();
select public.save_expense('00000000-0000-0000-0000-000000000101', 'Amount only', 3, 'USD', '00000000-0000-0000-0000-000000000001', 'equal',
  '[{"member_id":"00000000-0000-0000-0000-000000000002"},{"member_id":"00000000-0000-0000-0000-000000000003"},{"member_id":"00000000-0000-0000-0000-000000000004"}]', current_setting('test.expense_id')::uuid);
select pg_temp.assert_true((select bool_and(not payor_marked_paid and not payee_confirmed) from public.expense_shares where expense_id = current_setting('test.expense_id')::uuid), 'amount-only edit resets confirmations');
select pg_temp.settle_test_share();
select public.save_expense('00000000-0000-0000-0000-000000000101', 'Participants only', 3, 'USD', '00000000-0000-0000-0000-000000000001', 'equal',
  '[{"member_id":"00000000-0000-0000-0000-000000000002"},{"member_id":"00000000-0000-0000-0000-000000000003"}]', current_setting('test.expense_id')::uuid);
select pg_temp.assert_true((select count(*) = 2 and bool_and(not payor_marked_paid and not payee_confirmed) from public.expense_shares where expense_id = current_setting('test.expense_id')::uuid), 'participants-only edit resets confirmations');
select pg_temp.settle_test_share();
select public.save_expense('00000000-0000-0000-0000-000000000101', 'Currency only', 3, 'MXN', '00000000-0000-0000-0000-000000000001', 'equal',
  '[{"member_id":"00000000-0000-0000-0000-000000000002"},{"member_id":"00000000-0000-0000-0000-000000000003"}]', current_setting('test.expense_id')::uuid);
select pg_temp.assert_true((select bool_and(not payor_marked_paid and not payee_confirmed) from public.expense_shares where expense_id = current_setting('test.expense_id')::uuid), 'currency-only edit resets confirmations');
select pg_temp.settle_test_share();
select public.save_expense('00000000-0000-0000-0000-000000000101', 'Payee only', 3, 'MXN', '00000000-0000-0000-0000-000000000003', 'equal',
  '[{"member_id":"00000000-0000-0000-0000-000000000002"},{"member_id":"00000000-0000-0000-0000-000000000003"}]', current_setting('test.expense_id')::uuid);
select pg_temp.assert_true((select not payor_marked_paid and not payee_confirmed from public.expense_shares where expense_id = current_setting('test.expense_id')::uuid and member_id = '00000000-0000-0000-0000-000000000002'), 'payee-only edit resets payor flags');
select pg_temp.assert_true((select status = 'settled' from public.expense_shares where expense_id = current_setting('test.expense_id')::uuid and member_id = '00000000-0000-0000-0000-000000000003'), 'new payee own share is settled');
select pg_temp.expect_error($test$select public.confirm_received((select id from public.expense_shares where expense_id = current_setting('test.expense_id')::uuid and member_id = '00000000-0000-0000-0000-000000000002'))$test$, '42501', 'previous payee loses confirmation authority');

select pg_temp.expect_error($test$select public.save_expense('00000000-0000-0000-0000-000000000101', 'Duplicate', 1, 'USD', '00000000-0000-0000-0000-000000000001', 'equal', '[{"member_id":"00000000-0000-0000-0000-000000000002"},{"member_id":"00000000-0000-0000-0000-000000000002"}]')$test$, 'P0001', 'RPC rejects duplicate participants');
select pg_temp.expect_error($test$select public.save_expense('00000000-0000-0000-0000-000000000101', 'Empty', 1, 'USD', '00000000-0000-0000-0000-000000000001', 'equal', '[]')$test$, 'P0001', 'RPC rejects empty participants');
select pg_temp.expect_error($test$select public.save_expense('00000000-0000-0000-0000-000000000101', 'Unknown member', 1, 'USD', '00000000-0000-0000-0000-000000000001', 'equal', '[{"member_id":"00000000-0000-0000-0000-000000000099"}]')$test$, 'P0001', 'RPC rejects unknown members');
select pg_temp.expect_error($test$select public.save_expense('00000000-0000-0000-0000-000000000101', 'Bad custom', 100, 'USD', '00000000-0000-0000-0000-000000000001', 'custom', '[{"member_id":"00000000-0000-0000-0000-000000000002","amount_cents":99}]')$test$, 'P0001', 'custom amounts must sum to total');
select pg_temp.expect_error($test$select public.save_expense('00000000-0000-0000-0000-000000000101', 'Bad percentage', 100, 'USD', '00000000-0000-0000-0000-000000000001', 'percentage', '[{"member_id":"00000000-0000-0000-0000-000000000002","percentage":"99.99"}]')$test$, 'P0001', 'percentages must sum to 100');
select pg_temp.expect_error($test$select public.save_expense('00000000-0000-0000-0000-000000000101', 'Unsafe', 9007199254740992, 'USD', '00000000-0000-0000-0000-000000000001', 'equal', '[{"member_id":"00000000-0000-0000-0000-000000000002"}]')$test$, 'P0001', 'unsafe cent total rejected');
select pg_temp.expect_error($test$select public.save_expense('00000000-0000-0000-0000-000000000101', 'Currency', 100, 'EUR', '00000000-0000-0000-0000-000000000001', 'equal', '[{"member_id":"00000000-0000-0000-0000-000000000002"}]')$test$, '23514', 'unsupported currency rejected');

select set_config('test.percentage_id', public.save_expense('00000000-0000-0000-0000-000000000102', 'Percentages', 1, 'MXN', '00000000-0000-0000-0000-000000000003', 'percentage',
  '[{"member_id":"00000000-0000-0000-0000-000000000003","percentage":"50"},{"member_id":"00000000-0000-0000-0000-000000000002","percentage":"50"}]')::text, true);
select pg_temp.assert_true((select array_agg(amount_cents order by member_id) = array[1,0]::bigint[] from public.expense_shares where expense_id = current_setting('test.percentage_id')::uuid), 'percentage tie breaks by member ID rather than payee');
select set_config('test.custom_id', public.save_expense('00000000-0000-0000-0000-000000000101', 'Custom', 100, 'USD', '00000000-0000-0000-0000-000000000002', 'custom',
  '[{"member_id":"00000000-0000-0000-0000-000000000003","amount_cents":75,"payor_marked_paid":true,"payee_confirmed":true},{"member_id":"00000000-0000-0000-0000-000000000002","amount_cents":25}]')::text, true);
select pg_temp.assert_true((select array_agg(amount_cents order by member_id) = array[25,75]::bigint[] from public.expense_shares where expense_id = current_setting('test.custom_id')::uuid), 'custom amounts preserved');
select pg_temp.assert_true((select status = 'to-be-paid' from public.expense_shares where expense_id = current_setting('test.custom_id')::uuid and member_id = '00000000-0000-0000-0000-000000000003'), 'client-supplied confirmation flags ignored');

-- Exact large-percentage products and primary equal-split edge cases.
reset role;
select pg_temp.assert_true((private.allocate_shares(9007199254740991, '00000000-0000-0000-0000-000000000001', 'percentage',
  '[{"member_id":"00000000-0000-0000-0000-000000000001","percentage":"99.999999999999999999"},{"member_id":"00000000-0000-0000-0000-000000000002","percentage":"0.000000000000000001"}]')->0->>'amount_cents')::bigint = 9007199254740991, 'large percentage arithmetic preserves every cent');
select pg_temp.assert_true((private.allocate_shares(1, '00000000-0000-0000-0000-000000000003', 'equal',
  '[{"member_id":"00000000-0000-0000-0000-000000000001"},{"member_id":"00000000-0000-0000-0000-000000000002"},{"member_id":"00000000-0000-0000-0000-000000000003"}]')->2->>'amount_cents')::bigint = 1, 'one cent goes to participating payee');
select pg_temp.assert_true((private.allocate_shares(0, '00000000-0000-0000-0000-000000000001', 'equal',
  '[{"member_id":"00000000-0000-0000-0000-000000000002"}]')->0->>'amount_cents')::bigint = 0, 'single participant and zero total supported');
set local role authenticated;

-- Separate creator/payee: each can edit/delete, unrelated participants cannot.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002"}', true);
select public.save_expense('00000000-0000-0000-0000-000000000101', 'Payee edits', 100, 'USD', '00000000-0000-0000-0000-000000000002', 'custom',
  '[{"member_id":"00000000-0000-0000-0000-000000000002","amount_cents":25},{"member_id":"00000000-0000-0000-0000-000000000003","amount_cents":75}]', current_setting('test.custom_id')::uuid);
select pg_temp.assert_true((select created_by = '00000000-0000-0000-0000-000000000001' from public.expenses where id = current_setting('test.custom_id')::uuid), 'payee edit preserves original creator');
select public.delete_expense(current_setting('test.custom_id')::uuid);
select pg_temp.assert_true((select count(*) = 0 from public.expense_shares where expense_id = current_setting('test.custom_id')::uuid), 'payee deletion cascades shares');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001"}', true);
select public.delete_expense(current_setting('test.percentage_id')::uuid);
select pg_temp.assert_true((select count(*) = 0 from public.expenses where id = current_setting('test.percentage_id')::uuid), 'creator can delete with a different payee');
select pg_temp.assert_true(public.create_expense_tab('Another trip') is not null, 'member can create a tab');

-- Exercise owner-level constraints too; privileges alone must not hide defects.
reset role;
select pg_temp.expect_error($test$insert into public.expense_shares(expense_id, member_id, amount_cents) values ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000002', 1)$test$, '23505', 'unique constraint rejects duplicate member per expense');
select pg_temp.expect_error('update public.expense_shares set payee_confirmed = true where id = ''00000000-0000-0000-0000-000000000304''', '23514', 'constraint rejects confirmation without payment');
select pg_temp.expect_error('update public.expense_shares set amount_cents = -1', '23514', 'constraint rejects negative money');
select pg_temp.expect_error($test$do $block$ begin update public.expenses set total_cents = 1 where id = '00000000-0000-0000-0000-000000000202'; set constraints all immediate; end $block$$test$, 'P0001', 'deferred constraint rejects mismatched expense total');
select pg_temp.expect_error($test$do $block$ begin update public.expense_shares set payor_marked_paid = false, payee_confirmed = false where id = '00000000-0000-0000-0000-000000000303'; set constraints all immediate; end $block$$test$, 'P0001', 'deferred constraint requires own share settled');
set constraints all immediate;
select pg_temp.assert_true(true, 'all deferred constraints pass at transaction boundary');
rollback;
