import crypto from 'node:crypto';
export class character {
    constructor(name, characterClass, level, items, id = crypto.randomUUID()) {
        this.name = name;
        this.characterClass = characterClass;
        this.level = level;
        this.items = items;
        this.id = id;
    }
}
//# sourceMappingURL=characters.js.map