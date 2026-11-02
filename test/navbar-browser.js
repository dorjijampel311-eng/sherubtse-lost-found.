// Optional real Chromium regression check: node test/integration.js --navbar-browser
// Uses disposable integration users and a separate temporary browser profile.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = async function verifyNavbar(base, sessionCookie) {
  const executable = process.env.TEST_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  await fs.access(executable);
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'sherubtse-nav-test-'));
  const browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio:'ignore', windowsHide:true });
  let socket, nextId = 0;
  const pending = new Map(), events = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Browser command timed out: ' + method)); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const event = name => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { events.delete(name); reject(new Error('Browser event timed out: ' + name)); }, 20000);
    events.set(name, value => { clearTimeout(timer); resolve(value); });
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue:true });
    assert.ok(!result.exceptionDetails, 'Browser evaluation failed');
    return result.result.value;
  };
  try {
    let port;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { port = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; }
      catch { await delay(100); }
    }
    assert.ok(port, 'Headless Chromium must start');
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method:'PUT' })).json();
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once:true }); socket.addEventListener('error', reject, { once:true }); });
    socket.addEventListener('message', message => {
      const data = JSON.parse(message.data);
      if (data.id && pending.has(data.id)) {
        const request = pending.get(data.id); pending.delete(data.id); clearTimeout(request.timer);
        if (data.error) request.reject(new Error(data.error.message)); else request.resolve(data.result);
      }
      if (events.has(data.method)) { const resolve = events.get(data.method); events.delete(data.method); resolve(data.params); }
    });
    await send('Page.enable'); await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled:true });
    await send('Network.emulateNetworkConditions', { offline:false, latency:150, downloadThroughput:100000, uploadThroughput:50000 });
    const [cookieName, ...cookieValue] = sessionCookie.split('=');
    await send('Page.addScriptToEvaluateOnNewDocument', { source:`
      window.navFrames = [];
      function sample() {
        const link = document.querySelector('[data-auth-link]');
        if (link) {
          const r = link.getBoundingClientRect();
          window.navFrames.push({ visible:r.width > 0 && r.height > 0, left:r.left, right:r.right, top:r.top, width:r.width });
        }
        if (window.navFrames.length < 2000) requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    ` });
    const navigate = async route => {
      const loaded = event('Page.loadEventFired');
      await send('Page.navigate', { url:base + route }); await loaded; await delay(100);
    };
    // Check visitors before adding a session cookie to this disposable profile.
    for (const width of [1280,390]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height:900, deviceScaleFactor:1, mobile:width<721 });
      await navigate('/browse');
      assert.equal(await evaluate(`!!document.querySelector('[data-auth-link]')`), false);
      assert.equal(await evaluate(`!!document.querySelector('.nav-account a[href="/login"]')`), true);
    }
    console.log('PASS: Chromium visitor navigation on desktop and mobile.');
    await send('Network.setCookie', { url:base, name:cookieName, value:cookieValue.join('=') });
    await send('Network.setCookie', { url:base, name:'sherubtse_nav_open', value:'1', path:'/' });
    for (const width of [1280, 900, 390, 320]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height:900, deviceScaleFactor:1, mobile:width < 721 });
      for (const route of ['/browse', '/report-lost', '/report-found', '/my-items']) {
        await navigate(route);
        const geometry = await evaluate(`(() => {
          const link = document.querySelector('[data-auth-link]'), r = link.getBoundingClientRect();
          const header = document.querySelector('.site-header').getBoundingClientRect();
          return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height,
            headerBottom:header.bottom, viewport:innerWidth, documentWidth:document.documentElement.scrollWidth,
            expanded:document.querySelector('.menu-toggle').getAttribute('aria-expanded'), frames:window.navFrames };
        })()`);
        assert.ok(geometry.width > 0 && geometry.height > 0, `${width} ${route}: My posts is visible`);
        assert.ok(geometry.left >= 0 && geometry.right <= geometry.viewport, `${width} ${route}: no clipping`);
        assert.ok(geometry.bottom <= geometry.headerBottom, `${width} ${route}: within header`);
        assert.ok(geometry.documentWidth <= geometry.viewport, `${width} ${route}: no horizontal overflow`);
        assert.ok(geometry.frames.length > 0);
        assert.ok(geometry.frames.every(frame => frame.visible), `${width} ${route}: visible throughout slow loading`);
        const first = geometry.frames[0];
        assert.ok(geometry.frames.every(frame => Math.abs(frame.left-first.left)<1 && Math.abs(frame.top-first.top)<1 && Math.abs(frame.width-first.width)<1), `${width} ${route}: stable loading geometry ${JSON.stringify({first,last:geometry.frames.at(-1)})}`);
        await send('Input.dispatchMouseEvent', { type:'mouseMoved', x:geometry.left+5, y:geometry.top+5 });
        const hover = await evaluate(`(() => { const r=document.querySelector('[data-auth-link]').getBoundingClientRect(); return {left:r.left,width:r.width,height:r.height}; })()`);
        assert.equal(hover.left, geometry.left); assert.equal(hover.width, geometry.width); assert.equal(hover.height, geometry.height);
      }
      // Reload retains the server-rendered account and menu state.
      const loaded = event('Page.loadEventFired'); await send('Page.reload'); await loaded;
      assert.equal(await evaluate(`!!document.querySelector('[data-auth-link]')`), true);
      if (width < 721) {
        await evaluate(`document.querySelector('.menu-toggle').click()`);
        await navigate('/browse');
        assert.equal(await evaluate(`document.querySelector('.menu-toggle').getAttribute('aria-expanded')`), 'false');
        await evaluate(`document.querySelector('.menu-toggle').click()`);
        await navigate('/report-found');
        assert.equal(await evaluate(`document.querySelector('.menu-toggle').getAttribute('aria-expanded')`), 'true');
      }
      console.log(`PASS: Chromium navbar at ${width}px during navigation, loading, hover and refresh.`);
    }
    console.log('PASS: headless Chromium at 1280/900/390/320px: four-page navigation, slow loading, refresh, hover, menu persistence, no navbar clipping/shift and guest navigation.');
  } finally {
    if (socket) socket.close();
    for (const request of pending.values()) clearTimeout(request.timer);
    browser.kill();
    // Only the fresh profile created by this test is eligible for removal.
    await delay(500);
    await fs.rm(profile, { recursive:true, force:true, maxRetries:3 }).catch(() => {});
  }
};
