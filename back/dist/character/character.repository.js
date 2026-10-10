import { pool } from "../shared/db/conn.mysql.js";
export class CharacterRepository {
    async findAll() {
        const [characters] = await pool.query('select * from characters');
        for (const character of characters) {
            const [items] = await pool.query('select itemName from characterItems where characterId = ?', [character.id]);
            character.items = items.map((item) => item.itemName);
        }
        return characters;
    }
    async findOne(item) {
        const id = Number.parseInt(item.id);
        const [characters] = await pool.query('select * from characters where id = ?', [id]);
        if (characters.length === 0) {
            return undefined;
        }
        const character = characters[0];
        const [items] = await pool.query('select itemName from characterItems where characterId = ?', [character.id]);
        character.items = items.map((item) => item.itemName);
        return character;
    }
    async add(characterInput) {
        const { id, items, ...characterRow } = characterInput;
        const [result] = await pool.query('insert into characters set ?', [characterRow]);
        characterInput.id = result.insertId;
        for (const item of items) {
            await pool.query('insert into characterItems set ?', { characterId: characterInput.id, itemName: item });
        }
        return characterInput;
    }
    async update(id, characterInput) {
        const characterId = Number.parseInt(id);
        const { items, ...characterRow } = characterInput;
        await pool.query('update characters set ? where id = ?', [characterRow, characterId]);
        await pool.query('delete from characterItems where characterId = ?', [characterId]);
        if (items?.length > 0) {
            for (const itemName of items) {
                await pool.query('insert into characterItems set ?', { characterId, itemName });
            }
        }
        return await this.findOne({ id });
    }
    async delete(item) {
        try {
            const characterToDelete = await this.findOne(item);
            const characterId = Number.parseInt(item.id);
            await pool.query('delete from characterItems where characterId = ?', characterId);
            await pool.query('delete from characters where id = ?', characterId);
            return characterToDelete;
        }
        catch (error) {
            throw new Error('unable to delete character');
        }
    }
}
//# sourceMappingURL=character.repository.js.map