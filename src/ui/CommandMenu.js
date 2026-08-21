// ===========================================================================
//  THE COMMAND MENU
//
//  One command tree, two presentations, identical behaviour:
//    * PC: a radial menu on Tab, with number/letter shortcuts so a practised
//      commander never opens it at all.
//    * Touch: the same tree as a contextual sheet, sized for thumbs.
//
//  Commands that cannot be carried out right now are shown greyed WITH THE
//  REASON, rather than hidden — because knowing that the loader is outside the
//  tank is exactly the information a commander needs.
// ===========================================================================

import { COMMAND_TREE, CMD } from '../game/CommandSystem.js';

export class CommandMenu {
  constructor(root, bus, opts = {}) {
    this.root = root;
    this.bus = bus;
    this.touch = !!opts.touch;
    this.open = false;
    this.group = null;
    this.onIssue = opts.onIssue || (() => {});
    this.getContext = opts.getContext || (() => ({}));

    this.el = document.createElement('div');
    this.el.className = `cmd-menu ${this.touch ? 'cmd-touch' : 'cmd-radial'}`;
    this.el.style.display = 'none';
    root.appendChild(this.el);

    this.el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cmd],[data-group],[data-back]');
      if (!btn) return;
      e.stopPropagation();
      if (btn.dataset.back !== undefined) { this.group = null; this.render(); return; }
      if (btn.dataset.group) { this.group = btn.dataset.group; this.render(); return; }
      if (btn.dataset.cmd) this.pick(btn.dataset.cmd, btn.dataset.confirm === 'true');
    });
  }

  toggle() { this.open ? this.close() : this.show(); }

  show(group = null) {
    this.open = true;
    this.group = group;
    this.el.style.display = '';
    this.render();
    this.bus?.emit('ui:menu_open', {});
  }

  close() {
    this.open = false;
    this.group = null;
    this.el.style.display = 'none';
    this.pendingConfirm = null;
    this.bus?.emit('ui:menu_close', {});
  }

  /** Open straight into one group — this is what the number keys do. */
  openGroup(groupId) {
    const g = COMMAND_TREE.find((x) => x.id === groupId);
    if (!g) return;
    this.show(groupId);
  }

  /**
   * Work out whether an order can actually be given, and why not if it cannot.
   * This is the honest-refusal logic the whole game runs on.
   */
  availability(item, group, ctx) {
    const { tiger, crewManager, repair, recovery, abandonment } = ctx;
    if (!tiger) return { ok: false, reason: 'not in the tank' };

    if (group.role) {
      const man = crewManager?.get(group.role);
      if (!man) return { ok: false, reason: `no ${group.role}` };
      if (man.outsideTank) return { ok: false, reason: `${man.name.split(' ').pop()} is outside` };
    }

    // Ammunition natures the tank does not have.
    if (item.ammo) {
      const n = tiger.ammo[item.ammo] || 0;
      if (n <= 0) return { ok: false, reason: 'none left' };
      return { ok: true, badge: String(n) };
    }

    switch (item.id) {
      case CMD.FIRE:
        if (!tiger.loadedRound) return { ok: false, reason: tiger.reloading ? 'still loading' : 'breech empty' };
        if (tiger.components.main_gun?.destroyed) return { ok: false, reason: 'gun destroyed' };
        break;
      case CMD.FIRE_EXTINGUISHERS:
        if (!tiger.fire?.active) return { ok: false, reason: 'no fire' };
        if (tiger.fire.autoDischargesUsed >= (tiger.spec.FIRE_SYSTEM?.discharges ?? 5)
          && tiger.fire.handExtinguisherUses <= 0) {
          return { ok: false, reason: 'nothing left to fight it with' };
        }
        return { ok: true, badge: `${(tiger.spec.FIRE_SYSTEM.discharges - tiger.fire.autoDischargesUsed)}` };
      case CMD.ABANDON_TANK:
        if (abandonment?.active) return { ok: false, reason: 'already evacuating' };
        break;
      case CMD.ABORT_REPAIR:
        if (!repair?.active) return { ok: false, reason: 'no repair under way' };
        break;
      case CMD.REQUEST_RECOVERY: {
        if (recovery?.active) return { ok: false, reason: 'already requested' };
        if (tiger.components.radio?.destroyed) return { ok: false, reason: 'radio destroyed' };
        const check = recovery?.canBeTowed?.(tiger);
        if (check && !check.ok) return { ok: false, reason: check.problems[0] };
        break;
      }
      case CMD.GET_COVER:
      case CMD.HULL_DOWN:
        if (!tiger.assess().mobile) return { ok: false, reason: 'immobilised' };
        break;
      case CMD.FORWARD:
      case CMD.REVERSE:
      case CMD.FAST:
        if (!tiger.assess().mobile) return { ok: false, reason: 'immobilised' };
        if (tiger.fuelL <= 0) return { ok: false, reason: 'no fuel' };
        break;
      default: break;
    }

    if (group.id === 'radio' && tiger.components.radio?.destroyed) {
      return { ok: false, reason: 'radio destroyed' };
    }
    return { ok: true };
  }

  render() {
    const ctx = this.getContext();
    if (!this.group) {
      this.el.innerHTML = `<div class="cmd-title">COMMAND</div>` + COMMAND_TREE.map((g) => `
        <button class="cmd-item ${g.danger ? 'danger' : ''}" data-group="${g.id}">
          <span class="cmd-key">${g.key}</span>
          <span class="cmd-label">${g.label}</span>
          <span class="cmd-arrow">›</span>
        </button>`).join('');
      return;
    }

    const g = COMMAND_TREE.find((x) => x.id === this.group);
    if (!g) { this.group = null; this.render(); return; }

    const rows = g.items.map((item) => {
      const a = this.availability(item, g, ctx);
      const confirming = this.pendingConfirm === item.id;
      return `<button class="cmd-item ${item.danger ? 'danger' : ''} ${item.highlight ? 'highlight' : ''} ${a.ok ? '' : 'disabled'} ${confirming ? 'confirming' : ''}"
        data-cmd="${item.id}" data-confirm="${!!item.confirm}" ${a.ok ? '' : 'aria-disabled="true"'}>
        <span class="cmd-key">${item.key || ''}</span>
        <span class="cmd-label">${confirming ? 'CONFIRM — ' + item.label : item.label}</span>
        ${a.badge ? `<span class="cmd-badge">${a.badge}</span>` : ''}
        ${a.ok ? '' : `<span class="cmd-reason">${a.reason}</span>`}
      </button>`;
    }).join('');

    this.el.innerHTML = `
      <div class="cmd-title">${g.label}<button class="cmd-back" data-back>‹ back</button></div>
      ${rows}`;
  }

  pick(cmdId, needsConfirm) {
    const ctx = this.getContext();
    const group = COMMAND_TREE.find((g) => g.items.some((i) => i.id === cmdId));
    const item = group?.items.find((i) => i.id === cmdId);
    if (!item) return;

    const a = this.availability(item, group, ctx);
    if (!a.ok) {
      this.bus?.emit('command:refused', { cmdId, reason: a.reason });
      return;
    }

    // ABANDON TANK asks twice, because it should.
    if (needsConfirm && this.pendingConfirm !== cmdId) {
      this.pendingConfirm = cmdId;
      this.render();
      setTimeout(() => {
        if (this.pendingConfirm === cmdId) { this.pendingConfirm = null; this.render(); }
      }, 4000);
      return;
    }
    this.pendingConfirm = null;
    this.onIssue(cmdId, item);
    this.close();
  }

  /** Keyboard: a letter inside an open group, or a digit to jump to a group. */
  handleKey(code) {
    if (!this.open) return false;
    const key = code.startsWith('Key') ? code.slice(3).toLowerCase()
      : code.startsWith('Digit') ? code.slice(5) : null;
    if (!key) return false;

    if (!this.group) {
      const g = COMMAND_TREE.find((x) => x.key === key);
      if (g) { this.group = g.id; this.render(); return true; }
      return false;
    }
    const g = COMMAND_TREE.find((x) => x.id === this.group);
    const item = g?.items.find((i) => i.key === key);
    if (item) { this.pick(item.id, !!item.confirm); return true; }
    return false;
  }
}
