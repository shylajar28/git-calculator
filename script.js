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

const themeToggle = document.getElementById("themeToggle");

themeToggle.addEventListener("click", function () {
    document.body.classList.toggle("dark-mode");

    if (document.body.classList.contains("dark-mode")) {
        themeToggle.textContent = "Switch>>Light Mode";
    } else {
        themeToggle.textContent = "Switch>>Dark Mode";
    }
});