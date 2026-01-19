import "dotenv/config";
import express from "express";
import { errorHandler } from "./middlewares/errorHandler";
import aiRouter from "./routes/ai.route";
import transactionRouter from "./routes/transaction.route";
import authRouter from "./routes/auth.route";
import receiptRouter from "./routes/receipt.route";
import clarificationRouter from "./routes/clarification.route";
const app = express();
const PORT = process.env.PORT;


app.use(express.json());

app.use("/ai", aiRouter);
app.use("/transaction", transactionRouter);
app.use("/auth", authRouter);
app.use("/receipt", receiptRouter);
app.use("/clarification", clarificationRouter);


app.use(errorHandler);
app.listen(PORT, () => {
	console.log(`Server is running in Port ${PORT}`);
});
