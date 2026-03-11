/* ============================================================
   Semester Survival — Game Logic
   ============================================================ */

(function () {
  'use strict';

  /* ---------- Constants ---------- */
  const TOTAL_WEEKS = 6;
  const BASE_INCOME = 500;
  const REDUCED_INCOME = 300;
  const SAVINGS_GOAL = 3000;
  const METER_MAX = 100;
  const METER_MIN = 0;
  const RED_THRESHOLD = 30;
  const YELLOW_THRESHOLD = 60;

  /* How much a well-funded category boosts its meter per $1 spent */
  const METER_GAIN_RATE = {
    food: 0.07,         // Food → Health
    social: 0.08,       // Social → Happiness
    transport: 0.07,    // Transport → Academic Success
    savings: 0.06,      // Savings → Financial Stability
    misc: 0.03,         // Misc → small Happiness
  };

  /* Decay when category receives < $50 */
  const LOW_SPEND_THRESHOLD = 50;
  const LOW_SPEND_PENALTY = 15;

  /* Passive decay applied to all meters each week */
  const PASSIVE_DECAY = 5;

  /* ---------- Events Pool ---------- */
  const EVENTS = [
    {
      title: 'Friend invites you to dinner',
      description: 'Your best friend wants to grab dinner at a nice restaurant downtown. It would cost about $30.',
      options: [
        { label: 'Go to dinner — $30', cost: 30, effects: { happiness: 12 } },
        { label: 'Decline', cost: 0, effects: { happiness: -5 } },
      ],
    },
    {
      title: 'Laptop breaks',
      description: 'Your laptop screen cracked and it will cost $300 to repair. You need it for classes.',
      options: [
        { label: 'Repair laptop — $300', cost: 300, effects: { academicSuccess: 10 } },
        { label: 'Delay repair', cost: 0, effects: { academicSuccess: -18 } },
      ],
    },
    {
      title: 'Club dues are due',
      description: 'The club you joined is collecting semester dues of $100. Staying keeps your social circle strong.',
      options: [
        { label: 'Pay dues — $100', cost: 100, effects: { happiness: 10 } },
        { label: 'Skip club this semester', cost: 0, effects: { happiness: -8 } },
      ],
    },
    {
      title: 'Concert with friends',
      description: 'Your friends scored tickets to a concert this weekend. A ticket costs $60.',
      options: [
        { label: 'Attend concert — $60', cost: 60, effects: { happiness: 14 } },
        { label: 'Stay home', cost: 0, effects: {} },
      ],
    },
    {
      title: 'Medical bill arrives',
      description: 'You received a medical bill for $120 from a recent clinic visit.',
      options: [
        { label: 'Pay bill — $120', cost: 120, effects: {} },
        { label: 'Delay payment', cost: 0, effects: { health: -15 } },
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
        health: 60,
        happiness: 60,
        academicSuccess: 60,
        financialStability: 60,
      },
      budget: { food: 0, social: 0, transport: 0, savings: 0, misc: 0 },
      usedEvents: [],
      phase: 'budget', // budget | event | summary
      currentEvent: null,
      eventChoice: null,
      weekSummary: [],
      reducedIncome: false,
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

    if (state.reducedIncome) {
      const notice = document.createElement('div');
      notice.className = 'income-notice';
      notice.textContent = `One or more life meters were in the red. Your income this week is reduced to $${REDUCED_INCOME}.`;
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

    // Food → Health
    if (state.budget.food >= LOW_SPEND_THRESHOLD) {
      const gain = Math.round(state.budget.food * METER_GAIN_RATE.food);
      m.health = clamp(m.health + gain);
      state.weekSummary.push({ text: `Food spending boosted Health +${gain}`, positive: true });
    } else {
      m.health = clamp(m.health - LOW_SPEND_PENALTY);
      state.weekSummary.push({ text: `Low food spending — Health -${LOW_SPEND_PENALTY}`, positive: false });
    }

    // Social → Happiness
    if (state.budget.social >= LOW_SPEND_THRESHOLD) {
      const gain = Math.round(state.budget.social * METER_GAIN_RATE.social);
      m.happiness = clamp(m.happiness + gain);
      state.weekSummary.push({ text: `Social spending boosted Happiness +${gain}`, positive: true });
    } else {
      m.happiness = clamp(m.happiness - LOW_SPEND_PENALTY);
      state.weekSummary.push({ text: `Low social spending — Happiness -${LOW_SPEND_PENALTY}`, positive: false });
    }

    // Transport → Academic Success
    if (state.budget.transport >= LOW_SPEND_THRESHOLD) {
      const gain = Math.round(state.budget.transport * METER_GAIN_RATE.transport);
      m.academicSuccess = clamp(m.academicSuccess + gain);
      state.weekSummary.push({ text: `Transport spending boosted Academics +${gain}`, positive: true });
    } else {
      m.academicSuccess = clamp(m.academicSuccess - LOW_SPEND_PENALTY);
      state.weekSummary.push({ text: `Low transport spending — Academics -${LOW_SPEND_PENALTY}`, positive: false });
    }

    // Savings → Financial Stability
    if (state.budget.savings >= LOW_SPEND_THRESHOLD) {
      const gain = Math.round(state.budget.savings * METER_GAIN_RATE.savings);
      m.financialStability = clamp(m.financialStability + gain);
      state.weekSummary.push({ text: `Savings boosted Financial Stability +${gain}`, positive: true });
    } else {
      m.financialStability = clamp(m.financialStability - LOW_SPEND_PENALTY);
      state.weekSummary.push({ text: `Low savings — Financial Stability -${LOW_SPEND_PENALTY}`, positive: false });
    }

    // Misc → small Happiness boost
    if (state.budget.misc >= LOW_SPEND_THRESHOLD) {
      const gain = Math.round(state.budget.misc * METER_GAIN_RATE.misc);
      m.happiness = clamp(m.happiness + gain);
      state.weekSummary.push({ text: `Misc spending boosted Happiness +${gain}`, positive: true });
    } else {
      const penalty = Math.round(LOW_SPEND_PENALTY * 0.5);
      m.happiness = clamp(m.happiness - penalty);
      state.weekSummary.push({ text: `Low misc spending — Happiness -${penalty}`, positive: false });
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

  /* ---------- Week Transition ---------- */
  function advanceWeek() {
    state.week++;

    // Determine income for next week
    const m = state.lifeMeters;
    const anyRed = m.health <= RED_THRESHOLD || m.happiness <= RED_THRESHOLD ||
      m.academicSuccess <= RED_THRESHOLD || m.financialStability <= RED_THRESHOLD;

    state.reducedIncome = anyRed;
    state.income = anyRed ? REDUCED_INCOME : BASE_INCOME;
    state.money = state.income;
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
