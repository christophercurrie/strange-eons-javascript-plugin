// Virtual card decks, adapted from Strange Eons' cards.js.
import "./random.mjs";

export function CardDeck() {
    this.cards = [];
}

CardDeck.prototype.toString = function toString() {
    return this.cards.join(", ");
};

CardDeck.createFromArray = function createFromArray(arrayLikeObject) {
    const deck = new CardDeck();
    deck.cards = Array.from(arrayLikeObject);
    return deck;
};

CardDeck.prototype.shuffle = function shuffle() {
    this.cards.shuffle();
};

CardDeck.prototype.draw = function draw() {
    return this.cards.length === 0 ? null : this.cards.shift();
};

CardDeck.prototype.drawFirst = function drawFirst(matchFunction) {
    if (matchFunction === undefined) {
        Error.error("missing matchFunction");
    }
    const index = this.cards.findIndex((card) => matchFunction(card));
    return index < 0 ? null : this.pull(index);
};

CardDeck.prototype.discard = function discard(card, copies = 1) {
    if (card === undefined) {
        Error.error("missing card");
    }
    if (copies < 0) {
        Error.error("number of copies cannot be negative: " + copies);
    }
    for (let i = 0; i < copies; ++i) {
        this.cards.push(card.toString());
    }
};

CardDeck.prototype._index = function _index(index = 0) {
    const resolved = index >= 0 ? index : this.cards.length + index;
    if (resolved < 0 || resolved >= this.cards.length) {
        Error.error("bad index: " + index);
    }
    return resolved;
};

CardDeck.prototype.peek = function peek(index) {
    return this.cards[this._index(index)];
};

CardDeck.prototype.pull = function pull(index) {
    return this.cards.splice(this._index(index), 1)[0];
};

CardDeck.prototype.size = function size() {
    return this.cards.length;
};
