import express from "express";
import { characterRouter } from "./character/character.routes.js";
const app = express();
//middleware
app.use(express.json());
app.use('/api/characters', characterRouter);
app.use((_, res) => {
    return res.status(404).json({ message: 'resource not found' });
});
app.listen(3000, () => {
    console.log("server is running on port http://localhost:3000");
});
//# sourceMappingURL=index.js.map