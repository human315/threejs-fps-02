// Dustline Protocol — the HUD: health, ammo, timer, score, money, killfeed,
// crosshair, minimap, banners and the buy menu. It reads state, never writes it,
// except through the callbacks the game hands it (buy, start, restart).
import { WEAPONS, GRENADES, ROUND, MAP } from './config.js';
import { WALLS } from './map.js';

function el(id) { return document.getElementById(id); }

export function createHud(callbacks) {
  const minimap = el('minimap');
  const mctx = minimap ? minimap.getContext('2d') : null;
  let bannerT = null;
  let hitT = null;
  let lastMapDraw = 0;

  function buildBuyMenu() {
    const list = el('buy-list');
    if (!list) return;
    list.innerHTML = '';
    const rows = [
      ...Object.values(WEAPONS).filter((w) => w.price > 0).map((w) => ({
        key: '2', label: `${w.name}`, sub: `伤害 ${w.damage} · ${w.mag} 发弹匣`, price: w.price, kind: 'weapon', id: w.id,
      })),
      { key: '5', label: GRENADES.he.name, sub: `范围伤害 · 半径 ${GRENADES.he.radius}m`, price: GRENADES.he.price, kind: 'grenade', id: 'he' },
      { key: '6', label: GRENADES.smoke.name, sub: '遮挡视线 12 秒', price: GRENADES.smoke.price, kind: 'grenade', id: 'smoke' },
      { key: '7', label: '重型护甲', sub: '抵挡 50% 伤害', price: 650, kind: 'armor', id: 'armor' },
      { key: '8', label: '补充弹药', sub: '当前武器备弹补满', price: 200, kind: 'ammo', id: 'ammo' },
    ];
    // Number keys shown in order: 2 SMG, 3 rifle, 4 sniper, 5 HE, 6 smoke, 7 armor, 8 ammo.
    const keyFor = { smg: '2', rifle: '3', sniper: '4', he: '5', smoke: '6', armor: '7', ammo: '8' };
    for (const r of rows) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'buy-item';
      btn.innerHTML = `<span class="buy-key">${keyFor[r.id] ?? ''}</span>
        <span class="buy-name">${r.label}<small>${r.sub}</small></span>
        <span class="buy-price">$${r.price}</span>`;
      btn.addEventListener('click', () => callbacks.onBuy(r.kind, r.id));
      list.appendChild(btn);
    }
  }
  buildBuyMenu();

  const startBtn = el('buy-start');
  if (startBtn) startBtn.addEventListener('click', () => callbacks.onStartRound());
  const titleBtn = el('title-start');
  if (titleBtn) titleBtn.addEventListener('click', () => callbacks.onStartMatch());
  const againBtn = el('again-btn');
  if (againBtn) againBtn.addEventListener('click', () => callbacks.onRestart());

  function drawMinimap(S) {
    if (!mctx) return;
    const W = minimap.width;
    const H = minimap.height;
    const sx = (x) => ((x + MAP.halfX) / (MAP.halfX * 2)) * W;
    const sz = (z) => ((z + MAP.halfZ) / (MAP.halfZ * 2)) * H;
    mctx.clearRect(0, 0, W, H);
    mctx.fillStyle = 'rgba(20, 24, 30, 0.78)';
    mctx.fillRect(0, 0, W, H);
    // Sites.
    for (const [site, color] of [[MAP.siteA, '#f0a830'], [MAP.siteB, '#35c8a8']]) {
      mctx.strokeStyle = color;
      mctx.lineWidth = 1.5;
      mctx.beginPath();
      mctx.arc(sx(site.x), sz(site.z), (site.r / 60) * W, 0, Math.PI * 2);
      mctx.stroke();
    }
    // Walls.
    mctx.fillStyle = '#8b98a5';
    for (const w of WALLS) {
      mctx.fillRect(sx(w.x0), sz(w.z0), Math.max(1, sx(w.x1) - sx(w.x0)), Math.max(1, sz(w.z1) - sz(w.z0)));
    }
    // Bomb.
    if (S.bomb.state === 'planted') {
      mctx.fillStyle = '#ffc93c';
      mctx.beginPath();
      mctx.arc(sx(S.bomb.x), sz(S.bomb.z), 4, 0, Math.PI * 2);
      mctx.fill();
    }
    // Bots: allies teal, enemies red.
    for (const b of S.bots) {
      if (!b.alive) continue;
      mctx.fillStyle = b.team === 'atk' ? '#35c8a8' : '#e0523d';
      mctx.beginPath();
      mctx.arc(sx(b.pos.x), sz(b.pos.z), 3, 0, Math.PI * 2);
      mctx.fill();
    }
    // Player: white arrow showing facing.
    const p = S.player;
    mctx.save();
    mctx.translate(sx(p.pos.x), sz(p.pos.z));
    mctx.rotate(Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw)) + Math.PI / 2);
    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.moveTo(0, -6);
    mctx.lineTo(4, 5);
    mctx.lineTo(-4, 5);
    mctx.closePath();
    mctx.fill();
    mctx.restore();
  }

  function fmtTime(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return {
    setKillfeed(items) {
      const box = el('killfeed');
      if (!box) return;
      box.innerHTML = items.map((k) => `<div class="feed ${k.cls}">${k.text}</div>`).join('');
    },
    hitmarker(headshot) {
      const h = el('hitmarker');
      if (!h) return;
      h.classList.add('on');
      h.classList.toggle('head', !!headshot);
      clearTimeout(hitT);
      hitT = setTimeout(() => h.classList.remove('on'), 120);
    },
    damageFlash() {
      const d = el('damage-flash');
      if (!d) return;
      d.classList.add('on');
      setTimeout(() => d.classList.remove('on'), 180);
    },
    plantProgress(frac, label) {
      const bar = el('plant-bar');
      const wrap = el('plant-wrap');
      if (!bar || !wrap) return;
      if (frac > 0) {
        wrap.hidden = false;
        bar.style.width = `${Math.round(frac * 100)}%`;
        el('plant-label').textContent = label;
      } else {
        wrap.hidden = true;
      }
    },
    banner(title, sub, dur) {
      const b = el('banner');
      if (!b) return;
      el('banner-title').textContent = title;
      el('banner-sub').textContent = sub || '';
      b.hidden = false;
      clearTimeout(bannerT);
      if (dur) bannerT = setTimeout(() => { b.hidden = true; }, dur * 1000);
    },
    hideBanner() { const b = el('banner'); if (b) b.hidden = true; },
    showBuy(show, money, player) {
      const m = el('buy-menu');
      if (!m) return;
      m.hidden = !show;
      if (show) {
        el('buy-money').textContent = `$${money}`;
        const owned = el('buy-owned');
        if (owned && player) {
          const names = Object.keys(player.owned).map((id) => WEAPONS[id].name).join(' · ');
          owned.textContent = `已拥有：${names}　手雷 HE×${player.grenades.he} 烟雾×${player.grenades.smoke}　护甲 ${player.armor}`;
        }
      }
    },
    showTitle(show) { const t = el('title-screen'); if (t) t.hidden = !show; },
    showMatchEnd(won, score, stats) {
      const m = el('match-end');
      if (!m) return;
      el('match-title').textContent = won ? '整场胜利' : '整场失利';
      el('match-title').className = won ? 'win' : 'lose';
      el('match-score').textContent = `比分 ${score.atk} : ${score.def}（先赢 ${ROUND.winScore} 回合者胜）`;
      el('match-stats').textContent = `击杀 ${stats.kills} · 死亡 ${stats.deaths} · 爆头 ${stats.headshots} · 安放 ${stats.plants}`;
      m.hidden = false;
    },
    hideMatchEnd() { const m = el('match-end'); if (m) m.hidden = true; },
    update(S) {
      const p = S.player;
      const w = WEAPONS[p.weaponId];
      // Crosshair spread grows with bloom, movement and airtime.
      const gap = 4 + p.bloom * 14 + (p.moving ? 5 : 0) + (p.airborne ? 8 : 0);
      const ch = el('crosshair');
      if (ch) ch.style.setProperty('--gap', `${gap.toFixed(1)}px`);
      const mag = el('ammo-mag');
      if (mag) mag.textContent = p.reloadT > 0 ? '--' : String(p.mag);
      const res = el('ammo-reserve');
      if (res) res.textContent = `/ ${p.reserve}`;
      const wn = el('weapon-name');
      if (wn) wn.textContent = p.reloadT > 0 ? `${w.name} · 换弹中…` : w.name;
      const hp = el('hp-num');
      if (hp) hp.textContent = String(Math.max(0, Math.ceil(p.hp)));
      const hpf = el('hp-fill');
      if (hpf) hpf.style.width = `${Math.max(0, p.hp)}%`;
      const ar = el('armor-num');
      if (ar) ar.textContent = String(Math.floor(p.armor));
      const tm = el('timer');
      if (tm) {
        tm.textContent = S.phase === 'play' && S.bomb.state === 'planted'
          ? `💣 ${fmtTime(S.bomb.timer)}` : fmtTime(S.timer);
        tm.classList.toggle('urgent', S.timer <= 10 && S.phase === 'play');
      }
      const sa = el('score-atk');
      if (sa) sa.textContent = String(S.score.atk);
      const sd = el('score-def');
      if (sd) sd.textContent = String(S.score.def);
      const rn = el('round-num');
      if (rn) rn.textContent = `ROUND ${S.round}/${ROUND.maxRounds}`;
      const money = el('money');
      if (money) money.textContent = `$${S.money}`;
      const site = el('site-tag');
      if (site) site.textContent = S.bomb.state === 'planted' ? `💣 ${S.bomb.site} 点已安放` : `进攻 ${S.bomb.site} 点`;
      const nades = el('nades');
      if (nades) nades.textContent = `HE×${p.grenades.he} 烟雾×${p.grenades.smoke}`;
      const hint = el('hint');
      if (hint) {
        hint.textContent = S.phase === 'buy' ? '购买阶段：数字键或点击购买，Enter 开始回合'
          : S.phase === 'play' ? (S.bomb.state === 'carried' && S.bomb.carrier === 'player' ? `携带炸弹：到 ${S.bomb.site} 点按住 E 安放` : 'WASD 移动 · 鼠标瞄准 · R 换弹 · G 高爆弹 · H 烟雾弹 · P 暂停')
          : '';
      }
      const br = el('buy-round');
      if (br && S.phase === 'buy') br.textContent = `第 ${S.round} 回合购买 · 先赢 ${ROUND.winScore} 回合者胜`;
      if (mctx && S.now - lastMapDraw > 0.12) { lastMapDraw = S.now; drawMinimap(S); }
    },
  };
}
