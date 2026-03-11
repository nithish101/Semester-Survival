/* ============================================================
   Semester Survival — Game Logic
   ============================================================ */

(function () {
  'use strict';

  /* ---------- Constants ---------- */
  const TOTAL_WEEKS = 6;
  const BASE_INCOME = 500;
  const MIN_INCOME = 200;
  const SAVINGS_GOAL = 1000;
  const METER_MAX = 100;
  const METER_MIN = 0;
  const RED_THRESHOLD = 30;
  const YELLOW_THRESHOLD = 60;
  const INCOME_PENALTY_THRESHOLD = 80; // meters below this reduce income
  const INCOME_PENALTY_PER_POINT = 2.5; // $ lost per point below threshold, per meter

  /* How much a well-funded category boosts its meter per $1 spent */
  const METER_GAIN_RATE = {
    food: 0.05,         // Food → Health  (ideal $150 → +7)
    social: 0.10,       // Social → Happiness (ideal $75 → +8)
    transport: 0.22,    // Transport → Academic Success (ideal $30 → +7)
    savings: 0.035,     // Savings → Financial Stability (ideal $220 → +8)
    misc: 0.12,         // Misc → small Happiness (ideal $25 → +3)
  };

  /* Per-category low-spend thresholds and penalty */
  const LOW_SPEND = {
    food: { threshold: 80, penalty: 15 },
    social: { threshold: 40, penalty: 12 },
    transport: { threshold: 15, penalty: 12 },
    savings: { threshold: 100, penalty: 12 },
    misc: { threshold: 10, penalty: 8 },
  };

  /* Passive decay applied to all meters each week */
  const PASSIVE_DECAY = 5;

  /* ---------- Events Pool ---------- */
  const EVENTS = [
    {
      title: 'Friend invites you to dinner',
      description: 'Your best friend wants to grab dinner at a nice restaurant downtown. It would cost about $20.',
      options: [
        { label: 'Go to dinner — $20', cost: 20, effects: { happiness: 15 } },
        { label: 'Decline', cost: 0, effects: { happiness: -10 } },
      ],
    },
    {
      title: 'Laptop breaks',
      description: 'Your laptop screen cracked and it will cost $100 to repair. You need it for classes.',
      options: [
        { label: 'Repair laptop — $100', cost: 100, effects: { academicSuccess: 15 } },
        { label: 'Delay repair', cost: 0, effects: { academicSuccess: -25 } },
      ],
    },
    {
      title: 'Club dues are due',
      description: 'The club you joined is collecting semester dues of $50. Staying keeps your social circle strong.',
      options: [
        { label: 'Pay dues — $50', cost: 50, effects: { happiness: 12 } },
        { label: 'Skip club this semester', cost: 0, effects: { happiness: -15 } },
      ],
    },
    {
      title: 'Concert with friends',
      description: 'Your friends scored tickets to a concert this weekend. A ticket costs $30.',
      options: [
        { label: 'Attend concert — $30', cost: 30, effects: { happiness: 15 } },
        { label: 'Stay home', cost: 0, effects: { happiness: -8 } },
      ],
    },
    {
      title: 'Medical bill arrives',
      description: 'You received a medical bill for $60 from a recent clinic visit.',
      options: [
        { label: 'Pay bill — $60', cost: 60, effects: { health: 10 } },
        { label: 'Delay payment', cost: 0, effects: { health: -20 } },
      ],
    },
  ];

  /* ---------- Game State ---------- */
  let state;

  function initialState() {
    return {
      week: 1,
      money: BASE_INCOME,
      savings: 0,
      income: BASE_INCOME,
      lifeMeters: {
        health: 80,
        happiness: 80,
        academicSuccess: 80,
        financialStability: 80,
      },
      budget: { food: 0, social: 0, transport: 0, savings: 0, misc: 0 },
      usedEvents: [],
      phase: 'budget', // budget | event | summary
      currentEvent: null,
      eventChoice: null,
      weekSummary: [],
      incomeDetails: null, // { base, penalty, final }
    };
  }

  /* ---------- DOM References ---------- */
  const $ = (id) => document.getElementById(id);
  const dom = {};

  function cacheDom() {
    dom.startScreen = $('start-screen');
    dom.endScreen = $('end-screen');
    dom.gameScreen = $('game-screen');
    dom.btnStart = $('btn-start');
    dom.btnRestart = $('btn-restart');

    dom.weekDisplay = $('week-display');
    dom.cashDisplay = $('cash-display');
    dom.savingsDisplay = $('savings-display');

    dom.meterHealth = $('meter-health');
    dom.meterHappiness = $('meter-happiness');
    dom.meterAcademic = $('meter-academic');
    dom.meterFinancial = $('meter-financial');
    dom.meterHealthVal = $('meter-health-val');
    dom.meterHappinessVal = $('meter-happiness-val');
    dom.meterAcademicVal = $('meter-academic-val');
    dom.meterFinancialVal = $('meter-financial-val');

    dom.budgetSection = $('budget-section');
    dom.budgetRemaining = $('budget-remaining');
    dom.btnSubmitBudget = $('btn-submit-budget');

    dom.sliderFood = $('slider-food');
    dom.sliderSocial = $('slider-social');
    dom.sliderTransport = $('slider-transport');
    dom.sliderSavings = $('slider-savings');
    dom.sliderMisc = $('slider-misc');
    dom.valFood = $('val-food');
    dom.valSocial = $('val-social');
    dom.valTransport = $('val-transport');
    dom.valSavings = $('val-savings');
    dom.valMisc = $('val-misc');

    dom.eventSection = $('event-section');
    dom.eventDescription = $('event-description');
    dom.eventButtons = $('event-buttons');

    dom.summarySection = $('summary-section');
    dom.summaryContent = $('summary-content');
    dom.btnNextWeek = $('btn-next-week');

    dom.endTitle = $('end-title');
    dom.endMessage = $('end-message');
    dom.endStats = $('end-stats');
    dom.endIcon = $('end-icon');
  }

  /* ---------- Slider Helpers ---------- */
  const sliderKeys = ['food', 'social', 'transport', 'savings', 'misc'];

  function getSlider(key) {
    return dom['slider' + key.charAt(0).toUpperCase() + key.slice(1)];
  }
  function getValSpan(key) {
    return dom['val' + key.charAt(0).toUpperCase() + key.slice(1)];
  }

  function totalAllocated() {
    return sliderKeys.reduce((sum, k) => sum + parseInt(getSlider(k).value, 10), 0);
  }

  function updateBudgetUI() {
    const total = totalAllocated();
    const remaining = state.money - total;

    dom.budgetRemaining.innerHTML = `Remaining: <strong>$${remaining}</strong>`;
    dom.budgetRemaining.classList.toggle('over', remaining < 0);

    sliderKeys.forEach((k) => {
      getValSpan(k).textContent = `$${parseInt(getSlider(k).value, 10)}`;
    });

    // Enable submit only when total <= money and total > 0
    dom.btnSubmitBudget.disabled = remaining < 0 || total === 0;
  }

  function resetSliders() {
    sliderKeys.forEach((k) => {
      const slider = getSlider(k);
      slider.max = state.money;
      slider.value = 0;
    });
    updateBudgetUI();
  }

  /* ---------- Render ---------- */
  function renderHeader() {
    dom.weekDisplay.textContent = `${state.week} / ${TOTAL_WEEKS}`;
    dom.cashDisplay.textContent = `$${state.money}`;
    dom.savingsDisplay.textContent = `$${state.savings}`;
  }

  function meterClass(val) {
    if (val <= RED_THRESHOLD) return 'red';
    if (val <= YELLOW_THRESHOLD) return 'yellow';
    return '';
  }

  function renderMeters() {
    const map = [
      ['meterHealth', 'meterHealthVal', 'health'],
      ['meterHappiness', 'meterHappinessVal', 'happiness'],
      ['meterAcademic', 'meterAcademicVal', 'academicSuccess'],
      ['meterFinancial', 'meterFinancialVal', 'financialStability'],
    ];
    map.forEach(([bar, val, key]) => {
      const v = Math.round(state.lifeMeters[key]);
      dom[bar].style.width = v + '%';
      dom[bar].className = 'meter-fill ' + meterClass(v);
      dom[val].textContent = v;
    });
  }

  function render() {
    renderHeader();
    renderMeters();
  }

  /* ---------- Phase: Budget ---------- */
  function showBudgetPhase() {
    state.phase = 'budget';
    dom.budgetSection.classList.remove('hidden');
    dom.eventSection.classList.add('hidden');
    dom.summarySection.classList.add('hidden');

    // Show income notice if reduced
    const existingNotice = document.querySelector('.income-notice');
    if (existingNotice) existingNotice.remove();

    if (state.incomeDetails && state.incomeDetails.penalty > 0) {
      const d = state.incomeDetails;
      const notice = document.createElement('div');
      notice.className = 'income-notice';
      notice.textContent = `Life meter penalty: -$${d.penalty} (meters below ${INCOME_PENALTY_THRESHOLD}). Income this week: $${d.final}.`;
      dom.budgetSection.insertBefore(notice, dom.budgetSection.firstChild.nextSibling);
    }

    resetSliders();
    render();
  }

  function submitBudget() {
    const total = totalAllocated();
    if (total > state.money) return;

    sliderKeys.forEach((k) => {
      state.budget[k] = parseInt(getSlider(k).value, 10);
    });

    // Deduct from cash (savings go to savings pool)
    const spent = total - state.budget.savings;
    state.money -= total;
    state.savings += state.budget.savings;

    // Apply passive decay to all meters first, then budget effects
    state.weekSummary = [];
    applyPassiveDecay();
    applyBudgetToMeters();

    render();
    showEventPhase();
  }

  function applyBudgetToMeters() {
    const m = state.lifeMeters;

    const categories = [
      { key: 'food', meter: 'health', label: 'Food', meterLabel: 'Health' },
      { key: 'social', meter: 'happiness', label: 'Social', meterLabel: 'Happiness' },
      { key: 'transport', meter: 'academicSuccess', label: 'Transport', meterLabel: 'Academics' },
      { key: 'savings', meter: 'financialStability', label: 'Savings', meterLabel: 'Financial Stability' },
    ];

    categories.forEach(({ key, meter, label, meterLabel: ml }) => {
      const spent = state.budget[key];
      const rule = LOW_SPEND[key];
      if (spent >= rule.threshold) {
        const gain = Math.round(spent * METER_GAIN_RATE[key]);
        m[meter] = clamp(m[meter] + gain);
        state.weekSummary.push({ text: `${label} spending boosted ${ml} +${gain}`, positive: true });
      } else {
        m[meter] = clamp(m[meter] - rule.penalty);
        state.weekSummary.push({ text: `Low ${label.toLowerCase()} spending — ${ml} -${rule.penalty}`, positive: false });
      }
    });

    // Misc → small Happiness boost
    const miscSpent = state.budget.misc;
    const miscRule = LOW_SPEND.misc;
    if (miscSpent >= miscRule.threshold) {
      const gain = Math.round(miscSpent * METER_GAIN_RATE.misc);
      m.happiness = clamp(m.happiness + gain);
      state.weekSummary.push({ text: `Misc spending boosted Happiness +${gain}`, positive: true });
    } else {
      m.happiness = clamp(m.happiness - miscRule.penalty);
      state.weekSummary.push({ text: `Low misc spending — Happiness -${miscRule.penalty}`, positive: false });
    }
  }

  /* ---------- Passive Decay ---------- */
  function applyPassiveDecay() {
    const m = state.lifeMeters;
    m.health = clamp(m.health - PASSIVE_DECAY);
    m.happiness = clamp(m.happiness - PASSIVE_DECAY);
    m.academicSuccess = clamp(m.academicSuccess - PASSIVE_DECAY);
    m.financialStability = clamp(m.financialStability - PASSIVE_DECAY);
    state.weekSummary.push({ text: `Weekly life pressure — all meters -${PASSIVE_DECAY}`, positive: false });
  }

  /* ---------- Phase: Event ---------- */
  function pickEvent() {
    const available = EVENTS.filter((_, i) => !state.usedEvents.includes(i));
    if (available.length === 0) {
      // All used — reset pool (shouldn't happen in 6-week game with 5 events, but safety)
      state.usedEvents = [];
      return pickEvent();
    }
    const idx = EVENTS.indexOf(available[Math.floor(Math.random() * available.length)]);
    state.usedEvents.push(idx);
    return EVENTS[idx];
  }

  function showEventPhase() {
    state.phase = 'event';
    dom.budgetSection.classList.add('hidden');
    dom.eventSection.classList.remove('hidden');
    dom.summarySection.classList.add('hidden');

    const evt = pickEvent();
    state.currentEvent = evt;

    dom.eventDescription.innerHTML = `<strong>${evt.title}</strong><br/>${evt.description}`;
    dom.eventButtons.innerHTML = '';

    evt.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'btn-secondary';
      btn.textContent = opt.label;
      btn.addEventListener('click', () => handleEventChoice(i));
      dom.eventButtons.appendChild(btn);
    });
  }

  function handleEventChoice(optionIndex) {
    const opt = state.currentEvent.options[optionIndex];
    state.eventChoice = opt;

    // Deduct cost from savings first, then from money
    let cost = opt.cost;
    if (cost > 0) {
      // Deduct from remaining money first
      if (state.money >= cost) {
        state.money -= cost;
      } else {
        // Take from savings if not enough cash
        const deficit = cost - state.money;
        state.money = 0;
        state.savings = Math.max(0, state.savings - deficit);
      }
      state.weekSummary.push({ text: `Event cost: -$${cost}`, positive: false });
    }

    // Apply meter effects
    const m = state.lifeMeters;
    for (const [key, val] of Object.entries(opt.effects)) {
      m[key] = clamp(m[key] + val);
      const label = meterLabel(key);
      if (val > 0) {
        state.weekSummary.push({ text: `${label} +${val} (event)`, positive: true });
      } else {
        state.weekSummary.push({ text: `${label} ${val} (event)`, positive: false });
      }
    }

    render();
    showSummaryPhase();
  }

  /* ---------- Phase: Summary ---------- */
  function showSummaryPhase() {
    state.phase = 'summary';
    dom.eventSection.classList.add('hidden');
    dom.summarySection.classList.remove('hidden');

    let html = '';
    state.weekSummary.forEach((item) => {
      const cls = item.positive ? 'positive' : 'negative';
      html += `<p class="${cls}">${item.text}</p>`;
    });
    dom.summaryContent.innerHTML = html;

    // Check for game-ending conditions
    if (checkAllMetersCritical()) {
      dom.btnNextWeek.textContent = 'See Results';
      dom.btnNextWeek.onclick = () => endGame(false, 'All of your life meters dropped critically low. You couldn\'t keep up with the semester demands.');
      return;
    }

    if (state.week >= TOTAL_WEEKS) {
      dom.btnNextWeek.textContent = 'See Results';
      dom.btnNextWeek.onclick = () => {
        if (state.savings >= SAVINGS_GOAL) {
          endGame(true, `You survived the semester and saved $${state.savings} for grad school!`);
        } else {
          endGame(false, `You survived the semester but only saved $${state.savings}. You needed $${SAVINGS_GOAL} for grad school.`);
        }
      };
      return;
    }

    dom.btnNextWeek.textContent = 'Next Week';
    dom.btnNextWeek.onclick = advanceWeek;
  }

  /* ---------- Income Calculation ---------- */
  function calculateIncome() {
    const m = state.lifeMeters;
    const meters = [m.health, m.happiness, m.academicSuccess, m.financialStability];
    let totalPenalty = 0;
    meters.forEach((val) => {
      if (val < INCOME_PENALTY_THRESHOLD) {
        totalPenalty += Math.round((INCOME_PENALTY_THRESHOLD - val) * INCOME_PENALTY_PER_POINT);
      }
    });
    const finalIncome = Math.max(MIN_INCOME, BASE_INCOME - totalPenalty);
    return { base: BASE_INCOME, penalty: totalPenalty, final: finalIncome };
  }

  /* ---------- Week Transition ---------- */
  function advanceWeek() {
    state.week++;

    // Determine income for next week based on meter scores
    const details = calculateIncome();
    state.incomeDetails = details;
    state.income = details.final;
    state.money = details.final;
    state.weekSummary = [];

    showBudgetPhase();
  }

  /* ---------- End Game ---------- */
  function endGame(won, message) {
    dom.gameScreen.classList.add('hidden');
    dom.endScreen.classList.remove('hidden');

    dom.endIcon.textContent = won ? '★' : '✕';
    dom.endIcon.style.color = won ? '#22c55e' : '#d7263d';
    dom.endTitle.textContent = won ? 'Semester Complete!' : 'Semester Failed';
    dom.endMessage.textContent = message;

    const m = state.lifeMeters;
    dom.endStats.innerHTML = `
      <p><strong>Final Savings:</strong> $${state.savings} / $${SAVINGS_GOAL}</p>
      <p><strong>Health:</strong> ${Math.round(m.health)}</p>
      <p><strong>Happiness:</strong> ${Math.round(m.happiness)}</p>
      <p><strong>Academic Success:</strong> ${Math.round(m.academicSuccess)}</p>
      <p><strong>Financial Stability:</strong> ${Math.round(m.financialStability)}</p>
    `;
  }

  /* ---------- Helpers ---------- */
  function clamp(val) {
    return Math.max(METER_MIN, Math.min(METER_MAX, val));
  }

  function meterLabel(key) {
    const labels = {
      health: 'Health',
      happiness: 'Happiness',
      academicSuccess: 'Academic Success',
      financialStability: 'Financial Stability',
    };
    return labels[key] || key;
  }

  function checkAllMetersCritical() {
    const m = state.lifeMeters;
    return m.health <= RED_THRESHOLD && m.happiness <= RED_THRESHOLD &&
      m.academicSuccess <= RED_THRESHOLD && m.financialStability <= RED_THRESHOLD;
  }

  /* ---------- Init ---------- */
  function startGame() {
    state = initialState();
    dom.startScreen.classList.add('hidden');
    dom.endScreen.classList.add('hidden');
    dom.gameScreen.classList.remove('hidden');
    showBudgetPhase();
  }

  function init() {
    cacheDom();

    // Slider input listeners
    sliderKeys.forEach((k) => {
      getSlider(k).addEventListener('input', updateBudgetUI);
    });

    dom.btnSubmitBudget.addEventListener('click', submitBudget);
    dom.btnStart.addEventListener('click', startGame);
    dom.btnRestart.addEventListener('click', startGame);

    // Help modal
    const helpModal = document.getElementById('help-modal');
    const btnHelp = document.getElementById('btn-help');
    const btnCloseHelp = document.getElementById('btn-close-help');

    btnHelp.addEventListener('click', () => helpModal.classList.remove('hidden'));
    btnCloseHelp.addEventListener('click', () => helpModal.classList.add('hidden'));
    helpModal.addEventListener('click', (e) => {
      if (e.target === helpModal) helpModal.classList.add('hidden');
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
