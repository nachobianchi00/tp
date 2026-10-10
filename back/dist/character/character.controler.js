import { CharacterRepository } from './character.repository.js';
import { Character } from './character.entity.js';
const repository = new CharacterRepository();
function sanitizeCharacterInput(req, res, next) {
    if (req.body) {
        req.body.sanitizedInput = {
            name: req.body.name,
            characterClass: req.body.characterClass,
            level: req.body.level,
            hp: req.body.hp,
            mana: req.body.mana,
            attack: req.body.attack,
            items: req.body.items,
        };
    }
    Object.keys(req.body.sanitizedInput).forEach(key => {
        if (req.body.sanitizedInput[key] === undefined)
            delete req.body.sanitizedInput[key];
    });
    next();
}
async function findAll(req, res) {
    res.json({ data: await repository.findAll() });
}
async function findOne(req, res) {
    const id = req.params.id;
    const character = await repository.findOne({ id });
    if (!character) {
        res.status(404).json({ message: 'Character not found' });
        return;
    }
    res.json({ data: character });
}
async function add(req, res) {
    const input = req.body.sanitizedInput;
    const characterInput = new Character(input.name, input.characterClass, input.level, input.hp, input.mana, input.attack, input.items);
    const character = await repository.add(characterInput);
    return res.status(201).send({ message: 'Character created', data: character });
}
async function update(req, res) {
    const character = await repository.update(req.params.id, req.body.sanitizedInput);
    if (!character) {
        return res.status(404).send({ message: 'character not found' });
    }
    return res.status(200).send({ message: 'Character updated', data: character });
}
async function remove(req, res) {
    const id = req.params.id;
    const character = await repository.delete({ id });
    if (!character) {
        res.status(404).send({ message: 'character not found' });
    }
    else {
        res.status(200).send({ message: 'Character deleted successfully' });
    }
}
export { sanitizeCharacterInput, findAll, findOne, add, update, remove };
//# sourceMappingURL=character.controler.js.map