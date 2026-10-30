const display = document.getElementById("display");
const expressionEl = document.getElementById("expression");
const memoryEl = document.getElementById("memoryIndicator");
const roundEl = document.getElementById("decimalPlaces");

// ---------- State ----------
// current:   the number being typed / shown (string)
// previous:  left operand waiting for an operator (string or null)
// operator:  pending operator key: + - * / ^ (or null)
// overwrite: true when the next digit should start a fresh number
// error:     error message being shown (or null)
let current = "0";
let previous = null;
let operator = null;
let overwrite = false;
// operandPending: true only right after an operator key, until a value is entered or loaded
let operandPending = false;
let error = null;
// memory: the stored value for MC / MR / M+ / M- / MS (string, "0" = empty)
let memory = "0";
// decimalPlaces: null = Auto (12 significant digits), or 0-8 fixed decimals
let decimalPlaces = null;

const SYMBOLS = { "+": "+", "-": "−", "*": "×", "/": "÷", "^": "^" };
const MAX_INPUT_LENGTH = 15;

class CalcError extends Error { }

// ---------- Rendering ----------

function render() {
    display.value = error !== null ? error : current;
    display.classList.toggle("error", error !== null);
    expressionEl.textContent =
        operator && previous !== null ? previous + " " + SYMBOLS[operator] : "";

    // Show "M: value" only while memory holds something
    const hasMemory = Number(memory) !== 0;
    memoryEl.hidden = !hasMemory;
    memoryEl.textContent = hasMemory ? "M: " + memory : "";
}

function resetState() {
    current = "0";
    previous = null;
    operator = null;
    overwrite = false;
    operandPending = false;
    error = null;
}

function setError(message) {
    resetState();
    error = message;
    overwrite = true;
    render();
}

// If an error is showing, clear it and report true so the caller can decide
// whether to continue (digits do) or stop (everything else does).
function consumeError() {
    if (error === null) return false;
    resetState();
    render();
    return true;
}

// ---------- Number helpers ----------

// Rounds to a fixed number of decimals, halves away from zero (1.005 -> 1.01,
// -2.5 -> -3). Works on the decimal text of the number to dodge float errors.
function roundToPlaces(n, places) {
    if (Math.abs(n) >= 1e15) return n; // already beyond decimal precision
    const [mantissa, exp] = Math.abs(n).toExponential().split("e");
    const shifted = Math.round(Number(mantissa + "e" + (Number(exp) + places)));
    return Math.sign(n) * Number(shifted + "e" + -places);
}

// Formats a result: rejects NaN/Infinity, then rounds. Auto mode keeps 12
// significant digits (0.1 + 0.2 -> "0.3"); otherwise the chosen decimals apply.
function formatNumber(n) {
    if (Number.isNaN(n)) throw new CalcError("Invalid input");
    if (!Number.isFinite(n)) throw new CalcError("Result too large");
    if (decimalPlaces === null) return String(Number(n.toPrecision(12)));
    return String(Number(roundToPlaces(n, decimalPlaces).toPrecision(15)));
}

// "5." -> "5" so history and the expression line never show a dangling point
function clean(n) {
    return n.endsWith(".") ? n.slice(0, -1) : n;
}

// Wraps negatives in brackets for history text: 5 - (-3), (-5)²
function operand(n) {
    n = clean(n);
    return n.startsWith("-") ? "(" + n + ")" : n;
}

function compute(a, op, b) {
    a = Number(a);
    b = Number(b);
    if (op === "/" && b === 0) throw new CalcError("Cannot divide by 0");
    if (op === "^" && a === 0 && b < 0) throw new CalcError("Cannot divide by 0");

    let result;
    if (op === "+") result = a + b;
    else if (op === "-") result = a - b;
    else if (op === "*") result = a * b;
    else if (op === "/") result = a / b;
    else if (op === "^") result = Math.pow(a, b);
    return formatNumber(result);
}

// ---------- Input ----------

function inputDigit(digit) {
    consumeError(); // a digit after an error starts a fresh entry
    operandPending = false; // a value was entered/loaded, so the operator is no longer 'just pressed'
    if (overwrite) {
        current = digit;
        overwrite = false;
    } else if (current.replace(/[-.]/g, "").length < MAX_INPUT_LENGTH) {
        current = current === "0" ? digit : current + digit;
        if (current === "-0") current = "-" + digit;
    }
    render();
}

function inputDecimal() {
    consumeError();
    operandPending = false; // a value was entered/loaded, so the operator is no longer 'just pressed'
    if (overwrite) {
        current = "0.";
        overwrite = false;
    } else if (!current.includes(".")) {
        current += ".";
    }
    render();
}

// Kept for backwards compatibility with any old onclick="addValue(...)" calls.
function addValue(value) {
    if ("0123456789".includes(value)) inputDigit(value);
    else if (value === ".") inputDecimal();
    else if (value === "%") percent();
    else chooseOperator(value);
}

function clearDisplay() {
    resetState();
    render();
}

function backspace() {
    if (consumeError()) return;
    if (overwrite) return; // results can't be edited digit by digit
    current = current.slice(0, -1);
    if (current === "" || current === "-") current = "0";
    render();
}

// ---------- Operators & equals ----------

function chooseOperator(op) {
    if (consumeError()) return;
    try {
        if (operator && !operandPending) {
            // Chained calculation: 2 + 3 + ... evaluates 2 + 3 first
            const result = compute(previous, operator, current);
            addHistory(`${previous} ${SYMBOLS[operator]} ${operand(current)} = ${result}`, result);
            previous = result;
            current = result;
        } else if (!operator) {
            previous = clean(current);
        }
        operator = op;
        overwrite = true;
        operandPending = true;
        render();
    } catch (e) {
        handleCalcError(e);
    }
}

function calculate() {
    if (consumeError()) return;
    if (!operator) return;
    try {
        const result = compute(previous, operator, current);
        addHistory(`${previous} ${SYMBOLS[operator]} ${operand(current)} = ${result}`, result);
        current = result;
        previous = null;
        operator = null;
        overwrite = true;
        render();
    } catch (e) {
        handleCalcError(e);
    }
}

function handleCalcError(e) {
    setError(e instanceof CalcError ? e.message : "Invalid input");
}

// ---------- Scientific operations ----------

function percent() {
    if (consumeError()) return;
    operandPending = false; // a value was entered/loaded, so the operator is no longer 'just pressed'
    try {
        const value = Number(current);
        if (operator && previous !== null && (operator === "+" || operator === "-")) {
            // 200 + 10%  ->  200 + 20 (percentage of the first operand)
            current = formatNumber((Number(previous) * value) / 100);
        } else {
            const result = formatNumber(value / 100);
            if (!operator) addHistory(`${clean(current)}% = ${result}`, result);
            current = result;
        }
        overwrite = true;
        render();
    } catch (e) {
        handleCalcError(e);
    }
}

function toggleSign() {
    if (consumeError()) return;
    if (Number(current) === 0) return; // never produce "-0"
    operandPending = false; // a value was entered/loaded, so the operator is no longer 'just pressed'
    const before = current;
    current = current.startsWith("-") ? current.slice(1) : "-" + current;
    // Only log when applied to a finished value, so typing doesn't flood the log
    if (overwrite && !operator) addHistory(`-(${before}) = ${current}`, current);
    render();
}

function squareRoot() {
    if (consumeError()) return;
    operandPending = false; // a value was entered/loaded, so the operator is no longer 'just pressed'
    try {
        const value = Number(current);
        if (value < 0) throw new CalcError("Invalid input");
        const result = formatNumber(Math.sqrt(value));
        addHistory(`√${clean(current)} = ${result}`, result);
        current = result;
        overwrite = true;
        render();
    } catch (e) {
        handleCalcError(e);
    }
}

function square() {
    if (consumeError()) return;
    operandPending = false; // a value was entered/loaded, so the operator is no longer 'just pressed'
    try {
        const result = formatNumber(Number(current) ** 2);
        addHistory(`${operand(current)}² = ${result}`, result);
        current = result;
        overwrite = true;
        render();
    } catch (e) {
        handleCalcError(e);
    }
}

// ---------- History ----------

const HISTORY_KEY = "calculator-history";
const HISTORY_LIMIT = 50;
const historyList = document.getElementById("historyList");
const historyPanel = document.getElementById("historyPanel");
const historyToggle = document.getElementById("historyToggle");
let history = loadHistory();

function loadHistory() {
    try {
        const saved = JSON.parse(localStorage.getItem(HISTORY_KEY));
        if (!Array.isArray(saved)) return [];
        // Drop malformed entries so corrupted storage can never break the panel
        return saved
            .filter(function (e) {
                return e && typeof e.text === "string" && typeof e.result === "string" &&
                    e.result.trim() !== "" && Number.isFinite(Number(e.result));
            })
            .slice(0, HISTORY_LIMIT);
    } catch {
        return []; // storage unavailable or corrupted: start empty
    }
}

function saveHistory() {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
        // Storage unavailable: history still works for this session
    }
}

function addHistory(text, result) {
    history.unshift({ text, result }); // newest first
    if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
    saveHistory();
    renderHistory();
}

function renderHistory() {
    historyList.innerHTML = "";

    if (history.length === 0) {
        const empty = document.createElement("li");
        empty.className = "history-empty";
        empty.textContent = "No calculations yet";
        historyList.appendChild(empty);
        return;
    }

    history.forEach(function (entry) {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "history-item";
        button.textContent = entry.text;
        button.setAttribute("aria-label", "Use result " + entry.result + " from " + entry.text);
        button.addEventListener("click", function () {
            useHistoryResult(entry.result);
        });
        item.appendChild(button);
        historyList.appendChild(item);
    });
}

// Loads a past result into the display so the user can keep calculating.
function useHistoryResult(result) {
    consumeError();
    operandPending = false; // a value was entered/loaded, so the operator is no longer 'just pressed'
    current = result;
    overwrite = true;
    if (!operator) previous = null;
    render();
}

document.getElementById("clearHistory").addEventListener("click", function () {
    history = [];
    saveHistory();
    renderHistory();
});

// Collapsible behaviour (only visible on narrow screens)
historyToggle.addEventListener("click", function () {
    const open = historyPanel.classList.toggle("open");
    historyToggle.setAttribute("aria-expanded", String(open));
    historyToggle.textContent = open ? "Hide" : "Show";
});

// ---------- Memory (MC, MR, M+, M-, MS) ----------
// Memory keys are not calculations, so they are never written to history.
// Like other function keys, they are ignored while an error is showing
// (the first press only clears the error).

const MEMORY_KEY = "calculator-memory";

function loadMemory() {
    try {
        const saved = Number(localStorage.getItem(MEMORY_KEY));
        return Number.isFinite(saved) ? String(saved) : "0";
    } catch {
        return "0";
    }
}

function setMemory(value) {
    memory = value;
    try {
        localStorage.setItem(MEMORY_KEY, memory);
    } catch {
        // Storage unavailable: memory still works for this session
    }
}

function memoryClear() {
    if (consumeError()) return;
    setMemory("0");
    render();
}

function memoryRecall() {
    if (consumeError()) return;
    operandPending = false; // a value was entered/loaded, so the operator is no longer 'just pressed'
    current = memory;
    overwrite = true; // next digit starts a new number; a pending operator keeps working
    render();
}

function memoryStore() {
    if (consumeError()) return;
    try {
        setMemory(formatNumber(Number(current)));
        overwrite = true;
        render();
    } catch (e) {
        handleCalcError(e);
    }
}

// sign = 1 for M+, -1 for M-. If the result is invalid or too large,
// an error is shown and the old memory value is kept unchanged.
function memoryAdjust(sign) {
    if (consumeError()) return;
    try {
        setMemory(formatNumber(Number(memory) + sign * Number(current)));
        overwrite = true;
        render();
    } catch (e) {
        handleCalcError(e);
    }
}

function memoryAdd() { memoryAdjust(1); }
function memorySubtract() { memoryAdjust(-1); }

memory = loadMemory();

// ---------- Rounding setting ----------
// Lets the user cap long decimals (e.g. 2 / 3 -> 0.67). Applies to results,
// memory values and history; numbers typed by hand are left exactly as typed.

const DECIMALS_KEY = "calculator-decimals";
const ALLOWED_DECIMALS = [0, 1, 2, 3, 4, 6, 8];

function parseDecimals(value) {
    if (value === "auto" || value === null || String(value).trim() === "") return null;
    const n = Number(value);
    return ALLOWED_DECIMALS.includes(n) ? n : null; // anything invalid -> Auto
}

function setDecimalPlaces(value) {
    decimalPlaces = parseDecimals(value);
    roundEl.value = decimalPlaces === null ? "auto" : String(decimalPlaces);
    try {
        localStorage.setItem(DECIMALS_KEY, roundEl.value);
    } catch {
        // Storage unavailable: setting still applies for this session
    }
    // Re-round a finished result on screen (not a number being typed,
    // and not an operand while an operator is pending)
    if (error === null && overwrite && !operator) {
        try { current = formatNumber(Number(current)); } catch { }
    }
    render();
}

roundEl.addEventListener("change", function () {
    setDecimalPlaces(roundEl.value);
});

try {
    decimalPlaces = parseDecimals(localStorage.getItem(DECIMALS_KEY));
} catch {
    decimalPlaces = null;
}
roundEl.value = decimalPlaces === null ? "auto" : String(decimalPlaces);

// ---------- Theme toggle ----------

const themeToggle = document.getElementById("themeToggle");

themeToggle.addEventListener("click", function () {
    document.body.classList.toggle("dark-mode");

    if (document.body.classList.contains("dark-mode")) {
        themeToggle.textContent = "Switch>>Light Mode";
    } else {
        themeToggle.textContent = "Switch>>Dark Mode";
    }
});

// ---------- Keyboard support ----------

document.addEventListener("keydown", function (event) {
    // Let history entries and other buttons handle their own Enter/Space
    if (event.target.closest && event.target.closest(".history-panel, select")) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key;

    if ("0123456789".includes(key) && key.length === 1) {
        inputDigit(key);
    } else if (key === ".") {
        inputDecimal();
    } else if ("+-*/".includes(key) && key.length === 1) {
        chooseOperator(key);
    } else if (key === "^") {
        chooseOperator("^");
    } else if (key === "%") {
        percent();
    } else if (key === "Enter" || key === "=") {
        event.preventDefault();
        calculate();
    } else if (key === "Escape") {
        clearDisplay();
    } else if (key === "Backspace") {
        backspace();
    }
});

// ---------- Init ----------

renderHistory();
render();
