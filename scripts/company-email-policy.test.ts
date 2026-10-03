import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CE_WORKSPACE_ID, companyEmailError, WORK_EMAIL_MESSAGE } from '../src/lib/chat/company-email-policy';

test('CE rejects personal, ISP and disposable addresses in chat and intake text', () => {
  for (const email of ['person@gmail.com', 'PERSON@YAHOO.COM', 'person@outlook.com', 'person@comcast.net', 'person@yopmail.com']) {
    assert.equal(companyEmailError(CE_WORKSPACE_ID, `Contact me at ${email}`), WORK_EMAIL_MESSAGE);
  }
});
test('custom company domains and anonymous questions remain eligible', () => {
  assert.equal(companyEmailError(CE_WORKSPACE_ID, 'person@company.example'), null);
  assert.equal(companyEmailError(CE_WORKSPACE_ID, 'Can you help me hire engineers?'), null);
});
test('a second personal address cannot bypass the policy, other tenants unchanged', () => {
  assert.equal(companyEmailError(CE_WORKSPACE_ID, 'person@company.example or person@gmail.com'), WORK_EMAIL_MESSAGE);
  assert.equal(companyEmailError('another-workspace', 'person@gmail.com'), null);
});

test('PostgreSQL-equivalent CE UUID spellings cannot bypass tenant policy', () => {
  for (const id of [CE_WORKSPACE_ID.toUpperCase(), CE_WORKSPACE_ID.replace(/-/g, ''), `{${CE_WORKSPACE_ID}}`]) {
    assert.equal(companyEmailError(id, 'person@gmail.com'), WORK_EMAIL_MESSAGE);
  }
});
