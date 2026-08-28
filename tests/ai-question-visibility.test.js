const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function functionBody(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

test('question panel stays visible before beta login', () => {
  const body = functionBody('setAiLoggedOut');
  assert.match(body, /aiMemberPanel\.hidden\s*=\s*false/);
});

test('AI ask remains disabled while logged out', () => {
  const body = functionBody('setAiLoggedOut');
  assert.match(body, /askAiButton\.disabled\s*=\s*true/);
});

test('guest view hides member-only controls but login reveals them', () => {
  const loggedOut = functionBody('setAiLoggedOut');
  const loggedIn = functionBody('setAiLoggedIn');
  assert.match(loggedOut, /betaLogoutButton\.hidden\s*=\s*true/);
  assert.match(loggedOut, /aiUserStatus\.hidden\s*=\s*true/);
  assert.match(loggedIn, /betaLogoutButton\.hidden\s*=\s*false/);
  assert.match(loggedIn, /aiUserStatus\.hidden\s*=\s*false/);
});
