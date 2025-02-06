import express, { urlencoded } from "express";
import cors from "cors"
import cookieParser from "cookie-parser"

const app = express();


//middlewares
app.use(cors({
    origin:process.env.CORS_ORIGIN,
    credentials:true,
}))

//express middleware
app.use(express.json({limit:"16kb"}))
app.use(express.urlencoded({
    extended:true,
    limit:"16kb",
}));

app.use(express.static("public"));
app.use(cookieParser())

//routes 
import healthcheckRouter from "./routes/healthcheck.routes.js"

app.use("/api/v1/healthcheck",healthcheckRouter)


export {app}
