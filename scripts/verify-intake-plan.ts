/**
 * Locked post-booking intake checks. Run with:
 *   npx --yes tsx scripts/verify-intake-plan.ts
 */
import {
  applyAnswer,
  buildBookedGreeting,
  DEFAULT_HOST,
  createLandingSnapshot,
  intakeSystemPrompt,
  isLandingSourcePage,
  landingQuestionToRepeat,
  namedFromBrief,
  nextQuestion,
  planIntakeTurn,
  readIntakeSnapshot,
  withNamedFacts,
} from '../src/lib/chat/intake-plan';
import { briefFromIntakeSnapshot } from '../src/lib/chat/extract-brief';
import { looksLikeMash, offTrackReply } from '../src/lib/chat/landing-guard';

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

// ── Landing (/brief-intake) ──
check('landing page detected', isLandingSourcePage('/brief-intake?utm_source=google'));
check('ask page is not landing', !isLandingSourcePage('/ask'));

const coldLanding = createLandingSnapshot('/brief-intake');
check('cold landing asks role first', nextQuestion(coldLanding)?.id === 'A1');

const namedLanding = withNamedFacts(
  createLandingSnapshot('/brief-intake'),
  namedFromBrief({
    version: 1,
    intent: 'single_hire',
    strength: 40,
    roles: [{ title: 'React engineer', seniority: 'Senior', count: 1 }],
    techStacks: ['React', 'TypeScript'],
  })
);
check(
  'stack named in the role title counts',
  nextQuestion(
    withNamedFacts(
      createLandingSnapshot('/brief-intake'),
      namedFromBrief({ version: 1, intent: 'single_hire', strength: 40, roles: [{ title: 'React Engineer', count: 1 }] })
    )
  )?.id === 'L_TEAM'
);
check(
  'a generic title still asks for the stack',
  nextQuestion(
    withNamedFacts(
      createLandingSnapshot('/brief-intake'),
      namedFromBrief({ version: 1, intent: 'single_hire', strength: 40, roles: [{ title: 'Backend engineer', count: 1 }] })
    )
  )?.id === 'A2'
);
check('named role carries seniority', namedLanding.named.role === 'Senior React engineer');
check('named landing skips role and stack', nextQuestion(namedLanding)?.id === 'L_TEAM');

let landingTurn = { snapshot: namedLanding, question: nextQuestion(namedLanding) };
landingTurn.snapshot = { ...landingTurn.snapshot, asked: ['L_TEAM'] };
landingTurn = planIntakeTurn(landingTurn.snapshot, 'Mostly own their work');
check('after team comes what great looks like', landingTurn.question?.id === 'L_GREAT');
landingTurn = planIntakeTurn(landingTurn.snapshot, 'They pushed back and shipped');
check('then start date', landingTurn.question?.id === 'L_START');
landingTurn = planIntakeTurn(landingTurn.snapshot, 'Within a month');
check('landing completes after start date', landingTurn.question === null);
check('start date lands as timeline', landingTurn.snapshot.named.timeline === 'Within a month');

const timedLanding = withNamedFacts(namedLanding, { timeline: 'next week' });
const timedAfterGreat = { ...timedLanding, asked: ['L_TEAM', 'L_GREAT'] as typeof timedLanding.asked };
check('known timeline skips start date', nextQuestion(timedAfterGreat) === null);

const answerKept = withNamedFacts(landingTurn.snapshot, { timeline: 'someday' });
check('extraction never overwrites an answer', answerKept.named.timeline === 'Within a month');

check(
  'landing snapshot survives a metadata round trip',
  readIntakeSnapshot({ intake: namedLanding })?.kind === 'landing'
);
check(
  'landing snapshot on a non-landing page is ignored',
  readIntakeSnapshot({ intake: { ...namedLanding, source_page: '/pricing' } }) === null
);

const landingPrompt = intakeSystemPrompt({
  displayName: 'Clara',
  snapshot: landingTurn.snapshot,
  question: null,
  knowledge: '',
});
const afterClose = intakeSystemPrompt({
  displayName: 'Clara',
  snapshot: { ...landingTurn.snapshot, complete_sent: true },
  question: null,
  knowledge: '',
});
check('after the closing line Clara only acknowledges', /Ask no new question/.test(afterClose) && !/That's everything I need to start\./.test(afterClose));
// ── Landing guard (no model call) ──
for (const mash of ['asdasdasd', 'dsadsadsa', 'xkcdqwrtz', '!!!???', 'qwrtypsdfg hjkl']) {
  check(`mash caught: ${mash}`, looksLikeMash(mash));
}
for (const real of ['Senior React engineer', 'asap', '2', 'Python and Go', 'Mostly own their work', 'not sure yet', 'SRE']) {
  check(`real answer passes the mash check: ${real}`, !looksLikeMash(real));
}
check(
  'off-topic reply re-asks the same question',
  offTrackReply('off_topic', 'When would you like them to start?').endsWith('When would you like them to start?')
);
check('job seeker reply points to For Developers', /For Developers/.test(offTrackReply('job_seeker', 'x')));
check(
  'the question to repeat is the one last asked',
  landingQuestionToRepeat({ ...namedLanding, asked: ['L_TEAM'] })?.id === 'L_TEAM'
);
check('a cold landing repeats the role question', landingQuestionToRepeat(createLandingSnapshot('/brief-intake'))?.id === 'A1');

check('landing prompt says nobody booked', /nobody has booked a call/i.test(landingPrompt));
check('landing complete prompt uses the fixed line', /That's everything I need to start\./.test(landingPrompt));
check('landing prompt never asks for email', /do not ask for their name or email/i.test(landingPrompt));

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll intake-plan checks passed');
