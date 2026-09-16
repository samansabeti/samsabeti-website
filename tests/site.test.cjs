const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(process.env.SITE_SCRIPT || join(__dirname, '..', '3-main.js'), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

// Run the shipped script with controlled form, transport, analytics, and layout.
// No real messages or analytics events leave this test.
function page(options = {}) {
  const listeners = {};
  const frames = [];
  const events = [];
  const requests = [];
  const identities = [];
  const status = { textContent: '' };
  const button = { disabled: false };
  const values = { name: 'Test Visitor', email: 'qa@example.com', message: 'Test enquiry' };
  const rectangles = options.rectangles || {};
  let resets = 0;
  const form = {
    querySelector: () => button,
    addEventListener: (name, fn) => { listeners.submit = fn; },
    checkValidity: () => options.valid !== false,
    reportValidity: () => {},
    reset: () => { resets++; Object.keys(values).forEach(key => { values[key] = ''; }); }
  };
  const elements = { 'contact-form': form, 'cf-status': status };
  Object.keys(rectangles).forEach(id => {
    elements[id] = { getBoundingClientRect: () => rectangles[id] };
  });
  const window = {
    innerHeight: options.height || 800,
    scrollY: 0,
    matchMedia: () => ({ matches: false }),
    addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); },
    posthog: options.analytics === null ? null : {
      identify: (...args) => {
        if (options.analytics === 'throw') throw new Error('SDK unavailable');
        identities.push(args);
      },
      capture: (...args) => {
        if (options.analytics === 'throw') throw new Error('SDK unavailable');
        events.push(args);
      }
    }
  };
  const document = {
    documentElement: { scrollHeight: 6000 },
    getElementById: id => elements[id] || null,
    querySelectorAll: () => [],
    addEventListener: (name, fn) => { listeners['document:' + name] = fn; }
  };
  vm.runInNewContext(source, {
    window, document, URL,
    requestAnimationFrame: fn => frames.push(fn),
    atob: value => Buffer.from(value, 'base64').toString('utf8'),
    FormData: class {
      constructor() { this.values = { ...values }; }
      get(key) { return this.values[key]; }
    },
    fetch: (...args) => {
      requests.push(args);
      return options.fetch ? options.fetch(...args) : Promise.resolve({
        ok: options.ok !== false,
        json: () => options.badJson ? Promise.reject(new Error('Invalid JSON')) : Promise.resolve(
          options.response === undefined ? { success: true } : options.response
        )
      });
    }
  });
  const flush = () => { while (frames.length) frames.shift()(); };
  flush();
  return {
    events, requests, identities, status, button, values, rectangles, window,
    get resets() { return resets; },
    submit: () => listeners.submit({ preventDefault() {} }),
    dispatch: name => { (listeners[name] || []).forEach(fn => fn()); flush(); }
  };
}

test('accepted messages reset the form and emit one canonical success event', async () => {
  for (const success of [true, 'true']) {
    const p = page({ response: { success } });
    p.submit();
    assert.equal(p.button.disabled, true);
    await settle();
    assert.equal(p.resets, 1);
    assert.match(p.status.textContent, /^Sent/);
    assert.equal(p.button.disabled, false);
    assert.equal(p.events.length, 1);
    assert.equal(p.events[0][0], 'contact_form_submitted');
    assert.equal(p.events[0][1].submission_status, 'accepted');
    assert.equal(p.events[0][1].message, 'Test enquiry');
    assert.equal(p.identities[0][0], 'qa@example.com');
  }
});

test('HTTP success with application rejection never counts as an enquiry', async () => {
  for (const response of [{ success: false }, { success: 'false' }, {}, null]) {
    const p = page({ response });
    p.submit();
    await settle();
    assert.equal(p.events.length, 0);
    assert.equal(p.resets, 0);
    assert.equal(p.values.message, 'Test enquiry');
    assert.equal(p.button.disabled, false);
    assert.doesNotMatch(p.status.textContent, /^Sent/);
  }
});

test('HTTP, JSON and network failures preserve the message and allow retry', async () => {
  for (const options of [{ ok: false }, { badJson: true }, { fetch: () => Promise.reject(new Error('Offline')) }]) {
    const p = page(options);
    p.submit();
    await settle();
    assert.equal(p.events.length, 0);
    assert.equal(p.resets, 0);
    assert.equal(p.values.message, 'Test enquiry');
    assert.equal(p.button.disabled, false);
    assert.match(p.status.textContent, /try again/);
  }
});

test('blocked or broken analytics cannot turn an accepted message into a failure', async () => {
  for (const analytics of [null, 'throw']) {
    const p = page({ analytics });
    p.submit();
    await settle();
    assert.equal(p.resets, 1);
    assert.match(p.status.textContent, /^Sent/);
    assert.equal(p.button.disabled, false);
  }
});

test('duplicate submits while the request is pending send only one message', async () => {
  let resolve;
  const p = page({ fetch: () => new Promise(done => { resolve = done; }) });
  p.submit();
  p.submit();
  assert.equal(p.requests.length, 1);
  resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
  await settle();
  assert.equal(p.events.length, 1);
});

test('invalid form data does not contact the service or analytics', () => {
  const p = page({ valid: false });
  p.submit();
  assert.equal(p.requests.length, 0);
  assert.equal(p.events.length, 0);
  assert.match(p.status.textContent, /valid email/);
});

test('a sliver of a section is not a view; 35% is counted once', () => {
  const p = page({ rectangles: { contact: { top: 790, bottom: 1190, height: 400 } } });
  assert.equal(p.events.length, 0);
  p.rectangles.contact = { top: 661, bottom: 1061, height: 400 };
  p.dispatch('scroll');
  assert.equal(p.events.length, 0);
  p.rectangles.contact = { top: 660, bottom: 1060, height: 400 };
  p.dispatch('scroll');
  p.dispatch('scroll');
  assert.equal(p.events.length, 1);
  assert.equal(p.events[0][1].section, 'contact');
});

test('long mobile sections use viewport height so views remain reachable', () => {
  const p = page({ height: 600, rectangles: { work: { top: 391, bottom: 3391, height: 3000 } } });
  assert.equal(p.events.length, 0);
  p.rectangles.work = { top: 390, bottom: 3390, height: 3000 };
  p.dispatch('scroll');
  assert.equal(p.events.length, 1);
  assert.equal(p.events[0][1].section_label, 'Work');
});

test('layout changes are rechecked without duplicating section events', () => {
  const p = page({ height: 600, rectangles: { about: { top: 500, bottom: 3500, height: 3000 } } });
  assert.equal(p.events.length, 0);
  p.window.innerHeight = 1000;
  p.dispatch('resize');
  p.dispatch('load');
  assert.equal(p.events.length, 1);
});
