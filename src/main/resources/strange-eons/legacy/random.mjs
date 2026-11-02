// Pseudorandom number generation, adapted from Strange Eons' random.js.
import { Java } from "../internal/host.mjs";
import { Console, print, ResourceKit } from "./common.mjs";

const JavaRandom = Java.type("java.util.Random");

export function Random(seed) {
    this.generator = seed ? new JavaRandom(seed) : new JavaRandom();
}

Random.prototype.number = function number() {
    return this.generator.nextDouble();
};

Random.prototype.pick = function pick(m, n) {
    if (m > n) {
        [m, n] = [n, m];
    }
    return this.generator.nextInt(n - m + 1) + m;
};

Random.prototype.pickOtherThan = function pickOtherThan(excluded, m, n) {
    if (excluded == m && m == n) {
        throw new Error("no choice is possible");
    }
    if (m > n) {
        [m, n] = [n, m];
    }
    if (excluded < m || excluded > n) {
        return this.generator.nextInt(n - m + 1) + m;
    }
    const choice = this.generator.nextInt(n - m) + m;
    return choice >= excluded ? choice + 1 : choice;
};

Random.prototype.d6 = function d6() {
    return this.generator.nextInt(6) + 1;
};

Random.prototype.rollDice = function rollDice(n = 1, showDice = true) {
    if (n < 0) {
        throw new Error("cannot roll " + n + " dice");
    }
    const rolled = new Array(n);
    for (let i = 0; i < n; ++i) {
        rolled[i] = this.d6();
        if (showDice) {
            if (i > 0) {
                print(" ");
            }
            Console.printImage(ResourceKit.getIcon("d" + rolled[i] + ".png"));
        }
    }
    return rolled;
};

export const random = new Random();

function defineArrayMethod(name, value) {
    Object.defineProperty(Array.prototype, name, { value, writable: true, configurable: true, enumerable: false });
}

defineArrayMethod("pick", function pick() {
    if (this.length === 0) {
        throw new Error("no choice is possible");
    }
    return this[random.pick(0, this.length - 1)];
});

defineArrayMethod("pickOtherThan", function pickOtherThan(excluded) {
    if (!this.some((item) => item != excluded)) {
        throw new Error("no choice is possible");
    }
    let selected;
    do {
        selected = this.pick();
    } while (selected == excluded);
    return selected;
});

defineArrayMethod("shuffle", function shuffle() {
    for (let i = 0; i < this.length; ++i) {
        const j = random.generator.nextInt(this.length);
        [this[i], this[j]] = [this[j], this[i]];
    }
});
