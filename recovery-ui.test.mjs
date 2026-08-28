import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./stolen-minutes-recovery.css', import.meta.url), 'utf8');

const CONTROL = 'https://control.hope-johnstone.com';

test('Stolen Minutes recovery chrome is 5M-only and returns to Control', () => {
  assert.match(html, /class="family-control" href="https:\/\/control\.hope-johnstone\.com"/);
  assert.match(html, /5 Million Minutes/);
  assert.match(html, new RegExp(`href="${CONTROL}"`));
  assert.match(html, />Control</);
  assert.match(html, /<strong>Stolen Minutes<\/strong>/);
  assert.doesNotMatch(html, /recipes\.bloodydaves\.com/);
  assert.doesNotMatch(html, /list\.bloodydaves\.com/);
  assert.doesNotMatch(html, /lift\.bloodydaves\.com/);
  assert.doesNotMatch(html, /Quiet Timer/);
  assert.doesNotMatch(html, /Bloody Dave's Suite/);
});

test('recovery UI is a compact operational tool, not a dashboard', () => {
  assert.match(html, /family=Inter/);
  assert.match(css, /Inter, system-ui/);
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /min-height: 64px/);
  assert.match(css, /--sm-control: 44px/);
  assert.match(css, /min-height: var\(--sm-control\)/);
  assert.match(css, /min-height: 48px/);
  assert.doesNotMatch(css, /150px/);
  assert.doesNotMatch(css, /Georgia/);
  assert.doesNotMatch(html, /WHERE DID THE DAY ACTUALLY GO/);
  assert.match(html, /id="timer"/);
  assert.match(html, /id="record"/);
  assert.match(html, /id="categoryReview"/);
  assert.match(html, /id="activityList"/);
});

test('mandatory viewport gates are encoded in CSS', () => {
  assert.match(css, /390×844/);
  assert.match(css, /768×1024/);
  assert.match(css, /1024×768/);
  assert.match(css, /820×1180/);
  assert.match(css, /1180×820/);
  assert.match(css, /1440×900/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(min-width: 1024px\)/);
  assert.match(css, /@media \(min-width: 1180px\)/);
  assert.match(css, /@media \(min-width: 1440px\)/);
});

test('timer, category, health and fragment IDs remain for app.js', () => {
  const required = [
    'todayLabel', 'email', 'login', 'signedOut', 'signedIn', 'account', 'sync', 'logout', 'dot', 'cloudStatus',
    'timerView', 'activityLabel', 'timer', 'record', 'activityFallback', 'activityInput', 'linkedJobInput', 'applyActivity',
    'categoryReview', 'categoryActivity', 'categorySuggestion', 'todayTotal', 'todayTracked', 'activityList', 'exportActivities',
    'weekTimeTotal', 'weekTopActivity', 'plannedWeekMinutes', 'saveWeekPlan', 'plannedVsActual',
    'fragmentsView', 'fragmentForm', 'fragmentTitle', 'fragmentBody', 'fragmentTags', 'exportFragmentDraft', 'fragmentList',
    'diabetesView', 'glucoseCapture', 'foodCapture', 'eventCapture', 'captureStatus', 'showManual',
    'storageWarning', 'storageWarningText', 'storageDetails', 'storageExport', 'dismissStorageWarning',
    'latestGlucose', 'sevenDayGlucose', 'sevenDayReadings', 'sevenDayCarbs',
    'manualCard', 'healthFormTitle', 'healthForm', 'healthId', 'healthType', 'healthTime',
    'glucoseFields', 'glucoseValue', 'glucoseContext', 'mealFields', 'foodSearch', 'addFood', 'foodSuggestions', 'mealItems',
    'eventFields', 'healthNotes', 'cancelHealth', 'checkStorage', 'healthTimeline', 'exportHealth', 'exportHealthCsv',
    'exportWeekReview', 'foodLibrary', 'captureDialog', 'captureForm', 'captureDialogTitle', 'captureDialogHint',
    'captureListening', 'captureText', 'captureRetry', 'captureCancel', 'editFoodDialog', 'foodForm', 'foodId',
    'foodName', 'foodAliases', 'foodPortion', 'foodCarbs', 'cancelFoodEdit'
  ];
  for (const id of required) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /data-mode="timer"/);
  assert.match(html, /data-mode="fragments"/);
  assert.match(html, /data-mode="diabetes"/);
  assert.match(html, /data-category="stolen"/);
  assert.match(html, /data-category="claimed"/);
  assert.match(html, /data-category="neutral"/);
});
