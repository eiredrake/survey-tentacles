const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, "../../main/resources/static");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const tick = () => new Promise(resolve => setImmediate(resolve));
const settings = { enabled: true, pointName: "Karma" };
const perks = [{ id: 1, name: "<b>Advantage</b>", description: "One roll", cost: 7, active: true },
  { id: 2, name: "Expensive", description: "", cost: 20, active: true }];
const account = { settings, balance: 10, perks, history: [], leaderboard: [{ userId: 1, name: "Alice", earned: 10 }] };

function page(name, reply = () => undefined) {
  const dom = new JSDOM(read(`${name}.html`), { url: "http://localhost/?id=5", runScripts: "outside-only" });
  const calls = [], errors = [];
  dom.window.confirm = () => true; dom.window.showToast = message => errors.push(message);
  dom.window.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    const custom = await reply(url, options);
    if (custom?.ok === false) return custom;
    const value = custom ?? (url === "/csrf" ? { headerName: "Custom-Csrf", token: "token" }
      : url.endsWith("/settings") ? settings : url.endsWith("/account") ? account : url.endsWith("/perks") ? perks : []);
    return { ok: true, json: async () => value };
  };
  for (const file of ["getCsrfToken", "date-format", "icon-button", "rewards"]) dom.window.eval(read(`js/${file}.js`));
  return { dom, window: dom.window, document: dom.window.document, calls, errors };
}

test("Rewards displays balance, safely renders perks, and prevents unaffordable purchases", async () => {
  const p = page("rewards");
  try {
    p.window.eval(read("js/rewards-page.js")); await tick();
    assert.equal(p.document.getElementById("balance").textContent, "10 Karma");
    assert.equal(p.document.querySelector("#perks b"), null);
    const buttons = p.document.querySelectorAll("#perks button"); assert.equal(buttons[0].disabled, false); assert.equal(buttons[1].disabled, true);
    assert.match(p.document.getElementById("leaderboard").textContent, /Alice10/);
  } finally { p.dom.window.close(); }
});

test("Redemption uses canonical header and retries ambiguous failure with the same request ID", async () => {
  let attempts = 0;
  const p = page("rewards", (url, options) => {
    if (url.endsWith("/redeem") && options.method === "POST") {
      if (++attempts === 1) throw new Error("Connection interrupted");
      return { id: 11 };
    }
  });
  try {
    p.window.eval(read("js/rewards-page.js")); await tick();
    p.document.querySelector("#perks button").click(); await tick();
    p.document.querySelector("#perks button").click(); await tick();
    const posts = p.calls.filter(call => call.options.method === "POST"); assert.equal(posts.length, 2);
    assert.equal(posts[0].options.headers["Custom-Csrf"], "token");
    assert.equal(JSON.parse(posts[0].options.body).requestId, JSON.parse(posts[1].options.body).requestId);
  } finally { p.dom.window.close(); }
});

test("Disabled rewards preserve visible participant history and show no store", async () => {
  const p = page("rewards", url => url.endsWith("/account") ? { ...account, settings: { ...settings, enabled: false }, perks: [], leaderboard: [],
    history: [{ occurredAt: "2026-09-20T12:00:00Z", description: "Prior award", amount: 10 }] } : undefined);
  try {
    p.window.eval(read("js/rewards-page.js")); await tick();
    assert.match(p.document.getElementById("rewards-status").textContent, /paused/);
    assert.match(p.document.getElementById("reward-history").textContent, /Prior award/);
    assert.equal(p.document.querySelectorAll("#perks button").length, 0);
  } finally { p.dom.window.close(); }
});

test("Admins can create and retire perks using the same editor", async () => {
  const p = page("admin/rewards");
  try {
    p.window.eval(read("js/rewards-page.js")); await tick();
    p.document.getElementById("add-perk").click();
    p.document.getElementById("perk-name").value = "Reroll"; p.document.getElementById("perk-cost").value = "5";
    p.document.getElementById("perk-form").dispatchEvent(new p.window.Event("submit", { cancelable: true })); await tick();
    const created = p.calls.find(call => call.options.method === "POST"); assert.equal(JSON.parse(created.options.body).cost, 5);
    p.document.querySelector("#perks button").click(); p.document.getElementById("perk-active").checked = false;
    p.document.getElementById("perk-form").dispatchEvent(new p.window.Event("submit", { cancelable: true })); await tick();
    const retired = p.calls.find(call => call.options.method === "PUT"); assert.equal(retired.url, "/api/rewards/admin/perks/1");
    assert.equal(JSON.parse(retired.options.body).active, false); assert.equal(retired.options.headers["Custom-Csrf"], "token");
  } finally { p.dom.window.close(); }
});

test("Survey rewards save per-question values and opt-in explicitly", async () => {
  const config = { available: true, pointName: "Stars", enabled: false, questions: [{ id: 8, prompt: "Feedback", points: 2 }] };
  const p = page("survey-edit", url => url.includes("/surveys/5") ? config : undefined);
  try {
    p.window.eval(read("js/survey-rewards.js")); await tick();
    assert.equal(p.document.getElementById("survey-rewards").hidden, false);
    const input = p.document.querySelector("[data-question-id]"); input.value = "4";
    p.document.getElementById("survey-rewards-enabled").checked = true;
    p.document.getElementById("survey-rewards-form").dispatchEvent(new p.window.Event("submit", { cancelable: true })); await tick();
    const saved = p.calls.find(call => call.options.method === "PUT");
    assert.deepEqual(JSON.parse(saved.options.body), { enabled: true, questionPoints: { 8: 4 } });
    assert.equal(saved.options.headers["Custom-Csrf"], "token");
  } finally { p.dom.window.close(); }
});

test("CSRF failure prevents a rewards mutation", async () => {
  const p = page("rewards", url => url === "/csrf" ? { ok: false, status: 403, statusText: "Forbidden" } : undefined);
  try {
    await assert.rejects(() => p.window.Rewards.request("/redeem", "POST", { perkId: 1 }), /CSRF/);
    assert.equal(p.calls.filter(call => call.options.method === "POST").length, 0);
  } finally { p.dom.window.close(); }
});
