let display = document.getElementById("display");

function addValue(value) {
    if (display.value === "0") {
        display.value = value;
    } else {
        display.value += value;
    }
}

function clearDisplay() {
    display.value = "0";
}

function calculate() {
    try {
        display.value = Function(
            '"use strict"; return (' + display.value + ')'
        )();
    } catch {
        display.value = "Error";
    }
}

document.addEventListener("keydown", function (event) {
    const key = event.key;

    if ("0123456789+-*/.".includes(key)) {
        addValue(key);
    } else if (key === "Enter" || key === "=") {
        event.preventDefault();
        calculate();
    } else if (key === "Escape") {
        clearDisplay();
    } else if (key === "Backspace") {
        display.value = display.value.slice(0, -1) || "0";
    }
});