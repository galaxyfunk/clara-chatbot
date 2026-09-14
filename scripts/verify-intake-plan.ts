/**
 * Locked post-booking intake checks. Run with:
 *   npx --yes tsx scripts/verify-intake-plan.ts
 */
import {
  applyAnswer,
  buildBookedGreeting,
  DEFAULT_HOST,
  nextQuestion,
  planIntakeTurn,
} from '../src/lib/chat/intake-plan';
import { briefFromIntakeSnapshot } from '../src/lib/chat/extract-brief';

const COLD = /what brings you to our staffing/i;
const VIBE = /vibe coder/i;
const FAKE_HOST = /\b(Molly|AJ|Steph|Seb)\b/;

let failed = 0;

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`ok  ${name}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

const thin = buildBookedGreeting({
  sourcePage: '/ask',
  visitor: { email: 'sam@example.com' },
  booking: { host_name: 'Molly' },
});
check('thin thanks them', /thanks, you are booked in with Molly/i.test(thin.greeting));
check('thin asks who they need', /who are you trying to hire/i.test(thin.greeting));
check('thin is not the cold staffing line', !COLD.test(thin.greeting));
check('thin band', thin.snapshot.band === 'thin');

const fat = buildBookedGreeting({
  sourcePage: '/ask',
  visitor: { email: 'sam@example.com' },
  booking: { host_name: 'AJ' },
  brief: {
    role: 'Senior React Engineer',
    stack: ['React', 'TypeScript'],
    headcount: 2,
    timeline: 'in 4 weeks',
    company: 'Northwind',
    message:
      'We need someone who can own the customer dashboard and work with the existing design system, overlapping UK mornings.',
  },
});
check('fat thanks them', /thanks, you are booked in with AJ/i.test(fat.greeting));
check('fat names what we have', /Senior React Engineer/i.test(fat.greeting) && /React/i.test(fat.greeting));
check('fat asks person-fit', /good look like in the person/i.test(fat.greeting));
check('fat does not re-ask the role', !/who are you trying to hire/i.test(fat.greeting));
check('fat band', fat.snapshot.band === 'fat');

const noHost = buildBookedGreeting({
  sourcePage: '/ask',
  visitor: { email: 'sam@example.com' },
});
check('missing host uses fallback', noHost.greeting.includes(DEFAULT_HOST));
check('missing host does not invent a named host', !FAKE_HOST.test(noHost.greeting));

const hr = buildBookedGreeting({
  sourcePage: '/ask',
  visitor: { email: 'sam@example.com', job_title: 'HR Manager' },
  booking: { host_name: 'Steph' },
  brief: {
    role: 'Senior React Engineer',
    stack: ['React'],
    headcount: 1,
    timeline: 'ASAP',
    company: 'Acme',
  },
});
check('HR title is not treated as the hire', !/HR Manager/i.test(hr.greeting) || /Senior React Engineer/i.test(hr.greeting));
check('HR seed role stays the engineer', hr.snapshot.named.role === 'Senior React Engineer');
check('HR flag is set', hr.snapshot.buyer_looks_hr === true);
const afterFatFirst = planIntakeTurn(hr.snapshot, 'Self-starter, calm under ambiguity');
check(
  'HR follow-up asks about the hiring manager on the call',
  afterFatFirst.question?.id === 'HR' && /report to be on this call/i.test(afterFatFirst.question.prompt)
);
check('HR follow-up does not hire an HR Manager', !/hire an HR/i.test(afterFatFirst.question?.prompt ?? ''));

const vague = buildBookedGreeting({
  sourcePage: '/ask',
  visitor: { email: 'sam@example.com' },
  booking: { host_name: 'Seb' },
});
const afterDeveloper = planIntakeTurn(vague.snapshot, 'developer');
check(
  'vague developer gets a clarifying question with a reason',
  afterDeveloper.question?.id === 'P_ROLE' &&
    /different shortlists/i.test(afterDeveloper.question.prompt) &&
    /frontend/i.test(afterDeveloper.question.prompt)
);

const builtWithAi = applyAnswer(
  {
    ...thin.snapshot,
    identity: 'Built with AI',
    filled: [...thin.snapshot.filled, 'A5'],
    asked: [...thin.snapshot.asked, 'A5'],
  },
  'A5',
  'Built with AI'
);
const aiExtra = nextQuestion({
  ...builtWithAi,
  filled: [...builtWithAi.filled, 'A1', 'A2', 'A3', 'A4', 'A5'],
  asked: ['A1', 'A2', 'A3', 'A4', 'A5'],
  named: {
    role: 'Founding engineer',
    stack: ['TypeScript'],
    headcount: '1',
    timeline: 'now',
    company: 'Acme',
  },
  band: 'medium',
});
check('Built with AI extra exists', Boolean(aiExtra && aiExtra.id === 'A5x'));
check('Built with AI never says vibe coder', !VIBE.test(aiExtra?.prompt ?? ''));

const chips = fat.suggestions;
check('fat seed suggestions exist', Boolean(chips?.length));
check('B1 chips end with Other', Boolean(chips && chips[chips.length - 1] === 'Other'));
check('thin seed has no chip row', !thin.suggestions?.length);

const seededBrief = briefFromIntakeSnapshot(hr.snapshot);
check('seed brief role is the engineer', seededBrief.roles?.[0]?.title === 'Senior React Engineer');
check('seed brief does not use job title as the role', seededBrief.roles?.[0]?.title !== 'HR Manager');
check(
  'HR watch-out lands in teamContext',
  /HR/i.test(seededBrief.teamContext ?? '') && /hiring manager/i.test(seededBrief.teamContext ?? '')
);
check('companyContext has the company', /Acme/i.test(seededBrief.companyContext ?? ''));
check('ready stays a 70-or-under number until core facts land', seededBrief.strength <= 100);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll intake-plan checks passed');
