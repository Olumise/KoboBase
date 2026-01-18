import "dotenv/config";
import express from "express";
import { errorHandler } from "./middlewares/errorHandler";
import aiRouter from "./routes/ai.router";
const app = express();
const PORT = process.env.PORT;

app.use(express.json());

app.use('/ai',aiRouter)


app.use(errorHandler)
app.listen(PORT, () => {
	console.log(`Server is running in Port ${PORT}`);
});
