import "dotenv/config";
import express from "express";
import testRouter from "./routes/testCall";
const app = express();
const PORT = process.env.PORT;

app.use(express.json());
app.use("/test", testRouter);

app.listen(PORT, () => {
	console.log(`Server is running in Port ${PORT}`);
});
